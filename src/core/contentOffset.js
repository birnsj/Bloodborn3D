/**
 * Actor content offset — mesh/brush/collision content relative to the actor
 * pivot (Actor.transform origin). Editor units. Default {0,0,0}.
 *
 * Pivot editing moves Actor.transform and compensates contentOffset so visible
 * geometry, collision, and children stay fixed in world space. No parallel TRS.
 */
import {
  composeTRS,
  mat4Invert,
  mat4Multiply,
  mat4TransformPoint,
  mat4TransformDirection,
  matrixToTransform,
} from './math3d.js';
import { getWorldMatrix, getChildren } from './hierarchy.js';
import { toEditorUnits, toMeters } from './units.js';

export function normalizeContentOffset(raw) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  const z = Number(raw?.z);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
}

export function contentOffsetEquals(a, b, eps = 1e-6) {
  const A = normalizeContentOffset(a);
  const B = normalizeContentOffset(b);
  return (
    Math.abs(A.x - B.x) <= eps
    && Math.abs(A.y - B.y) <= eps
    && Math.abs(A.z - B.z) <= eps
  );
}

export function contentOffsetIsIdentity(raw, eps = 1e-6) {
  return contentOffsetEquals(raw, { x: 0, y: 0, z: 0 }, eps);
}

/** Local translation matrix for content under the actor pivot. */
export function getContentLocalMatrix(actor) {
  const o = normalizeContentOffset(actor?.contentOffset);
  return composeTRS(o, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
}

/** World matrix of the content frame (pivot × contentOffset). */
export function getContentWorldMatrix(actor, world) {
  return mat4Multiply(getWorldMatrix(actor, world), getContentLocalMatrix(actor));
}

/** Content frame origin in world editor units. */
export function getContentWorldPosition(actor, world) {
  return mat4TransformPoint(getContentWorldMatrix(actor, world), { x: 0, y: 0, z: 0 });
}

/** Content frame as a Transform (editor units) — for physics / CSG consumers. */
export function getContentWorldTransform(actor, world) {
  return matrixToTransform(getContentWorldMatrix(actor, world));
}

/**
 * Apply a pivot translation in actor-local editor units (Δ of the origin).
 * Content and direct children stay fixed in world space.
 *
 * @returns {{
 *   before: { transform, contentOffset, children: Array },
 *   after: { transform, contentOffset, children: Array },
 * }}
 */
export function applyActorLocalPivotDelta(actor, deltaLocalEu, world) {
  const d = normalizeContentOffset(deltaLocalEu);
  const before = snapshotPivotState(actor, world);
  if (Math.abs(d.x) < 1e-12 && Math.abs(d.y) < 1e-12 && Math.abs(d.z) < 1e-12) {
    return { before, after: before };
  }

  const scale = actor.transform.scale || { x: 1, y: 1, z: 1 };
  // Parent-local position delta: actor local axes are rotated; scale does not
  // affect how a pivot translation in local space maps into the parent frame
  // for position (TRS: T of parent-local = R*S*localDelta for a point at origin
  // moving…). Moving the origin by d in actor-local means the parent's view of
  // that point shift is R * (S * d) when the actor has scale S.
  const localMat = composeTRS(
    { x: 0, y: 0, z: 0 },
    actor.transform.rotation,
    scale,
  );
  const deltaParent = mat4TransformDirection(localMat, d);

  actor.transform.position = {
    x: (actor.transform.position?.x || 0) + deltaParent.x,
    y: (actor.transform.position?.y || 0) + deltaParent.y,
    z: (actor.transform.position?.z || 0) + deltaParent.z,
  };

  const prev = normalizeContentOffset(actor.contentOffset);
  actor.contentOffset = {
    x: prev.x - d.x,
    y: prev.y - d.y,
    z: prev.z - d.z,
  };

  // Direct children are parented to the actor pivot — compensate their locals.
  for (const child of getChildren(actor.id, world)) {
    child.transform.position = {
      x: (child.transform.position?.x || 0) - d.x,
      y: (child.transform.position?.y || 0) - d.y,
      z: (child.transform.position?.z || 0) - d.z,
    };
  }

  return { before, after: snapshotPivotState(actor, world) };
}

/**
 * Move the pivot to a world-space editor-unit point without moving content.
 */
export function applyActorWorldPivotPosition(actor, worldPivotEu, world) {
  const pivotWorld = mat4TransformPoint(getWorldMatrix(actor, world), { x: 0, y: 0, z: 0 });
  const deltaWorld = {
    x: (worldPivotEu?.x || 0) - pivotWorld.x,
    y: (worldPivotEu?.y || 0) - pivotWorld.y,
    z: (worldPivotEu?.z || 0) - pivotWorld.z,
  };
  const inv = mat4Invert(getWorldMatrix(actor, world));
  // Direction-only: world delta → actor-local (accounts for rotation+scale).
  const deltaLocal = mat4TransformDirection(inv, deltaWorld);
  return applyActorLocalPivotDelta(actor, deltaLocal, world);
}

export function snapshotPivotState(actor, world) {
  const children = getChildren(actor?.id, world).map((c) => ({
    actorId: c.id,
    transform: c.transform.toJSON(),
  }));
  return {
    actorId: actor.id,
    transform: actor.transform.toJSON(),
    contentOffset: normalizeContentOffset(actor.contentOffset),
    children,
  };
}

export function restorePivotState(world, state) {
  if (!state?.actorId || !world) return;
  const actor = world.getActor(state.actorId);
  if (!actor) return;
  actor.transform.copyFrom(state.transform);
  actor.contentOffset = normalizeContentOffset(state.contentOffset);
  for (const row of state.children || []) {
    const child = world.getActor(row.actorId);
    if (child) child.transform.copyFrom(row.transform);
  }
}

/** Convert contentOffset to meters for Three.js Object3D.position. */
export function contentOffsetToMeters(raw) {
  const o = normalizeContentOffset(raw);
  return {
    x: toMeters(o.x),
    y: toMeters(o.y),
    z: toMeters(o.z),
  };
}

export function metersToContentOffset(m) {
  return {
    x: toEditorUnits(m?.x || 0),
    y: toEditorUnits(m?.y || 0),
    z: toEditorUnits(m?.z || 0),
  };
}
