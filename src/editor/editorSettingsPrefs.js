const STORAGE_KEY = 'bloodbound.editor.settings.v1';

/** Defaults match current OrbitControls / SceneView / PlayerController behavior. */
export const DEFAULT_EDITOR_SETTINGS = {
  /** 0 = snappy (no inertia); 100 = very floaty coast after orbit drag. */
  cameraOrbitFloatiness: 68,
  /** OrbitControls.rotateSpeed multiplier. */
  cameraOrbitSpeed: 1,
  /** OrbitControls.zoomSpeed multiplier. */
  cameraOrbitZoomSpeed: 1,
  /** OrbitControls.panSpeed multiplier. */
  cameraOrbitPanSpeed: 1,
  /** Multiplier on free-fly RMB look sensitivity. */
  cameraFlyLookSensitivity: 1,
  /** Free-fly move speed in editor units/sec (legacy default 450). */
  cameraFlySpeed: 450,
  /** Shift boost multiplier while free-flying. */
  cameraFlyBoost: 2.75,
  /** Invert vertical look for orbit, freelook, and play. */
  cameraInvertY: false,

  /** Play-mode mouse look multiplier (base 0.002). */
  playLookSensitivity: 1,

  /** Viewport / editor scene colors (CSS #rrggbb). */
  viewportBackground: '#0e1218',
  viewportGridMajor: '#4a5568',
  viewportGridMinor: '#2a3038',
  viewportSelection: '#ffcc33',
  viewportSubtract: '#c23b4a',
};

const SPEED_01_3 = { min: 0.25, max: 3 };
const FLY_SPEED = { min: 100, max: 1200 };
const FLY_BOOST = { min: 1, max: 5 };

export function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return `#${v.slice(1).toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

/** Parse #rrggbb to a Three.js-compatible integer. */
export function hexToColorInt(hex, fallback = 0xffffff) {
  const n = normalizeHexColor(hex, null);
  if (!n) return fallback;
  const parsed = Number.parseInt(n.slice(1), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampMul(value, fallback, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function clampEditorSettings(partial = {}) {
  const next = { ...DEFAULT_EDITOR_SETTINGS, ...partial };

  const floatiness = Number(next.cameraOrbitFloatiness);
  next.cameraOrbitFloatiness = Number.isFinite(floatiness)
    ? Math.min(100, Math.max(0, Math.round(floatiness)))
    : DEFAULT_EDITOR_SETTINGS.cameraOrbitFloatiness;

  next.cameraOrbitSpeed = clampMul(
    next.cameraOrbitSpeed,
    DEFAULT_EDITOR_SETTINGS.cameraOrbitSpeed,
    SPEED_01_3,
  );
  next.cameraOrbitZoomSpeed = clampMul(
    next.cameraOrbitZoomSpeed,
    DEFAULT_EDITOR_SETTINGS.cameraOrbitZoomSpeed,
    SPEED_01_3,
  );
  next.cameraOrbitPanSpeed = clampMul(
    next.cameraOrbitPanSpeed,
    DEFAULT_EDITOR_SETTINGS.cameraOrbitPanSpeed,
    SPEED_01_3,
  );
  next.cameraFlyLookSensitivity = clampMul(
    next.cameraFlyLookSensitivity,
    DEFAULT_EDITOR_SETTINGS.cameraFlyLookSensitivity,
    SPEED_01_3,
  );
  next.playLookSensitivity = clampMul(
    next.playLookSensitivity,
    DEFAULT_EDITOR_SETTINGS.playLookSensitivity,
    SPEED_01_3,
  );

  const flySpeed = Number(next.cameraFlySpeed);
  next.cameraFlySpeed = Number.isFinite(flySpeed)
    ? Math.min(FLY_SPEED.max, Math.max(FLY_SPEED.min, Math.round(flySpeed)))
    : DEFAULT_EDITOR_SETTINGS.cameraFlySpeed;

  next.cameraFlyBoost = clampMul(
    next.cameraFlyBoost,
    DEFAULT_EDITOR_SETTINGS.cameraFlyBoost,
    FLY_BOOST,
  );

  next.cameraInvertY = Boolean(next.cameraInvertY);

  next.viewportBackground = normalizeHexColor(
    next.viewportBackground,
    DEFAULT_EDITOR_SETTINGS.viewportBackground,
  );
  next.viewportGridMajor = normalizeHexColor(
    next.viewportGridMajor,
    DEFAULT_EDITOR_SETTINGS.viewportGridMajor,
  );
  next.viewportGridMinor = normalizeHexColor(
    next.viewportGridMinor,
    DEFAULT_EDITOR_SETTINGS.viewportGridMinor,
  );
  next.viewportSelection = normalizeHexColor(
    next.viewportSelection,
    DEFAULT_EDITOR_SETTINGS.viewportSelection,
  );
  next.viewportSubtract = normalizeHexColor(
    next.viewportSubtract,
    DEFAULT_EDITOR_SETTINGS.viewportSubtract,
  );

  return next;
}

/**
 * Map user-facing floatiness (0–100) to OrbitControls damping.
 * Higher floatiness → lower dampingFactor (more coast).
 */
export function orbitDampingFromFloatiness(floatiness) {
  const f = Math.min(100, Math.max(0, Number(floatiness) || 0));
  if (f <= 0) {
    return { enableDamping: false, dampingFactor: 0.05 };
  }
  const t = f / 100;
  const dampingFactor = 0.22 * (1 - t) + 0.015 * t;
  return { enableDamping: true, dampingFactor };
}

/** SceneView-friendly color ints from settings. */
export function viewportColorsFromSettings(settings) {
  const s = clampEditorSettings(settings || {});
  return {
    background: hexToColorInt(s.viewportBackground, 0x0e1218),
    gridMajor: hexToColorInt(s.viewportGridMajor, 0x4a5568),
    gridMinor: hexToColorInt(s.viewportGridMinor, 0x2a3038),
    selection: hexToColorInt(s.viewportSelection, 0xffcc33),
    subtract: hexToColorInt(s.viewportSubtract, 0xc23b4a),
  };
}

export function loadEditorSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_SETTINGS };
    return clampEditorSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

export function saveEditorSettings(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampEditorSettings(prefs)));
  } catch {
    /* ignore quota */
  }
}

export const EDITOR_SETTINGS_STORAGE_KEY = STORAGE_KEY;
