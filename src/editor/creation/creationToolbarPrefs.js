const STORAGE_KEY = 'bloodbound.editor.creationToolbar.v2';
/** Previous key — migrated once; dock resets to left (product default). */
const LEGACY_STORAGE_KEY = 'bloodbound.editor.creationToolbar.v1';

/** Dispatched when prefs change from Settings (or elsewhere) so the live toolbar reloads. */
export const CREATION_TOOLBAR_PREFS_EVENT = 'bb:creation-toolbar-prefs';

export const CREATION_TOOLBAR_SCALE_MIN = 0.75;
export const CREATION_TOOLBAR_SCALE_MAX = 1.75;
export const CREATION_TOOLBAR_SCALE_STEP = 0.05;

/** Viewport docks + floating. */
export const CREATION_TOOLBAR_DOCKS = ['top', 'left', 'right', 'bottom', 'float'];

export const DEFAULT_CREATION_TOOLBAR_PREFS = {
  /** Product default: flush-docked to the left Viewport edge. */
  dock: 'left',
  /** Offset along a flush docked edge (kept for compatibility; flush docks ignore it). */
  offset: 48,
  /** Floating position (px). */
  left: 12,
  top: 48,
  /** Visual scale → category/tool button size (strip follows). */
  scale: 1,
  categoryId: 'geometry',
  expanded: false,
  pinned: false,
};

export function isHorizontalDock(dock) {
  return dock === 'top' || dock === 'bottom';
}

export function isFloatingDock(dock) {
  return dock === 'float';
}

/** Category / tool hit target size at the current toolbox scale (base 32). */
export function creationToolbarButtonSize(prefs) {
  const scale = prefs?.scale || 1;
  return Math.max(16, Math.round(32 * scale));
}

/** Glyph size inside each button (base 14). */
export function creationToolbarIconSize(prefs) {
  const scale = prefs?.scale || 1;
  return Math.max(10, Math.round(14 * scale));
}

/** Strip / float rail thickness: button + 4px padding each side. */
export function creationToolbarStripThickness(prefs) {
  return creationToolbarButtonSize(prefs) + 8;
}

/**
 * Insets for viewport display chrome when the toolbox is flush-docked.
 * Floating → all zeros (chrome stays put).
 */
export function creationToolbarDockInsets(prefs = {}) {
  const dock = normalizeCreationToolbarDock(prefs.dock);
  if (dock === 'float') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const thickness = creationToolbarStripThickness(prefs);
  return {
    top: dock === 'top' ? thickness : 0,
    right: dock === 'right' ? thickness : 0,
    bottom: dock === 'bottom' ? thickness : 0,
    left: dock === 'left' ? thickness : 0,
  };
}

/** Write / clear CSS vars on the Viewport shell so pane chrome can shift. */
export function applyCreationToolbarDockInsets(viewportEl, prefs) {
  if (!viewportEl?.style) return creationToolbarDockInsets(prefs);
  const insets = creationToolbarDockInsets(prefs);
  viewportEl.style.setProperty('--bb-creation-inset-top', `${insets.top}px`);
  viewportEl.style.setProperty('--bb-creation-inset-right', `${insets.right}px`);
  viewportEl.style.setProperty('--bb-creation-inset-bottom', `${insets.bottom}px`);
  viewportEl.style.setProperty('--bb-creation-inset-left', `${insets.left}px`);
  return insets;
}

export function clearCreationToolbarDockInsets(viewportEl) {
  if (!viewportEl?.style) return;
  viewportEl.style.removeProperty('--bb-creation-inset-top');
  viewportEl.style.removeProperty('--bb-creation-inset-right');
  viewportEl.style.removeProperty('--bb-creation-inset-bottom');
  viewportEl.style.removeProperty('--bb-creation-inset-left');
}

export function normalizeCreationToolbarDock(value, fallback = DEFAULT_CREATION_TOOLBAR_PREFS.dock) {
  const raw = String(value || '');
  if (raw === 'free') return 'float';
  if (CREATION_TOOLBAR_DOCKS.includes(raw)) return raw;
  return fallback;
}

export function normalizeCreationToolbarScale(value, fallback = DEFAULT_CREATION_TOOLBAR_PREFS.scale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(
    CREATION_TOOLBAR_SCALE_MAX,
    Math.max(CREATION_TOOLBAR_SCALE_MIN, n),
  );
  const stepped = Math.round(clamped / CREATION_TOOLBAR_SCALE_STEP) * CREATION_TOOLBAR_SCALE_STEP;
  return Math.round(stepped * 100) / 100;
}

export function clampCreationToolbarPrefs(partial = {}, viewport = {}) {
  const src = partial && typeof partial === 'object' ? partial : {};
  const merged = { ...DEFAULT_CREATION_TOOLBAR_PREFS, ...src };
  const hasDock = Object.prototype.hasOwnProperty.call(src, 'dock');
  const hasEdge = Object.prototype.hasOwnProperty.call(src, 'edge');
  if (!hasDock && hasEdge) {
    merged.dock = src.edge === 'free' ? 'float' : src.edge;
  }

  const next = {
    dock: normalizeCreationToolbarDock(merged.dock),
    offset: Number.isFinite(merged.offset)
      ? merged.offset
      : DEFAULT_CREATION_TOOLBAR_PREFS.offset,
    left: Number.isFinite(merged.left) ? merged.left : DEFAULT_CREATION_TOOLBAR_PREFS.left,
    top: Number.isFinite(merged.top) ? merged.top : DEFAULT_CREATION_TOOLBAR_PREFS.top,
    scale: normalizeCreationToolbarScale(merged.scale),
    categoryId: typeof merged.categoryId === 'string' && merged.categoryId
      ? merged.categoryId
      : DEFAULT_CREATION_TOOLBAR_PREFS.categoryId,
    expanded: Boolean(merged.expanded),
    pinned: Boolean(merged.pinned),
  };

  const vw = Math.max(0, viewport.width || 0);
  const vh = Math.max(0, viewport.height || 0);
  const scale = next.scale || 1;
  const barW = 44 * scale;
  const barH = 280 * scale;

  if (next.dock === 'float') {
    if (vw > 0) next.left = Math.max(8, Math.min(next.left, Math.max(8, vw - barW)));
    else next.left = Math.max(8, next.left);
    if (vh > 0) next.top = Math.max(8, Math.min(next.top, Math.max(8, vh - barH)));
    else next.top = Math.max(8, next.top);
  } else if (isHorizontalDock(next.dock)) {
    if (vw > 0) {
      next.offset = Math.max(0, Math.min(next.offset, Math.max(0, vw - barW)));
    }
  } else if (vh > 0) {
    next.offset = Math.max(0, Math.min(next.offset, Math.max(0, vh - barH)));
  }

  next.edge = next.dock === 'float' ? 'free' : next.dock;
  return next;
}

/**
 * Resolve dock from a pointer position inside the viewport.
 * Near an edge → flush dock; otherwise → floating at (left, top).
 */
export function snapToolbarDock(left, top, viewportWidth, viewportHeight, threshold = 40) {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { dock: 'float', left: Math.max(8, left), top: Math.max(8, top) };
  }
  const dist = {
    left,
    right: viewportWidth - left,
    top,
    bottom: viewportHeight - top,
  };
  let dock = 'left';
  let best = dist.left;
  for (const [edge, d] of Object.entries(dist)) {
    if (d < best) {
      best = d;
      dock = edge;
    }
  }
  if (best > threshold) {
    return {
      dock: 'float',
      left: Math.max(8, Math.min(left, viewportWidth - 48)),
      top: Math.max(8, Math.min(top, viewportHeight - 48)),
      offset: 0,
    };
  }
  return {
    dock,
    offset: 0,
    left: isHorizontalDock(dock) ? Math.max(8, left) : 0,
    top: isHorizontalDock(dock) ? 0 : Math.max(8, top),
  };
}

/** @deprecated */
export function snapToolbarEdge(left, viewportWidth, threshold = 28, barWidth = 44) {
  void barWidth;
  if (viewportWidth <= 0) return { edge: 'float', left };
  if (left <= threshold) return { edge: 'left', left: 0 };
  if (left >= viewportWidth - threshold - 44) return { edge: 'right', left };
  return { edge: 'float', left };
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadCreationToolbarPrefs() {
  try {
    const store = storage();
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) return clampCreationToolbarPrefs(JSON.parse(raw));

    // One-shot migrate from v1: keep scale, re-lock dock to left.
    const legacyRaw = store?.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      let legacy = {};
      try {
        legacy = JSON.parse(legacyRaw) || {};
      } catch {
        legacy = {};
      }
      const migrated = clampCreationToolbarPrefs({
        ...legacy,
        dock: 'left',
      });
      saveCreationToolbarPrefs(migrated);
      try {
        store?.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return migrated;
    }

    return { ...DEFAULT_CREATION_TOOLBAR_PREFS };
  } catch {
    return { ...DEFAULT_CREATION_TOOLBAR_PREFS };
  }
}

export function saveCreationToolbarPrefs(prefs) {
  try {
    const clamped = clampCreationToolbarPrefs(prefs);
    const stored = {
      dock: clamped.dock,
      offset: clamped.offset,
      left: clamped.left,
      top: clamped.top,
      scale: clamped.scale,
      categoryId: clamped.categoryId,
      expanded: clamped.expanded,
      pinned: clamped.pinned,
    };
    storage()?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* ignore quota */
  }
}

export function patchCreationToolbarPrefs(partial, viewport = {}) {
  const merged = { ...loadCreationToolbarPrefs(), ...partial };
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'dock')) {
    merged.dock = normalizeCreationToolbarDock(partial.dock);
  }
  if (partial && partial.edge != null && partial.dock == null) {
    merged.dock = normalizeCreationToolbarDock(partial.edge);
  }
  const next = clampCreationToolbarPrefs(merged, viewport);
  saveCreationToolbarPrefs(next);
  try {
    window.dispatchEvent(new CustomEvent(CREATION_TOOLBAR_PREFS_EVENT, { detail: next }));
  } catch {
    /* non-browser */
  }
  return next;
}

export const CREATION_TOOLBAR_STORAGE_KEY = STORAGE_KEY;
