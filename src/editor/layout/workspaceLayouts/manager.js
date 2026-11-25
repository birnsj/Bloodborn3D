import {
  createLocalStorageSyncAdapter,
  WORKSPACE_LAYOUTS_STORAGE_KEY,
} from './storage.js';
import {
  AUTOSAVE_LAYOUT_ID,
  AUTOSAVE_LAYOUT_NAME,
  FACTORY_LAYOUT_ID,
  createFactoryLayout,
  normalizeCatalog,
  normalizeSnapshot,
  slugifyLayoutName,
  snapshotsEqual,
} from './schema.js';

/**
 * Named workspace layout manager.
 * Independent of level JSON / game state.
 */
export function createWorkspaceLayoutManager(adapter = createLocalStorageSyncAdapter(WORKSPACE_LAYOUTS_STORAGE_KEY)) {
  let catalog = normalizeCatalog(adapter.read());

  function persist() {
    adapter.write(catalog);
    return catalog;
  }

  function listLayouts() {
    return Object.values(catalog.layouts).sort((a, b) => {
      if (a.id === FACTORY_LAYOUT_ID) return -1;
      if (b.id === FACTORY_LAYOUT_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function getActiveLayout() {
    return catalog.layouts[catalog.activeLayoutId] || catalog.layouts[FACTORY_LAYOUT_ID];
  }

  function getLayout(id) {
    return catalog.layouts[id] || null;
  }

  function setActiveLayoutId(id) {
    if (!catalog.layouts[id]) return getActiveLayout();
    catalog = { ...catalog, activeLayoutId: id };
    persist();
    return catalog.layouts[id];
  }

  function captureSnapshot(partial) {
    return normalizeSnapshot(partial);
  }

  function isDirty(currentSnapshot) {
    const active = getActiveLayout();
    return !snapshotsEqual(active.snapshot, currentSnapshot);
  }

  /**
   * Overwrite the active custom layout. Factory is protected.
   */
  function saveActive(currentSnapshot) {
    const active = getActiveLayout();
    if (active.protected || active.id === FACTORY_LAYOUT_ID) {
      return { ok: false, error: 'protected', layout: active };
    }
    const next = {
      ...active,
      updatedAt: Date.now(),
      snapshot: captureSnapshot(currentSnapshot),
    };
    catalog = {
      ...catalog,
      layouts: { ...catalog.layouts, [next.id]: next },
    };
    persist();
    return { ok: true, layout: next };
  }

  /**
   * Create or update the dedicated Autosaved layout and make it active.
   * Used when the user rearranges while on the protected factory default.
   */
  function upsertAutosave(currentSnapshot) {
    const existing = catalog.layouts[AUTOSAVE_LAYOUT_ID];
    const now = Date.now();
    const entry = {
      id: AUTOSAVE_LAYOUT_ID,
      name: existing?.name || AUTOSAVE_LAYOUT_NAME,
      protected: false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      snapshot: captureSnapshot(currentSnapshot),
    };
    catalog = {
      ...catalog,
      activeLayoutId: AUTOSAVE_LAYOUT_ID,
      layouts: { ...catalog.layouts, [AUTOSAVE_LAYOUT_ID]: entry },
    };
    persist();
    return { ok: true, layout: entry };
  }

  /**
   * Create a new named layout from the current arrangement and activate it.
   */
  function saveAs(name, currentSnapshot) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'empty-name' };
    }
    if (trimmed.toLowerCase() === createFactoryLayout().name.toLowerCase()) {
      return { ok: false, error: 'reserved-name' };
    }
    const id = slugifyLayoutName(trimmed);
    const now = Date.now();
    const entry = {
      id,
      name: trimmed,
      protected: false,
      createdAt: now,
      updatedAt: now,
      snapshot: captureSnapshot(currentSnapshot),
    };
    catalog = {
      ...catalog,
      activeLayoutId: id,
      layouts: { ...catalog.layouts, [id]: entry },
    };
    persist();
    return { ok: true, layout: entry };
  }

  function loadLayout(id) {
    const entry = catalog.layouts[id];
    if (!entry) return { ok: false, error: 'missing' };
    catalog = { ...catalog, activeLayoutId: id };
    persist();
    return { ok: true, layout: entry };
  }

  function renameLayout(id, name) {
    const entry = catalog.layouts[id];
    if (!entry) return { ok: false, error: 'missing' };
    if (entry.protected || id === FACTORY_LAYOUT_ID) {
      return { ok: false, error: 'protected' };
    }
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, error: 'empty-name' };
    const next = { ...entry, name: trimmed, updatedAt: Date.now() };
    catalog = {
      ...catalog,
      layouts: { ...catalog.layouts, [id]: next },
    };
    persist();
    return { ok: true, layout: next };
  }

  function deleteLayout(id) {
    const entry = catalog.layouts[id];
    if (!entry) return { ok: false, error: 'missing' };
    if (entry.protected || id === FACTORY_LAYOUT_ID) {
      return { ok: false, error: 'protected' };
    }
    const { [id]: _removed, ...rest } = catalog.layouts;
    const activeLayoutId = catalog.activeLayoutId === id
      ? FACTORY_LAYOUT_ID
      : catalog.activeLayoutId;
    catalog = {
      ...catalog,
      activeLayoutId,
      layouts: rest,
    };
    // Ensure factory remains
    if (!catalog.layouts[FACTORY_LAYOUT_ID]) {
      catalog.layouts[FACTORY_LAYOUT_ID] = createFactoryLayout();
    }
    persist();
    return {
      ok: true,
      layout: catalog.layouts[activeLayoutId],
      deletedId: id,
    };
  }

  function resetToFactory() {
    catalog = {
      ...catalog,
      activeLayoutId: FACTORY_LAYOUT_ID,
      layouts: {
        ...catalog.layouts,
        [FACTORY_LAYOUT_ID]: createFactoryLayout(),
      },
    };
    persist();
    return { ok: true, layout: catalog.layouts[FACTORY_LAYOUT_ID] };
  }

  function reloadFromStorage() {
    catalog = normalizeCatalog(adapter.read());
    return catalog;
  }

  function getCatalog() {
    return catalog;
  }

  return {
    listLayouts,
    getActiveLayout,
    getLayout,
    setActiveLayoutId,
    captureSnapshot,
    isDirty,
    saveActive,
    upsertAutosave,
    saveAs,
    loadLayout,
    renameLayout,
    deleteLayout,
    resetToFactory,
    reloadFromStorage,
    getCatalog,
  };
}

/** Singleton for the editor session. */
let defaultManager = null;

export function getWorkspaceLayoutManager() {
  if (!defaultManager) {
    defaultManager = createWorkspaceLayoutManager();
  }
  return defaultManager;
}

/** Test helper — reset singleton between tests. */
export function resetWorkspaceLayoutManagerForTests(adapter) {
  defaultManager = adapter
    ? createWorkspaceLayoutManager(adapter)
    : createWorkspaceLayoutManager();
  return defaultManager;
}
