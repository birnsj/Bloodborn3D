/**
 * Defaults and normalization for local PBR map generation from base-color images.
 * Parameters are artistic approximations — not measured material properties.
 */

export const DEFAULT_NORMAL_PARAMS = Object.freeze({
  /** Overall height → normal strength. */
  strength: 1.75,
  /** High-frequency detail contribution (0–1). */
  fineDetail: 0.7,
  /** Low-frequency / large relief contribution (0–1). */
  largeScale: 0.75,
  /** Pre-blur amount on the height field (0–1). */
  smoothing: 0.28,
  /** Treat dark pixels as high (instead of light = high). */
  invertHeight: false,
  /** Flip green channel for DirectX-style normals (Three.js uses OpenGL / +Y). */
  invertY: false,
});

export const DEFAULT_ROUGHNESS_PARAMS = Object.freeze({
  /** 'derived' from base color, or 'uniform' constant. */
  mode: 'derived',
  /** Bias for derived roughness (0–1). */
  overall: 0.55,
  /** Contrast around mid-gray before remapping. */
  contrast: 1.15,
  /** How strongly image luminance drives roughness (0–1). */
  detail: 0.65,
  invert: false,
  min: 0.08,
  max: 0.92,
  /** Used when mode === 'uniform'. Absolute roughness written into the map. */
  uniformValue: 0.72,
});

export const DEFAULT_TILING = Object.freeze({
  tileHorizontal: true,
  tileVertical: false,
});

/**
 * @param {object} [raw]
 * @returns {typeof DEFAULT_NORMAL_PARAMS}
 */
export function normalizeNormalParams(raw = {}) {
  return {
    strength: clamp(Number(raw.strength), 0, 6, DEFAULT_NORMAL_PARAMS.strength),
    fineDetail: clamp(Number(raw.fineDetail), 0, 1, DEFAULT_NORMAL_PARAMS.fineDetail),
    largeScale: clamp(Number(raw.largeScale), 0, 1, DEFAULT_NORMAL_PARAMS.largeScale),
    smoothing: clamp(Number(raw.smoothing), 0, 1, DEFAULT_NORMAL_PARAMS.smoothing),
    invertHeight: Boolean(raw.invertHeight),
    invertY: Boolean(raw.invertY),
  };
}

/**
 * @param {object} [raw]
 * @returns {typeof DEFAULT_ROUGHNESS_PARAMS}
 */
export function normalizeRoughnessParams(raw = {}) {
  const mode = raw.mode === 'uniform' ? 'uniform' : 'derived';
  let min = clamp(Number(raw.min), 0, 1, DEFAULT_ROUGHNESS_PARAMS.min);
  let max = clamp(Number(raw.max), 0, 1, DEFAULT_ROUGHNESS_PARAMS.max);
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  return {
    mode,
    overall: clamp(Number(raw.overall), 0, 1, DEFAULT_ROUGHNESS_PARAMS.overall),
    contrast: clamp(Number(raw.contrast), 0.1, 4, DEFAULT_ROUGHNESS_PARAMS.contrast),
    detail: clamp(Number(raw.detail), 0, 1, DEFAULT_ROUGHNESS_PARAMS.detail),
    invert: Boolean(raw.invert),
    min,
    max,
    uniformValue: clamp(Number(raw.uniformValue), 0, 1, DEFAULT_ROUGHNESS_PARAMS.uniformValue),
  };
}

export function normalizeTiling(raw = {}) {
  return {
    tileHorizontal: raw.tileHorizontal !== false,
    tileVertical: Boolean(raw.tileVertical),
  };
}

/** Persisted on the material definition (authoring metadata). */
export function normalizePbrGeneratorMeta(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    sourceTextureId: raw.sourceTextureId ? String(raw.sourceTextureId) : null,
    tileHorizontal: Boolean(raw.tileHorizontal),
    tileVertical: Boolean(raw.tileVertical),
    normal: normalizeNormalParams(raw.normal),
    roughness: normalizeRoughnessParams(raw.roughness),
    generatedNormalMapId: raw.generatedNormalMapId ? String(raw.generatedNormalMapId) : null,
    generatedRoughnessMapId: raw.generatedRoughnessMapId
      ? String(raw.generatedRoughnessMapId)
      : null,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function createDefaultPbrSession({
  sourceTextureId = null,
  tileHorizontal = DEFAULT_TILING.tileHorizontal,
  tileVertical = DEFAULT_TILING.tileVertical,
  previous = null,
} = {}) {
  const prev = previous ? normalizePbrGeneratorMeta(previous) : null;
  return {
    sourceTextureId: sourceTextureId || prev?.sourceTextureId || null,
    tiling: normalizeTiling({
      tileHorizontal: prev ? prev.tileHorizontal : tileHorizontal,
      tileVertical: prev ? prev.tileVertical : tileVertical,
    }),
    normal: prev?.normal
      ? normalizeNormalParams(prev.normal)
      : { ...DEFAULT_NORMAL_PARAMS },
    roughness: prev?.roughness
      ? normalizeRoughnessParams(prev.roughness)
      : { ...DEFAULT_ROUGHNESS_PARAMS },
    generatedNormalMapId: prev?.generatedNormalMapId || null,
    generatedRoughnessMapId: prev?.generatedRoughnessMapId || null,
  };
}

function clamp(n, min, max, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
