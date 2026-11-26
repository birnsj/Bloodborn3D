import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  World,
  DEFAULT_WORLD_SCENE,
  DEFAULT_WORLD_RENDERER,
  normalizeWorldScene,
  normalizeWorldFog,
  normalizeWorldRenderer,
} from '../core/World.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { SceneView } from '../runtime/SceneView.js';

describe('normalizeWorldScene / fog', () => {
  it('returns defaults for null / invalid', () => {
    expect(normalizeWorldScene(null)).toEqual({
      background: DEFAULT_WORLD_SCENE.background,
      backgroundIntensity: DEFAULT_WORLD_SCENE.backgroundIntensity,
      backgroundBlurriness: DEFAULT_WORLD_SCENE.backgroundBlurriness,
      fog: { ...DEFAULT_WORLD_SCENE.fog },
    });
    expect(normalizeWorldFog({ type: 'nope', near: -5, far: 2, density: -1 })).toEqual({
      type: 'none',
      color: DEFAULT_WORLD_SCENE.fog.color,
      near: 0,
      far: 2,
      density: 0,
    });
  });

  it('clamps blurriness and swaps far below near', () => {
    const s = normalizeWorldScene({
      background: '#AABBCC',
      backgroundIntensity: 2.5,
      backgroundBlurriness: 3,
      fog: { type: 'linear', color: '#112233', near: 50, far: 10, density: 0.5 },
    });
    expect(s.background).toBe('#aabbcc');
    expect(s.backgroundIntensity).toBe(2.5);
    expect(s.backgroundBlurriness).toBe(1);
    expect(s.fog).toEqual({
      type: 'linear',
      color: '#112233',
      near: 50,
      far: 50,
      density: 0.5,
    });
  });
});

describe('normalizeWorldRenderer', () => {
  it('falls back unknown tone mapping / shadow type', () => {
    expect(normalizeWorldRenderer({
      toneMapping: 'Fake',
      toneMappingExposure: -1,
      shadowMapEnabled: false,
      shadowMapType: 'Ultra',
    })).toEqual({
      toneMapping: DEFAULT_WORLD_RENDERER.toneMapping,
      toneMappingExposure: 0,
      shadowMapEnabled: false,
      shadowMapType: DEFAULT_WORLD_RENDERER.shadowMapType,
    });
  });

  it('accepts AgX and VSM', () => {
    expect(normalizeWorldRenderer({
      toneMapping: 'AgX',
      toneMappingExposure: 1.2,
      shadowMapEnabled: true,
      shadowMapType: 'VSM',
    })).toEqual({
      toneMapping: 'AgX',
      toneMappingExposure: 1.2,
      shadowMapEnabled: true,
      shadowMapType: 'VSM',
    });
  });
});

describe('scene / renderer serialize round-trip', () => {
  it('preserves authored scene and renderer', () => {
    const world = new World({ name: 'Look' });
    world.scene = normalizeWorldScene({
      background: '#102030',
      backgroundIntensity: 1.5,
      backgroundBlurriness: 0.25,
      fog: { type: 'exp2', color: '#010203', density: 0.04 },
    });
    world.renderer = normalizeWorldRenderer({
      toneMapping: 'Reinhard',
      toneMappingExposure: 1.1,
      shadowMapEnabled: false,
      shadowMapType: 'Basic',
    });
    const json = serializeLevel(world);
    expect(json.scene).toEqual(world.scene);
    expect(json.renderer).toEqual(world.renderer);
    const restored = deserializeLevel(json);
    expect(restored.scene).toEqual(json.scene);
    expect(restored.renderer).toEqual(json.renderer);
  });

  it('defaults missing scene / renderer to SceneView hardcodes', () => {
    const world = new World({ name: 'Legacy', schemaVersion: 2 });
    const json = serializeLevel(world);
    delete json.scene;
    delete json.renderer;
    const restored = deserializeLevel({ ...json, schemaVersion: 2, actors: [] });
    expect(restored.scene).toEqual(normalizeWorldScene(null));
    expect(restored.renderer).toEqual(normalizeWorldRenderer(null));
  });
});

describe('SceneView applyWorldScene / applyWorldRenderer', () => {
  function makeView() {
    const view = Object.create(SceneView.prototype);
    view.scene = new THREE.Scene();
    view.scene.background = new THREE.Color(0x0e1218);
    view.viewportColors = { background: 0x0e1218 };
    view.renderer = {
      shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 0.95,
    };
    view._postProcessing = { enabled: false };
    view.postProcessingController = { isActive: false };
    view._worldScene = normalizeWorldScene(null);
    view._worldRenderer = normalizeWorldRenderer(null);
    view.applyWorldScene = SceneView.prototype.applyWorldScene;
    view.applyWorldRenderer = SceneView.prototype.applyWorldRenderer;
    view._syncSceneFromWorld = SceneView.prototype._syncSceneFromWorld;
    view._syncRendererFromWorld = SceneView.prototype._syncRendererFromWorld;
    view._toneMappingFromName = SceneView.prototype._toneMappingFromName;
    view._shadowMapTypeFromName = SceneView.prototype._shadowMapTypeFromName;
    return view;
  }

  it('applies background and linear fog', () => {
    const view = makeView();
    view.applyWorldScene({
      background: '#ff00aa',
      backgroundIntensity: 2,
      backgroundBlurriness: 0.5,
      fog: { type: 'linear', color: '#00ff00', near: 5, far: 40 },
    });
    expect(view.scene.background.getHexString()).toBe('ff00aa');
    expect(view.scene.backgroundIntensity).toBe(2);
    expect(view.scene.backgroundBlurriness).toBe(0.5);
    expect(view.scene.fog).toBeInstanceOf(THREE.Fog);
    expect(view.scene.fog.near).toBe(5);
    expect(view.scene.fog.far).toBe(40);
  });

  it('applies exp2 fog and clears fog for none', () => {
    const view = makeView();
    view.applyWorldScene({
      fog: { type: 'exp2', color: '#abcdef', density: 0.03 },
    });
    expect(view.scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(view.scene.fog.density).toBeCloseTo(0.03);
    view.applyWorldScene({ fog: { type: 'none' } });
    expect(view.scene.fog).toBeNull();
  });

  it('applies shadow map and tone mapping when PP inactive', () => {
    const view = makeView();
    view.applyWorldRenderer({
      toneMapping: 'Cineon',
      toneMappingExposure: 1.4,
      shadowMapEnabled: false,
      shadowMapType: 'VSM',
    });
    expect(view.renderer.toneMapping).toBe(THREE.CineonToneMapping);
    expect(view.renderer.toneMappingExposure).toBe(1.4);
    expect(view.renderer.shadowMap.enabled).toBe(false);
    expect(view.renderer.shadowMap.type).toBe(THREE.VSMShadowMap);
  });

  it('skips tone mapping when post-processing is active', () => {
    const view = makeView();
    view._postProcessing = { enabled: true };
    view.postProcessingController = { isActive: true };
    view.renderer.toneMapping = THREE.NoToneMapping;
    view.renderer.toneMappingExposure = 0.5;
    view.applyWorldRenderer({
      toneMapping: 'ACESFilmic',
      toneMappingExposure: 2,
      shadowMapEnabled: true,
      shadowMapType: 'PCF',
    });
    expect(view.renderer.toneMapping).toBe(THREE.NoToneMapping);
    expect(view.renderer.toneMappingExposure).toBe(0.5);
    expect(view.renderer.shadowMap.enabled).toBe(true);
    expect(view.renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
  });

  it('setViewportColors no longer overwrites scene background', () => {
    const view = makeView();
    view.applyWorldScene = SceneView.prototype.applyWorldScene;
    view.setViewportColors = SceneView.prototype.setViewportColors;
    view.editMode = false;
    view.selectedActorIds = [];
    view._actorMeshes = new Map();
    view.setGridSize = vi.fn();
    view._applySubtractColorsToMeshes = vi.fn();
    view.setSelection = vi.fn();

    view.applyWorldScene({ background: '#112233' });
    view.setViewportColors({ background: 0xff0000, selection: 0x00ff00 });
    expect(view.scene.background.getHexString()).toBe('112233');
    expect(view.viewportColors.selection).toBe(0x00ff00);
  });
});
