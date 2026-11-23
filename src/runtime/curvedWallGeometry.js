/**
 * Parametric curved wall mesh + collider helpers (editor units).
 * Local space: circle center at origin XZ; Y = 0 at wall mid-height.
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { TEXTURE_TILE_EDITOR_UNITS } from './brushGeometry.js';
import {
  DEFAULT_CURVED_WALL_RADIUS,
  DEFAULT_CURVED_WALL_RESOLUTION,
  DEFAULT_CURVED_WALL_SWEEP,
} from '../components/CurvedWallComponent.js';
import { WALL_MODULE_SIZE, WALL_THICKNESS } from '../core/units.js';

const TILE = TEXTURE_TILE_EDITOR_UNITS;

function dims(wall) {
  const radius = Math.max(1, Number(wall.radius) || DEFAULT_CURVED_WALL_RADIUS);
  const thickness = Math.max(1, Number(wall.thickness) || WALL_THICKNESS);
  const height = Math.max(1, Number(wall.height) || WALL_MODULE_SIZE);
  const sweepAngle = Math.max(1, Math.min(360, Number(wall.sweepAngle) || DEFAULT_CURVED_WALL_SWEEP));
  const startAngle = Number(wall.startAngle) || 0;
  const clockwise = Boolean(wall.clockwise);
  const res = Math.max(
    4,
    Math.min(128, Math.round(Number(wall.curveResolution) || DEFAULT_CURVED_WALL_RESOLUTION)),
  );
  // Keep a hollow passage for full circles: centerline radius must exceed half thickness.
  const r = Math.max(radius, thickness * 0.5 + 1);
  const innerR = Math.max(1, r - thickness * 0.5);
  const outerR = r + thickness * 0.5;
  const sweepRad = (sweepAngle * Math.PI) / 180;
  const startRad = (startAngle * Math.PI) / 180;
  const sign = clockwise ? -1 : 1;
  return {
    radius: r,
    thickness,
    height,
    sweepAngle,
    startAngle,
    clockwise,
    res,
    innerR,
    outerR,
    sweepRad,
    startRad,
    sign,
    y0: -height * 0.5,
    y1: height * 0.5,
    miterStart: Number(wall.miterStart) || 0,
    miterEnd: Number(wall.miterEnd) || 0,
  };
}

/** Closed ring when sweep is effectively 360°. */
export function isClosedCurvedWall(wall) {
  return Math.abs((Number(wall.sweepAngle) || 0) - 360) < 0.01;
}

export function getCurvedWallAabbSize(wall) {
  const d = dims(wall);
  const samples = Math.max(8, d.res);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const a = d.startRad + d.sign * d.sweepRad * t;
    for (const r of [d.innerR, d.outerR]) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  return {
    x: Math.max(1, maxX - minX),
    y: d.height,
    z: Math.max(1, maxZ - minZ),
  };
}

/**
 * World-local endpoint descriptors (actor-local positions / unit tangents).
 * tangent points along increasing sweep (direction of travel along the wall).
 */
export function getCurvedWallLocalEndpoints(wall) {
  const d = dims(wall);
  const make = (angleRad, which) => {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const radial = { x: c, y: 0, z: s };
    // Tangent: perpendicular to radial in XZ, following sweep direction.
    const tangent = {
      x: -s * d.sign,
      y: 0,
      z: c * d.sign,
    };
    return {
      id: which,
      position: { x: c * d.radius, y: 0, z: s * d.radius },
      tangent,
      outwardNormal: radial,
      inwardNormal: { x: -c, y: 0, z: -s },
      halfThickness: d.thickness * 0.5,
      halfHeight: d.height * 0.5,
      angleRad,
    };
  };
  const start = make(d.startRad, 'start');
  const end = make(d.startRad + d.sign * d.sweepRad, 'end');
  return { start, end, dims: d };
}

/** Arc length along centerline (editor units). */
export function getCurvedWallArcLength(wall) {
  const d = dims(wall);
  return d.radius * d.sweepRad;
}

/**
 * Oriented box colliders approximating the curved wall (one per segment).
 * Each solid: center, size, localRotation (euler degrees yaw about Y).
 */
export function getCurvedWallColliderSolids(wall) {
  const d = dims(wall);
  const n = Math.max(4, d.res);
  const solids = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a0 = d.startRad + d.sign * d.sweepRad * t0;
    const a1 = d.startRad + d.sign * d.sweepRad * t1;
    const am = (a0 + a1) * 0.5;
    const chord = d.radius * Math.abs(a1 - a0);
    const yawDeg = (am * 180) / Math.PI + (d.sign > 0 ? 90 : -90);
    solids.push({
      center: {
        x: Math.cos(am) * d.radius,
        y: 0,
        z: Math.sin(am) * d.radius,
      },
      size: {
        x: Math.max(1, chord * 1.02),
        y: d.height,
        z: d.thickness,
      },
      localRotation: { x: 0, y: yawDeg, z: 0 },
      role: 'segment',
    });
  }
  return solids;
}

function pushTri(pos, uv, a, b, c, ua, ub, uc) {
  pos.push(toMeters(a.x), toMeters(a.y), toMeters(a.z));
  pos.push(toMeters(b.x), toMeters(b.y), toMeters(b.z));
  pos.push(toMeters(c.x), toMeters(c.y), toMeters(c.z));
  uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
}

/**
 * Continuous curved wall BufferGeometry (meters) with world-aligned UV density.
 * U runs along arc length; V runs vertically — independent of radius/sweep.
 */
export function createCurvedWallGeometry(wall) {
  const d = dims(wall);
  const scaleX = Number(wall.uv?.scale?.x) || 1;
  const scaleY = Number(wall.uv?.scale?.y) || 1;
  const offU = Number(wall.uv?.offset?.x) || 0;
  const offV = Number(wall.uv?.offset?.y) || 0;
  const n = Math.max(4, d.res);
  const closed = isClosedCurvedWall(wall);

  const pos = [];
  const uvs = [];

  const point = (r, a, y) => ({
    x: Math.cos(a) * r,
    y,
    z: Math.sin(a) * r,
  });

  const arcLen = d.radius * d.sweepRad;

  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const a0 = d.startRad + d.sign * d.sweepRad * t0;
    const a1 = d.startRad + d.sign * d.sweepRad * t1;
    const u0 = (t0 * arcLen) / TILE * scaleX + offU;
    const u1 = (t1 * arcLen) / TILE * scaleX + offU;
    const vBottom = (d.y0 / TILE) * scaleY + offV;
    const vTop = (d.y1 / TILE) * scaleY + offV;

    const oi00 = point(d.outerR, a0, d.y0);
    const oi01 = point(d.outerR, a0, d.y1);
    const oi10 = point(d.outerR, a1, d.y0);
    const oi11 = point(d.outerR, a1, d.y1);
    const ii00 = point(d.innerR, a0, d.y0);
    const ii01 = point(d.innerR, a0, d.y1);
    const ii10 = point(d.innerR, a1, d.y0);
    const ii11 = point(d.innerR, a1, d.y1);

    // Outer face (outward)
    pushTri(pos, uvs, oi00, oi10, oi11, [u0, vBottom], [u1, vBottom], [u1, vTop]);
    pushTri(pos, uvs, oi00, oi11, oi01, [u0, vBottom], [u1, vTop], [u0, vTop]);
    // Inner face (inward — wind opposite)
    pushTri(pos, uvs, ii00, ii11, ii10, [u0, vBottom], [u1, vTop], [u1, vBottom]);
    pushTri(pos, uvs, ii00, ii01, ii11, [u0, vBottom], [u0, vTop], [u1, vTop]);
    // Top
    const vTopU = (d.outerR / TILE) * scaleY + offV;
    pushTri(pos, uvs, oi01, oi11, ii11, [u0, 0], [u1, 0], [u1, (d.thickness / TILE) * scaleY]);
    pushTri(pos, uvs, oi01, ii11, ii01, [u0, 0], [u1, (d.thickness / TILE) * scaleY], [u0, (d.thickness / TILE) * scaleY]);
    // Bottom
    pushTri(pos, uvs, oi00, ii10, oi10, [u0, 0], [u1, (d.thickness / TILE) * scaleY], [u1, 0]);
    pushTri(pos, uvs, oi00, ii00, ii10, [u0, 0], [u0, (d.thickness / TILE) * scaleY], [u1, (d.thickness / TILE) * scaleY]);
    void vTopU;
  }

  if (!closed) {
    // Start cap
    const aS = d.startRad;
    const o0 = point(d.outerR, aS, d.y0);
    const o1 = point(d.outerR, aS, d.y1);
    const i0 = point(d.innerR, aS, d.y0);
    const i1 = point(d.innerR, aS, d.y1);
    const uCap = offU;
    pushTri(pos, uvs, o0, i0, i1, [uCap, (d.y0 / TILE) * scaleY + offV], [uCap + (d.thickness / TILE) * scaleX, (d.y0 / TILE) * scaleY + offV], [uCap + (d.thickness / TILE) * scaleX, (d.y1 / TILE) * scaleY + offV]);
    pushTri(pos, uvs, o0, i1, o1, [uCap, (d.y0 / TILE) * scaleY + offV], [uCap + (d.thickness / TILE) * scaleX, (d.y1 / TILE) * scaleY + offV], [uCap, (d.y1 / TILE) * scaleY + offV]);
    // End cap
    const aE = d.startRad + d.sign * d.sweepRad;
    const eo0 = point(d.outerR, aE, d.y0);
    const eo1 = point(d.outerR, aE, d.y1);
    const ei0 = point(d.innerR, aE, d.y0);
    const ei1 = point(d.innerR, aE, d.y1);
    const uE = (arcLen / TILE) * scaleX + offU;
    pushTri(pos, uvs, eo0, ei1, ei0, [uE, (d.y0 / TILE) * scaleY + offV], [uE + (d.thickness / TILE) * scaleX, (d.y1 / TILE) * scaleY + offV], [uE + (d.thickness / TILE) * scaleX, (d.y0 / TILE) * scaleY + offV]);
    pushTri(pos, uvs, eo0, eo1, ei1, [uE, (d.y0 / TILE) * scaleY + offV], [uE, (d.y1 / TILE) * scaleY + offV], [uE + (d.thickness / TILE) * scaleX, (d.y1 / TILE) * scaleY + offV]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}
