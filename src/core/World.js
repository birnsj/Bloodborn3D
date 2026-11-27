/**
 * Engine-neutral world: collection of actors and play/edit mode flag.
 * No Three.js or React dependencies.
 */

import {
  normalizePostProcessing,
  DEFAULT_POST_PROCESSING,
} from './postprocessing/postProcessingState.js';
import { normalizeAuthoringLayersState } from './authoringLayers.js';

/** @typedef {'additive' | 'subtractive'} MapMode */

export { normalizePostProcessing, DEFAULT_POST_PROCESSING };
export { normalizeAuthoringLayersState };

export function normalizeMapMode(value) {
  return value === 'subtractive' ? 'subtractive' : 'additive';
}

/**
 * Built-in scene fill (SceneView AmbientLight + studio IBL intensity).
 * `intensity` matches the studio environmentIntensity the editor shipped with (0.12);
 * AmbientLight is derived as a smaller tint fill so the default look stays the same.
 */
export const DEFAULT_WORLD_AMBIENT = Object.freeze({
  color: '#3a4a68',
  intensity: 0.12,
  playIntensity: 0.12,
});

/** AmbientLight intensity scale relative to world ambient intensity (preserves old 0.05 @ 0.12 IBL). */
export const WORLD_AMBIENT_LIGHT_RATIO = 0.05 / 0.12;

/** Rec. 709 relative luminance for a #RRGGBB (or 0xRRGGBB) color. */
export function luminanceOfHex(color) {
  let hex = color;
  if (typeof hex === 'number' && Number.isFinite(hex)) {
    hex = `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
  }
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Effective scene-fill strength from world ambient.
 * Black color → 0 (no fill). Default color at default intensity → default intensity.
 */
export function worldAmbientFillStrength(ambient, { editMode = true } = {}) {
  const a = normalizeWorldAmbient(ambient);
  const level = editMode ? a.intensity : a.playIntensity;
  const lum = luminanceOfHex(a.color);
  const baseLum = luminanceOfHex(DEFAULT_WORLD_AMBIENT.color) || 1;
  return Math.max(0, level * (lum / baseLum));
}

export function normalizeWorldAmbient(value) {
  const out = {
    color: DEFAULT_WORLD_AMBIENT.color,
    intensity: DEFAULT_WORLD_AMBIENT.intensity,
    playIntensity: DEFAULT_WORLD_AMBIENT.playIntensity,
  };
  if (!value || typeof value !== 'object') return out;
  if (typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)) {
    out.color = value.color.toLowerCase();
  } else if (typeof value.color === 'number' && Number.isFinite(value.color)) {
    out.color = `#${(value.color >>> 0).toString(16).padStart(6, '0')}`;
  }
  const intensity = Number(value.intensity);
  if (Number.isFinite(intensity)) out.intensity = Math.max(0, intensity);
  const playIntensity = Number(value.playIntensity);
  if (Number.isFinite(playIntensity)) out.playIntensity = Math.max(0, playIntensity);
  return out;
}

/** Promote first-pass AmbientLight-scale defaults (0.05/0.02) to IBL-scale fill. */
export function migrateLegacyWorldAmbient(value) {
  const raw = value && typeof value === 'object' ? value : null;
  if (
    raw
    && Number(raw.intensity) === 0.05
    && Number(raw.playIntensity) === 0.02
    && (raw.color == null || String(raw.color).toLowerCase() === '#3a4a68')
  ) {
    return {
      color: DEFAULT_WORLD_AMBIENT.color,
      intensity: DEFAULT_WORLD_AMBIENT.intensity,
      playIntensity: DEFAULT_WORLD_AMBIENT.playIntensity,
    };
  }
  return normalizeWorldAmbient(value);
}

function normalizeHexColor(value, fallback) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
  }
  return fallback;
}

function clampNonNeg(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

/**
 * Level-authored Three.js Scene look (background + fog + environment).
 * Fog near/far are editor units (100 eu = 1 m); SceneView converts to meters.
 * Defaults are room-scale so Linear fog is visible indoors.
 * Missing env fields keep RoomEnvironment fallback (visually unchanged).
 */
export const DEFAULT_WORLD_SCENE = Object.freeze({
  background: '#0e1218',
  backgroundIntensity: 1,
  backgroundBlurriness: 0,
  /** color | environment | sky */
  backgroundType: 'color',
  /** Euler degrees applied to texture/env backgrounds. */
  backgroundRotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  /** HDR/EXR texture asset id; null → RoomEnvironment studio IBL. */
  environmentAssetId: null,
  /** First-class IBL gain when an authored env map is assigned. */
  environmentIntensity: 1,
  environmentRotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  lightProbeEnabled: false,
  lightProbeIntensity: 1,
  sky: Object.freeze({
    turbidity: 2,
    rayleigh: 1,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.8,
    elevation: 2,
    azimuth: 180,
    scale: 450000,
  }),
  groundedSkybox: Object.freeze({
    enabled: false,
    /** Meters (Three world units). */
    height: 15,
    radius: 100,
  }),
  fog: Object.freeze({
    type: 'none',
    color: '#6a7380',
    near: 100,
    far: 1500,
    density: 0.05,
    /** Slow multi-sine modulation of density / far — subtle drifting atmosphere. */
    drift: true,
    driftSpeed: 0.12,
    driftAmount: 0.22,
    /** Particle mist / noise sheets / volumetric volume (AtmosphereController). */
    mist: false,
    mistCount: 400,
    mistSpeed: 0.15,
    mistOpacity: 0.35,
    mistSize: 0.6,
    noise: false,
    noiseStrength: 0.35,
    noiseScale: 0.45,
    noiseSpeed: 0.08,
    volumetric: false,
    volumetricDensity: 0.35,
    volumetricExtent: 12,
    volumetricSteps: 12,
  }),
});

export const WORLD_FOG_TYPES = Object.freeze(['none', 'linear', 'exp2']);
export const WORLD_FOG_VOLUMETRIC_STEPS = Object.freeze([8, 12, 16]);
export const WORLD_BACKGROUND_TYPES = Object.freeze(['color', 'environment', 'sky']);

/** First-pass fog used meter distances (near 10 / far 100); promote to editor units. */
export function migrateLegacyWorldFog(value) {
  const raw = value && typeof value === 'object' ? value : null;
  if (
    raw
    && Number(raw.near) === 10
    && Number(raw.far) === 100
  ) {
    return normalizeWorldFog({
      ...raw,
      near: DEFAULT_WORLD_SCENE.fog.near,
      far: DEFAULT_WORLD_SCENE.fog.far,
      color: raw.color === '#0e1218' ? DEFAULT_WORLD_SCENE.fog.color : raw.color,
      density: Number(raw.density) === 0.02
        ? DEFAULT_WORLD_SCENE.fog.density
        : raw.density,
    });
  }
  return normalizeWorldFog(value);
}

function clampRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeWorldFog(value) {
  const d = DEFAULT_WORLD_SCENE.fog;
  const out = {
    type: d.type,
    color: d.color,
    near: d.near,
    far: d.far,
    density: d.density,
    drift: d.drift,
    driftSpeed: d.driftSpeed,
    driftAmount: d.driftAmount,
    mist: d.mist,
    mistCount: d.mistCount,
    mistSpeed: d.mistSpeed,
    mistOpacity: d.mistOpacity,
    mistSize: d.mistSize,
    noise: d.noise,
    noiseStrength: d.noiseStrength,
    noiseScale: d.noiseScale,
    noiseSpeed: d.noiseSpeed,
    volumetric: d.volumetric,
    volumetricDensity: d.volumetricDensity,
    volumetricExtent: d.volumetricExtent,
    volumetricSteps: d.volumetricSteps,
  };
  if (!value || typeof value !== 'object') return out;
  if (WORLD_FOG_TYPES.includes(value.type)) out.type = value.type;
  out.color = normalizeHexColor(value.color, out.color);
  out.near = clampNonNeg(value.near, out.near);
  out.far = clampNonNeg(value.far, out.far);
  if (out.far < out.near) out.far = out.near;
  out.density = clampNonNeg(value.density, out.density);
  if (typeof value.drift === 'boolean') out.drift = value.drift;
  out.driftSpeed = clampRange(value.driftSpeed, 0, 2, out.driftSpeed);
  out.driftAmount = clampRange(value.driftAmount, 0, 1, out.driftAmount);

  if (typeof value.mist === 'boolean') out.mist = value.mist;
  out.mistCount = Math.round(clampRange(value.mistCount, 0, 4000, out.mistCount));
  out.mistSpeed = clampRange(value.mistSpeed, 0, 2, out.mistSpeed);
  out.mistOpacity = clampRange(value.mistOpacity, 0, 1, out.mistOpacity);
  out.mistSize = clampRange(value.mistSize, 0.05, 4, out.mistSize);

  if (typeof value.noise === 'boolean') out.noise = value.noise;
  out.noiseStrength = clampRange(value.noiseStrength, 0, 1, out.noiseStrength);
  out.noiseScale = clampRange(value.noiseScale, 0.05, 4, out.noiseScale);
  out.noiseSpeed = clampRange(value.noiseSpeed, 0, 2, out.noiseSpeed);

  if (typeof value.volumetric === 'boolean') out.volumetric = value.volumetric;
  out.volumetricDensity = clampRange(value.volumetricDensity, 0, 2, out.volumetricDensity);
  out.volumetricExtent = clampRange(value.volumetricExtent, 1, 80, out.volumetricExtent);
  const steps = Math.round(Number(value.volumetricSteps));
  if (WORLD_FOG_VOLUMETRIC_STEPS.includes(steps)) out.volumetricSteps = steps;

  return out;
}

/**
 * Multi-sine drift factor for subtle atmosphere (≈1 ± amount).
 * @param {number} timeSec
 * @param {{ drift?: boolean, driftSpeed?: number, driftAmount?: number }} fog
 */
export function fogDriftFactor(timeSec, fog = {}) {
  if (!fog?.drift) return 1;
  const amount = Math.min(1, Math.max(0, Number(fog.driftAmount) || 0));
  if (amount <= 1e-6) return 1;
  const speed = Math.max(0, Number(fog.driftSpeed) || 0);
  const t = (Number(timeSec) || 0) * speed;
  // Incommensurate periods so the breathe doesn't loop obviously (starts at 1).
  const wave = Math.sin(t) * 0.62 + Math.sin(t * 0.41) * 0.38;
  return 1 + amount * wave;
}

function normalizeEulerDegrees(value, fallback) {
  const out = {
    x: fallback.x,
    y: fallback.y,
    z: fallback.z,
  };
  if (!value || typeof value !== 'object') return out;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (Number.isFinite(x)) out.x = x;
  if (Number.isFinite(y)) out.y = y;
  if (Number.isFinite(z)) out.z = z;
  return out;
}

export function normalizeWorldSky(value) {
  const d = DEFAULT_WORLD_SCENE.sky;
  const out = {
    turbidity: d.turbidity,
    rayleigh: d.rayleigh,
    mieCoefficient: d.mieCoefficient,
    mieDirectionalG: d.mieDirectionalG,
    elevation: d.elevation,
    azimuth: d.azimuth,
    scale: d.scale,
  };
  if (!value || typeof value !== 'object') return out;
  out.turbidity = clampRange(value.turbidity, 0, 20, out.turbidity);
  out.rayleigh = clampRange(value.rayleigh, 0, 4, out.rayleigh);
  out.mieCoefficient = clampRange(value.mieCoefficient, 0, 0.1, out.mieCoefficient);
  out.mieDirectionalG = clampRange(value.mieDirectionalG, 0, 1, out.mieDirectionalG);
  out.elevation = clampRange(value.elevation, -90, 90, out.elevation);
  out.azimuth = clampRange(value.azimuth, -360, 360, out.azimuth);
  out.scale = clampRange(value.scale, 10, 1e7, out.scale);
  return out;
}

export function normalizeWorldGroundedSkybox(value) {
  const d = DEFAULT_WORLD_SCENE.groundedSkybox;
  const out = {
    enabled: d.enabled,
    height: d.height,
    radius: d.radius,
  };
  if (!value || typeof value !== 'object') return out;
  if (typeof value.enabled === 'boolean') out.enabled = value.enabled;
  out.height = clampRange(value.height, 0.1, 500, out.height);
  out.radius = clampRange(value.radius, 1, 5000, out.radius);
  return out;
}

export function normalizeWorldScene(value) {
  const out = {
    background: DEFAULT_WORLD_SCENE.background,
    backgroundIntensity: DEFAULT_WORLD_SCENE.backgroundIntensity,
    backgroundBlurriness: DEFAULT_WORLD_SCENE.backgroundBlurriness,
    backgroundType: DEFAULT_WORLD_SCENE.backgroundType,
    backgroundRotation: { ...DEFAULT_WORLD_SCENE.backgroundRotation },
    environmentAssetId: DEFAULT_WORLD_SCENE.environmentAssetId,
    environmentIntensity: DEFAULT_WORLD_SCENE.environmentIntensity,
    environmentRotation: { ...DEFAULT_WORLD_SCENE.environmentRotation },
    lightProbeEnabled: DEFAULT_WORLD_SCENE.lightProbeEnabled,
    lightProbeIntensity: DEFAULT_WORLD_SCENE.lightProbeIntensity,
    sky: normalizeWorldSky(null),
    groundedSkybox: normalizeWorldGroundedSkybox(null),
    fog: normalizeWorldFog(null),
  };
  if (!value || typeof value !== 'object') return out;
  out.background = normalizeHexColor(value.background, out.background);
  const intensity = Number(value.backgroundIntensity);
  if (Number.isFinite(intensity)) out.backgroundIntensity = Math.max(0, intensity);
  const blurriness = Number(value.backgroundBlurriness);
  if (Number.isFinite(blurriness)) {
    out.backgroundBlurriness = Math.min(1, Math.max(0, blurriness));
  }
  if (WORLD_BACKGROUND_TYPES.includes(value.backgroundType)) {
    out.backgroundType = value.backgroundType;
  }
  out.backgroundRotation = normalizeEulerDegrees(
    value.backgroundRotation,
    out.backgroundRotation,
  );
  if (value.environmentAssetId == null || value.environmentAssetId === '') {
    out.environmentAssetId = null;
  } else {
    out.environmentAssetId = String(value.environmentAssetId);
  }
  const envIntensity = Number(value.environmentIntensity);
  if (Number.isFinite(envIntensity)) out.environmentIntensity = Math.max(0, envIntensity);
  out.environmentRotation = normalizeEulerDegrees(
    value.environmentRotation,
    out.environmentRotation,
  );
  if (typeof value.lightProbeEnabled === 'boolean') {
    out.lightProbeEnabled = value.lightProbeEnabled;
  }
  const probeIntensity = Number(value.lightProbeIntensity);
  if (Number.isFinite(probeIntensity)) {
    out.lightProbeIntensity = Math.max(0, probeIntensity);
  }
  out.sky = normalizeWorldSky(value.sky);
  out.groundedSkybox = normalizeWorldGroundedSkybox(value.groundedSkybox);
  out.fog = migrateLegacyWorldFog(value.fog);
  return out;
}

/**
 * Level-authored WebGLRenderer look (tone mapping + shadows + output color space).
 * Tone mapping applies when post-processing is off; PP owns exposure/mode when active.
 * PCFSoft is deprecated in Three r187 (behaves as PCF) — migrate on load.
 */
export const DEFAULT_WORLD_RENDERER = Object.freeze({
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 0.95,
  shadowMapEnabled: true,
  shadowMapType: 'PCF',
  outputColorSpace: 'srgb',
});

export const WORLD_TONE_MAPPINGS = Object.freeze([
  'None',
  'Linear',
  'Reinhard',
  'Cineon',
  'ACESFilmic',
  'AgX',
  'Neutral',
]);

/** Authored UI values (PCFSoft accepted on load → migrated to PCF). */
export const WORLD_SHADOW_MAP_TYPES = Object.freeze([
  'Basic',
  'PCF',
  'VSM',
]);

export const WORLD_OUTPUT_COLOR_SPACES = Object.freeze([
  'srgb',
  'srgb-linear',
]);

export function normalizeWorldRenderer(value) {
  const out = {
    toneMapping: DEFAULT_WORLD_RENDERER.toneMapping,
    toneMappingExposure: DEFAULT_WORLD_RENDERER.toneMappingExposure,
    shadowMapEnabled: DEFAULT_WORLD_RENDERER.shadowMapEnabled,
    shadowMapType: DEFAULT_WORLD_RENDERER.shadowMapType,
    outputColorSpace: DEFAULT_WORLD_RENDERER.outputColorSpace,
  };
  if (!value || typeof value !== 'object') return out;
  if (WORLD_TONE_MAPPINGS.includes(value.toneMapping)) {
    out.toneMapping = value.toneMapping;
  }
  const exposure = Number(value.toneMappingExposure);
  if (Number.isFinite(exposure)) out.toneMappingExposure = Math.max(0, exposure);
  if (typeof value.shadowMapEnabled === 'boolean') {
    out.shadowMapEnabled = value.shadowMapEnabled;
  }
  if (value.shadowMapType === 'PCFSoft') {
    // Three r186+ remaps Soft→PCF; keep levels silent and schema clean.
    out.shadowMapType = 'PCF';
  } else if (WORLD_SHADOW_MAP_TYPES.includes(value.shadowMapType)) {
    out.shadowMapType = value.shadowMapType;
  }
  if (WORLD_OUTPUT_COLOR_SPACES.includes(value.outputColorSpace)) {
    out.outputColorSpace = value.outputColorSpace;
  }
  return out;
}

export class World {
  constructor({
    name = 'Untitled Level',
    schemaVersion = 1,
    mapMode = 'additive',
    ambient = null,
    scene = null,
    renderer = null,
    postProcessing = null,
    authoringLayers = null,
  } = {}) {
    this.name = name;
    this.schemaVersion = schemaVersion;
    /** Additive = empty space + add brushes; subtractive = solid world + carve. */
    this.mapMode = normalizeMapMode(mapMode);
    /** Scene AmbientLight fill — not an actor light. */
    this.ambient = normalizeWorldAmbient(ambient);
    /** Level-authored Three.js Scene look (background, fog). */
    this.scene = normalizeWorldScene(scene);
    /** Level-authored WebGLRenderer look (tone mapping, shadows). */
    this.renderer = normalizeWorldRenderer(renderer);
    /** Map-authored post-processing (pmndrs effects). Missing → disabled defaults. */
    this.postProcessing = normalizePostProcessing(postProcessing);
    /** Batch 9 — hierarchical authoring layers (independent of parenting / THREE.Layers). */
    this.authoringLayers = normalizeAuthoringLayersState(authoringLayers, { seedIfEmpty: true });
    this.actors = [];
    this.mode = 'edit'; // 'edit' | 'play'
    this._byId = new Map();
  }

  /** Append an actor, or insert at `index` to restore a previous order (Undo). */
  addActor(actor, index = this.actors.length) {
    if (this._byId.has(actor.id)) {
      throw new Error(`Actor id already exists: ${actor.id}`);
    }
    actor.world = this;
    this.actors.splice(Math.min(Math.max(index, 0), this.actors.length), 0, actor);
    this._byId.set(actor.id, actor);
    return actor;
  }

  removeActor(actorOrId) {
    const id = typeof actorOrId === 'string' ? actorOrId : actorOrId.id;
    const actor = this._byId.get(id);
    if (!actor) return false;
    this.actors = this.actors.filter((a) => a.id !== id);
    this._byId.delete(id);
    actor.world = null;
    return true;
  }

  getActor(id) {
    return this._byId.get(id) || null;
  }

  findByName(name) {
    return this.actors.find((a) => a.name === name) || null;
  }

  clear() {
    // O(n): detach in one pass. removeActor() would re-filter actors[] each time (O(n²)).
    for (const actor of this.actors) {
      actor.world = null;
    }
    this.actors = [];
    this._byId.clear();
  }

  toJSON() {
    return {
      schemaVersion: this.schemaVersion,
      name: this.name,
      mapMode: normalizeMapMode(this.mapMode),
      ambient: normalizeWorldAmbient(this.ambient),
      scene: normalizeWorldScene(this.scene),
      renderer: normalizeWorldRenderer(this.renderer),
      postProcessing: normalizePostProcessing(this.postProcessing),
      authoringLayers: normalizeAuthoringLayersState(this.authoringLayers, { seedIfEmpty: true }),
      actors: this.actors.map((a) => a.toJSON()),
    };
  }
}
