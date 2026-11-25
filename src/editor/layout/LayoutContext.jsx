import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  loadLayoutPrefs,
  saveLayoutPrefs,
  WORKSPACES,
  clampLayout,
} from './layoutPrefs.js';
import { stepViewScale, VIEW_SCALES } from './viewScale.js';
import {
  applyColorTheme,
  COLOR_THEMES,
  normalizeColorTheme,
} from '../../ui/colorThemes.js';
import {
  applyDockSnapshot,
  closePanelByKey,
  DOCK_PANELS,
  getPanelVisibility,
  reopenPanel,
} from './dockLayout.js';
import {
  FACTORY_LAYOUT_ID,
  snapshotFingerprint,
} from './workspaceLayouts/schema.js';
import { getWorkspaceLayoutManager } from './workspaceLayouts/manager.js';
import {
  DEFAULT_VIEWPORT_VIEW,
  normalizeViewportView,
  viewportViewFromPrefs,
} from '../viewport/viewportPrefs.js';

const LayoutContext = createContext(null);

/** Debounce for writing the active named layout (or Autosaved) after rearranges. */
const NAMED_AUTOSAVE_MS = 500;

function readLiveViewportView(fallback) {
  try {
    const live = typeof window !== 'undefined'
      ? window.__bloodboundViewport?.getPrefs?.()
      : null;
    if (live) return viewportViewFromPrefs(live);
  } catch {
    /* ignore */
  }
  return normalizeViewportView(fallback || DEFAULT_VIEWPORT_VIEW);
}

function readWorkingSnapshot(layout) {
  return {
    dockLayout: layout.dockLayout,
    outlinerVisible: layout.outlinerVisible,
    detailsVisible: layout.detailsVisible,
    contentVisible: layout.contentVisible,
    assetViewerVisible: layout.assetViewerVisible,
    tutorialsVisible: Boolean(layout.tutorialsVisible),
    openartVisible: Boolean(layout.openartVisible),
    viewportMaximized: false,
    viewportView: readLiveViewportView(layout.viewportView),
  };
}

export function LayoutProvider({ children }) {
  const manager = useMemo(() => getWorkspaceLayoutManager(), []);
  const [layout, setLayout] = useState(() => {
    const prefs = loadLayoutPrefs();
    const active = manager.getLayout(prefs.activeLayoutId) || manager.getActiveLayout();
    manager.setActiveLayoutId(active.id);
    const next = clampLayout({
      ...prefs,
      activeLayoutId: active.id,
    });
    applyColorTheme(next.colorTheme);
    return next;
  });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [baselineFp, setBaselineFp] = useState(null);
  const saveTimer = useRef(0);
  const namedSaveTimer = useRef(0);
  const dockApiRef = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const applyingRef = useRef(false);
  const baselineFpRef = useRef(baselineFp);
  baselineFpRef.current = baselineFp;

  const flushSessionPrefs = useCallback((override) => {
    const base = override || layoutRef.current;
    try {
      saveLayoutPrefs(clampLayout(base));
    } catch {
      /* ignore */
    }
  }, []);

  // Session working layout (dock + panels + viewport chrome) — always autosaved.
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (applyingRef.current) {
        flushSessionPrefs(layoutRef.current);
        return;
      }
      const api = dockApiRef.current;
      if (!api) {
        flushSessionPrefs(layoutRef.current);
        return;
      }
      let dockLayout = layoutRef.current.dockLayout;
      try {
        dockLayout = api.toJSON();
      } catch {
        /* keep */
      }
      flushSessionPrefs({
        ...layoutRef.current,
        dockLayout,
        ...getPanelVisibility(api),
        viewportMaximized: false,
        viewportView: readLiveViewportView(layoutRef.current.viewportView),
      });
    }, 120);
    return () => window.clearTimeout(saveTimer.current);
  }, [layout, flushSessionPrefs]);

  // Color theme on <html> so portaled dialogs inherit CSS tokens.
  useEffect(() => {
    applyColorTheme(layout.colorTheme);
  }, [layout.colorTheme]);

  const bumpLayouts = useCallback(() => {
    setLayoutRevision((n) => n + 1);
  }, []);

  const markLayoutClean = useCallback((snapshot) => {
    const snap = snapshot || readWorkingSnapshot(layoutRef.current);
    setBaselineFp(snapshotFingerprint(snap));
  }, []);

  const patch = useCallback((partial) => {
    setLayout((prev) => clampLayout({ ...prev, ...partial }));
  }, []);

  const setDockApi = useCallback((api) => {
    dockApiRef.current = api;
  }, []);

  const captureCurrentSnapshot = useCallback(() => {
    const api = dockApiRef.current;
    const viewportView = readLiveViewportView(layoutRef.current.viewportView);
    if (api) {
      let dockLayout = null;
      try {
        dockLayout = api.toJSON();
      } catch {
        dockLayout = layoutRef.current.dockLayout;
      }
      const visibility = getPanelVisibility(api);
      return {
        dockLayout,
        ...visibility,
        viewportMaximized: false,
        viewportView,
      };
    }
    return readWorkingSnapshot(layoutRef.current);
  }, []);

  const syncVisibilityFromDock = useCallback(() => {
    const api = dockApiRef.current;
    if (!api || applyingRef.current) return;
    const visibility = getPanelVisibility(api);
    setLayout((prev) => clampLayout({ ...prev, ...visibility }));
  }, []);

  const persistDockLayout = useCallback(() => {
    const api = dockApiRef.current;
    if (!api || applyingRef.current) return;
    let dockLayout = null;
    try {
      dockLayout = api.toJSON();
    } catch {
      dockLayout = null;
    }
    const visibility = getPanelVisibility(api);
    setLayout((prev) => clampLayout({
      ...prev,
      dockLayout,
      ...visibility,
    }));
  }, []);

  const applySnapshotToSession = useCallback((layoutEntry) => {
    const api = dockApiRef.current;
    const snapshot = layoutEntry.snapshot;
    applyingRef.current = true;
    try {
      if (api) {
        applyDockSnapshot(api, snapshot);
      }
      let dockLayout = snapshot.dockLayout;
      let visibility = {
        outlinerVisible: snapshot.outlinerVisible !== false,
        detailsVisible: snapshot.detailsVisible !== false,
        contentVisible: snapshot.contentVisible !== false,
        assetViewerVisible: snapshot.assetViewerVisible !== false,
        tutorialsVisible: Boolean(snapshot.tutorialsVisible),
        openartVisible: Boolean(snapshot.openartVisible),
        viewportMaximized: false,
      };
      if (api) {
        try {
          dockLayout = api.toJSON();
        } catch {
          /* keep */
        }
        visibility = { ...getPanelVisibility(api), viewportMaximized: false };
      }
      const viewportView = normalizeViewportView(snapshot.viewportView);
      const working = { dockLayout, ...visibility, viewportView };
      setLayout((prev) => clampLayout({
        ...prev,
        activeLayoutId: layoutEntry.id,
        ...working,
      }));
      setBaselineFp(snapshotFingerprint(working));
      window.dispatchEvent(new CustomEvent('bb:apply-viewport-view', { detail: viewportView }));
    } finally {
      window.setTimeout(() => {
        applyingRef.current = false;
      }, 0);
    }
  }, []);

  /** Optional async guard (e.g. Materials unsaved draft). Return false to cancel. */
  const workspaceLeaveGuardRef = useRef(null);
  const setWorkspaceLeaveGuard = useCallback((fn) => {
    workspaceLeaveGuardRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  const setWorkspace = useCallback(async (workspace) => {
    const next = String(workspace || '');
    if (!next || next === layout.workspace) return;
    const guard = workspaceLeaveGuardRef.current;
    if (guard) {
      const ok = await guard(next);
      if (!ok) return;
    }
    patch({ workspace: next });
  }, [patch, layout.workspace]);

  const togglePanel = useCallback((key) => {
    const api = dockApiRef.current;
    const panelKey = key === 'outlinerVisible'
      ? 'outliner'
      : key === 'detailsVisible'
        ? 'details'
        : key === 'contentVisible'
          ? 'content'
          : key === 'assetViewerVisible'
            ? 'assetViewer'
            : key === 'tutorialsVisible'
              ? 'tutorials'
              : key === 'openartVisible'
                ? 'openart'
                : null;
    if (!panelKey || !api) return;

    const panel = api.getPanel(panelKey);
    if (panel) closePanelByKey(api, panelKey);
    else reopenPanel(api, panelKey);
    persistDockLayout();
  }, [persistDockLayout]);

  /** Open a panel if closed; activate if already open. */
  const ensurePanel = useCallback((panelKey) => {
    const api = dockApiRef.current;
    if (!api || !panelKey) return;
    reopenPanel(api, panelKey);
    persistDockLayout();
  }, [persistDockLayout]);

  /**
   * Toggle in-viewport pane maximize (multi-view only).
   * Never uses dockview panel.maximize() — that hides Outliner/Details/Content.
   */
  const toggleMaximizeViewport = useCallback(() => {
    const api = dockApiRef.current;
    if (api) {
      const panel = api.getPanel(DOCK_PANELS.viewport.id);
      if (panel?.api?.isMaximized?.()) {
        panel.api.exitMaximized();
        persistDockLayout();
      }
    }
    window.dispatchEvent(new CustomEvent('bb:toggle-pane-maximize'));
  }, [persistDockLayout]);

  const namedLayouts = useMemo(
    () => manager.listLayouts(),
    [manager, layoutRevision, layout.activeLayoutId],
  );

  const activeNamedLayout = useMemo(() => {
    return manager.getLayout(layout.activeLayoutId) || manager.getActiveLayout();
  }, [manager, layout.activeLayoutId, layoutRevision]);

  const layoutDirty = useMemo(() => {
    if (baselineFp == null) return false;
    return snapshotFingerprint(readWorkingSnapshot(layout)) !== baselineFp;
  }, [layout, baselineFp]);

  /**
   * Autosave named layouts when the working arrangement drifts:
   * - custom active → overwrite that layout
   * - factory Default → upsert / switch to Autosaved
   */
  useEffect(() => {
    if (!layoutDirty || baselineFp == null) return undefined;
    window.clearTimeout(namedSaveTimer.current);
    namedSaveTimer.current = window.setTimeout(() => {
      if (applyingRef.current) return;
      if (baselineFpRef.current == null) return;
      const snapshot = captureCurrentSnapshot();
      if (snapshotFingerprint(snapshot) === baselineFpRef.current) return;

      const active = manager.getLayout(layoutRef.current.activeLayoutId)
        || manager.getActiveLayout();
      const result = (active.protected || active.id === FACTORY_LAYOUT_ID)
        ? manager.upsertAutosave(snapshot)
        : manager.saveActive(snapshot);
      if (!result.ok) return;

      setLayout((prev) => clampLayout({
        ...prev,
        activeLayoutId: result.layout.id,
        ...snapshot,
      }));
      setBaselineFp(snapshotFingerprint(snapshot));
      bumpLayouts();
      flushSessionPrefs({
        ...layoutRef.current,
        activeLayoutId: result.layout.id,
        ...snapshot,
      });
    }, NAMED_AUTOSAVE_MS);
    return () => window.clearTimeout(namedSaveTimer.current);
  }, [
    layoutDirty,
    layout,
    baselineFp,
    manager,
    captureCurrentSnapshot,
    bumpLayouts,
    flushSessionPrefs,
  ]);

  // Flush session prefs on hide/unload so a quick close still keeps the last dock.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(namedSaveTimer.current);
      if (applyingRef.current) {
        flushSessionPrefs(layoutRef.current);
        return;
      }
      const snapshot = captureCurrentSnapshot();
      flushSessionPrefs({ ...layoutRef.current, ...snapshot });
      if (baselineFpRef.current == null) return;
      if (snapshotFingerprint(snapshot) === baselineFpRef.current) return;
      const active = manager.getLayout(layoutRef.current.activeLayoutId)
        || manager.getActiveLayout();
      if (active.protected || active.id === FACTORY_LAYOUT_ID) {
        manager.upsertAutosave(snapshot);
      } else {
        manager.saveActive(snapshot);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [captureCurrentSnapshot, flushSessionPrefs, manager]);

  const saveLayout = useCallback(() => {
    const snapshot = captureCurrentSnapshot();
    const result = manager.saveActive(snapshot);
    if (!result.ok) return result;
    setLayout((prev) => clampLayout({
      ...prev,
      activeLayoutId: result.layout.id,
      ...snapshot,
    }));
    setBaselineFp(snapshotFingerprint(snapshot));
    bumpLayouts();
    return result;
  }, [manager, captureCurrentSnapshot, bumpLayouts]);

  const saveLayoutAs = useCallback((name) => {
    const snapshot = captureCurrentSnapshot();
    const result = manager.saveAs(name, snapshot);
    if (!result.ok) return result;
    setLayout((prev) => clampLayout({
      ...prev,
      activeLayoutId: result.layout.id,
      ...snapshot,
    }));
    setBaselineFp(snapshotFingerprint(snapshot));
    bumpLayouts();
    return result;
  }, [manager, captureCurrentSnapshot, bumpLayouts]);

  const loadNamedLayout = useCallback((id) => {
    const result = manager.loadLayout(id);
    if (!result.ok) return result;
    applySnapshotToSession(result.layout);
    bumpLayouts();
    return result;
  }, [manager, applySnapshotToSession, bumpLayouts]);

  const renameNamedLayout = useCallback((id, name) => {
    const result = manager.renameLayout(id, name);
    if (result.ok) bumpLayouts();
    return result;
  }, [manager, bumpLayouts]);

  const deleteNamedLayout = useCallback((id) => {
    const result = manager.deleteLayout(id);
    if (!result.ok) return result;
    applySnapshotToSession(result.layout);
    bumpLayouts();
    return result;
  }, [manager, applySnapshotToSession, bumpLayouts]);

  const resetLayout = useCallback(() => {
    const result = manager.resetToFactory();
    applySnapshotToSession(result.layout);
    bumpLayouts();
    return result;
  }, [manager, applySnapshotToSession, bumpLayouts]);

  const setUiScale = useCallback((uiScale) => {
    patch({ uiScale });
  }, [patch]);

  const setColorTheme = useCallback((colorTheme) => {
    patch({ colorTheme: normalizeColorTheme(colorTheme) });
  }, [patch]);

  /** Keep named-layout dirty state in sync when viewport chrome mode changes. */
  const setViewportView = useCallback((view) => {
    patch({ viewportView: normalizeViewportView(view) });
  }, [patch]);

  /** Change viewport pane configuration (View menu / named layouts). */
  const setViewportLayoutMode = useCallback((layoutMode) => {
    const viewportView = normalizeViewportView({
      ...readLiveViewportView(layoutRef.current.viewportView),
      layoutMode,
      // Layout buttons always re-center pane splits.
      splitX: 0.5,
      splitY: 0.5,
      splitY2: 0.5,
    });
    patch({ viewportView });
    window.dispatchEvent(new CustomEvent('bb:apply-viewport-view', { detail: viewportView }));
  }, [patch]);

  const stepUiScale = useCallback((direction) => {
    setLayout((prev) => clampLayout({
      ...prev,
      uiScale: stepViewScale(prev.uiScale, direction),
    }));
  }, []);

  const value = useMemo(() => ({
    layout,
    patch,
    setWorkspace,
    setWorkspaceLeaveGuard,
    togglePanel,
    ensurePanel,
    toggleMaximizeViewport,
    resetLayout,
    setUiScale,
    setColorTheme,
    setViewportView,
    setViewportLayoutMode,
    stepUiScale,
    setDockApi,
    dockApiRef,
    persistDockLayout,
    syncVisibilityFromDock,
    markLayoutClean,
    captureCurrentSnapshot,
    viewScales: VIEW_SCALES,
    colorThemes: COLOR_THEMES,
    workspaces: WORKSPACES,
    namedLayouts,
    activeNamedLayout,
    layoutDirty,
    saveLayout,
    saveLayoutAs,
    loadNamedLayout,
    renameNamedLayout,
    deleteNamedLayout,
    factoryLayoutId: FACTORY_LAYOUT_ID,
  }), [
    layout,
    patch,
    setWorkspace,
    setWorkspaceLeaveGuard,
    togglePanel,
    ensurePanel,
    toggleMaximizeViewport,
    resetLayout,
    setUiScale,
    setColorTheme,
    setViewportView,
    setViewportLayoutMode,
    stepUiScale,
    setDockApi,
    persistDockLayout,
    syncVisibilityFromDock,
    markLayoutClean,
    captureCurrentSnapshot,
    namedLayouts,
    activeNamedLayout,
    layoutDirty,
    saveLayout,
    saveLayoutAs,
    loadNamedLayout,
    renameNamedLayout,
    deleteNamedLayout,
  ]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}
