import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { createStairFromBounds } from '../runtime/stairFactory.js';
import { buildFlushWorld } from '../dev/phase2gSubtractiveScaleWorlds.js';
import {
  GENERATOR_INTEGRATION_CHECKLIST,
  syncGeneratedWorld,
} from '../editor/generatorIntegration.js';
import { LevelGeometryValidationError } from '../serialization/levelGeometryValidation.js';
import { MAX_SUBTRACT_SOLIDS } from '../runtime/brushBoolean.js';

const { SceneView } = await import('../runtime/SceneView.js');

const settle = () => new Promise((r) => setImmediate(r));

function makeStairView(definitions = {}) {
  const view = Object.create(SceneView.prototype);
  view._syncToken = 1;
  view._actorMeshes = new Map();
  view._actorEpochHighWater = new Map();
  view.selectedActorIds = [];
  view.selectedSurface = null;
  view.geometrySelection = null;
  view.editMode = true;
  view.gridSize = 25;
  view.maxAnisotropy = 8;
  view.root = new THREE.Group();
  view.viewportColors = { subtract: 0xc23b4a, selection: 0xffaa33 };
  view.syncStats = {
    fullSyncs: 0, incrementalSyncs: 0, actorAdds: 0, actorRemoves: 0, actorRebuilds: 0,
    transformUpdates: 0, hierarchyMoves: 0, geometryAllocs: 0, materialAllocs: 0,
  };
  view.assetResolver = {
    getMaterialDefinition: (id) => definitions[id] || { id, baseColor: '#808080' },
    getTextureUrl: () => null,
  };
  view.applyWorldAmbient = () => {};
  view.setSelection = vi.fn();
  view._refreshSurfaceHighlight = vi.fn();
  view._applyEditorOverlayVisibility = vi.fn();
  view._clearGeometryFaceOverlays = () => {};
  view._clearSelectionHelpers = () => {};
  for (const key of [
    'clearWorldMeshes', '_stampActorVisual', '_detachChildActorGroups',
    '_isActorVisualCurrent', 'updateActorTransform', 'removeActorVisual', 'rebuildActorVisual',
    '_populateActorComponents', '_syncContentRoot', '_syncActorHierarchy',
    'syncFromWorld', '_addActorVisual', '_addStairVisual', '_applySharedStairMaterials',
    '_applySurfaceMaterials', '_addBrushVisual', '_addConvexBrushVisual', '_addRampVisual',
    '_addColumnVisual', '_addArchVisual', '_addCurvedWallVisual',
  ]) {
    view[key] = SceneView.prototype[key];
  }
  return view;
}

function uniqueStairMaterials(root) {
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.userData?.stair) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m) seen.add(m);
    }
  });
  return seen;
}

describe('consolidation C4 — World.clear (F11 remainder)', () => {
  it('clears n actors in one pass and detaches world refs', () => {
    const world = new World({ name: 'clear-n' });
    const n = 200;
    for (let i = 0; i < n; i += 1) {
      world.addActor(new Actor({ id: `a${i}`, name: `A${i}` }));
    }
    expect(world.actors).toHaveLength(n);
    const sample = world.actors[0];
    expect(sample.world).toBe(world);

    world.clear();
    expect(world.actors).toHaveLength(0);
    expect(world.getActor('a0')).toBeNull();
    expect(sample.world).toBeNull();
  });
});

describe('consolidation C4 — stair material sharing (F18)', () => {
  it('shares material instances across stair steps for the same surface slots', async () => {
    const world = new World({ name: 'stair-share' });
    const stairActor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 400, y: 0, z: 200 },
      totalRise: 300,
    });
    const stair = stairActor.getComponent('Stair');
    stair.materialId = 'mat_stone';
    expect(stair.stepCount).toBeGreaterThanOrEqual(8);
    world.addActor(stairActor);

    const view = makeStairView({
      mat_stone: { id: 'mat_stone', baseColor: '#8899aa' },
    });
    view.syncFromWorld(world);
    await settle();
    await settle();

    const entry = view._actorMeshes.get(stairActor.id);
    expect(entry).toBeTruthy();
    const stepMeshes = [];
    entry.group.traverse((obj) => {
      if (obj.isMesh && obj.userData?.stair) stepMeshes.push(obj);
    });
    expect(stepMeshes.length).toBe(stair.stepCount);

    const unique = uniqueStairMaterials(entry.group);
    // Before F18: ~6 materials × stepCount. After: one instance per surface slot.
    expect(unique.size).toBeLessThanOrEqual(8);
    expect(unique.size).toBeLessThan(stepMeshes.length);

    const primary = stepMeshes[0].material;
    for (const mesh of stepMeshes) {
      expect(mesh.userData.surfaceIds?.length).toBeGreaterThan(0);
      if (Array.isArray(primary)) {
        expect(Array.isArray(mesh.material)).toBe(true);
        expect(mesh.material.length).toBe(primary.length);
        for (let i = 0; i < primary.length; i += 1) {
          expect(mesh.material[i]).toBe(primary[i]);
        }
      } else {
        expect(mesh.material).toBe(primary);
      }
    }
  });
});

describe('consolidation C4 — syncGeneratedWorld (F14)', () => {
  it('documents syncGeneratedWorld on the generator checklist', () => {
    expect(MAX_SUBTRACT_SOLIDS).toBe(512);
    expect(GENERATOR_INTEGRATION_CHECKLIST.some((line) => line.includes('syncGeneratedWorld'))).toBe(true);
  });

  it('asserts geometry then calls syncFromWorld', () => {
    const world = new World({ name: 'gen-ok', mapMode: 'additive' });
    world.addActor(new Actor({ id: 'solo', name: 'Solo' }));
    const sceneView = {
      syncFromWorld: vi.fn(),
      syncIncremental: vi.fn(),
    };
    syncGeneratedWorld(sceneView, world);
    expect(sceneView.syncFromWorld).toHaveBeenCalledWith(world);
    expect(sceneView.syncIncremental).not.toHaveBeenCalled();
  });

  it('rejects over-cap subtractive worlds before sync', () => {
    // flush-200 → 522 solids > 512 (same fixture as D2 prerequisites).
    const world = buildFlushWorld(200);
    const sceneView = { syncFromWorld: vi.fn() };
    expect(() => syncGeneratedWorld(sceneView, world)).toThrow(LevelGeometryValidationError);
    expect(sceneView.syncFromWorld).not.toHaveBeenCalled();
  });
});
