/**
 * Phase 2H.1D — Concept Library (no credit spend).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  CONCEPT_LIBRARY_SCHEMA_VERSION,
  MAX_CONCEPTS_PER_AREA,
  PROMPT_CATEGORIES,
  createArea,
  createConcept,
  createEmptyLibrary,
  createPrompt,
  normalizeAssetRefs,
  normalizeLibrary,
} from '../editor/conceptLibrary/schema.js';
import {
  buildFinalConceptPrompt,
  createGenerationOrigin,
  createGeneratedAssetRef,
  openArtSupportsReferenceImages,
  preferReferenceMode,
} from '../editor/conceptLibrary/conceptGeneration.js';
import {
  getVisionCapability,
  mergeAnalysisSuggestions,
} from '../editor/conceptLibrary/visionProvider.js';
import {
  __testResetAiAssetsUi,
  getAiAssetsUiState,
  setGenerationOrigin,
  clearGenerationOrigin,
} from '../editor/aiAssets/aiAssetsUiStore.js';
import { WORKSPACES } from '../editor/layout/layoutPrefs.js';

describe('Phase 2H.1D — schema', () => {
  it('starts empty at schema version 1 with prompt categories', () => {
    const lib = createEmptyLibrary();
    expect(lib.schemaVersion).toBe(CONCEPT_LIBRARY_SCHEMA_VERSION);
    expect(lib.areas).toEqual([]);
    expect(PROMPT_CATEGORIES.some((c) => c.id === 'surface')).toBe(true);
    expect(MAX_CONCEPTS_PER_AREA).toBe(10);
  });

  it('creates areas, concepts, and prompts with stable fields', () => {
    const area = createArea({ id: 'area_1', name: 'Hall' });
    const concept = createConcept({
      id: 'concept_1',
      areaId: area.id,
      title: 'Ashlar wall',
      generationPrompt: 'stone wall',
      provenance: { source: 'import' },
    });
    const prompt = createPrompt({
      id: 'prompt_1',
      areaId: area.id,
      conceptIds: [concept.id],
      category: 'surface',
      promptText: 'tileable ashlar',
    });
    expect(area.name).toBe('Hall');
    expect(concept.provenance.source).toBe('import');
    expect(prompt.category).toBe('surface');
  });

  it('normalizes broken references and enforces concept order membership', () => {
    const raw = {
      schemaVersion: 1,
      areas: [{
        id: 'area_a',
        name: 'A',
        conceptOrder: ['concept_keep', 'concept_missing', 'concept_keep'],
        primaryConceptId: 'concept_missing',
      }],
      concepts: [
        { id: 'concept_keep', areaId: 'area_a', title: 'Keep', imagePath: 'images/area_a/concept_keep.png' },
        { id: 'concept_orphan', areaId: 'area_gone', title: 'Orphan', imagePath: '' },
      ],
      prompts: [
        { id: 'prompt_ok', areaId: 'area_a', conceptIds: ['concept_keep', 'concept_gone'], name: 'P', promptText: 'x' },
        { id: 'prompt_bad', areaId: 'area_gone', name: 'Bad', promptText: 'y' },
      ],
    };
    const lib = normalizeLibrary(raw);
    expect(lib.areas).toHaveLength(1);
    expect(lib.concepts.map((c) => c.id)).toEqual(['concept_keep']);
    expect(lib.areas[0].conceptOrder).toEqual(['concept_keep']);
    expect(lib.areas[0].primaryConceptId).toBe('concept_keep');
    expect(lib.prompts).toHaveLength(1);
    expect(lib.prompts[0].conceptIds).toEqual(['concept_keep']);
  });

  it('caps conceptOrder at MAX_CONCEPTS_PER_AREA during normalize', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const raw = {
      areas: [{ id: 'area_a', name: 'A', conceptOrder: ids, primaryConceptId: ids[0] }],
      concepts: ids.map((id) => ({ id, areaId: 'area_a', title: id, imagePath: '' })),
      prompts: [],
    };
    const lib = normalizeLibrary(raw);
    expect(lib.areas[0].conceptOrder).toHaveLength(MAX_CONCEPTS_PER_AREA);
    expect(lib.concepts).toHaveLength(MAX_CONCEPTS_PER_AREA);
  });
});

describe('Phase 2H.1D — vision extension point', () => {
  it('reports OpenArt vision as unsupported (no fabricated capability)', () => {
    const cap = getVisionCapability();
    expect(cap.supportsCaption).toBe(false);
    expect(cap.supportsImageToPrompt).toBe(false);
    expect(cap.reason).toMatch(/OpenArt CLI/i);
  });

  it('merges analysis suggestions without overwriting designer-authored fields', () => {
    const concept = createConcept({
      id: 'c1',
      areaId: 'a1',
      description: 'Designer description',
      materials: '',
      tags: ['hall'],
    });
    const merged = mergeAnalysisSuggestions(concept, {
      description: 'AI description',
      materials: 'limestone',
      tags: ['stone'],
    });
    expect(merged.description).toBe('Designer description');
    expect(merged.materials).toBe('limestone');
    expect(merged.tags).toEqual(expect.arrayContaining(['hall', 'stone']));
  });
});

describe('Phase 2H.1D — workspace registration', () => {
  it('keeps AI Assets as the host workspace', () => {
    expect(WORKSPACES.some((w) => w.id === 'ai' && w.label === 'AI Assets')).toBe(true);
  });
});

describe('Phase 2H.1D — final prompt + reference support', () => {
  it('builds the complete final submitted prompt with art direction', () => {
    expect(buildFinalConceptPrompt({
      artDirection: 'warm stone interiors',
      promptText: 'tileable ashlar wall',
    })).toBe('[Art direction] warm stone interiors\n\ntileable ashlar wall');
    expect(buildFinalConceptPrompt({ promptText: 'only body' })).toBe('only body');
    expect(buildFinalConceptPrompt({ artDirection: 'dir only' })).toBe('[Art direction] dir only');
  });

  it('detects OpenArt reference-image support from schema or image2image mode', () => {
    expect(openArtSupportsReferenceImages({
      mode: 'text2image',
      schemaProperties: {},
      availableModes: [{ mode: 'text2image' }],
    })).toBe(false);
    expect(openArtSupportsReferenceImages({
      mode: 'text2image',
      schemaProperties: { image: { type: 'string' } },
    })).toBe(true);
    expect(openArtSupportsReferenceImages({
      mode: 'image2image',
      schemaProperties: {},
    })).toBe(true);
    expect(openArtSupportsReferenceImages({
      mode: 'text2image',
      availableModes: [{ mode: 'text2image' }, { mode: 'image2image' }],
    })).toBe(true);
  });

  it('prefers image2image when a concept reference will be attached', () => {
    expect(preferReferenceMode({
      availableModes: [{ mode: 'text2image' }, { mode: 'image2image' }],
      currentMode: 'text2image',
      hasReference: true,
    })).toBe('image2image');
    expect(preferReferenceMode({
      availableModes: [{ mode: 'text2image' }],
      currentMode: 'text2image',
      hasReference: true,
    })).toBe('text2image');
  });
});

describe('Phase 2H.1D — concept↔asset associations', () => {
  it('normalizes generatedAssetRefs and drops invalid entries', () => {
    const refs = normalizeAssetRefs([
      { id: 'tex_1', kind: 'texture', name: 'Wall', areaId: 'a1', conceptId: 'c1', promptId: 'p1', attachedAt: '2026-01-01T00:00:00.000Z' },
      { id: '', kind: 'texture' },
      { kind: 'material' },
      null,
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: 'tex_1',
      kind: 'texture',
      name: 'Wall',
      areaId: 'a1',
      conceptId: 'c1',
      promptId: 'p1',
    });
  });

  it('preserves generatedAssetRefs on concepts and prompts through normalize', () => {
    const raw = {
      areas: [{ id: 'area_a', name: 'A', conceptOrder: ['concept_1'] }],
      concepts: [{
        id: 'concept_1',
        areaId: 'area_a',
        title: 'Wall',
        imagePath: 'images/area_a/concept_1.png',
        generatedAssetRefs: [
          { id: 'tex_keep', kind: 'texture', name: 'Keep', conceptId: 'concept_1' },
          { id: 'bad' },
        ],
      }],
      prompts: [{
        id: 'prompt_1',
        areaId: 'area_a',
        conceptIds: ['concept_1'],
        name: 'P',
        promptText: 'x',
        generatedAssetRefs: [
          { id: 'mat_1', kind: 'material', name: 'Mat', conceptId: 'concept_1', promptId: 'prompt_1' },
        ],
      }],
    };
    const lib = normalizeLibrary(raw);
    expect(lib.concepts[0].generatedAssetRefs).toHaveLength(1);
    expect(lib.concepts[0].generatedAssetRefs[0].id).toBe('tex_keep');
    expect(lib.prompts[0].generatedAssetRefs[0].kind).toBe('material');
  });

  it('creates generation origin and asset ref payloads with area/concept/prompt ids', () => {
    const origin = createGenerationOrigin({
      areaId: 'area_1',
      conceptId: 'concept_1',
      promptId: 'prompt_1',
      finalPrompt: 'full prompt text',
    });
    expect(origin).toEqual({
      areaId: 'area_1',
      conceptId: 'concept_1',
      promptId: 'prompt_1',
      finalPrompt: 'full prompt text',
    });
    const ref = createGeneratedAssetRef({
      id: 'tex_9',
      kind: 'texture',
      name: 'Ashlar',
      areaId: 'area_1',
      conceptId: 'concept_1',
      promptId: 'prompt_1',
    });
    expect(ref).toMatchObject({
      id: 'tex_9',
      kind: 'texture',
      areaId: 'area_1',
      conceptId: 'concept_1',
      promptId: 'prompt_1',
    });
    expect(ref.attachedAt).toMatch(/T/);
  });
});

describe('Phase 2H.1D — generation origin UI state', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
  });

  it('preserves originating ids through Asset Generation until cleared', () => {
    setGenerationOrigin({
      areaId: 'a',
      conceptId: 'c',
      promptId: 'p',
      finalPrompt: 'hello',
    });
    expect(getAiAssetsUiState().generationOrigin).toEqual({
      areaId: 'a',
      conceptId: 'c',
      promptId: 'p',
      finalPrompt: 'hello',
      assetCategory: null,
      tileHorizontal: false,
      tileVertical: false,
      itemIds: [],
      folderPath: null,
    });
    clearGenerationOrigin();
    expect(getAiAssetsUiState().generationOrigin).toBeNull();
  });
});
