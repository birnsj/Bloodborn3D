import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {
  LightComponent,
  normalizeLightFields,
  createLensflareFromPreset,
  LIGHT_TYPES,
} from '../components/LightComponent.js';
import {
  createThreeLightFromComponent,
  ensureRectAreaLightUniforms,
  isRectAreaUniformsReady,
  __resetRectAreaUniformsForTests,
  setLensflarePerspectiveVisible,
} from '../runtime/createThreeLight.js';
import { createLightActor } from '../editor/lightFactory.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { SetLightPropertiesCommand } from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { World } from '../core/World.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Batch 3 — lighting', () => {
  beforeEach(() => {
    __resetRectAreaUniformsForTests();
  });

  it('preserves legacy light JSON defaults (decay 2, shadow bias)', () => {
    const legacy = new LightComponent({
      lightType: 'point',
      color: '#ffffff',
      intensity: 1.5,
      range: 1200,
      castShadow: true,
      shadowMapSize: 1024,
    });
    expect(legacy.decay).toBe(2);
    expect(legacy.shadowBias).toBe(-0.0005);
    expect(legacy.shadowNormalBias).toBe(0.04);
    expect(legacy.shadowRadius).toBe(2);
    expect(legacy.shadowCameraSize).toBe(20);
    expect(legacy.lensflareEnabled).toBe(false);
    expect(legacy.targetActorId).toBeNull();
  });

  it('normalizes all light types and lensflare presets', () => {
    for (const t of LIGHT_TYPES) {
      expect(normalizeLightFields({ lightType: t }).lightType).toBe(t);
    }
    const soft = createLensflareFromPreset('soft');
    expect(soft.length).toBeGreaterThan(1);
    expect(soft[0].textureAssetId).toBe('tex_flare_main');
  });

  it('creates native Three.js lights including hemisphere and rectArea', async () => {
    ensureRectAreaLightUniforms();
    expect(isRectAreaUniformsReady()).toBe(true);

    const hemi = await createThreeLightFromComponent({
      lightType: 'hemisphere',
      color: '#aaccff',
      groundColor: '#443322',
      intensity: 0.5,
    });
    expect(hemi.light).toBeInstanceOf(THREE.HemisphereLight);
    hemi.dispose();

    const rect = await createThreeLightFromComponent({
      lightType: 'rectArea',
      intensity: 3,
      width: 200,
      height: 100,
    });
    expect(rect.light).toBeInstanceOf(THREE.RectAreaLight);
    expect(rect.light.width).toBeCloseTo(2);
    expect(rect.light.height).toBeCloseTo(1);
    rect.dispose();

    const spot = await createThreeLightFromComponent({
      lightType: 'spot',
      intensity: 2,
      decay: 1.5,
      castShadow: true,
      shadowBias: -0.001,
      shadowNormalBias: 0.05,
      shadowRadius: 3,
      shadowCameraNear: 0.3,
      shadowCameraFar: 25,
    });
    expect(spot.light).toBeInstanceOf(THREE.SpotLight);
    expect(spot.light.decay).toBeCloseTo(1.5);
    expect(spot.light.shadow.bias).toBeCloseTo(-0.001);
    expect(spot.light.shadow.radius).toBeCloseTo(3);
    spot.dispose();
  });

  it('factory places new light types from toolbar payloads', () => {
    const hemi = createLightActor({ lightType: 'hemisphere', position: { x: 0, y: 100, z: 0 } });
    expect(hemi.getComponent('Light').lightType).toBe('hemisphere');
    const rect = createLightActor({ lightType: 'rectArea' });
    expect(rect.getComponent('Light').width).toBeGreaterThan(0);
    const ambient = createLightActor({ lightType: 'ambient' });
    expect(ambient.getComponent('Light').castShadow).toBe(false);
  });

  it('records one undo entry for light property patches', () => {
    const world = new World({ name: 'L', schemaVersion: 2 });
    const actor = createLightActor({ lightType: 'point', intensity: 1 });
    world.addActor(actor);
    const light = actor.getComponent('Light');
    const history = new HistoryStack();
    history.execute(new SetLightPropertiesCommand({
      world,
      actorId: actor.id,
      before: { intensity: 1 },
      after: { intensity: 2.5 },
    }));
    expect(light.intensity).toBe(2.5);
    history.undo();
    expect(light.intensity).toBe(1);
    history.redo();
    expect(light.intensity).toBe(2.5);
  });

  it('round-trips acceptance-lighting level with Batch 3 fields', () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, 'public/levels/acceptance-lighting.json'), 'utf8'),
    );
    expect(raw.scene.environmentAssetId).toBe('tex_batch1_studio');
    const world = deserializeLevel(raw);
    const lights = world.actors
      .map((a) => a.getComponent('Light'))
      .filter(Boolean);
    const types = new Set(lights.map((l) => l.lightType));
    expect(types.has('point')).toBe(true);
    expect(types.has('spot')).toBe(true);
    expect(types.has('directional')).toBe(true);
    expect(types.has('hemisphere')).toBe(true);
    expect(types.has('rectArea')).toBe(true);
    expect(types.has('ambient')).toBe(true);

    const spot = lights.find((l) => l.lightType === 'spot');
    expect(spot.spotMapId).toBe('tex_batch3_spot_gobo');
    expect(spot.targetActorId).toBe('actor_lit_metal');
    const point = lights.find((l) => l.lightType === 'point');
    expect(point.lensflareEnabled).toBe(true);
    expect(point.lensflareElements.length).toBeGreaterThan(0);

    const again = serializeLevel(world);
    const spot2 = again.actors
      .flatMap((a) => a.components || [])
      .find((c) => c.type === 'Light' && c.lightType === 'spot');
    expect(spot2.shadowBias).toBeDefined();
    expect(spot2.spotMapId).toBe('tex_batch3_spot_gobo');
  });

  it('hides lensflare roots in orthographic visibility pass', () => {
    const root = new THREE.Group();
    const flare = new THREE.Object3D();
    flare.userData.bbLensflare = true;
    flare.userData.hideInOrtho = true;
    root.add(flare);
    setLensflarePerspectiveVisible(root, false);
    expect(flare.visible).toBe(false);
    setLensflarePerspectiveVisible(root, true);
    expect(flare.visible).toBe(true);
  });
});
