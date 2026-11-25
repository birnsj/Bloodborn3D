/**
 * Phase 2H.1C — AI Assets workspace (mocked; never spends credits).
 */
import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_CATEGORIES,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  getAiProvider,
} from '../editor/aiAssets/providers.js';
import {
  __testResetAiAssetsUi,
  getAiAssetsUiState,
  selectAiProvider,
} from '../editor/aiAssets/aiAssetsUiStore.js';
import {
  humanizeFieldName,
  partitionPrimaryForLayout,
  partitionSchemaKeys,
} from '../editor/openart/schemaForm.jsx';
import { WORKSPACES } from '../editor/layout/layoutPrefs.js';
import { DOCK_PANELS } from '../editor/layout/dockLayout.js';
import { ASSET_FOLDERS } from '../data/sampleAssets.js';

describe('Phase 2H.1C — AI Assets workspace catalog', () => {
  it('registers the AI Assets workspace id', () => {
    expect(WORKSPACES.find((w) => w.id === 'ai')?.label).toBe('AI Assets');
  });

  it('groups image and 3D providers with coming-soon slots', () => {
    expect(AI_PROVIDER_CATEGORIES.map((c) => c.id)).toEqual(['image', 'mesh']);
    expect(getAiProvider('openart')?.status).toBe('available');
    expect(getAiProvider('comfyui')?.status).toBe('coming_soon');
    expect(getAiProvider('meshy')?.status).toBe('coming_soon');
    expect(AI_PROVIDERS).toHaveLength(3);
  });

  it('defaults selection to OpenArt and preserves selection across store reads', () => {
    __testResetAiAssetsUi();
    expect(getAiAssetsUiState().selectedProviderId).toBe(DEFAULT_AI_PROVIDER_ID);
    selectAiProvider('meshy');
    expect(getAiAssetsUiState().selectedProviderId).toBe('meshy');
    selectAiProvider('openart');
    expect(getAiAssetsUiState().selectedProviderId).toBe('openart');
    __testResetAiAssetsUi();
  });

  it('removes standalone OpenArt dock / Content Browser folder', () => {
    expect(DOCK_PANELS.openart).toBeUndefined();
    expect(ASSET_FOLDERS).not.toContain('OpenArt');
  });
});

describe('Phase 2H.1C — dynamic schema partitioning', () => {
  it('keeps primary generation fields visible and advances the rest', () => {
    const { primary, advanced } = partitionSchemaKeys({
      prompt: { type: 'string' },
      image: { type: 'string' },
      aspectRatio: { type: 'string', enum: ['1:1', '16:9'] },
      resolution: { type: 'string', enum: ['1K', '2K'] },
      negativePrompt: { type: 'string' },
      seed: { type: 'integer' },
      guidance: { type: 'number', minimum: 1, maximum: 20 },
      steps: { type: 'integer' },
      weirdNested: { type: 'object' },
    });
    expect(primary).toEqual(expect.arrayContaining(['aspectRatio', 'resolution', 'negativePrompt']));
    expect(primary).not.toContain('prompt');
    expect(primary).not.toContain('image');
    expect(advanced).toEqual(expect.arrayContaining(['seed', 'guidance', 'steps', 'weirdNested']));
  });

  it('humanizes camelCase field names', () => {
    expect(humanizeFieldName('aspectRatio')).toBe('Aspect Ratio');
    expect(humanizeFieldName('negative_prompt')).toBe('Negative prompt');
  });

  it('keeps image count on its own row and packs ratio / resolution compactly', () => {
    const { count, compact, rest, advanced } = partitionPrimaryForLayout({
      prompt: { type: 'string' },
      imageCount: { type: 'integer' },
      aspectRatio: { type: 'string', enum: ['1:1'] },
      resolution: { type: 'string', enum: ['1K'] },
      negativePrompt: { type: 'string' },
      seed: { type: 'integer' },
    });
    expect(count).toEqual(['imageCount']);
    expect(compact).toEqual(['aspectRatio', 'resolution']);
    expect(rest).toEqual(['negativePrompt']);
    expect(advanced).toEqual(['seed']);
  });
});
