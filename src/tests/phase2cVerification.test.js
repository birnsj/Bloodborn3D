import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { createCellActor } from '../editor/cellFactory.js';
import { createStaticMeshActor } from '../editor/meshFactory.js';
import {
  getWorldTransform,
  reparentActor,
  setWorldTransform,
} from '../core/hierarchy.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
  syncPrefabInstances,
  setOverride,
  getOverrides,
} from '../prefabs/prefabOps.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { toMeters } from '../core/units.js';

function brush(id, pos, opts = {}) {
  return new Actor({
    id,
    name: id,
    parentId: opts.parentId || null,
    transform: new Transform({ position: pos, rotation: opts.rotation }),
    components: [
      new BrushComponent({
        id: `c_${id}`,
        size: opts.size || { x: 100, y: 200, z: 25 },
        materialId: opts.materialId || null,
        collidable: opts.collidable !== false,
      }),
    ],
  });
}

function colliderTranslation(physics, actorId) {
  const entry = physics._bodies.get(actorId);
  if (!entry) return null;
  const t = entry.body.translation();
  return { x: t.x, y: t.y, z: t.z };
}

describe('Phase 2C recommended verification', () => {
  it('furnished cell + two prefab instances: source update, overrides, nested, save/reload, play/stop, cell rotate with mesh', async () => {
    const world = new World({ name: 'Verify2C', schemaVersion: 2 });

    // --- Build a furnished room cell ---
    const cell = createCellActor({ name: 'Furnished Room', position: { x: 0, y: 0, z: 0 } });
    world.addActor(cell);

    const floor = brush('floor', { x: 0, y: 12.5, z: 0 }, {
      parentId: cell.id,
      size: { x: 400, y: 25, z: 400 },
      materialId: 'mat_floor',
    });
    const wall = brush('wall', { x: 0, y: 150, z: -200 }, {
      parentId: cell.id,
      size: { x: 400, y: 300, z: 25 },
      materialId: 'mat_wall',
    });
    const lamp = brush('lamp', { x: 100, y: 80, z: 50 }, {
      parentId: cell.id,
      size: { x: 40, y: 80, z: 40 },
      materialId: 'mat_lamp',
    });
    world.addActor(floor);
    world.addActor(wall);
    world.addActor(lamp);

    // Imported mesh inside the cell (collidable box)
    const mesh = createStaticMeshActor({
      assetId: 'mesh_verify_cube',
      name: 'Crate',
      position: { x: -100, y: 50, z: 100 },
      gridSize: 25,
      collidable: true,
      collisionType: 'box',
    });
    mesh.parentId = cell.id;
    world.addActor(mesh);

    // Nested door prefab first
    const doorSrc = brush('door_src', { x: 0, y: 100, z: 0 }, {
      size: { x: 100, y: 200, z: 20 },
      materialId: 'mat_door',
    });
    world.addActor(doorSrc);
    const doorPrefab = createPrefabFromActors(world, ['door_src'], {
      id: 'prefab_door',
      name: 'Door',
    });
    expect(doorPrefab.ok).toBe(true);

    const doorPlace = instantiatePrefab(doorPrefab.definition, world, {
      position: { x: 150, y: 100, z: -180 },
    });
    const doorRoot = world.getActor(doorPlace.rootActorIds[0]);
    reparentActor(doorRoot, cell.id, world);

    // Save furnished cell as room prefab (includes nested door + mesh)
    const roomPrefab = createPrefabFromActors(world, [cell.id], {
      id: 'prefab_room',
      name: 'Furnished Room',
      getDefinition: (id) => (id === 'prefab_door' ? doorPrefab.definition : null),
    });
    expect(roomPrefab.ok).toBe(true);
    expect(roomPrefab.definition.nestedPrefabIds).toContain('prefab_door');
    expect(roomPrefab.definition.actors.length).toBeGreaterThanOrEqual(5);

    // Place two room instances elsewhere
    const instA = instantiatePrefab(roomPrefab.definition, world, {
      position: { x: 1000, y: 0, z: 0 },
    });
    const instB = instantiatePrefab(roomPrefab.definition, world, {
      position: { x: 2000, y: 0, z: 500 },
    });
    expect(instA.instanceId).not.toBe(instB.instanceId);

    const rootA = world.getActor(instA.rootActorIds[0]);
    const rootB = world.getActor(instB.rootActorIds[0]);
    expect(rootA.prefab.prefabId).toBe('prefab_room');
    expect(rootB.prefab.prefabId).toBe('prefab_room');

    // Find by matching source template name via definition
    const lampTpl = roomPrefab.definition.actors.find((a) => a.name === 'lamp');
    const meshTpl = roomPrefab.definition.actors.find((a) => a.name === 'Crate');
    const wallTpl = roomPrefab.definition.actors.find((a) => a.name === 'wall');
    expect(lampTpl).toBeTruthy();
    expect(meshTpl).toBeTruthy();
    expect(wallTpl).toBeTruthy();

    const findByTemplate = (instanceId, templateId) => world.actors.find((a) => (
      (a.prefab?.instanceId === instanceId && a.prefab?.templateId === templateId)
      || (a.prefab?.ownerInstanceId === instanceId && a.prefab?.ownerTemplateId === templateId)
    ));

    const lampAActor = findByTemplate(instA.instanceId, lampTpl.id);
    const lampBActor = findByTemplate(instB.instanceId, lampTpl.id);
    const meshAActor = findByTemplate(instA.instanceId, meshTpl.id);
    expect(lampAActor).toBeTruthy();
    expect(meshAActor).toBeTruthy();
    expect(findByTemplate(instA.instanceId, wallTpl.id)).toBeTruthy();

    const lampAWorldBefore = getWorldTransform(lampAActor, world);
    expect(lampAWorldBefore.position.x).toBeCloseTo(1000 + 100, 3);
    expect(getWorldTransform(lampBActor, world).position.x).toBeCloseTo(2000 + 100, 3);

    // --- Instance override on A (material + local transform) ---
    lampAActor.getComponent('Brush').materialId = 'mat_override';
    setWorldTransform(lampAActor, {
      ...getWorldTransform(lampAActor, world),
      position: {
        x: lampAWorldBefore.position.x + 50,
        y: lampAWorldBefore.position.y,
        z: lampAWorldBefore.position.z,
      },
    }, world);
    setOverride(rootA, lampTpl.id, {
      transform: lampAActor.transform.toJSON(),
      components: { Brush: { materialId: 'mat_override' } },
    });

    // --- Source update: change wall material + lamp default material ---
    wallTpl.components[0].materialId = 'mat_wall_v2';
    lampTpl.components[0].materialId = 'mat_lamp_v2';
    const updatedRoom = normalizePrefabDefinition({
      ...roomPrefab.definition,
      actors: roomPrefab.definition.actors,
      updatedAt: Date.now(),
    });

    const overrideBeforeSync = getOverrides(rootA);
    const getDefinition = (id) => {
      if (id === 'prefab_room') return updatedRoom;
      if (id === 'prefab_door') return doorPrefab.definition;
      return null;
    };
    syncPrefabInstances(world, updatedRoom, { getDefinition });

    const rootAAfter = world.getActor(instA.rootActorIds[0]);
    const rootBAfter = world.getActor(instB.rootActorIds[0]);
    expect(rootAAfter).toBeTruthy();
    expect(rootBAfter).toBeTruthy();
    expect(rootAAfter.prefab.instanceId).toBe(instA.instanceId);
    expect(rootBAfter.prefab.instanceId).toBe(instB.instanceId);

    // Overrides must survive
    const overridesAfter = getOverrides(rootAAfter);
    expect(overridesAfter[lampTpl.id]?.components?.Brush?.materialId).toBe('mat_override');
    expect(overrideBeforeSync[lampTpl.id]).toBeTruthy();

    const lampAAfter = findByTemplate(instA.instanceId, lampTpl.id);
    const lampBAfter = findByTemplate(instB.instanceId, lampTpl.id);
    const wallAAfter = findByTemplate(instA.instanceId, wallTpl.id);
    const wallBAfter = findByTemplate(instB.instanceId, wallTpl.id);

    expect(lampAAfter.getComponent('Brush').materialId).toBe('mat_override');
    expect(lampBAfter.getComponent('Brush').materialId).toBe('mat_lamp_v2');
    expect(wallAAfter.getComponent('Brush').materialId).toBe('mat_wall_v2');
    expect(wallBAfter.getComponent('Brush').materialId).toBe('mat_wall_v2');

    // Override transform survives (world X shifted +50 on A only)
    expect(getWorldTransform(lampAAfter, world).position.x).toBeCloseTo(1000 + 100 + 50, 2);
    expect(getWorldTransform(lampBAfter, world).position.x).toBeCloseTo(2000 + 100, 2);

    // --- Nested door source update ---
    doorPrefab.definition.actors[0].components[0].materialId = 'mat_door_v2';
    doorPrefab.definition.actors[0].name = 'DoorUpdated';
    syncPrefabInstances(world, normalizePrefabDefinition(doorPrefab.definition));

    const nestedDoors = world.actors.filter((a) => a.prefab?.prefabId === 'prefab_door');
    expect(nestedDoors.length).toBeGreaterThanOrEqual(2); // original + inside each room instance at least
    for (const d of nestedDoors) {
      // Original source actor may still exist without being an instance of updated sync groups
      if (d.prefab?.instanceId) {
        expect(d.getComponent('Brush').materialId).toBe('mat_door_v2');
        expect(d.name).toBe('DoorUpdated');
      }
    }

    // --- Move/rotate parent cell with mesh inside (authored cell, not instance) ---
    setWorldTransform(cell, {
      position: { x: 250, y: 0, z: 100 },
      rotation: { x: 0, y: 90, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }, world);

    const meshWorld = getWorldTransform(mesh, world);
    // XYZ yaw 90°: local (-100,50,100) → world offset (100,50,100) + cell (250,0,100)
    expect(meshWorld.position.x).toBeCloseTo(350, 1);
    expect(meshWorld.position.y).toBeCloseTo(50, 1);
    expect(meshWorld.position.z).toBeCloseTo(200, 1);
    expect(meshWorld.rotation.y).toBeCloseTo(90, 1);
    // Local offset preserved (mesh still parented under cell)
    expect(mesh.parentId).toBe(cell.id);
    expect(mesh.transform.position.x).toBeCloseTo(-100, 3);
    expect(mesh.transform.position.z).toBeCloseTo(100, 3);

    // Child brush relative offset also follows
    const wallWorld = getWorldTransform(wall, world);
    expect(wallWorld.position.y).toBeCloseTo(150, 1);

    // --- Physics colliders use world transforms ---
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);

    const meshCol = colliderTranslation(physics, mesh.id);
    expect(meshCol).toBeTruthy();
    expect(meshCol.x).toBeCloseTo(toMeters(meshWorld.position.x), 3);
    expect(meshCol.y).toBeCloseTo(toMeters(meshWorld.position.y), 3);
    expect(meshCol.z).toBeCloseTo(toMeters(meshWorld.position.z), 3);

    const wallCol = colliderTranslation(physics, wall.id);
    expect(wallCol.x).toBeCloseTo(toMeters(wallWorld.position.x), 3);
    expect(wallCol.z).toBeCloseTo(toMeters(wallWorld.position.z), 3);

    const lampAWorld = getWorldTransform(lampAAfter, world);
    const lampACol = colliderTranslation(physics, lampAAfter.id);
    expect(lampACol.x).toBeCloseTo(toMeters(lampAWorld.position.x), 3);

    // --- Save / reload ---
    const saved = serializeLevel(world);
    expect(saved.schemaVersion).toBe(2);
    const reloaded = deserializeLevel(saved);

    const reRootA = reloaded.getActor(instA.rootActorIds[0]);
    expect(reRootA.prefab.prefabId).toBe('prefab_room');
    expect(reRootA.prefab.instanceId).toBe(instA.instanceId);
    expect(getOverrides(reRootA)[lampTpl.id].components.Brush.materialId).toBe('mat_override');

    const reMesh = reloaded.getActor(mesh.id);
    expect(reMesh.parentId).toBe(cell.id);
    expect(getWorldTransform(reMesh, reloaded).position.x).toBeCloseTo(meshWorld.position.x, 2);
    expect(getWorldTransform(reMesh, reloaded).rotation.y).toBeCloseTo(90, 1);

    const reLampA = reloaded.actors.find((a) => a.id === lampAAfter.id);
    expect(reLampA.getComponent('Brush').materialId).toBe('mat_override');
    expect(getWorldTransform(reLampA, reloaded).position.x).toBeCloseTo(lampAWorld.position.x, 2);

    // Colliders after reload still match
    physics.buildFromWorld(reloaded);
    const reMeshCol = colliderTranslation(physics, mesh.id);
    expect(reMeshCol.x).toBeCloseTo(toMeters(meshWorld.position.x), 3);
    expect(reMeshCol.z).toBeCloseTo(toMeters(meshWorld.position.z), 3);

    // --- Play / Stop snapshot restoration ---
    const authoredSnapshot = serializeLevel(reloaded);
    // Mutate during "play"
    reRootA.name = 'MUTATED_IN_PLAY';
    reMesh.transform.position.x += 999;
    reLampA.getComponent('Brush').materialId = 'mat_play_junk';

    const restored = deserializeLevel(authoredSnapshot);
    const authoredMesh = authoredSnapshot.actors.find((a) => a.id === mesh.id);
    expect(restored.getActor(instA.rootActorIds[0]).name).toBe(rootAAfter.name);
    expect(restored.getActor(mesh.id).transform.position).toEqual(authoredMesh.transform.position);
    expect(restored.getActor(lampAAfter.id).getComponent('Brush').materialId).toBe('mat_override');
    expect(getOverrides(restored.getActor(instA.rootActorIds[0]))[lampTpl.id]).toBeTruthy();
    expect(serializeLevel(restored)).toEqual(authoredSnapshot);

    // No broken prefab references after restore
    for (const actor of restored.actors) {
      if (!actor.prefab?.prefabId) continue;
      expect(actor.prefab.instanceId).toBeTruthy();
      if (actor.parentId) {
        expect(restored.getActor(actor.parentId)).toBeTruthy();
      }
    }

    physics.dispose();
  });
});
