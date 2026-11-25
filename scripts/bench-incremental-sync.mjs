/**
 * Phase 2F.7C — compare full-world vs incremental sync for identical edits.
 * Run: node scripts/bench-incremental-sync.mjs
 */
import * as THREE from 'three';
import { Actor } from '../src/core/Actor.js';
import { World } from '../src/core/World.js';
import { BrushComponent } from '../src/components/BrushComponent.js';
import { SceneView } from '../src/runtime/SceneView.js';

function makeCanvas() {
  return {
    clientWidth: 8,
    clientHeight: 8,
    width: 8,
    height: 8,
    style: {},
    getContext: () => null,
    addEventListener() {},
    removeEventListener() {},
  };
}

function makeBrush(name, position) {
  const actor = new Actor({ name });
  actor.addComponent(new BrushComponent({ size: { x: 100, y: 100, z: 100 } }));
  if (position) actor.transform.position = { ...position };
  return actor;
}

function buildWorld(actorCount) {
  const world = new World({ name: `bench-${actorCount}` });
  for (let i = 0; i < actorCount; i += 1) {
    world.addActor(makeBrush(`Brush_${i}`, {
      x: (i % 20) * 120,
      y: 0,
      z: Math.floor(i / 20) * 120,
    }));
  }
  return world;
}

function harnessFromView() {
  // Prefer lightweight prototype harness to avoid WebGL init failures in Node.
  const view = Object.create(SceneView.prototype);
  view._syncToken = 0;
  view._actorMeshes = new Map();
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
  view.setSelection = () => {};
  view._refreshSurfaceHighlight = () => {};
  view._applyEditorOverlayVisibility = () => {};
  view._createLight = SceneView.prototype._createLight;
  view._createLightGizmo = () => new THREE.Group();
  view._stampActorVisual = SceneView.prototype._stampActorVisual;
  view._detachChildActorGroups = SceneView.prototype._detachChildActorGroups;
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
  view._addBrushVisual = (group, actor) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    mesh.userData.actorId = actor.id;
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
  void makeCanvas;
  return view;
}

function measure(label, fn, runs = 8) {
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mid = times[Math.floor(times.length / 2)];
  return { label, medianMs: Number(mid.toFixed(3)), samples: times.map((t) => Number(t.toFixed(3))) };
}

const sizes = [
  { name: 'small', count: 12 },
  { name: 'medium', count: 80 },
  { name: 'large', count: 240 },
];

const rows = [];

for (const size of sizes) {
  const world = buildWorld(size.count);
  const viewFull = harnessFromView();
  viewFull.syncFromWorld(world);
  const target = world.actors[0];

  // Baseline: full sync after independent transform edit
  const full = measure(`${size.name}-full-transform`, () => {
    target.transform.position = {
      x: (target.transform.position.x + 1) % 500,
      y: 0,
      z: target.transform.position.z,
    };
    viewFull.syncFromWorld(world);
  });

  const viewInc = harnessFromView();
  viewInc.syncFromWorld(world);
  viewInc.resetSyncStats();
  const inc = measure(`${size.name}-inc-transform`, () => {
    target.transform.position = {
      x: (target.transform.position.x + 1) % 500,
      y: 0,
      z: target.transform.position.z,
    };
    viewInc.syncIncremental(world);
  });
  const stats = viewInc.getSyncStats();

  rows.push({
    level: size.name,
    actors: size.count,
    fullMedianMs: full.medianMs,
    incrementalMedianMs: inc.medianMs,
    speedup: Number((full.medianMs / Math.max(inc.medianMs, 0.001)).toFixed(2)),
    fullSyncs: stats.fullSyncs,
    incrementalSyncs: stats.incrementalSyncs,
    actorRebuilds: stats.actorRebuilds,
    transformUpdates: stats.transformUpdates,
  });
}

console.log(JSON.stringify({ phase: '2F.7C', rows }, null, 2));
