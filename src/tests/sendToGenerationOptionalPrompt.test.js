/**
 * Send to Generation — prompt optional; provider validates at estimate/generate.
 * Dry-run: no credit spend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const applySeedMock = vi.fn(async (payload) => payload);
const connectMock = vi.fn(async () => ({}));
const setReferenceMock = vi.fn();
const stageRefsMock = vi.fn(async ({ itemIds }) => ({
  staged: [{
    stagingId: 'ref_local01',
    fileName: 'ref_local01.png',
    originalName: 'concept.png',
    absolutePath: 'D:/BloodBound3D/.openart-staging/ref_local01.png',
    itemId: itemIds?.[0],
  }],
}));
const materializeMock = vi.fn(async (item) => ({
  ok: true,
  item: {
    ...item,
    relativePath: `.bb-art/gdrive-cache/${item.driveFileId}/drive.png`,
    absolutePath: `D:/BloodBound3D/project-art/.bb-art/gdrive-cache/${item.driveFileId}/drive.png`,
    provenance: { ...(item.provenance || {}), materializedAt: '2026-01-01T00:00:00.000Z' },
  },
  materialize: { projectArtRelativePath: `.bb-art/gdrive-cache/${item.driveFileId}/drive.png` },
}));

vi.mock('../io/openArtClient.js', () => ({
  uploadOpenArtReference: vi.fn(async (file) => ({
    ok: true,
    stagingId: 'ref_drive01',
    fileName: 'ref_drive01.png',
    originalName: file?.name || 'drive.png',
    absolutePath: 'D:/BloodBound3D/.openart-staging/ref_drive01.png',
  })),
}));

vi.mock('../io/projectArtClient.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    projectArtImageUrl: (rel) => (
      rel ? `/api/project-art?action=image&path=${encodeURIComponent(rel)}` : null
    ),
  };
});

vi.mock('../editor/openart/openArtUiStore.js', () => ({
  getOpenArtUiState: () => ({
    prompt: '',
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
    projectArtStageReferences: (...args) => stageRefsMock(...args),
    projectArtFullImageUrl: (item) => (
      item?.relativePath
        ? `/api/project-art?action=image&path=${encodeURIComponent(item.relativePath)}`
        : null
    ),
    materializeSelectedGoogleDriveItem: (...args) => materializeMock(...args),
  };
});

// fetch used when staging Drive materialize → File for upload
globalThis.fetch = vi.fn(async () => ({
  blob: async () => new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
}));

import { __testResetAiAssetsUi, getAiAssetsUiState } from '../editor/aiAssets/aiAssetsUiStore.js';
import { sendProjectArtToGeneration } from '../editor/projectArt/generationHandoff.js';

const panelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/projectArt/ProjectArtLibraryPanel.jsx'),
  'utf8',
);
const handoffSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/projectArt/generationHandoff.js'),
  'utf8',
);

describe('Send to Generation — optional prompt', () => {
  beforeEach(() => {
    __testResetAiAssetsUi();
    applySeedMock.mockClear();
    connectMock.mockClear();
    setReferenceMock.mockClear();
    stageRefsMock.mockClear();
    materializeMock.mockClear();
  });

  it('library UI enables Send to Generation from selection, not from a saved prompt', () => {
    expect(panelSource).toMatch(/disabled=\{busy \|\| !refTargets\.length\}/);
    expect(panelSource).not.toMatch(/disabled=\{busy \|\| !promptForSend\}/);
    expect(handoffSource).not.toMatch(/Create or enter a prompt before sending/);
  });

  it('sends a local image with an empty prompt and stages the reference', async () => {
    const item = {
      id: 'art_local',
      relativePath: 'Environments/Shared Assets/concept.png',
      title: 'concept.png',
    };
    const result = await sendProjectArtToGeneration({
      promptText: '',
      items: [item],
      folderPath: 'Environments/Shared Assets',
    });
    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('');
    expect(result.stagedRefs).toBe(true);
    expect(result.message).toMatch(/template|prompt/i);
    expect(stageRefsMock).toHaveBeenCalled();
    const ui = getAiAssetsUiState();
    expect(ui.generationReferences.map((r) => r.id)).toEqual(['art_local']);
    expect(ui.generationOrigin?.finalPrompt).toBe('');
    expect(applySeedMock).toHaveBeenCalled();
  });

  it('transfers a saved prompt when present', async () => {
    const item = {
      id: 'art_prompted',
      relativePath: 'Environments/a.png',
      title: 'a.png',
      generationPrompt: 'limestone wall panel close-up',
    };
    const result = await sendProjectArtToGeneration({
      promptText: item.generationPrompt,
      items: [item],
      folderPath: 'Environments',
    });
    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('limestone wall panel close-up');
    expect(getAiAssetsUiState().generationOrigin?.finalPrompt).toBe('limestone wall panel close-up');
  });

  it('sends a Google Drive image with empty prompt, materializing before staging', async () => {
    const item = {
      id: 'gdrive:ext:file1',
      source: 'gdrive',
      driveFileId: 'file1',
      driveLibraryId: 'ext',
      title: 'drive-concept.png',
      readOnly: true,
      provenance: { source: 'google-drive', driveFileId: 'file1' },
    };
    const result = await sendProjectArtToGeneration({
      promptText: '',
      items: [item],
      folderPath: '',
    });
    expect(result.ok).toBe(true);
    expect(result.prompt).toBe('');
    expect(materializeMock).toHaveBeenCalled();
    expect(result.stagedRefs).toBe(true);
    const refs = getAiAssetsUiState().generationReferences;
    expect(refs[0].source).toBe('gdrive');
    expect(refs[0].driveFileId).toBe('file1');
  });
});
