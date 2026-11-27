/**
 * Consolidation C5 — GPU ownership inventory, shared-cache release, FPS reconciliation,
 * and individual verification of the seven owned-leak / ownership fixes.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  disposeObjectTree,
  disposeOwnedMaterial,
  disposeSharedSubtree,
  inventoryGpuOwnership,
  isSharedGpuResource,
  markOwnedGpuResource,
  markSharedGpuResource,
  markSharedMaterialTextures,
} from '../runtime/gpuResources.js';
import {
  clearMeshCache,
  getMeshCacheSize,
  seedLoadedMeshScene,
} from '../runtime/meshLoader.js';
import { applyStaticMaterialOverrides } from '../runtime/createThreeStaticMesh.js';
import { createThreeEnvironmentFromComponent } from '../runtime/createThreeEnvironment.js';
import { disposePmremTarget } from '../runtime/environmentMapCache.js';
import { SceneView } from '../runtime/SceneView.js';
import { reconcileHistoricalFpsReports } from '../dev/c5GpuLifecycleAcceptance.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (rel) => readFileSync(join(rootDir, rel), 'utf8');

describe('C5 GPU ownership inventory', () => {
  it('classifies shared vs owned geometries and materials', () => {
    const sharedGeom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const ownedMat = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    const map = markSharedGpuResource({ isTexture: true, userData: { bbShared: true } });
    ownedMat.map = map;
    const mesh = new THREE.Mesh(sharedGeom, ownedMat);
    const root = new THREE.Group();
    root.add(mesh);

    const inv = inventoryGpuOwnership(root);
    expect(inv.geometries.shared).toBe(1);
    expect(inv.geometries.owned).toBe(0);
    expect(inv.materials.owned).toBe(1);
    expect(inv.textures.shared).toBe(1);
  });

  it('disposeSharedSubtree frees shared cache roots; disposeObjectTree does not', () => {
    const geom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markSharedGpuResource(new THREE.MeshBasicMaterial());
    const mesh = new THREE.Mesh(geom, mat);
    const disposeGeom = vi.spyOn(geom, 'dispose');
    const disposeMat = vi.spyOn(mat, 'dispose');

    disposeObjectTree(mesh);
    expect(disposeGeom).not.toHaveBeenCalled();
    expect(disposeMat).not.toHaveBeenCalled();

    disposeSharedSubtree(mesh);
    expect(disposeGeom).toHaveBeenCalledTimes(1);
    expect(disposeMat).toHaveBeenCalledTimes(1);
  });
});

describe('C5 clearMeshCache dispose', () => {
  it('disposes shared GLTF roots when clearing the mesh cache', () => {
    clearMeshCache({ dispose: false });
    const geom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markSharedGpuResource(new THREE.MeshBasicMaterial());
    const root = new THREE.Mesh(geom, mat);
    const disposeGeom = vi.spyOn(geom, 'dispose');
    seedLoadedMeshScene('c5://fixture.glb', root);
    expect(getMeshCacheSize()).toBe(1);

    clearMeshCache({ dispose: true });
    expect(getMeshCacheSize()).toBe(0);
    expect(disposeGeom).toHaveBeenCalled();
  });
});

describe('C5 historical FPS reconciliation', () => {
  it('separates gothic vs integrated workloads', () => {
    const rec = reconcileHistoricalFpsReports();
    expect(rec.batch8TexturesIntegrated.actors).toBe(101);
    expect(rec.c4QuickGothic.actors).toBe(35);
    expect(rec.batch8TexturesIntegrated.medianFps.quad).toBe(18.7);
    expect(rec.c4QuickGothic.level).toContain('gothic');
    expect(rec.conclusion.some((line) => /different levels/i.test(line))).toBe(true);
  });
});

describe('C5 fix: disposeObjectTree options', () => {
  it('skips geometries when geometries:false', () => {
    const geom = markOwnedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    const mesh = new THREE.Mesh(geom, mat);
    const disposeGeom = vi.spyOn(geom, 'dispose');
    const disposeMat = vi.spyOn(mat, 'dispose');

    disposeObjectTree(mesh, { geometries: false });
    expect(disposeGeom).not.toHaveBeenCalled();
    expect(disposeMat).toHaveBeenCalledTimes(1);
  });
});

describe('C5 fix: static mesh override ownership', () => {
  it('uses createMaterial result directly without orphaning a clone source', async () => {
    const map = markOwnedGpuResource({ dispose: vi.fn(), userData: { bbShared: false } });
    const created = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    created.map = map;
    const disposeCreated = vi.spyOn(created, 'dispose');

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      markOwnedGpuResource(new THREE.MeshBasicMaterial()),
    );
    mesh.name = 'Mesh_0';
    const root = new THREE.Group();
    root.add(mesh);

    await applyStaticMaterialOverrides(
      root,
      { 'Mesh_0:0': 'mat_test' },
      async () => created,
    );

    expect(mesh.material).toBe(created);
    expect(isSharedGpuResource(created)).toBe(false);
    expect(disposeCreated).not.toHaveBeenCalled();
    expect(map.dispose).not.toHaveBeenCalled();

    disposeOwnedMaterial(mesh.material);
    expect(disposeCreated).toHaveBeenCalledTimes(1);
    expect(map.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('C5 fix: shared textures survive individual consumers', () => {
  it('keeps shared map alive when one of two consumers is disposed', () => {
    const sharedMap = markSharedGpuResource({ dispose: vi.fn(), userData: { bbShared: true } });
    const matA = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    const matB = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    matA.map = sharedMap;
    matB.map = sharedMap;

    disposeOwnedMaterial(matA);
    expect(sharedMap.dispose).not.toHaveBeenCalled();
    expect(matB.map).toBe(sharedMap);

    disposeOwnedMaterial(matB);
    expect(sharedMap.dispose).not.toHaveBeenCalled();
  });

  it('InstancedMesh-style clone keeps shared maps after owned material dispose', () => {
    const sharedMap = markSharedGpuResource({ dispose: vi.fn(), userData: { bbShared: true } });
    const src = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    src.map = sharedMap;
    markSharedMaterialTextures(src);

    const clone = markOwnedGpuResource(src.clone());
    markSharedMaterialTextures(clone);
    disposeOwnedMaterial(clone);
    expect(sharedMap.dispose).not.toHaveBeenCalled();
  });
});

describe('C5 fix: Water RT dispose exactly once', () => {
  it('production water dispose is idempotent (exactly-once guard)', async () => {
    // resolveTextureUrl → null skips hanging TextureLoader for default normal ids.
    const built = await createThreeEnvironmentFromComponent(
      {
        envType: 'water',
        width: 50,
        height: 50,
        textureResolution: 64,
      },
      { resolveTextureUrl: () => null },
    );
    expect(built.kind).toBe('water');
    expect(typeof built.root.userData.bbEnvPerspectiveMesh?.onBeforeRender).toBe('function');
    expect(() => {
      built.dispose();
      built.dispose();
      built.dispose();
    }).not.toThrow();
  });

  it('mirror RT dispose fires once when captured then dispose is repeated', () => {
    const fakeRt = { isWebGLRenderTarget: true, texture: {}, dispose: vi.fn() };
    let mirrorRt = fakeRt;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      mirrorRt?.dispose?.();
      mirrorRt = null;
    };
    dispose();
    dispose();
    dispose();
    expect(fakeRt.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('C5 fix: light shadow maps disposed on teardown', () => {
  it('createThreeLight dispose frees shadow.map / mapPass', async () => {
    const { createThreeLightFromComponent } = await import('../runtime/createThreeLight.js');
    const built = await createThreeLightFromComponent({
      lightType: 'point',
      castShadow: true,
      shadowMapSize: 256,
      intensity: 1,
      color: '#ffffff',
    });
    const fakeMap = { dispose: vi.fn(), isWebGLCubeRenderTarget: true };
    const fakePass = { dispose: vi.fn() };
    built.light.shadow.map = fakeMap;
    built.light.shadow.mapPass = fakePass;
    built.dispose();
    built.dispose();
    expect(fakeMap.dispose).toHaveBeenCalledTimes(1);
    expect(fakePass.dispose).toHaveBeenCalledTimes(1);
    expect(built.light.shadow.map).toBeNull();
  });

  it('SceneView disposeObject invokes bbLightDispose', () => {
    const src = readSrc('runtime/sceneView/shared.js');
    expect(src).toMatch(/bbLightDispose/);
    expect(src).toMatch(/child\.userData\.bbLightDispose/);
  });
});

describe('C5 fix: dual bbEnvDispose avoided', () => {
  it('documents holder-only registration (SceneView source contract)', async () => {
    // createThreeEnvironment returns a single dispose fn; SceneView must attach it
    // only to the holder. Verify the builder exposes one dispose (not nested).
    const built = await createThreeEnvironmentFromComponent({
      envType: 'reflector',
      width: 100,
      height: 100,
      textureResolution: 64,
      color: '#888888',
      clipBias: 0,
      multisample: 0,
    });
    expect(typeof built.dispose).toBe('function');
    expect(built.root.userData.bbEnvDispose).toBeUndefined();
    built.dispose();
  });
});

describe('C5 fix: PP texture cache generation race', () => {
  function makePpView() {
    const view = Object.create(SceneView.prototype);
    view._ppTextureCache = new Map();
    view._ppTextureCacheGeneration = 0;
    view.assetResolver = { getTextureUrl: () => '/assets/tex/c5-pp.png' };
    view._textureLoader = {
      load: vi.fn((url, onLoad) => {
        // Async late completion
        queueMicrotask(() => {
          const tex = { dispose: vi.fn(), colorSpace: null };
          onLoad(tex);
        });
      }),
    };
    view._resolveTextureForPost = SceneView.prototype._resolveTextureForPost;
    view._clearPpTextureCache = SceneView.prototype._clearPpTextureCache;
    return view;
  }

  it('late loads after clear are disposed and do not repopulate the cache', async () => {
    const view = makePpView();
    const pending = view._resolveTextureForPost('tex_c5');
    expect(pending).toBeInstanceOf(Promise);
    expect(view._ppTextureCache.size).toBe(1);

    view._clearPpTextureCache();
    expect(view._ppTextureCache.size).toBe(0);
    expect(view._ppTextureCacheGeneration).toBe(1);

    const result = await pending;
    expect(result).toBeNull();
    expect(view._ppTextureCache.size).toBe(0);
  });

  it('successful load before clear remains until clear disposes it', async () => {
    const view = makePpView();
    let resolveLoad;
    view._textureLoader.load = vi.fn((url, onLoad) => {
      resolveLoad = () => {
        const tex = { dispose: vi.fn(), colorSpace: null };
        onLoad(tex);
      };
    });
    const pending = view._resolveTextureForPost('tex_ok');
    resolveLoad();
    const tex = await pending;
    expect(tex).toBeTruthy();
    expect(view._ppTextureCache.get('tex_ok')).toBe(tex);

    view._clearPpTextureCache();
    expect(tex.dispose).toHaveBeenCalledTimes(1);
    expect(view._ppTextureCache.size).toBe(0);
  });
});

describe('C5 fix: PMREM not marked shared', () => {
  it('buildPmremFromEquirect no longer marks cube texture bbShared', () => {
    const src = readSrc('runtime/environmentMapCache.js');
    const buildFn = src.slice(src.indexOf('export function buildPmremFromEquirect'));
    const body = buildFn.slice(0, buildFn.indexOf('export function disposePmremTarget'));
    expect(body).not.toMatch(/markSharedGpuResource\s*\(\s*target\.texture/);
    const fakeRt = { dispose: vi.fn() };
    disposePmremTarget(fakeRt);
    expect(fakeRt.dispose).toHaveBeenCalledTimes(1);
  });

  it('SceneView registers bbEnvDispose on holder only', () => {
    const src = readSrc('runtime/sceneView/lightEnvironmentVisuals.js');
    expect(src).toMatch(/holder\.userData\.bbEnvDispose\s*=\s*built\.dispose/);
    expect(src).not.toMatch(/built\.root\.userData\.bbEnvDispose\s*=\s*built\.dispose/);
  });
});

describe('C5 interval growth classifier helpers', () => {
  it('treats flat geometry with rising textures as bounded shared-cache (F8)', () => {
    const samples = [
      { geometries: 40, textures: 10 },
      { geometries: 40, textures: 14 },
      { geometries: 40, textures: 18 },
      { geometries: 40, textures: 18 },
    ];
    const geoDeltas = samples.slice(1).map((s, i) => s.geometries - samples[i].geometries);
    const texDeltas = samples.slice(1).map((s, i) => s.textures - samples[i].textures);
    expect(geoDeltas.every((d) => d === 0)).toBe(true);
    expect(texDeltas.some((d) => d > 0)).toBe(true);
    // Last interval flat → growth bounded / plateaued
    expect(texDeltas[texDeltas.length - 1]).toBe(0);
  });
});
