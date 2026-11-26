import { describe, expect, it } from 'vitest';
import {
  normalizeWorldScene,
  normalizeWorldRenderer,
  DEFAULT_WORLD_RENDERER,
} from '../core/World.js';
import { isEnvironmentMapAsset } from '../assets/AssetRegistry.js';
import { isEnvironmentMapPath } from '../runtime/environmentMapCache.js';
import { SetWorldSceneCommand, SetWorldRendererCommand } from '../editor/history/commands.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { World } from '../core/World.js';

describe('environment map asset helpers', () => {
  it('detects hdr/exr paths and registry entries', () => {
    expect(isEnvironmentMapPath('foo.HDR')).toBe(true);
    expect(isEnvironmentMapPath('bar.exr')).toBe(true);
    expect(isEnvironmentMapPath('baz.png')).toBe(false);
    expect(isEnvironmentMapAsset({
      kind: 'texture',
      path: 'textures/a.hdr',
      meta: { format: 'hdr', environmentMap: true },
    })).toBe(true);
    expect(isEnvironmentMapAsset({
      kind: 'texture',
      path: 'textures/a.png',
      meta: { format: 'png' },
    })).toBe(false);
  });
});

describe('world scene / renderer undo commands', () => {
  it('restores scene and renderer on undo', () => {
    const world = new World({ name: 'Env' });
    const beforeScene = normalizeWorldScene(world.scene);
    const afterScene = normalizeWorldScene({
      ...beforeScene,
      backgroundType: 'sky',
      environmentAssetId: 'tex_batch1_studio',
      environmentIntensity: 1.5,
    });
    const applied = [];
    const cmd = new SetWorldSceneCommand({
      world,
      before: beforeScene,
      after: afterScene,
      onApply: (s) => applied.push(s.backgroundType),
    });
    cmd.do();
    expect(world.scene.backgroundType).toBe('sky');
    expect(world.scene.environmentAssetId).toBe('tex_batch1_studio');
    cmd.undo();
    expect(world.scene.backgroundType).toBe('color');
    expect(world.scene.environmentAssetId).toBeNull();
    expect(applied).toEqual(['sky', 'color']);

    const beforeR = normalizeWorldRenderer(world.renderer);
    const afterR = normalizeWorldRenderer({ ...beforeR, outputColorSpace: 'srgb-linear' });
    const rCmd = new SetWorldRendererCommand({
      world,
      before: beforeR,
      after: afterR,
    });
    rCmd.do();
    expect(world.renderer.outputColorSpace).toBe('srgb-linear');
    rCmd.undo();
    expect(world.renderer.outputColorSpace).toBe('srgb');
  });
});

describe('acceptance-world-settings round-trip', () => {
  it('preserves Batch 1 fields through serialize/deserialize', async () => {
    const fs = await import('node:fs/promises');
    const raw = JSON.parse(
      await fs.readFile(new URL('../../public/levels/acceptance-world-settings.json', import.meta.url), 'utf8'),
    );
    const world = deserializeLevel(raw);
    expect(world.scene.backgroundType).toBe('environment');
    expect(world.scene.environmentAssetId).toBe('tex_batch1_studio');
    expect(world.scene.groundedSkybox.enabled).toBe(true);
    expect(world.scene.lightProbeEnabled).toBe(true);
    expect(world.renderer.shadowMapType).toBe('PCF');
    expect(world.renderer.outputColorSpace).toBe('srgb');
    const again = serializeLevel(world);
    expect(again.scene.environmentAssetId).toBe('tex_batch1_studio');
    expect(again.scene.sky.elevation).toBe(12);
    expect(again.renderer.outputColorSpace).toBe('srgb');
  });

  it('keeps legacy levels on RoomEnvironment defaults', () => {
    const world = deserializeLevel({
      schemaVersion: 2,
      name: 'Legacy',
      actors: [],
    });
    expect(world.scene).toEqual(normalizeWorldScene(null));
    expect(world.scene.environmentAssetId).toBeNull();
    expect(world.scene.backgroundType).toBe('color');
    expect(world.renderer.shadowMapType).toBe(DEFAULT_WORLD_RENDERER.shadowMapType);
    expect(world.renderer.outputColorSpace).toBe('srgb');
  });
});
