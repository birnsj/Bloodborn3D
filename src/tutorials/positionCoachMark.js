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

function rectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  const aL = a.left - pad;
  const aT = a.top - pad;
  const aR = (a.right ?? a.left + a.width) + pad;
  const aB = (a.bottom ?? a.top + a.height) + pad;
  const bL = b.left;
  const bT = b.top;
  const bR = b.right ?? b.left + b.width;
  const bB = b.bottom ?? b.top + b.height;
  return aL < bR && aR > bL && aT < bB && aB > bT;
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right ?? a.left + a.width, b.right ?? b.left + b.width);
  const bottom = Math.min(a.bottom ?? a.top + a.height, b.bottom ?? b.top + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

/** Pad around the highlighted button — tip must stay clear of this. */
const BUTTON_CLEAR_PAD = 12;

function clampCardRect(left, top, width, height, layerWidth, layerHeight, margin) {
  const clampedLeft = Math.min(layerWidth - margin - width, Math.max(margin, left));
  const clampedTop = Math.min(layerHeight - margin - height, Math.max(margin, top));
  return {
    left: clampedLeft,
    top: clampedTop,
    width,
    height,
    right: clampedLeft + width,
    bottom: clampedTop + height,
  };
}

/** True when the tip card would cover (or crowd) the highlighted control. */
export function coachCardCoversButton(card, button, pad = BUTTON_CLEAR_PAD) {
  return rectsOverlap(card, button, pad);
}

/**
 * If clamping put the tip on the button, shove it to the nearest free side / corner.
 */
function clearCardOffButton(card, button, layerWidth, layerHeight, margin, pad = BUTTON_CLEAR_PAD) {
  if (!coachCardCoversButton(card, button, pad)) return card;
  const width = card.width;
  const height = card.height;
  const bL = button.left;
  const bT = button.top;
  const bR = button.right ?? button.left + button.width;
  const bB = button.bottom ?? button.top + button.height;

  const tries = [
    { left: bL + (button.width - width) / 2, top: bB + pad },
    { left: bL + (button.width - width) / 2, top: bT - pad - height },
    { left: bR + pad, top: bT + (button.height - height) / 2 },
    { left: bL - pad - width, top: bT + (button.height - height) / 2 },
    { left: margin, top: margin + 52 },
    { left: layerWidth - margin - width, top: margin + 52 },
    { left: margin, top: layerHeight - margin - height },
    { left: layerWidth - margin - width, top: layerHeight - margin - height },
  ];

  for (const tryPos of tries) {
    const next = clampCardRect(
      tryPos.left,
      tryPos.top,
      width,
      height,
      layerWidth,
      layerHeight,
      margin,
    );
    if (!coachCardCoversButton(next, button, pad)) return next;
  }
  return card;
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
  /**
   * Keep the tip off these rects (highlight button, lit control, viewport
   * action zone) so instructions never cover the control being taught.
   */
  avoidRects = [],
  /** Prefer screen corners / edges over hugging the anchor (tour mode). */
  clearOfAction = false,
}) {
  const width = Math.min(panelWidth, Math.max(200, layerWidth - margin * 2));
  const height = panelHeight;
  const avoids = Array.isArray(avoidRects) ? avoidRects.filter(Boolean) : [];
  // Always treat the highlighted control as a hard keep-out zone.
  const buttonKeepOut = {
    left: anchor.left,
    top: anchor.top,
    width: anchor.width,
    height: anchor.height,
    right: anchor.right ?? anchor.left + anchor.width,
    bottom: anchor.bottom ?? anchor.top + anchor.height,
  };

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
    // Escape hatches when the control sits on a screen edge (clamping would
    // otherwise slide the tip back onto the button).
    { placement: 'right', left: layerWidth - margin - width, top: margin + 52 },
    { placement: 'left', left: margin, top: margin + 52 },
    { placement: 'below', left: margin, top: layerHeight - margin - height },
    { placement: 'below', left: layerWidth - margin - width, top: layerHeight - margin - height },
    { placement: 'below', left: (layerWidth - width) / 2, top: layerHeight - margin - height },
  ];

  if (clearOfAction) {
    candidates.push(
      { placement: 'left', left: margin, top: margin + 52 },
      { placement: 'right', left: layerWidth - margin - width, top: margin + 52 },
    );
  }

  const materialize = (c) => ({
    ...clampCardRect(c.left, c.top, width, height, layerWidth, layerHeight, margin),
    placement: c.placement,
  });

  const score = (card) => {
    let s = 0;
    if (card.left >= margin) s += 2;
    if (card.top >= margin) s += 2;
    if (card.right <= layerWidth - margin) s += 2;
    if (card.bottom <= layerHeight - margin) s += 2;
    if (preferBeside && !clearOfAction) {
      if (card.placement === 'left') s += 3;
      if (card.placement === 'right') s += 2.5;
      if (card.placement === 'above') s += 1.5;
      if (card.placement === 'below') s -= 2;
    } else if (!clearOfAction) {
      if (card.placement === 'below') s += 1.5;
      if (card.placement === 'right') s += 1;
    } else if (card.top <= margin + 60 || card.bottom >= layerHeight - margin - 20) {
      s += 1;
    }
    // Hard: covering the button is never acceptable.
    if (coachCardCoversButton(card, buttonKeepOut)) s -= 100;
    for (const avoid of avoids) {
      const area = overlapArea(card, avoid);
      if (area > 0) s -= 8 + Math.min(10, area / 8000);
      else if (rectsOverlap(card, avoid, 16)) s -= 3;
    }
    return s;
  };

  const ranked = candidates
    .map(materialize)
    .sort((a, b) => score(b) - score(a));

  // Prefer any candidate that stays clear of the button after clamping.
  let best = ranked.find((card) => !coachCardCoversButton(card, buttonKeepOut)) || ranked[0];
  best = clearCardOffButton(best, buttonKeepOut, layerWidth, layerHeight, margin);

  const left = best.left;
  const top = best.top;

  // Arrow tip aims at anchor center from card edge
  const anchorCx = anchor.left + anchor.width / 2;
  const anchorCy = anchor.top + anchor.height / 2;
  let arrow = { side: best.placement, offset: 0 };

  if (best.placement === 'below' || best.placement === 'above') {
    arrow.offset = Math.min(width - 20, Math.max(20, anchorCx - left));
  } else {
    arrow.offset = Math.min(height - 20, Math.max(20, anchorCy - top));
  }

  // Tips parked far away skip the arrow.
  const cardCenter = { x: left + width / 2, y: top + height / 2 };
  const dist = Math.hypot(cardCenter.x - anchorCx, cardCenter.y - anchorCy);
  if (dist > Math.min(layerWidth, layerHeight) * 0.35) {
    arrow = null;
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
