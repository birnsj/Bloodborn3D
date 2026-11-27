/**
 * Place a floating coach-mark card near a target rect with an arrow edge.
 *
 * For controls that live inside dock panels (Details, Outliner, …), the coach
 * tip anchors to the dock *tab* — not the scrolled/hidden control — so the
 * tip stays put. The control itself still gets `data-bb-tutorial-lit` for the
 * user to find after opening the tab / scrolling.
 */

import { DOCK_PANELS } from '../editor/layout/dockLayout.js';

/** Highlight id prefix → dock panel id (when the control lives in that panel). */
const HIGHLIGHT_PREFIX_TO_DOCK = [
  ['panel.outliner', 'outliner'],
  ['panel.details', 'details'],
  ['panel.content', 'content'],
  ['panel.assetViewer', 'assetViewer'],
  ['panel.layers', 'layers'],
  ['outliner.', 'outliner'],
  ['details.', 'details'],
  ['content.', 'content'],
  ['assetViewer.', 'assetViewer'],
  ['layers.', 'layers'],
  ['texture.', 'assetViewer'],
];

export function dockIdForTutorialHighlight(id) {
  const key = String(id || '');
  for (const [prefix, dockId] of HIGHLIGHT_PREFIX_TO_DOCK) {
    if (key === prefix || key.startsWith(prefix)) return dockId;
  }
  return null;
}

export function findDockTabElement(dockId) {
  if (!dockId || typeof document === 'undefined') return null;
  const meta = DOCK_PANELS[dockId];
  const title = meta?.title;
  const tabs = document.querySelectorAll('.dv-tab');
  for (const tab of tabs) {
    const label = tab.getAttribute('aria-label') || '';
    if (title && label === title) return tab;
    if (label === dockId) return tab;
    // Fallback: tab content text (title span).
    const text = (tab.textContent || '').trim();
    if (title && text === title) return tab;
  }
  return null;
}

function normalizeHighlightIds(highlightIds) {
  if (Array.isArray(highlightIds)) return highlightIds.filter(Boolean).map(String);
  if (highlightIds == null || highlightIds === '') return [];
  return [String(highlightIds)];
}

function usableRect(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
}

/**
 * Controls inside dock panels always anchor the tip to the dock *tab*.
 * The user opens the tab and scrolls to the pulsing control inside.
 * Toolbar / viewport / etc. still anchor to the control itself.
 */
export function resolveTutorialAnchor(id, el) {
  const dockId = dockIdForTutorialHighlight(id)
    || (() => {
      const panelRoot = el?.closest?.('[data-bb-tutorial^="panel."]');
      const help = panelRoot?.getAttribute?.('data-bb-tutorial');
      return help ? dockIdForTutorialHighlight(help) : null;
    })();

  if (dockId) {
    const tab = findDockTabElement(dockId);
    const tabRect = usableRect(tab);
    if (tab && tabRect) {
      return { rect: tabRect, id, el: tab, litEl: el || null, viaTab: true };
    }
    // Tab not found — do not fall back to the panel body (covers Details).
    return null;
  }

  const rect = usableRect(el);
  if (el && rect) return { rect, id, el, litEl: el, viaTab: false };
  return null;
}

export function positionCoachMark({
  anchor,
  panelWidth = 320,
  panelHeight = 220,
  layerWidth,
  layerHeight,
  gap = 14,
  margin = 10,
  /** When true (dock-tab fallback), avoid sitting on top of the panel body. */
  preferBeside = false,
}) {
  const width = Math.min(panelWidth, Math.max(200, layerWidth - margin * 2));
  const height = panelHeight;

  const candidates = [
    {
      placement: 'below',
      left: anchor.left + (anchor.width - width) / 2,
      top: anchor.bottom + gap,
    },
    {
      placement: 'above',
      left: anchor.left + (anchor.width - width) / 2,
      top: anchor.top - gap - height,
    },
    {
      placement: 'right',
      left: anchor.right + gap,
      top: anchor.top + (anchor.height - height) / 2,
    },
    {
      placement: 'left',
      left: anchor.left - gap - width,
      top: anchor.top + (anchor.height - height) / 2,
    },
  ];

  const score = (c) => {
    let s = 0;
    if (c.left >= margin) s += 2;
    if (c.top >= margin) s += 2;
    if (c.left + width <= layerWidth - margin) s += 2;
    if (c.top + height <= layerHeight - margin) s += 2;
    if (preferBeside) {
      // Tab fallback: keep the tip off the panel content under the tab.
      if (c.placement === 'left') s += 3;
      if (c.placement === 'right') s += 2.5;
      if (c.placement === 'above') s += 1.5;
      if (c.placement === 'below') s -= 2;
    } else {
      // Prefer below / right for toolbars
      if (c.placement === 'below') s += 1.5;
      if (c.placement === 'right') s += 1;
    }
    return s;
  };

  candidates.sort((a, b) => score(b) - score(a));
  let best = candidates[0];

  let left = Math.min(layerWidth - margin - width, Math.max(margin, best.left));
  let top = Math.min(layerHeight - margin - height, Math.max(margin, best.top));

  // Arrow tip aims at anchor center from card edge
  const anchorCx = anchor.left + anchor.width / 2;
  const anchorCy = anchor.top + anchor.height / 2;
  let arrow = { side: best.placement, offset: 0 };

  if (best.placement === 'below' || best.placement === 'above') {
    arrow.offset = Math.min(width - 20, Math.max(20, anchorCx - left));
  } else {
    arrow.offset = Math.min(height - 20, Math.max(20, anchorCy - top));
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    placement: best.placement,
    arrow,
  };
}

export function getTutorialAnchorRect(highlightIds = []) {
  const ids = normalizeHighlightIds(highlightIds);

  for (const id of ids) {
    const safe = String(id).replace(/"/g, '');
    const el = document.querySelector(`[data-bb-tutorial="${safe}"]`);
    const hit = resolveTutorialAnchor(safe, el);
    if (hit) return hit;
  }

  // Fallback: viewport canvas / workspace center
  const canvas = document.querySelector('.bb-viewport canvas, canvas');
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    return { rect, id: null, el: canvas };
  }
  const shell = document.querySelector('.bb-app');
  if (shell) {
    const rect = shell.getBoundingClientRect();
    const mid = {
      left: rect.left + rect.width * 0.35,
      top: rect.top + rect.height * 0.35,
      width: rect.width * 0.3,
      height: 40,
      right: rect.left + rect.width * 0.65,
      bottom: rect.top + rect.height * 0.35 + 40,
    };
    return { rect: mid, id: null, el: null };
  }
  return null;
}
