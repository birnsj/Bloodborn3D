import { describe, expect, it } from 'vitest';
import {
  normalizeWorldScene,
  normalizeWorldRenderer,
  normalizeWorldAmbient,
  DEFAULT_WORLD_RENDERER,
  DEFAULT_WORLD_AMBIENT,
} from '../core/World.js';
import { isEnvironmentMapAsset } from '../assets/AssetRegistry.js';
import { isEnvironmentMapPath } from '../runtime/environmentMapCache.js';
import {
  SetWorldSceneCommand,
  SetWorldRendererCommand,
  SetWorldAmbientCommand,
} from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
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

  it('HistoryStack.record captures one scrub gesture without re-applying do()', () => {
    const world = new World({ name: 'Scrub' });
    const history = new HistoryStack();
    const before = normalizeWorldScene(world.scene);
    // Live preview already applied (undoable:false path).
    world.scene = normalizeWorldScene({
      ...before,
      environmentIntensity: 2.25,
      backgroundBlurriness: 0.4,
    });
    const after = normalizeWorldScene(world.scene);
    let applyCount = 0;
    history.record(new SetWorldSceneCommand({
      world,
      before,
      after,
      label: 'Edit environment intensity',
      onApply: () => { applyCount += 1; },
    }));
    expect(history.canUndo).toBe(true);
    expect(applyCount).toBe(0);
    expect(world.scene.environmentIntensity).toBe(2.25);

    history.undo();
    expect(world.scene.environmentIntensity).toBe(before.environmentIntensity);
    expect(world.scene.backgroundBlurriness).toBe(before.backgroundBlurriness);
    expect(applyCount).toBe(1);

    history.redo();
    expect(world.scene.environmentIntensity).toBe(2.25);
    expect(world.scene.backgroundBlurriness).toBe(0.4);
    expect(applyCount).toBe(2);
  });
});

describe('world ambient undo commands', () => {
  it('restores ambient on undo/redo', () => {
    const world = new World({ name: 'Ambient' });
    const before = normalizeWorldAmbient(world.ambient);
    const after = normalizeWorldAmbient({
      ...before,
      color: '#ff8800',
      intensity: 0.85,
      playIntensity: 0.4,
    });
    const applied = [];
    const cmd = new SetWorldAmbientCommand({
      world,
      before,
      after,
      onApply: (a) => applied.push(a.intensity),
    });
    cmd.do();
    expect(world.ambient.color).toBe('#ff8800');
    expect(world.ambient.intensity).toBe(0.85);
    cmd.undo();
    expect(world.ambient).toEqual(before);
    expect(applied).toEqual([0.85, before.intensity]);

    cmd.do();
    expect(world.ambient.playIntensity).toBe(0.4);
    expect(applied).toEqual([0.85, before.intensity, 0.85]);
  });

  it('HistoryStack.record captures one ambient scrub without re-applying do()', () => {
    const world = new World({ name: 'AmbientScrub' });
    const history = new HistoryStack();
    const before = normalizeWorldAmbient(world.ambient);
    world.ambient = normalizeWorldAmbient({
      ...before,
      intensity: 1.75,
      playIntensity: 0.55,
    });
    const after = normalizeWorldAmbient(world.ambient);
    let applyCount = 0;
    history.record(new SetWorldAmbientCommand({
      world,
      before,
      after,
      label: 'Edit ambient intensity',
      onApply: () => { applyCount += 1; },
    }));
    expect(history.canUndo).toBe(true);
    expect(applyCount).toBe(0);
    expect(world.ambient.intensity).toBe(1.75);

    history.undo();
    expect(world.ambient.intensity).toBe(before.intensity);
    expect(world.ambient.playIntensity).toBe(before.playIntensity);
    expect(applyCount).toBe(1);

    history.redo();
    expect(world.ambient.intensity).toBe(1.75);
    expect(world.ambient.playIntensity).toBe(0.55);
    expect(applyCount).toBe(2);
  });

  it('preserves ambient through serialize/deserialize after edit', () => {
    const world = new World({ name: 'AmbientSave' });
    world.ambient = normalizeWorldAmbient({
      color: '#aabbcc',
      intensity: 0.33,
      playIntensity: 0.22,
    });
    const json = serializeLevel(world);
    expect(json.ambient).toEqual({
      color: '#aabbcc',
      intensity: 0.33,
      playIntensity: 0.22,
    });
    const restored = deserializeLevel(json);
    expect(restored.ambient).toEqual(json.ambient);
    expect(normalizeWorldAmbient(null)).toEqual({ ...DEFAULT_WORLD_AMBIENT });
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
