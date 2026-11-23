import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { CellComponent } from '../components/CellComponent.js';
import {
  getWorldTransform,
  reparentActor,
  setWorldTransform,
  wouldCreateCycle,
  getChildren,
  isEffectivelyVisible,
  isEffectivelyLocked,
} from '../core/hierarchy.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { ReparentActorsCommand } from '../editor/history/commands.js';
import { createCellActor } from '../editor/cellFactory.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeActor(id, pos, parentId = null) {
  return new Actor({
    id,
    name: id,
    parentId,
    transform: new Transform({ position: pos }),
    components: [new BrushComponent({ id: `c_${id}`, size: { x: 100, y: 100, z: 100 } })],
  });
}

describe('hierarchy transforms', () => {
  it('composes parent + local into world position', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const parent = makeActor('p', { x: 100, y: 0, z: 0 });
    const child = makeActor('c', { x: 50, y: 25, z: 0 }, 'p');
    world.addActor(parent);
    world.addActor(child);

    const worldX = getWorldTransform(child, world);
    expect(worldX.position.x).toBeCloseTo(150, 5);
    expect(worldX.position.y).toBeCloseTo(25, 5);
  });

  it('preserves world transform when reparenting', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const a = makeActor('a', { x: 0, y: 0, z: 0 });
    const b = makeActor('b', { x: 200, y: 0, z: 0 });
    const child = makeActor('c', { x: 100, y: 50, z: 0 });
    world.addActor(a);
    world.addActor(b);
    world.addActor(child);

    const beforeWorld = getWorldTransform(child, world);
    const result = reparentActor(child, 'b', world);
    expect(result.ok).toBe(true);
    const afterWorld = getWorldTransform(child, world);
    expect(afterWorld.position.x).toBeCloseTo(beforeWorld.position.x, 4);
    expect(afterWorld.position.y).toBeCloseTo(beforeWorld.position.y, 4);
    expect(child.parentId).toBe('b');
    // Local should be relative to b: world 100 - parent 200 = -100
    expect(child.transform.position.x).toBeCloseTo(-100, 4);
  });

  it('rejects circular parenting', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const a = makeActor('a', { x: 0, y: 0, z: 0 });
    const b = makeActor('b', { x: 0, y: 0, z: 0 }, 'a');
    world.addActor(a);
    world.addActor(b);
    expect(wouldCreateCycle('a', 'b', world)).toBe(true);
    expect(reparentActor(a, 'b', world).ok).toBe(false);
  });

  it('setWorldTransform updates local under parent', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const parent = makeActor('p', { x: 100, y: 0, z: 0 });
    const child = makeActor('c', { x: 0, y: 0, z: 0 }, 'p');
    world.addActor(parent);
    world.addActor(child);
    setWorldTransform(child, {
      position: { x: 300, y: 10, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }, world);
    expect(child.transform.position.x).toBeCloseTo(200, 4);
    expect(getWorldTransform(child, world).position.x).toBeCloseTo(300, 4);
  });
});

describe('cells', () => {
  it('creates cell actors and parents members under them', () => {
    const world = new World({ name: 'C', schemaVersion: 2 });
    const cell = createCellActor({ name: 'Room A', position: { x: 0, y: 0, z: 0 } });
    world.addActor(cell);
    expect(cell.getComponent('Cell')).toBeTruthy();

    const wall = makeActor('wall', { x: 100, y: 150, z: 0 });
    world.addActor(wall);
    reparentActor(wall, cell.id, world);
    expect(getChildren(cell.id, world).map((a) => a.id)).toContain('wall');
  });

  it('visibility and locking inherit from ancestors', () => {
    const world = new World({ name: 'C', schemaVersion: 2 });
    const cell = createCellActor({ name: 'Cell' });
    cell.visible = false;
    cell.locked = true;
    const child = makeActor('prop', { x: 0, y: 0, z: 0 }, cell.id);
    world.addActor(cell);
    world.addActor(child);
    expect(isEffectivelyVisible(child, world)).toBe(false);
    expect(isEffectivelyLocked(child, world)).toBe(true);
  });
});

describe('hierarchy serialization + history', () => {
  it('round-trips parentId and cell components', () => {
    const world = new World({ name: 'S', schemaVersion: 2 });
    const cell = createCellActor({ name: 'Cell' });
    const child = makeActor('child', { x: 25, y: 0, z: 0 }, cell.id);
    world.addActor(cell);
    world.addActor(child);
    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(2);
    const restored = deserializeLevel(json);
    expect(restored.getActor('child')?.parentId || restored.actors.find((a) => a.name === 'child')?.parentId).toBeTruthy();
    const restoredChild = restored.actors.find((a) => a.name === 'child');
    const restoredCell = restored.actors.find((a) => a.getComponent('Cell'));
    expect(restoredChild.parentId).toBe(restoredCell.id);
    expect(serializeLevel(restored)).toEqual(json);
  });

  it('undoes reparent commands', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const parent = makeActor('p', { x: 0, y: 0, z: 0 });
    const child = makeActor('c', { x: 50, y: 0, z: 0 });
    world.addActor(parent);
    world.addActor(child);
    const before = { parentId: null, transform: child.transform.toJSON() };
    reparentActor(child, 'p', world);
    const after = { parentId: child.parentId, transform: child.transform.toJSON() };
    // Reset then run via history
    child.parentId = before.parentId;
    child.transform.copyFrom(before.transform);

    const history = new HistoryStack();
    history.execute(new ReparentActorsCommand({
      world,
      changes: [{ actorId: 'c', before, after }],
    }));
    expect(child.parentId).toBe('p');
    history.undo();
    expect(child.parentId).toBeNull();
  });

  it('loads legacy v1 levels without parentId', () => {
    const raw = JSON.parse(readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8'));
    const world = deserializeLevel(raw);
    expect(world.actors.every((a) => a.parentId == null || a.parentId === null)).toBe(true);
    expect(world.getActor('actor_floor')).toBeTruthy();
  });
});
