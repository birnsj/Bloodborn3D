/**
 * Wall endpoint queries, miter math, and snap helpers for straight brushes
 * and curved walls. Actors remain independent — joins only set pose + miter fields.
 */

import { getWorldTransform } from '../core/hierarchy.js';
import { getWallAxes, isWallBrush } from './wallOpenings.js';
import { getCurvedWallLocalEndpoints } from './curvedWallGeometry.js';
import { WALL_THICKNESS } from '../core/units.js';

export const WALL_ENDPOINT_SNAP_DIST = 40; // editor units (~0.4 m)

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function radToDeg(r) {
  return (r * 180) / Math.PI;
}

function normalizeDeg(d) {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function rotateYaw(vec, yawDeg) {
  const a = degToRad(yawDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    x: vec.x * c - vec.z * s,
    y: vec.y,
    z: vec.x * s + vec.z * c,
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function lenXZ(v) {
  return Math.hypot(v.x, v.z);
}

function normXZ(v) {
  const l = lenXZ(v) || 1;
  return { x: v.x / l, y: 0, z: v.z / l };
}

function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Straight wall endpoints in world space.
 * Local: length along ±lengthAxis/2, thickness along thicknessAxis.
 */
export function getStraightWallEndpoints(actor, world = null) {
  if (!isWallBrush(actor)) return null;
  const brush = actor.getComponent('Brush');
  if (!brush || brush.operation === 'subtract') return null;
  const axes = getWallAxes(brush.size);
  const wt = getWorldTransform(actor, world || actor.world);
  const yaw = wt.rotation?.y || 0;
  const halfL = axes.length * 0.5;
  const halfT = axes.thickness * 0.5;
  const halfH = axes.height * 0.5;

  const along = axes.lengthAxis === 'x'
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 0, z: 1 };
  const out = axes.thicknessAxis === 'x'
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 0, z: 1 };

  const worldAlong = normXZ(rotateYaw(along, yaw));
  const worldOut = normXZ(rotateYaw(out, yaw));

  const center = { ...wt.position };
  const startPos = add(center, scale(worldAlong, -halfL));
  const endPos = add(center, scale(worldAlong, halfL));

  return {
    kind: 'straight',
    actorId: actor.id,
    thickness: axes.thickness,
    height: axes.height,
    start: {
      id: 'start',
      position: startPos,
      tangent: worldAlong,
      outwardNormal: worldOut,
      halfThickness: halfT,
      halfHeight: halfH,
    },
    end: {
      id: 'end',
      position: endPos,
      tangent: worldAlong,
      outwardNormal: worldOut,
      halfThickness: halfT,
      halfHeight: halfH,
    },
  };
}

export function getCurvedWallWorldEndpoints(actor, world = null) {
  const wall = actor.getComponent('CurvedWall');
  if (!wall) return null;
  const local = getCurvedWallLocalEndpoints(wall);
  const wt = getWorldTransform(actor, world || actor.world);
  const yaw = wt.rotation?.y || 0;
  const mapEnd = (ep) => {
    const rotated = rotateYaw(ep.position, yaw);
    return {
      id: ep.id,
      position: add(wt.position, rotated),
      tangent: normXZ(rotateYaw(ep.tangent, yaw)),
      outwardNormal: normXZ(rotateYaw(ep.outwardNormal, yaw)),
      halfThickness: ep.halfThickness,
      halfHeight: ep.halfHeight,
    };
  };
  return {
    kind: 'curved',
    actorId: actor.id,
    thickness: wall.thickness,
    height: wall.height,
    start: mapEnd(local.start),
    end: mapEnd(local.end),
  };
}

export function getWallEndpoints(actor, world = null) {
  if (actor.getComponent('CurvedWall')) return getCurvedWallWorldEndpoints(actor, world);
  return getStraightWallEndpoints(actor, world);
}

/**
 * Collect all wall endpoints in the world (straight + curved).
 */
export function collectWorldWallEndpoints(world, { excludeActorId = null } = {}) {
  const out = [];
  for (const actor of world.actors) {
    if (excludeActorId && actor.id === excludeActorId) continue;
    const eps = getWallEndpoints(actor, world);
    if (!eps) continue;
    out.push({ actor, endpoints: eps, end: eps.start });
    out.push({ actor, endpoints: eps, end: eps.end });
  }
  return out;
}

/**
 * Find nearest wall endpoint within maxDist (XZ).
 */
export function findNearestWallEndpoint(world, point, {
  excludeActorId = null,
  maxDist = WALL_ENDPOINT_SNAP_DIST,
} = {}) {
  let best = null;
  let bestD = maxDist;
  for (const entry of collectWorldWallEndpoints(world, { excludeActorId })) {
    const d = distXZ(point, entry.end.position);
    if (d <= bestD) {
      bestD = d;
      best = { ...entry, distance: d };
    }
  }
  return best;
}

/**
 * Half-angle (degrees) for a miter between two wall tangents meeting at a corner.
 * Returns 0 for parallel / degenerate.
 */
export function computeMiterHalfAngleDeg(tangentA, tangentB) {
  const a = normXZ(tangentA);
  const b = normXZ(tangentB);
  // Interior turn: angle between -A (incoming) and B (outgoing) depends on which ends meet.
  // Caller should pass tangents pointing away from the shared corner along each wall.
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z));
  const ang = radToDeg(Math.acos(dot));
  // Meeting ends: if both tangents point away from corner, exterior angle relates to 180-ang.
  const turn = 180 - ang;
  if (turn < 1 || turn > 179) return 0;
  return turn * 0.5;
}

/**
 * Tangents pointing away from a shared corner for two meeting ends.
 */
export function outwardTangentsAtJoin(endA, endB) {
  // end.tangent for straight walls points along start→end.
  // If we joined A's start, outward along wall is -tangent; if A's end, +tangent.
  return { a: endA._outwardTangent, b: endB._outwardTangent };
}

function outwardTangentFor(endpoints, endId) {
  const t = endpoints[endId].tangent;
  return endId === 'start' ? scale(t, -1) : { ...t };
}

/**
 * Compute world position for a straight wall center so the given end sits at targetPos.
 */
export function straightWallCenterForEndAt(actor, endId, targetPos, world = null) {
  const eps = getStraightWallEndpoints(actor, world);
  if (!eps) return null;
  const brush = actor.getComponent('Brush');
  const axes = getWallAxes(brush.size);
  const halfL = axes.length * 0.5;
  const along = endId === 'start' ? scale(eps.start.tangent, 1) : scale(eps.end.tangent, 1);
  // Center = endPos + along * halfL for start; endPos - along * halfL for end
  // start is at center - along*halfL, so center = start + along*halfL
  // end is at center + along*halfL, so center = end - along*halfL
  if (endId === 'start') {
    return {
      x: targetPos.x + along.x * halfL,
      y: targetPos.y,
      z: targetPos.z + along.z * halfL,
    };
  }
  return {
    x: targetPos.x - along.x * halfL,
    y: targetPos.y,
    z: targetPos.z - along.z * halfL,
  };
}

/**
 * Yaw degrees so a straight wall's length axis aligns with `dir` (XZ).
 * Accounts for whether the brush length is along local X or Z.
 */
export function yawForStraightWallDirection(actor, dir) {
  const brush = actor.getComponent('Brush');
  if (!brush) return 0;
  const axes = getWallAxes(brush.size);
  const n = normXZ(dir);
  // Local along for lengthAxis x is +X (yaw 0 maps local +X to world +X → need yaw so +X → dir)
  // Our rotateYaw: local (1,0,0) → (c, 0, s) with yaw; local (0,0,1) → (-s, 0, c)
  // For length along X: want (c,s) = (n.x, n.z) → yaw = atan2(n.z, n.x)? 
  // rotateYaw({1,0,0}, yaw) = (cos, 0, sin) — so yaw = atan2(n.z, n.x)
  if (axes.lengthAxis === 'x') {
    return radToDeg(Math.atan2(n.z, n.x));
  }
  // length along Z: rotateYaw({0,0,1}, yaw) = (-sin, 0, cos) = n → cos=n.z, -sin=n.x → yaw = atan2(-n.x, n.z)
  return radToDeg(Math.atan2(-n.x, n.z));
}

/**
 * Apply endpoint snap: move `moving` so movingEnd coincides with targetEnd,
 * optionally reorient to target tangent, and set complementary miters.
 *
 * Returns { position, rotation, miterMoving, miterTarget, miterHalf } patches (not applied).
 */
export function planWallEndpointJoin({
  movingActor,
  movingEndId,
  targetActor,
  targetEndId,
  world = null,
  orient = false,
  applyMiter = true,
} = {}) {
  const movingEps = getWallEndpoints(movingActor, world);
  const targetEps = getWallEndpoints(targetActor, world);
  if (!movingEps || !targetEps) return null;

  const targetEnd = targetEps[targetEndId];
  const movingEnd = movingEps[movingEndId];
  if (!targetEnd || !movingEnd) return null;

  const result = {
    movingActorId: movingActor.id,
    targetActorId: targetActor.id,
    movingEndId,
    targetEndId,
    position: null,
    rotation: null,
    miterMoving: 0,
    miterTarget: 0,
  };

  // Orientation (straight walls only)
  let movingForCenter = movingActor;
  if (orient && movingEps.kind === 'straight' && targetEps.kind === 'curved') {
    // Align straight wall along curved-wall tangent at the join.
    const yaw = yawForStraightWallDirection(movingActor, targetEnd.tangent);
    result.rotation = {
      x: movingActor.transform.rotation.x,
      y: yaw,
      z: movingActor.transform.rotation.z,
    };
  } else if (orient && movingEps.kind === 'straight' && targetEps.kind === 'straight') {
    // Keep moving wall's current direction — only snap position (angled junctions).
  }

  // Recompute endpoints if we planned a rotation (use temporary yaw for center math)
  const wt = getWorldTransform(movingActor, world);
  const yaw = result.rotation?.y ?? wt.rotation?.y ?? 0;

  if (movingEps.kind === 'straight') {
    // Build center so moving end sits on target end position.
    // Use oriented tangent.
    const brush = movingActor.getComponent('Brush');
    const axes = getWallAxes(brush.size);
    const halfL = axes.length * 0.5;
    const alongLocal = axes.lengthAxis === 'x'
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 0, z: 1 };
    const along = normXZ(rotateYaw(alongLocal, yaw));
    if (movingEndId === 'start') {
      result.position = {
        x: targetEnd.position.x + along.x * halfL,
        y: wt.position.y,
        z: targetEnd.position.z + along.z * halfL,
      };
    } else {
      result.position = {
        x: targetEnd.position.x - along.x * halfL,
        y: wt.position.y,
        z: targetEnd.position.z - along.z * halfL,
      };
    }
  } else if (movingEps.kind === 'curved') {
    // Move curved wall so its local endpoint maps onto target.
    const local = getCurvedWallLocalEndpoints(movingActor.getComponent('CurvedWall'));
    const localEp = local[movingEndId];
    const rotated = rotateYaw(localEp.position, yaw);
    result.position = {
      x: targetEnd.position.x - rotated.x,
      y: wt.position.y,
      z: targetEnd.position.z - rotated.z,
    };
  }

  if (applyMiter) {
    const outM = outwardTangentFor(movingEps, movingEndId);
    const outT = outwardTangentFor(targetEps, targetEndId);
    // If we reoriented moving, recompute outward
    let outMoving = outM;
    if (result.rotation && movingEps.kind === 'straight') {
      const brush = movingActor.getComponent('Brush');
      const axes = getWallAxes(brush.size);
      const alongLocal = axes.lengthAxis === 'x'
        ? { x: 1, y: 0, z: 0 }
        : { x: 0, y: 0, z: 1 };
      const along = normXZ(rotateYaw(alongLocal, result.rotation.y));
      outMoving = movingEndId === 'start' ? scale(along, -1) : along;
    }
    const half = computeMiterHalfAngleDeg(outMoving, outT);
    result.miterMoving = applyMiter ? half : 0;
    result.miterTarget = applyMiter ? half : 0;
    result.miterHalf = half;
  }

  void movingForCenter;
  void normalizeDeg;
  void WALL_THICKNESS;
  void sub;
  return result;
}

/**
 * Footprint polygon (4 corners in local XZ at y=0) for a mitered straight wall.
 * Length along ±L/2, thickness ±T/2. Miters shift the end edge along length.
 */
export function getMiteredWallFootprint(size, miterStartDeg = 0, miterEndDeg = 0) {
  const axes = getWallAxes(size);
  const halfL = axes.length * 0.5;
  const halfT = axes.thickness * 0.5;
  const mS = Math.tan(degToRad(Math.max(-80, Math.min(80, miterStartDeg)))) * halfT;
  const mE = Math.tan(degToRad(Math.max(-80, Math.min(80, miterEndDeg)))) * halfT;

  // Corners in length/thickness plane: start-inner, start-outer, end-outer, end-inner
  // Positive thickness = +thicknessAxis
  const corners = [
    { l: -halfL + mS, t: -halfT }, // start −T
    { l: -halfL - mS, t: halfT }, // start +T
    { l: halfL + mE, t: halfT }, // end +T
    { l: halfL - mE, t: -halfT }, // end −T
  ];

  return corners.map((c) => {
    const p = { x: 0, y: 0, z: 0 };
    p[axes.lengthAxis] = c.l;
    p[axes.thicknessAxis] = c.t;
    return p;
  });
}
