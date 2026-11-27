const STORAGE_KEY_V1 = 'bloodbound.editor.viewport.v1';
const STORAGE_KEY = 'bloodbound.editor.viewport.v2';

export const CAMERA_MODES = [
  'perspective',
  'isometric',
  'top',
  'bottom',
  'front',
  'back',
  'left',
  'right',
];

export const DISPLAY_MODES = [
  'lit',
  'unlit',
  'textured',
  'wireframe',
  'solid-edges',
];

export const LAYOUT_MODES = [
  'single',
  'dual-h',
  'dual-v',
  'triple',
  'quad',
];

/** Human labels for View / pane layout menus. */
export const LAYOUT_MODE_OPTIONS = [
  { id: 'single', label: 'One Pane' },
  { id: 'dual-h', label: 'Two Panes — Side by Side' },
  { id: 'dual-v', label: 'Two Panes — Stacked' },
  { id: 'triple', label: 'Three Panes' },
  { id: 'quad', label: 'Four Panes' },
];

/** Default pane cameras for a fresh quad layout. */
export const DEFAULT_QUAD_CAMERAS = [
  'perspective',
  'top',
  'front',
  'right',
];

const DEFAULT_POSE = {
  position: [6, 5, 8],
  target: [0, 1.5, 0],
  frustumSize: 12,
};

/** Fog preview defaults: on for perspective, off for ortho/isometric. */
export function defaultShowFogForCameraMode(cameraMode) {
  return normalizeCameraMode(cameraMode) === 'perspective';
}

/**
 * Mist particle preview defaults: off in every pane.
 * Distance fog stays independent (Fog chip); Mist is opt-in so alpha discs
 * do not appear until the author wants them.
 */
export function defaultShowMistForCameraMode(_cameraMode) {
  return false;
}

/** Post-processing preview defaults: on for perspective, off otherwise. */
export function defaultShowPostProcessingForCameraMode(cameraMode) {
  return normalizeCameraMode(cameraMode) === 'perspective';
}

/**
 * Resolve whether a pane should show fog this frame.
 * Explicit pane.showFog wins; otherwise camera-mode default (ortho off).
 */
export function resolvePaneShowFog(pane) {
  if (typeof pane?.showFog === 'boolean') return pane.showFog;
  if (typeof pane?.paneState?.showFog === 'boolean') return pane.paneState.showFog;
  const mode = pane?.cameraMode || pane?.paneState?.cameraMode;
  return defaultShowFogForCameraMode(mode);
}

/**
 * Resolve whether a pane should show Mist particles this frame.
 * Explicit pane.showMist wins; otherwise default off (Fog chip is separate).
 */
export function resolvePaneShowMist(pane) {
  if (typeof pane?.showMist === 'boolean') return pane.showMist;
  if (typeof pane?.paneState?.showMist === 'boolean') return pane.paneState.showMist;
  const mode = pane?.cameraMode || pane?.paneState?.cameraMode;
  return defaultShowMistForCameraMode(mode);
}

/**
 * Resolve whether a pane should run the post-processing preview.
 * Explicit pane.showPostProcessing wins; otherwise camera-mode default.
 */
export function resolvePaneShowPostProcessing(pane) {
  if (typeof pane?.showPostProcessing === 'boolean') return pane.showPostProcessing;
  if (typeof pane?.paneState?.showPostProcessing === 'boolean') {
    return pane.paneState.showPostProcessing;
  }
  const mode = pane?.cameraMode || pane?.paneState?.cameraMode;
  return defaultShowPostProcessingForCameraMode(mode);
}

function defaultPane(id, cameraMode) {
  const mode = normalizeCameraMode(cameraMode);
  return {
    id,
    cameraMode: mode,
    displayMode: 'lit',
    showFog: defaultShowFogForCameraMode(mode),
    showMist: defaultShowMistForCameraMode(mode),
    showPostProcessing: defaultShowPostProcessingForCameraMode(mode),
    position: [...DEFAULT_POSE.position],
    target: [...DEFAULT_POSE.target],
    frustumSize: DEFAULT_POSE.frustumSize,
  };
}

export const DEFAULT_VIEWPORT_PREFS = {
  /** Single perspective by default — multi-pane is opt-in via the layout toolbar. */
  layoutMode: 'single',
  /** Vertical divider (left | right) 0–1 */
  splitX: 0.5,
  /** Horizontal divider 0–1: full width in dual-v, left column in quad */
  splitY: 0.5,
  /** Right-column horizontal divider (quad / triple) — independent of splitY */
  splitY2: 0.5,
  activePaneId: 'pane-0',
  maximizedPaneId: null,
  /** Snapshot taken when maximizing so restore is exact */
  maximizeRestore: null,
  /** Editor-only: preview map post-processing in perspective lit panes. */
  postProcessingPreview: true,
  panes: [
    defaultPane('pane-0', 'perspective'),
    defaultPane('pane-1', 'top'),
    defaultPane('pane-2', 'front'),
    defaultPane('pane-3', 'right'),
  ],
};

function clamp01(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(0.85, Math.max(0.15, v));
}

function clampFrustum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_POSE.frustumSize;
  return Math.min(500, Math.max(0.5, v));
}

function clampVec3(arr, fallback) {
  if (!Array.isArray(arr) || arr.length < 3) return [...fallback];
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const n = Number(arr[i]);
    out.push(Number.isFinite(n) ? n : fallback[i]);
  }
  return out;
}

export function normalizeCameraMode(mode) {
  return CAMERA_MODES.includes(mode) ? mode : 'perspective';
}

export function normalizeDisplayMode(mode) {
  return DISPLAY_MODES.includes(mode) ? mode : 'lit';
}

export function normalizeLayoutMode(mode) {
  return LAYOUT_MODES.includes(mode) ? mode : 'single';
}

export function paneCountForLayout(layoutMode) {
  switch (normalizeLayoutMode(layoutMode)) {
    case 'single':
      return 1;
    case 'dual-h':
    case 'dual-v':
      return 2;
    case 'triple':
      return 3;
    case 'quad':
    default:
      return 4;
  }
}

export function clampViewportPrefs(partial = {}) {
  const base = { ...DEFAULT_VIEWPORT_PREFS, ...partial };
  const layoutMode = normalizeLayoutMode(base.layoutMode);
  const count = paneCountForLayout(layoutMode);

  const srcPanes = Array.isArray(base.panes) ? base.panes : [];
  const panes = [];
  for (let i = 0; i < 4; i += 1) {
    const src = srcPanes[i] || {};
    const fallbackCam = DEFAULT_QUAD_CAMERAS[i] || 'perspective';
    const cameraMode = normalizeCameraMode(src.cameraMode || fallbackCam);
    panes.push({
      id: typeof src.id === 'string' && src.id ? src.id : `pane-${i}`,
      cameraMode,
      displayMode: normalizeDisplayMode(src.displayMode),
      showFog: typeof src.showFog === 'boolean'
        ? src.showFog
        : defaultShowFogForCameraMode(cameraMode),
      showMist: typeof src.showMist === 'boolean'
        ? src.showMist
        : defaultShowMistForCameraMode(cameraMode),
      showPostProcessing: typeof src.showPostProcessing === 'boolean'
        ? src.showPostProcessing
        : defaultShowPostProcessingForCameraMode(cameraMode),
      position: clampVec3(src.position, DEFAULT_POSE.position),
      target: clampVec3(src.target, DEFAULT_POSE.target),
      frustumSize: clampFrustum(src.frustumSize),
    });
  }

  let activePaneId = typeof base.activePaneId === 'string' ? base.activePaneId : 'pane-0';
  if (!panes.slice(0, count).some((p) => p.id === activePaneId)) {
    activePaneId = panes[0].id;
  }

  let maximizedPaneId = base.maximizedPaneId;
  if (maximizedPaneId != null) {
    if (typeof maximizedPaneId !== 'string' || !panes.some((p) => p.id === maximizedPaneId)) {
      maximizedPaneId = null;
    }
  }

  let maximizeRestore = null;
  if (base.maximizeRestore && typeof base.maximizeRestore === 'object') {
    maximizeRestore = {
      layoutMode: normalizeLayoutMode(base.maximizeRestore.layoutMode),
      splitX: clamp01(base.maximizeRestore.splitX, 0.5),
      splitY: clamp01(base.maximizeRestore.splitY, 0.5),
      splitY2: clamp01(base.maximizeRestore.splitY2, 0.5),
    };
  }

  return {
    layoutMode,
    splitX: clamp01(base.splitX, 0.5),
    splitY: clamp01(base.splitY, 0.5),
    splitY2: clamp01(base.splitY2, 0.5),
    activePaneId,
    maximizedPaneId,
    maximizeRestore: maximizedPaneId ? maximizeRestore : null,
    postProcessingPreview: base.postProcessingPreview !== false,
    panes,
  };
}

export function loadViewportPrefs() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) return clampViewportPrefs(JSON.parse(rawV2));

    // v1 → v2: keep camera poses, but force single-view (multi-pane is opt-in).
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const old = JSON.parse(rawV1);
      const migrated = clampViewportPrefs({
        ...old,
        layoutMode: 'single',
        maximizedPaneId: null,
        maximizeRestore: null,
        activePaneId: 'pane-0',
      });
      saveViewportPrefs(migrated);
      return migrated;
    }

    return clampViewportPrefs();
  } catch {
    return clampViewportPrefs();
  }
}

export function saveViewportPrefs(prefs) {
  try {
    const clamped = clampViewportPrefs(prefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    return clamped;
  } catch {
    return clampViewportPrefs(prefs);
  }
}

/**
 * Layout-catalog slice of viewport prefs (mode / splits / camera+display per pane).
 * Excludes freelook poses — those stay in personal viewport prefs.
 */
export function viewportViewFromPrefs(prefs) {
  const p = clampViewportPrefs(prefs || {});
  return {
    layoutMode: p.layoutMode,
    splitX: p.splitX,
    splitY: p.splitY,
    splitY2: p.splitY2,
    activePaneId: p.activePaneId,
    panes: p.panes.map((pane) => ({
      id: pane.id,
      cameraMode: pane.cameraMode,
      displayMode: pane.displayMode,
      showFog: pane.showFog,
      showPostProcessing: pane.showPostProcessing,
    })),
  };
}

export function normalizeViewportView(raw) {
  return viewportViewFromPrefs(raw || DEFAULT_VIEWPORT_PREFS);
}

/** Merge a layout viewportView into full prefs, keeping camera poses. */
export function mergeViewportViewIntoPrefs(prefs, view) {
  const current = clampViewportPrefs(prefs || {});
  const normalized = normalizeViewportView(view);
  const panes = current.panes.map((pane, i) => {
    const fromView = normalized.panes[i] || {};
    const cameraMode = fromView.cameraMode || pane.cameraMode;
    return {
      ...pane,
      id: fromView.id || pane.id,
      cameraMode,
      displayMode: fromView.displayMode || pane.displayMode,
      showFog: typeof fromView.showFog === 'boolean'
        ? fromView.showFog
        : pane.showFog,
      showPostProcessing: typeof fromView.showPostProcessing === 'boolean'
        ? fromView.showPostProcessing
        : pane.showPostProcessing,
    };
  });
  return clampViewportPrefs({
    ...current,
    layoutMode: normalized.layoutMode,
    splitX: normalized.splitX,
    splitY: normalized.splitY,
    splitY2: normalized.splitY2,
    activePaneId: normalized.activePaneId,
    maximizedPaneId: null,
    maximizeRestore: null,
    panes,
  });
}

export const DEFAULT_VIEWPORT_VIEW = viewportViewFromPrefs(DEFAULT_VIEWPORT_PREFS);

/**
 * Compute CSS pixel rects for each visible pane inside a shell of size (width, height).
 * Rects use top-left origin (DOM style). Returns [{ paneId, x, y, width, height }].
 */
export function computePaneRects(prefs, width, height) {
  const p = clampViewportPrefs(prefs);
  const w = Math.max(1, width);
  const h = Math.max(1, height);

  if (p.maximizedPaneId) {
    const pane = p.panes.find((x) => x.id === p.maximizedPaneId) || p.panes[0];
    return [{ paneId: pane.id, x: 0, y: 0, width: w, height: h }];
  }

  const sx = Math.round(w * p.splitX);
  const sy = Math.round(h * p.splitY);
  const sy2 = Math.round(h * p.splitY2);

  switch (p.layoutMode) {
    case 'single':
      return [{ paneId: p.panes[0].id, x: 0, y: 0, width: w, height: h }];
    case 'dual-h':
      return [
        { paneId: p.panes[0].id, x: 0, y: 0, width: sx, height: h },
        { paneId: p.panes[1].id, x: sx, y: 0, width: w - sx, height: h },
      ];
    case 'dual-v':
      return [
        { paneId: p.panes[0].id, x: 0, y: 0, width: w, height: sy },
        { paneId: p.panes[1].id, x: 0, y: sy, width: w, height: h - sy },
      ];
    case 'triple':
      return [
        { paneId: p.panes[0].id, x: 0, y: 0, width: sx, height: h },
        { paneId: p.panes[1].id, x: sx, y: 0, width: w - sx, height: sy2 },
        { paneId: p.panes[2].id, x: sx, y: sy2, width: w - sx, height: h - sy2 },
      ];
    case 'quad':
    default:
      // splitX = vertical divider; splitY = left-column horizontal;
      // splitY2 = right-column horizontal — columns resize independently.
      return [
        { paneId: p.panes[0].id, x: 0, y: 0, width: sx, height: sy },
        { paneId: p.panes[1].id, x: sx, y: 0, width: w - sx, height: sy2 },
        { paneId: p.panes[2].id, x: 0, y: sy, width: sx, height: h - sy },
        { paneId: p.panes[3].id, x: sx, y: sy2, width: w - sx, height: h - sy2 },
      ];
  }
}

/** Hit-test which pane contains a point in shell-local CSS pixels. */
export function paneIdAtPoint(prefs, width, height, localX, localY) {
  const rects = computePaneRects(prefs, width, height);
  for (const r of rects) {
    if (
      localX >= r.x
      && localX < r.x + r.width
      && localY >= r.y
      && localY < r.y + r.height
    ) {
      return r.paneId;
    }
  }
  return rects[0]?.paneId || null;
}

/**
 * Convert shell-local CSS pointer coords to NDC relative to a pane rect.
 * @returns {{ x: number, y: number } | null}
 */
export function pointerToPaneNdc(rect, localX, localY) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const u = (localX - rect.x) / rect.width;
  const v = (localY - rect.y) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return {
    x: u * 2 - 1,
    y: -(v * 2 - 1),
  };
}

/** Ortho view plane axes (world) for axis-constrained editing. */
export function orthoPlaneAxes(cameraMode) {
  switch (normalizeCameraMode(cameraMode)) {
    case 'top':
    case 'bottom':
      return ['x', 'z'];
    case 'front':
    case 'back':
      return ['x', 'y'];
    case 'left':
    case 'right':
      return ['z', 'y'];
    default:
      return ['x', 'y', 'z'];
  }
}

export function isOrthographicMode(cameraMode) {
  const mode = normalizeCameraMode(cameraMode);
  return mode !== 'perspective';
}
