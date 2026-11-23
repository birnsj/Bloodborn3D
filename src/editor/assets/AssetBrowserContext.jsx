import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ASSET_DRAG_MIME,
  ASSET_FOLDERS,
  getCatalogAsset,
  listCatalogAssets,
} from '../../assets/assetCatalog.js';
import { normalizeRegistry, findAsset } from '../../assets/AssetRegistry.js';
import { normalizeMaterialDefinition } from '../../materials/MaterialDefinition.js';
import {
  createMaterial,
  createPrefab,
  fetchAssetRegistry,
  fetchMaterialDefinition,
  fetchPrefabDefinition,
  importMeshFile,
  importTextureFile,
  publicAssetUrl,
  updateMaterial,
  updatePrefab,
} from '../../io/assetFileApi.js';
import { normalizePrefabDefinition } from '../../prefabs/PrefabDefinition.js';

const AssetBrowserContext = createContext(null);

/**
 * Shared Content Browser ↔ Asset Viewer state + project asset registry.
 * Independent of GameRuntime / level world, but provides resolvers for it.
 */
export function AssetBrowserProvider({ children }) {
  const [registry, setRegistry] = useState(() => normalizeRegistry({ assets: [] }));
  const [materialDefs, setMaterialDefs] = useState({});
  const [prefabDefs, setPrefabDefs] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const materialCacheRef = useRef({});
  const prefabCacheRef = useRef({});

  const refreshRegistry = useCallback(async () => {
    try {
      let data;
      try {
        data = await fetchAssetRegistry();
      } catch {
        // Production / preview: read static registry (import API is serve-only).
        const res = await fetch('/assets/registry.json');
        if (!res.ok) throw new Error(`Failed to load static registry: ${res.status}`);
        data = await res.json();
      }
      const next = normalizeRegistry(data);
      setRegistry(next);
      setRevision((r) => r + 1);

      // Prefetch material definitions for browser previews
      const mats = next.assets.filter((a) => a.kind === 'material');
      const defs = { ...materialCacheRef.current };
      await Promise.all(mats.map(async (m) => {
        if (defs[m.id]) return;
        try {
          let def;
          try {
            def = normalizeMaterialDefinition(await fetchMaterialDefinition(m.id));
          } catch {
            const res = await fetch(`/assets/${m.path}`);
            if (!res.ok) return;
            def = normalizeMaterialDefinition(await res.json());
          }
          if (def) defs[m.id] = def;
        } catch {
          /* ignore missing */
        }
      }));
      materialCacheRef.current = defs;
      setMaterialDefs({ ...defs });

      const prefabs = next.assets.filter((a) => a.kind === 'prefab');
      const pdefs = { ...prefabCacheRef.current };
      await Promise.all(prefabs.map(async (p) => {
        if (pdefs[p.id]) return;
        try {
          let def;
          try {
            def = normalizePrefabDefinition(await fetchPrefabDefinition(p.id));
          } catch {
            const res = await fetch(`/assets/${p.path}`);
            if (!res.ok) return;
            def = normalizePrefabDefinition(await res.json());
          }
          if (def) pdefs[p.id] = def;
        } catch {
          /* ignore */
        }
      }));
      prefabCacheRef.current = pdefs;
      setPrefabDefs({ ...pdefs });
      return next;
    } catch (err) {
      setStatus(`Asset registry: ${err.message}`);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  const selectedAsset = useMemo(
    () => getCatalogAsset(registry, selectedAssetId, materialDefs),
    [registry, selectedAssetId, materialDefs, revision],
  );

  const selectAsset = useCallback((id) => {
    setSelectedAssetId(id || null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAssetId(null);
  }, []);

  const queryAssets = useCallback((folder) => {
    return listCatalogAssets(registry, {
      folder,
      query: searchQuery,
      materialDefs,
    });
  }, [registry, searchQuery, materialDefs, revision]);

  const beginAssetDrag = useCallback((event, asset) => {
    if (!asset) return;
    const payload = JSON.stringify({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      kind: asset.kind || asset.type,
      folder: asset.folder,
    });
    event.dataTransfer.setData(ASSET_DRAG_MIME, payload);
    event.dataTransfer.setData('text/plain', asset.id);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const getTextureUrl = useCallback((id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'texture') return null;
    return publicAssetUrl(entry.path);
  }, [registry, revision]);

  const getMeshUrl = useCallback((id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'mesh') return null;
    return publicAssetUrl(entry.path);
  }, [registry, revision]);

  const getMaterialDefinition = useCallback(async (id) => {
    if (!id) return null;
    if (materialCacheRef.current[id]) return materialCacheRef.current[id];
    try {
      let def;
      try {
        def = normalizeMaterialDefinition(await fetchMaterialDefinition(id));
      } catch {
        const entry = findAsset(registry, id);
        if (!entry?.path) return null;
        const res = await fetch(`/assets/${entry.path}`);
        if (!res.ok) return null;
        def = normalizeMaterialDefinition(await res.json());
      }
      if (def) {
        materialCacheRef.current[id] = def;
        setMaterialDefs((prev) => ({ ...prev, [id]: def }));
      }
      return def;
    } catch {
      return null;
    }
  }, [registry]);

  const importTexture = useCallback(async (file) => {
    setStatus(`Importing texture ${file.name}…`);
    const result = await importTextureFile(file);
    materialCacheRef.current = { ...materialCacheRef.current };
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);
    setStatus(`Imported texture ${result.asset.name}`);
    return result.asset;
  }, []);

  const importMesh = useCallback(async (file) => {
    setStatus(`Importing mesh ${file.name}…`);
    const result = await importMeshFile(file);
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);
    setStatus(`Imported mesh ${result.asset.name}`);
    return result.asset;
  }, []);

  const createNewMaterial = useCallback(async (partial = {}) => {
    setStatus('Creating material…');
    const result = await createMaterial(partial);
    const def = normalizeMaterialDefinition(result.definition);
    if (def) {
      materialCacheRef.current[def.id] = def;
      setMaterialDefs((prev) => ({ ...prev, [def.id]: def }));
    }
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);
    setStatus(`Created material ${result.asset.name}`);
    return { asset: result.asset, definition: def };
  }, []);

  const saveMaterialDefinition = useCallback(async (id, partial) => {
    const result = await updateMaterial(id, partial);
    const def = normalizeMaterialDefinition(result.definition);
    if (def) {
      materialCacheRef.current[def.id] = def;
      setMaterialDefs((prev) => ({ ...prev, [def.id]: def }));
    }
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setStatus(`Updated material ${result.asset.name}`);
    return def;
  }, []);

  const getPrefabDefinition = useCallback(async (id) => {
    if (!id) return null;
    if (prefabCacheRef.current[id]) return prefabCacheRef.current[id];
    try {
      let def;
      try {
        def = normalizePrefabDefinition(await fetchPrefabDefinition(id));
      } catch {
        const entry = findAsset(registry, id);
        if (!entry?.path) return null;
        const res = await fetch(`/assets/${entry.path}`);
        if (!res.ok) return null;
        def = normalizePrefabDefinition(await res.json());
      }
      if (def) {
        prefabCacheRef.current[id] = def;
        setPrefabDefs((prev) => ({ ...prev, [id]: def }));
      }
      return def;
    } catch {
      return null;
    }
  }, [registry]);

  const getPrefabDefinitionSync = useCallback((id) => {
    return prefabCacheRef.current[id] || prefabDefs[id] || null;
  }, [prefabDefs, revision]);

  const savePrefabDefinition = useCallback(async (definition) => {
    const normalized = normalizePrefabDefinition(definition);
    if (!normalized) throw new Error('Invalid prefab definition');
    const existing = findAsset(registry, normalized.id);
    let result;
    if (existing?.kind === 'prefab') {
      result = await updatePrefab(normalized.id, normalized);
    } else {
      result = await createPrefab(normalized);
    }
    const def = normalizePrefabDefinition(result.definition);
    if (def) {
      prefabCacheRef.current[def.id] = def;
      setPrefabDefs((prev) => ({ ...prev, [def.id]: def }));
    }
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);
    setStatus(`Saved prefab ${result.asset.name}`);
    return { asset: result.asset, definition: def };
  }, [registry]);

  const assetResolver = useMemo(() => ({
    getTextureUrl,
    getMeshUrl,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  }), [getTextureUrl, getMeshUrl, getMaterialDefinition, getPrefabDefinition, getPrefabDefinitionSync]);

  const value = useMemo(() => ({
    folders: ASSET_FOLDERS,
    registry,
    revision,
    selectedAssetId,
    selectedAsset,
    searchQuery,
    setSearchQuery,
    selectAsset,
    clearSelection,
    queryAssets,
    beginAssetDrag,
    dragMime: ASSET_DRAG_MIME,
    refreshRegistry,
    importTexture,
    importMesh,
    createNewMaterial,
    saveMaterialDefinition,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
    savePrefabDefinition,
    prefabDefs,
    assetResolver,
    status,
    setStatus,
  }), [
    registry,
    revision,
    selectedAssetId,
    selectedAsset,
    searchQuery,
    selectAsset,
    clearSelection,
    queryAssets,
    beginAssetDrag,
    refreshRegistry,
    importTexture,
    importMesh,
    createNewMaterial,
    saveMaterialDefinition,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
    savePrefabDefinition,
    prefabDefs,
    assetResolver,
    status,
  ]);

  return (
    <AssetBrowserContext.Provider value={value}>
      {children}
    </AssetBrowserContext.Provider>
  );
}

export function useAssetBrowser() {
  const ctx = useContext(AssetBrowserContext);
  if (!ctx) throw new Error('useAssetBrowser must be used within AssetBrowserProvider');
  return ctx;
}
