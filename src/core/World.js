/**
 * Engine-neutral world: collection of actors and play/edit mode flag.
 * No Three.js or React dependencies.
 */

import {
  normalizePostProcessing,
  DEFAULT_POST_PROCESSING,
} from '../runtime/postprocessing/postProcessingState.js';

/** @typedef {'additive' | 'subtractive'} MapMode */

export { normalizePostProcessing, DEFAULT_POST_PROCESSING };

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
 * Level-authored Three.js Scene look (background + fog).
 * Defaults match SceneView hardcodes so missing fields keep the current look.
 */
export const DEFAULT_WORLD_SCENE = Object.freeze({
  background: '#0e1218',
  backgroundIntensity: 1,
  backgroundBlurriness: 0,
  fog: Object.freeze({
    type: 'none',
    color: '#0e1218',
    near: 10,
    far: 100,
    density: 0.02,
  }),
});

export const WORLD_FOG_TYPES = Object.freeze(['none', 'linear', 'exp2']);

export function normalizeWorldFog(value) {
  const d = DEFAULT_WORLD_SCENE.fog;
  const out = {
    type: d.type,
    color: d.color,
    near: d.near,
    far: d.far,
    density: d.density,
  };
  if (!value || typeof value !== 'object') return out;
  if (WORLD_FOG_TYPES.includes(value.type)) out.type = value.type;
  out.color = normalizeHexColor(value.color, out.color);
  out.near = clampNonNeg(value.near, out.near);
  out.far = clampNonNeg(value.far, out.far);
  if (out.far < out.near) out.far = out.near;
  out.density = clampNonNeg(value.density, out.density);
  return out;
}

export function normalizeWorldScene(value) {
  const out = {
    background: DEFAULT_WORLD_SCENE.background,
    backgroundIntensity: DEFAULT_WORLD_SCENE.backgroundIntensity,
    backgroundBlurriness: DEFAULT_WORLD_SCENE.backgroundBlurriness,
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
  out.fog = normalizeWorldFog(value.fog);
  return out;
}

/**
 * Level-authored WebGLRenderer look (tone mapping + shadows).
 * Tone mapping applies when post-processing is off; PP owns exposure/mode when active.
 */
export const DEFAULT_WORLD_RENDERER = Object.freeze({
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 0.95,
  shadowMapEnabled: true,
  shadowMapType: 'PCFSoft',
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

export const WORLD_SHADOW_MAP_TYPES = Object.freeze([
  'Basic',
  'PCF',
  'PCFSoft',
  'VSM',
]);

export function normalizeWorldRenderer(value) {
  const out = {
    toneMapping: DEFAULT_WORLD_RENDERER.toneMapping,
    toneMappingExposure: DEFAULT_WORLD_RENDERER.toneMappingExposure,
    shadowMapEnabled: DEFAULT_WORLD_RENDERER.shadowMapEnabled,
    shadowMapType: DEFAULT_WORLD_RENDERER.shadowMapType,
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
  if (WORLD_SHADOW_MAP_TYPES.includes(value.shadowMapType)) {
    out.shadowMapType = value.shadowMapType;
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
    for (const actor of [...this.actors]) {
      this.removeActor(actor);
    }
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
      actors: this.actors.map((a) => a.toJSON()),
    };
  }
}
