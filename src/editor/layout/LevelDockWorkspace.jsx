import { useCallback, useEffect, useRef } from 'react';
import { DockviewReact } from 'dockview-react';
import {
  ASSET_DRAG_MIME,
  ASSET_DRAG_MIME_MATERIAL,
} from '../../assets/assetCatalog.js';
import { CREATE_DRAG_MIME } from '../creation/creationTools.js';
import { ChecklistPanel } from '../checklists/ChecklistPanel.jsx';
import { StickyNotesLayer } from '../stickyNotes/StickyNotesLayer.jsx';
import { TutorialsPanel } from '../../tutorials/TutorialsPanel.jsx';
import { useLayout } from './LayoutContext.jsx';
import { dockviewComponents } from './dockPanels.jsx';
import { bloodboundDockTheme } from './dockTheme.js';
import {
  applyDefaultDockLayout,
  DOCK_PANELS,
  ensureViewportPanel,
  isValidDockLayout,
} from './dockLayout.js';

/** True when the browser drag carries our asset/create payload (not a dock tab). */
function isBloodboundExternalDrag(event) {
  const native = event?.nativeEvent;
  if (!native?.dataTransfer?.types) return false;
  const types = [...native.dataTransfer.types];
  return types.includes(ASSET_DRAG_MIME)
    || types.includes(ASSET_DRAG_MIME_MATERIAL)
    || types.includes(CREATE_DRAG_MIME);
}

export function LevelDockWorkspace() {
  const {
    setDockApi,
    persistDockLayout,
    syncVisibilityFromDock,
    markLayoutClean,
    captureCurrentSnapshot,
    layout,
  } = useLayout();

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const disposablesRef = useRef([]);
  const apiRef = useRef(null);

  // Dispose listeners on unmount, but do not clear dockApiRef here — StrictMode
  // and Fast Refresh can run cleanup while Dockview stays alive without re-firing
  // onReady. EditorShell clears the API when leaving the Level workspace.
  useEffect(() => () => {
    for (const d of disposablesRef.current) {
      try { d.dispose?.(); } catch { /* ignore */ }
    }
    disposablesRef.current = [];
  }, []);

  const bindApi = useCallback((api) => {
    apiRef.current = api;
    setDockApi(api);

    for (const d of disposablesRef.current) {
      try { d.dispose?.(); } catch { /* ignore */ }
    }
    disposablesRef.current = [];

    disposablesRef.current.push(
      api.onDidLayoutChange(() => {
        persistDockLayout();
      }),
      api.onDidRemovePanel((panel) => {
        if (panel?.id === DOCK_PANELS.viewport.id) {
          window.setTimeout(() => {
            if (apiRef.current === api && !api.getPanel(DOCK_PANELS.viewport.id)) {
              ensureViewportPanel(api);
              persistDockLayout();
            }
          }, 0);
        }
        syncVisibilityFromDock();
        persistDockLayout();
      }),
      api.onDidAddPanel(() => {
        syncVisibilityFromDock();
      }),
      // Asset / create-tool HTML5 drags must not trigger dockview split overlays.
      // Without this, dropping a material onto the viewport halves the layout
      // ("screen gets smaller"). Also reject when our MIME is present even if a
      // stale LocalSelectionTransfer still looks like a panel move.
      api.onWillShowOverlay((event) => {
        if (isBloodboundExternalDrag(event) || !event.getData?.()) {
          event.preventDefault();
        }
      }),
      api.onWillDrop((event) => {
        if (isBloodboundExternalDrag(event) || !event.getData?.()) {
          event.preventDefault();
        }
      }),
    );
  }, [setDockApi, persistDockLayout, syncVisibilityFromDock]);

  const onReady = useCallback((event) => {
    const { api } = event;
    const current = layoutRef.current;

    bindApi(api);
    api.clear();

    const saved = current.dockLayout;
    let restored = false;
    if (isValidDockLayout(saved)) {
      try {
        // Strip always-renderer before restore — its overlay lets WebGL cover side panels.
        const cleaned = structuredClone(saved);
        if (cleaned?.panels) {
          for (const panel of Object.values(cleaned.panels)) {
            if (panel?.renderer === 'always') delete panel.renderer;
          }
        }
        api.fromJSON(cleaned);
        ensureViewportPanel(api);
        restored = true;
      } catch {
        restored = false;
      }
    }

    if (!restored) {
      applyDefaultDockLayout(api);
      if (!current.outlinerVisible) api.getPanel(DOCK_PANELS.outliner.id)?.api.close();
      if (!current.detailsVisible) api.getPanel(DOCK_PANELS.details.id)?.api.close();
      if (!current.contentVisible) api.getPanel(DOCK_PANELS.content.id)?.api.close();
      if (!current.assetViewerVisible) api.getPanel(DOCK_PANELS.assetViewer.id)?.api.close();
    }

    // Never start (or restore) dockview "maximize" — it hides Outliner/Details/etc.
    const viewportPanel = api.getPanel(DOCK_PANELS.viewport.id);
    if (viewportPanel?.api.isMaximized?.()) {
      viewportPanel.api.exitMaximized();
    }

    syncVisibilityFromDock();
    persistDockLayout();
    // Establish clean baseline after the first dock serialize settles.
    window.setTimeout(() => {
      markLayoutClean(captureCurrentSnapshot());
    }, 0);
  }, [bindApi, persistDockLayout, syncVisibilityFromDock, markLayoutClean, captureCurrentSnapshot]);

  return (
    <div className="bb-dock-host">
      <DockviewReact
        className="bb-dockview"
        theme={bloodboundDockTheme}
        components={dockviewComponents}
        onReady={onReady}
        floatingGroupBounds="boundedWithinViewport"
        floatingGroupDragHandle="tabbar"
        disableFloatingGroups={false}
        singleTabMode="default"
        popoutUrl={`${window.location.pathname}${window.location.search}`}
        getTabContextMenuItems={() => [
          'float',
          'popout',
          'separator',
          'close',
          'closeOthers',
          'closeAll',
        ]}
      />
      {/* Above all dock panels so notes can park over Outliner / Content / Details. */}
      <StickyNotesLayer />
      <ChecklistPanel />
      <TutorialsPanel />
    </div>
  );
}
