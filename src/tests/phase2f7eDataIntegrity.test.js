import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import {
  deserializeLevel,
  validateLevelData,
} from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { createBrushFromBounds, duplicateActors } from '../editor/brushFactory.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  CompositeCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import { ensureWorldSolidContainsSubtracts } from '../runtime/worldSolidFit.js';
import { boundsWithShell, WORLD_SOLID_SHELL } from '../editor/newMapFactory.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { getInstanceActors } from '../prefabs/prefabOps.js';
import { createId } from '../core/ids.js';

function minimalActor(id, extras = {}) {
  return {
    id,
    name: id,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    components: [],
    ...extras,
  };
}

function minimalLevel(actors) {
  return {
    schemaVersion: 2,
    name: 'Integrity',
    mapMode: 'additive',
    actors,
  };
}

describe('Phase 2F.7E — level validation', () => {
  it('rejects non-string actor ids', () => {
    expect(() => validateLevelData(minimalLevel([
      minimalActor(123),
    ]))).toThrow(/string id/i);
  });

  it('rejects duplicate actor ids', () => {
    expect(() => validateLevelData(minimalLevel([
      minimalActor('a'),
      minimalActor('a'),
    ]))).toThrow(/Duplicate actor id/);
  });

  it('rejects missing parent references instead of silently clearing them', () => {
    expect(() => deserializeLevel(minimalLevel([
      minimalActor('child', { parentId: 'missing' }),
    ]))).toThrow(/missing parent/);
  });

  it('rejects circular hierarchies', () => {
    expect(() => deserializeLevel(minimalLevel([
      minimalActor('a', { parentId: 'b' }),
      minimalActor('b', { parentId: 'a' }),
    ]))).toThrow(/Circular hierarchy/);
  });

  it('rejects self-parenting', () => {
    expect(() => validateLevelData(minimalLevel([
      minimalActor('a', { parentId: 'a' }),
    ]))).toThrow(/cannot parent itself/);
  });

  it('loads a valid hierarchy', () => {
    const world = deserializeLevel(minimalLevel([
      minimalActor('root'),
      minimalActor('child', { parentId: 'root' }),
    ]));
    expect(world.getActor('child').parentId).toBe('root');
  });
});

describe('Phase 2F.7E — Play/Stop world fields', () => {
  it('serializeLevel includes mapMode and ambient for snapshot restore', () => {
    const world = new World({
      name: 'Snap',
      schemaVersion: 2,
      mapMode: 'subtractive',
      ambient: { color: '#112233', intensity: 0.4, playIntensity: 0.2 },
    });
    const json = serializeLevel(world);
    expect(json.mapMode).toBe('subtractive');
    expect(json.ambient.color).toBe('#112233');
    const restored = deserializeLevel(json);
    expect(restored.mapMode).toBe('subtractive');
    expect(restored.ambient.intensity).toBe(0.4);
  });
});

describe('Phase 2F.7E — CompositeCommand / HistoryStack integrity', () => {
  it('rolls back earlier sub-commands when a later do() throws', () => {
    const world = new World({ name: 'C', schemaVersion: 2 });
    const actor = new Actor({
      id: 'box',
      name: 'Box',
      transform: new Transform({ position: { x: 0, y: 0, z: 0 } }),
      components: [new BrushComponent({ id: 'c', size: { x: 100, y: 100, z: 100 } })],
    });
    world.addActor(actor);

    const ok = {
      do() { actor.transform.position = { x: 50, y: 0, z: 0 }; },
      undo() { actor.transform.position = { x: 0, y: 0, z: 0 }; },
    };
    const bad = {
      do() { throw new Error('boom'); },
      undo() {},
    };
    const composite = new CompositeCommand({ commands: [ok, bad], label: 'Bad' });
    expect(() => composite.do()).toThrow(/boom/);
    expect(actor.transform.position.x).toBe(0);
  });

  it('keeps the undo stack intact when undo() throws', () => {
    const stack = new HistoryStack();
    const cmd = {
      do() {},
      undo() { throw new Error('undo fail'); },
    };
    stack.execute(cmd);
    expect(stack.canUndo).toBe(true);
    expect(() => stack.undo()).toThrow(/undo fail/);
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
  });
});

describe('Phase 2F.7E — World Solid exact fit', () => {
  it('shrinks World Solid when subtracts retreat (undo path)', () => {
    const world = new World({ name: 'Fit', mapMode: 'subtractive' });
    const room = { min: { x: -100, y: 0, z: -100 }, max: { x: 100, y: 200, z: 100 } };
    const solidBounds = boundsWithShell(room.min, room.max, WORLD_SOLID_SHELL);
    const solid = createBrushFromBounds({
      kind: 'box',
      min: solidBounds.min,
      max: solidBounds.max,
      gridSize: 25,
      name: 'World Solid',
      operation: 'add',
    });
    solid.tags = ['world-solid'];
    solid.locked = true;
    world.addActor(solid);
    const cutter = createBrushFromBounds({
      kind: 'box',
      min: room.min,
      max: room.max,
      gridSize: 25,
      name: 'Room',
      operation: 'subtract',
    });
    world.addActor(cutter);

    const before = cutter.transform.toJSON();
    const after = {
      ...before,
      position: { x: 800, y: 100, z: 0 },
    };
    const originX = solid.transform.position.x;
    const history = new HistoryStack();
    history.execute(new SetTransformsCommand({
      world,
      changes: [{ actorId: cutter.id, before, after }],
    }));
    ensureWorldSolidContainsSubtracts(world, { gridSize: 25 });
    expect(solid.transform.position.x).toBeGreaterThan(originX);

    history.undo();
    ensureWorldSolidContainsSubtracts(world, { gridSize: 25 });
    expect(solid.transform.position.x).toBe(originX);
    expect(solid.getComponent('Brush').size.x).toBe(solidBounds.max.x - solidBounds.min.x);
  });
});

describe('Phase 2F.7E — prefab duplicate / definition integrity', () => {
  it('assigns a fresh instanceId when duplicating prefab instance actors', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const instanceId = createId('pinst');
    const root = new Actor({
      id: 'root',
      name: 'Root',
      transform: new Transform({ position: { x: 0, y: 0, z: 0 } }),
      components: [new BrushComponent({ id: 'c1', size: { x: 100, y: 100, z: 100 } })],
    });
    root.prefab = {
      prefabId: 'prefab_test',
      instanceId,
      templateId: 'tpl_root',
      isRoot: true,
      overrides: { tpl_root: { name: 'Renamed' } },
    };
    const child = new Actor({
      id: 'child',
      name: 'Child',
      parentId: 'root',
      transform: new Transform({ position: { x: 50, y: 0, z: 0 } }),
      components: [new BrushComponent({ id: 'c2', size: { x: 50, y: 50, z: 50 } })],
    });
    child.prefab = {
      prefabId: 'prefab_test',
      instanceId,
      templateId: 'tpl_child',
    };
    world.addActor(root);
    world.addActor(child);

    const copies = duplicateActors([root, child], { offset: { x: 100, y: 0, z: 0 } });
    expect(copies[0].prefab.instanceId).not.toBe(instanceId);
    expect(copies[1].prefab.instanceId).toBe(copies[0].prefab.instanceId);
    expect(copies[1].parentId).toBe(copies[0].id);

    for (const copy of copies) world.addActor(copy);
    expect(getInstanceActors(world, instanceId)).toHaveLength(2);
    expect(getInstanceActors(world, copies[0].prefab.instanceId)).toHaveLength(2);
  });

  it('clears orphan parentId and drops duplicate template ids in prefab defs', () => {
    const def = normalizePrefabDefinition({
      id: 'prefab_x',
      name: 'X',
      actors: [
        { id: 'tpl_a', parentId: 'missing', components: [] },
        { id: 'tpl_a', parentId: null, components: [] },
        { id: 'tpl_b', parentId: 'tpl_a', components: [] },
      ],
      rootTemplateIds: ['tpl_a', 'gone'],
    });
    expect(def.actors).toHaveLength(2);
    expect(def.actors.find((a) => a.id === 'tpl_a').parentId).toBeNull();
    expect(def.rootTemplateIds).toEqual(['tpl_a']);
  });
});
