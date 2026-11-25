/**
 * Phase 2F.7G — final regression / lifecycle stress (unit side).
 * Play/Stop Rapier stress lives in phase2f7gPlayStopStress.test.js (needs SceneView mock).
 * Browser profiling + acceptance-level traversal: public/dev/phase2f7gAcceptance.js.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetBrushMaterialCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { PhysicsWorld, ensureRapier } from '../runtime/PhysicsWorld.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';

const { SceneView } = await import('../runtime/SceneView.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadLevelJson(name) {
  return JSON.parse(readFileSync(path.join(root, 'public/levels', name), 'utf8'));
}

const ACCEPTANCE_LEVELS = [
  'test-room.json',
  'acceptance-convex-brushes.json',
  'acceptance-subtractive.json',
  'acceptance-gothic-mansion.json',
  'acceptance-surfaces.json',
  'acceptance-multilevel.json',
  'subractive.json',
  'subractive-halls.json',
];

describe('Phase 2F.7G — acceptance level serialize round-trip', () => {
  it.each(ACCEPTANCE_LEVELS)('loads and round-trips %s', (name) => {
    const raw = loadLevelJson(name);
    const world = deserializeLevel(raw);
    expect(world.actors.length).toBeGreaterThan(0);
    const again = deserializeLevel(serializeLevel(world));
    expect(again.actors.length).toBe(world.actors.length);
    expect(again.mapMode || 'additive').toBe(world.mapMode || 'additive');
    for (const actor of world.actors) {
      expect(again.getActor(actor.id)?.name).toBe(actor.name);
    }
  });

  it('keeps subtractive World Solid and additive ConvexBrush markers', () => {
    const sub = deserializeLevel(loadLevelJson('acceptance-subtractive.json'));
    expect(sub.mapMode).toBe('subtractive');
    expect(sub.actors.some((a) => a.tags?.includes('world-solid'))).toBe(true);

    const convex = deserializeLevel(loadLevelJson('acceptance-convex-brushes.json'));
    expect(convex.actors.some((a) => a.getComponent('ConvexBrush'))).toBe(true);
  });
});

describe('Phase 2F.7G — physics build for acceptance levels', () => {
  it('builds colliders for gothic / convex / both subtractive showcases', async () => {
    await ensureRapier();
    const names = [
      'acceptance-gothic-mansion.json',
      'acceptance-convex-brushes.json',
      'acceptance-subtractive.json',
      'subractive-halls.json',
    ];
    for (const name of names) {
      const world = deserializeLevel(loadLevelJson(name));
      const physics = new PhysicsWorld();
      await physics.init();
      physics.buildFromWorld(world);
      expect(physics._bodies.size).toBeGreaterThan(0);
      // Subtract cutters never emit colliders.
      for (const actor of world.actors) {
        const brush = actor.getComponent('Brush');
        if (brush?.operation === 'subtract') {
          expect(physics.getColliderCount(actor.id)).toBe(0);
        }
      }
      physics.dispose();
    }
  });
});

describe('Phase 2F.7G — undo/redo material stress', () => {
  it('restores brush materials across 40 undo/redo pairs', () => {
    const world = new World({ name: 'mat-stress', schemaVersion: 2 });
    const brush = createBrushFromBounds({
      kind: 'box',
      min: { x: -50, y: 0, z: -50 },
      max: { x: 50, y: 100, z: 50 },
      gridSize: 25,
      name: 'Box',
      operation: 'add',
    });
    brush.id = 'box';
    brush.getComponent('Brush').materialId = 'mat_a';
    world.addActor(brush);

    const history = new HistoryStack({ limit: 100 });
    const mats = ['mat_b', 'mat_c', 'mat_d', 'mat_e'];
    for (let i = 0; i < 40; i += 1) {
      const next = mats[i % mats.length];
      const before = brush.getComponent('Brush').materialId;
      history.execute(new SetBrushMaterialCommand({
        world,
        actorId: brush.id,
        before: { materialId: before },
        after: { materialId: next },
        label: `Mat ${next}`,
      }));
      expect(brush.getComponent('Brush').materialId).toBe(next);
    }

    for (let i = 0; i < 40; i += 1) history.undo();
    expect(brush.getComponent('Brush').materialId).toBe('mat_a');

    for (let i = 0; i < 40; i += 1) history.redo();
    expect(brush.getComponent('Brush').materialId).toBe(mats[(40 - 1) % mats.length]);
  });
});

describe('Phase 2F.7G — actor create/delete + transform incremental stress', () => {
  function makeHarness() {
    const view = Object.create(SceneView.prototype);
    view._syncToken = 1;
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

  it('stabilizes mesh map size across 100 create/delete cycles', () => {
    const world = new World({ name: 'cd-stress' });
    const floor = createBrushFromBounds({
      kind: 'box',
      min: { x: -200, y: -10, z: -200 },
      max: { x: 200, y: 0, z: 200 },
      gridSize: 25,
      name: 'Floor',
      operation: 'add',
    });
    floor.id = 'floor';
    world.addActor(floor);

    const view = makeHarness();
    view.syncFromWorld(world);
    const baseline = view._actorMeshes.size;

    const history = new HistoryStack({ limit: 200 });
    for (let i = 0; i < 100; i += 1) {
      const actor = createBrushFromBounds({
        kind: 'box',
        min: { x: i * 10, y: 0, z: 0 },
        max: { x: i * 10 + 50, y: 50, z: 50 },
        gridSize: 25,
        name: `Temp_${i}`,
        operation: 'add',
      });
      actor.id = `temp_${i}`;
      history.execute(new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
      }));
      view.syncIncremental(world);
      history.execute(new RemoveActorsCommand({
        world,
        actorIds: [actor.id],
      }));
      view.syncIncremental(world);
    }

    expect(world.actors.length).toBe(1);
    expect(view._actorMeshes.size).toBe(baseline);
    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(1);
    expect(stats.actorAdds).toBeGreaterThanOrEqual(100);
    expect(stats.actorRemoves).toBeGreaterThanOrEqual(100);
  });

  it('routes repeated transforms as incremental updates (no full sync)', () => {
    const world = new World({ name: 'xf-stress' });
    const a = new Actor({
      id: 'a',
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 100 } })],
    });
    world.addActor(a);
    const view = makeHarness();
    view.syncFromWorld(world);
    view.resetSyncStats();

    const history = new HistoryStack({ limit: 50 });
    for (let i = 0; i < 30; i += 1) {
      const before = a.transform.toJSON();
      const after = structuredClone(before);
      after.position.x += 10;
      history.execute(new SetTransformsCommand({
        world,
        changes: [{ actorId: a.id, before, after }],
      }));
      view.syncIncremental(world);
    }

    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.transformUpdates).toBe(30);
    expect(stats.actorRebuilds).toBe(0);
  });
});

describe('Phase 2F.7G — subtractive render solids stay defined', () => {
  it('World Solid still yields clipped solids after deserialize', () => {
    const world = deserializeLevel(loadLevelJson('acceptance-subtractive.json'));
    const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
    expect(solid).toBeTruthy();
    const { solids } = getBrushRenderSolids(solid.getComponent('Brush'), {
      world,
      actor: solid,
    });
    expect(solids.length).toBeGreaterThan(0);
  });
});
