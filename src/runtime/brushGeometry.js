import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { buildWallOpeningSolids, validateOpenings } from './wallOpenings.js';
import {
  applyWorldSubtraction,
  formatSubtractComplexityMessage,
  isSubtractBrush,
  MAX_SUBTRACT_SOLIDS,
} from './brushBoolean.js';
import {
  TEXTURE_TILE_EDITOR_UNITS,
  applyFaceUvsToGeometry,
  composeActorUv,
} from './uvMapping.js';

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
    maxSolids: context.maxSolids ?? MAX_SUBTRACT_SOLIDS,
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
  maxSolids = MAX_SUBTRACT_SOLIDS,
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
