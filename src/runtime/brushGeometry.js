import * as THREE from 'three';
import {
  EDITOR_UNITS_PER_METER,
  WALL_MODULE_SIZE,
  toMeters,
} from '../core/units.js';
import { buildWallOpeningSolids, validateOpenings } from './wallOpenings.js';

/**
 * Architectural tiling: one 2048² texture covers one wall module (3 m).
 * ~683 px/m at that density.
 */
export const TEXTURE_TILE_EDITOR_UNITS = WALL_MODULE_SIZE;
export const TEXTURE_TILE_METERS = WALL_MODULE_SIZE / EDITOR_UNITS_PER_METER;
export const TARGET_TEXEL_DENSITY = 2048 / TEXTURE_TILE_METERS;

/**
 * BoxGeometry with world-aligned UVs so brush resize does not stretch textures.
 * UV units tile every TEXTURE_TILE_EDITOR_UNITS (300) by default, then apply brush UV transform.
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
 * Build render solids for a brush (single box, or partitioned wall with openings).
 * @returns {{ solids: Array<{ center, size, role }>, hasOpenings: boolean }}
 */
export function getBrushRenderSolids(brush) {
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
  // Never leave a brush with zero meshes (e.g. pathological opening cover).
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
