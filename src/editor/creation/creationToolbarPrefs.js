const STORAGE_KEY = 'bloodbound.editor.creationToolbar.v1';

export const DEFAULT_CREATION_TOOLBAR_PREFS = {
  /** 'left' | 'right' | 'free' */
  edge: 'left',
  /** Offset from top of viewport (px, unscaled). */
  top: 48,
  /** Free-drag left offset when edge === 'free'. */
  left: 12,
  categoryId: 'geometry',
  expanded: false,
  pinned: false,
};

export function clampCreationToolbarPrefs(partial, viewport = {}) {
  const next = { ...DEFAULT_CREATION_TOOLBAR_PREFS, ...partial };
  if (!['left', 'right', 'free'].includes(next.edge)) next.edge = 'left';
  next.top = Number.isFinite(next.top) ? next.top : DEFAULT_CREATION_TOOLBAR_PREFS.top;
  next.left = Number.isFinite(next.left) ? next.left : DEFAULT_CREATION_TOOLBAR_PREFS.left;
  next.expanded = Boolean(next.expanded);
  next.pinned = Boolean(next.pinned);
  if (typeof next.categoryId !== 'string' || !next.categoryId) {
    next.categoryId = DEFAULT_CREATION_TOOLBAR_PREFS.categoryId;
  }

  const vw = Math.max(0, viewport.width || 0);
  const vh = Math.max(0, viewport.height || 0);
  const barW = 44;
  const barH = 280;
  if (vh > 0) {
    next.top = Math.max(8, Math.min(next.top, Math.max(8, vh - barH)));
  } else {
    next.top = Math.max(8, next.top);
  }
  if (next.edge === 'free' && vw > 0) {
    next.left = Math.max(8, Math.min(next.left, Math.max(8, vw - barW)));
  }
  return next;
}

/**
 * Snap free position to left/right edge when close enough.
 */
export function snapToolbarEdge(left, viewportWidth, threshold = 28) {
  if (viewportWidth <= 0) return { edge: 'free', left };
  if (left <= threshold) return { edge: 'left', left: 12 };
  if (left >= viewportWidth - threshold - 44) return { edge: 'right', left };
  return { edge: 'free', left };
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
    if (!raw) return { ...DEFAULT_CREATION_TOOLBAR_PREFS };
    return clampCreationToolbarPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CREATION_TOOLBAR_PREFS };
  }
}

export function saveCreationToolbarPrefs(prefs) {
  try {
    storage()?.setItem(
      STORAGE_KEY,
      JSON.stringify(clampCreationToolbarPrefs(prefs)),
    );
  } catch {
    /* ignore quota */
  }
}

export const CREATION_TOOLBAR_STORAGE_KEY = STORAGE_KEY;
