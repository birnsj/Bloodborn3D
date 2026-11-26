/**
 * Project Art Library schema v2 + template prompts (no credit spend).
 */
import { describe, expect, it } from 'vitest';
import {
  PROJECT_ART_SCHEMA_VERSION,
  createArtItem,
  createEmptyLibrary,
  migrateConceptLibraryToProjectArt,
  normalizeLibrary,
} from '../editor/projectArt/schema.js';
import {
  ASSET_CATEGORIES,
  PROMPT_TEMPLATES,
  assembleRegionTemplatePrompt,
  composeTemplateAssetPrompt,
  getPromptTemplate,
} from '../editor/projectArt/promptTemplates.js';
import {
  TILING_INSTRUCTIONS,
  composeGenerationPrompt,
  hasTilingLanguage,
  tilingInstruction,
} from '../editor/aiAssets/promptComposition.js';
import {
  analyzeAssetPromptRequest,
  getVisionCapability,
} from '../editor/projectArt/visionProvider.js';

describe('Project Art — schema v2', () => {
  it('preserves originalGenerationPrompt separately from editable generationPrompt', () => {
    const item = createArtItem({
      id: 'art_1',
      relativePath: 'Environments/Mansion/Concepts/Interiors/grand_hall.png',
      generationPrompt: 'edited working prompt',
      originalGenerationPrompt: 'original submitted prompt',
    });
    expect(item.originalGenerationPrompt).toBe('original submitted prompt');
    expect(item.generationPrompt).toBe('edited working prompt');
  });

  it('createEmptyLibrary returns schema version 2 with empty collections', () => {
    const lib = createEmptyLibrary();
    expect(lib.schemaVersion).toBe(PROJECT_ART_SCHEMA_VERSION);
    expect(lib.schemaVersion).toBe(2);
    expect(lib.migratedFrom).toBeNull();
    expect(lib.items).toEqual([]);
    expect(lib.prompts).toEqual([]);
    expect(lib.collections).toEqual([]);
    expect(lib.referenceSets).toEqual([]);
  });

  it('normalize repairs broken item/prompt references', () => {
    const raw = {
      schemaVersion: 2,
      items: [
        { id: 'art_1', relativePath: 'Environments/Hall/Concepts/a.png', title: 'A', associatedPromptIds: ['p_ok', 'p_gone'] },
        { id: '', relativePath: 'x.png', title: 'bad' },
      ],
      prompts: [
        { id: 'p_ok', name: 'Ok', itemIds: ['art_1', 'art_missing'], promptText: 'x' },
        { id: 'p_gone_ref', name: 'Dangling', itemIds: ['art_missing'] },
      ],
      collections: [
        { id: 'col_1', name: 'C', itemIds: ['art_1', 'art_missing'] },
      ],
      referenceSets: [
        { id: 'rs_1', name: 'R', itemIds: ['art_missing'] },
      ],
    };
    const lib = normalizeLibrary(raw);
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0].associatedPromptIds).toEqual(['p_ok']);
    expect(lib.prompts).toHaveLength(2);
    expect(lib.prompts.find((p) => p.id === 'p_ok').itemIds).toEqual(['art_1']);
    expect(lib.collections[0].itemIds).toEqual(['art_1']);
    expect(lib.referenceSets[0].itemIds).toEqual([]);
  });

  it('migrateConceptLibraryToProjectArt maps areas, concepts, and prompts', () => {
    const v1 = {
      schemaVersion: 1,
      areas: [
        {
          id: 'area_hall',
          name: 'Grand Hall',
          conceptOrder: ['concept_wall'],
          primaryConceptId: 'concept_wall',
        },
      ],
      concepts: [
        {
          id: 'concept_wall',
          areaId: 'area_hall',
          title: 'Ashlar Wall',
          imagePath: 'images/area_hall/concept_wall.png',
          generationPrompt: 'stone ashlar',
          tags: ['stone'],
          associatedPromptIds: ['prompt_tex'],
          generatedAssetRefs: [{ id: 'tex_1', kind: 'texture', name: 'Ashlar' }],
          provenance: { source: 'import' },
        },
      ],
      prompts: [
        {
          id: 'prompt_tex',
          areaId: 'area_hall',
          conceptIds: ['concept_wall'],
          name: 'Wall tex',
          category: 'surface',
          promptText: 'tileable ashlar',
        },
      ],
    };

    const { library, fileCopies } = migrateConceptLibraryToProjectArt(v1);
    expect(library.schemaVersion).toBe(2);
    expect(library.migratedFrom).toBe('concept-library');
    expect(library.items).toHaveLength(1);
    expect(library.items[0].id).toBe('concept_wall');
    expect(library.items[0].relativePath).toBe('Environments/Grand Hall/Concepts/Ashlar Wall.png');
    expect(library.items[0].tags).toEqual(['stone']);
    expect(library.items[0].generatedAssetRefs[0].id).toBe('tex_1');
    expect(library.prompts).toHaveLength(1);
    expect(library.prompts[0].id).toBe('prompt_tex');
    expect(library.prompts[0].itemIds).toEqual(['concept_wall']);
    expect(library.prompts[0].assetCategory).toBe('wall_texture');
    expect(fileCopies).toEqual([
      {
        sourceRelative: 'images/area_hall/concept_wall.png',
        destRelative: 'Environments/Grand Hall/Concepts/Ashlar Wall.png',
        itemId: 'concept_wall',
      },
    ]);
  });
});

describe('Project Art — ASSET_CATEGORIES + templates', () => {
  it('ASSET_CATEGORIES includes required entries', () => {
    const ids = ASSET_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      'environment_concept',
      'wall_texture',
      'full_wall_texture',
      'floor_texture',
      'ceiling_texture',
      'architectural_element',
      'door_window',
      'furniture',
      'decorative_object',
      'prop',
      'lighting_fixture',
      'character',
      'weapon',
      'other',
    ]));
    expect(ASSET_CATEGORIES.find((c) => c.id === 'door_window')?.label).toBe('Door / Window');
    expect(ASSET_CATEGORIES.find((c) => c.id === 'full_wall_texture')?.label).toBe('Full Wall Texture');
  });

  it('Full Wall Texture composes floor-to-ceiling orthographic wording without hardcoded tiling', () => {
    const result = composeTemplateAssetPrompt({
      templateId: 'full_wall_texture',
      includeTiling: false,
      tileHorizontal: true,
      tileVertical: false,
    });
    expect(result.templateId).toBe('full_wall_texture');
    expect(result.promptText.toLowerCase()).toMatch(/floor to ceiling|baseboard|crown molding/);
    expect(result.promptText.toLowerCase()).toMatch(/orthographic/);
    expect(result.promptText.toLowerCase()).not.toMatch(/seamless/);
    expect(getPromptTemplate('full_wall_texture')?.suggestedDefaults).toEqual({
      tileHorizontal: true,
      tileVertical: false,
    });
  });

  it('composeTemplateAssetPrompt wall_texture recreates reference material + tiling', () => {
    const result = composeTemplateAssetPrompt({
      assetCategory: 'wall_texture',
      instruction: 'weathered limestone ashlar',
      tileHorizontal: true,
      tileVertical: true,
      referenceTitles: ['Hall study'],
    });
    expect(result.source).toBe('template');
    expect(result.promptText.toLowerCase()).toMatch(/reference image/);
    expect(result.promptText.toLowerCase()).toMatch(/perspective|weathering/);
    expect(result.promptText.toLowerCase()).toMatch(/tiling|tile/);
    expect(result.promptText).toMatch(/weathered limestone ashlar/i);
    expect(result.promptText).toMatch(/Hall study/);
    expect(result.notes.some((n) => /template/i.test(n))).toBe(true);
  });

  it('adds 3D Model Reference + Sprite templates with full definitions', () => {
    expect(getPromptTemplate('model_3d_reference')?.label).toBe('3D Model Reference');
    expect(getPromptTemplate('sprite')?.label).toBe('Sprite');
    expect(ASSET_CATEGORIES.map((c) => c.id)).toEqual(PROMPT_TEMPLATES.map((t) => t.id));
    for (const t of PROMPT_TEMPLATES) {
      expect(typeof t.description).toBe('string');
      expect(typeof t.framing).toBe('string');
      expect(Array.isArray(t.technicalConstraints)).toBe(true);
      expect(typeof t.outputType).toBe('string');
      expect(typeof t.tilingRelevant).toBe('boolean');
      expect(typeof t.orthographicRequired).toBe('boolean');
      expect(typeof t.isolatedObject).toBe('boolean');
      expect(typeof t.suggestedDefaults).toBe('object');
    }
    expect(getPromptTemplate('nope')).toBeNull();
  });

  it('assembleRegionTemplatePrompt wall texture: cropped reference + horizontal tiling only', () => {
    const result = assembleRegionTemplatePrompt({
      templateId: 'wall_texture',
      regionDescription: 'x 10%, y 20%, 40% × 30%',
      instruction: 'weathered limestone ashlar',
      tileHorizontal: true,
      tileVertical: false,
      referenceTitles: ['Hall study'],
      itemTitle: 'Hall study',
    });
    const text = result.promptText;
    expect(text.toLowerCase()).toMatch(/cropped region/);
    expect(text.toLowerCase()).toMatch(/reference image/);
    expect(text).toContain(tilingInstruction({ tileHorizontal: true }));
    expect(text).not.toContain(TILING_INSTRUCTIONS.vertical);
    expect(text).toMatch(/weathered limestone ashlar/);
    expect(result.notes.some((n) => /image reference/i.test(n))).toBe(true);
  });

  it('template body without tiling gets tiling exactly once via composeGenerationPrompt', () => {
    const body = assembleRegionTemplatePrompt({
      templateId: 'wall_texture',
      instruction: 'stone',
      tileHorizontal: true,
      includeTiling: false,
    }).promptText;
    expect(hasTilingLanguage(body)).toBe(false);
    const final = composeGenerationPrompt({ prompt: body, tileHorizontal: true });
    expect(final.split(TILING_INSTRUCTIONS.horizontal)).toHaveLength(2);

    // Template with tiling already included is not re-appended.
    const withTiling = composeTemplateAssetPrompt({
      assetCategory: 'wall_texture',
      instruction: 'stone',
      tileHorizontal: true,
    }).promptText;
    const again = composeGenerationPrompt({ prompt: withTiling, tileHorizontal: true });
    expect(again).toBe(withTiling);
  });
});

describe('Project Art — vision provider', () => {
  it('reports vision unsupported and template path available', async () => {
    const cap = getVisionCapability();
    expect(cap.supportsCaption).toBe(false);
    expect(cap.supportsTemplatePrompt).toBe(true);

    const vision = await analyzeAssetPromptRequest({ mode: 'vision' });
    expect(vision.ok).toBe(false);
    expect(vision.code).toBe('VISION_UNSUPPORTED');
    expect(vision.fallback?.mode).toBe('template');

    const templated = await analyzeAssetPromptRequest({
      mode: 'template',
      assetCategory: 'floor_texture',
      instruction: 'marble',
      tileHorizontal: true,
    });
    expect(templated.ok).toBe(true);
    expect(templated.source).toBe('template');
    expect(templated.promptText.toLowerCase()).toMatch(/orthographic|tiling|tile/);
  });
});
