import { ensureId } from '../core/ids.js';
import { WALL_THICKNESS } from '../core/units.js';
import { sampleArchProfileY } from './archGeometry.js';

/** @typedef {'door' | 'window'} OpeningType */
/** @typedef {'rect' | 'roman' | 'gothic'} OpeningProfile */

export const OPENING_DEFAULTS = {
  door: { width: 100, height: 220, bottom: 0 },
  window: { width: 100, height: 120, bottom: 100 },
};

export const OPENING_PROFILES = ['rect', 'roman', 'gothic'];

/** Default curve segments across an arched opening width. */
export const ARCH_OPENING_SEGMENTS = 16;

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

export function isArchedOpening(opening) {
  return opening?.profile === 'roman' || opening?.profile === 'gothic';
}

/**
 * @param {'door'|'window'|'arch'|'arch-roman'|'arch-gothic'} type
 */
export function createDefaultOpening(type = 'door', partial = {}) {
  let t = 'door';
  let profile = partial.profile || 'rect';
  if (type === 'window') t = 'window';
  else if (type === 'arch' || type === 'arch-roman') {
    t = 'door';
    profile = 'roman';
  } else if (type === 'arch-gothic') {
    t = 'door';
    profile = 'gothic';
  } else if (type === 'door') {
    t = 'door';
  }

  const defaults = OPENING_DEFAULTS[t];
  const width = partial.width ?? defaults.width;
  const riseDefault = profile === 'gothic'
    ? Math.round(width * 0.85)
    : profile === 'roman'
      ? Math.round(width * 0.5)
      : 0;
  const height = partial.height ?? (
    profile === 'rect' ? defaults.height : defaults.height + riseDefault
  );
  const rise = partial.rise ?? riseDefault;

  return normalizeOpening({
    id: partial.id,
    type: t,
    profile,
    offset: partial.offset ?? 0,
    bottom: partial.bottom ?? defaults.bottom,
    width,
    height,
    rise,
    curveResolution: partial.curveResolution,
  });
}

export function normalizeOpening(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'window' ? 'window' : 'door';
  const defaults = OPENING_DEFAULTS[type];
  let profile = OPENING_PROFILES.includes(raw.profile) ? raw.profile : 'rect';
  // Legacy: type stored as arch
  if (raw.type === 'arch' || raw.type === 'arch-roman') profile = 'roman';
  if (raw.type === 'arch-gothic') profile = 'gothic';

  const width = Math.max(OPENING_MARGIN, Number(raw.width) || defaults.width);
  const height = Math.max(OPENING_MARGIN, Number(raw.height) || defaults.height);
  let rise = 0;
  if (profile !== 'rect') {
    const rawRise = Number(raw.rise);
    rise = Number.isFinite(rawRise) && rawRise > 0
      ? rawRise
      : Math.max(OPENING_MARGIN, Math.min(height * 0.95, width * 0.5));
    rise = Math.min(rise, height - OPENING_MARGIN);
  }

  return {
    id: ensureId(raw.id, 'opening'),
    type,
    profile,
    offset: Number(raw.offset) || 0,
    bottom: Number.isFinite(Number(raw.bottom)) ? Number(raw.bottom) : defaults.bottom,
    width,
    height,
    rise,
    curveResolution: Math.max(
      4,
      Math.min(48, Math.round(Number(raw.curveResolution) || ARCH_OPENING_SEGMENTS)),
    ),
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
    let rise = o.rise;
    const halfW = width * 0.5;
    const minOff = -halfL + halfW + OPENING_MARGIN;
    const maxOff = halfL - halfW - OPENING_MARGIN;
    if (minOff > maxOff) {
      width = Math.max(OPENING_MARGIN, axes.length - OPENING_MARGIN * 2);
      offset = 0;
    } else {
      offset = Math.max(minOff, Math.min(maxOff, offset));
    }
    if (bottom + height > wallH - OPENING_MARGIN) {
      height = Math.max(OPENING_MARGIN, wallH - OPENING_MARGIN - bottom);
    }
    if (o.profile !== 'rect') {
      rise = Math.min(rise, Math.max(0, height - OPENING_MARGIN));
    }
    return normalizeOpening({
      ...o,
      width: snapVal(width),
      height: snapVal(height),
      bottom: snapVal(bottom),
      offset: snapVal(offset),
      rise: o.profile !== 'rect' ? snapVal(rise) : 0,
    });
  });

  list.sort((a, b) => a.offset - b.offset);
  const accepted = [];
  for (const o of list) {
    const current = { ...o };
    if (accepted.some((other) => rectsOverlap(current, other))) {
      errors.push(`Opening ${current.id} overlaps another opening and was skipped`);
      continue;
    }
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
 * Opening AABB in wall length/height plane (from wall base). Crown = full height.
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
 * Top of the void at a length coordinate (follows arch profile when applicable).
 */
export function openingVoidYMaxAt(opening, axes, lengthMid) {
  const b = openingLocalBounds(opening, axes);
  if (!isArchedOpening(opening) || !(opening.rise > 0)) return b.yMax;
  const springY = b.yMax - opening.rise;
  const halfW = opening.width * 0.5;
  const x = lengthMid - opening.offset;
  const archType = opening.profile === 'gothic' ? 'gothic' : 'roman';
  return springY + sampleArchProfileY(x, halfW, opening.rise, archType);
}

/**
 * Build non-overlapping AABB solids for a wall with openings.
 * Arched openings use a specialized segmented lintel path (not rectangular holes).
 */
export function buildWallOpeningSolids(size, openings) {
  const axes = getWallAxes(size);
  const { openings: valid } = validateOpenings(size, openings);
  if (valid.length === 0) {
    return [{
      center: { x: 0, y: 0, z: 0 },
      size: {
        x: axes.lengthAxis === 'x' ? axes.length : axes.thickness,
        y: axes.height,
        z: axes.lengthAxis === 'x' ? axes.thickness : axes.length,
      },
      role: 'solid',
    }];
  }

  const halfL = axes.length * 0.5;
  const halfH = axes.height * 0.5;

  const sorted = [...valid].sort((a, b) => a.offset - b.offset);
  const cuts = [-halfL];
  for (const o of sorted) {
    const b = openingLocalBounds(o, axes);
    cuts.push(b.lengthMin, b.lengthMax);
    // Subdivide arched openings so lintel bottoms follow the curve.
    if (isArchedOpening(o)) {
      const segs = Math.max(4, o.curveResolution || ARCH_OPENING_SEGMENTS);
      for (let i = 1; i < segs; i += 1) {
        cuts.push(b.lengthMin + ((b.lengthMax - b.lengthMin) * i) / segs);
      }
    }
  }
  cuts.push(halfL);
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

    const covering = sorted.filter((o) => {
      const b = openingLocalBounds(o, axes);
      return mid > b.lengthMin + 1e-6 && mid < b.lengthMax - 1e-6;
    });

    if (covering.length === 0) {
      solids.push(makeSolid(axes, mid, span, 0, axes.height, 'column'));
      continue;
    }

    const yHoles = covering.map((o) => {
      const b = openingLocalBounds(o, axes);
      return {
        yMin: b.yMin,
        yMax: openingVoidYMaxAt(o, axes, mid),
      };
    }).sort((a, b) => a.yMin - b.yMin);

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
    if (len < b.lengthMin || len > b.lengthMax || point.y < b.yMin) continue;
    const yMax = openingVoidYMaxAt(o, axes, len);
    if (point.y <= yMax) return true;
  }
  return false;
}

export function openingsEqual(a, b) {
  return JSON.stringify(normalizeOpenings(a)) === JSON.stringify(normalizeOpenings(b));
}
