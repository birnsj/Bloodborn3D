import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  buildCreationCategories,
  findCreationTool,
  CREATE_DRAG_MIME,
  parseCreateDragPayload,
} from '../editor/creation/creationTools.js';
import {
  clampCreationToolbarPrefs,
  loadCreationToolbarPrefs,
  saveCreationToolbarPrefs,
  snapToolbarEdge,
  DEFAULT_CREATION_TOOLBAR_PREFS,
  CREATION_TOOLBAR_STORAGE_KEY,
} from '../editor/creation/creationToolbarPrefs.js';

describe('creation toolbar catalog', () => {
  it('exposes geometry, lights, actors, and dynamic assets', () => {
    const cats = buildCreationCategories([
      { id: 'mesh.crate', name: 'Crate', kind: 'mesh' },
      { id: 'prefab.door', name: 'Door', kind: 'prefab' },
      { id: 'mat.stone', name: 'Stone', kind: 'material' },
    ]);
    expect(cats.map((c) => c.id)).toEqual(['geometry', 'lights', 'actors', 'assets']);
    const geo = cats.find((c) => c.id === 'geometry');
    expect(geo.tools.map((t) => t.id)).toContain('box');
    expect(geo.tools.map((t) => t.id)).toContain('subtract');
    const assets = cats.find((c) => c.id === 'assets');
    expect(assets.tools).toHaveLength(2);
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

  it('loads defaults and persists edge/category/pin', () => {
    expect(loadCreationToolbarPrefs()).toMatchObject(DEFAULT_CREATION_TOOLBAR_PREFS);
    saveCreationToolbarPrefs({
      edge: 'right',
      categoryId: 'lights',
      expanded: true,
      pinned: true,
      top: 80,
    });
    expect(mem.has(CREATION_TOOLBAR_STORAGE_KEY)).toBe(true);
    const loaded = loadCreationToolbarPrefs();
    expect(loaded.edge).toBe('right');
    expect(loaded.categoryId).toBe('lights');
    expect(loaded.pinned).toBe(true);
    expect(loaded.expanded).toBe(true);
  });

  it('clamps inside viewport and snaps to edges', () => {
    const clamped = clampCreationToolbarPrefs(
      { edge: 'free', left: -40, top: -10 },
      { width: 800, height: 600 },
    );
    expect(clamped.left).toBeGreaterThanOrEqual(8);
    expect(clamped.top).toBeGreaterThanOrEqual(8);
    expect(snapToolbarEdge(10, 800).edge).toBe('left');
    expect(snapToolbarEdge(760, 800).edge).toBe('right');
    expect(snapToolbarEdge(400, 800).edge).toBe('free');
  });
});
