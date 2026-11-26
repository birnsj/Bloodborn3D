/**
 * Region → Asset Generation handoff dry-run (no credit spend).
 * Verifies cropped reference, Wall Texture prompt, mode, and tiling seed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../io/openArtClient.js', () => ({
  uploadOpenArtReference: vi.fn(async (file) => ({
    ok: true,
    stagingId: 'ref_regioncrop01',
    fileName: 'ref_regioncrop01.png',
    originalName: file?.name || 'region-crop.png',
    absolutePath: 'D:/BloodBound3D/.openart-staging/ref_regioncrop01.png',
  })),
}));

vi.mock('../editor/projectArt/cropRegionImage.js', () => ({
  cropImageRegionToFile: vi.fn(async () => new File(
    [new Uint8Array([1, 2, 3])],
    'Master_Bedroom-crop.png',
    { type: 'image/png' },
  )),
}));

const applySeedMock = vi.fn(async (payload) => payload);
const connectMock = vi.fn(async () => ({}));
const setReferenceMock = vi.fn();

vi.mock('../editor/openart/openArtUiStore.js', () => ({
  getOpenArtUiState: () => ({
    prompt: 'ORIGINAL BEDROOM CONCEPT PROMPT — should not be submitted',
    mode: 'text2image',
    modelId: 'nano-banana-2',
    imageModels: [{
      id: 'nano-banana-2',
      modes: { image: [{ mode: 'text2image' }, { mode: 'image2image' }] },
    }],
    form: { jsonSchema: { properties: { image: { type: 'string' } } } },
    referenceStagingPath: null,
    referenceStagingId: null,
  }),
  openArtApplySeed: (...args) => applySeedMock(...args),
  openArtConnect: (...args) => connectMock(...args),
  openArtSetReference: (...args) => setReferenceMock(...args),
}));

vi.mock('../editor/projectArt/projectArtStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    projectArtStageReferences: vi.fn(async () => {
      throw new Error('Tray full-image staging must not run when a crop is provided');
    }),
  };
});

import { __testResetAiAssetsUi, getAiAssetsUiState } from '../editor/aiAssets/aiAssetsUiStore.js';
import {
  composeRegionHandoffPrompt,
  resolveRegionTemplateId,
  sendRegionToGeneration,
} from '../editor/projectArt/generationHandoff.js';
import { composeGenerationPrompt } from '../editor/aiAssets/promptComposition.js';

const region = {
  itemId: 'art_bedroom',
  relativePath: 'Environments/Mansion/Concepts/Interiors/master_bedroom.png',
  title: 'Master Bedroom',
  x: 0.76,
  y: 0.13,
  width: 0.24,
  height: 0.59,
  naturalWidth: 1024,
  naturalHeight: 1024,
};

const item = {
  id: 'art_bedroom',
  relativePath: region.relativePath,
  title: 'Master Bedroom',
  generationPrompt: 'ORIGINAL BEDROOM CONCEPT PROMPT — should not be submitted',
  originalGenerationPrompt: 'ORIGINAL BEDROOM CONCEPT PROMPT — should not be submitted',
  provenance: { assetCategory: 'environment_concept', tileHorizontal: true },
};

describe('Region handoff — prompt composition (dry)', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
    applySeedMock.mockClear();
    connectMock.mockClear();
    setReferenceMock.mockClear();
  });

  it('defaults region template to Wall Texture (not concept provenance)', () => {
    expect(resolveRegionTemplateId(null)).toBe('wall_texture');
    expect(resolveRegionTemplateId('architectural_element')).toBe('architectural_element');
    expect(resolveRegionTemplateId('full_wall_texture')).toBe('full_wall_texture');
  });

  it('Full Wall Texture region compose includes floor-to-ceiling constraints without tiling language', () => {
    const { promptText, templateId } = composeRegionHandoffPrompt({
      templateId: 'full_wall_texture',
      region,
      itemTitle: item.title,
    });
    expect(templateId).toBe('full_wall_texture');
    expect(promptText.toLowerCase()).toMatch(/floor to ceiling|baseboard|crown molding/);
    expect(promptText).not.toContain('ORIGINAL BEDROOM CONCEPT PROMPT');
    expect(promptText.toLowerCase()).not.toMatch(/seamless/);
  });

  it('composes a Wall Texture prompt without the concept bedroom text', () => {
    const { promptText, templateId } = composeRegionHandoffPrompt({
      templateId: 'wall_texture',
      region,
      itemTitle: item.title,
    });
    expect(templateId).toBe('wall_texture');
    expect(promptText.toLowerCase()).toMatch(/wall/);
    expect(promptText.toLowerCase()).toMatch(/cropped region/);
    expect(promptText).not.toContain('ORIGINAL BEDROOM CONCEPT PROMPT');
    // Tiling is checkbox-owned at submit time.
    expect(promptText.toLowerCase()).not.toMatch(/seamless/);
  });
});

describe('Region handoff — sendRegionToGeneration dry run', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
    applySeedMock.mockClear();
    connectMock.mockClear();
    setReferenceMock.mockClear();
  });

  it('seeds cropped reference + Wall Texture prompt + image2image, not the bedroom prompt', async () => {
    const result = await sendRegionToGeneration({
      item,
      region,
      templateId: 'wall_texture',
      folderPath: 'Environments/Mansion/Concepts/Interiors',
    });

    expect(result.ok).toBe(true);
    expect(result.stagedRefs).toBe(true);
    expect(result.templateId).toBe('wall_texture');
    expect(result.mode).toBe('image2image');
    expect(result.referenceStagingId).toBe('ref_regioncrop01');
    expect(result.referenceStagingPath).toContain('ref_regioncrop01.png');
    expect(result.prompt).not.toContain('ORIGINAL BEDROOM CONCEPT PROMPT');
    expect(result.prompt.toLowerCase()).toMatch(/wall/);
    expect(result.prompt.toLowerCase()).toMatch(/cropped region/);

    // Last seed call must include crop path + composed prompt + image2image.
    const seedCalls = applySeedMock.mock.calls.map((c) => c[0]);
    const withRef = seedCalls.find((p) => p.referenceStagingPath);
    expect(withRef).toBeTruthy();
    expect(withRef.mode).toBe('image2image');
    expect(withRef.prompt).toBe(result.prompt);
    expect(withRef.referenceStagingPath).toBe(result.referenceStagingPath);
    expect(withRef.referenceStagingId).toBe('ref_regioncrop01');
    expect(withRef.prompt).not.toContain('ORIGINAL BEDROOM CONCEPT PROMPT');

    // Wall Texture suggested default: Tile Horizontal on.
    const ui = getAiAssetsUiState();
    expect(ui.promptComposition.tileHorizontal).toBe(true);
    expect(ui.promptComposition.tileVertical).toBe(false);
    expect(ui.selectedPromptTemplateId).toBe('wall_texture');
    expect(ui.generationOrigin?.croppedReference?.stagingId).toBe('ref_regioncrop01');
    expect(ui.generationOrigin?.finalPrompt).toBe(result.prompt);

    // Final submitted preview must equal composeGenerationPrompt(body + tiling).
    const submitted = composeGenerationPrompt({
      prompt: result.prompt,
      tileHorizontal: true,
      tileVertical: false,
    });
    expect(submitted).toContain(result.prompt);
    expect(submitted.toLowerCase()).toMatch(/seamless horizontal tiling/);
    expect(submitted).not.toContain('ORIGINAL BEDROOM CONCEPT PROMPT');
  });
});
