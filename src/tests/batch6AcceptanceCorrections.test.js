/**
 * Batch 5/6 acceptance gap closure: StaticMesh/PrimitiveMesh prefab round-trip
 * and physics collider inventory for acceptance-static-meshes.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { PrimitiveMeshComponent } from '../components/PrimitiveMeshComponent.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
  syncPrefabInstances,
  unpackPrefabInstance,
  getOverrides,
  setOverride,
  getInstanceActors,
  captureOverrideFromActor,
} from '../prefabs/prefabOps.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetStaticMeshPropertiesCommand } from '../editor/history/commands.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { seedLoadedMeshMeta, seedLoadedMeshScene, clearMeshCache } from '../runtime/meshLoader.js';
import * as THREE from 'three';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVEL = path.join(__dirname, '../../public/levels/acceptance-static-meshes.json');

function staticMeshActor(id, fields = {}) {
  return new Actor({
    id,
    name: id,
    tags: ['mesh', 'prop'],
    transform: new Transform({
      position: fields.position || { x: 0, y: 50, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }),
    components: [
      new StaticMeshComponent({
        id: `c_${id}`,
        assetId: 'mesh_verify_cube',
        collidable: true,
        collisionType: 'box',
        materialOverrides: { 'Mesh_0:0': 'mat_batch2_metal' },
        lodLevels: [
          { assetId: 'mesh_verify_cube', distance: 0 },
          { assetId: 'mesh_verify_cube', distance: 400 },
        ],
        lodHysteresis: 25,
        lodPreview: -1,
        castShadow: true,
        instancing: 'off',
        showCollision: true,
        collisionOffset: { x: 10, y: 0, z: 0 },
        collisionSize: { x: 120, y: 120, z: 120 },
        ...fields,
      }),
    ],
  });
}

function primitiveActor(id, fields = {}) {
  return new Actor({
    id,
    name: id,
    tags: ['prop'],
    transform: new Transform({
      position: fields.position || { x: 200, y: 50, z: 0 },
    }),
    components: [
      new PrimitiveMeshComponent({
        id: `c_${id}`,
        primitive: 'cone',
        radius: 50,
        height: 120,
        collidable: true,
        collisionType: 'convex',
        materialId: 'mat_batch2_standard',
        castShadow: true,
        ...fields,
      }),
    ],
  });
}

describe('Batch 6 acceptance — prefab round-trip (StaticMesh + PrimitiveMesh)', () => {
  it('captures collision, material overrides, and LOD into prefab templates', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const sm = staticMeshActor('sm1');
    const prim = primitiveActor('prim1');
    world.addActor(sm);
    world.addActor(prim);

    const created = createPrefabFromActors(world, ['sm1', 'prim1'], {
      name: 'Batch6 Prop Prefab',
      id: 'prefab_batch6_props',
    });
    expect(created.ok).toBe(true);
    expect(created.definition.actors).toHaveLength(2);

    const smTpl = created.definition.actors.find((a) => a.components?.some((c) => c.type === 'StaticMesh'));
    const primTpl = created.definition.actors.find((a) => a.components?.some((c) => c.type === 'PrimitiveMesh'));
    const smComp = smTpl.components.find((c) => c.type === 'StaticMesh');
    const primComp = primTpl.components.find((c) => c.type === 'PrimitiveMesh');

    expect(smComp.collisionType).toBe('box');
    expect(smComp.materialOverrides['Mesh_0:0']).toBe('mat_batch2_metal');
    expect(smComp.lodLevels).toHaveLength(2);
    expect(smComp.lodHysteresis).toBe(25);
    expect(smComp.collisionOffset.x).toBe(10);
    expect(primComp.collisionType).toBe('convex');
    expect(primComp.primitive).toBe('cone');
    expect(primComp.materialId).toBe('mat_batch2_standard');
  });

  it('instantiates multiple instances with independent overrides, then save/reload', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(staticMeshActor('src_sm'));
    world.addActor(primitiveActor('src_prim'));

    const created = createPrefabFromActors(world, ['src_sm', 'src_prim'], {
      name: 'Batch6 Props',
      id: 'prefab_b6',
    });
    expect(created.ok).toBe(true);
    const def = created.definition;

    const a = instantiatePrefab(def, world, { position: { x: 0, y: 0, z: 0 } });
    const b = instantiatePrefab(def, world, { position: { x: 300, y: 0, z: 0 } });
    expect(a.instanceId).not.toBe(b.instanceId);

    const membersA = getInstanceActors(world, a.instanceId);
    const membersB = getInstanceActors(world, b.instanceId);
    expect(membersA).toHaveLength(2);
    expect(membersB).toHaveLength(2);
    const ids = new Set([...membersA, ...membersB].map((m) => m.id));
    expect(ids.size).toBe(4);

    const rootA = world.getActor(a.rootActorIds[0]);
    const smA = membersA.find((m) => m.getComponent('StaticMesh'));
    expect(smA).toBeTruthy();

    // Instance A override: different collision + material
    setOverride(rootA, smA.prefab.templateId, {
      components: {
        StaticMesh: {
          collisionType: 'sphere',
          collidable: true,
          materialOverrides: { 'Mesh_0:0': 'mat_hall_wood' },
          lodPreview: 1,
        },
      },
    });
    syncPrefabInstances(world, def);
    const smAAfter = world.getActor(smA.id).getComponent('StaticMesh');
    expect(smAAfter.collisionType).toBe('sphere');
    expect(smAAfter.materialOverrides['Mesh_0:0']).toBe('mat_hall_wood');
    expect(smAAfter.lodPreview).toBe(1);

    // Instance B keeps source values
    const smB = membersB.find((m) => m.getComponent('StaticMesh'));
    const smBComp = world.getActor(smB.id).getComponent('StaticMesh');
    expect(smBComp.collisionType).toBe('box');
    expect(smBComp.materialOverrides['Mesh_0:0']).toBe('mat_batch2_metal');

    // Save / reload
    const json = serializeLevel(world);
    const reloaded = deserializeLevel(json);
    const reA = getInstanceActors(reloaded, a.instanceId);
    const reB = getInstanceActors(reloaded, b.instanceId);
    expect(reA).toHaveLength(2);
    expect(reB).toHaveLength(2);
    const reSmA = reA.find((m) => m.getComponent('StaticMesh')).getComponent('StaticMesh');
    const reSmB = reB.find((m) => m.getComponent('StaticMesh')).getComponent('StaticMesh');
    expect(reSmA.collisionType).toBe('sphere');
    expect(reSmA.materialOverrides['Mesh_0:0']).toBe('mat_hall_wood');
    expect(reSmA.lodLevels).toHaveLength(2);
    expect(reSmB.collisionType).toBe('box');
    const rePrim = reA.find((m) => m.getComponent('PrimitiveMesh')).getComponent('PrimitiveMesh');
    expect(rePrim.collisionType).toBe('convex');
    expect(rePrim.assetId || rePrim.primitive).toBeTruthy();
    expect(rePrim.primitive).toBe('cone');
  });

  it('Apply/Revert-style override capture and unpack preserve identity', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    world.addActor(staticMeshActor('src'));
    const created = createPrefabFromActors(world, ['src'], { id: 'prefab_one', name: 'One' });
    const placed = instantiatePrefab(created.definition, world, { position: { x: 10, y: 0, z: 0 } });
    const root = world.getActor(placed.rootActorIds[0]);
    const member = getInstanceActors(world, placed.instanceId)[0];
    const mesh = member.getComponent('StaticMesh');
    mesh.collisionType = 'capsule';
    mesh.collidable = true;
    mesh.collisionRadius = 40;
    captureOverrideFromActor(root, member, created.definition.actors[0]);
    const ov = getOverrides(root);
    expect(ov[member.prefab.templateId]?.components?.StaticMesh?.collisionType).toBe('capsule');

    const beforeUnpack = member.id;
    unpackPrefabInstance(world, placed.instanceId);
    expect(world.getActor(beforeUnpack)).toBeTruthy();
    expect(world.getActor(beforeUnpack).prefab).toBeFalsy();
    expect(world.getActor(beforeUnpack).getComponent('StaticMesh').collisionType).toBe('capsule');
  });

  it('undo restores StaticMesh property edits used by prefab authoring', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const actor = staticMeshActor('edit_me');
    world.addActor(actor);
    const history = new HistoryStack();
    const mesh = actor.getComponent('StaticMesh');
    history.execute(new SetStaticMeshPropertiesCommand({
      world,
      actorId: actor.id,
      before: { collisionType: mesh.collisionType, collidable: mesh.collidable },
      after: { collisionType: 'trimesh', collidable: true },
      label: 'Edit static mesh',
    }));
    expect(mesh.collisionType).toBe('trimesh');
    history.undo();
    expect(mesh.collisionType).toBe('box');
    history.redo();
    expect(mesh.collisionType).toBe('trimesh');
  });

  it('duplicate via ReplaceActorsCommand keeps independent StaticMesh ids', () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const a = staticMeshActor('a');
    world.addActor(a);
    const created = createPrefabFromActors(world, ['a'], { id: 'prefab_dup', name: 'Dup' });
    const p1 = instantiatePrefab(created.definition, world, { position: { x: 0, y: 0, z: 0 } });
    const p2 = instantiatePrefab(created.definition, world, { position: { x: 100, y: 0, z: 0 } });
    const ids1 = getInstanceActors(world, p1.instanceId).map((m) => m.id);
    const ids2 = getInstanceActors(world, p2.instanceId).map((m) => m.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    // Selection identity: each actor remains addressable
    for (const id of [...ids1, ...ids2]) {
      expect(world.getActor(id).getComponent('StaticMesh').assetId).toBe('mesh_verify_cube');
    }
  });
});

describe('Batch 6 acceptance — physics collider inventory', () => {
  beforeAll(() => {
    clearMeshCache();
  });

  it('applies collisionSize and collisionOffset to box colliders', async () => {
    clearMeshCache();
    const url = '/assets/meshes/mesh_verify_cube.glb';
    seedLoadedMeshMeta(url, {
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 0, z: 0 },
    });
    const world = new World({ name: 'Off', schemaVersion: 2 });
    world.addActor(staticMeshActor('off_box', {
      position: { x: 0, y: 0, z: 0 },
      collisionType: 'box',
      collidable: true,
      collisionSize: { x: 200, y: 100, z: 50 },
      collisionOffset: { x: 100, y: 0, z: 0 },
      lodLevels: [],
      materialOverrides: {},
    }));
    const physics = new PhysicsWorld({
      assetResolver: { getMeshUrl: (id) => (id ? `/assets/meshes/${id}.glb` : null) },
    });
    await physics.init();
    physics.buildFromWorld(world);
    const half = physics.getColliderHalfExtents('off_box');
    const local = physics.getColliderLocalTranslation('off_box');
    // 200/100/50 eu → 2/1/0.5 m full → half 1 / 0.5 / 0.25
    expect(half.x).toBeCloseTo(1, 3);
    expect(half.y).toBeCloseTo(0.5, 3);
    expect(half.z).toBeCloseTo(0.25, 3);
    // offset 100 eu = 1 m (+ AABB center 0)
    expect(local.x).toBeCloseTo(1, 3);
    physics.dispose();
  });

  it('builds expected collider presence for acceptance-static-meshes actors', async () => {
    const raw = JSON.parse(readFileSync(LEVEL, 'utf8'));
    const world = deserializeLevel(raw);

    // Seed verify-cube geometry so convex/trimesh paths can extract if used
    const url = '/assets/meshes/mesh_verify_cube.glb';
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    seedLoadedMeshMeta(url, {
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 0, z: 0 },
    });
    seedLoadedMeshScene(url, root);

    const physics = new PhysicsWorld({
      assetResolver: {
        getMeshUrl: (id) => (id ? `/assets/meshes/${id}.glb` : null),
      },
    });
    await physics.init();
    await physics.preloadStaticMeshColliders(world);
    physics.buildFromWorld(world);

    const report = [];
    for (const actor of world.actors) {
      const sm = actor.getComponent('StaticMesh');
      const prim = actor.getComponent('PrimitiveMesh');
      const brush = actor.getComponent('Brush');
      if (!sm && !prim && !brush) continue;
      const count = physics.getColliderCount(actor.id);
      const half = physics.getColliderHalfExtents(actor.id);
      const offset = physics.getColliderLocalTranslation(actor.id);
      report.push({
        name: actor.name,
        kind: sm ? 'StaticMesh' : prim ? 'PrimitiveMesh' : 'Brush',
        collisionType: sm?.collisionType || prim?.collisionType || (brush ? 'brush' : null),
        collidable: sm ? sm.collidable : prim ? prim.collidable !== false : brush?.collidable !== false,
        colliderCount: count,
        halfExtents: half,
        localOffset: offset,
      });
    }

    const none = report.find((r) => r.name.includes('No Collision'));
    expect(none.collidable).toBe(false);
    expect(none.colliderCount).toBe(0);

    const boxed = report.filter((r) => r.kind === 'StaticMesh' && r.collidable && r.collisionType !== 'none');
    expect(boxed.every((r) => r.colliderCount >= 1)).toBe(true);

    const floor = report.find((r) => r.name === 'Floor' || r.kind === 'Brush');
    expect(floor.colliderCount).toBeGreaterThanOrEqual(1);

    const cone = report.find((r) => r.name.includes('Cone'));
    expect(cone.colliderCount).toBeGreaterThanOrEqual(1);

    // LOD actor still has collision (visual LOD independent)
    const lod = report.find((r) => r.name.includes('LOD'));
    expect(lod.colliderCount).toBeGreaterThanOrEqual(1);

    physics.dispose();
  });
});
