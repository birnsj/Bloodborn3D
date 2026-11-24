/**
 * Phase 2E.3 — Align to Neighbor (explicit).
 *
 * Aligns a target Brush box face's faceUVs so its composed UVs match a reference
 * face at their shared contact region. Preserves local density mapping; does not
 * introduce world-space projection or triplanar mapping.
 *
 * Supported: coplanar, adjoining Brush AABB faces (incl. walls of different sizes).
 * Unsupported (rejected, no mutation): mitered/openings cut solids as unique frames,
 * curved walls, columns, arches, stairs/ramps, corners (non-coplanar), opposite faces.
 */

import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4Invert, mat4TransformPoint } from '../core/math3d.js';
import {
  BOX_SURFACE_IDS,
  cloneFaceUVs,
  getStructuralComponent,
  normalizeFaceUVs,
} from '../runtime/surfaces.js';
import {
  TEXTURE_TILE_EDITOR_UNITS,
  composeActorUv,
  composeGeometryUv,
  isIdentityUv,
  normalizeActorUv,
} from '../runtime/uvMapping.js';

const TILE = TEXTURE_TILE_EDITOR_UNITS;
const COPLANAR_DOT = 0.999;
const COPLANAR_DIST = 0.5; // editor units
const OVERLAP_EPS = 0.5;

/** Limitations documented for ROADMAP / UI status. */
export const ALIGN_LIMITATIONS = [
  'Only coplanar adjoining Brush box faces (AABB walls/floors/ceilings).',
  'Corners (non-coplanar) are not aligned.',
  'Curved walls, columns, arches, ramps, and stairs are not supported.',
  'Mitered wall prisms are rejected (non-box UV frames).',
  'Does not use automatic world-space or triplanar projection.',
];

/**
 * Local-space density UV for a point on a Brush box face (matches brushGeometry).
 * @returns {[number, number]|null}
 */
export function densityUvOnBrushFace(surfaceId, localPoint, size) {
  const sx = Math.max(1e-6, Number(size?.x) || 1);
  const sy = Math.max(1e-6, Number(size?.y) || 1);
  const sz = Math.max(1e-6, Number(size?.z) || 1);
  const { x: lx, y: ly, z: lz } = localPoint;
  switch (surfaceId) {
    case 'px':
      return [(sz * 0.5 - lz) / TILE, (ly + sy * 0.5) / TILE];
    case 'nx':
      return [(lz + sz * 0.5) / TILE, (ly + sy * 0.5) / TILE];
    case 'py':
      return [(lx + sx * 0.5) / TILE, (sz * 0.5 - lz) / TILE];
    case 'ny':
      return [(lx + sx * 0.5) / TILE, (lz + sz * 0.5) / TILE];
    case 'pz':
      return [(lx + sx * 0.5) / TILE, (ly + sy * 0.5) / TILE];
    case 'nz':
      return [(sx * 0.5 - lx) / TILE, (ly + sy * 0.5) / TILE];
    default:
      return null;
  }
}

/** Local unit normal for a box face. */
export function brushFaceLocalNormal(surfaceId) {
  switch (surfaceId) {
    case 'px': return { x: 1, y: 0, z: 0 };
    case 'nx': return { x: -1, y: 0, z: 0 };
    case 'py': return { x: 0, y: 1, z: 0 };
    case 'ny': return { x: 0, y: -1, z: 0 };
    case 'pz': return { x: 0, y: 0, z: 1 };
    case 'nz': return { x: 0, y: 0, z: -1 };
    default: return null;
  }
}

/**
 * Local face rectangle corners (editor units), matching density UV axes.
 * Order: (u0,v0), (u1,v0), (u1,v1), (u0,v1) in density-parameter space corners.
 */
export function brushFaceLocalCorners(surfaceId, size) {
  const sx = Math.max(1e-6, Number(size?.x) || 1);
  const sy = Math.max(1e-6, Number(size?.y) || 1);
  const sz = Math.max(1e-6, Number(size?.z) || 1);
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  switch (surfaceId) {
    case 'px':
      return [
        { x: hx, y: -hy, z: hz },
        { x: hx, y: -hy, z: -hz },
        { x: hx, y: hy, z: -hz },
        { x: hx, y: hy, z: hz },
      ];
    case 'nx':
      return [
        { x: -hx, y: -hy, z: -hz },
        { x: -hx, y: -hy, z: hz },
        { x: -hx, y: hy, z: hz },
        { x: -hx, y: hy, z: -hz },
      ];
    case 'py':
      return [
        { x: -hx, y: hy, z: hz },
        { x: hx, y: hy, z: hz },
        { x: hx, y: hy, z: -hz },
        { x: -hx, y: hy, z: -hz },
      ];
    case 'ny':
      return [
        { x: -hx, y: -hy, z: -hz },
        { x: hx, y: -hy, z: -hz },
        { x: hx, y: -hy, z: hz },
        { x: -hx, y: -hy, z: hz },
      ];
    case 'pz':
      return [
        { x: -hx, y: -hy, z: hz },
        { x: hx, y: -hy, z: hz },
        { x: hx, y: hy, z: hz },
        { x: -hx, y: hy, z: hz },
      ];
    case 'nz':
      return [
        { x: hx, y: -hy, z: -hz },
        { x: -hx, y: -hy, z: -hz },
        { x: -hx, y: hy, z: -hz },
        { x: hx, y: hy, z: -hz },
      ];
    default:
      return null;
  }
}

function transformDir(m, d) {
  return {
    x: m[0] * d.x + m[4] * d.y + m[8] * d.z,
    y: m[1] * d.x + m[5] * d.y + m[9] * d.z,
    z: m[2] * d.x + m[6] * d.y + m[10] * d.z,
  };
}

function normalizeVec(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function describeBrushFace(actor, world, surfaceId) {
  const brush = actor?.getComponent?.('Brush');
  if (!brush) return null;
  if (Math.abs(Number(brush.miterStart) || 0) > 0.01
    || Math.abs(Number(brush.miterEnd) || 0) > 0.01) {
    return { error: 'mitered' };
  }
  if (!BOX_SURFACE_IDS.includes(surfaceId)) return { error: 'surface' };
  const localN = brushFaceLocalNormal(surfaceId);
  const corners = brushFaceLocalCorners(surfaceId, brush.size);
  if (!localN || !corners) return { error: 'surface' };

  const worldMat = getWorldMatrix(actor, world);
  const worldCorners = corners.map((c) => mat4TransformPoint(worldMat, c));
  const worldNormal = normalizeVec(transformDir(worldMat, localN));
  const center = {
    x: (worldCorners[0].x + worldCorners[1].x + worldCorners[2].x + worldCorners[3].x) / 4,
    y: (worldCorners[0].y + worldCorners[1].y + worldCorners[2].y + worldCorners[3].y) / 4,
    z: (worldCorners[0].z + worldCorners[1].z + worldCorners[2].z + worldCorners[3].z) / 4,
  };
  // UV axes from density corner order: c0→c1 = +U, c0→c3 = +V
  const worldU = normalizeVec(sub(worldCorners[1], worldCorners[0]));
  const worldV = normalizeVec(sub(worldCorners[3], worldCorners[0]));

  return {
    actor,
    brush,
    surfaceId,
    worldMat,
    invWorld: mat4Invert(worldMat),
    worldCorners,
    worldNormal,
    worldU,
    worldV,
    center,
    actorUv: normalizeActorUv(brush.uv),
    faceUv: brush.faceUVs?.[surfaceId]
      ? normalizeActorUv(brush.faceUVs[surfaceId])
      : normalizeActorUv(),
  };
}

function projectToFace2D(face, point) {
  const d = sub(point, face.center);
  return { u: dot(d, face.worldU), v: dot(d, face.worldV) };
}

function faceRect2D(face) {
  const pts = face.worldCorners.map((c) => projectToFace2D(face, c));
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of pts) {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  return { minU, maxU, minV, maxV };
}

function rectsOverlap(a, b) {
  const ou0 = Math.max(a.minU, b.minU);
  const ou1 = Math.min(a.maxU, b.maxU);
  const ov0 = Math.max(a.minV, b.minV);
  const ov1 = Math.min(a.maxV, b.maxV);
  if (ou1 - ou0 < -OVERLAP_EPS || ov1 - ov0 < -OVERLAP_EPS) return null;
  // Touching edges count as adjoining (zero-area overlap OK within eps).
  return {
    minU: ou0,
    maxU: Math.max(ou0, ou1),
    minV: ov0,
    maxV: Math.max(ov0, ov1),
  };
}

function composedUvAtWorldPoint(face, worldPoint) {
  const local = mat4TransformPoint(face.invWorld, worldPoint);
  const density = densityUvOnBrushFace(face.surfaceId, local, face.brush.size);
  if (!density) return null;
  return composeGeometryUv(density[0], density[1], face.actorUv, face.faceUv);
}

function baseUvAtWorldPoint(face, worldPoint) {
  const local = mat4TransformPoint(face.invWorld, worldPoint);
  const density = densityUvOnBrushFace(face.surfaceId, local, face.brush.size);
  if (!density) return null;
  return composeGeometryUv(density[0], density[1], face.actorUv, null);
}

/**
 * Compute faceUV override for target so UV matches reference at the contact region.
 *
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   faceUVs?: object|null,
 *   contact?: {x:number,y:number,z:number},
 * }}
 */
export function computeAlignFaceUv(world, reference, target) {
  if (!world || !reference?.actorId || !target?.actorId) {
    return { ok: false, reason: 'Missing reference or target surface.' };
  }
  if (reference.actorId === target.actorId && reference.surfaceId === target.surfaceId) {
    return { ok: false, reason: 'Reference and target must be different surfaces.' };
  }

  const refActor = world.getActor(reference.actorId);
  const tgtActor = world.getActor(target.actorId);
  if (!refActor || !tgtActor) {
    return { ok: false, reason: 'Actor not found.' };
  }

  const refComp = getStructuralComponent(refActor);
  const tgtComp = getStructuralComponent(tgtActor);
  if (!refComp || refComp.type !== 'Brush' || !tgtComp || tgtComp.type !== 'Brush') {
    return {
      ok: false,
      reason: 'Align supports Brush box faces only (not curved/column/arch/stair/ramp).',
    };
  }

  const refFace = describeBrushFace(refActor, world, reference.surfaceId);
  const tgtFace = describeBrushFace(tgtActor, world, target.surfaceId);
  if (refFace?.error === 'mitered' || tgtFace?.error === 'mitered') {
    return { ok: false, reason: 'Mitered walls are not supported for Align to Neighbor.' };
  }
  if (!refFace || refFace.error || !tgtFace || tgtFace.error) {
    return { ok: false, reason: 'Unsupported surface for Align to Neighbor.' };
  }

  const normalDot = dot(refFace.worldNormal, tgtFace.worldNormal);
  if (normalDot < COPLANAR_DOT) {
    return {
      ok: false,
      reason: 'Surfaces are not coplanar (or face opposite / meet at a corner).',
    };
  }

  const planeDist = Math.abs(dot(sub(tgtFace.center, refFace.center), refFace.worldNormal));
  if (planeDist > COPLANAR_DIST) {
    return { ok: false, reason: 'Surfaces are not on the same plane.' };
  }

  // Project both rectangles into the reference UV plane.
  const refRect = faceRect2D(refFace);
  const tgtPts = tgtFace.worldCorners.map((c) => projectToFace2D(refFace, c));
  let tMinU = Infinity;
  let tMaxU = -Infinity;
  let tMinV = Infinity;
  let tMaxV = -Infinity;
  for (const p of tgtPts) {
    tMinU = Math.min(tMinU, p.u);
    tMaxU = Math.max(tMaxU, p.u);
    tMinV = Math.min(tMinV, p.v);
    tMaxV = Math.max(tMaxV, p.v);
  }
  const overlap = rectsOverlap(refRect, { minU: tMinU, maxU: tMaxU, minV: tMinV, maxV: tMaxV });
  if (!overlap) {
    return { ok: false, reason: 'Surfaces do not adjoin (no shared edge/overlap).' };
  }

  const contact2d = {
    u: (overlap.minU + overlap.maxU) * 0.5,
    v: (overlap.minV + overlap.maxV) * 0.5,
  };
  const contact = add(
    refFace.center,
    add(scale(refFace.worldU, contact2d.u), scale(refFace.worldV, contact2d.v)),
  );

  const refUv = composedUvAtWorldPoint(refFace, contact);
  const tgtBase = baseUvAtWorldPoint(tgtFace, contact);
  if (!refUv || !tgtBase) {
    return { ok: false, reason: 'Could not evaluate surface UVs at contact.' };
  }

  // Face layer applies after target actor UV. Choose scale/rotation so
  // density×actorT×face ≈ density×actorR×faceR (linear), then solve offset at contact.
  const faceScale = {
    x: (refFace.actorUv.scale.x * refFace.faceUv.scale.x) / (tgtFace.actorUv.scale.x || 1),
    y: (refFace.actorUv.scale.y * refFace.faceUv.scale.y) / (tgtFace.actorUv.scale.y || 1),
  };
  const faceRot = (refFace.actorUv.rotation + refFace.faceUv.rotation)
    - tgtFace.actorUv.rotation;

  const [lu, lv] = composeActorUv(tgtBase[0], tgtBase[1], {
    scale: faceScale,
    rotation: faceRot,
    offset: { x: 0, y: 0 },
  });
  const faceUv = normalizeActorUv({
    scale: faceScale,
    rotation: faceRot,
    offset: {
      x: refUv[0] - lu,
      y: refUv[1] - lv,
    },
  });

  const nextMap = { ...(tgtFace.brush.faceUVs || {}) };
  if (isIdentityUv(faceUv)) delete nextMap[target.surfaceId];
  else nextMap[target.surfaceId] = faceUv;
  const after = normalizeFaceUVs(nextMap, BOX_SURFACE_IDS);

  return {
    ok: true,
    faceUVs: after,
    contact,
    faceUv,
  };
}

/**
 * Apply align result onto the target brush (mutates). Returns before/after faceUVs.
 */
export function applyAlignFaceUv(brush, surfaceId, faceUVsAfter) {
  const before = cloneFaceUVs(brush.faceUVs);
  brush.faceUVs = faceUVsAfter ? cloneFaceUVs(faceUVsAfter) : null;
  return { before, after: cloneFaceUVs(brush.faceUVs) };
}
