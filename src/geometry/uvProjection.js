/**
 * Per-face planar UV projection for convex brushes (Phase 2F.0).
 * Legacy box face ids use the same density frame as Brush
 * (`densityUvOnBrushFace` in alignSurfaces.js).
 */

import { TEXTURE_TILE_EDITOR_UNITS, composeGeometryUv } from '../runtime/uvMapping.js';
import { densityUvOnBrushFace } from '../rules/alignSurfaces.js';
import { geometryBounds } from './convexBrush.js';

const TILE = TEXTURE_TILE_EDITOR_UNITS;

/**
 * Density UV for a local-space point on a face projection.
 * When `size` is provided (or inferred from geometry bounds), legacy box
 * projections match Brush exactly. Otherwise falls back to axis projection
 * about `uvOrigin`.
 *
 * @param {[number,number,number]} p actor-local eu
 * @param {string} proj
 * @param {{
 *   uvOrigin?: [number,number,number],
 *   size?: {x:number,y:number,z:number}|null,
 *   geometry?: object|null,
 * }} [opts]
 * @returns {[number, number]}
 */
export function densityUvOnProjection(p, proj, opts = {}) {
  const size = opts.size || (opts.geometry ? sizeFromGeometry(opts.geometry) : null);
  if (size && isBoxProj(proj)) {
    const uv = densityUvOnBrushFace(proj, { x: p[0], y: p[1], z: p[2] }, size);
    if (uv) return uv;
  }
  const uvOrigin = opts.uvOrigin || opts.geometry?.uvOrigin || [0, 0, 0];
  const x = p[0] - (uvOrigin[0] || 0);
  const y = p[1] - (uvOrigin[1] || 0);
  const z = p[2] - (uvOrigin[2] || 0);
  switch (proj) {
    case 'px':
    case 'nx':
      return [z / TILE, y / TILE];
    case 'py':
    case 'ny':
      return [x / TILE, z / TILE];
    case 'pz':
    case 'nz':
    default:
      return [x / TILE, y / TILE];
  }
}

function isBoxProj(proj) {
  return proj === 'px' || proj === 'nx' || proj === 'py'
    || proj === 'ny' || proj === 'pz' || proj === 'nz';
}

function sizeFromGeometry(geometry) {
  const b = geometryBounds(geometry);
  return { x: b.size[0], y: b.size[1], z: b.size[2] };
}

export function projectVertexUv(p, proj, opts = {}, actorUv = {}, faceUv = null) {
  const [u, v] = densityUvOnProjection(p, proj, opts);
  return composeGeometryUv(u, v, actorUv, faceUv);
}

export function projFromNormal(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 'px' : 'nx';
  if (ay >= ax && ay >= az) return ny >= 0 ? 'py' : 'ny';
  return nz >= 0 ? 'pz' : 'nz';
}
