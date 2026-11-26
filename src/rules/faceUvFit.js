/**
 * Per-face UV fit / scale helpers for structural brushes.
 * Density UVs are sizeEu / TEXTURE_TILE_EDITOR_UNITS, then actor + surface + material scales.
 */

import { TEXTURE_TILE_EDITOR_UNITS, normalizeActorUv } from '../runtime/uvMapping.js';

/** Common absolute surface UV scale presets. */
export const BASIC_SURFACE_UV_SCALES = Object.freeze([
  { id: '1x1', label: 'Scale 1 × 1', scale: Object.freeze({ x: 1, y: 1 }) },
  { id: '2x2', label: 'Scale 2 × 2', scale: Object.freeze({ x: 2, y: 2 }) },
  { id: '0.5x0.5', label: 'Scale ½ × ½', scale: Object.freeze({ x: 0.5, y: 0.5 }) },
]);

/**
 * Editor-unit U/V extents for an axis-aligned brush box face.
 * @returns {{ u: number, v: number } | null}
 */
export function brushFaceSizeEditorUnits(size, surfaceId) {
  const sx = Number(size?.x);
  const sy = Number(size?.y);
  const sz = Number(size?.z);
  if (![sx, sy, sz].every((n) => Number.isFinite(n) && n > 0)) return null;
  switch (surfaceId) {
    case 'px':
    case 'nx':
      return { u: sz, v: sy };
    case 'py':
    case 'ny':
      return { u: sx, v: sz };
    case 'pz':
    case 'nz':
      return { u: sx, v: sy };
    default:
      return null;
  }
}

/** Box brush semantic faces that map cleanly to size.x/y/z. */
export const BOX_FACE_IDS = Object.freeze(['px', 'nx', 'py', 'ny', 'pz', 'nz']);

/**
 * Resolve face U/V size from a structural component when possible.
 * Brush box faces and Column shaft/caps are supported.
 */
export function structuralFaceSizeEditorUnits(comp, surfaceId) {
  if (!comp || !surfaceId) return null;
  if (comp.type === 'Brush' && comp.size) {
    return brushFaceSizeEditorUnits(comp.size, surfaceId);
  }
  if (comp.type === 'Column') {
    const height = Math.max(1, Number(comp.height) || 0);
    const radius = Math.max(1, Number(comp.radius) || 0);
    const diam = radius * 2;
    // Shaft / base / capital unwrap ≈ circumference × section height.
    if (surfaceId === 'shaft' || surfaceId === 'base' || surfaceId === 'capital') {
      let sectionH = height;
      if (surfaceId === 'base') sectionH = Math.max(1, Number(comp.baseHeight) || height * 0.15);
      if (surfaceId === 'capital') sectionH = Math.max(1, Number(comp.capitalHeight) || height * 0.12);
      if (surfaceId === 'shaft') {
        const baseH = comp.baseEnabled !== false ? Math.max(0, Number(comp.baseHeight) || 0) : 0;
        const capH = comp.capitalEnabled !== false ? Math.max(0, Number(comp.capitalHeight) || 0) : 0;
        sectionH = Math.max(1, height - baseH - capH);
      }
      return { u: Math.PI * diam, v: sectionH };
    }
    if (surfaceId === 'capTop' || surfaceId === 'capBottom') {
      return { u: diam, v: diam };
    }
  }
  return null;
}

/** True when Fit Horizontal / Vertical can run for this surface. */
export function canFitSurfaceFace(comp, surfaceId) {
  return Boolean(structuralFaceSizeEditorUnits(comp, surfaceId));
}

/**
 * Surface UV scale so one material texture spans the face on the given axis.
 * Final tiles ≈ density * actorScale * surfaceScale * materialUvScale.
 *
 * @param {'u'|'v'|'both'} axis
 */
export function computeFitSurfaceUv({
  faceSizeEu,
  actorUv = {},
  materialUvScale = { x: 1, y: 1 },
  axis = 'both',
  currentSurfaceUv = null,
} = {}) {
  if (!faceSizeEu
    || !(faceSizeEu.u > 0)
    || !(faceSizeEu.v > 0)) {
    return null;
  }
  const actor = normalizeActorUv(actorUv);
  const current = normalizeActorUv(currentSurfaceUv || {});
  const matX = Number(materialUvScale?.x);
  const matY = Number(materialUvScale?.y);
  const mx = Number.isFinite(matX) && matX !== 0 ? matX : 1;
  const my = Number.isFinite(matY) && matY !== 0 ? matY : 1;

  const densityU = faceSizeEu.u / TEXTURE_TILE_EDITOR_UNITS;
  const densityV = faceSizeEu.v / TEXTURE_TILE_EDITOR_UNITS;

  const next = {
    scale: { x: current.scale.x, y: current.scale.y },
    offset: { x: 0, y: 0 },
    rotation: 0,
  };

  if (axis === 'u' || axis === 'both') {
    const denom = densityU * actor.scale.x * mx;
    next.scale.x = denom > 1e-8 ? 1 / denom : 1;
  }
  if (axis === 'v' || axis === 'both') {
    const denom = densityV * actor.scale.y * my;
    next.scale.y = denom > 1e-8 ? 1 / denom : 1;
  }
  return next;
}
