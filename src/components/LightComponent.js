import { Component } from '../core/Component.js';

/**
 * Scene light. Position/rotation from owning Actor transform (editor units).
 * Intensity/range authored for Three.js adapters.
 *
 * Batch 3 adds hemisphere / rectArea types, shadow camera & bias, decay/power,
 * targetActorId, spot projection map, lensflare elements, and helper toggle.
 * Defaults match pre-Batch-3 hardcoded runtime values so legacy levels look the same.
 */

export const LIGHT_TYPES = Object.freeze([
  'point',
  'spot',
  'directional',
  'ambient',
  'hemisphere',
  'rectArea',
]);

export const LENSFLARE_PRESETS = Object.freeze({
  none: [],
  soft: [
    { textureAssetId: 'tex_flare_main', color: '#ffffff', size: 180, distance: 0 },
    { textureAssetId: 'tex_flare_hex', color: '#88aaff', size: 60, distance: 0.4 },
    { textureAssetId: 'tex_flare_ring', color: '#ffcc88', size: 90, distance: 0.7 },
  ],
  bright: [
    { textureAssetId: 'tex_flare_main', color: '#ffffff', size: 280, distance: 0 },
    { textureAssetId: 'tex_flare_hex', color: '#ffffff', size: 40, distance: 0.25 },
    { textureAssetId: 'tex_flare_hex', color: '#aaccff', size: 70, distance: 0.55 },
    { textureAssetId: 'tex_flare_ring', color: '#ffeeaa', size: 120, distance: 0.85 },
  ],
});

/** Defaults that preserve pre-Batch-3 Point/Spot/Directional appearance. */
export const LIGHT_SHADOW_DEFAULTS = Object.freeze({
  shadowBias: -0.0005,
  shadowNormalBias: 0.04,
  shadowRadius: 2,
  shadowBlurSamples: 8,
  shadowCameraNear: 0.5,
  shadowCameraFar: 80,
  shadowCameraSize: 20, // directional ortho ±extent (meters)
});

export function normalizeLightType(raw) {
  const v = String(raw || 'point');
  const found = LIGHT_TYPES.find((t) => t.toLowerCase() === v.toLowerCase());
  return found || 'point';
}

export function normalizeLensflareElements(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((el, i) => ({
    id: el?.id || `flare_${i}`,
    textureAssetId: el?.textureAssetId ? String(el.textureAssetId) : null,
    color: el?.color || '#ffffff',
    size: Number.isFinite(Number(el?.size)) ? Math.max(1, Number(el.size)) : 100,
    distance: clamp01(Number(el?.distance) || 0),
  })).filter((el) => el.textureAssetId);
}

export function createLensflareFromPreset(presetId = 'soft') {
  const list = LENSFLARE_PRESETS[presetId] || LENSFLARE_PRESETS.soft;
  return normalizeLensflareElements(list.map((el, i) => ({ ...el, id: `flare_${i}` })));
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function finiteOr(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export class LightComponent extends Component {
  constructor(partial = {}) {
    const {
      id,
      enabled,
    } = partial;
    super({ id, type: LightComponent.componentType, enabled });
    Object.assign(this, normalizeLightFields(partial));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      ...serializeLightFields(this),
    };
  }

  static fromJSON(data) {
    return new LightComponent(data || {});
  }
}

LightComponent.componentType = 'Light';

/** Normalize authorable light fields (additive; legacy JSON keeps prior look). */
export function normalizeLightFields(raw = {}) {
  const lightType = normalizeLightType(raw.lightType);
  const d = LIGHT_SHADOW_DEFAULTS;
  const supportsShadow = lightType === 'point' || lightType === 'spot' || lightType === 'directional';
  const supportsDecay = lightType === 'point' || lightType === 'spot';
  return {
    lightType,
    color: raw.color || '#ffffff',
    // Hemisphere sky uses `color`; ground is separate.
    groundColor: raw.groundColor || '#444444',
    intensity: finiteOr(raw.intensity, 1),
    range: finiteOr(raw.range, lightType === 'directional' || lightType === 'ambient' || lightType === 'hemisphere' ? 0 : 1000),
    // Point/Spot decay — Three default physical falloff used historically = 2.
    decay: supportsDecay ? finiteOr(raw.decay, 2) : finiteOr(raw.decay, 2),
    // Optional luminous power (lm). null = intensity is authoritative (legacy).
    power: raw.power == null || raw.power === '' ? null : Math.max(0, finiteOr(raw.power, 0)),
    castShadow: supportsShadow ? Boolean(raw.castShadow) : false,
    shadowMapSize: Math.max(256, Number(raw.shadowMapSize) || 1024),
    shadowBias: finiteOr(raw.shadowBias, d.shadowBias),
    shadowNormalBias: finiteOr(raw.shadowNormalBias, d.shadowNormalBias),
    shadowRadius: Math.max(0, finiteOr(raw.shadowRadius, d.shadowRadius)),
    shadowBlurSamples: Math.max(1, Math.round(finiteOr(raw.shadowBlurSamples, d.shadowBlurSamples))),
    shadowCameraNear: Math.max(0.01, finiteOr(raw.shadowCameraNear, supportsShadow && lightType !== 'directional' ? 0.2 : d.shadowCameraNear)),
    shadowCameraFar: Math.max(0.1, finiteOr(raw.shadowCameraFar, d.shadowCameraFar)),
    shadowCameraSize: Math.max(0.5, finiteOr(raw.shadowCameraSize, d.shadowCameraSize)),
    spotAngle: finiteOr(raw.spotAngle, 45),
    spotPenumbra: clamp01(finiteOr(raw.spotPenumbra, 0.25)),
    // Spot projection texture (asset id).
    spotMapId: raw.spotMapId || null,
    // Aim spot/directional at another actor; null = local -Y aim (legacy).
    targetActorId: raw.targetActorId || null,
    // RectArea size in editor units (100 eu = 1 m).
    width: Math.max(1, finiteOr(raw.width, 200)),
    height: Math.max(1, finiteOr(raw.height, 200)),
    // Lensflare (WebGL addon); empty = none.
    lensflareEnabled: Boolean(raw.lensflareEnabled),
    lensflarePreset: raw.lensflarePreset || 'soft',
    lensflareElements: normalizeLensflareElements(raw.lensflareElements),
    // Opt-in Three.js light helper overlay (in addition to pick gizmos).
    showHelper: Boolean(raw.showHelper),
  };
}

export function serializeLightFields(comp) {
  const n = normalizeLightFields(comp);
  return {
    lightType: n.lightType,
    color: n.color,
    groundColor: n.groundColor,
    intensity: n.intensity,
    range: n.range,
    decay: n.decay,
    power: n.power,
    castShadow: n.castShadow,
    shadowMapSize: n.shadowMapSize,
    shadowBias: n.shadowBias,
    shadowNormalBias: n.shadowNormalBias,
    shadowRadius: n.shadowRadius,
    shadowBlurSamples: n.shadowBlurSamples,
    shadowCameraNear: n.shadowCameraNear,
    shadowCameraFar: n.shadowCameraFar,
    shadowCameraSize: n.shadowCameraSize,
    spotAngle: n.spotAngle,
    spotPenumbra: n.spotPenumbra,
    spotMapId: n.spotMapId,
    targetActorId: n.targetActorId,
    width: n.width,
    height: n.height,
    lensflareEnabled: n.lensflareEnabled,
    lensflarePreset: n.lensflarePreset,
    lensflareElements: n.lensflareElements,
    showHelper: n.showHelper,
  };
}

/** Snapshot authorable fields for scrub undo (excludes id/type/enabled). */
export function lightAuthorableSnapshot(comp) {
  return serializeLightFields(comp);
}
