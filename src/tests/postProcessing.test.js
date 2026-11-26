import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { SetWorldPostProcessingCommand } from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  EFFECT_DEFINITIONS,
  EFFECT_ORDER,
  effectInputsReady,
} from '../runtime/postprocessing/effectRegistry.js';
import {
  DEFAULT_POST_PROCESSING,
  mergePostProcessing,
  normalizePostProcessing,
  resetAllPostProcessing,
  resetEffectInPostProcessing,
} from '../runtime/postprocessing/postProcessingState.js';
import {
  BUILTIN_POST_PROCESSING_PRESETS,
  getBuiltinPreset,
} from '../runtime/postprocessing/presets.js';
import { needsComposerPipeline } from '../runtime/postprocessing/PostProcessingController.js';
import * as PP from 'postprocessing';

describe('postProcessing normalize + serialize', () => {
  it('defaults to disabled and preserves look for missing field', () => {
    const n = normalizePostProcessing(null);
    expect(n.enabled).toBe(false);
    expect(n.exposure).toBe(0.95);
    expect(n.effects.toneMapping.enabled).toBe(true);
    expect(n.effects.bloom.enabled).toBe(false);
  });

  it('round-trips through level JSON', () => {
    const world = new World({ name: 'PP Test' });
    world.postProcessing = mergePostProcessing(world.postProcessing, {
      enabled: true,
      exposure: 1.1,
      effects: {
        bloom: { enabled: true, intensity: 0.7 },
        vignette: { enabled: true, darkness: 0.6 },
      },
    });
    const data = serializeLevel(world);
    expect(data.postProcessing.enabled).toBe(true);
    expect(data.postProcessing.effects.bloom.intensity).toBeCloseTo(0.7);

    const loaded = deserializeLevel(data, { validateGeometry: false });
    expect(loaded.postProcessing.enabled).toBe(true);
    expect(loaded.postProcessing.effects.bloom.enabled).toBe(true);
    expect(loaded.postProcessing.effects.vignette.darkness).toBeCloseTo(0.6);
  });

  it('loads legacy levels without postProcessing as disabled defaults', () => {
    const world = deserializeLevel({
      schemaVersion: 2,
      name: 'Legacy',
      mapMode: 'additive',
      actors: [],
    }, { validateGeometry: false });
    expect(world.postProcessing.enabled).toBe(false);
    expect(world.postProcessing).toEqual(normalizePostProcessing(DEFAULT_POST_PROCESSING));
  });

  it('mutually excludes FXAA and SMAA', () => {
    const both = mergePostProcessing(null, {
      effects: {
        fxaa: { enabled: true },
        smaa: { enabled: true },
      },
    });
    expect(both.effects.smaa.enabled).toBe(true);
    expect(both.effects.fxaa.enabled).toBe(false);

    const preferFxaa = mergePostProcessing(both, {
      effects: { fxaa: { enabled: true } },
    });
    expect(preferFxaa.effects.fxaa.enabled).toBe(true);
    expect(preferFxaa.effects.smaa.enabled).toBe(false);
  });

  it('resets individual and all effects', () => {
    const dirty = mergePostProcessing(null, {
      enabled: true,
      effects: { bloom: { enabled: true, intensity: 3 } },
    });
    const one = resetEffectInPostProcessing(dirty, 'bloom');
    expect(one.effects.bloom.enabled).toBe(false);
    expect(one.enabled).toBe(true);
    const all = resetAllPostProcessing();
    expect(all.enabled).toBe(false);
  });
});

describe('postProcessing effect registry', () => {
  it('covers every ordered effect with a library class export', () => {
    for (const id of EFFECT_ORDER) {
      const def = EFFECT_DEFINITIONS[id];
      expect(def, id).toBeTruthy();
      expect(PP[def.libraryClass], def.libraryClass).toBeTypeOf('function');
    }
  });

  it('gates input-backed effects until requirements are met', () => {
    expect(effectInputsReady('bloom', { enabled: true })).toBe(true);
    expect(effectInputsReady('selectiveBloom', { enabled: true, actorIds: [] })).toBe(false);
    expect(effectInputsReady('selectiveBloom', { enabled: true, actorIds: ['a'] })).toBe(true);
    expect(effectInputsReady('godRays', { lightActorId: null })).toBe(false);
    expect(effectInputsReady('lut', { textureAssetId: 'tex_1' })).toBe(true);
    expect(effectInputsReady('shockWave', { epicenter: { x: 0, y: 1, z: 0 } })).toBe(true);
  });
});

describe('needsComposerPipeline', () => {
  it('stays off for enable + default ACES tone mapping only', () => {
    expect(needsComposerPipeline({ enabled: true })).toBe(false);
    expect(needsComposerPipeline(normalizePostProcessing({ enabled: true }))).toBe(false);
  });

  it('turns on for bloom or non-ACES tone mapping', () => {
    expect(needsComposerPipeline(mergePostProcessing(null, {
      enabled: true,
      effects: { bloom: { enabled: true } },
    }))).toBe(true);
    expect(needsComposerPipeline(mergePostProcessing(null, {
      enabled: true,
      effects: { toneMapping: { enabled: true, mode: 'REINHARD' } },
    }))).toBe(true);
  });

  it('ignores input-gated effects until ready', () => {
    expect(needsComposerPipeline(mergePostProcessing(null, {
      enabled: true,
      effects: { selectiveBloom: { enabled: true, actorIds: [] } },
    }))).toBe(false);
  });
});

describe('postProcessing presets', () => {
  it('ships required builtin presets', () => {
    const ids = BUILTIN_POST_PROCESSING_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'default-disabled',
      'gothic-interior',
      'dark-horror',
      'cinematic',
      'retro-horror',
    ]));
    expect(getBuiltinPreset('gothic-interior').settings.enabled).toBe(true);
    expect(getBuiltinPreset('default-disabled').settings.enabled).toBe(false);
  });
});

describe('SetWorldPostProcessingCommand', () => {
  it('undoes and redoes map post-processing', () => {
    const world = new World({ name: 'Cmd' });
    const applied = [];
    const before = normalizePostProcessing(world.postProcessing);
    const after = mergePostProcessing(before, {
      enabled: true,
      effects: { noise: { enabled: true, opacity: 0.4 } },
    });
    const history = new HistoryStack();
    history.execute(new SetWorldPostProcessingCommand({
      world,
      before,
      after,
      onApply: (s) => applied.push(structuredClone(s)),
    }));
    expect(world.postProcessing.enabled).toBe(true);
    expect(world.postProcessing.effects.noise.opacity).toBeCloseTo(0.4);

    history.undo();
    expect(world.postProcessing.enabled).toBe(false);
    history.redo();
    expect(world.postProcessing.enabled).toBe(true);
    expect(applied.length).toBeGreaterThanOrEqual(3);
  });
});
