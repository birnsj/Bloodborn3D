import { isValidDockLayout, DOCK_PANEL_IDS, DOCK_PANELS } from '../dockLayout.js';
import {
  DEFAULT_VIEWPORT_VIEW,
  normalizeViewportView,
} from '../../viewport/viewportPrefs.js';

export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 1;
export const FACTORY_LAYOUT_ID = 'factory-default';
export const FACTORY_LAYOUT_NAME = 'Default';
/** Working copy written when the active layout is the protected factory default. */
export const AUTOSAVE_LAYOUT_ID = 'autosaved';
export const AUTOSAVE_LAYOUT_NAME = 'Autosaved';

/**
 * Snapshot of dock arrangement + viewport chrome layout — never level/game data.
 * dockLayout null means “build factory dock arrangement”:
 * left Content Browser, right Outliner over Details, bottom Asset Viewer, center Viewport.
 * viewportView controls single/multi pane mode (default: single).
 */
export function createEmptySnapshot() {
  return {
    dockLayout: null,
    outlinerVisible: true,
    detailsVisible: true,
    contentVisible: true,
    assetViewerVisible: true,
    tutorialsVisible: false,
    openartVisible: false,
    viewportMaximized: false,
    viewportView: { ...DEFAULT_VIEWPORT_VIEW },
  };
}

export function createFactoryLayout() {
  const now = Date.now();
  return {
    id: FACTORY_LAYOUT_ID,
    name: FACTORY_LAYOUT_NAME,
    protected: true,
    createdAt: now,
    updatedAt: now,
    snapshot: createEmptySnapshot(),
  };
}

export function createCatalog() {
  const factory = createFactoryLayout();
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    activeLayoutId: FACTORY_LAYOUT_ID,
    layouts: {
      [FACTORY_LAYOUT_ID]: factory,
    },
  };
}

export function normalizeSnapshot(raw) {
  const base = createEmptySnapshot();
  if (!raw || typeof raw !== 'object') return base;
  const dockLayout = sanitizeDockLayout(raw.dockLayout);
  return {
    dockLayout,
    outlinerVisible: raw.outlinerVisible !== false,
    detailsVisible: raw.detailsVisible !== false,
    contentVisible: raw.contentVisible !== false,
    assetViewerVisible: raw.assetViewerVisible !== false,
    tutorialsVisible: Boolean(raw.tutorialsVisible),
    openartVisible: Boolean(raw.openartVisible),
    // Dock maximize is deprecated — layouts never restore it.
    viewportMaximized: false,
    viewportView: normalizeViewportView(raw.viewportView || base.viewportView),
  };
}

/**
 * Drop unknown panel definitions; keep viewport requirement.
 * Returns null when the layout cannot be recovered.
 */
export function sanitizeDockLayout(data) {
  if (data == null) return null;
  if (!data || typeof data !== 'object') return null;
  if (!data.grid || !data.panels || typeof data.panels !== 'object') return null;

  const known = new Set(DOCK_PANEL_IDS);
  const panels = {};
  for (const [id, panel] of Object.entries(data.panels)) {
    if (!panel || typeof panel !== 'object') continue;
    const component = panel.contentComponent || id;
    if (!known.has(id) && !known.has(component)) continue;
    panels[id] = {
      ...panel,
      id: panel.id || id,
      contentComponent: known.has(component) ? component : (DOCK_PANELS[id]?.component || component),
    };
  }

  if (!panels[DOCK_PANELS.viewport.id]) {
    // Try to recover viewport under an alternate key
    const viewportEntry = Object.entries(panels).find(
      ([, p]) => p.contentComponent === 'viewport',
    );
    if (!viewportEntry) return null;
  }

  const next = {
    ...data,
    panels,
    floatingGroups: Array.isArray(data.floatingGroups)
      ? data.floatingGroups.filter((g) => g && typeof g === 'object')
      : undefined,
    popoutGroups: Array.isArray(data.popoutGroups) ? [] : undefined, // popouts not restored this phase
  };

  return isValidDockLayout(next) ? next : null;
}

export function normalizeLayoutEntry(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  if (!id) return null;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim()
    : id;
  const isFactory = id === FACTORY_LAYOUT_ID;
  return {
    id,
    name: isFactory ? FACTORY_LAYOUT_NAME : name,
    protected: isFactory ? true : Boolean(raw.protected),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    snapshot: normalizeSnapshot(raw.snapshot),
  };
}

export function normalizeCatalog(raw) {
  const catalog = createCatalog();
  if (!raw || typeof raw !== 'object') return catalog;

  const version = Number(raw.schemaVersion) || 0;
  if (version > WORKSPACE_LAYOUT_SCHEMA_VERSION) {
    // Future schema — keep factory only rather than crash.
    return catalog;
  }

  const layouts = {};
  if (raw.layouts && typeof raw.layouts === 'object') {
    for (const [id, entry] of Object.entries(raw.layouts)) {
      const normalized = normalizeLayoutEntry(entry, id);
      if (normalized) layouts[normalized.id] = normalized;
    }
  }

  // Factory is always present and protected.
  layouts[FACTORY_LAYOUT_ID] = {
    ...createFactoryLayout(),
    ...(layouts[FACTORY_LAYOUT_ID] || {}),
    id: FACTORY_LAYOUT_ID,
    name: FACTORY_LAYOUT_NAME,
    protected: true,
    snapshot: createEmptySnapshot(),
  };

  let activeLayoutId = typeof raw.activeLayoutId === 'string'
    ? raw.activeLayoutId
    : FACTORY_LAYOUT_ID;
  if (!layouts[activeLayoutId]) {
    activeLayoutId = FACTORY_LAYOUT_ID;
  }

  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    activeLayoutId,
    layouts,
  };
}

/** Stable fingerprint for dirty detection (ignores volatile pixel noise where possible). */
export function snapshotFingerprint(snapshot) {
  const snap = normalizeSnapshot(snapshot);
  const viewportKey = {
    layoutMode: snap.viewportView?.layoutMode,
    splitX: snap.viewportView?.splitX,
    splitY: snap.viewportView?.splitY,
    splitY2: snap.viewportView?.splitY2,
    panes: (snap.viewportView?.panes || []).map((p) => ({
      id: p.id,
      cameraMode: p.cameraMode,
      displayMode: p.displayMode,
    })),
  };
  if (!snap.dockLayout) {
    return JSON.stringify({
      factory: true,
      outlinerVisible: snap.outlinerVisible,
      detailsVisible: snap.detailsVisible,
      contentVisible: snap.contentVisible,
      assetViewerVisible: snap.assetViewerVisible,
      viewportView: viewportKey,
    });
  }
  const dock = snap.dockLayout;
  return JSON.stringify({
    panelIds: Object.keys(dock.panels).sort(),
    activeGroup: dock.activeGroup || null,
    floating: (dock.floatingGroups || []).map((g) => ({
      width: g?.position?.width ?? g?.width ?? null,
      height: g?.position?.height ?? g?.height ?? null,
    })),
    // Include grid shape for arrangement changes
    grid: dock.grid,
    outlinerVisible: snap.outlinerVisible,
    detailsVisible: snap.detailsVisible,
    contentVisible: snap.contentVisible,
    assetViewerVisible: snap.assetViewerVisible,
    viewportView: viewportKey,
  });
}

export function snapshotsEqual(a, b) {
  return snapshotFingerprint(a) === snapshotFingerprint(b);
}

export function slugifyLayoutName(name) {
  const base = String(name || 'layout')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'layout';
  return `layout-${base}-${Date.now().toString(36)}`;
}
