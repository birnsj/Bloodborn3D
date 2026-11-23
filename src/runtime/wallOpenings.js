import { ensureId } from '../core/ids.js';
import { WALL_THICKNESS } from '../core/units.js';

/** @typedef {'door' | 'window'} OpeningType */

export const OPENING_DEFAULTS = {
  door: { width: 100, height: 220, bottom: 0 },
  window: { width: 100, height: 120, bottom: 100 },
};

/** Minimum clearance from wall edges / between openings (editor units). */
export const OPENING_MARGIN = 1;

/**
 * Wall layout in local brush space (center origin).
 * lengthAxis: 'x' | 'z' — thicker horizontal axis.
 */
export function getWallAxes(size) {
  const sx = Math.max(1, Number(size?.x) || 1);
  const sy = Math.max(1, Number(size?.y) || 1);
  const sz = Math.max(1, Number(size?.z) || 1);
  const lengthAxis = sx >= sz ? 'x' : 'z';
  const thicknessAxis = lengthAxis === 'x' ? 'z' : 'x';
  return {
    lengthAxis,
    thicknessAxis,
    length: lengthAxis === 'x' ? sx : sz,
    height: sy,
    thickness: lengthAxis === 'x' ? sz : sx,
  };
}

/** True when this brush should support openings (wall tag or thin slab). */
export function isWallBrush(actorOrBrush, size = null) {
  if (actorOrBrush?.tags?.includes?.('wall')) return true;
  const brush = actorOrBrush?.getComponent?.('Brush') || actorOrBrush;
  const s = size || brush?.size;
  if (!s) return false;
  const { thickness } = getWallAxes(s);
  return thickness <= WALL_THICKNESS * 1.5;
}

export function createDefaultOpening(type = 'door', partial = {}) {
  const t = type === 'window' ? 'window' : 'door';
  const defaults = OPENING_DEFAULTS[t];
  return normalizeOpening({
    id: partial.id,
    type: t,
    offset: partial.offset ?? 0,
    bottom: partial.bottom ?? defaults.bottom,
    width: partial.width ?? defaults.width,
    height: partial.height ?? defaults.height,
  });
}

export function normalizeOpening(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'window' ? 'window' : 'door';
  const defaults = OPENING_DEFAULTS[type];
  return {
    id: ensureId(raw.id, 'opening'),
    type,
    offset: Number(raw.offset) || 0,
    bottom: Number.isFinite(Number(raw.bottom)) ? Number(raw.bottom) : defaults.bottom,
    width: Math.max(OPENING_MARGIN, Number(raw.width) || defaults.width),
    height: Math.max(OPENING_MARGIN, Number(raw.height) || defaults.height),
  };
}

export function normalizeOpenings(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map(normalizeOpening).filter(Boolean);
}

/**
 * Clamp a single opening into the wall, then resolve overlaps by shrinking later openings.
 * Returns { openings, errors } — openings are always safe to build with.
 */
export function validateOpenings(size, openings, { snap = null } = {}) {
  const axes = getWallAxes(size);
  const halfL = axes.length * 0.5;
  const wallH = axes.height;
  const errors = [];
  const snapVal = (v) => (snap && snap > 0 ? Math.round(v / snap) * snap : v);

  let list = normalizeOpenings(openings).map((o) => {
    let width = Math.min(o.width, axes.length - OPENING_MARGIN * 2);
    let height = Math.min(o.height, wallH - OPENING_MARGIN);
    let bottom = Math.max(0, Math.min(o.bottom, wallH - height - OPENING_MARGIN));
    let offset = o.offset;
    const halfW = width * 0.5;
    const minOff = -halfL + halfW + OPENING_MARGIN;
    const maxOff = halfL - halfW - OPENING_MARGIN;
    if (minOff > maxOff) {
      // Wall too small — collapse to centered tiny opening if possible
      width = Math.max(OPENING_MARGIN, axes.length - OPENING_MARGIN * 2);
      offset = 0;
    } else {
      offset = Math.max(minOff, Math.min(maxOff, offset));
    }
    if (bottom + height > wallH - OPENING_MARGIN) {
      height = Math.max(OPENING_MARGIN, wallH - OPENING_MARGIN - bottom);
    }
    return normalizeOpening({
      ...o,
      width: snapVal(width),
      height: snapVal(height),
      bottom: snapVal(bottom),
      offset: snapVal(offset),
    });
  });

  // Sort and reject overlaps along length×height plane (keep earlier openings)
  list.sort((a, b) => a.offset - b.offset);
  const accepted = [];
  for (const o of list) {
    const current = { ...o };
    if (accepted.some((other) => rectsOverlap(current, other))) {
      errors.push(`Opening ${current.id} overlaps another opening and was skipped`);
      continue;
    }
    // Final bound check
    const halfW = current.width * 0.5;
    if (
      current.offset - halfW < -halfL + OPENING_MARGIN - 0.01
      || current.offset + halfW > halfL - OPENING_MARGIN + 0.01
      || current.bottom < 0
      || current.bottom + current.height > wallH + 0.01
    ) {
      errors.push(`Opening ${current.id} is outside wall bounds and was skipped`);
      continue;
    }
    accepted.push(current);
  }

  return { openings: accepted, errors, axes };
}

function rectsOverlap(a, b) {
  const aL = a.offset - a.width * 0.5;
  const aR = a.offset + a.width * 0.5;
  const aB = a.bottom;
  const aT = a.bottom + a.height;
  const bL = b.offset - b.width * 0.5;
  const bR = b.offset + b.width * 0.5;
  const bB = b.bottom;
  const bT = b.bottom + b.height;
  const gap = OPENING_MARGIN;
  return aL < bR - gap && aR > bL + gap && aB < bT - gap && aT > bB + gap;
}

/**
 * Opening rectangle in wall length/height plane (from wall base).
 */
export function openingLocalBounds(opening, axes) {
  const halfW = opening.width * 0.5;
  return {
    lengthMin: opening.offset - halfW,
    lengthMax: opening.offset + halfW,
    yMin: -axes.height * 0.5 + opening.bottom,
    yMax: -axes.height * 0.5 + opening.bottom + opening.height,
  };
}

/**
 * Build non-overlapping AABB solids for a wall with openings.
 * Returns [{ center: {x,y,z}, size: {x,y,z}, role }] in local brush editor units.
 */
export function buildWallOpeningSolids(size, openings) {
  const axes = getWallAxes(size);
  const { openings: valid } = validateOpenings(size, openings);
  if (valid.length === 0) {
    return [{
      center: { x: 0, y: 0, z: 0 },
      size: { x: axes.lengthAxis === 'x' ? axes.length : axes.thickness, y: axes.height, z: axes.lengthAxis === 'x' ? axes.thickness : axes.length },
      role: 'solid',
    }];
  }

  const halfL = axes.length * 0.5;
  const halfH = axes.height * 0.5;

  // Collect length intervals that are open (holes) at any height — we partition length
  // into atomic spans, then for hole spans emit sill/lintel only.
  const sorted = [...valid].sort((a, b) => a.offset - b.offset);
  const cuts = [-halfL];
  for (const o of sorted) {
    const b = openingLocalBounds(o, axes);
    cuts.push(b.lengthMin, b.lengthMax);
  }
  cuts.push(halfL);
  // Unique sorted cuts
  const uniq = [];
  for (const c of cuts.sort((a, b) => a - b)) {
    if (uniq.length === 0 || Math.abs(c - uniq[uniq.length - 1]) > 1e-6) uniq.push(c);
  }

  const solids = [];

  for (let i = 0; i < uniq.length - 1; i += 1) {
    const l0 = uniq[i];
    const l1 = uniq[i + 1];
    const span = l1 - l0;
    if (span < 1e-6) continue;
    const mid = (l0 + l1) * 0.5;

    // Openings that cover this length span (interior of span)
    const covering = sorted.filter((o) => {
      const b = openingLocalBounds(o, axes);
      return mid > b.lengthMin + 1e-6 && mid < b.lengthMax - 1e-6;
    });

    if (covering.length === 0) {
      // Full-height column
      solids.push(makeSolid(axes, mid, span, 0, axes.height, 'column'));
      continue;
    }

    // Merge covering openings' vertical holes for this span (usually one)
    const yHoles = covering.map((o) => {
      const b = openingLocalBounds(o, axes);
      return { yMin: b.yMin, yMax: b.yMax };
    }).sort((a, b) => a.yMin - b.yMin);

    // Vertical solid regions outside holes within [-halfH, halfH]
    let cursor = -halfH;
    for (const hole of yHoles) {
      if (hole.yMin > cursor + 1e-6) {
        const h = hole.yMin - cursor;
        const cy = cursor + h * 0.5;
        solids.push(makeSolid(axes, mid, span, cy, h, cursor <= -halfH + 1e-4 ? 'sill' : 'filler'));
      }
      cursor = Math.max(cursor, hole.yMax);
    }
    if (cursor < halfH - 1e-6) {
      const h = halfH - cursor;
      const cy = cursor + h * 0.5;
      solids.push(makeSolid(axes, mid, span, cy, h, 'lintel'));
    }
  }

  // Fix roles: bottom piece under a hole is sill; top is lintel; rename first/last columns
  return solids.filter((s) => s.size.x >= 1e-4 && s.size.y >= 1e-4 && s.size.z >= 1e-4);

  function makeSolid(ax, lengthMid, lengthSpan, yCenter, ySize, role) {
    const center = { x: 0, y: yCenter, z: 0 };
    const sz = { x: ax.thickness, y: ySize, z: ax.thickness };
    if (ax.lengthAxis === 'x') {
      center.x = lengthMid;
      center.z = 0;
      sz.x = lengthSpan;
      sz.z = ax.thickness;
    } else {
      center.z = lengthMid;
      center.x = 0;
      sz.z = lengthSpan;
      sz.x = ax.thickness;
    }
    return { center, size: sz, role };
  }
}

/** True if a local point (editor units, brush space) lies inside any opening volume. */
export function pointInOpening(size, openings, point) {
  const axes = getWallAxes(size);
  const { openings: valid } = validateOpenings(size, openings);
  const len = axes.lengthAxis === 'x' ? point.x : point.z;
  const thick = axes.thicknessAxis === 'x' ? point.x : point.z;
  if (Math.abs(thick) > axes.thickness * 0.5 + 1e-6) return false;
  for (const o of valid) {
    const b = openingLocalBounds(o, axes);
    if (len >= b.lengthMin && len <= b.lengthMax && point.y >= b.yMin && point.y <= b.yMax) {
      return true;
    }
  }
  return false;
}

export function openingsEqual(a, b) {
  return JSON.stringify(normalizeOpenings(a)) === JSON.stringify(normalizeOpenings(b));
}
