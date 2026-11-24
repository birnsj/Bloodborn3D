/**
 * Structural UV composition (Phase 2E.0 / 2E.2).
 *
 * Layer 1 — Geometry / actor / surface:
 *   densityUVs = surfaceSizeEditorUnits / TEXTURE_TILE_EDITOR_UNITS
 *   then actor transform: scale → rotation → offset
 *   then optional per-surface transform (faceUVs[surfaceId]): same order
 *
 * Layer 2 — Material asset (applied in materialFactory on texture.repeat/offset/rotation):
 *   MaterialDefinition.uvScale / uvOffset / uvRotation
 *
 * Final sample ≈ materialTransform(surfaceTransform(actorTransform(densityUv))).
 * Identity on any layer is a no-op so existing authored materials and levels keep their look.
 */

import { EDITOR_UNITS_PER_METER } from '../core/units.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';

export const TEXTURE_TILE_EDITOR_UNITS = EDITOR_UNITS_PER_METER;

/**
 * @param {object} [uv]
 * @returns {{ scale: {x:number,y:number}, offset: {x:number,y:number}, rotation: number }}
 */
export function normalizeActorUv(uv = {}) {
  return {
    scale: {
      x: Number(uv?.scale?.x) || 1,
      y: Number(uv?.scale?.y) || 1,
    },
    offset: {
      x: Number(uv?.offset?.x) || 0,
      y: Number(uv?.offset?.y) || 0,
    },
    rotation: Number(uv?.rotation) || 0,
  };
}

/** True when scale is 1, offset 0, rotation 0 (no visual change). */
export function isIdentityUv(uv = {}) {
  const n = normalizeActorUv(uv);
  return n.scale.x === 1
    && n.scale.y === 1
    && n.offset.x === 0
    && n.offset.y === 0
    && n.rotation === 0;
}

/**
 * Apply actor-level UV transform to a density-tiled (u, v) pair.
 * Order matches brushGeometry: scale → rotate → offset.
 *
 * @param {number} u
 * @param {number} v
 * @param {object} [uv]
 * @returns {[number, number]}
 */
export function composeActorUv(u, v, uv = {}) {
  const n = normalizeActorUv(uv);
  let ou = u * n.scale.x;
  let ov = v * n.scale.y;
  if (n.rotation) {
    const rad = (n.rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const ru = ou * c - ov * s;
    const rv = ou * s + ov * c;
    ou = ru;
    ov = rv;
  }
  return [ou + n.offset.x, ov + n.offset.y];
}

/**
 * Density → actor UV → optional surface UV (Phase 2E.2).
 * Missing / identity surface UV leaves actor result unchanged.
 */
export function composeGeometryUv(u, v, actorUv = {}, surfaceUv = null) {
  const [au, av] = composeActorUv(u, v, actorUv);
  if (!surfaceUv || isIdentityUv(surfaceUv)) return [au, av];
  return composeActorUv(au, av, surfaceUv);
}

/**
 * Density-tile an editor-unit length, then apply actor UV.
 * @param {number} editorUnits
 * @param {'u'|'v'} axis
 * @param {object} [uv]
 */
export function tileAndCompose(editorUnits, axis, uv = {}) {
  const density = editorUnits / TEXTURE_TILE_EDITOR_UNITS;
  if (axis === 'v') return composeActorUv(0, density, uv)[1];
  return composeActorUv(density, 0, uv)[0];
}

/**
 * Mutate a UV Float32BufferAttribute (or {array,count}) in place with actor transform.
 * Assumes attribute already holds density-tiled UVs (scale 1, no offset/rotation).
 */
export function applyActorUvToAttribute(uvAttr, uv = {}) {
  if (!uvAttr || isIdentityUv(uv)) return;
  const n = normalizeActorUv(uv);
  const count = uvAttr.count;
  for (let i = 0; i < count; i += 1) {
    const [u, v] = composeActorUv(uvAttr.getX(i), uvAttr.getY(i), n);
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Map a flat [u,v,u,v,...] density array through actor UV (and optional per-vertex surface UV).
 * @param {number[]} flatUv
 * @param {object} [uv] actor UV
 * @param {object|null} [faceUVs] surfaceId → UV override
 * @param {string[]|null} [surfaceIdPerVertex] one id per UV pair
 */
export function mapDensityUvArray(flatUv, uv = {}, faceUVs = null, surfaceIdPerVertex = null) {
  const out = new Array(flatUv.length);
  const useSurface = Boolean(faceUVs && surfaceIdPerVertex);
  for (let i = 0; i < flatUv.length; i += 2) {
    const vert = i / 2;
    const surfaceUv = useSurface ? faceUVs[surfaceIdPerVertex[vert]] : null;
    const [u, v] = composeGeometryUv(flatUv[i], flatUv[i + 1], uv, surfaceUv);
    out[i] = u;
    out[i + 1] = v;
  }
  return out;
}

function faceUvMapHasOverrides(faceUVs) {
  if (!faceUVs || typeof faceUVs !== 'object') return false;
  for (const value of Object.values(faceUVs)) {
    if (value && !isIdentityUv(value)) return true;
  }
  return false;
}

/**
 * Apply per-surface UV overrides onto geometry that already has density + actor UV baked.
 * Identity / missing faceUVs are a no-op (preserves existing visuals).
 *
 * @param {import('three').BufferGeometry} geom
 * @param {object|null} faceUVs
 * @param {{ scheme?: 'box'|'grouped', surfaceIds?: string[] }} [options]
 */
export function applyFaceUvsToGeometry(geom, faceUVs, options = {}) {
  if (!geom?.attributes?.uv || !faceUvMapHasOverrides(faceUVs)) return geom;
  const uvAttr = geom.attributes.uv;
  const scheme = options.scheme
    || (geom.userData?.surfaceIds || options.surfaceIds ? 'grouped' : 'box');

  if (scheme === 'box') {
    for (let face = 0; face < FACE_KEYS.length; face += 1) {
      const suv = faceUVs[FACE_KEYS[face]];
      if (!suv || isIdentityUv(suv)) continue;
      const n = normalizeActorUv(suv);
      for (let i = 0; i < 4; i += 1) {
        const idx = face * 4 + i;
        if (idx >= uvAttr.count) break;
        const [u, v] = composeActorUv(uvAttr.getX(idx), uvAttr.getY(idx), n);
        uvAttr.setXY(idx, u, v);
      }
    }
  } else {
    const surfaceIds = options.surfaceIds || geom.userData?.surfaceIds || [];
    const groups = geom.groups;
    if (!groups?.length || !surfaceIds.length) return geom;
    const index = geom.index;
    for (const g of groups) {
      const sid = surfaceIds[g.materialIndex];
      const suv = sid ? faceUVs[sid] : null;
      if (!suv || isIdentityUv(suv)) continue;
      const n = normalizeActorUv(suv);
      const end = g.start + g.count;
      if (index) {
        for (let i = g.start; i < end; i += 1) {
          const vi = index.getX(i);
          const [u, v] = composeActorUv(uvAttr.getX(vi), uvAttr.getY(vi), n);
          uvAttr.setXY(vi, u, v);
        }
      } else {
        for (let vi = g.start; vi < end; vi += 1) {
          const [u, v] = composeActorUv(uvAttr.getX(vi), uvAttr.getY(vi), n);
          uvAttr.setXY(vi, u, v);
        }
      }
    }
  }
  uvAttr.needsUpdate = true;
  return geom;
}
