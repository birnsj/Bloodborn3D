/**
 * Normalized map-authored post-processing settings (level JSON).
 * Missing / null → disabled defaults so existing levels keep their look.
 */

import {
  EFFECT_DEFINITIONS,
  EFFECT_ORDER,
  createDefaultEffectState,
} from './effectRegistry.js';

export const POST_PROCESSING_VERSION = 1;

/** Matches SceneView renderer defaults when PP is off. */
export const DEFAULT_POST_PROCESSING_EXPOSURE = 0.95;

export const MULTISAMPLING_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 8, label: '8×' },
];

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeHex(color, fallback = '#ffffff') {
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return color.toLowerCase();
  }
  if (typeof color === 'number' && Number.isFinite(color)) {
    return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
  }
  return fallback;
}

function normalizeVec3(value, fallback) {
  const out = { ...fallback };
  if (!value || typeof value !== 'object') return out;
  for (const key of ['x', 'y', 'z']) {
    const n = Number(value[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function normalizeParamValue(param, raw, fallback) {
  if (param.type === 'boolean') return Boolean(raw);
  if (param.type === 'color') return normalizeHex(raw, fallback);
  if (param.type === 'enum') {
    const ok = param.options?.some((o) => o.value === raw);
    return ok ? raw : fallback;
  }
  if (param.type === 'number') {
    return clampNumber(raw, param.min ?? -Infinity, param.max ?? Infinity, fallback);
  }
  if (param.type === 'actorIds') {
    if (!Array.isArray(raw)) return [];
    return raw.map(String).filter(Boolean);
  }
  if (param.type === 'lightActorId' || param.type === 'textureAssetId') {
    if (raw == null || raw === '') return null;
    return String(raw);
  }
  if (param.type === 'vec3') {
    return normalizeVec3(raw, fallback || { x: 0, y: 0, z: 0 });
  }
  return raw ?? fallback;
}

function normalizeEffectState(id, value) {
  const def = EFFECT_DEFINITIONS[id];
  const base = createDefaultEffectState(id);
  if (!def || !base) return null;
  const src = value && typeof value === 'object' ? value : {};
  const out = { ...base };
  if (Object.prototype.hasOwnProperty.call(src, 'enabled')) {
    out.enabled = Boolean(src.enabled);
  }
  for (const param of def.params) {
    if (!Object.prototype.hasOwnProperty.call(src, param.key)) continue;
    out[param.key] = normalizeParamValue(param, src[param.key], base[param.key]);
  }
  return out;
}

/**
 * Full normalized PP settings. Always returns a complete object.
 * @param {unknown} value
 */
export function normalizePostProcessing(value) {
  const src = value && typeof value === 'object' ? value : {};
  const effects = {};
  for (const id of EFFECT_ORDER) {
    effects[id] = normalizeEffectState(id, src.effects?.[id]);
  }

  // FXAA / SMAA mutual exclusion — prefer SMAA if both somehow enabled.
  if (effects.fxaa.enabled && effects.smaa.enabled) {
    effects.fxaa.enabled = false;
  }

  const multisampling = [0, 2, 4, 8].includes(Number(src.multisampling))
    ? Number(src.multisampling)
    : 0;

  return {
    version: POST_PROCESSING_VERSION,
    enabled: Boolean(src.enabled),
    multisampling,
    exposure: clampNumber(
      src.exposure,
      0.05,
      8,
      DEFAULT_POST_PROCESSING_EXPOSURE,
    ),
    effects,
  };
}

export const DEFAULT_POST_PROCESSING = Object.freeze(
  normalizePostProcessing({ enabled: false }),
);

/**
 * Deep-merge a partial update into current settings, then normalize.
 * Handles exclusive AA toggles when enabling fxaa/smaa.
 */
export function mergePostProcessing(current, partial) {
  const base = normalizePostProcessing(current);
  if (!partial || typeof partial !== 'object') return base;

  const next = {
    ...base,
    ...partial,
    effects: { ...base.effects },
  };

  if (partial.effects && typeof partial.effects === 'object') {
    for (const [id, patch] of Object.entries(partial.effects)) {
      if (!EFFECT_DEFINITIONS[id]) continue;
      next.effects[id] = {
        ...base.effects[id],
        ...(patch && typeof patch === 'object' ? patch : {}),
      };
      if (patch?.enabled === true) {
        const exclusive = EFFECT_DEFINITIONS[id].exclusiveWith || [];
        for (const other of exclusive) {
          if (next.effects[other]) next.effects[other] = { ...next.effects[other], enabled: false };
        }
      }
    }
  }

  return normalizePostProcessing(next);
}

/** Reset one effect to catalog defaults (keeps global enabled/exposure). */
export function resetEffectInPostProcessing(current, effectId) {
  const base = normalizePostProcessing(current);
  if (!EFFECT_DEFINITIONS[effectId]) return base;
  return normalizePostProcessing({
    ...base,
    effects: {
      ...base.effects,
      [effectId]: createDefaultEffectState(effectId),
    },
  });
}

/** Reset all effects + globals to disabled defaults. */
export function resetAllPostProcessing() {
  return normalizePostProcessing({ enabled: false });
}

/**
 * Stable JSON for dirty fingerprinting (sorted keys via normalize).
 */
export function postProcessingToJSON(value) {
  return normalizePostProcessing(value);
}
