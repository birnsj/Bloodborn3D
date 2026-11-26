import { createId } from '../core/ids.js';

/**
 * Engine-neutral PBR material definition.
 * Three.js adapters resolve textures / MeshStandardMaterial at the boundary.
 */
export const MATERIAL_SCHEMA_VERSION = 1;

export const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

export function createMaterialDefinition(partial = {}) {
  const now = Date.now();
  return {
    schemaVersion: MATERIAL_SCHEMA_VERSION,
    id: partial.id || createId('mat'),
    name: partial.name || 'New Material',
    type: 'material',
    baseColor: partial.baseColor || '#8a9099',
    baseColorMapId: partial.baseColorMapId || null,
    normalMapId: partial.normalMapId || null,
    normalScale: Number.isFinite(Number(partial.normalScale))
      ? Math.max(0, Number(partial.normalScale))
      : 1,
    roughness: clamp01(partial.roughness ?? 0.75),
    metalness: clamp01(partial.metalness ?? 0.05),
    roughnessMapId: partial.roughnessMapId || null,
    metalnessMapId: partial.metalnessMapId || null,
    envMapIntensity: Number.isFinite(Number(partial.envMapIntensity))
      ? Math.max(0, Number(partial.envMapIntensity))
      : 1,
    emissive: partial.emissive || '#000000',
    emissiveIntensity: Number(partial.emissiveIntensity) || 0,
    emissiveMapId: partial.emissiveMapId || null,
    opacity: clamp01(partial.opacity ?? 1),
    transparent: Boolean(partial.transparent) || (partial.opacity != null && partial.opacity < 1),
    // Asset-level UV (Layer 2). Applied via texture.repeat/offset/rotation in materialFactory.
    // Does not replace actor/geometry UV (Layer 1). Defaults are identity.
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
    /** Local PBR generator authoring state (params + generated map ids). */
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

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
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
