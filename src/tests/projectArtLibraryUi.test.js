/**
 * Project Art Library UI store + panel smoke (no credit spend).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_REFS_SOFT_LIMIT,
  __testResetAiAssetsUi,
  addGenerationReferences,
  clearGenerationReferences,
  getAiAssetsUiState,
  removeGenerationReference,
  reorderGenerationReferences,
  clearSelectedRegion,
  setArtSaveTargetFolder,
  setGenerationOrigin,
  setGenerationReferences,
  setLibraryThumbSize,
  setSelectedPromptTemplateId,
  setSelectedRegion,
} from '../editor/aiAssets/aiAssetsUiStore.js';
import { ASSET_CATEGORIES } from '../editor/projectArt/promptTemplates.js';
import { createArtGenerationOrigin } from '../editor/projectArt/generation.js';
import { addItemsAsGenerationReferences } from '../editor/projectArt/generationHandoff.js';
import { ProjectArtLibraryPanel } from '../editor/projectArt/ProjectArtLibraryPanel.jsx';
import {
  __testResetProjectArt,
  __testSetProjectArt,
  getLibraryTagCounts,
  getProjectArtState,
  getVisibleEntries,
  setViewAll,
  setViewRecent,
  setViewTag,
} from '../editor/projectArt/projectArtStore.js';
import { createArtItem, createEmptyLibrary } from '../editor/projectArt/schema.js';

const panelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/projectArt/ProjectArtLibraryPanel.jsx'),
  'utf8',
);

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

describe('Project Art Library — selected region + template state', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
  });

  const region = {
    itemId: 'art_1',
    relativePath: 'Environments/a.png',
    title: 'Alpha',
    x: 0.1,
    y: 0.2,
    width: 0.4,
    height: 0.3,
    naturalWidth: 1024,
    naturalHeight: 768,
    description: 'carved frieze',
  };

  it('sets, clamps, and clears selectedRegion', () => {
    expect(getAiAssetsUiState().selectedRegion).toBeNull();
    setSelectedRegion(region);
    expect(getAiAssetsUiState().selectedRegion).toEqual(region);

    setSelectedRegion({ ...region, x: 0.9, width: 0.5 });
    expect(getAiAssetsUiState().selectedRegion.width).toBeCloseTo(0.1);

    setSelectedRegion({ ...region, width: 0 });
    expect(getAiAssetsUiState().selectedRegion).toBeNull();

    setSelectedRegion(region);
    clearSelectedRegion();
    expect(getAiAssetsUiState().selectedRegion).toBeNull();
  });

  it('syncs selectedPromptTemplateId and resets with the store', () => {
    setSelectedPromptTemplateId('wall_texture');
    setSelectedRegion(region);
    expect(getAiAssetsUiState().selectedPromptTemplateId).toBe('wall_texture');
    __testResetAiAssetsUi();
    expect(getAiAssetsUiState().selectedPromptTemplateId).toBeNull();
    expect(getAiAssetsUiState().selectedRegion).toBeNull();
  });

  it('passes promptTemplateId, sourceRegion, sourceItemId, croppedReference through generationOrigin', () => {
    setGenerationOrigin(createArtGenerationOrigin({
      itemIds: ['art_1'],
      finalPrompt: 'x',
      promptTemplateId: 'wall_texture',
      sourceRegion: region,
      sourceItemId: 'art_1',
      croppedReference: {
        stagingId: 'ref_abc',
        fileName: 'ref_abc.png',
        originalName: 'Alpha-crop.png',
        absolutePath: 'D:/Bloodbound3D/.openart-staging/ref_abc.png',
        sourceItemId: 'art_1',
      },
    }));
    const origin = getAiAssetsUiState().generationOrigin;
    expect(origin.promptTemplateId).toBe('wall_texture');
    expect(origin.sourceItemId).toBe('art_1');
    expect(origin.sourceRegion).toEqual(region);
    expect(origin.croppedReference?.stagingId).toBe('ref_abc');
    expect(origin.croppedReference?.originalName).toBe('Alpha-crop.png');
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

describe('Project Art Library — Bridge browser views', () => {
  beforeEach(() => {
    __testResetProjectArt();
    __testResetAiAssetsUi();
    const library = createEmptyLibrary();
    library.items = [
      createArtItem({
        id: 'art_a',
        relativePath: 'Environments/a.png',
        title: 'Alpha',
        tags: ['gothic', 'interior'],
        favorite: true,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
      createArtItem({
        id: 'art_b',
        relativePath: 'Environments/b.png',
        title: 'Beta',
        tags: ['gothic'],
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
      createArtItem({
        id: 'art_c',
        relativePath: 'Environments/c.png',
        title: 'Charlie',
        tags: ['victorian'],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ];
    __testSetProjectArt({ library, loaded: true });
  });

  it('lists all / recent / tag views without mutating library items', () => {
    setViewAll();
    expect(getProjectArtState().viewMode).toBe('all');
    expect(getVisibleEntries().map((e) => e.item.id).sort()).toEqual(['art_a', 'art_b', 'art_c']);

    setViewRecent();
    expect(getProjectArtState().viewMode).toBe('recent');
    expect(getVisibleEntries().map((e) => e.item.id)).toEqual(['art_b', 'art_a', 'art_c']);

    setViewTag('gothic');
    expect(getProjectArtState().viewMode).toBe('tag');
    expect(getVisibleEntries().map((e) => e.item.id).sort()).toEqual(['art_a', 'art_b']);
  });

  it('aggregates tag counts for the sidebar', () => {
    expect(getLibraryTagCounts()).toEqual([
      { tag: 'gothic', count: 2 },
      { tag: 'interior', count: 1 },
      { tag: 'victorian', count: 1 },
    ]);
  });

  it('Use as Reference adds to the tray without clearing prompt state', () => {
    addItemsAsGenerationReferences([
      { id: 'art_a', relativePath: 'Environments/a.png', title: 'Alpha' },
      { id: 'art_b', relativePath: 'Environments/b.png', title: 'Beta' },
    ]);
    expect(getAiAssetsUiState().generationReferences.map((r) => r.id)).toEqual(['art_a', 'art_b']);
  });
});

describe('Project Art Library — inspector responsibilities', () => {
  it('keeps generation construction out of the library panel', () => {
    expect(panelSource).toContain('Send to Generation');
    expect(panelSource).toContain('Use as Reference');
    expect(panelSource).toContain('Send Region to Generation');
    expect(panelSource).toContain('Select Region');
    expect(panelSource).toContain('Details');
    expect(panelSource).toContain('Prompt');
    expect(panelSource).toContain('Generation');
    expect(panelSource).not.toMatch(/Analyze References & Create Prompt/);
    expect(panelSource).not.toMatch(/Compose Prompt/);
    expect(panelSource).not.toMatch(/Tile Horizontal/);
    expect(panelSource).not.toMatch(/Asset Category/);
    // Send to Generation is selection-gated, not prompt-gated.
    expect(panelSource).toMatch(/disabled=\{busy \|\| !refTargets\.length\}/);
    expect(panelSource).not.toMatch(/disabled=\{busy \|\| !promptForSend\}/);
  });

  it('exposes organize actions on folder / collection / tray / gallery image RMB', () => {
    expect(panelSource).toContain('buildImageMenuItems');
    expect(panelSource).toContain('onItemContextMenu');
    expect(panelSource).toContain('Use as Reference');
    expect(panelSource).toContain('Send to Generation');
    expect(panelSource).toContain('Move to Folder…');
    expect(panelSource).toContain('Copy to Folder…');
    expect(panelSource).toContain('Move Folder…');
    expect(panelSource).toContain('Copy Folder…');
    expect(panelSource).toContain('Add Selection');
    expect(panelSource).toContain('Open in Library');
    expect(panelSource).toContain('Clear All');
    expect(panelSource).toContain('buildCollectionMenuItems');
    expect(panelSource).toContain('buildTrayThumbMenuItems');
  });
});
