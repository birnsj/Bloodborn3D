/** Panel ids used by the Level Editor dock workspace. */
export const DOCK_PANELS = {
  viewport: {
    id: 'viewport',
    component: 'viewport',
    title: 'Viewport',
  },
  outliner: {
    id: 'outliner',
    component: 'outliner',
    title: 'Scene Outliner',
  },
  details: {
    id: 'details',
    component: 'details',
    title: 'Details',
  },
  content: {
    id: 'content',
    component: 'content',
    title: 'Content Browser',
  },
  assetViewer: {
    id: 'assetViewer',
    component: 'assetViewer',
    title: 'Asset Viewer',
  },
  tutorials: {
    id: 'tutorials',
    component: 'tutorials',
    title: 'Tutorials',
  },
};

export const DOCK_PANEL_IDS = Object.values(DOCK_PANELS).map((p) => p.id);

/** Visibility keys in layout prefs ↔ dock panel ids. */
export const PANEL_VISIBILITY_KEYS = {
  outliner: 'outlinerVisible',
  details: 'detailsVisible',
  content: 'contentVisible',
  assetViewer: 'assetViewerVisible',
  tutorials: 'tutorialsVisible',
};

/**
 * Build the BloodBound default arrangement:
 * left Outliner | center Viewport | right Details
 * bottom Content Browser | Asset Viewer
 */
export function applyDefaultDockLayout(api) {
  if (!api) return;

  api.clear();

  api.addPanel({
    id: DOCK_PANELS.viewport.id,
    component: DOCK_PANELS.viewport.component,
    title: DOCK_PANELS.viewport.title,
    renderer: 'always',
  });

  // Split viewport / content first so Content spans the bottom edge.
  api.addPanel({
    id: DOCK_PANELS.content.id,
    component: DOCK_PANELS.content.component,
    title: DOCK_PANELS.content.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'below' },
    initialHeight: 180,
  });

  // Asset Viewer beside Content Browser (independent panel).
  api.addPanel({
    id: DOCK_PANELS.assetViewer.id,
    component: DOCK_PANELS.assetViewer.component,
    title: DOCK_PANELS.assetViewer.title,
    position: { referencePanel: DOCK_PANELS.content.id, direction: 'right' },
    initialWidth: 280,
  });

  api.addPanel({
    id: DOCK_PANELS.outliner.id,
    component: DOCK_PANELS.outliner.component,
    title: DOCK_PANELS.outliner.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'left' },
    initialWidth: 240,
  });

  api.addPanel({
    id: DOCK_PANELS.details.id,
    component: DOCK_PANELS.details.component,
    title: DOCK_PANELS.details.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'right' },
    initialWidth: 300,
  });
}

export function isValidDockLayout(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.grid || typeof data.grid !== 'object') return false;
  if (!data.grid.root || typeof data.grid.root !== 'object') return false;
  if (!data.panels || typeof data.panels !== 'object') return false;
  const viewport = data.panels[DOCK_PANELS.viewport.id];
  if (!viewport) return false;
  if (viewport.contentComponent && viewport.contentComponent !== DOCK_PANELS.viewport.component) {
    return false;
  }
  return true;
}

/**
 * Apply a workspace snapshot to a live dockview API.
 * Falls back to factory arrangement when dockLayout is null/invalid.
 */
export function applyDockSnapshot(api, snapshot = {}) {
  if (!api) return false;

  let dockLayout = snapshot?.dockLayout;
  if (dockLayout && !isValidDockLayout(dockLayout)) {
    dockLayout = null;
  }
  if (isValidDockLayout(dockLayout)) {
    try {
      api.clear();
      api.fromJSON(dockLayout);
      ensureViewportPanel(api);
      if (snapshot.viewportMaximized) {
        setViewportMaximized(api, true);
      }
      return true;
    } catch {
      /* fall through to factory */
    }
  }

  applyDefaultDockLayout(api);
  if (snapshot.outlinerVisible === false) closePanelByKey(api, 'outliner');
  if (snapshot.detailsVisible === false) closePanelByKey(api, 'details');
  if (snapshot.contentVisible === false) closePanelByKey(api, 'content');
  if (snapshot.assetViewerVisible === false) closePanelByKey(api, 'assetViewer');
  if (snapshot.tutorialsVisible === true) reopenPanel(api, 'tutorials');
  if (snapshot.viewportMaximized) setViewportMaximized(api, true);
  return true;
}

export function ensureViewportPanel(api) {
  if (!api || api.getPanel(DOCK_PANELS.viewport.id)) return;
  api.addPanel({
    id: DOCK_PANELS.viewport.id,
    component: DOCK_PANELS.viewport.component,
    title: DOCK_PANELS.viewport.title,
    renderer: 'always',
  });
}

export function getPanelVisibility(api) {
  return {
    outlinerVisible: Boolean(api?.getPanel(DOCK_PANELS.outliner.id)),
    detailsVisible: Boolean(api?.getPanel(DOCK_PANELS.details.id)),
    contentVisible: Boolean(api?.getPanel(DOCK_PANELS.content.id)),
    assetViewerVisible: Boolean(api?.getPanel(DOCK_PANELS.assetViewer.id)),
    tutorialsVisible: Boolean(api?.getPanel(DOCK_PANELS.tutorials.id)),
    viewportMaximized: Boolean(api?.getPanel(DOCK_PANELS.viewport.id)?.api.isMaximized()),
  };
}

export function reopenPanel(api, panelKey) {
  if (!api) return;
  const def = DOCK_PANELS[panelKey];
  if (!def) return;
  if (api.getPanel(def.id)) {
    api.getPanel(def.id).api.setActive();
    return;
  }

  const hasViewport = Boolean(api.getPanel(DOCK_PANELS.viewport.id));
  if (!hasViewport) {
    ensureViewportPanel(api);
  }

  const positionByKey = {
    outliner: {
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'left' },
      initialWidth: 240,
    },
    details: {
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'right' },
      initialWidth: 300,
    },
    content: {
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'below' },
      initialHeight: 180,
    },
    assetViewer: {
      position: {
        referencePanel: api.getPanel(DOCK_PANELS.content.id)
          ? DOCK_PANELS.content.id
          : DOCK_PANELS.viewport.id,
        direction: api.getPanel(DOCK_PANELS.content.id) ? 'right' : 'below',
      },
      initialWidth: 280,
      initialHeight: 180,
    },
    tutorials: {
      position: {
        referencePanel: api.getPanel(DOCK_PANELS.details.id)
          ? DOCK_PANELS.details.id
          : DOCK_PANELS.viewport.id,
        direction: api.getPanel(DOCK_PANELS.details.id) ? 'below' : 'right',
      },
      initialWidth: 320,
      initialHeight: 280,
    },
  };

  const extras = positionByKey[panelKey] || {};
  api.addPanel({
    id: def.id,
    component: def.component,
    title: def.title,
    ...extras,
  });
}

export function closePanelByKey(api, panelKey) {
  if (!api) return;
  const def = DOCK_PANELS[panelKey];
  if (!def || panelKey === 'viewport') return;
  const panel = api.getPanel(def.id);
  if (panel) api.removePanel(panel);
}

export function setViewportMaximized(api, maximized) {
  const panel = api?.getPanel(DOCK_PANELS.viewport.id);
  if (!panel) return;
  if (maximized) {
    if (!panel.api.isMaximized()) panel.api.maximize();
  } else if (panel.api.isMaximized()) {
    panel.api.exitMaximized();
  }
}

/** Pure helper for tests — strips volatile size fields for stable compare keys. */
export function dockLayoutFingerprint(data) {
  if (!isValidDockLayout(data)) return null;
  return {
    panelIds: Object.keys(data.panels).sort(),
    hasFloating: Array.isArray(data.floatingGroups) && data.floatingGroups.length > 0,
    orientation: data.grid.orientation,
  };
}
