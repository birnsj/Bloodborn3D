/**
 * Persistent project asset registry (engine-neutral).
 * IDs are stable; file paths are storage details.
 */

export const ASSET_REGISTRY_SCHEMA_VERSION = 1;

export const ASSET_KINDS = {
  texture: 'texture',
  mesh: 'mesh',
  material: 'material',
  prefab: 'prefab',
};

export function createEmptyRegistry() {
  return {
    schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
    assets: [],
  };
}

export function normalizeRegistry(raw) {
  const empty = createEmptyRegistry();
  if (!raw || typeof raw !== 'object') return empty;
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map(normalizeAssetEntry).filter(Boolean)
    : [];
  return {
    schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
    assets,
  };
}

export function normalizeAssetEntry(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.kind) return null;
  return {
    id: String(raw.id),
    kind: String(raw.kind),
    name: String(raw.name || raw.id),
    folder: String(raw.folder || folderForKind(raw.kind)),
    /** Relative URL under /assets/… */
    path: String(raw.path || ''),
    /** Original filename preserved on import */
    originalName: String(raw.originalName || raw.name || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function folderForKind(kind) {
  switch (kind) {
    case ASSET_KINDS.texture: return 'Textures';
    case ASSET_KINDS.mesh: return 'Meshes';
    case ASSET_KINDS.material: return 'Materials';
    case ASSET_KINDS.prefab: return 'Prefabs';
    default: return 'Misc';
  }
}

/** True when a texture asset is an HDR/EXR environment map. */
export function isEnvironmentMapAsset(entry) {
  if (!entry || entry.kind !== ASSET_KINDS.texture) return false;
  const format = String(entry.meta?.format || '').toLowerCase();
  if (format === 'hdr' || format === 'exr') return true;
  if (entry.meta?.environmentMap) return true;
  const path = String(entry.path || entry.originalName || '').toLowerCase();
  return path.endsWith('.hdr') || path.endsWith('.exr');
}

export function listByKind(registry, kind) {
  return (registry?.assets || []).filter((a) => a.kind === kind);
}

export function findAsset(registry, id) {
  return (registry?.assets || []).find((a) => a.id === id) || null;
}
