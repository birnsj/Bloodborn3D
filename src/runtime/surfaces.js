/**
 * Phase 2E.1 — stable semantic surface IDs for structural geometry.
 * Stored in component.faceMaterials[surfaceId] → material asset id.
 * Actor materialId remains the fallback when a surface has no override.
 *
 * IDs are semantic (not triangle indices) so they survive geometry regeneration.
 */

import * as THREE from 'three';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';

/** Axis-aligned box faces (Brush solids, mitered walls, straight stair steps). */
export const BOX_SURFACE_IDS = [...FACE_KEYS];

/** Ramp wedge surfaces — order matches createRampWedgeGeometry face batches. */
export const RAMP_SURFACE_IDS = ['bottom', 'slope', 'high', 'sideNeg', 'sidePos'];

/** Curved / spiral stair wedge surfaces — order matches createWedgeStepGeometry face batches. */
export const STAIR_WEDGE_SURFACE_IDS = [
  'bottom',
  'tread',
  'radial0',
  'radial1',
  'inner',
  'outer',
];

/** Column body / capital roles (side wraps) plus end caps. */
export const COLUMN_SURFACE_IDS = ['base', 'shaft', 'capital', 'capTop', 'capBottom'];

/** Curved wall shell surfaces. */
export const CURVED_WALL_SURFACE_IDS = [
  'outer',
  'inner',
  'top',
  'bottom',
  'startCap',
  'endCap',
];

/**
 * Arch ExtrudeGeometry surfaces (classified by local normal / position).
 * front/back = ±Z faces of the extrusion; sides = outer walls; passage = inner hole.
 */
export const ARCH_SURFACE_IDS = ['front', 'back', 'outer', 'passage', 'top', 'bottom'];

const STRUCTURAL_TYPES = [
  'Brush',
  'Ramp',
  'Stair',
  'Column',
  'Arch',
  'CurvedWall',
];

const ALLOWED_BY_TYPE = {
  Brush: new Set(BOX_SURFACE_IDS),
  Ramp: new Set(RAMP_SURFACE_IDS),
  Stair: new Set([...BOX_SURFACE_IDS, ...STAIR_WEDGE_SURFACE_IDS]),
  Column: new Set(COLUMN_SURFACE_IDS),
  Arch: new Set(ARCH_SURFACE_IDS),
  CurvedWall: new Set(CURVED_WALL_SURFACE_IDS),
};

/** All known surface IDs (union). */
export const ALL_SURFACE_IDS = new Set([
  ...BOX_SURFACE_IDS,
  ...RAMP_SURFACE_IDS,
  ...STAIR_WEDGE_SURFACE_IDS,
  ...COLUMN_SURFACE_IDS,
  ...ARCH_SURFACE_IDS,
  ...CURVED_WALL_SURFACE_IDS,
]);

/**
 * Normalize a faceMaterials map. Unknown keys are dropped.
 * @param {object|null} raw
 * @param {Iterable<string>|null} [allowed] — defaults to all known IDs
 */
export function normalizeFaceMaterials(raw, allowed = null) {
  if (!raw || typeof raw !== 'object') return null;
  const allow = allowed
    ? (allowed instanceof Set ? allowed : new Set(allowed))
    : ALL_SURFACE_IDS;
  const next = {};
  let any = false;
  for (const [key, value] of Object.entries(raw)) {
    if (!allow.has(key) || !value) continue;
    next[key] = String(value);
    any = true;
  }
  return any ? next : null;
}

export function allowedSurfacesForComponentType(type) {
  return ALLOWED_BY_TYPE[type] || ALL_SURFACE_IDS;
}

export function listSurfaceIdsForComponent(comp) {
  if (!comp?.type) return [];
  const set = ALLOWED_BY_TYPE[comp.type];
  return set ? [...set] : [];
}

export function getStructuralComponent(actor) {
  if (!actor?.getComponent) return null;
  for (const type of STRUCTURAL_TYPES) {
    const c = actor.getComponent(type);
    if (c) return c;
  }
  return null;
}

/** Resolve material for a surface; falls back to actor materialId. */
export function resolveSurfaceMaterialId(comp, surfaceId) {
  if (!comp) return null;
  if (surfaceId && comp.faceMaterials?.[surfaceId]) {
    return comp.faceMaterials[surfaceId];
  }
  return comp.materialId || null;
}

/**
 * BoxGeometry / multi-material brush: triangle faceIndex → semantic face.
 * Three.js BoxGeometry uses 2 triangles per face in FACE_KEYS order.
 */
export function surfaceIdFromBoxFaceIndex(faceIndex) {
  const i = Math.floor(Number(faceIndex) / 2);
  if (i < 0 || i >= BOX_SURFACE_IDS.length) return null;
  return BOX_SURFACE_IDS[i];
}

/**
 * Resolve surface ID from a raycast hit using mesh userData + geometry groups.
 * @returns {string|null}
 */
export function surfaceIdFromHit(mesh, faceIndex) {
  if (!mesh) return null;
  const scheme = mesh.userData?.surfaceScheme;
  if (scheme === 'box') {
    return surfaceIdFromBoxFaceIndex(faceIndex);
  }
  const ids = mesh.userData?.surfaceIds;
  if (Array.isArray(ids) && ids.length) {
    const groups = mesh.geometry?.groups;
    if (groups?.length) {
      const tri = Number(faceIndex);
      for (const g of groups) {
        const startTri = (g.start / 3) | 0;
        const endTri = startTri + ((g.count / 3) | 0);
        if (tri >= startTri && tri < endTri) {
          return ids[g.materialIndex] || ids[0] || null;
        }
      }
    }
    // Fallback: materialIndex on face if present
    return ids[0] || null;
  }
  return null;
}

/**
 * Patch faceMaterials on a component. materialId null clears the override.
 * Returns { before, after } snapshots of faceMaterials (or null).
 */
export function patchFaceMaterial(comp, surfaceId, materialId) {
  const allowed = allowedSurfacesForComponentType(comp.type);
  if (!allowed.has(surfaceId)) {
    return null;
  }
  const before = comp.faceMaterials ? { ...comp.faceMaterials } : null;
  const next = { ...(comp.faceMaterials || {}) };
  if (!materialId) delete next[surfaceId];
  else next[surfaceId] = String(materialId);
  const after = normalizeFaceMaterials(next, allowed);
  comp.faceMaterials = after;
  return { before, after };
}

/**
 * Add BufferGeometry groups for sequential triangle batches.
 * @param {THREE.BufferGeometry} geom
 * @param {Array<{ surfaceId: string, triCount: number }>} batches
 * @returns {string[]} surfaceIds aligned to materialIndex
 */
export function applySurfaceGroups(geom, batches) {
  if (geom.clearGroups) geom.clearGroups();
  const surfaceIds = [];
  let start = 0;
  for (let i = 0; i < batches.length; i += 1) {
    const { surfaceId, triCount } = batches[i];
    const count = Math.max(0, Math.round(triCount)) * 3;
    if (count <= 0) continue;
    geom.addGroup(start, count, surfaceIds.length);
    surfaceIds.push(surfaceId);
    start += count;
  }
  return surfaceIds;
}

/** Dominant-axis box face from a local-space unit normal. */
export function boxSurfaceIdFromLocalNormal(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 'px' : 'nx';
  if (ay >= ax && ay >= az) return ny >= 0 ? 'py' : 'ny';
  return nz >= 0 ? 'pz' : 'nz';
}

/**
 * Reorder non-indexed triangle soup by semantic surface, then add groups.
 * classify(i0,i1,i2, getPos, getUv) → surfaceId
 * Mutates geom in place; returns surfaceIds array.
 */
export function regroupTrianglesBySurface(geom, surfaceOrder, classify) {
  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  const triCount = (pos.count / 3) | 0;
  const buckets = Object.fromEntries(surfaceOrder.map((id) => [id, []]));
  const getPos = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
  const getUv = (i) => (uv ? [uv.getX(i), uv.getY(i)] : [0, 0]);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = t * 3;
    const sid = classify(i0, i0 + 1, i0 + 2, getPos, getUv) || surfaceOrder[0];
    const bucket = buckets[sid] || buckets[surfaceOrder[0]];
    bucket.push(i0, i0 + 1, i0 + 2);
  }

  const newPos = [];
  const newUv = [];
  const batches = [];
  for (const sid of surfaceOrder) {
    const idxs = buckets[sid] || [];
    const tris = (idxs.length / 3) | 0;
    if (!tris) continue;
    for (const i of idxs) {
      newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (uv) newUv.push(uv.getX(i), uv.getY(i));
    }
    batches.push({ surfaceId: sid, triCount: tris });
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  if (uv) geom.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  const surfaceIds = applySurfaceGroups(geom, batches);
  geom.userData.surfaceIds = surfaceIds;
  geom.computeVertexNormals();
  return surfaceIds;
}
