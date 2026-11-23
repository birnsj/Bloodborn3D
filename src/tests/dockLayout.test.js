import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOCK_PANEL_IDS,
  DOCK_PANELS,
  applyDefaultDockLayout,
  dockLayoutFingerprint,
  isValidDockLayout,
  reopenPanel,
  closePanelByKey,
  getPanelVisibility,
} from '../editor/layout/dockLayout.js';
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE,
  clampLayout,
  loadLayoutPrefs,
  saveLayoutPrefs,
} from '../editor/layout/layoutPrefs.js';

function createMockApi(existingIds = []) {
  const panels = new Map();
  for (const id of existingIds) {
    panels.set(id, {
      id,
      api: {
        setActive: vi.fn(),
        close: vi.fn(),
        isMaximized: () => false,
        maximize: vi.fn(),
        exitMaximized: vi.fn(),
      },
    });
  }

  const api = {
    panels,
    clear: vi.fn(() => panels.clear()),
    addPanel: vi.fn((opts) => {
      const panel = {
        id: opts.id,
        api: {
          setActive: vi.fn(),
          close: vi.fn(),
          isMaximized: () => false,
          maximize: vi.fn(),
          exitMaximized: vi.fn(),
        },
      };
      panels.set(opts.id, panel);
      return panel;
    }),
    getPanel: vi.fn((id) => panels.get(id)),
    removePanel: vi.fn((panel) => {
      panels.delete(panel.id);
    }),
    toJSON: vi.fn(() => ({
      grid: {
        root: { type: 'branch', data: [] },
        height: 800,
        width: 1200,
        orientation: 'HORIZONTAL',
      },
      panels: Object.fromEntries(
        [...panels.keys()].map((id) => [id, { id, contentComponent: id === 'viewport' ? 'viewport' : id }]),
      ),
    })),
  };
  return api;
}

describe('dock layout defaults', () => {
  it('registers the Level Editor panels including Asset Viewer', () => {
    expect(DOCK_PANEL_IDS).toEqual([
      'viewport',
      'outliner',
      'details',
      'content',
      'assetViewer',
    ]);
  });

  it('applies default arrangement: content + asset viewer below, outliner/details beside viewport', () => {
    const api = createMockApi();
    applyDefaultDockLayout(api);

    expect(api.clear).toHaveBeenCalled();
    expect(api.addPanel.mock.calls.map((c) => c[0].id)).toEqual([
      'viewport',
      'content',
      'assetViewer',
      'outliner',
      'details',
    ]);
    expect(api.addPanel.mock.calls[1][0].position).toEqual({
      referencePanel: 'viewport',
      direction: 'below',
    });
    expect(api.addPanel.mock.calls[2][0].position).toEqual({
      referencePanel: 'content',
      direction: 'right',
    });
    expect(api.addPanel.mock.calls[3][0].position.direction).toBe('left');
    expect(api.addPanel.mock.calls[4][0].position.direction).toBe('right');
    expect(api.addPanel.mock.calls[0][0].renderer).toBe('always');
  });

  it('validates serialized dock layouts and rejects garbage', () => {
    expect(isValidDockLayout(null)).toBe(false);
    expect(isValidDockLayout({})).toBe(false);
    expect(isValidDockLayout({
      grid: { root: { type: 'leaf' }, height: 1, width: 1, orientation: 'HORIZONTAL' },
      panels: {
        viewport: { id: 'viewport', contentComponent: 'viewport' },
      },
    })).toBe(true);
    expect(isValidDockLayout({
      grid: { root: { type: 'leaf' }, height: 1, width: 1, orientation: 'HORIZONTAL' },
      panels: {
        viewport: { id: 'viewport', contentComponent: 'wrong' },
      },
    })).toBe(false);
  });

  it('fingerprints layout panel ids for restore checks', () => {
    const fp = dockLayoutFingerprint({
      grid: { root: {}, height: 1, width: 1, orientation: 'VERTICAL' },
      panels: {
        viewport: { id: 'viewport', contentComponent: 'viewport' },
        outliner: { id: 'outliner', contentComponent: 'outliner' },
      },
      floatingGroups: [{ data: {} }],
    });
    expect(fp).toEqual({
      panelIds: ['outliner', 'viewport'],
      hasFloating: true,
      orientation: 'VERTICAL',
    });
  });
});

describe('dock panel open/close helpers', () => {
  it('reopens a missing outliner to the left of the viewport', () => {
    const api = createMockApi(['viewport']);
    reopenPanel(api, 'outliner');
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outliner',
        position: { referencePanel: 'viewport', direction: 'left' },
      }),
    );
  });

  it('does not close the viewport via closePanelByKey', () => {
    const api = createMockApi(['viewport', 'outliner']);
    closePanelByKey(api, 'viewport');
    expect(api.removePanel).not.toHaveBeenCalled();
    closePanelByKey(api, 'outliner');
    expect(api.removePanel).toHaveBeenCalled();
  });

  it('reports visibility from live dock api', () => {
    const api = createMockApi(['viewport', 'details']);
    expect(getPanelVisibility(api)).toEqual({
      outlinerVisible: false,
      detailsVisible: true,
      contentVisible: false,
      assetViewerVisible: false,
      viewportMaximized: false,
    });
  });
});

describe('layout prefs v2 persistence', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
  });

  it('round-trips dockLayout through save/load', () => {
    const dockLayout = {
      grid: { root: { type: 'leaf' }, height: 600, width: 900, orientation: 'HORIZONTAL' },
      panels: {
        [DOCK_PANELS.viewport.id]: {
          id: DOCK_PANELS.viewport.id,
          contentComponent: 'viewport',
        },
      },
    };
    saveLayoutPrefs({
      ...DEFAULT_LAYOUT,
      dockLayout,
      uiScale: 125,
    });
    const loaded = loadLayoutPrefs();
    expect(loaded.uiScale).toBe(125);
    expect(loaded.dockLayout.panels.viewport.contentComponent).toBe('viewport');
    expect(localStorage.getItem(LAYOUT_STORAGE.v2)).toBeTruthy();
  });

  it('migrates v1 prefs and clears fixed-size fields into a null dockLayout', () => {
    localStorage.setItem(LAYOUT_STORAGE.v1, JSON.stringify({
      workspace: 'level',
      outlinerWidth: 260,
      detailsWidth: 320,
      contentHeight: 200,
      outlinerVisible: false,
      detailsVisible: true,
      contentVisible: true,
      uiScale: 115,
      contentFolder: 'Meshes',
      contentViewMode: 'list',
    }));
    const loaded = loadLayoutPrefs();
    expect(loaded.uiScale).toBe(115);
    expect(loaded.outlinerVisible).toBe(false);
    expect(loaded.contentFolder).toBe('Meshes');
    expect(loaded.dockLayout).toBeNull();
    expect(loaded.outlinerWidth).toBeUndefined();
    expect(localStorage.getItem(LAYOUT_STORAGE.v2)).toBeTruthy();
  });

  it('reset-shaped clamp restores defaults when dockLayout is invalid type', () => {
    const next = clampLayout({
      ...DEFAULT_LAYOUT,
      dockLayout: 'nope',
      workspace: 'not-a-real-workspace',
    });
    expect(next.dockLayout).toBeNull();
    expect(next.workspace).toBe('level');
  });
});
