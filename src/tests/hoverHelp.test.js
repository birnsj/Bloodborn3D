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
      'viewport.',
      'settings.',
      'panel.',
      'workspace.',
      'projectArt.',
      'openart.',
    ];
    for (const prefix of requiredPrefixes) {
      expect(ids.some((id) => id.startsWith(prefix))).toBe(true);
    }
    // Grid size vs snap toggle are separate toolbar controls.
    expect(getHelpEntry('toolbar.grid')?.title).toBe('Move Grid');
    expect(getHelpEntry('toolbar.gridSnap')?.title).toBe('Enable Snap');
    expect(getHelpEntry('toolbar.surface')?.title).toBe('Surface Selection');
    expect(getHelpEntry('toolbar.geometryFace')?.title).toBe('Geometry Face');
    expect(getHelpEntry('viewport.camera')?.title).toBe('Camera Mode');
    expect(getHelpEntry('details.prefab.apply')?.title).toBe('Apply Source');
    expect(getHelpEntry('content.asset')?.body?.toLowerCase()).toContain('face');
    expect(getHelpEntry('openart.generatePrompt')?.title).toBe('Compose Prompt');
    expect(getHelpEntry('projectArt.action.sendRegion')?.body?.toLowerCase()).toMatch(/crop/);
    expect(getHelpEntry('missing')).toBeNull();
  });

  it('wires every helpProps id used in the editor UI', async () => {
    const { HELP_CONTENT: content } = await import('../ui/hoverHelp/helpContent.js');
    const required = [
      'toolbar.surface',
      'toolbar.align',
      'toolbar.geometryFace',
      'toolbar.geometryEdge',
      'toolbar.geometryVertex',
      'viewport.camera',
      'viewport.display',
      'viewport.showFog',
      'viewport.showPostProcessing',
      'viewport.layout',
      'viewport.reset',
      'viewport.maximize',
      'viewport.focus',
      'world.scene',
      'world.scene.atmosphere',
      'world.scene.mist',
      'world.scene.noise',
      'world.scene.volumetric',
      'world.scene.environment',
      'world.scene.backgroundType',
      'world.scene.sky',
      'world.scene.groundedSkybox',
      'world.scene.lightProbe',
      'world.renderer.outputColorSpace',
      'world.postProcessing',
      'world.postProcessingPreview',
      'world.postProcessingExposure',
      'assetViewer.thumbSize',
      'details.surface.material',
      'details.convex.convert',
      'panel.tutorials',
      'settings.dialog',
      'settings.camera',
      'workspace.ai',
      'ai.section.library',
      'ai.section.generation',
      'projectArt.region.select',
      'projectArt.action.sendRegion',
      'openart.promptTemplate',
      'openart.tiling',
      'openart.generate',
      'openart.createMaterial',
      'materials.pbrGenerator',
      'materials.pbrParams',
      'materials.pbrTiling',
      'materials.pbrPreview',
      'materials.pbrApply',
    ];
    for (const id of required) {
      expect(content[id], id).toBeTruthy();
    }
  });

  it('does not claim stubbed features as working', () => {
    const blob = JSON.stringify(HELP_CONTENT);
    expect(blob.toLowerCase()).not.toContain('visual scripting');
    // Prefer “Asset Generation” / “AI-assisted” — not the stub phrase “ai generation”.
    expect(blob.toLowerCase()).not.toContain('ai generation');
  });

  it('documents AI Assets and Project Art workflows', () => {
    expect(getHelpEntry('workspace.ai')?.body?.toLowerCase()).toContain('project art');
    expect(getHelpEntry('openart.tiling')?.body?.toLowerCase()).toContain('horizontal');
    expect(getHelpEntry('openart.generate')?.body?.toLowerCase()).toContain('spend');
    expect(getHelpEntry('projectArt.action.sendRegion')?.tips?.toLowerCase()).toContain('compose prompt');
    expect(getHelpEntry('projectArt.action.sendRegion')?.body?.toLowerCase()).toMatch(/crop/);
  });
});

describe('keyboard shortcuts catalog', () => {
  it('documents live Viewport hotkeys including clip Enter/Esc', async () => {
    const {
      KEYBOARD_SHORTCUT_SECTIONS,
      KEYBOARD_SHORTCUTS_TEXT,
    } = await import('../ui/hoverHelp/keyboardShortcuts.js');
    const flat = KEYBOARD_SHORTCUT_SECTIONS.flatMap((s) => s.rows);
    expect(flat.some((r) => r.keys.includes('Enter') && /clip/i.test(r.action))).toBe(true);
    expect(flat.some((r) => r.keys.includes('Tab') && /surface/i.test(r.action))).toBe(true);
    expect(flat.some((r) => r.keys.includes('F'))).toBe(true);
    expect(KEYBOARD_SHORTCUT_SECTIONS.some((s) => s.id === 'projectArt')).toBe(true);
    expect(KEYBOARD_SHORTCUTS_TEXT).toContain('Shift+G');
    expect(KEYBOARD_SHORTCUTS_TEXT).toContain('Commit clip');
    expect(KEYBOARD_SHORTCUTS_TEXT).toContain('Project Art Library');
    expect(KEYBOARD_SHORTCUTS_TEXT).toContain('Save All');
    expect(flat.some((r) => r.keys.includes('Ctrl') && r.keys.includes('Shift') && r.keys.includes('S'))).toBe(true);
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
