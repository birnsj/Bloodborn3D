import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  buildCreationCategories,
  findCreationTool,
  CREATE_DRAG_MIME,
  parseCreateDragPayload,
} from '../editor/creation/creationTools.js';
import {
  applyCreationToolbarDockInsets,
  clampCreationToolbarPrefs,
  creationToolbarButtonSize,
  creationToolbarDockInsets,
  creationToolbarIconSize,
  creationToolbarStripThickness,
  isHorizontalDock,
  loadCreationToolbarPrefs,
  normalizeCreationToolbarScale,
  patchCreationToolbarPrefs,
  saveCreationToolbarPrefs,
  snapToolbarDock,
  DEFAULT_CREATION_TOOLBAR_PREFS,
  CREATION_TOOLBAR_STORAGE_KEY,
} from '../editor/creation/creationToolbarPrefs.js';
import {
  buildRecentCreationAssetTools,
  loadRecentCreationAssets,
  rememberRecentCreationAsset,
  RECENT_CREATION_ASSETS_MAX,
  RECENT_CREATION_ASSETS_STORAGE_KEY,
} from '../editor/creation/recentCreationAssets.js';

describe('creation toolbar catalog', () => {
  it('exposes geometry, lights, actors, and recent assets only', () => {
    const registry = [
      { id: 'mesh.crate', name: 'Crate', kind: 'mesh' },
      { id: 'prefab.door', name: 'Door', kind: 'prefab' },
      { id: 'mat.stone', name: 'Stone', kind: 'material' },
    ];
    const empty = buildCreationCategories(registry, { recent: [] });
    expect(empty.map((c) => c.id)).toEqual(['geometry', 'environment', 'lights', 'actors', 'assets']);
    expect(empty.find((c) => c.id === 'assets').tools).toHaveLength(0);
    const geo = empty.find((c) => c.id === 'geometry');
    expect(geo.tools.map((t) => t.id)).toContain('box');
    expect(geo.tools.map((t) => t.id)).toContain('subtract');
    const recent = buildCreationCategories(registry, {
      recent: [
        { id: 'prefab.door', kind: 'prefab', name: 'Door' },
        { id: 'mesh.crate', kind: 'mesh', name: 'Crate' },
      ],
    });
    const assets = recent.find((c) => c.id === 'assets');
    expect(assets.tools.map((t) => t.assetId)).toEqual(['prefab.door', 'mesh.crate']);
    expect(assets.tools.every((t) => t.action === 'asset')).toBe(true);
  });

  it('finds tools and parses drag payloads', () => {
    const cats = buildCreationCategories([]);
    const found = findCreationTool(cats, 'pointLight');
    expect(found.tool.lightType).toBe('point');
    expect(CREATE_DRAG_MIME).toContain('bloodbound-create');
    expect(parseCreateDragPayload(JSON.stringify({ toolId: 'box', tool: 'box' })).tool).toBe('box');
    expect(parseCreateDragPayload('nope')).toBeNull();
  });

  it('exposes Batch 3 light types on the Lights flyout', () => {
    const cats = buildCreationCategories([]);
    const lights = cats.find((c) => c.id === 'lights');
    const ids = lights.tools.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([
      'pointLight',
      'spotLight',
      'dirLight',
      'hemiLight',
      'rectAreaLight',
      'ambientLight',
    ]));
    expect(findCreationTool(cats, 'hemiLight').tool.lightType).toBe('hemisphere');
    expect(findCreationTool(cats, 'rectAreaLight').tool.lightType).toBe('rectArea');
  });

  it('exposes Batch 4 environment tools', () => {
    const cats = buildCreationCategories([]);
    const env = cats.find((c) => c.id === 'environment');
    expect(env).toBeTruthy();
    const ids = env.tools.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([
      'water2', 'water', 'reflector', 'refractor', 'decal', 'sprite', 'skyPlaceable',
    ]));
    expect(findCreationTool(cats, 'water2').tool.envType).toBe('water2');
    expect(findCreationTool(cats, 'reflector').tool.placeKind).toBe('environment');
  });

  it('gives lights and environment tools distinct icon keys', () => {
    const cats = buildCreationCategories([]);
    const lightIcons = cats.find((c) => c.id === 'lights').tools.map((t) => t.icon);
    expect(new Set(lightIcons).size).toBe(lightIcons.length);
    expect(findCreationTool(cats, 'refractor').tool.icon).toBe('refractor');
    expect(findCreationTool(cats, 'hemiLight').tool.icon).toBe('hemiLight');
    expect(findCreationTool(cats, 'ambientLight').tool.icon).toBe('ambientLight');
  });

  it('gives Batch 5 procedural props icons that match their primitive', () => {
    const cats = buildCreationCategories([]);
    const geo = cats.find((c) => c.id === 'geometry');
    const prims = geo.tools.filter((t) => t.placeKind === 'primitive');
    expect(prims.length).toBeGreaterThan(10);
    for (const tool of prims) {
      expect(tool.icon).toBe(tool.primitive);
    }
    expect(findCreationTool(cats, 'primSphere').tool.icon).toBe('sphere');
    expect(findCreationTool(cats, 'primTorusKnot').tool.icon).toBe('torusKnot');
    expect(findCreationTool(cats, 'primText').tool.icon).toBe('text');
  });
});

describe('creation toolbar prefs', () => {
  const mem = new Map();
  beforeEach(() => {
    mem.clear();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
    };
  });
  afterEach(() => {
    mem.clear();
    delete globalThis.localStorage;
  });

  it('loads defaults and persists dock/category/pin', () => {
    expect(DEFAULT_CREATION_TOOLBAR_PREFS.dock).toBe('left');
    expect(loadCreationToolbarPrefs()).toMatchObject({
      dock: 'left',
      scale: DEFAULT_CREATION_TOOLBAR_PREFS.scale,
    });
    saveCreationToolbarPrefs({
      dock: 'top',
      categoryId: 'lights',
      expanded: true,
      pinned: true,
      offset: 80,
    });
    expect(mem.has(CREATION_TOOLBAR_STORAGE_KEY)).toBe(true);
    const loaded = loadCreationToolbarPrefs();
    expect(loaded.dock).toBe('top');
    expect(loaded.categoryId).toBe('lights');
    expect(loaded.pinned).toBe(true);
    expect(loaded.expanded).toBe(true);
    expect(isHorizontalDock(loaded.dock)).toBe(true);
  });

  it('migrates legacy v1 prefs and re-locks dock to left', () => {
    mem.set('bloodbound.editor.creationToolbar.v1', JSON.stringify({
      dock: 'float',
      left: 200,
      top: 90,
      scale: 1.25,
      categoryId: 'lights',
    }));
    const migrated = loadCreationToolbarPrefs();
    expect(migrated.dock).toBe('left');
    expect(migrated.scale).toBe(1.25);
    expect(migrated.categoryId).toBe('lights');
    expect(mem.has(CREATION_TOOLBAR_STORAGE_KEY)).toBe(true);
    expect(mem.has('bloodbound.editor.creationToolbar.v1')).toBe(false);
  });

  it('migrates legacy edge prefs and snaps to edges or float', () => {
    const migrated = clampCreationToolbarPrefs(
      { edge: 'right', top: 90, left: 12 },
      { width: 800, height: 600 },
    );
    expect(migrated.dock).toBe('right');
    expect(snapToolbarDock(10, 200, 800, 600).dock).toBe('left');
    expect(snapToolbarDock(780, 200, 800, 600).dock).toBe('right');
    expect(snapToolbarDock(400, 10, 800, 600).dock).toBe('top');
    expect(snapToolbarDock(400, 580, 800, 600).dock).toBe('bottom');
    expect(snapToolbarDock(400, 300, 800, 600).dock).toBe('float');
    const free = clampCreationToolbarPrefs({ edge: 'free', left: 100, top: 120 }, { width: 800, height: 600 });
    expect(free.dock).toBe('float');
  });

  it('clamps toolbox scale and patches dock from settings', () => {
    expect(normalizeCreationToolbarScale(0.1)).toBe(0.75);
    expect(normalizeCreationToolbarScale(3)).toBe(1.75);
    expect(normalizeCreationToolbarScale(1.22)).toBe(1.2);
    const patched = patchCreationToolbarPrefs({ dock: 'bottom', scale: 1.25 });
    expect(patched.dock).toBe('bottom');
    expect(patched.scale).toBe(1.25);
    expect(loadCreationToolbarPrefs().dock).toBe('bottom');
    const topDock = patchCreationToolbarPrefs({ dock: 'top' });
    expect(topDock.dock).toBe('top');
    expect(isHorizontalDock(topDock.dock)).toBe(true);
    const floated = patchCreationToolbarPrefs({ dock: 'float', left: 120, top: 80 });
    expect(floated.dock).toBe('float');
    expect(floated.left).toBe(120);
    expect(floated.top).toBe(80);
  });

  it('insets viewport display chrome only when flush-docked', () => {
    expect(creationToolbarDockInsets({ dock: 'float', scale: 1 })).toEqual({
      top: 0, right: 0, bottom: 0, left: 0,
    });
    expect(creationToolbarDockInsets({ dock: 'left', scale: 1 }).left).toBe(40);
    expect(creationToolbarDockInsets({ dock: 'top', scale: 1.25 }).top).toBe(48);
    expect(creationToolbarDockInsets({ dock: 'right', scale: 1 }).right).toBe(40);
    expect(creationToolbarDockInsets({ dock: 'bottom', scale: 1 }).bottom).toBe(40);
    const el = { style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty() {} } };
    applyCreationToolbarDockInsets(el, { dock: 'top', scale: 1 });
    expect(el.style.props['--bb-creation-inset-top']).toBe('40px');
    expect(el.style.props['--bb-creation-inset-left']).toBe('0px');
  });

  it('scales button and icon sizes with toolbox scale', () => {
    expect(creationToolbarButtonSize({ scale: 1 })).toBe(32);
    expect(creationToolbarIconSize({ scale: 1 })).toBe(14);
    expect(creationToolbarStripThickness({ scale: 1 })).toBe(40);
    expect(creationToolbarButtonSize({ scale: 1.25 })).toBe(40);
    expect(creationToolbarIconSize({ scale: 1.25 })).toBe(18);
    expect(creationToolbarStripThickness({ scale: 1.25 })).toBe(48);
    expect(creationToolbarButtonSize({ scale: 0.75 })).toBe(24);
  });
});

describe('recent creation assets', () => {
  const mem = new Map();
  beforeEach(() => {
    mem.clear();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
    };
  });
  afterEach(() => {
    mem.clear();
    delete globalThis.localStorage;
  });

  it('keeps the last 8 placed mesh/prefab assets most-recent first', () => {
    expect(loadRecentCreationAssets()).toEqual([]);
    rememberRecentCreationAsset({ id: 'mesh.a', kind: 'mesh', name: 'A' });
    rememberRecentCreationAsset({ id: 'mesh.b', kind: 'mesh', name: 'B' });
    rememberRecentCreationAsset({ id: 'mesh.a', kind: 'mesh', name: 'A' });
    let recent = loadRecentCreationAssets();
    expect(recent.map((e) => e.id)).toEqual(['mesh.a', 'mesh.b']);
    expect(mem.has(RECENT_CREATION_ASSETS_STORAGE_KEY)).toBe(true);
    for (let i = 0; i < 10; i += 1) {
      rememberRecentCreationAsset({ id: `mesh.${i}`, kind: 'mesh', name: String(i) });
    }
    recent = loadRecentCreationAssets();
    expect(recent).toHaveLength(RECENT_CREATION_ASSETS_MAX);
    expect(recent[0].id).toBe('mesh.9');
    expect(recent[7].id).toBe('mesh.2');
  });

  it('builds tools only for recent ids that still exist in the registry', () => {
    const tools = buildRecentCreationAssetTools(
      [
        { id: 'mesh.crate', name: 'Crate', kind: 'mesh' },
        { id: 'prefab.door', name: 'Door', kind: 'prefab' },
      ],
      [
        { id: 'mesh.gone', kind: 'mesh' },
        { id: 'mesh.crate', kind: 'mesh' },
        { id: 'prefab.door', kind: 'prefab' },
      ],
    );
    expect(tools.map((t) => t.assetId)).toEqual(['mesh.crate', 'prefab.door']);
    expect(tools[0].asset).toMatchObject({ id: 'mesh.crate' });
  });
});
