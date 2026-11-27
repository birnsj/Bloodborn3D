/**
 * Asset resolver for the standalone player.
 *
 * Same shape the editor's AssetBrowserContext hands to GameRuntime, but built from static files only
 * (`/assets/registry.json` and the asset paths inside it): no React, no dev file API, no editor code.
 * This is what lets a finished level run without the editor.
 */
import { findAsset, normalizeRegistry } from '../assets/AssetRegistry.js';
import { normalizeMaterialDefinition } from '../materials/MaterialDefinition.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { publicAssetUrl } from '../io/assetFileApi.js';

export async function defaultFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

function finiteVec3(v, { positive = false } = {}) {
  if (!v || typeof v !== 'object') return null;
  const x = Number(v.x);
  const y = Number(v.y);
  const z = Number(v.z);
  const ok = [x, y, z].every((n) => Number.isFinite(n) && (!positive || n > 0));
  return ok ? { x, y, z } : null;
}

/**
 * @param {{ fetchJson?: (url: string) => Promise<any>, registryUrl?: string }} [options]
 */
export async function createStaticAssetResolver({
  fetchJson = defaultFetchJson,
  registryUrl = '/assets/registry.json',
} = {}) {
  const registry = normalizeRegistry(await fetchJson(registryUrl));
  const materialCache = new Map();
  const prefabCache = new Map();

  const getTextureUrl = (id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'texture') return null;
    return publicAssetUrl(entry.path);
  };

  const getTextureAsset = (id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'texture') return null;
    const url = getTextureUrl(id);
    if (!url) return null;
    return {
      id: entry.id,
      url,
      path: entry.path,
      meta: entry.meta || {},
      format: entry.meta?.format || null,
      name: entry.name,
    };
  };

  const getMeshUrl = (id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'mesh') return null;
    return publicAssetUrl(entry.path);
  };

  const getMeshBoundsMeters = (id) =>
    finiteVec3(findAsset(registry, id)?.meta?.boundingBoxMeters, { positive: true });

  const getMeshBoundsCenterMeters = (id) =>
    finiteVec3(findAsset(registry, id)?.meta?.boundingBoxCenterMeters);

  async function loadJsonAsset(id, cache, normalize) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const entry = findAsset(registry, id);
    if (!entry?.path) return null;
    try {
      const def = normalize(await fetchJson(publicAssetUrl(entry.path)));
      // Only successes are cached, so a transient failure can be retried.
      if (def) cache.set(id, def);
      return def || null;
    } catch {
      return null;
    }
  }

  const getMaterialDefinition = (id) => loadJsonAsset(id, materialCache, normalizeMaterialDefinition);
  const getPrefabDefinition = (id) => loadJsonAsset(id, prefabCache, normalizePrefabDefinition);
  const getPrefabDefinitionSync = (id) => prefabCache.get(id) || null;

  // Prefab definitions are read synchronously during world sync, so load them up front.
  const prefabIds = (registry.assets || [])
    .filter((a) => a.kind === 'prefab')
    .map((a) => a.id);
  await Promise.all(prefabIds.map((id) => getPrefabDefinition(id)));

  return {
    registry,
    getTextureUrl,
    getTextureAsset,
    getMeshUrl,
    getMeshBoundsMeters,
    getMeshBoundsCenterMeters,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  };
}
