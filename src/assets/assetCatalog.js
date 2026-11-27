import { ASSET_FOLDERS } from '../data/sampleAssets.js';
import { ASSET_KINDS, findAsset, folderForKind, normalizeRegistry } from './AssetRegistry.js';
import { publicAssetUrl } from '../io/assetFileApi.js';

export { ASSET_FOLDERS };
export const ASSET_DRAG_MIME = 'application/x-bloodbound-asset';
/** Present in dataTransfer.types during dragover (getData is empty until drop). */
export const ASSET_DRAG_MIME_MATERIAL = 'application/x-bloodbound-asset-material';

/**
 * Convert a registry entry into Content Browser / Asset Viewer view model.
 */
export function toCatalogAsset(entry, materialDef = null) {
  if (!entry) return null;
  const type = entry.kind;
  const preview = buildPreview(entry, materialDef);
  return {
    id: entry.id,
    name: entry.name,
    type,
    kind: entry.kind,
    folder: entry.folder || folderForKind(entry.kind),
    path: entry.path,
    url: publicAssetUrl(entry.path),
    originalName: entry.originalName,
    tags: entry.tags || [],
    meta: {
      ...(entry.meta || {}),
      ...(materialDef
        ? {
            baseColor: materialDef.baseColor,
            roughness: materialDef.roughness,
            metalness: materialDef.metalness,
          }
        : {}),
    },
    preview,
    definition: materialDef || null,
  };
}

function buildPreview(entry, materialDef) {
  if (entry.kind === ASSET_KINDS.texture) {
    return {
      kind: 'image',
      url: publicAssetUrl(entry.path),
    };
  }
  if (entry.kind === ASSET_KINDS.material) {
    const previewPath = materialDef?.previewPath || entry.meta?.previewPath;
    if (previewPath) {
      const base = publicAssetUrl(previewPath);
      const v = Number(entry.updatedAt) || 0;
      const sep = base?.includes('?') ? '&' : '?';
      return {
        kind: 'image',
        url: base && v ? `${base}${sep}v=${v}` : base,
        color: materialDef?.baseColor || entry.meta?.baseColor || '#8a9099',
      };
    }
    return {
      kind: 'swatch',
      color: materialDef?.baseColor || entry.meta?.baseColor || '#8a9099',
      secondary: '#2a3038',
    };
  }
  if (entry.kind === ASSET_KINDS.mesh) {
    const previewPath = entry.meta?.previewPath;
    if (previewPath) {
      const base = publicAssetUrl(previewPath);
      const v = Number(entry.updatedAt) || 0;
      const sep = base?.includes('?') ? '&' : '?';
      return {
        kind: 'image',
        url: base && v ? `${base}${sep}v=${v}` : base,
        note: 'glTF / GLB model',
      };
    }
    return {
      kind: 'mesh',
      url: publicAssetUrl(entry.path),
      note: 'glTF / GLB model',
    };
  }
  if (entry.kind === ASSET_KINDS.prefab) {
    return {
      kind: 'badge',
      note: entry.meta?.actorCount != null
        ? `Prefab · ${entry.meta.actorCount} actors`
        : 'Prefab',
    };
  }
  return { kind: 'badge', note: entry.kind };
}

export function listCatalogAssets(registry, { folder, query, materialDefs = {} } = {}) {
  const reg = normalizeRegistry(registry);
  const q = String(query || '').trim().toLowerCase();
  return reg.assets
    .map((entry) => toCatalogAsset(entry, materialDefs[entry.id] || null))
    .filter((asset) => {
      if (folder && asset.folder !== folder) return false;
      if (!q) return true;
      return (
        asset.name.toLowerCase().includes(q)
        || asset.id.toLowerCase().includes(q)
        || asset.type.toLowerCase().includes(q)
        || (asset.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
}

export function getCatalogAsset(registry, id, materialDefs = {}) {
  const entry = findAsset(normalizeRegistry(registry), id);
  if (!entry) return null;
  return toCatalogAsset(entry, materialDefs[id] || null);
}

/**
 * Validate imported mesh scale assumptions.
 * glTF is meters; editor uses 100 units/meter. No arbitrary rescale.
 */
export function validateMeshScale(meta = {}) {
  const warnings = [];
  const unit = meta.unitAssumption || 'meters';
  if (unit !== 'meters') {
    warnings.push(`Unexpected unit assumption "${unit}"; expected meters.`);
  }
  if (meta.editorUnitsPerMeter && meta.editorUnitsPerMeter !== 100) {
    warnings.push(`editorUnitsPerMeter is ${meta.editorUnitsPerMeter}; BloodBound uses 100.`);
  }
  const size = meta.boundingBoxMeters;
  if (size) {
    const maxDim = Math.max(size.x || 0, size.y || 0, size.z || 0);
    if (maxDim > 50) {
      warnings.push(`Model bounding box is very large (${maxDim.toFixed(1)} m). Check export units.`);
    }
    if (maxDim > 0 && maxDim < 0.01) {
      warnings.push(`Model bounding box is very small (${maxDim.toFixed(4)} m). Check export units.`);
    }
  }
  return {
    ok: warnings.length === 0,
    warnings,
    editorUnitsPerMeter: 100,
    threeUnits: 'meters',
  };
}

export function metersToEditorSize(metersVec) {
  return {
    x: (metersVec?.x || 0) * 100,
    y: (metersVec?.y || 0) * 100,
    z: (metersVec?.z || 0) * 100,
  };
}
