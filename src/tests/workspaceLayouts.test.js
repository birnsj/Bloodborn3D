import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOSAVE_LAYOUT_ID,
  AUTOSAVE_LAYOUT_NAME,
  FACTORY_LAYOUT_ID,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  createCatalog,
  normalizeCatalog,
  normalizeSnapshot,
  sanitizeDockLayout,
  snapshotFingerprint,
  snapshotsEqual,
} from '../editor/layout/workspaceLayouts/schema.js';
import { createWorkspaceLayoutManager } from '../editor/layout/workspaceLayouts/manager.js';

function memoryAdapter(initial = null) {
  let data = initial;
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  return {
    read: () => clone(data),
    write: (next) => { data = clone(next); return true; },
    clear: () => { data = null; return true; },
    _dump: () => data,
  };
}

function fakeDock(panelIds = ['viewport', 'outliner', 'details', 'content']) {
  return {
    grid: {
      root: { type: 'branch', data: panelIds.map((id) => ({ type: 'leaf', data: { id } })) },
      height: 800,
      width: 1200,
      orientation: 'HORIZONTAL',
    },
    panels: Object.fromEntries(
      panelIds.map((id) => [id, { id, contentComponent: id === 'viewport' ? 'viewport' : id }]),
    ),
  };
}

describe('workspace layout schema', () => {
  it('creates a versioned catalog with a protected factory default', () => {
    const catalog = createCatalog();
    expect(catalog.schemaVersion).toBe(WORKSPACE_LAYOUT_SCHEMA_VERSION);
    expect(catalog.activeLayoutId).toBe(FACTORY_LAYOUT_ID);
    expect(catalog.layouts[FACTORY_LAYOUT_ID].protected).toBe(true);
    expect(catalog.layouts[FACTORY_LAYOUT_ID].name).toBe('Default');
  });

  it('sanitizes unknown panel definitions and rejects broken docks', () => {
    const dock = fakeDock();
    dock.panels.legacy = { id: 'legacy', contentComponent: 'does-not-exist' };
    const cleaned = sanitizeDockLayout(dock);
    expect(cleaned.panels.legacy).toBeUndefined();
    expect(cleaned.panels.viewport).toBeTruthy();
    expect(sanitizeDockLayout({ panels: {} })).toBeNull();
  });

  it('normalizes future schema versions to factory catalog', () => {
    const next = normalizeCatalog({
      schemaVersion: 99,
      activeLayoutId: 'x',
      layouts: { x: { id: 'x', name: 'X', snapshot: {} } },
    });
    expect(next.activeLayoutId).toBe(FACTORY_LAYOUT_ID);
    expect(Object.keys(next.layouts)).toEqual([FACTORY_LAYOUT_ID]);
  });

  it('fingerprints snapshots for dirty detection', () => {
    const a = normalizeSnapshot({ dockLayout: fakeDock(), outlinerVisible: true });
    const b = normalizeSnapshot({ dockLayout: fakeDock(), outlinerVisible: true });
    const c = normalizeSnapshot({ dockLayout: fakeDock(['viewport', 'details']), outlinerVisible: true });
    expect(snapshotsEqual(a, b)).toBe(true);
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(c));
  });

  it('includes viewport layout mode in snapshot fingerprint', () => {
    const single = normalizeSnapshot({
      dockLayout: fakeDock(),
      viewportView: { layoutMode: 'single' },
    });
    const quad = normalizeSnapshot({
      dockLayout: fakeDock(),
      viewportView: { layoutMode: 'quad' },
    });
    expect(single.viewportView.layoutMode).toBe('single');
    expect(quad.viewportView.layoutMode).toBe('quad');
    expect(snapshotFingerprint(single)).not.toBe(snapshotFingerprint(quad));
  });
});

describe('workspace layout manager', () => {
  let manager;
  let adapter;

  beforeEach(() => {
    adapter = memoryAdapter();
    manager = createWorkspaceLayoutManager(adapter);
  });

  it('saves two custom layouts, switches, renames, and deletes without touching factory', () => {
    const snapA = normalizeSnapshot({
      dockLayout: fakeDock(['viewport', 'outliner', 'content']),
      detailsVisible: false,
    });
    const snapB = normalizeSnapshot({
      dockLayout: fakeDock(['viewport', 'details', 'content']),
      outlinerVisible: false,
    });

    const a = manager.saveAs('Combat', snapA);
    expect(a.ok).toBe(true);
    expect(manager.getActiveLayout().name).toBe('Combat');

    const b = manager.saveAs('Cinematics', snapB);
    expect(b.ok).toBe(true);
    expect(manager.listLayouts().map((l) => l.name)).toEqual([
      'Default',
      'Cinematics',
      'Combat',
    ]);

    const loaded = manager.loadLayout(a.layout.id);
    expect(loaded.ok).toBe(true);
    expect(loaded.layout.snapshot.detailsVisible).toBe(false);

    const renamed = manager.renameLayout(a.layout.id, 'Combat Focus');
    expect(renamed.ok).toBe(true);
    expect(manager.getLayout(a.layout.id).name).toBe('Combat Focus');

    const del = manager.deleteLayout(b.layout.id);
    expect(del.ok).toBe(true);
    expect(manager.getLayout(b.layout.id)).toBeNull();
    expect(manager.getLayout(FACTORY_LAYOUT_ID).protected).toBe(true);

    // Persist round-trip
    const again = createWorkspaceLayoutManager(adapter);
    expect(again.getLayout(a.layout.id).name).toBe('Combat Focus');
    expect(again.listLayouts().some((l) => l.id === b.layout.id)).toBe(false);
  });

  it('refuses to overwrite or delete the factory default', () => {
    const snap = normalizeSnapshot({ dockLayout: fakeDock() });
    manager.loadLayout(FACTORY_LAYOUT_ID);
    expect(manager.saveActive(snap).error).toBe('protected');
    expect(manager.deleteLayout(FACTORY_LAYOUT_ID).error).toBe('protected');
    expect(manager.renameLayout(FACTORY_LAYOUT_ID, 'Nope').error).toBe('protected');
  });

  it('save-as rejects reserved Default name', () => {
    const result = manager.saveAs('Default', normalizeSnapshot({ dockLayout: fakeDock() }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('reserved-name');
  });

  it('reports dirty against the active layout snapshot', () => {
    const base = normalizeSnapshot({ dockLayout: fakeDock() });
    const created = manager.saveAs('Wide', base);
    expect(manager.isDirty(base)).toBe(false);
    const dirty = normalizeSnapshot({
      dockLayout: fakeDock(['viewport', 'outliner']),
    });
    expect(manager.isDirty(dirty)).toBe(true);
    expect(manager.saveActive(dirty).ok).toBe(true);
    expect(manager.isDirty(dirty)).toBe(false);
    expect(created.layout.id).toBe(manager.getActiveLayout().id);
  });

  it('resetToFactory activates the protected default', () => {
    manager.saveAs('Temp', normalizeSnapshot({ dockLayout: fakeDock() }));
    const reset = manager.resetToFactory();
    expect(reset.ok).toBe(true);
    expect(manager.getActiveLayout().id).toBe(FACTORY_LAYOUT_ID);
  });

  it('upsertAutosave creates and updates the Autosaved layout from factory', () => {
    manager.loadLayout(FACTORY_LAYOUT_ID);
    const first = normalizeSnapshot({
      dockLayout: fakeDock(['viewport', 'outliner', 'details', 'content']),
      outlinerVisible: true,
    });
    const created = manager.upsertAutosave(first);
    expect(created.ok).toBe(true);
    expect(created.layout.id).toBe(AUTOSAVE_LAYOUT_ID);
    expect(created.layout.name).toBe(AUTOSAVE_LAYOUT_NAME);
    expect(manager.getActiveLayout().id).toBe(AUTOSAVE_LAYOUT_ID);
    expect(manager.getActiveLayout().snapshot.outlinerVisible).toBe(true);

    const second = normalizeSnapshot({
      dockLayout: fakeDock(['viewport', 'details', 'content']),
      outlinerVisible: false,
    });
    const updated = manager.upsertAutosave(second);
    expect(updated.ok).toBe(true);
    expect(updated.layout.id).toBe(AUTOSAVE_LAYOUT_ID);
    expect(manager.getLayout(AUTOSAVE_LAYOUT_ID).snapshot.outlinerVisible).toBe(false);
    expect(manager.listLayouts().filter((l) => l.id === AUTOSAVE_LAYOUT_ID)).toHaveLength(1);
  });
});
