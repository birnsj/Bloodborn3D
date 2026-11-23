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
  DEFAULT_LAYOUT,
  loadLayoutPrefs,
  saveLayoutPrefs,
  WORKSPACES,
  clampLayout,
} from './layoutPrefs.js';
import { stepViewScale, VIEW_SCALES } from './viewScale.js';
import {
  applyDockSnapshot,
  closePanelByKey,
  getPanelVisibility,
  reopenPanel,
  setViewportMaximized,
} from './dockLayout.js';
import { FACTORY_LAYOUT_ID, snapshotFingerprint } from './workspaceLayouts/schema.js';
import { getWorkspaceLayoutManager } from './workspaceLayouts/manager.js';

const LayoutContext = createContext(null);

function readWorkingSnapshot(layout) {
  return {
    dockLayout: layout.dockLayout,
    outlinerVisible: layout.outlinerVisible,
    detailsVisible: layout.detailsVisible,
    contentVisible: layout.contentVisible,
    assetViewerVisible: layout.assetViewerVisible,
    viewportMaximized: layout.viewportMaximized,
  };
}

export function LayoutProvider({ children }) {
  const manager = useMemo(() => getWorkspaceLayoutManager(), []);
  const [layout, setLayout] = useState(() => {
    const prefs = loadLayoutPrefs();
    const active = manager.getLayout(prefs.activeLayoutId) || manager.getActiveLayout();
    manager.setActiveLayoutId(active.id);
    return clampLayout({
      ...prefs,
      activeLayoutId: active.id,
    });
  });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [baselineFp, setBaselineFp] = useState(null);
  const saveTimer = useRef(0);
  const dockApiRef = useRef(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const applyingRef = useRef(false);

  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveLayoutPrefs(layout), 120);
    return () => window.clearTimeout(saveTimer.current);
  }, [layout]);

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
        viewportMaximized: Boolean(snapshot.viewportMaximized),
      };
      if (api) {
        try {
          dockLayout = api.toJSON();
        } catch {
          /* keep */
        }
        visibility = getPanelVisibility(api);
      }
      const working = { dockLayout, ...visibility };
      setLayout((prev) => clampLayout({
        ...prev,
        activeLayoutId: layoutEntry.id,
        ...working,
      }));
      setBaselineFp(snapshotFingerprint(working));
    } finally {
      window.setTimeout(() => {
        applyingRef.current = false;
      }, 0);
    }
  }, []);

  const setWorkspace = useCallback((workspace) => {
    patch({ workspace });
  }, [patch]);

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
            : null;
    if (!panelKey || !api) return;

    const panel = api.getPanel(panelKey);
    if (panel) closePanelByKey(api, panelKey);
    else reopenPanel(api, panelKey);
    persistDockLayout();
  }, [persistDockLayout]);

  const toggleMaximizeViewport = useCallback(() => {
    const api = dockApiRef.current;
    if (!api) return;
    const next = !getPanelVisibility(api).viewportMaximized;
    setViewportMaximized(api, next);
    persistDockLayout();
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
    togglePanel,
    toggleMaximizeViewport,
    resetLayout,
    setUiScale,
    stepUiScale,
    setDockApi,
    dockApiRef,
    persistDockLayout,
    syncVisibilityFromDock,
    markLayoutClean,
    captureCurrentSnapshot,
    viewScales: VIEW_SCALES,
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
    togglePanel,
    toggleMaximizeViewport,
    resetLayout,
    setUiScale,
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
