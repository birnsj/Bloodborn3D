import { snapToGrid } from '../../core/units.js';

/** Surface classes for placement filtering. */
export const SURFACE_KIND = {
  support: 'support', // floors, tabletops, shelves (upward normal)
  wall: 'wall',
  ceiling: 'ceiling', // downward / ceiling-tagged
  other: 'other',
};

/**
 * Classify a world hit by normal + actor metadata.
 * @param {{ normal:{x:number,y:number,z:number}, actorId?:string|null, brushKind?:string|null, tags?:string[] }} hit
 */
export function classifySurface(hit) {
  const ny = hit?.normal?.y ?? 0;
  const tags = hit?.tags || [];
  const brushKind = hit?.brushKind || null;
  const taggedCeiling = brushKind === 'ceiling' || tags.includes('ceiling');
  const taggedFloor = brushKind === 'floor' || tags.includes('floor');
  const taggedWall = brushKind === 'wall' || tags.includes('wall');

  if (taggedCeiling || ny < -0.55) return SURFACE_KIND.ceiling;
  if (taggedWall || Math.abs(ny) <= 0.45) return SURFACE_KIND.wall;
  if (taggedFloor || ny > 0.45) return SURFACE_KIND.support;
  return SURFACE_KIND.other;
}

/**
 * Whether a surface is eligible for a placement mode.
 * @param {'footprint'|'upright'|'wall'|'free'} placement
 * @param {string} surfaceKind
 */
export function isSurfaceEligible(placement, surfaceKind) {
  if (placement === 'free') return true;
  if (placement === 'wall') return surfaceKind === SURFACE_KIND.wall;
  if (placement === 'upright' || placement === 'footprint') {
    return surfaceKind === SURFACE_KIND.support || surfaceKind === SURFACE_KIND.other;
  }
  return true;
}

/**
 * Filter and rank world hits for interior-aware placement.
 * Skips obstructing ceiling undersides so interior supports (tables, floors) win.
 *
 * @param {Array<object>} hits - from SceneView.pickWorldHits (nearest first)
 * @param {{ placement?: string, includeCeilings?: boolean, candidateIndex?: number }} opts
 * @returns {{ hit: object|null, candidates: object[], index: number }}
 */
export function selectPlacementHit(hits, opts = {}) {
  const placement = opts.placement || 'upright';
  const includeCeilings = Boolean(opts.includeCeilings);
  const raw = Array.isArray(hits) ? hits : [];

  const annotated = raw.map((h) => ({
    ...h,
    surfaceKind: classifySurface(h),
  }));

  let candidates = annotated.filter((h) => {
    if (h.locked) return false;
    if (h.visible === false) return false;
    if (h.editorOnly && !h.placeable) return false;
    // Default: skip ceiling undersides for upright/footprint interior placement.
    if (
      !includeCeilings
      && (placement === 'upright' || placement === 'footprint')
      && h.surfaceKind === SURFACE_KIND.ceiling
    ) {
      return false;
    }
    return isSurfaceEligible(placement, h.surfaceKind);
  });

  // Free / directional: any visible non-locked hit, still prefer non-ceiling.
  if (placement === 'free' && candidates.length === 0) {
    candidates = annotated.filter((h) => !h.locked && h.visible !== false);
  }

  if (candidates.length === 0) {
    return { hit: null, candidates: [], index: 0 };
  }

  // Prefer nearer support surfaces; already sorted by distance from raycaster.
  const index = ((opts.candidateIndex || 0) % candidates.length + candidates.length)
    % candidates.length;
  return { hit: candidates[index], candidates, index };
}

/**
 * Snap placement position for props: XZ to grid when enabled; keep surface Y.
 */
export function snapPlacementPosition(position, {
  gridSize = 25,
  gridSnap = true,
  snapY = false,
} = {}) {
  if (!gridSnap || !gridSize || gridSize <= 0) {
    return { ...position };
  }
  return {
    x: snapToGrid(position.x, gridSize),
    y: snapY ? snapToGrid(position.y, gridSize) : position.y,
    z: snapToGrid(position.z, gridSize),
  };
}

/**
 * Offset a contact point along the surface normal so the actor rests on top
 * rather than embedding (pivot assumed at actor origin / bottom-ish for props).
 *
 * @param {{x:number,y:number,z:number}} point editor units
 * @param {{x:number,y:number,z:number}} normal unit normal
 * @param {number} clearance editor units along normal
 */
export function offsetAlongNormal(point, normal, clearance = 0) {
  const n = normal || { x: 0, y: 1, z: 0 };
  return {
    x: point.x + n.x * clearance,
    y: point.y + n.y * clearance,
    z: point.z + n.z * clearance,
  };
}

/**
 * Compute final place pose for a tool given a selected hit.
 */
export function computePlacePose(hit, {
  placement = 'upright',
  gridSize = 25,
  gridSnap = true,
  halfHeight = 0,
  lightLift = 40,
} = {}) {
  if (!hit?.point) {
    return { valid: false, position: null, rotation: null, reason: 'No surface' };
  }

  const normal = hit.normal || { x: 0, y: 1, z: 0 };
  let clearance = halfHeight;
  if (placement === 'upright' || placement === 'footprint') {
    clearance = Math.max(halfHeight, 0);
  } else if (placement === 'wall') {
    clearance = Math.max(halfHeight, 5);
  }

  let position = offsetAlongNormal(hit.point, normal, clearance);

  // Lights sit slightly above support surfaces.
  if (placement === 'upright' && lightLift > 0 && halfHeight === 0) {
    position = offsetAlongNormal(position, { x: 0, y: 1, z: 0 }, lightLift);
  }

  position = snapPlacementPosition(position, {
    gridSize,
    gridSnap,
    // Structural footprint bases may snap Y; props keep surface elevation.
    snapY: placement === 'footprint' || placement === 'free',
  });

  let rotation = { x: 0, y: 0, z: 0 };
  if (placement === 'wall') {
    // Yaw toward wall normal (flat against wall); keep upright.
    const yaw = Math.atan2(normal.x, normal.z) * (180 / Math.PI);
    rotation = { x: 0, y: yaw, z: 0 };
  }

  return {
    valid: true,
    position,
    rotation,
    surfaceKind: hit.surfaceKind || classifySurface(hit),
    actorId: hit.actorId || null,
    normal,
  };
}

/**
 * Default footprint (min/max) for dropping a structural tool without drag-to-size.
 */
export function defaultFootprintAt(kind, center, gridSize = 25) {
  const g = Math.max(1, gridSize);
  const cx = center.x;
  const cy = center.y ?? 0;
  const cz = center.z;
  const half = Math.max(g * 2, 50);

  if (kind === 'wall') {
    return {
      min: { x: cx - g / 2, y: cy, z: cz - half },
      max: { x: cx + g / 2, y: cy, z: cz + half },
    };
  }
  if (kind === 'floor' || kind === 'ceiling') {
    return {
      min: { x: cx - half, y: cy, z: cz - half },
      max: { x: cx + half, y: cy, z: cz + half },
    };
  }
  if (kind === 'ramp' || kind === 'stair') {
    return {
      min: { x: cx - half * 0.6, y: cy, z: cz - half },
      max: { x: cx + half * 0.6, y: cy, z: cz + half },
    };
  }
  // box / subtract
  return {
    min: { x: cx - half * 0.5, y: cy, z: cz - half * 0.5 },
    max: { x: cx + half * 0.5, y: cy + g, z: cz + half * 0.5 },
  };
}

/**
 * Rough overlap test: placed AABB vs solid brush AABBs (excluding support actor).
 * Returns true when clearly embedded (center inside another solid).
 */
export function isEmbeddedInSolids(position, solids, {
  supportActorId = null,
  epsilon = 2,
} = {}) {
  if (!position || !Array.isArray(solids)) return false;
  for (const s of solids) {
    if (!s || s.actorId === supportActorId) continue;
    if (s.operation === 'subtract') continue;
    if (!s.collidable && s.kind === 'mesh') continue;
    const { min, max } = s;
    if (
      position.x > min.x + epsilon
      && position.x < max.x - epsilon
      && position.y > min.y + epsilon
      && position.y < max.y - epsilon
      && position.z > min.z + epsilon
      && position.z < max.z - epsilon
    ) {
      return true;
    }
  }
  return false;
}
