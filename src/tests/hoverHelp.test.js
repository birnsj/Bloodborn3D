import { describe, expect, it, beforeEach } from 'vitest';
import {
  clampHoverHelpPrefs,
  loadHoverHelpPrefs,
  saveHoverHelpPrefs,
  HOVER_HELP_STORAGE_KEY,
  DEFAULT_HOVER_HELP_PREFS,
} from '../ui/hoverHelp/hoverHelpPrefs.js';
import { getHelpEntry, listHelpIds, HELP_CONTENT } from '../ui/hoverHelp/helpContent.js';
import { positionHoverHelp } from '../ui/hoverHelp/position.js';
import { helpProps } from '../ui/hoverHelp/helpProps.js';

function installMemoryStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

describe('hover help prefs', () => {
  beforeEach(() => {
    installMemoryStorage();
    localStorage.removeItem(HOVER_HELP_STORAGE_KEY);
  });

  it('defaults to enabled with 500ms delay', () => {
    expect(loadHoverHelpPrefs()).toEqual(DEFAULT_HOVER_HELP_PREFS);
  });

  it('persists showHoverHelp preference', () => {
    saveHoverHelpPrefs({ showHoverHelp: false, delayMs: 500 });
    expect(loadHoverHelpPrefs().showHoverHelp).toBe(false);
    saveHoverHelpPrefs({ showHoverHelp: true });
    expect(loadHoverHelpPrefs().showHoverHelp).toBe(true);
  });

  it('clamps delay to a safe range', () => {
    expect(clampHoverHelpPrefs({ delayMs: 10 }).delayMs).toBe(100);
    expect(clampHoverHelpPrefs({ delayMs: 9000 }).delayMs).toBe(2000);
  });
});

describe('hover help content', () => {
  it('covers required starter areas', () => {
    const ids = listHelpIds();
    const requiredPrefixes = [
      'toolbar.',
      'details.',
      'outliner.',
      'content.',
      'assetViewer.',
    ];
    for (const prefix of requiredPrefixes) {
      expect(ids.some((id) => id.startsWith(prefix))).toBe(true);
    }
    expect(getHelpEntry('toolbar.grid')?.title).toBe('Grid Snap');
    expect(getHelpEntry('details.prefab.apply')?.title).toBe('Apply Source');
    expect(getHelpEntry('missing')).toBeNull();
  });

  it('does not claim stubbed features as working', () => {
    const blob = JSON.stringify(HELP_CONTENT);
    expect(blob.toLowerCase()).not.toContain('visual scripting');
    expect(blob.toLowerCase()).not.toContain('ai generation');
  });
});

describe('hover help positioning', () => {
  it('places below when there is room', () => {
    const pos = positionHoverHelp({
      anchor: { left: 100, top: 40, right: 160, bottom: 70, width: 60, height: 30 },
      panelWidth: 300,
      panelHeight: 120,
      layerWidth: 800,
      layerHeight: 600,
    });
    expect(pos.top).toBeGreaterThanOrEqual(70);
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + pos.width).toBeLessThanOrEqual(800 - 8);
  });

  it('flips above near the bottom edge', () => {
    const pos = positionHoverHelp({
      anchor: { left: 100, top: 520, right: 160, bottom: 550, width: 60, height: 30 },
      panelWidth: 300,
      panelHeight: 140,
      layerWidth: 800,
      layerHeight: 600,
    });
    expect(pos.top + 140).toBeLessThanOrEqual(520 + 8);
  });

  it('clamps horizontally at the right edge', () => {
    const pos = positionHoverHelp({
      anchor: { left: 750, top: 40, right: 790, bottom: 70, width: 40, height: 30 },
      panelWidth: 300,
      panelHeight: 120,
      layerWidth: 800,
      layerHeight: 600,
    });
    expect(pos.left + pos.width).toBeLessThanOrEqual(792);
  });
});

describe('helpProps', () => {
  it('emits data attributes for help wiring', () => {
    expect(helpProps('toolbar.select')).toEqual({
      'data-bb-help': 'toolbar.select',
      'data-bb-tutorial': 'toolbar.select',
    });
    expect(helpProps('toolbar.undo', 'Nothing to undo.', 'extra')).toEqual({
      'data-bb-help': 'toolbar.undo',
      'data-bb-tutorial': 'toolbar.undo',
      'data-bb-help-disabled': 'Nothing to undo.',
      'data-bb-help-meta': 'extra',
    });
  });
});
