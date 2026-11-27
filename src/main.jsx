import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'dockview-react/dist/styles/dockview.css';
import App from './App.jsx';
import './styles/editor.css';

/**
 * One-shot: drop dockview always-renderer overlays that paint WebGL over side panels.
 * Force with ?resetDock=1 (also clears saved dock / workspace layout dock JSON).
 */
function scrubDockOverlayLayout() {
  try {
    const params = new URLSearchParams(window.location.search);
    const force = params.has('resetDock');
    const flagKey = 'bloodbound.dockOverlayFix.v1';
    if (!force && localStorage.getItem(flagKey) === '1') return;

    const stripAlways = (dockLayout) => {
      if (!dockLayout?.panels || typeof dockLayout.panels !== 'object') return dockLayout;
      for (const panel of Object.values(dockLayout.panels)) {
        if (panel && panel.renderer === 'always') delete panel.renderer;
      }
      return dockLayout;
    };

    for (const key of [
      'bloodbound.editor.layout.v1',
      'bloodbound.editor.layout.v2',
    ]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (force) {
          data.dockLayout = null;
        } else if (data.dockLayout) {
          data.dockLayout = stripAlways(data.dockLayout);
        }
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        if (force) localStorage.removeItem(key);
      }
    }

    const wsKey = 'bloodbound.editor.workspaceLayouts.v1';
    const wsRaw = localStorage.getItem(wsKey);
    if (wsRaw) {
      try {
        const catalog = JSON.parse(wsRaw);
        if (catalog?.layouts && typeof catalog.layouts === 'object') {
          for (const layout of Object.values(catalog.layouts)) {
            if (!layout?.snapshot) continue;
            if (force) layout.snapshot.dockLayout = null;
            else if (layout.snapshot.dockLayout) {
              layout.snapshot.dockLayout = stripAlways(layout.snapshot.dockLayout);
            }
          }
          localStorage.setItem(wsKey, JSON.stringify(catalog));
        }
      } catch {
        if (force) localStorage.removeItem(wsKey);
      }
    }

    localStorage.setItem(flagKey, '1');
    if (force) {
      params.delete('resetDock');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', next);
      window.location.reload();
    }
  } catch {
    /* ignore */
  }
}

scrubDockOverlayLayout();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
