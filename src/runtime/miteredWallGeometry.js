/**
 * Mitered straight-wall prism mesh + collider (editor units).
 * Used when Brush.miterStart / miterEnd are non-zero.
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { TEXTURE_TILE_EDITOR_UNITS } from './brushGeometry.js';
import { getWallAxes } from './wallOpenings.js';
import { getMiteredWallFootprint } from './wallEndpoints.js';

const TILE = TEXTURE_TILE_EDITOR_UNITS;

function pushTri(pos, uv, a, b, c, ua, ub, uc) {
  pos.push(toMeters(a.x), toMeters(a.y), toMeters(a.z));
  pos.push(toMeters(b.x), toMeters(b.y), toMeters(b.z));
  pos.push(toMeters(c.x), toMeters(c.y), toMeters(c.z));
  uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
}

/**
 * Eight corners of the mitered prism (bottom 0-3, top 4-7).
 */
export function getMiteredWallCorners(size, miterStart = 0, miterEnd = 0) {
  const axes = getWallAxes(size);
  const halfH = axes.height * 0.5;
  const foot = getMiteredWallFootprint(size, miterStart, miterEnd);
  const bottom = foot.map((p) => ({ ...p, y: -halfH }));
  const top = foot.map((p) => ({ ...p, y: halfH }));
  return { bottom, top, axes };
}

/** Flat meters for Rapier convexHull. */
export function miteredWallPointsToMetersFlat(size, miterStart, miterEnd, scale = { x: 1, y: 1, z: 1 }) {
  const { bottom, top } = getMiteredWallCorners(size, miterStart, miterEnd);
  const pts = [...bottom, ...top];
  const out = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i += 1) {
    out[i * 3] = toMeters(pts[i].x * (scale.x || 1));
    out[i * 3 + 1] = toMeters(pts[i].y * (scale.y || 1));
    out[i * 3 + 2] = toMeters(pts[i].z * (scale.z || 1));
  }
  return out;
}

export function createMiteredWallGeometry(size, uv = {}, miterStart = 0, miterEnd = 0) {
  const { bottom, top, axes } = getMiteredWallCorners(size, miterStart, miterEnd);
  const scaleX = Number(uv.scale?.x) || 1;
  const scaleY = Number(uv.scale?.y) || 1;
  const offU = Number(uv.offset?.x) || 0;
  const offV = Number(uv.offset?.y) || 0;

  const pos = [];
  const uvs = [];

  const lenOf = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // Side faces: 4 walls around footprint
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const b0 = bottom[i];
    const b1 = bottom[j];
    const t0 = top[i];
    const t1 = top[j];
    const edgeLen = lenOf(b0, b1);
    const u0 = offU;
    const u1 = (edgeLen / TILE) * scaleX + offU;
    const v0 = (b0.y / TILE) * scaleY + offV;
    const v1 = (t0.y / TILE) * scaleY + offV;
    pushTri(pos, uvs, b0, b1, t1, [u0, v0], [u1, v0], [u1, v1]);
    pushTri(pos, uvs, b0, t1, t0, [u0, v0], [u1, v1], [u0, v1]);
  }

  // Top
  pushTri(
    pos, uvs, top[0], top[1], top[2],
    [(top[0][axes.lengthAxis] / TILE) * scaleX + offU, (top[0][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(top[1][axes.lengthAxis] / TILE) * scaleX + offU, (top[1][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(top[2][axes.lengthAxis] / TILE) * scaleX + offU, (top[2][axes.thicknessAxis] / TILE) * scaleY + offV],
  );
  pushTri(
    pos, uvs, top[0], top[2], top[3],
    [(top[0][axes.lengthAxis] / TILE) * scaleX + offU, (top[0][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(top[2][axes.lengthAxis] / TILE) * scaleX + offU, (top[2][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(top[3][axes.lengthAxis] / TILE) * scaleX + offU, (top[3][axes.thicknessAxis] / TILE) * scaleY + offV],
  );
  // Bottom
  pushTri(
    pos, uvs, bottom[0], bottom[2], bottom[1],
    [(bottom[0][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[0][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(bottom[2][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[2][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(bottom[1][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[1][axes.thicknessAxis] / TILE) * scaleY + offV],
  );
  pushTri(
    pos, uvs, bottom[0], bottom[3], bottom[2],
    [(bottom[0][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[0][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(bottom[3][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[3][axes.thicknessAxis] / TILE) * scaleY + offV],
    [(bottom[2][axes.lengthAxis] / TILE) * scaleX + offU, (bottom[2][axes.thicknessAxis] / TILE) * scaleY + offV],
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

export function brushHasMiters(brush) {
  return Math.abs(Number(brush?.miterStart) || 0) > 0.01
    || Math.abs(Number(brush?.miterEnd) || 0) > 0.01;
}
