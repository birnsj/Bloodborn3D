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
  recordActorPrefabOverride,
  getOverrides,
  getInstanceActors,
  findInstanceRoot,
  setOverride,
} from '../prefabs/prefabOps.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { getWorldTransform, reparentActor, setWorldTransform } from '../core/hierarchy.js';

function brush(id, pos, opts = {}) {
  return new Actor({
    id,
    name: id,
    parentId: opts.parentId || null,
    transform: new Transform({ position: pos }),
    components: [
      new BrushComponent({
        id: `c_${id}`,
        size: opts.size || { x: 100, y: 100, z: 100 },
        materialId: opts.materialId || 'mat_a',
        color: opts.color || '#8a9099',
      }),
    ],
  });
}

describe('reliable automatic overrides', () => {
  it('records overrides when source definition is provided (cached path)', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    world.addActor(brush('src', { x: 0, y: 0, z: 0 }, { materialId: 'mat_a' }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_o', name: 'O' });
    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 100, y: 0, z: 0 },
    });
    const actor = world.getActor(placed.rootActorIds[0]);
    actor.getComponent('Brush').materialId = 'mat_override';
    actor.transform.position.x = 25;

    const result = recordActorPrefabOverride(world, actor, created.definition);
    expect(result.ok).toBe(true);
    const root = findInstanceRoot(world, placed.instanceId);
    const ov = getOverrides(root);
    expect(ov[actor.prefab.templateId].components.Brush.materialId).toBe('mat_override');
    expect(ov[actor.prefab.templateId].transform.position.x).toBe(25);
  });

  it('records overrides via async loader when source is uncached', async () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    world.addActor(brush('src', { x: 0, y: 0, z: 0 }, { materialId: 'mat_a' }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_u', name: 'U' });
    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 50, y: 0, z: 0 },
    });
    const actor = world.getActor(placed.rootActorIds[0]);
    actor.getComponent('Brush').materialId = 'mat_uncached';
    actor.name = 'Renamed';

    // Simulate uncached: no sync definition available
    let loaderCalls = 0;
    const getDefinition = async (id) => {
      loaderCalls += 1;
      expect(id).toBe('prefab_u');
      // Simulate network latency
      await Promise.resolve();
      return created.definition;
    };

    const result = await recordActorPrefabOverride(world, actor, null, { getDefinition });
    expect(result.ok).toBe(true);
    expect(loaderCalls).toBe(1);
    const root = findInstanceRoot(world, placed.instanceId);
    const ov = getOverrides(root);
    expect(ov[actor.prefab.templateId].components.Brush.materialId).toBe('mat_uncached');
    expect(ov[actor.prefab.templateId].name).toBe('Renamed');
  });

  it('replaces stale override fields when live state matches source again', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    world.addActor(brush('src', { x: 0, y: 0, z: 0 }, { materialId: 'mat_a' }));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_r', name: 'R' });
    const placed = instantiatePrefab(created.definition, world, {
      position: { x: 0, y: 0, z: 0 },
    });
    const actor = world.getActor(placed.rootActorIds[0]);
    const root = findInstanceRoot(world, placed.instanceId);
    setOverride(root, actor.prefab.templateId, {
      components: { Brush: { materialId: 'mat_old' } },
      name: 'OldName',
    });
    // Live state matches source — override entry should clear
    actor.getComponent('Brush').materialId = 'mat_a';
    actor.name = created.definition.actors[0].name;
    recordActorPrefabOverride(world, actor, created.definition);
    expect(getOverrides(root)[actor.prefab.templateId]).toBeUndefined();
  });
});

describe('nested prefab alternating synchronization', () => {
  function buildRoomWithDoor() {
    const world = new World({ name: 'N', schemaVersion: 2 });
    const defs = {};

    world.addActor(brush('door', { x: 0, y: 100, z: 0 }, { materialId: 'mat_door' }));
    const doorPrefab = createPrefabFromActors(world, ['door'], { id: 'prefab_door', name: 'Door' });
    defs.prefab_door = doorPrefab.definition;

    const doorInst = instantiatePrefab(doorPrefab.definition, world, {
      position: { x: 50, y: 100, z: 0 },
    });
    const doorRoot = world.getActor(doorInst.rootActorIds[0]);

    const room = new Actor({
      id: 'room',
      name: 'Room',
      components: [new CellComponent({ id: 'room_c' })],
    });
    world.addActor(room);
    const wall = brush('wall', { x: 0, y: 150, z: -100 }, {
      parentId: room.id,
      materialId: 'mat_wall',
    });
    world.addActor(wall);
    reparentActor(doorRoot, room.id, world);

    const roomPrefab = createPrefabFromActors(world, ['room'], {
      id: 'prefab_room',
      name: 'Room',
      getDefinition: (id) => defs[id],
    });
    defs.prefab_room = roomPrefab.definition;

    const placed = instantiatePrefab(roomPrefab.definition, world, {
      position: { x: 1000, y: 0, z: 0 },
    });

    return { world, defs, roomPrefab, doorPrefab, placed, doorInst };
  }

  it('preserves nested refs, ids, overrides across alternating parent/nested source updates', () => {
    const { world, defs, placed } = buildRoomWithDoor();
    const getDefinition = (id) => defs[id];

    const roomRoot = world.getActor(placed.rootActorIds[0]);
    const nestedDoors = world.actors.filter((a) => (
      a.prefab?.prefabId === 'prefab_door'
      && a.prefab?.ownerInstanceId === placed.instanceId
    ));
    expect(nestedDoors.length).toBeGreaterThanOrEqual(1);
    const nestedDoor = nestedDoors.find((a) => a.prefab?.isRoot) || nestedDoors[0];
    const nestedInstanceId = nestedDoor.prefab.instanceId;
    const nestedActorId = nestedDoor.id;
    const nestedTemplateId = nestedDoor.prefab.templateId;

    // Nested override
    nestedDoor.getComponent('Brush').materialId = 'mat_door_override';
    setWorldTransform(nestedDoor, {
      ...getWorldTransform(nestedDoor, world),
      position: {
        x: getWorldTransform(nestedDoor, world).position.x + 25,
        y: getWorldTransform(nestedDoor, world).position.y,
        z: getWorldTransform(nestedDoor, world).position.z,
      },
    }, world);
    const nestedRoot = findInstanceRoot(world, nestedInstanceId);
    recordActorPrefabOverride(world, nestedDoor, defs.prefab_door);
    expect(getOverrides(nestedRoot)[nestedTemplateId].components.Brush.materialId)
      .toBe('mat_door_override');

    const wallTplId = defs.prefab_room.actors.find((a) => a.name === 'wall').id;
    const wallActor = world.actors.find((a) => (
      a.prefab?.instanceId === placed.instanceId && a.prefab?.templateId === wallTplId
    ));
    const wallId = wallActor.id;

    // 1) Parent source update
    {
      const actors = structuredClone(defs.prefab_room.actors);
      actors.find((a) => a.id === wallTplId).components[0].materialId = 'mat_wall_v2';
      defs.prefab_room = normalizePrefabDefinition({ ...defs.prefab_room, actors });
    }
    syncPrefabInstances(world, defs.prefab_room, { getDefinition });

    const wallAfterParent = world.getActor(wallId);
    expect(wallAfterParent).toBeTruthy();
    expect(wallAfterParent.getComponent('Brush').materialId).toBe('mat_wall_v2');

    const nestedAfterParent = world.getActor(nestedActorId);
    expect(nestedAfterParent).toBeTruthy();
    expect(nestedAfterParent.prefab.prefabId).toBe('prefab_door');
    expect(nestedAfterParent.prefab.instanceId).toBe(nestedInstanceId);
    expect(nestedAfterParent.prefab.ownerInstanceId).toBe(placed.instanceId);
    expect(nestedAfterParent.getComponent('Brush').materialId).toBe('mat_door_override');

    // 2) Nested source update
    {
      const actors = structuredClone(defs.prefab_door.actors);
      actors[0].name = 'DoorV2';
      actors[0].components[0].color = '#112233';
      defs.prefab_door = normalizePrefabDefinition({ ...defs.prefab_door, actors });
    }
    syncPrefabInstances(world, defs.prefab_door, { getDefinition });

    const nestedAfterDoor = world.getActor(nestedActorId);
    expect(nestedAfterDoor).toBeTruthy();
    expect(nestedAfterDoor.prefab.instanceId).toBe(nestedInstanceId);
    expect(nestedAfterDoor.name).toBe('DoorV2');
    expect(nestedAfterDoor.getComponent('Brush').color).toBe('#112233');
    // Nested material override survives nested source sync
    expect(nestedAfterDoor.getComponent('Brush').materialId).toBe('mat_door_override');
    const nestedRoot2 = findInstanceRoot(world, nestedInstanceId);
    expect(getOverrides(nestedRoot2)[nestedTemplateId].components.Brush.materialId)
      .toBe('mat_door_override');

    // 3) Parent source update again
    {
      const actors = structuredClone(defs.prefab_room.actors);
      actors.find((a) => a.id === wallTplId).components[0].materialId = 'mat_wall_v3';
      defs.prefab_room = normalizePrefabDefinition({ ...defs.prefab_room, actors });
    }
    syncPrefabInstances(world, defs.prefab_room, { getDefinition });

    expect(world.getActor(wallId).getComponent('Brush').materialId).toBe('mat_wall_v3');
    const nestedFinal = world.getActor(nestedActorId);
    expect(nestedFinal).toBeTruthy();
    expect(nestedFinal.prefab.prefabId).toBe('prefab_door');
    expect(nestedFinal.prefab.instanceId).toBe(nestedInstanceId);
    expect(nestedFinal.name).toBe('DoorV2');
    expect(nestedFinal.getComponent('Brush').materialId).toBe('mat_door_override');
    expect(nestedFinal.getComponent('Brush').color).toBe('#112233');
  });
});
