/**
 * Structural UV composition (Phase 2E.0).
 *
 * Layer 1 — Geometry / actor:
 *   densityUVs = surfaceSizeEditorUnits / TEXTURE_TILE_EDITOR_UNITS
 *   then actor transform: scale → rotation (deg, around 0.5? NO — around origin like brushGeometry) → offset
 *
 * Layer 2 — Material asset (applied in materialFactory on texture.repeat/offset/rotation):
 *   MaterialDefinition.uvScale / uvOffset / uvRotation
 *
 * Final sample ≈ materialTransform(geometryUv). Identity on either layer is a no-op so
 * existing authored materials (uvScale 1, offset 0, rotation 0) keep their look.
 */

import { EDITOR_UNITS_PER_METER } from '../core/units.js';

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
  const n = normalizeActorUv(uv);
  const identity = n.scale.x === 1 && n.scale.y === 1 && n.offset.x === 0 && n.offset.y === 0 && n.rotation === 0;
  if (identity || !uvAttr) return;
  const count = uvAttr.count;
  for (let i = 0; i < count; i += 1) {
    const [u, v] = composeActorUv(uvAttr.getX(i), uvAttr.getY(i), n);
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Map a flat [u,v,u,v,...] density array through actor UV; returns new array.
 */
export function mapDensityUvArray(flatUv, uv = {}) {
  const out = new Array(flatUv.length);
  for (let i = 0; i < flatUv.length; i += 2) {
    const [u, v] = composeActorUv(flatUv[i], flatUv[i + 1], uv);
    out[i] = u;
    out[i + 1] = v;
  }
  return out;
}
