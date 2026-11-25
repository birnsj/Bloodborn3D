/**
 * Project Art Library UI store + panel smoke (no credit spend).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  GENERATION_REFS_SOFT_LIMIT,
  __testResetAiAssetsUi,
  addGenerationReferences,
  clearGenerationReferences,
  getAiAssetsUiState,
  removeGenerationReference,
  reorderGenerationReferences,
  setArtSaveTargetFolder,
  setGenerationOrigin,
  setGenerationReferences,
  setLibraryThumbSize,
} from '../editor/aiAssets/aiAssetsUiStore.js';
import { ASSET_CATEGORIES } from '../editor/projectArt/promptTemplates.js';
import { createArtGenerationOrigin } from '../editor/projectArt/generation.js';
import { ProjectArtLibraryPanel } from '../editor/projectArt/ProjectArtLibraryPanel.jsx';

describe('Project Art Library — aiAssetsUiStore reference tray', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
  });

  it('adds, dedupes by id, and never drops unique refs', () => {
    addGenerationReferences([
      { id: 'a', relativePath: 'Environments/a.png', title: 'A' },
      { id: 'b', relativePath: 'Environments/b.png', title: 'B' },
    ]);
    addGenerationReferences([
      { id: 'a', relativePath: 'Environments/a2.png', title: 'A2' },
      { id: 'c', relativePath: 'Environments/c.png', title: 'C' },
    ]);
    const refs = getAiAssetsUiState().generationReferences;
    expect(refs).toHaveLength(3);
    expect(refs.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(refs.find((r) => r.id === 'a')?.title).toBe('A2');
  });

  it('removes by id and supports set/clear/reorder', () => {
    setGenerationReferences([
      { id: '1', relativePath: 'x.png', title: 'One' },
      { id: '2', relativePath: 'y.png', title: 'Two' },
      { id: '3', relativePath: 'z.png', title: 'Three' },
    ]);
    reorderGenerationReferences(0, 2);
    expect(getAiAssetsUiState().generationReferences.map((r) => r.id)).toEqual(['2', '3', '1']);
    removeGenerationReference('1');
    expect(getAiAssetsUiState().generationReferences.map((r) => r.id)).toEqual(['2', '3']);
    clearGenerationReferences();
    expect(getAiAssetsUiState().generationReferences).toEqual([]);
  });

  it('soft-warns above soft limit but still stores all', () => {
    const many = Array.from({ length: GENERATION_REFS_SOFT_LIMIT + 2 }, (_, i) => ({
      id: `id_${i}`,
      relativePath: `f/${i}.png`,
      title: `T${i}`,
    }));
    addGenerationReferences(many);
    const state = getAiAssetsUiState();
    expect(state.generationReferences).toHaveLength(GENERATION_REFS_SOFT_LIMIT + 2);
    expect(state.generationReferencesWarning).toMatch(/soft limit/i);
  });

  it('persists artSaveTargetFolder and libraryThumbSize', () => {
    setArtSaveTargetFolder('Environments/Mansion/Concepts');
    setLibraryThumbSize(120);
    expect(getAiAssetsUiState().artSaveTargetFolder).toBe('Environments/Mansion/Concepts');
    expect(getAiAssetsUiState().libraryThumbSize).toBe(120);
  });
});

describe('Project Art Library — generationOrigin extended fields', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
  });

  it('stores assetCategory, tiling, itemIds, folderPath', () => {
    const origin = createArtGenerationOrigin({
      itemIds: ['art_1', 'art_2'],
      promptId: 'prompt_9',
      finalPrompt: 'stone wall tile',
      assetCategory: 'wall_texture',
      tileHorizontal: true,
      tileVertical: false,
      folderPath: 'Environments/Mansion/Textures',
    });
    setGenerationOrigin(origin);
    expect(getAiAssetsUiState().generationOrigin).toEqual({
      areaId: null,
      conceptId: 'art_1',
      promptId: 'prompt_9',
      finalPrompt: 'stone wall tile',
      assetCategory: 'wall_texture',
      tileHorizontal: true,
      tileVertical: false,
      itemIds: ['art_1', 'art_2'],
      folderPath: 'Environments/Mansion/Textures',
    });
  });
});

describe('Project Art Library — catalog smoke', () => {
  it('exposes ASSET_CATEGORIES', () => {
    expect(ASSET_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    expect(ASSET_CATEGORIES.some((c) => c.id === 'wall_texture')).toBe(true);
  });

  it('exports ProjectArtLibraryPanel', () => {
    expect(typeof ProjectArtLibraryPanel).toBe('function');
  });
});
