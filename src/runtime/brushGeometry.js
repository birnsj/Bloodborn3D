import * as THREE from 'three';
import {
  EDITOR_UNITS_PER_METER,
  WALL_MODULE_SIZE,
  toMeters,
} from '../core/units.js';

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

  const scaleX = Number(uv.scale?.x) || 1;
  const scaleY = Number(uv.scale?.y) || 1;
  const offX = Number(uv.offset?.x) || 0;
  const offY = Number(uv.offset?.y) || 0;
  const rot = (Number(uv.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const tile = TEXTURE_TILE_EDITOR_UNITS;
  // Face sizes in tile units (editor units / module)
  const uX = (sz / tile) * scaleX;
  const vX = (sy / tile) * scaleY;
  const uY = (sx / tile) * scaleX;
  const vY = (sz / tile) * scaleY;
  const uZ = (sx / tile) * scaleX;
  const vZ = (sy / tile) * scaleY;

  const faceUvSizes = [
    [uX, vX], // +x
    [uX, vX], // -x
    [uY, vY], // +y
    [uY, vY], // -y
    [uZ, vZ], // +z
    [uZ, vZ], // -z
  ];

  const uvAttr = geom.attributes.uv;
  // BoxGeometry: 4 verts per face, 6 faces
  for (let face = 0; face < 6; face += 1) {
    const [fu, fv] = faceUvSizes[face];
    for (let i = 0; i < 4; i += 1) {
      const idx = face * 4 + i;
      // Default corner UVs are 0/1 — remap to tiled extents
      let u = uvAttr.getX(idx) * fu;
      let v = uvAttr.getY(idx) * fv;
      // rotation about 0
      const ru = u * cos - v * sin;
      const rv = u * sin + v * cos;
      uvAttr.setXY(idx, ru + offX, rv + offY);
    }
  }
  uvAttr.needsUpdate = true;
  return geom;
}
