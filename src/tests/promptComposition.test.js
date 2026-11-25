import { beforeEach, describe, expect, it } from 'vitest';
import {
  __testResetAiAssetsUi,
  getAiAssetsUiState,
  setPromptComposition,
} from '../editor/aiAssets/aiAssetsUiStore.js';
import {
  TILING_INSTRUCTIONS,
  composeGenerationPrompt,
  tilingInstruction,
} from '../editor/aiAssets/promptComposition.js';
import {
  getOpenArtComposedPrompt,
  getOpenArtUiState,
  openArtResetSession,
  openArtSetPrompt,
} from '../editor/openart/openArtUiStore.js';

describe('AI Assets prompt composition — tiling', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
    openArtResetSession();
  });

  it('appends nothing when both tiling boxes are off', () => {
    expect(tilingInstruction({})).toBe('');
    expect(composeGenerationPrompt({ prompt: 'ashlar wall' })).toBe('ashlar wall');
  });

  it('appends horizontal-only, vertical-only, and both instructions', () => {
    expect(composeGenerationPrompt({
      prompt: 'stone',
      tileHorizontal: true,
    })).toBe(`stone\n\n${TILING_INSTRUCTIONS.horizontal}`);

    expect(composeGenerationPrompt({
      prompt: 'stone',
      tileVertical: true,
    })).toBe(`stone\n\n${TILING_INSTRUCTIONS.vertical}`);

    expect(composeGenerationPrompt({
      prompt: 'stone',
      tileHorizontal: true,
      tileVertical: true,
    })).toBe(`stone\n\n${TILING_INSTRUCTIONS.both}`);
  });

  it('does not mutate the editable prompt stored in OpenArt UI state', () => {
    openArtSetPrompt('editable body');
    setPromptComposition({ tileHorizontal: true, tileVertical: false });
    expect(getAiAssetsUiState().promptComposition).toEqual({
      tileHorizontal: true,
      tileVertical: false,
    });
    expect(getOpenArtComposedPrompt()).toContain(TILING_INSTRUCTIONS.horizontal);
    expect(getOpenArtUiState().prompt).toBe('editable body');
  });

  it('defaults tiling flags to unchecked in the AI Assets store', () => {
    expect(getAiAssetsUiState().promptComposition).toEqual({
      tileHorizontal: false,
      tileVertical: false,
    });
  });
});
