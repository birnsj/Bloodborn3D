/**
 * Phase 2H.1D — Concept Library (no credit spend).
 */
import { describe, expect, it } from 'vitest';
import {
  CONCEPT_LIBRARY_SCHEMA_VERSION,
  MAX_CONCEPTS_PER_AREA,
  PROMPT_CATEGORIES,
  createArea,
  createConcept,
  createEmptyLibrary,
  createPrompt,
  normalizeLibrary,
} from '../editor/conceptLibrary/schema.js';
import {
  getVisionCapability,
  mergeAnalysisSuggestions,
} from '../editor/conceptLibrary/visionProvider.js';
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
