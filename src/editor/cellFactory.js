import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { CellComponent } from '../components/CellComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid } from '../core/units.js';
import { getWorldTransform, reparentActor } from '../core/hierarchy.js';

/**
 * Create an empty Cell root actor.
 */
export function createCellActor({
  name = 'Cell',
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  gridSize = 25,
  snapY = true,
} = {}) {
  const pos = {
    x: snapToGrid(position.x, gridSize),
    y: snapY ? snapToGrid(position.y, gridSize) : position.y,
    z: snapToGrid(position.z, gridSize),
  };

  return new Actor({
    id: createId('actor'),
    name,
    transform: new Transform({ position: pos, rotation: { ...rotation } }),
    tags: ['cell'],
    components: [
      new CellComponent({ id: createId('comp') }),
    ],
  });
}

/**
 * Reparent selected actors under a cell, preserving world transforms.
 */
export function assignActorsToCell(world, actorIds, cellActorId) {
  const cell = world.getActor(cellActorId);
  if (!cell?.getComponent('Cell')) {
    return { ok: false, error: 'Target is not a cell' };
  }
  const changes = [];
  for (const id of actorIds) {
    if (id === cellActorId) continue;
    const actor = world.getActor(id);
    if (!actor) continue;
    const before = {
      parentId: actor.parentId,
      transform: actor.transform.toJSON(),
    };
    const result = reparentActor(actor, cellActorId, world);
    if (!result.ok) continue;
    if (!result.changed) continue;
    changes.push({
      actorId: id,
      before,
      after: {
        parentId: actor.parentId,
        transform: actor.transform.toJSON(),
      },
    });
  }
  return { ok: true, changes };
}

/**
 * Snapshot world transform for a set of actors (for tests / commands).
 */
export function snapshotWorldTransforms(world, actorIds) {
  const map = {};
  for (const id of actorIds) {
    const actor = world.getActor(id);
    if (!actor) continue;
    map[id] = getWorldTransform(actor, world);
  }
  return map;
}
