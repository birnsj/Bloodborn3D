import { createId } from '../core/ids.js';

/**
 * Engine-neutral material definition (schema v1, additive fields).
 * Three.js adapters select MeshStandard / Physical / Basic / Toon / Matcap at the boundary.
 */
export const MATERIAL_SCHEMA_VERSION = 1;

export const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

/** @typedef {'standard'|'physical'|'basic'|'toon'|'matcap'} MaterialShadingModel */

export const MATERIAL_SHADING_MODELS = Object.freeze([
  'standard',
  'physical',
  'basic',
  'toon',
  'matcap',
]);

export const MATERIAL_SIDES = Object.freeze(['front', 'back', 'double']);

export function createMaterialDefinition(partial = {}) {
  const now = Date.now();
  const shadingModel = normalizeShadingModel(partial.shadingModel);
  const opacity = clamp01(partial.opacity ?? 1);
  return {
    schemaVersion: MATERIAL_SCHEMA_VERSION,
    id: partial.id || createId('mat'),
    name: partial.name || 'New Material',
    type: 'material',
    shadingModel,

    // —— Base / albedo ——
    baseColor: partial.baseColor || '#8a9099',
    baseColorMapId: partial.baseColorMapId || null,

    // —— Standard / Physical surface ——
    normalMapId: partial.normalMapId || null,
    normalScale: nonNeg(partial.normalScale, 1),
    roughness: clamp01(partial.roughness ?? 0.75),
    metalness: clamp01(partial.metalness ?? 0.05),
    roughnessMapId: partial.roughnessMapId || null,
    metalnessMapId: partial.metalnessMapId || null,
    envMapIntensity: nonNeg(partial.envMapIntensity, 1),

    // —— Extra Standard maps ——
    aoMapId: partial.aoMapId || null,
    aoMapIntensity: nonNeg(partial.aoMapIntensity, 1),
    bumpMapId: partial.bumpMapId || null,
    bumpScale: finiteOr(partial.bumpScale, 1),
    displacementMapId: partial.displacementMapId || null,
    displacementScale: finiteOr(partial.displacementScale, 1),
    displacementBias: finiteOr(partial.displacementBias, 0),
    alphaMapId: partial.alphaMapId || null,
    lightMapId: partial.lightMapId || null,
    lightMapIntensity: nonNeg(partial.lightMapIntensity, 1),

    // —— Emissive ——
    emissive: partial.emissive || '#000000',
    emissiveIntensity: Number(partial.emissiveIntensity) || 0,
    emissiveMapId: partial.emissiveMapId || null,

    // —— Transparency / coverage ——
    opacity,
    transparent: Boolean(partial.transparent) || opacity < 1,
    alphaTest: clamp01(partial.alphaTest ?? 0),
    alphaHash: Boolean(partial.alphaHash),
    alphaToCoverage: Boolean(partial.alphaToCoverage),

    // —— Common Material flags ——
    side: normalizeSide(partial.side),
    depthWrite: partial.depthWrite !== false,
    wireframe: Boolean(partial.wireframe),
    flatShading: Boolean(partial.flatShading),
    fog: partial.fog !== false,
    toneMapped: partial.toneMapped !== false,

    // —— Physical ——
    clearcoat: clamp01(partial.clearcoat ?? 0),
    clearcoatRoughness: clamp01(partial.clearcoatRoughness ?? 0),
    clearcoatMapId: partial.clearcoatMapId || null,
    clearcoatNormalMapId: partial.clearcoatNormalMapId || null,
    clearcoatNormalScale: nonNeg(partial.clearcoatNormalScale, 1),
    clearcoatRoughnessMapId: partial.clearcoatRoughnessMapId || null,
    transmission: clamp01(partial.transmission ?? 0),
    transmissionMapId: partial.transmissionMapId || null,
    thickness: nonNeg(partial.thickness, 0),
    thicknessMapId: partial.thicknessMapId || null,
    // Infinity does not survive JSON — null / ≤0 / missing means “no attenuation”.
    attenuationDistance: normalizeAttenuationDistance(partial.attenuationDistance),
    attenuationColor: partial.attenuationColor || '#ffffff',
    ior: clamp(finiteOr(partial.ior, 1.5), 1, 2.333),
    sheen: clamp01(partial.sheen ?? 0),
    sheenRoughness: clamp01(partial.sheenRoughness ?? 1),
    sheenColor: partial.sheenColor || '#000000',
    sheenColorMapId: partial.sheenColorMapId || null,
    sheenRoughnessMapId: partial.sheenRoughnessMapId || null,
    specularIntensity: nonNeg(partial.specularIntensity, 1),
    specularColor: partial.specularColor || '#ffffff',
    specularIntensityMapId: partial.specularIntensityMapId || null,
    specularColorMapId: partial.specularColorMapId || null,
    iridescence: clamp01(partial.iridescence ?? 0),
    iridescenceIOR: clamp(finiteOr(partial.iridescenceIOR, 1.3), 1, 2.333),
    iridescenceThicknessMin: nonNeg(partial.iridescenceThicknessMin, 100),
    iridescenceThicknessMax: nonNeg(partial.iridescenceThicknessMax, 400),
    iridescenceMapId: partial.iridescenceMapId || null,
    iridescenceThicknessMapId: partial.iridescenceThicknessMapId || null,
    anisotropy: clamp(finiteOr(partial.anisotropy, 0), -1, 1),
    anisotropyRotation: finiteOr(partial.anisotropyRotation, 0),
    anisotropyMapId: partial.anisotropyMapId || null,
    dispersion: nonNeg(partial.dispersion, 0),

    // —— Basic / Toon / Matcap ——
    matcapMapId: partial.matcapMapId || null,
    gradientMapId: partial.gradientMapId || null,
    reflectivity: clamp01(partial.reflectivity ?? 1),

    // —— UV Layer 2 ——
    uvScale: {
      x: Number(partial.uvScale?.x) || 1,
      y: Number(partial.uvScale?.y) || 1,
    },
    uvOffset: {
      x: Number(partial.uvOffset?.x) || 0,
      y: Number(partial.uvOffset?.y) || 0,
    },
    uvRotation: Number(partial.uvRotation) || 0,

    previewPath: partial.previewPath || null,
    pbrGenerator: normalizePbrGeneratorField(partial.pbrGenerator),
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  };
}

function normalizePbrGeneratorField(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    sourceTextureId: raw.sourceTextureId ? String(raw.sourceTextureId) : null,
    tileHorizontal: Boolean(raw.tileHorizontal),
    tileVertical: Boolean(raw.tileVertical),
    normal: raw.normal && typeof raw.normal === 'object' ? { ...raw.normal } : null,
    roughness: raw.roughness && typeof raw.roughness === 'object' ? { ...raw.roughness } : null,
    generatedNormalMapId: raw.generatedNormalMapId ? String(raw.generatedNormalMapId) : null,
    generatedRoughnessMapId: raw.generatedRoughnessMapId
      ? String(raw.generatedRoughnessMapId)
      : null,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function normalizeMaterialDefinition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return createMaterialDefinition(raw);
}

export function normalizeShadingModel(raw) {
  const v = String(raw || 'standard').toLowerCase();
  return MATERIAL_SHADING_MODELS.includes(v) ? v : 'standard';
}

export function normalizeSide(raw) {
  const v = String(raw || 'front').toLowerCase();
  return MATERIAL_SIDES.includes(v) ? v : 'front';
}

/** Authorable keys used for draft dirty fingerprints (excludes timestamps / preview). */
export function materialAuthorableKeys() {
  const sample = createMaterialDefinition({ id: 'tmp' });
  return Object.keys(sample).filter((k) => (
    k !== 'id'
    && k !== 'createdAt'
    && k !== 'updatedAt'
    && k !== 'previewPath'
    && k !== 'schemaVersion'
    && k !== 'type'
  ));
}

function clamp01(n) {
  return clamp(Number(n), 0, 1);
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function nonNeg(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, v);
}

function finiteOr(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Physical attenuation distance; Infinity means disabled (JSON-safe as null). */
export function normalizeAttenuationDistance(raw) {
  if (raw == null || raw === '' || raw === Infinity) return Infinity;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return Infinity;
  return v;
}

/** JSON-safe attenuation distance (Infinity → null). */
export function serializeAttenuationDistance(value) {
  if (value == null || value === Infinity) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/** Actor-level UV (Layer 1) for structural components — see runtime/uvMapping.js. */
export function createBrushUvState(partial = {}) {
  return {
    scale: {
      x: Number(partial.scale?.x) || 1,
      y: Number(partial.scale?.y) || 1,
    },
    offset: {
      x: Number(partial.offset?.x) || 0,
      y: Number(partial.offset?.y) || 0,
    },
    rotation: Number(partial.rotation) || 0,
  };
}
