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
  layers: {
    id: 'layers',
    component: 'layers',
    title: 'Layers',
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
  layers: 'layersVisible',
};

/**
 * Build the BloodBound default arrangement:
 * left: Content Browser (folder navigation)
 * center: Viewport
 * right: Outliner over Details (World settings live in Details)
 * bottom: Asset Viewer (assets from the selected Content folder)
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

  // Asset Viewer spans the bottom under the viewport.
  api.addPanel({
    id: DOCK_PANELS.assetViewer.id,
    component: DOCK_PANELS.assetViewer.component,
    title: DOCK_PANELS.assetViewer.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'below' },
    initialHeight: 220,
  });

  // Content Browser — left navigation column.
  api.addPanel({
    id: DOCK_PANELS.content.id,
    component: DOCK_PANELS.content.component,
    title: DOCK_PANELS.content.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'left' },
    initialWidth: 220,
  });

  // Right column: Outliner, with Details (incl. World) under it.
  api.addPanel({
    id: DOCK_PANELS.outliner.id,
    component: DOCK_PANELS.outliner.component,
    title: DOCK_PANELS.outliner.title,
    position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'right' },
    initialWidth: 260,
  });

  api.addPanel({
    id: DOCK_PANELS.details.id,
    component: DOCK_PANELS.details.component,
    title: DOCK_PANELS.details.title,
    position: { referencePanel: DOCK_PANELS.outliner.id, direction: 'below' },
    initialHeight: 280,
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
      // Never restore dockview maximize — it hides Outliner/Details/Content.
      setViewportMaximized(api, false);
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
  if (snapshot.layersVisible === true) reopenPanel(api, 'layers');
  setViewportMaximized(api, false);
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
    layersVisible: Boolean(api?.getPanel(DOCK_PANELS.layers.id)),
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
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'right' },
      initialWidth: 260,
    },
    details: {
      position: {
        referencePanel: api.getPanel(DOCK_PANELS.outliner.id)
          ? DOCK_PANELS.outliner.id
          : DOCK_PANELS.viewport.id,
        direction: api.getPanel(DOCK_PANELS.outliner.id) ? 'below' : 'right',
      },
      initialWidth: 260,
      initialHeight: 280,
    },
    content: {
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'left' },
      initialWidth: 220,
    },
    assetViewer: {
      position: { referencePanel: DOCK_PANELS.viewport.id, direction: 'below' },
      initialHeight: 220,
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
    layers: {
      position: {
        referencePanel: api.getPanel(DOCK_PANELS.outliner.id)
          ? DOCK_PANELS.outliner.id
          : DOCK_PANELS.viewport.id,
        direction: api.getPanel(DOCK_PANELS.outliner.id) ? 'below' : 'right',
      },
      initialWidth: 260,
      initialHeight: 220,
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
