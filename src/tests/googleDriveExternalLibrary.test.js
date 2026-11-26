/**
 * Google Drive external library — URL parse, read-only menus, client search.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGoogleDriveUrl, driveOpenInBrowserUrl } from '../dev/googleDrive/googleDriveUrl.js';
import {
  __testResetProjectArt,
  __testSetProjectArt,
  getVisibleEntries,
  searchExternal,
  getProjectArtState,
} from '../editor/projectArt/projectArtStore.js';
import { addItemsAsGenerationReferences } from '../editor/projectArt/generationHandoff.js';
import {
  __testResetAiAssetsUi,
  getAiAssetsUiState,
} from '../editor/aiAssets/aiAssetsUiStore.js';

const panelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/projectArt/ProjectArtLibraryPanel.jsx'),
  'utf8',
);
const helpSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../ui/hoverHelp/helpContent.js'),
  'utf8',
);
const lessonSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../tutorials/lessons/17-project-art-library.js'),
  'utf8',
);

const ACCEPTANCE_URL =
  'https://drive.google.com/drive/folders/1YzUPmmxe8oFpy7IfiDBUtGqAbst0qE4p?usp=drive_link';

describe('Google Drive URL parsing', () => {
  it('extracts folder id from the acceptance share URL', () => {
    const parsed = parseGoogleDriveUrl(ACCEPTANCE_URL);
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe('folder');
    expect(parsed.id).toBe('1YzUPmmxe8oFpy7IfiDBUtGqAbst0qE4p');
    expect(parsed.resourceKey).toBeNull();
  });

  it('extracts resourceKey when present', () => {
    const parsed = parseGoogleDriveUrl(
      'https://drive.google.com/drive/folders/abc123?resourcekey=0-xyz',
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.id).toBe('abc123');
    expect(parsed.resourceKey).toBe('0-xyz');
  });

  it('accepts a bare folder id', () => {
    const parsed = parseGoogleDriveUrl('1YzUPmmxe8oFpy7IfiDBUtGqAbst0qE4p');
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe('folder');
    expect(parsed.id).toBe('1YzUPmmxe8oFpy7IfiDBUtGqAbst0qE4p');
  });

  it('builds an open-in-browser URL', () => {
    expect(driveOpenInBrowserUrl('abc', 'rk')).toContain('folders/abc');
    expect(driveOpenInBrowserUrl('abc', 'rk')).toContain('resourcekey=rk');
  });
});

describe('Google Drive external library UI contracts', () => {
  it('exposes External Libraries chrome and read-only copy action', () => {
    expect(panelSource).toContain('External Libraries');
    expect(panelSource).toContain('Add Google Drive Folder');
    expect(panelSource).toContain('Connect Google Account');
    expect(panelSource).toContain('Copy to Project Art Library');
    expect(panelSource).toContain('Open in Google Drive');
    expect(panelSource).toContain('Refresh Folder');
    expect(panelSource).toContain('Remove Library');
    expect(panelSource).toContain("source === 'gdrive'");
    expect(panelSource).toContain('loadMoreExternalFolder');
  });

  it('documents External Libraries in hover help and Academy', () => {
    expect(helpSource).toContain('projectArt.nav.externalLibraries');
    expect(lessonSource).toContain('External Google Drive libraries');
    expect(lessonSource).toContain('Materialize');
  });
});

describe('Google Drive browse store', () => {
  beforeEach(() => {
    __testResetProjectArt();
    __testResetAiAssetsUi();
  });

  it('filters current Drive folder entries client-side without server search', () => {
    __testSetProjectArt({
      librarySource: 'gdrive',
      activeExternalLibraryId: 'ext_test',
      folderEntries: [
        {
          type: 'dir',
          name: 'Props',
          path: 'Props',
          source: 'gdrive',
        },
        {
          type: 'file',
          name: 'Chair.png',
          path: 'Chair.png',
          source: 'gdrive',
          item: {
            id: 'gdrive:ext_test:f1',
            title: 'Chair.png',
            source: 'gdrive',
            driveFileId: 'f1',
            readOnly: true,
          },
        },
        {
          type: 'file',
          name: 'Lamp.png',
          path: 'Lamp.png',
          source: 'gdrive',
          item: {
            id: 'gdrive:ext_test:f2',
            title: 'Lamp.png',
            source: 'gdrive',
            driveFileId: 'f2',
            readOnly: true,
          },
        },
      ],
      externalItemsById: {
        'gdrive:ext_test:f1': {
          id: 'gdrive:ext_test:f1',
          title: 'Chair.png',
          source: 'gdrive',
          driveFileId: 'f1',
          readOnly: true,
        },
        'gdrive:ext_test:f2': {
          id: 'gdrive:ext_test:f2',
          title: 'Lamp.png',
          source: 'gdrive',
          driveFileId: 'f2',
          readOnly: true,
        },
      },
    });

    searchExternal('chair');
    expect(getProjectArtState().searchQuery).toBe('chair');
    expect(getVisibleEntries().map((e) => e.item?.title)).toEqual(['Chair.png']);

    searchExternal('');
    expect(getProjectArtState().searchResults).toBeNull();
    expect(getVisibleEntries().filter((e) => e.type === 'file')).toHaveLength(2);
  });

  it('pins Drive items into the generation tray with provenance fields', () => {
    addItemsAsGenerationReferences([
      {
        id: 'gdrive:ext:abc',
        source: 'gdrive',
        driveFileId: 'abc',
        driveLibraryId: 'ext',
        title: 'Concept.png',
        provenance: { source: 'google-drive', driveFileId: 'abc' },
      },
    ]);
    const refs = getAiAssetsUiState().generationReferences;
    expect(refs).toHaveLength(1);
    expect(refs[0].source).toBe('gdrive');
    expect(refs[0].driveFileId).toBe('abc');
    expect(refs[0].relativePath).toBe('');
  });
});
