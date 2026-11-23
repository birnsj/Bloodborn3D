import * as THREE from 'three';
import {
  EDITOR_UNITS_PER_METER,
  toMeters,
} from '../core/units.js';
import { buildWallOpeningSolids, validateOpenings } from './wallOpenings.js';
import {
  applyWorldSubtraction,
  formatSubtractComplexityMessage,
  isSubtractBrush,
  MAX_SUBTRACT_SOLIDS,
} from './brushBoolean.js';

/**
 * Texture resolution contract: one 2048² map covers 1 m (100 editor units).
 * Target ≈ 2048 px/m. Do not stretch the tile to wall-module size — that tanks density.
 * Brick / ashlar module size belongs in the texture pixels (or material uvScale), not here.
 */
export const TEXTURE_TILE_EDITOR_UNITS = EDITOR_UNITS_PER_METER;
export const TEXTURE_TILE_METERS = 1;
export const TARGET_TEXEL_DENSITY = 2048 / TEXTURE_TILE_METERS;

/**
 * BoxGeometry with world-aligned UVs so brush resize does not stretch textures.
 * UV units tile every TEXTURE_TILE_EDITOR_UNITS (100 = 1 m) by default, then apply brush UV transform.
 *
 * Face order matches Three.js BoxGeometry materials: +x -x +y -y +z -z
 */
export function createBrushBoxGeometry(sizeEditor, uv = {}) {
  const sx = Math.max(1, sizeEditor.x);
  const sy = Math.max(1, sizeEditor.y);
  const sz = Math.max(1, sizeEditor.z);
  const geom = new THREE.BoxGeometry(toMeters(sx), toMeters(sy), toMeters(sz));
  applyBrushUvs(geom, sx, sy, sz, uv);
  return geom;
}

/**
 * Same UV rules as createBrushBoxGeometry, for an arbitrary solid piece.
 * Optional uvBias shifts tiling so pieces of a cut wall stay continuous in wall space.
 */
export function createBrushSolidGeometry(sizeEditor, uv = {}, uvBias = null) {
  const sx = Math.max(1e-4, sizeEditor.x);
  const sy = Math.max(1e-4, sizeEditor.y);
  const sz = Math.max(1e-4, sizeEditor.z);
  const geom = new THREE.BoxGeometry(toMeters(sx), toMeters(sy), toMeters(sz));
  applyBrushUvs(geom, sx, sy, sz, uv, uvBias);
  return geom;
}

function applyBrushUvs(geom, sx, sy, sz, uv = {}, uvBias = null) {
  const scaleX = Number(uv.scale?.x) || 1;
  const scaleY = Number(uv.scale?.y) || 1;
  const offX = Number(uv.offset?.x) || 0;
  const offY = Number(uv.offset?.y) || 0;
  const biasU = Number(uvBias?.u) || 0;
  const biasV = Number(uvBias?.v) || 0;
  const rot = (Number(uv.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const tile = TEXTURE_TILE_EDITOR_UNITS;
  const uX = (sz / tile) * scaleX;
  const vX = (sy / tile) * scaleY;
  const uY = (sx / tile) * scaleX;
  const vY = (sz / tile) * scaleY;
  const uZ = (sx / tile) * scaleX;
  const vZ = (sy / tile) * scaleY;

  const faceUvSizes = [
    [uX, vX],
    [uX, vX],
    [uY, vY],
    [uY, vY],
    [uZ, vZ],
    [uZ, vZ],
  ];

  const uvAttr = geom.attributes.uv;
  for (let face = 0; face < 6; face += 1) {
    const [fu, fv] = faceUvSizes[face];
    for (let i = 0; i < 4; i += 1) {
      const idx = face * 4 + i;
      let u = uvAttr.getX(idx) * fu + biasU;
      let v = uvAttr.getY(idx) * fv + biasV;
      const ru = u * cos - v * sin;
      const rv = u * sin + v * cos;
      uvAttr.setXY(idx, ru + offX, rv + offY);
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
