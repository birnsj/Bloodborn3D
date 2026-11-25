import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { LightComponent } from '../components/LightComponent.js';
import {
  actorContentFingerprint,
  actorParentFingerprint,
  actorTransformFingerprint,
} from '../runtime/actorVisualFingerprint.js';

const { SceneView } = await import('../runtime/SceneView.js');

function makeCanvas() {
  return {
    clientWidth: 64,
    clientHeight: 64,
    width: 64,
    height: 64,
    style: {},
    getContext: () => ({
      getExtension: () => null,
      getParameter: () => 0,
      createTexture: () => ({}),
      createBuffer: () => ({}),
      createFramebuffer: () => ({}),
      createRenderbuffer: () => ({}),
      createProgram: () => ({}),
      createShader: () => ({}),
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function makeBrushActor(name, { operation = 'add', size = { x: 100, y: 100, z: 100 }, position } = {}) {
  const actor = new Actor({ name });
  actor.addComponent(new BrushComponent({ size, operation }));
  if (position) actor.transform.position = { ...position };
  return actor;
}

function makeLightActor(name) {
  const actor = new Actor({ name });
  actor.addComponent(new LightComponent({ lightType: 'point', intensity: 1 }));
  return actor;
}

/** Minimal SceneView stand-in that exercises real syncIncremental / rebuild paths. */
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
  view.clearWorldMeshes = SceneView.prototype.clearWorldMeshes;
  view._clearGeometryFaceOverlays = () => {};
  view._clearSelectionHelpers = () => {};
  view.disposeObject = undefined;

  // Brush visuals: lightweight placeholders (avoid WebGL / CSG in unit tests).
  view._addBrushVisual = (group, actor) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
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

describe('actorVisualFingerprint', () => {
  it('changes content fingerprint when brush size changes, not transform', () => {
    const actor = makeBrushActor('A');
    const before = actorContentFingerprint(actor);
    const xformBefore = actorTransformFingerprint(actor);
    actor.getComponent('Brush').size = { x: 200, y: 100, z: 100 };
    expect(actorContentFingerprint(actor)).not.toBe(before);
    expect(actorTransformFingerprint(actor)).toBe(xformBefore);
  });

  it('changes transform fingerprint when position moves', () => {
    const actor = makeBrushActor('A');
    const before = actorTransformFingerprint(actor);
    actor.transform.position = { x: 50, y: 0, z: 0 };
    expect(actorTransformFingerprint(actor)).not.toBe(before);
    expect(actorParentFingerprint(actor)).toBe('');
  });
});

describe('Phase 2F.7C — incremental scene sync', () => {
  let view;
  let world;

  beforeEach(() => {
    view = makeHarness();
    world = new World({ name: 'IncSync' });
  });

  it('full sync rebuilds everything and bumps the global token', () => {
    const a = makeBrushActor('A');
    const b = makeBrushActor('B', { position: { x: 200, y: 0, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    view.syncFromWorld(world);
    expect(view.getSyncStats().fullSyncs).toBe(1);
    expect(view._actorMeshes.size).toBe(2);
    const token = view._syncToken;
    const epochA = view._actorMeshes.get(a.id).visualEpoch;

    view.syncFromWorld(world);
    expect(view._syncToken).toBe(token + 1);
    expect(view.getSyncStats().fullSyncs).toBe(2);
    // High-water epochs advance across full sync so async loads from the prior
    // generation cannot attach (Phase 2F.7H).
    expect(view._actorMeshes.get(a.id).visualEpoch).toBeGreaterThan(epochA);
  });

  it('transform-only edit does not rebuild unrelated actors', () => {
    const a = makeBrushActor('A');
    const b = makeBrushActor('B', { position: { x: 200, y: 0, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const epochA = view._actorMeshes.get(a.id).visualEpoch;
    const epochB = view._actorMeshes.get(b.id).visualEpoch;
    const groupA = view._actorMeshes.get(a.id).group;
    const groupB = view._actorMeshes.get(b.id).group;

    a.transform.position = { x: 25, y: 0, z: 0 };
    view.syncIncremental(world);

    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.incrementalSyncs).toBe(1);
    expect(stats.actorRebuilds).toBe(0);
    expect(stats.transformUpdates).toBe(1);
    expect(view._actorMeshes.get(a.id).visualEpoch).toBe(epochA);
    expect(view._actorMeshes.get(b.id).visualEpoch).toBe(epochB);
    expect(view._actorMeshes.get(a.id).group).toBe(groupA);
    expect(view._actorMeshes.get(b.id).group).toBe(groupB);
  });

  it('geometry edit rebuilds only the changed actor', () => {
    const a = makeBrushActor('A');
    const b = makeBrushActor('B', { position: { x: 200, y: 0, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const epochA = view._actorMeshes.get(a.id).visualEpoch;
    const epochB = view._actorMeshes.get(b.id).visualEpoch;
    const groupB = view._actorMeshes.get(b.id).group;

    a.getComponent('Brush').size = { x: 150, y: 100, z: 100 };
    view.syncIncremental(world);

    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.actorRebuilds).toBe(1);
    expect(view._actorMeshes.get(a.id).visualEpoch).toBe(epochA + 1);
    expect(view._actorMeshes.get(b.id).visualEpoch).toBe(epochB);
    expect(view._actorMeshes.get(b.id).group).toBe(groupB);
  });

  it('material edit rebuilds only the changed actor', () => {
    const a = makeBrushActor('A');
    const b = makeBrushActor('B');
    world.addActor(a);
    world.addActor(b);
    view.syncFromWorld(world);
    view.resetSyncStats();
    const epochB = view._actorMeshes.get(b.id).visualEpoch;

    a.getComponent('Brush').materialId = 'mat_stone';
    view.syncIncremental(world);

    expect(view.getSyncStats().actorRebuilds).toBe(1);
    expect(view._actorMeshes.get(b.id).visualEpoch).toBe(epochB);
  });

  it('actor create/delete add and remove visuals without full sync', () => {
    const a = makeBrushActor('A');
    world.addActor(a);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const b = makeBrushActor('B', { position: { x: 100, y: 0, z: 0 } });
    world.addActor(b);
    view.syncIncremental(world);
    expect(view.getSyncStats().actorAdds).toBe(1);
    expect(view.getSyncStats().fullSyncs).toBe(0);
    expect(view._actorMeshes.has(b.id)).toBe(true);

    world.removeActor(b.id);
    view.syncIncremental(world);
    expect(view.getSyncStats().actorRemoves).toBe(1);
    expect(view._actorMeshes.has(b.id)).toBe(false);
    expect(view._actorMeshes.has(a.id)).toBe(true);
  });

  it('hierarchy reparent moves groups without mesh rebuild', () => {
    const parent = makeBrushActor('Parent');
    const child = makeBrushActor('Child', { position: { x: 50, y: 0, z: 0 } });
    world.addActor(parent);
    world.addActor(child);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const epochChild = view._actorMeshes.get(child.id).visualEpoch;
    child.parentId = parent.id;
    view.syncIncremental(world);

    expect(view.getSyncStats().actorRebuilds).toBe(0);
    expect(view.getSyncStats().hierarchyMoves).toBeGreaterThanOrEqual(1);
    expect(view._actorMeshes.get(child.id).visualEpoch).toBe(epochChild);
    expect(view._actorMeshes.get(child.id).group.parent).toBe(view._actorMeshes.get(parent.id).group);
  });

  it('light intensity change rebuilds only that light actor', () => {
    const light = makeLightActor('Lamp');
    const brush = makeBrushActor('Wall');
    world.addActor(light);
    world.addActor(brush);
    view.syncFromWorld(world);
    view.resetSyncStats();
    const epochBrush = view._actorMeshes.get(brush.id).visualEpoch;

    light.getComponent('Light').intensity = 4;
    view.syncIncremental(world);

    expect(view.getSyncStats().actorRebuilds).toBe(1);
    expect(view._actorMeshes.get(brush.id).visualEpoch).toBe(epochBrush);
  });

  it('subtractive cutter move forces additive rebuilds without full-world sync', () => {
    world.mapMode = 'subtractive';
    const solid = makeBrushActor('WorldSolid', { size: { x: 1000, y: 400, z: 1000 } });
    solid.tags = ['world-solid'];
    const cutter = makeBrushActor('Cutter', {
      operation: 'subtract',
      size: { x: 100, y: 100, z: 100 },
      position: { x: 0, y: 50, z: 0 },
    });
    const additive = makeBrushActor('Additive', {
      size: { x: 80, y: 80, z: 80 },
      position: { x: 300, y: 40, z: 0 },
    });
    world.addActor(solid);
    world.addActor(cutter);
    world.addActor(additive);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const epochCutter = view._actorMeshes.get(cutter.id).visualEpoch;
    cutter.transform.position = { x: 40, y: 50, z: 0 };
    view.syncIncremental(world);

    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.incrementalSyncs).toBe(1);
    // Additive + World Solid rebuild for carve; cutter is transform-only.
    expect(view._actorMeshes.get(cutter.id).visualEpoch).toBe(epochCutter);
    expect(stats.actorRebuilds).toBeGreaterThanOrEqual(1);
    expect(view._actorMeshes.get(additive.id).visualEpoch).toBeGreaterThan(0);
  });

  it('noop incremental sync allocates no new actor meshes', () => {
    const a = makeBrushActor('A');
    const b = makeBrushActor('B');
    world.addActor(a);
    world.addActor(b);
    view.syncFromWorld(world);
    view.resetSyncStats();
    const groups = [...view._actorMeshes.values()].map((e) => e.group);

    view.syncIncremental(world);
    expect(view.getSyncStats().actorRebuilds).toBe(0);
    expect(view.getSyncStats().actorAdds).toBe(0);
    expect(view.getSyncStats().transformUpdates).toBe(0);
    expect([...view._actorMeshes.values()].map((e) => e.group)).toEqual(groups);
  });
});

describe('Phase 2F.7C — GameRuntime syncIncremental wiring', () => {
  it('exposes syncIncremental without bumping full sync on FakeSceneView', async () => {
    const { GameRuntime } = await import('../runtime/GameRuntime.js');
    const canvas = makeCanvas();
    // Avoid constructing real SceneView (WebGL). Patch prototype briefly.
    const Real = SceneView;
    const fake = {
      syncFromWorld: vi.fn(),
      syncIncremental: vi.fn(),
      setSelection: vi.fn(),
      selectedActorIds: [],
      setEditMode: vi.fn(),
      setGridSize: vi.fn(),
      setAssetResolver: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      camera: new THREE.PerspectiveCamera(),
      gizmo: { setVisible() {} },
      resetSyncStats: vi.fn(),
      getSyncStats: vi.fn(() => ({ fullSyncs: 0 })),
    };
    vi.spyOn(await import('../runtime/SceneView.js'), 'SceneView').mockImplementation?.(() => fake);
    void Real;
    void canvas;
    // Direct unit check of the method body contract:
    const runtime = Object.create(GameRuntime.prototype);
    runtime.world = new World({ name: 'W' });
    runtime.sceneView = fake;
    runtime.syncIncremental();
    expect(fake.syncIncremental).toHaveBeenCalledWith(runtime.world);
    runtime.resyncWorld();
    expect(fake.syncFromWorld).toHaveBeenCalledWith(runtime.world);
  });
});
