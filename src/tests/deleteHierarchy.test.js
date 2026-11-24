import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createCellActor } from '../editor/cellFactory.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { RemoveActorsCommand } from '../editor/history/commands.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { getDescendants } from '../core/hierarchy.js';

function brush(id, name, min, max) {
  const actor = createBrushFromBounds({ kind: 'box', min, max, gridSize: 25 });
  actor.id = id;
  actor.name = name;
  return actor;
}

/**
 * root(cell) ── room(cell) ── wallA
 *                          └─ wallB
 *            └─ lamp
 * plus an unrelated sibling before and after, to check ordering.
 */
function buildHierarchy() {
  const world = new World({ name: 'H1', schemaVersion: 2 });
  const before = brush('before', 'Before', { x: -300, y: 0, z: 0 }, { x: -200, y: 100, z: 100 });
  const root = createCellActor({ name: 'Root' });
  root.id = 'root';
  root.transform.position = { x: 500, y: 0, z: 200 };
  const room = createCellActor({ name: 'Room' });
  room.id = 'room';
  room.parentId = 'root';
  room.transform.position = { x: 100, y: 0, z: 0 };
  room.transform.rotation = { x: 0, y: 90, z: 0 };
  const wallA = brush('wallA', 'Wall A', { x: 0, y: 0, z: 0 }, { x: 200, y: 300, z: 20 });
  wallA.parentId = 'room';
  const wallB = brush('wallB', 'Wall B', { x: 0, y: 0, z: 0 }, { x: 20, y: 300, z: 200 });
  wallB.parentId = 'room';
  const lamp = new Actor({ id: 'lamp', name: 'Lamp', parentId: 'root', components: [] });
  const after = brush('after', 'After', { x: 300, y: 0, z: 0 }, { x: 400, y: 100, z: 100 });
  for (const a of [before, root, room, wallA, wallB, lamp, after]) world.addActor(a);
  return world;
}

function ids(world) {
  return world.actors.map((a) => a.id);
}

describe('deleting a parent removes its whole subtree (H1)', () => {
  it('removes children and grandchildren with the parent', () => {
    const world = buildHierarchy();
    new RemoveActorsCommand({ world, actorIds: ['root'] }).do();
    expect(ids(world)).toEqual(['before', 'after']);
  });

  it('removes only the subtree of a mid-level parent', () => {
    const world = buildHierarchy();
    new RemoveActorsCommand({ world, actorIds: ['room'] }).do();
    expect(ids(world)).toEqual(['before', 'root', 'lamp', 'after']);
  });

  it('never leaves an actor pointing at a missing parent', () => {
    const world = buildHierarchy();
    new RemoveActorsCommand({ world, actorIds: ['root'] }).do();
    for (const actor of world.actors) {
      if (actor.parentId) expect(world.getActor(actor.parentId)).toBeTruthy();
    }
  });

  it('handles a parent and its own child selected together', () => {
    const world = buildHierarchy();
    const cmd = new RemoveActorsCommand({ world, actorIds: ['wallA', 'room', 'wallB'] });
    expect(cmd.actorIds.slice().sort()).toEqual(['room', 'wallA', 'wallB']);
    cmd.do();
    expect(ids(world)).toEqual(['before', 'root', 'lamp', 'after']);
  });

  it('leaves leaf deletion unchanged', () => {
    const world = buildHierarchy();
    new RemoveActorsCommand({ world, actorIds: ['lamp'] }).do();
    expect(ids(world)).toEqual(['before', 'root', 'room', 'wallA', 'wallB', 'after']);
  });

  it('ignores unknown ids', () => {
    const world = buildHierarchy();
    const cmd = new RemoveActorsCommand({ world, actorIds: ['ghost'] });
    expect(cmd.actorIds).toEqual([]);
    cmd.do();
    expect(world.actors).toHaveLength(7);
  });

  it('Undo restores every actor byte-for-byte, in original order', () => {
    const world = buildHierarchy();
    const before = serializeLevel(world);
    const history = new HistoryStack();

    history.execute(new RemoveActorsCommand({ world, actorIds: ['root'] }));
    expect(ids(world)).toEqual(['before', 'after']);

    history.undo();
    expect(serializeLevel(world)).toEqual(before);
    expect(ids(world)).toEqual(['before', 'root', 'room', 'wallA', 'wallB', 'lamp', 'after']);
  });

  it('Undo restores IDs, local transforms and hierarchy relationships', () => {
    const world = buildHierarchy();
    const history = new HistoryStack();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['root'] }));
    history.undo();

    expect(world.getActor('room').parentId).toBe('root');
    expect(world.getActor('wallA').parentId).toBe('room');
    expect(world.getActor('lamp').parentId).toBe('root');
    expect(world.getActor('room').transform.rotation.y).toBe(90);
    expect(world.getActor('room').transform.position).toEqual({ x: 100, y: 0, z: 0 });
    expect(getDescendants('root', world).map((a) => a.id).sort()).toEqual(
      ['lamp', 'room', 'wallA', 'wallB'],
    );
  });

  it('Undo restores prefab metadata on removed instance actors', () => {
    const world = buildHierarchy();
    const room = world.getActor('room');
    room.prefab = {
      prefabId: 'prefab_room',
      instanceId: 'inst_1',
      templateId: 'tpl_root',
      isRoot: true,
      overrides: { tpl_root: { transform: { position: { x: 5, y: 0, z: 0 } } } },
    };
    const wallA = world.getActor('wallA');
    wallA.prefab = {
      prefabId: 'prefab_room',
      instanceId: 'inst_1',
      templateId: 'tpl_wall_a',
      isRoot: false,
    };
    const expectedRoom = structuredClone(room.toJSON().prefab);
    const expectedWall = structuredClone(wallA.toJSON().prefab);

    const history = new HistoryStack();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['room'] }));
    history.undo();

    expect(world.getActor('room').toJSON().prefab).toEqual(expectedRoom);
    expect(world.getActor('wallA').toJSON().prefab).toEqual(expectedWall);
  });

  it('Redo removes the subtree again, and a second Undo restores it again', () => {
    const world = buildHierarchy();
    const before = serializeLevel(world);
    const history = new HistoryStack();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['room'] }));
    history.undo();
    history.redo();
    expect(ids(world)).toEqual(['before', 'root', 'lamp', 'after']);
    history.undo();
    expect(serializeLevel(world)).toEqual(before);
  });

  it('restores children that were hidden or locked exactly as they were', () => {
    const world = buildHierarchy();
    world.getActor('wallB').visible = false;
    world.getActor('wallB').locked = true;
    const before = serializeLevel(world);
    const history = new HistoryStack();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['root'] }));
    history.undo();
    expect(serializeLevel(world)).toEqual(before);
  });

  it('keeps working when Undo is interleaved with other deletes', () => {
    const world = buildHierarchy();
    const before = serializeLevel(world);
    const history = new HistoryStack();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['room'] }));
    history.execute(new RemoveActorsCommand({ world, actorIds: ['before', 'after'] }));
    history.undo();
    history.undo();
    expect(serializeLevel(world)).toEqual(before);
  });
});
