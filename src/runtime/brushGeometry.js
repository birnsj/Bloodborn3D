import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { buildWallOpeningSolids, validateOpenings } from './wallOpenings.js';
import {
  applyWorldSubtraction,
  BRUSH_FACE_KEYS,
  exposedSolidFaceRects,
  formatSubtractComplexityMessage,
  getMaxSubtractSolids,
  isSubtractBrush,
  solidToAabb,
} from './brushBoolean.js';
import {
  TEXTURE_TILE_EDITOR_UNITS,
  applyFaceUvsToGeometry,
  composeActorUv,
  isIdentityUv,
  normalizeActorUv,
} from './uvMapping.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';
import {
  semanticFaceKeyFromSurfaceId,
  worldSolidPatchSurfaceId,
} from './surfaces.js';

/**
 * Texture resolution contract: one 2048² map covers 1 m (100 editor units).
 * Target ≈ 2048 px/m. Do not stretch the tile to wall-module size — that tanks density.
 * Brick / ashlar module size belongs in the texture pixels (or material uvScale), not here.
 *
 * Actor UV (scale → rotation → offset) is Layer 1 of the Phase 2E.0 composition contract;
 * optional faceUVs[surfaceId] apply after actor UV (Phase 2E.2);
 * material uvScale/offset/rotation is Layer 2 (see uvMapping.js / materialFactory.js).
 */
export { TEXTURE_TILE_EDITOR_UNITS };
export const TEXTURE_TILE_METERS = 1;
export const TARGET_TEXEL_DENSITY = 2048 / TEXTURE_TILE_METERS;

/**
 * BoxGeometry with world-aligned UVs so brush resize does not stretch textures.
 * UV units tile every TEXTURE_TILE_EDITOR_UNITS (100 = 1 m) by default, then apply brush UV transform.
 *
 * Face order matches Three.js BoxGeometry materials: +x -x +y -y +z -z
 */
export function createBrushBoxGeometry(sizeEditor, uv = {}, faceUVs = null) {
  const sx = Math.max(1, sizeEditor.x);
  const sy = Math.max(1, sizeEditor.y);
  const sz = Math.max(1, sizeEditor.z);
  const geom = new THREE.BoxGeometry(toMeters(sx), toMeters(sy), toMeters(sz));
  applyBrushUvs(geom, sx, sy, sz, uv);
  applyFaceUvsToGeometry(geom, faceUVs, { scheme: 'box' });
  return geom;
}

/**
 * Same UV rules as createBrushBoxGeometry, for an arbitrary solid piece.
 * Optional uvBias:
 *   - { origin:{x,y,z} } brush-local min corner → per-face world-aligned tiling (cut pieces)
 *   - { u, v } legacy uniform bias in scaled-density space
 */
export function createBrushSolidGeometry(sizeEditor, uv = {}, uvBias = null, faceUVs = null) {
  const sx = Math.max(1e-4, sizeEditor.x);
  const sy = Math.max(1e-4, sizeEditor.y);
  const sz = Math.max(1e-4, sizeEditor.z);
  const geom = new THREE.BoxGeometry(toMeters(sx), toMeters(sy), toMeters(sz));
  applyBrushUvs(geom, sx, sy, sz, uv, uvBias);
  applyFaceUvsToGeometry(geom, faceUVs, { scheme: 'box' });
  return geom;
}

/**
 * World Solid only: emit quads for empty-adjacent face patches (clipped against
 * sibling solids + outer hull). Returns null when nothing is exposed.
 * Local space matches createBrushSolidGeometry (solid center at origin).
 */
export function createExposedWorldSolidGeometry(
  solid,
  solids,
  brushSize,
  uv = {},
  uvBias = null,
  faceUVs = null,
) {
  const exposed = exposedSolidFaceRects(solid, solids, brushSize);
  const hasAny = BRUSH_FACE_KEYS.some((k) => exposed[k]?.length > 0);
  if (!hasAny) return null;

  const cx = solid.center.x;
  const cy = solid.center.y;
  const cz = solid.center.z;
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  const groups = [];

  const scaleX = Number(uv.scale?.x) || 1;
  const scaleY = Number(uv.scale?.y) || 1;
  const tile = TEXTURE_TILE_EDITOR_UNITS;
  const ox = Number(uvBias?.origin?.x);
  const oy = Number(uvBias?.origin?.y);
  const oz = Number(uvBias?.origin?.z);
  const hasOrigin = Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz);

  const pushQuad = (faceKey, rect, nx, ny, nz) => {
    const box = solidToAabb(solid);
    let cornersBrush; // brush-local XYZ
    if (faceKey === 'px' || faceKey === 'nx') {
      const x = faceKey === 'px' ? box.max.x : box.min.x;
      cornersBrush = [
        { x, y: rect.u0, z: rect.v0 },
        { x, y: rect.u1, z: rect.v0 },
        { x, y: rect.u1, z: rect.v1 },
        { x, y: rect.u0, z: rect.v1 },
      ];
    } else if (faceKey === 'py' || faceKey === 'ny') {
      const y = faceKey === 'py' ? box.max.y : box.min.y;
      cornersBrush = [
        { x: rect.u0, y, z: rect.v0 },
        { x: rect.u1, y, z: rect.v0 },
        { x: rect.u1, y, z: rect.v1 },
        { x: rect.u0, y, z: rect.v1 },
      ];
    } else {
      const z = faceKey === 'pz' ? box.max.z : box.min.z;
      cornersBrush = [
        { x: rect.u0, y: rect.v0, z },
        { x: rect.u1, y: rect.v0, z },
        { x: rect.u1, y: rect.v1, z },
        { x: rect.u0, y: rect.v1, z },
      ];
    }

    // Winding must match the outward normal (into carved empty space).
    // +X/+Z corners [0,1,2,3] already yield +axis; +Y needs the opposite order.
    const flip = faceKey === 'nx' || faceKey === 'py' || faceKey === 'nz';
    const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];

    const base = positions.length / 3;
    for (const oi of order) {
      const p = cornersBrush[oi];
      positions.push(
        toMeters(p.x - cx),
        toMeters(p.y - cy),
        toMeters(p.z - cz),
      );
      normals.push(nx, ny, nz);

      // Continuous brush-local UVs (same axes as applyBrushUvs with origin bias).
      let u;
      let v;
      if (faceKey === 'px' || faceKey === 'nx') {
        u = ((hasOrigin ? p.z : p.z - box.min.z) / tile) * scaleX;
        v = ((hasOrigin ? p.y : p.y - box.min.y) / tile) * scaleY;
      } else if (faceKey === 'py' || faceKey === 'ny') {
        u = ((hasOrigin ? p.x : p.x - box.min.x) / tile) * scaleX;
        v = ((hasOrigin ? p.z : p.z - box.min.z) / tile) * scaleY;
      } else {
        u = ((hasOrigin ? p.x : p.x - box.min.x) / tile) * scaleX;
        v = ((hasOrigin ? p.y : p.y - box.min.y) / tile) * scaleY;
      }
      const [ru, rv] = composeActorUv(u, v, {
        scale: { x: 1, y: 1 },
        offset: uv.offset,
        rotation: uv.rotation,
      });
      uvs.push(ru, rv);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // One group + surface id per exposed quad so selection / materials stay on the
  // clicked wall panel (not every World Solid face that shares an axis).
  const surfaceIds = [];
  const patchCountByFace = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
  for (let fi = 0; fi < FACE_KEYS.length; fi += 1) {
    const faceKey = FACE_KEYS[fi];
    const n = ({
      px: [1, 0, 0], nx: [-1, 0, 0],
      py: [0, 1, 0], ny: [0, -1, 0],
      pz: [0, 0, 1], nz: [0, 0, -1],
    })[faceKey];
    for (const rect of exposed[faceKey] || []) {
      const start = index.length;
      pushQuad(faceKey, rect, n[0], n[1], n[2]);
      const count = index.length - start;
      const patchIndex = patchCountByFace[faceKey];
      patchCountByFace[faceKey] = patchIndex + 1;
      const materialIndex = surfaceIds.length;
      surfaceIds.push(worldSolidPatchSurfaceId(faceKey, patchIndex));
      groups.push({ start, count, materialIndex });
    }
  }

  if (!positions.length) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(index);
  for (const g of groups) {
    geom.addGroup(g.start, g.count, g.materialIndex);
  }
  geom.userData.surfaceIds = surfaceIds;
  geom.userData.surfaceScheme = 'grouped';
  applyFaceUvsToGeometry(geom, faceUVs, { scheme: 'grouped', surfaceIds });
  return geom;
}

/**
 * Phase 2G rendering experiment: ALL exposed World Solid patches in one geometry.
 *
 * Built from createExposedWorldSolidGeometry per solid (so clipping, winding and
 * UVs are identical to the per-solid path) and merged in brush-local space.
 * Triangles are grouped one material slot per exposed panel (`pz#0`, `nx#3`, …)
 * so selection and face materials stay on the clicked wall, not every panel that
 * shares an axis. Legacy face keys in faceMaterials / faceUVs still apply to all
 * patches of that face. Collision still uses the unmerged solids.
 *
 * Returns null when nothing is exposed. Origin is the brush center (mesh sits at 0).
 */
export function createBatchedWorldSolidGeometry(solids, brushSize, uv = {}, faceUVs = null) {
  const positions = [];
  const normals = [];
  const uvs = [];
  /** @type {number[][]} */
  const patchIndices = [];
  /** @type {string[]} */
  const surfaceIds = [];
  const patchCountByFace = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
  let vertexCount = 0;

  const resolveFaceUv = (surfaceId) => {
    if (!faceUVs) return null;
    const direct = faceUVs[surfaceId];
    if (direct && !isIdentityUv(direct)) return normalizeActorUv(direct);
    const base = semanticFaceKeyFromSurfaceId(surfaceId);
    const legacy = base && faceUVs[base];
    return legacy && !isIdentityUv(legacy) ? normalizeActorUv(legacy) : null;
  };

  for (const solid of solids || []) {
    const bias = {
      origin: {
        x: solid.center.x - solid.size.x * 0.5,
        y: solid.center.y - solid.size.y * 0.5,
        z: solid.center.z - solid.size.z * 0.5,
      },
    };
    // Per-quad surface ids come from createExposedWorldSolidGeometry; re-index them
    // globally so the batched mesh keeps one material slot per wall panel.
    const part = createExposedWorldSolidGeometry(solid, solids, brushSize, uv, bias, null);
    if (!part) continue;

    const pos = part.attributes.position;
    const nor = part.attributes.normal;
    const uvAttr = part.attributes.uv;
    const index = part.index;
    const partSurfaceIds = part.userData.surfaceIds || [];
    const cx = toMeters(solid.center.x);
    const cy = toMeters(solid.center.y);
    const cz = toMeters(solid.center.z);

    for (const g of part.groups) {
      const partSid = partSurfaceIds[g.materialIndex];
      const faceKey = semanticFaceKeyFromSurfaceId(partSid) || FACE_KEYS[0];
      const patchIndex = patchCountByFace[faceKey];
      patchCountByFace[faceKey] = patchIndex + 1;
      const surfaceId = worldSolidPatchSurfaceId(faceKey, patchIndex);
      const override = resolveFaceUv(surfaceId);
      const target = [];
      const remap = new Map();
      for (let i = g.start; i < g.start + g.count; i += 1) {
        const old = index.getX(i);
        let next = remap.get(old);
        if (next === undefined) {
          next = vertexCount;
          vertexCount += 1;
          remap.set(old, next);
          positions.push(pos.getX(old) + cx, pos.getY(old) + cy, pos.getZ(old) + cz);
          normals.push(nor.getX(old), nor.getY(old), nor.getZ(old));
          if (override) {
            const [u, v] = composeActorUv(uvAttr.getX(old), uvAttr.getY(old), override);
            uvs.push(u, v);
          } else {
            uvs.push(uvAttr.getX(old), uvAttr.getY(old));
          }
        }
        target.push(next);
      }
      patchIndices.push(target);
      surfaceIds.push(surfaceId);
    }
    part.dispose();
  }

  if (!vertexCount) return null;

  const index = [];
  const groups = [];
  for (let pi = 0; pi < patchIndices.length; pi += 1) {
    const verts = patchIndices[pi];
    if (!verts.length) continue;
    groups.push({ start: index.length, count: verts.length, materialIndex: pi });
    for (const v of verts) index.push(v);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(index);
  for (const g of groups) geom.addGroup(g.start, g.count, g.materialIndex);
  geom.userData.surfaceIds = surfaceIds;
  geom.userData.surfaceScheme = 'grouped';
  return geom;
}

function applyBrushUvs(geom, sx, sy, sz, uv = {}, uvBias = null) {
  const scaleX = Number(uv.scale?.x) || 1;
  const scaleY = Number(uv.scale?.y) || 1;
  const tile = TEXTURE_TILE_EDITOR_UNITS;
  const ox = Number(uvBias?.origin?.x);
  const oy = Number(uvBias?.origin?.y);
  const oz = Number(uvBias?.origin?.z);
  const hasOrigin = Number.isFinite(ox) && Number.isFinite(oy) && Number.isFinite(oz);
  const legacyU = Number(uvBias?.u) || 0;
  const legacyV = Number(uvBias?.v) || 0;

  // Face order: +x -x +y -y +z -z. Sizes match Three.js BoxGeometry UV axes.
  // +Y/−Y use V along ±Z with V flipped in BoxGeometry — bias accounts for that when origin is set.
  const faceUv = [
    { fu: (sz / tile) * scaleX, fv: (sy / tile) * scaleY, bu: hasOrigin ? (oz / tile) * scaleX : legacyU, bv: hasOrigin ? (oy / tile) * scaleY : legacyV, flipV: false },
    { fu: (sz / tile) * scaleX, fv: (sy / tile) * scaleY, bu: hasOrigin ? (oz / tile) * scaleX : legacyU, bv: hasOrigin ? (oy / tile) * scaleY : legacyV, flipV: false },
    { fu: (sx / tile) * scaleX, fv: (sz / tile) * scaleY, bu: hasOrigin ? (ox / tile) * scaleX : legacyU, bv: hasOrigin ? (oz / tile) * scaleY : legacyV, flipV: true },
    { fu: (sx / tile) * scaleX, fv: (sz / tile) * scaleY, bu: hasOrigin ? (ox / tile) * scaleX : legacyU, bv: hasOrigin ? (oz / tile) * scaleY : legacyV, flipV: true },
    { fu: (sx / tile) * scaleX, fv: (sy / tile) * scaleY, bu: hasOrigin ? (ox / tile) * scaleX : legacyU, bv: hasOrigin ? (oy / tile) * scaleY : legacyV, flipV: false },
    { fu: (sx / tile) * scaleX, fv: (sy / tile) * scaleY, bu: hasOrigin ? (ox / tile) * scaleX : legacyU, bv: hasOrigin ? (oy / tile) * scaleY : legacyV, flipV: false },
  ];

  const uvAttr = geom.attributes.uv;
  for (let face = 0; face < 6; face += 1) {
    const { fu, fv, bu, bv, flipV } = faceUv[face];
    for (let i = 0; i < 4; i += 1) {
      const idx = face * 4 + i;
      const nu = uvAttr.getX(idx);
      const nv = flipV && hasOrigin ? 1 - uvAttr.getY(idx) : uvAttr.getY(idx);
      const u = nu * fu + bu;
      const v = nv * fv + bv;
      // Rotation + offset only (scale already in fu/fv); matches composeActorUv order.
      const [ru, rv] = composeActorUv(u, v, {
        scale: { x: 1, y: 1 },
        offset: uv.offset,
        rotation: uv.rotation,
      });
      uvAttr.setXY(idx, ru, rv);
    }
  }
  uvAttr.needsUpdate = true;
}

/**
 * Build base solids before world subtraction (openings applied).
 */
export function getBrushBaseSolids(brush) {
  const openings = brush?.openings || [];
  if (!openings.length) {
    return {
      hasOpenings: false,
      solids: [{
        center: { x: 0, y: 0, z: 0 },
        size: { ...brush.size },
        role: 'solid',
      }],
    };
  }
  const { openings: valid } = validateOpenings(brush.size, openings);
  if (!valid.length) {
    return {
      hasOpenings: false,
      solids: [{
        center: { x: 0, y: 0, z: 0 },
        size: { ...brush.size },
        role: 'solid',
      }],
    };
  }
  const solids = buildWallOpeningSolids(brush.size, valid);
  if (!solids.length) {
    return {
      hasOpenings: false,
      solids: [{
        center: { x: 0, y: 0, z: 0 },
        size: { ...brush.size },
        role: 'solid',
      }],
    };
  }
  return {
    hasOpenings: true,
    solids,
  };
}

/**
 * Build render/physics solids for a brush.
 * @param {object} brush
 * @param {{ world?: object, actor?: object, maxSolids?: number }|null} [context]
 *   When world+actor are provided, subtractive brushes carve this additive brush.
 * @returns {{ solids: Array<{ center, size, role }>, hasOpenings: boolean, warnings?: array, exceeded?: boolean, ok?: boolean }}
 */
export function getBrushRenderSolids(brush, context = null) {
  // Subtractive volumes are never solid themselves.
  if (isSubtractBrush(brush)) {
    return { hasOpenings: false, solids: [], isSubtract: true };
  }

  const base = getBrushBaseSolids(brush);
  if (!context?.world || !context?.actor) {
    return base;
  }

  const carved = applyWorldSubtraction(base.solids, context.actor, context.world, {
    maxSolids: context.maxSolids ?? getMaxSubtractSolids(),
  });
  return {
    hasOpenings: base.hasOpenings || carved.solids.length !== base.solids.length,
    solids: carved.solids,
    warnings: carved.warnings,
    exceeded: carved.exceeded,
    ok: carved.ok,
    solidCount: carved.solidCount,
    maxSolids: carved.maxSolids,
    truncated: false,
  };
}

/**
 * Atomically validate that every additive brush stays within the solid limit.
 * @returns {{ ok: true } | { ok: false, actorId, actorName, solidCount, maxSolids, message }}
 */
export function validateWorldSubtractComplexity(world, {
  maxSolids = getMaxSubtractSolids(),
} = {}) {
  if (!world?.actors) return { ok: true, maxSolids };

  for (const actor of world.actors) {
    const brush = actor.getComponent?.('Brush');
    if (!brush || brush.enabled === false || isSubtractBrush(brush)) continue;
    const base = getBrushBaseSolids(brush);
    const carved = applyWorldSubtraction(base.solids, actor, world, { maxSolids });
    if (carved.exceeded) {
      return {
        ok: false,
        actorId: actor.id,
        actorName: actor.name || actor.id,
        solidCount: carved.solidCount,
        maxSolids: carved.maxSolids,
        offendingCutterId: carved.offendingCutterId || null,
        message: formatSubtractComplexityMessage({
          actorName: actor.name || actor.id,
          solidCount: carved.solidCount,
          maxSolids: carved.maxSolids,
        }),
      };
    }
  }
  return { ok: true, maxSolids };
}
