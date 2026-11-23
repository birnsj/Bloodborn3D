import { Transform } from './Transform.js';
import { matrixToTransform, mat4Identity, mat4Invert, mat4Multiply, transformToMatrix } from './math3d.js';

/**
 * Hierarchy helpers. Actor.transform is always LOCAL relative to parent
 * (or world if parentId is null).
 */

export function getParent(actor, world) {
  if (!actor?.parentId || !world) return null;
  return world.getActor(actor.parentId);
}

export function getChildren(actorId, world) {
  if (!world) return [];
  return world.actors.filter((a) => a.parentId === actorId);
}

export function getDescendants(actorId, world) {
  const result = [];
  const stack = [...getChildren(actorId, world)];
  while (stack.length) {
    const child = stack.pop();
    result.push(child);
    stack.push(...getChildren(child.id, world));
  }
  return result;
}

export function getAncestors(actor, world) {
  const result = [];
  let current = getParent(actor, world);
  const seen = new Set();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    result.push(current);
    current = getParent(current, world);
  }
  return result;
}

export function getRootActors(world) {
  if (!world) return [];
  return world.actors.filter((a) => !a.parentId);
}

/** True if making `actorId` a child of `newParentId` would create a cycle. */
export function wouldCreateCycle(actorId, newParentId, world) {
  if (!newParentId) return false;
  if (actorId === newParentId) return true;
  let current = world.getActor(newParentId);
  const seen = new Set();
  while (current) {
    if (current.id === actorId) return true;
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = getParent(current, world);
  }
  return false;
}

export function getWorldMatrix(actor, world) {
  let matrix = transformToMatrix(actor.transform);
  let current = getParent(actor, world);
  const seen = new Set([actor.id]);
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    matrix = mat4Multiply(transformToMatrix(current.transform), matrix);
    current = getParent(current, world);
  }
  return matrix;
}

export function getWorldTransform(actor, world) {
  return matrixToTransform(getWorldMatrix(actor, world));
}

/**
 * Set actor local transform so its world transform equals `worldTransform`.
 */
export function setWorldTransform(actor, worldTransform, world) {
  const parent = getParent(actor, world);
  if (!parent) {
    actor.transform.copyFrom(worldTransform);
    return actor.transform;
  }
  const parentWorld = getWorldMatrix(parent, world);
  const parentInv = mat4Invert(parentWorld);
  const desired = transformToMatrix(worldTransform);
  const local = mat4Multiply(parentInv, desired);
  actor.transform.copyFrom(matrixToTransform(local));
  return actor.transform;
}

/**
 * Reparent actor under newParentId (or null), preserving world transform.
 */
export function reparentActor(actor, newParentId, world) {
  const nextParent = newParentId || null;
  if (actor.parentId === nextParent) return { ok: true, changed: false };
  if (nextParent && !world.getActor(nextParent)) {
    return { ok: false, error: 'Parent actor not found' };
  }
  if (wouldCreateCycle(actor.id, nextParent, world)) {
    return { ok: false, error: 'Circular parenting rejected' };
  }

  const worldXform = getWorldTransform(actor, world);
  actor.parentId = nextParent;
  setWorldTransform(actor, worldXform, world);
  return { ok: true, changed: true };
}

/** Effective visibility (self and all ancestors). */
export function isEffectivelyVisible(actor, world) {
  if (actor.visible === false) return false;
  for (const ancestor of getAncestors(actor, world)) {
    if (ancestor.visible === false) return false;
  }
  return true;
}

/** Effective lock (self or any ancestor). */
export function isEffectivelyLocked(actor, world) {
  if (actor.locked) return true;
  for (const ancestor of getAncestors(actor, world)) {
    if (ancestor.locked) return true;
  }
  return false;
}

/** Find nearest ancestor with Cell component, or self if cell. */
export function findOwningCell(actor, world) {
  if (actor.getComponent?.('Cell')) return actor;
  for (const ancestor of getAncestors(actor, world)) {
    if (ancestor.getComponent?.('Cell')) return ancestor;
  }
  return null;
}

export function listCellActors(world) {
  if (!world) return [];
  return world.actors.filter((a) => a.getComponent('Cell'));
}

export function emptyLocalTransform() {
  return new Transform();
}

export function identityWorldMatrix() {
  return mat4Identity();
}
