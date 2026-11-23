import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { CellComponent } from '../components/CellComponent.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
  syncPrefabInstances,
  unpackPrefabInstance,
  wouldCreatePrefabCycle,
  getOverrides,
  setOverride,
  getInstanceActors,
  listPrefabInstanceIds,
} from '../prefabs/prefabOps.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { AddActorsCommand, ReplaceActorsCommand } from '../editor/history/commands.js';

function brushActor(id, pos, parentId = null, materialId = null) {
  return new Actor({
    id,
    name: id,
    parentId,
    transform: new Transform({ position: pos }),
    components: [
      new BrushComponent({
        id: `c_${id}`,
        size: { x: 100, y: 100, z: 100 },
        materialId,
      }),
    ],
  });
}

describe('prefab create + instantiate', () => {
  it('creates a prefab with stable template ids and unique instance actor ids', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const cell = new Actor({
      id: 'cell',
      name: 'Room',
      transform: new Transform({ position: { x: 0, y: 0, z: 0 } }),
      components: [new CellComponent({ id: 'cell_c' })],
    });
    const wall = brushActor('wall', { x: 100, y: 150, z: 0 }, 'cell');
    world.addActor(cell);
    world.addActor(wall);

    const created = createPrefabFromActors(world, ['cell'], { name: 'Room Prefab', id: 'prefab_room' });
    expect(created.ok).toBe(true);
    expect(created.definition.actors.length).toBe(2);
    expect(created.definition.rootTemplateIds.length).toBe(1);
    expect(created.definition.id).toBe('prefab_room');

    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 500, y: 0, z: 200 },
    });
    expect(placed.rootActorIds.length).toBe(1);
    expect(placed.instanceId).toBeTruthy();
    const root = world.getActor(placed.rootActorIds[0]);
    expect(root.prefab.prefabId).toBe('prefab_room');
    expect(getWorldTransform(root, world).position.x).toBeCloseTo(500, 3);

    const members = getInstanceActors(world, placed.instanceId);
    expect(members.length).toBe(2);
    expect(new Set(members.map((m) => m.id)).size).toBe(2);
    expect(members.every((m) => m.id !== 'cell' && m.id !== 'wall')).toBe(true);
  });

  it('rejects circular prefab dependencies', () => {
    const defs = {
      prefab_a: {
        id: 'prefab_a',
        nestedPrefabIds: ['prefab_b'],
        actors: [],
      },
      prefab_b: {
        id: 'prefab_b',
        nestedPrefabIds: ['prefab_a'],
        actors: [],
      },
    };
    expect(wouldCreatePrefabCycle('prefab_a', ['prefab_b'], (id) => defs[id])).toBe(true);
    expect(wouldCreatePrefabCycle('prefab_c', ['prefab_a'], (id) => defs[id])).toBe(false);
  });
});

describe('prefab sync + overrides', () => {
  it('propagates source updates while preserving overrides and instance ids', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const a = brushActor('a', { x: 0, y: 50, z: 0 }, null, 'mat_old');
    world.addActor(a);

    const created = createPrefabFromActors(world, ['a'], { name: 'Prop', id: 'prefab_prop' });
    const def = created.definition;

    const i1 = instantiatePrefab(def, world, { position: { x: 100, y: 0, z: 0 } });
    const i2 = instantiatePrefab(def, world, { position: { x: 300, y: 0, z: 0 } });

    const root1 = world.getActor(i1.rootActorIds[0]);
    const brush1 = root1.getComponent('Brush');
    brush1.materialId = 'mat_override';
    setOverride(root1, root1.prefab.templateId, {
      components: { Brush: { materialId: 'mat_override' } },
    });

    // Mutate source
    def.actors[0].components[0].materialId = 'mat_new';
    def.actors[0].name = 'PropUpdated';
    const normalized = normalizePrefabDefinition(def);

    const beforeIds = {
      i1: i1.rootActorIds[0],
      i2: i2.rootActorIds[0],
      inst1: i1.instanceId,
      inst2: i2.instanceId,
    };

    syncPrefabInstances(world, normalized);

    const r1 = world.getActor(beforeIds.i1);
    const r2 = world.getActor(beforeIds.i2);
    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    expect(r1.prefab.instanceId).toBe(beforeIds.inst1);
    expect(r2.prefab.instanceId).toBe(beforeIds.inst2);
    expect(r1.getComponent('Brush').materialId).toBe('mat_override');
    expect(r2.getComponent('Brush').materialId).toBe('mat_new');
    expect(r1.name).toBe('PropUpdated');
    expect(getWorldTransform(r1, world).position.x).toBeCloseTo(100, 3);
    expect(getWorldTransform(r2, world).position.x).toBeCloseTo(300, 3);
  });

  it('unpacks instances into independent actors', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(brushActor('src', { x: 0, y: 0, z: 0 }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_u', name: 'U' });
    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 10, y: 0, z: 0 },
    });
    unpackPrefabInstance(world, placed.instanceId);
    const root = world.getActor(placed.rootActorIds[0]);
    expect(root.prefab).toBeNull();
  });
});

describe('nested prefabs', () => {
  it('stores nested prefab ids when capturing instances inside a parent prefab', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(brushActor('door', { x: 0, y: 0, z: 0 }));
    const doorPrefab = createPrefabFromActors(world, ['door'], { id: 'prefab_door', name: 'Door' });
    const doorInst = instantiatePrefab(doorPrefab.definition, world, {
      position: { x: 50, y: 0, z: 0 },
    });

    const room = new Actor({
      id: 'room',
      name: 'Room',
      components: [new CellComponent({ id: 'room_c' })],
    });
    world.addActor(room);
    const doorRoot = world.getActor(doorInst.rootActorIds[0]);
    doorRoot.parentId = room.id;

    const roomPrefab = createPrefabFromActors(world, ['room'], {
      id: 'prefab_room',
      name: 'Room',
      getDefinition: (id) => (id === 'prefab_door' ? doorPrefab.definition : null),
    });
    expect(roomPrefab.ok).toBe(true);
    expect(roomPrefab.definition.nestedPrefabIds).toContain('prefab_door');

    // Nesting room into itself via door that somehow includes room should fail
    expect(
      wouldCreatePrefabCycle('prefab_door', ['prefab_room'], (id) => {
        if (id === 'prefab_room') return roomPrefab.definition;
        if (id === 'prefab_door') return doorPrefab.definition;
        return null;
      }),
    ).toBe(true);
  });
});

describe('prefab serialization + history', () => {
  it('round-trips prefab linkage and overrides', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(brushActor('src', { x: 0, y: 0, z: 0 }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_s', name: 'S' });
    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 20, y: 0, z: 0 },
    });
    const root = world.getActor(placed.rootActorIds[0]);
    setOverride(root, root.prefab.templateId, {
      components: { Brush: { materialId: 'mat_x' } },
    });

    const json = serializeLevel(world);
    const restored = deserializeLevel(json);
    const r = restored.getActor(root.id);
    expect(r.prefab.prefabId).toBe('prefab_s');
    expect(r.prefab.instanceId).toBe(placed.instanceId);
    expect(getOverrides(r)[r.prefab.templateId].components.Brush.materialId).toBe('mat_x');
  });

  it('undoes prefab placement via AddActorsCommand', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(brushActor('src', { x: 0, y: 0, z: 0 }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_h', name: 'H' });
    const temp = new World({ name: 'tmp', schemaVersion: 2 });
    const placed = instantiatePrefab(created.definition, temp, {
      position: { x: 0, y: 0, z: 0 },
    });
    const actorsJson = placed.actors.map((a) => a.toJSON());

    const history = new HistoryStack();
    history.execute(new AddActorsCommand({ world, actorsJson, label: 'Place prefab' }));
    expect(listPrefabInstanceIds(world, 'prefab_h').length).toBe(1);
    history.undo();
    expect(listPrefabInstanceIds(world, 'prefab_h').length).toBe(0);
  });

  it('undoes prefab sync via ReplaceActorsCommand', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(brushActor('src', { x: 0, y: 0, z: 0 }, null, 'mat_a'));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_sync', name: 'S' });
    instantiatePrefab(created.definition, world, { position: { x: 0, y: 0, z: 0 } });

    const beforeJson = world.actors.map((a) => a.toJSON());
    created.definition.actors[0].components[0].materialId = 'mat_b';
    syncPrefabInstances(world, normalizePrefabDefinition(created.definition));
    const afterJson = world.actors.map((a) => a.toJSON());

    world.clear();
    for (const data of beforeJson) {
      world.addActor(Actor.fromJSON(data, (c) => {
        if (c.type === 'Brush') return BrushComponent.fromJSON(c);
        if (c.type === 'Cell') return CellComponent.fromJSON(c);
        return c;
      }));
    }

    const history = new HistoryStack();
    history.execute(new ReplaceActorsCommand({
      world,
      beforeJson,
      afterJson,
      label: 'Sync',
    }));
    const instRoot = world.actors.find((a) => a.prefab?.prefabId === 'prefab_sync' && a.prefab?.isRoot);
    expect(instRoot.getComponent('Brush').materialId).toBe('mat_b');
    history.undo();
    const undone = world.actors.find((a) => a.prefab?.prefabId === 'prefab_sync' && a.prefab?.isRoot);
    expect(undone.getComponent('Brush').materialId).toBe('mat_a');
  });
});
