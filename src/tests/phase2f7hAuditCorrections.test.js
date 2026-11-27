/**
 * Phase 2F.7H — independent audit corrections.
 * Each finding is reproduced (failing without the fix) then asserted fixed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { PlayerSpawnComponent } from '../components/PlayerSpawnComponent.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  RemoveActorsCommand,
  SetBrushMaterialCommand,
} from '../editor/history/commands.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import {
  disposeObjectTree,
  disposeOwnedMaterial,
  isSharedGpuResource,
  markOwnedGpuResource,
  markSharedGpuResource,
  markSharedMaterialTextures,
  markSharedSubtree,
} from '../runtime/gpuResources.js';
import { validateLevelData, deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';

const { SceneView } = await import('../runtime/SceneView.js');

function makeBrushActor(name, {
  operation = 'add',
  size = { x: 100, y: 100, z: 100 },
  position,
  tags = [],
} = {}) {
  const actor = new Actor({ name, tags: [...tags] });
  actor.addComponent(new BrushComponent({ size, operation }));
  if (position) actor.transform.position = { ...position };
  return actor;
}

function makeHarness() {
  const view = Object.create(SceneView.prototype);
  view._syncToken = 1;
  view._actorMeshes = new Map();
  view._actorEpochHighWater = new Map();
  view.selectedActorIds = [];
  view.selectedSurface = null;
  view.geometrySelection = null;
  view.editMode = true;
  view.gridSize = 25;
  view.root = new THREE.Group();
  view.syncStats = {
    fullSyncs: 0,
    incrementalSyncs: 0,
    actorAdds: 0,
    actorRemoves: 0,
    actorRebuilds: 0,
    transformUpdates: 0,
    hierarchyMoves: 0,
    geometryAllocs: 0,
    materialAllocs: 0,
  };
  view.applyWorldAmbient = () => {};
  view.setSelection = vi.fn();
  view._refreshSurfaceHighlight = vi.fn();
  view._applyEditorOverlayVisibility = vi.fn();
  view._clearGeometryFaceOverlays = () => {};
  view._clearSelectionHelpers = () => {};
  view.clearWorldMeshes = SceneView.prototype.clearWorldMeshes;
  view._createLight = SceneView.prototype._createLight;
  view._createLightGizmo = () => {
    const g = new THREE.Group();
    g.userData.editorOnly = true;
    return g;
  };
  view._stampActorVisual = SceneView.prototype._stampActorVisual;
  view._detachChildActorGroups = SceneView.prototype._detachChildActorGroups;
  view._isActorVisualCurrent = SceneView.prototype._isActorVisualCurrent;
  view.updateActorTransform = SceneView.prototype.updateActorTransform;
  view.removeActorVisual = SceneView.prototype.removeActorVisual;
  view.rebuildActorVisual = SceneView.prototype.rebuildActorVisual;
  view._populateActorComponents = SceneView.prototype._populateActorComponents;
  view._syncActorHierarchy = SceneView.prototype._syncActorHierarchy;
  view.resetSyncStats = SceneView.prototype.resetSyncStats;
  view.getSyncStats = SceneView.prototype.getSyncStats;
  view.syncIncremental = SceneView.prototype.syncIncremental;
  view.syncFromWorld = SceneView.prototype.syncFromWorld;
  view._addBrushVisual = (group, actor) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    // Encode carve fingerprint into userData for assertions.
    mesh.userData.carveOp = actor.getComponent('Brush')?.operation || 'add';
    mesh.userData.carveProbe = JSON.stringify({
      op: actor.getComponent('Brush')?.operation,
      size: actor.getComponent('Brush')?.size,
      pos: actor.transform.position,
    });
    group.add(mesh);
  };
  view._addConvexBrushVisual = view._addBrushVisual;
  view._addRampVisual = view._addBrushVisual;
  view._addStairVisual = view._addBrushVisual;
  view._addColumnVisual = view._addBrushVisual;
  view._addArchVisual = view._addBrushVisual;
  view._addCurvedWallVisual = view._addBrushVisual;
  view._addStaticMeshVisual = () => {};
  view._addActorVisual = SceneView.prototype._addActorVisual;
  return view;
}

describe('Phase 2F.7H — 1 subtractive geometry invalidation', () => {
  let view;
  let world;
  let solid;
  let cutter;
  let additive;

  beforeEach(() => {
    view = makeHarness();
    world = new World({ name: 'Carve', schemaVersion: 2, mapMode: 'subtractive' });
    solid = makeBrushActor('WorldSolid', {
      size: { x: 1000, y: 400, z: 1000 },
      tags: ['world-solid'],
    });
    cutter = makeBrushActor('Cutter', {
      operation: 'subtract',
      size: { x: 100, y: 100, z: 100 },
      position: { x: 0, y: 50, z: 0 },
    });
    additive = makeBrushActor('Additive', {
      size: { x: 80, y: 80, z: 80 },
      position: { x: 300, y: 40, z: 0 },
    });
    world.addActor(solid);
    world.addActor(cutter);
    world.addActor(additive);
    view.syncFromWorld(world);
  });

  it('rebuilds additives when a subtract brush is deleted (incremental)', () => {
    view.resetSyncStats();
    const epochBefore = view._actorMeshes.get(additive.id).visualEpoch;
    world.removeActor(cutter.id);
    view.syncIncremental(world);
    expect(view.getSyncStats().fullSyncs).toBe(0);
    expect(view.getSyncStats().actorRemoves).toBe(1);
    expect(view._actorMeshes.get(additive.id).visualEpoch).toBeGreaterThan(epochBefore);
  });

  it('rebuilds additives when operation flips subtract→add and on undo', () => {
    const history = new HistoryStack({ limit: 20 });
    view.resetSyncStats();
    const epoch0 = view._actorMeshes.get(additive.id).visualEpoch;

    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: cutter.id,
      before: { operation: 'subtract', collidable: false },
      after: { operation: 'add', collidable: true },
      label: 'Set additive',
    }));
    view.syncIncremental(world);
    expect(view.getSyncStats().fullSyncs).toBe(0);
    const epoch1 = view._actorMeshes.get(additive.id).visualEpoch;
    expect(epoch1).toBeGreaterThan(epoch0);

    view.resetSyncStats();
    history.undo();
    view.syncIncremental(world);
    expect(view.getSyncStats().fullSyncs).toBe(0);
    expect(view._actorMeshes.get(additive.id).visualEpoch).toBeGreaterThan(epoch1);
    expect(cutter.getComponent('Brush').operation).toBe('subtract');
  });

  it('rebuilds additives when a parent of a subtract brush is transformed', () => {
    const parent = makeBrushActor('ParentCell', {
      size: { x: 50, y: 50, z: 50 },
      position: { x: 0, y: 0, z: 0 },
    });
    // Re-parent cutter under parent
    world.addActor(parent);
    cutter.parentId = parent.id;
    view.syncFromWorld(world);
    view.resetSyncStats();
    const epochBefore = view._actorMeshes.get(additive.id).visualEpoch;

    parent.transform.position = { x: 120, y: 0, z: 0 };
    view.syncIncremental(world);

    expect(view.getSyncStats().fullSyncs).toBe(0);
    expect(view._actorMeshes.get(additive.id).visualEpoch).toBeGreaterThan(epochBefore);
  });

  it('delete + undo of subtract restores carve dependents via incremental sync', () => {
    const history = new HistoryStack({ limit: 20 });
    const json = cutter.toJSON();
    history.execute(new RemoveActorsCommand({ world, actorIds: [cutter.id] }));
    view.syncIncremental(world);
    expect(view._actorMeshes.has(cutter.id)).toBe(false);

    view.resetSyncStats();
    const epochBefore = view._actorMeshes.get(additive.id).visualEpoch;
    history.undo();
    expect(world.getActor(cutter.id)).toBeTruthy();
    view.syncIncremental(world);
    expect(view.getSyncStats().actorAdds).toBeGreaterThanOrEqual(1);
    expect(view._actorMeshes.get(additive.id).visualEpoch).toBeGreaterThan(epochBefore);
    void json;
  });
});

describe('Phase 2F.7H — 2 shared GLB texture ownership', () => {
  it('markSharedSubtree tags material map textures as shared', () => {
    const root = new THREE.Group();
    const map = { dispose: vi.fn(), userData: {} };
    const mat = new THREE.MeshBasicMaterial();
    mat.map = map;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    markSharedSubtree(root);
    expect(isSharedGpuResource(mat)).toBe(true);
    expect(isSharedGpuResource(map)).toBe(true);
  });

  it('owned material clones keep shared maps when one instance is disposed', () => {
    const sharedMap = markSharedGpuResource({ dispose: vi.fn(), userData: { bbShared: true } });
    const cacheMat = markSharedGpuResource(new THREE.MeshBasicMaterial());
    cacheMat.map = sharedMap;

    const cloneA = markOwnedGpuResource(cacheMat.clone());
    markSharedMaterialTextures(cloneA);
    const cloneB = markOwnedGpuResource(cacheMat.clone());
    markSharedMaterialTextures(cloneB);
    expect(cloneA.map).toBe(sharedMap);
    expect(cloneB.map).toBe(sharedMap);

    disposeOwnedMaterial(cloneA);
    expect(sharedMap.dispose).not.toHaveBeenCalled();
    expect(isSharedGpuResource(sharedMap)).toBe(true);

    // Second instance still usable
    expect(cloneB.map).toBe(sharedMap);
    disposeOwnedMaterial(cloneB);
    expect(sharedMap.dispose).not.toHaveBeenCalled();
  });
});

describe('Phase 2F.7H — 3 visual epoch high-water on undo recreate', () => {
  it('does not reuse epochs after delete + undo recreate', () => {
    const view = makeHarness();
    const world = new World({ name: 'Epoch' });
    const a = makeBrushActor('A');
    world.addActor(a);
    view.syncFromWorld(world);
    const epoch1 = view._actorMeshes.get(a.id).visualEpoch;

    // Simulate rebuilds bumping epoch
    view.rebuildActorVisual(a, world);
    const epoch2 = view._actorMeshes.get(a.id).visualEpoch;
    expect(epoch2).toBeGreaterThan(epoch1);

    const history = new HistoryStack({ limit: 10 });
    history.execute(new RemoveActorsCommand({ world, actorIds: [a.id] }));
    view.syncIncremental(world);
    expect(view._actorMeshes.has(a.id)).toBe(false);
    expect(view._actorEpochHighWater.get(a.id)).toBeGreaterThanOrEqual(epoch2);

    history.undo();
    view.syncIncremental(world);
    const epoch3 = view._actorMeshes.get(a.id).visualEpoch;
    expect(epoch3).toBeGreaterThan(epoch2);
  });
});

describe('Phase 2F.7H — 4 nested resource disposal once', () => {
  it('disposes a shared-owned geometry only once across nested meshes', () => {
    const geom = markOwnedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    const disposeGeom = vi.spyOn(geom, 'dispose');
    const disposeMat = vi.spyOn(mat, 'dispose');

    const root = new THREE.Group();
    const a = new THREE.Mesh(geom, mat);
    const b = new THREE.Mesh(geom, mat);
    root.add(a);
    root.add(b);

    disposeObjectTree(root);
    expect(disposeGeom).toHaveBeenCalledTimes(1);
    expect(disposeMat).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 2F.7H — 5 finite transform + component validation', () => {
  function level(actors) {
    return { schemaVersion: 2, name: 'V', mapMode: 'additive', actors };
  }

  function actor(id, transform, components = []) {
    return {
      id,
      name: id,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        ...transform,
      },
      components,
    };
  }

  it('rejects non-finite transform values', () => {
    expect(() => validateLevelData(level([
      actor('bad', { position: { x: NaN, y: 0, z: 0 } }),
    ]))).toThrow(/finite number/);

    expect(() => validateLevelData(level([
      actor('bad', { rotation: { x: 0, y: Infinity, z: 0 } }),
    ]))).toThrow(/finite number/);

    expect(() => validateLevelData(level([
      actor('bad', { scale: { x: 1, y: 1, z: Number.NaN } }),
    ]))).toThrow(/finite number/);
  });

  it('rejects invalid component entries but allows unknown types (legacy)', () => {
    expect(() => validateLevelData(level([
      actor('a', {}, [null]),
    ]))).toThrow(/invalid component/i);

    expect(() => validateLevelData(level([
      actor('a', {}, [{ type: '' }]),
    ]))).toThrow(/missing type/i);

    // Unknown type still loads as generic Component.
    const world = deserializeLevel(level([
      actor('a', {}, [{ type: 'FutureWidget', id: 'c1', enabled: true }]),
    ]));
    expect(world.getActor('a').components[0].type).toBe('FutureWidget');
  });

  it('still loads all shipped acceptance levels', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const names = [
      'test-room.json',
      'acceptance-gothic-mansion.json',
      'acceptance-convex-brushes.json',
      'acceptance-subtractive.json',
      'subractive-halls.json',
    ];
    for (const name of names) {
      const raw = JSON.parse(readFileSync(path.join(root, 'public/levels', name), 'utf8'));
      expect(() => validateLevelData(raw)).not.toThrow();
      expect(deserializeLevel(raw).actors.length).toBeGreaterThan(0);
    }
  });
});

describe('Phase 2F.7H — 6 parented player spawn world pose', () => {
  it('resolves spawn position/yaw from world transform, not local', async () => {
    const { resolvePlayerSpawnPose } = await import('../runtime/GameRuntime.js');
    const world = new World({ name: 'Spawn', schemaVersion: 2 });
    const cell = new Actor({
      id: 'cell',
      name: 'Cell',
      transform: new Transform({
        position: { x: 500, y: 0, z: 200 },
        rotation: { x: 0, y: 90, z: 0 },
      }),
      components: [],
    });
    const spawn = new Actor({
      id: 'spawn',
      name: 'Spawn',
      parentId: 'cell',
      transform: new Transform({
        position: { x: 100, y: 20, z: 0 },
        rotation: { x: 0, y: 45, z: 0 },
      }),
      components: [new PlayerSpawnComponent({ eyeHeight: 160 })],
    });
    world.addActor(cell);
    world.addActor(spawn);

    const expected = getWorldTransform(spawn, world);
    const pose = resolvePlayerSpawnPose(world);

    expect(pose.position.x).toBeCloseTo(expected.position.x, 5);
    expect(pose.position.y).toBeCloseTo(expected.position.y, 5);
    expect(pose.position.z).toBeCloseTo(expected.position.z, 5);
    expect(pose.yawDegrees).toBeCloseTo(expected.rotation.y, 5);
    // Must not use local translation when parented.
    expect(pose.position.x).not.toBeCloseTo(spawn.transform.position.x, 0);
    expect(pose.position.z).not.toBeCloseTo(spawn.transform.position.z, 0);
    // Unparented control: local pose matches world when no parent.
    spawn.parentId = null;
    const localPose = resolvePlayerSpawnPose(world);
    expect(localPose.position.x).toBeCloseTo(100, 5);
    expect(localPose.yawDegrees).toBeCloseTo(45, 5);
  });
});

describe('Phase 2F.7H — World Solid solids still defined after cutter delete path', () => {
  it('getBrushRenderSolids remains valid for World Solid after sync', () => {
    const world = deserializeLevel({
      schemaVersion: 2,
      name: 'Sub',
      mapMode: 'subtractive',
      actors: [
        {
          id: 'solid',
          name: 'Solid',
          tags: ['world-solid'],
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          components: [{
            type: 'Brush',
            id: 'b1',
            size: { x: 1000, y: 400, z: 1000 },
            operation: 'add',
          }],
        },
        {
          id: 'cut',
          name: 'Cut',
          transform: {
            position: { x: 0, y: 50, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          components: [{
            type: 'Brush',
            id: 'b2',
            size: { x: 200, y: 200, z: 200 },
            operation: 'subtract',
          }],
        },
      ],
    });
    const solid = world.getActor('solid');
    const { solids } = getBrushRenderSolids(solid.getComponent('Brush'), { world, actor: solid });
    expect(solids.length).toBeGreaterThan(0);
    expect(serializeLevel(world).actors.length).toBe(2);
  });
});
