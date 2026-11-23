/**
 * Parametric column mesh + collider helpers (editor units).
 * Actor origin = center of the column AABB.
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import {
  COLUMN_SHAPE_SIDES,
  DEFAULT_COLUMN_HEIGHT,
  DEFAULT_COLUMN_RADIUS,
} from '../components/ColumnComponent.js';

const TILE = 100; // 1 m

function resolveSides(column) {
  const shape = column.shape || 'round';
  if (column.sides != null && Number.isFinite(Number(column.sides))) {
    return Math.max(3, Math.min(64, Math.round(Number(column.sides))));
  }
  return COLUMN_SHAPE_SIDES[shape] || 24;
}

function polygonRadii(column) {
  const shaftR = Math.max(1, Number(column.radius) || DEFAULT_COLUMN_RADIUS);
  const baseEnabled = column.baseEnabled !== false && (Number(column.baseHeight) || 0) > 0;
  const capitalEnabled = column.capitalEnabled !== false && (Number(column.capitalHeight) || 0) > 0;
  const baseR = baseEnabled
    ? (column.getEffectiveBaseRadius?.()
      ?? (column.baseRadius != null ? Number(column.baseRadius) : shaftR * 1.25))
    : shaftR;
  const capitalR = capitalEnabled
    ? (column.getEffectiveCapitalRadius?.()
      ?? (column.capitalRadius != null ? Number(column.capitalRadius) : shaftR * 1.2))
    : shaftR;
  return {
    shaftR,
    baseR: Math.max(1, baseR),
    capitalR: Math.max(1, capitalR),
    baseEnabled,
    capitalEnabled,
  };
}

/** Axis-aligned bounds size in editor units. */
export function getColumnAabbSize(column) {
  const height = Math.max(1, Number(column.height) || DEFAULT_COLUMN_HEIGHT);
  const { shaftR, baseR, capitalR, baseEnabled, capitalEnabled } = polygonRadii(column);
  const maxR = Math.max(shaftR, baseEnabled ? baseR : 0, capitalEnabled ? capitalR : 0);
  const diam = maxR * 2;
  return { x: diam, y: height, z: diam };
}

/**
 * Regular N-gon vertices in XZ at given radius (Y ignored).
 * Square/hex/oct aligned flat-to-side for architectural look.
 */
export function getColumnPolygonXZ(radius, sides, shape = 'round') {
  const n = Math.max(3, sides);
  const r = Math.max(1, radius);
  const verts = [];
  // Flat-top for even-sided architectural columns; round starts at +X.
  const start = shape === 'round' ? 0 : (Math.PI / n);
  for (let i = 0; i < n; i += 1) {
    const a = start + (i / n) * Math.PI * 2;
    verts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return verts;
}

/**
 * Stacked prism sections: optional base, shaft, optional capital.
 * Each section: { y0, y1, radius } in actor-local space (centered on AABB).
 */
export function getColumnSections(column) {
  const height = Math.max(1, Number(column.height) || DEFAULT_COLUMN_HEIGHT);
  const { shaftR, baseR, capitalR, baseEnabled, capitalEnabled } = polygonRadii(column);
  let baseH = baseEnabled ? Math.max(0, Number(column.baseHeight) || 0) : 0;
  let capitalH = capitalEnabled ? Math.max(0, Number(column.capitalHeight) || 0) : 0;
  if (baseH + capitalH >= height) {
    const scale = (height * 0.45) / Math.max(1e-6, baseH + capitalH);
    baseH *= scale;
    capitalH *= scale;
  }
  const shaftH = Math.max(1, height - baseH - capitalH);
  const yBottom = -height * 0.5;
  const sections = [];
  let y = yBottom;
  if (baseH > 0) {
    sections.push({ y0: y, y1: y + baseH, radius: baseR, role: 'base' });
    y += baseH;
  }
  sections.push({ y0: y, y1: y + shaftH, radius: shaftR, role: 'shaft' });
  y += shaftH;
  if (capitalH > 0) {
    sections.push({ y0: y, y1: y + capitalH, radius: capitalR, role: 'capital' });
  }
  return sections;
}

/**
 * Convex-hull points (editor units) for Rapier — all section ring vertices.
 */
export function getColumnColliderPoints(column) {
  const sides = resolveSides(column);
  const shape = column.shape || 'round';
  const sections = getColumnSections(column);
  const points = [];
  for (const sec of sections) {
    const ring = getColumnPolygonXZ(sec.radius, sides, shape);
    for (const p of ring) {
      points.push({ x: p.x, y: sec.y0, z: p.z });
      points.push({ x: p.x, y: sec.y1, z: p.z });
    }
  }
  return points;
}

/** Flat Float32Array meters for Rapier.convexHull. */
export function columnPointsToMetersFlat(points, scale = { x: 1, y: 1, z: 1 }) {
  const out = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    out[i * 3] = toMeters(p.x * (scale.x || 1));
    out[i * 3 + 1] = toMeters(p.y * (scale.y || 1));
    out[i * 3 + 2] = toMeters(p.z * (scale.z || 1));
  }
  return out;
}

/**
 * Prefer cylinder collider for round columns without ornate base/capital mismatch.
 */
export function getColumnCylinderCollider(column) {
  const shape = column.shape || 'round';
  if (shape !== 'round') return null;
  const sections = getColumnSections(column);
  const { shaftR, baseR, capitalR, baseEnabled, capitalEnabled } = polygonRadii(column);
  const maxR = Math.max(shaftR, baseEnabled ? baseR : 0, capitalEnabled ? capitalR : 0);
  // Single enclosing cylinder is conservative but continuous for passage clearance around.
  if (sections.length === 1) {
    const h = sections[0].y1 - sections[0].y0;
    return {
      halfHeight: h * 0.5,
      radius: shaftR,
      localPosition: { x: 0, y: (sections[0].y0 + sections[0].y1) * 0.5, z: 0 },
    };
  }
  const height = Math.max(1, Number(column.height) || DEFAULT_COLUMN_HEIGHT);
  return {
    halfHeight: height * 0.5,
    radius: maxR,
    localPosition: { x: 0, y: 0, z: 0 },
  };
}

function pushTri(posOut, uvOut, a, b, c, uva, uvb, uvc) {
  posOut.push(toMeters(a.x), toMeters(a.y), toMeters(a.z));
  posOut.push(toMeters(b.x), toMeters(b.y), toMeters(b.z));
  posOut.push(toMeters(c.x), toMeters(c.y), toMeters(c.z));
  uvOut.push(uva[0], uva[1], uvb[0], uvb[1], uvc[0], uvc[1]);
}

/**
 * Build BufferGeometry for the full column (meters), world-aligned continuous UVs.
 */
export function createColumnGeometry(column) {
  const sides = resolveSides(column);
  const shape = column.shape || 'round';
  const sections = getColumnSections(column);
  const uvScaleX = Number(column.uv?.scale?.x) || 1;
  const uvScaleY = Number(column.uv?.scale?.y) || 1;
  const uvOffU = Number(column.uv?.offset?.x) || 0;
  const uvOffV = Number(column.uv?.offset?.y) || 0;

  const posOut = [];
  const uvOut = [];

  for (const sec of sections) {
    const bottom = getColumnPolygonXZ(sec.radius, sides, shape).map((p) => ({
      x: p.x, y: sec.y0, z: p.z,
    }));
    const top = getColumnPolygonXZ(sec.radius, sides, shape).map((p) => ({
      x: p.x, y: sec.y1, z: p.z,
    }));
    const circ = Math.PI * 2 * sec.radius;
    const h = sec.y1 - sec.y0;

    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      const u0 = ((i / sides) * circ) / TILE * uvScaleX + uvOffU;
      const u1 = ((j / sides) * circ) / TILE * uvScaleX + uvOffU;
      const v0 = (sec.y0 / TILE) * uvScaleY + uvOffV;
      const v1 = (sec.y1 / TILE) * uvScaleY + uvOffV;
      pushTri(posOut, uvOut, bottom[i], bottom[j], top[j], [u0, v0], [u1, v0], [u1, v1]);
      pushTri(posOut, uvOut, bottom[i], top[j], top[i], [u0, v0], [u1, v1], [u0, v1]);
    }

    // Caps
    const bc = { x: 0, y: sec.y0, z: 0 };
    const tc = { x: 0, y: sec.y1, z: 0 };
    for (let i = 0; i < sides; i += 1) {
      const j = (i + 1) % sides;
      const u0 = (bottom[i].x / TILE) * uvScaleX + uvOffU;
      const v0 = (bottom[i].z / TILE) * uvScaleY + uvOffV;
      const u1 = (bottom[j].x / TILE) * uvScaleX + uvOffU;
      const v1 = (bottom[j].z / TILE) * uvScaleY + uvOffV;
      const uc = uvOffU;
      const vc = uvOffV;
      // Bottom facing down
      pushTri(posOut, uvOut, bottom[j], bottom[i], bc, [u1, v1], [u0, v0], [uc, vc]);
      // Top facing up
      const ut0 = (top[i].x / TILE) * uvScaleX + uvOffU;
      const vt0 = (top[i].z / TILE) * uvScaleY + uvOffV;
      const ut1 = (top[j].x / TILE) * uvScaleX + uvOffU;
      const vt1 = (top[j].z / TILE) * uvScaleY + uvOffV;
      pushTri(posOut, uvOut, top[i], top[j], tc, [ut0, vt0], [ut1, vt1], [uc, vc]);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(posOut, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvOut, 2));
  geom.computeVertexNormals();
  return geom;
}
