import {
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_INCREMENTS,
} from '../core/units.js';
import { normalizeDisplayMode } from './viewport/viewportPrefs.js';

const STORAGE_KEY = 'bloodbound.editor.settings.v1';
const USER_DEFAULTS_KEY = 'bloodbound.editor.settings.defaults.v1';
/** Bump to force one-shot migrations on existing installs. */
export const EDITOR_SETTINGS_SCHEMA = 5;

/** Allowed rotation snap steps (degrees) when grid snap is on. */
export const ROTATION_SNAP_INCREMENTS = [1, 5, 15, 30, 45, 90];
/** Allowed scale snap steps when grid snap is on. */
export const SCALE_SNAP_INCREMENTS = [0.05, 0.1, 0.25, 0.5, 1];

/** Factory defaults — snappy cameras (no orbit float). */
export const DEFAULT_EDITOR_SETTINGS = {
  settingsSchema: EDITOR_SETTINGS_SCHEMA,
  /** 0 = snappy (no inertia); 100 = very floaty coast after orbit drag. */
  cameraOrbitFloatiness: 0,
  /** OrbitControls.rotateSpeed multiplier. */
  cameraOrbitSpeed: 1,
  /** OrbitControls.zoomSpeed multiplier. */
  cameraOrbitZoomSpeed: 1,
  /** Middle-mouse pan (OrbitControls.panSpeed). Default is fast. */
  cameraOrbitPanSpeed: 2,
  /** Multiplier on free-fly mouse look sensitivity. */
  cameraFlyLookSensitivity: 1.5,
  /** Free-fly move speed in editor units/sec (legacy default 450). */
  cameraFlySpeed: 450,
  /** Shift boost multiplier while free-flying. */
  cameraFlyBoost: 2.75,
  /** Invert vertical look for orbit, freelook, and play. */
  cameraInvertY: false,

  /** Play-mode mouse look multiplier (base 0.002). */
  playLookSensitivity: 1,

  /** Construction grid size in editor units (toolbar + View menu). */
  gridSize: DEFAULT_GRID_EDITOR_UNITS,
  /** When true, placement/gizmo moves/rotates/scales snap. */
  gridSnap: true,
  /** Gizmo rotate snap step in degrees (when grid snap is on). Alt = free. */
  rotationSnapDegrees: 5,
  /** Gizmo scale snap step (when grid snap is on). Alt = free. */
  scaleSnapIncrement: 0.1,
  /** Default / applied viewport shading mode (lit, wireframe, …). */
  defaultDisplayMode: 'lit',

  /** Viewport / editor scene colors (CSS #rrggbb). */
  viewportBackground: '#0e1218',
  viewportGridMajor: '#4a5568',
  viewportGridMinor: '#2a3038',
  viewportSelection: '#ffcc33',
  viewportSubtract: '#c23b4a',

  /** Edit-mode subtract fill volume (edges always stay solid). */
  showSubtractVolumes: true,
  /** Translucent fill opacity when subtract volumes are shown (0–1). */
  subtractVolumeOpacity: 0.14,
  /** Edit-mode light gizmos/helpers (actual lights still illuminate). */
  showLightHelpers: true,
};

const SPEED_01_3 = { min: 0.25, max: 4 };
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

  const schema = Number(next.settingsSchema);
  next.settingsSchema = Number.isFinite(schema)
    ? Math.max(1, Math.floor(schema))
    : EDITOR_SETTINGS_SCHEMA;

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

  const grid = Number(next.gridSize);
  next.gridSize = GRID_INCREMENTS.includes(grid)
    ? grid
    : DEFAULT_EDITOR_SETTINGS.gridSize;
  next.gridSnap = next.gridSnap !== false;

  const rotSnap = Number(next.rotationSnapDegrees);
  next.rotationSnapDegrees = ROTATION_SNAP_INCREMENTS.includes(rotSnap)
    ? rotSnap
    : DEFAULT_EDITOR_SETTINGS.rotationSnapDegrees;

  const scaleSnap = Number(next.scaleSnapIncrement);
  next.scaleSnapIncrement = SCALE_SNAP_INCREMENTS.includes(scaleSnap)
    ? scaleSnap
    : DEFAULT_EDITOR_SETTINGS.scaleSnapIncrement;

  next.defaultDisplayMode = normalizeDisplayMode(next.defaultDisplayMode);

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

  next.showSubtractVolumes = next.showSubtractVolumes !== false;
  const subtractOpacity = Number(next.subtractVolumeOpacity);
  next.subtractVolumeOpacity = Number.isFinite(subtractOpacity)
    ? Math.min(1, Math.max(0, Math.round(subtractOpacity * 100) / 100))
    : DEFAULT_EDITOR_SETTINGS.subtractVolumeOpacity;
  next.showLightHelpers = next.showLightHelpers !== false;

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

/** User-saved defaults used by Reset / Save as Default (falls back to factory). */
export function loadUserDefaultSettings() {
  try {
    const raw = localStorage.getItem(USER_DEFAULTS_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_SETTINGS };
    return clampEditorSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

export function saveUserDefaultSettings(prefs) {
  try {
    const next = clampEditorSettings({
      ...prefs,
      settingsSchema: EDITOR_SETTINGS_SCHEMA,
    });
    localStorage.setItem(USER_DEFAULTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return clampEditorSettings(prefs);
  }
}

export function loadEditorSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...loadUserDefaultSettings() };
    const parsed = JSON.parse(raw);
    const loaded = clampEditorSettings(parsed);
    if (loaded.settingsSchema < EDITOR_SETTINGS_SCHEMA) {
      const prevSchema = Number(parsed.settingsSchema) || 1;
      const migrated = clampEditorSettings({
        ...loaded,
        // Schema 2: snappy cameras — clear leftover floatiness.
        cameraOrbitFloatiness: 0,
        // Schema 3: faster middle-mouse pan + fly look (only if still at old factory 1).
        cameraOrbitPanSpeed:
          prevSchema < 3 && Number(parsed.cameraOrbitPanSpeed) === 1
            ? DEFAULT_EDITOR_SETTINGS.cameraOrbitPanSpeed
            : loaded.cameraOrbitPanSpeed,
        cameraFlyLookSensitivity:
          prevSchema < 3 && Number(parsed.cameraFlyLookSensitivity) === 1
            ? DEFAULT_EDITOR_SETTINGS.cameraFlyLookSensitivity
            : loaded.cameraFlyLookSensitivity,
        settingsSchema: EDITOR_SETTINGS_SCHEMA,
      });
      saveEditorSettings(migrated);
      return migrated;
    }
    return loaded;
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
export const EDITOR_SETTINGS_DEFAULTS_KEY = USER_DEFAULTS_KEY;
