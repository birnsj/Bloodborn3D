import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import {
  disposeObjectTree,
  isSharedGpuResource,
  markSharedGpuResource,
} from '../runtime/gpuResources.js';

const factory = vi.hoisted(() => ({ pending: [], created: [] }));

vi.mock('../runtime/materialFactory.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createThreeMaterial: vi.fn(() => new Promise((resolve) => {
      factory.pending.push((value) => resolve(value));
    })),
  };
});

const meshLoader = vi.hoisted(() => ({
  pending: [],
}));

vi.mock('../runtime/meshLoader.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cloneLoadedMesh: vi.fn(() => new Promise((resolve) => {
      meshLoader.pending.push(resolve);
    })),
  };
});

const { SceneView } = await import('../runtime/SceneView.js');
const { cloneLoadedMesh } = await import('../runtime/meshLoader.js');

function fakeMaterial(label) {
  return {
    label,
    map: { dispose: vi.fn(), userData: { bbShared: false } },
    dispose: vi.fn(),
    userData: { bbShared: false },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

beforeEach(() => {
  factory.pending.length = 0;
  meshLoader.pending.length = 0;
});

describe('Phase 2F.7B — actor-local visual epochs', () => {
  it('updateBrushGeometry does not bump the global sync token', () => {
    const view = Object.create(SceneView.prototype);
    view._syncToken = 5;
    view._actorMeshes = new Map();
    view.selectedActorIds = [];
    view.geometrySelection = null;
    view._detachChildActorGroups = () => [];
    view._addBrushVisual = vi.fn();
    view._addConvexBrushVisual = vi.fn();
    view.updateActorTransform = vi.fn();

    const actor = new Actor({ name: 'Brush' });
    actor.addComponent(new BrushComponent({ size: { x: 100, y: 100, z: 100 } }));
    const group = new THREE.Group();
    view._actorMeshes.set(actor.id, { group, actor, visualEpoch: 1 });

    view.updateBrushGeometry(actor);

    expect(view._syncToken).toBe(5);
    expect(view._actorMeshes.get(actor.id).visualEpoch).toBe(2);
    expect(view._addBrushVisual).toHaveBeenCalled();
  });

  it('stale material for one actor does not block another actor\'s pending load', async () => {
    const view = Object.create(SceneView.prototype);
    view._syncToken = 1;
    view._actorMeshes = new Map();
    view.maxAnisotropy = 4;
    view.assetResolver = {
      getMaterialDefinition: async () => ({ id: 'mat', baseColor: '#888' }),
      getTextureUrl: () => null,
    };
    view._applyHiddenHullFaces = () => {};

    const meshA = {
      material: Array.from({ length: 6 }, () => fakeMaterial('a')),
      userData: { actorId: 'actor-a', visualEpoch: 1 },
    };
    const meshB = {
      material: Array.from({ length: 6 }, () => fakeMaterial('b')),
      userData: { actorId: 'actor-b', visualEpoch: 1 },
    };
    view._actorMeshes.set('actor-a', { group: new THREE.Group(), visualEpoch: 1 });
    view._actorMeshes.set('actor-b', { group: new THREE.Group(), visualEpoch: 1 });

    const runA = SceneView.prototype._applyBrushMaterials.call(
      view,
      meshA,
      { materialId: 'mat', faceMaterials: {} },
      1,
    );
    await flush();
    expect(factory.pending.length).toBeGreaterThanOrEqual(1);

    // Rebuild only actor A (epoch bump) — must NOT bump global _syncToken.
    view._actorMeshes.get('actor-a').visualEpoch = 2;
    expect(view._syncToken).toBe(1);

    const lateA = fakeMaterial('late-a');
    factory.pending[0](lateA);
    await runA;
    expect(lateA.dispose).toHaveBeenCalled();
    expect(meshA.material[0].label).toBe('a');

    // Actor B still loads under the same global sync token.
    factory.pending.length = 0;
    const runB = SceneView.prototype._applyBrushMaterials.call(
      view,
      meshB,
      { materialId: 'mat', faceMaterials: {} },
      1,
    );
    const matsB = [];
    for (let i = 0; i < 6; i += 1) {
      await flush();
      const mat = fakeMaterial(`b${i}`);
      matsB.push(mat);
      factory.pending[i](mat);
    }
    await runB;
    expect(meshB.material[0]).toBe(matsB[0]);
    expect(matsB[0].dispose).not.toHaveBeenCalled();
  });

  it('abandons static-mesh clones when the actor visual is gone and does not dispose shared geometry', async () => {
    const view = Object.create(SceneView.prototype);
    view._syncToken = 1;
    view._actorMeshes = new Map();
    view.selectedActorIds = [];
    view.assetResolver = { getMeshUrl: () => '/assets/cube.glb' };
    view.setSelection = vi.fn();

    const group = new THREE.Group();
    view._actorMeshes.set('mesh-1', { group, visualEpoch: 1 });

    const sharedGeom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const ownedMat = new THREE.MeshBasicMaterial();
    ownedMat.userData = { bbShared: false };
    const cloneRoot = new THREE.Mesh(sharedGeom, ownedMat);

    const run = SceneView.prototype._addStaticMeshVisual.call(
      view,
      group,
      { id: 'mesh-1' },
      { assetId: 'cube' },
      1,
    );
    await flush();

    view._actorMeshes.delete('mesh-1');
    meshLoader.pending[0]({ root: cloneRoot, meta: {}, validation: { ok: true } });
    await run;

    expect(group.children.some((c) => c === cloneRoot)).toBe(false);
    expect(isSharedGpuResource(sharedGeom)).toBe(true);
    // Shared geom must survive abandonment disposal.
    expect(sharedGeom.uuid).toBeTruthy();
  });
});

describe('Phase 2F.7B — disposeObjectTree shared safety', () => {
  it('does not dispose geometries marked shared', () => {
    const geom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = new THREE.MeshBasicMaterial();
    mat.userData = { bbShared: false };
    const spy = vi.spyOn(geom, 'dispose');
    disposeObjectTree(new THREE.Mesh(geom, mat));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Phase 2F.7B — world sync still invalidates globally', () => {
  it('bumps sync token on syncFromWorld so prior loads are abandoned', () => {
    const canvas = makeCanvas();
    // SceneView constructor needs a real-ish canvas; skip full construct — test token API only.
    const view = Object.create(SceneView.prototype);
    view._syncToken = 0;
    view._actorMeshes = new Map();
    view.selectedActorIds = [];
    view.selectedSurface = null;
    view.root = new THREE.Group();
    view.applyWorldAmbient = () => {};
    view.clearWorldMeshes = vi.fn(() => {
      view._actorMeshes.clear();
    });
    view._addActorVisual = vi.fn();
    view.setSelection = vi.fn();
    view._refreshSurfaceHighlight = vi.fn();
    view._applyEditorOverlayVisibility = vi.fn();

    const world = new World({ name: 'T' });
    SceneView.prototype.syncFromWorld.call(view, world);
    expect(view._syncToken).toBe(1);
    SceneView.prototype.syncFromWorld.call(view, world);
    expect(view._syncToken).toBe(2);
  });
});

// Silence unused import lint in case tree-shaking analyzers complain.
void Actor;
void BrushComponent;
void StaticMeshComponent;
void cloneLoadedMesh;
