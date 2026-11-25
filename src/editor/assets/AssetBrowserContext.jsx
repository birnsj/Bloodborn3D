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
  ASSET_DRAG_MIME_MATERIAL,
  ASSET_FOLDERS as REGISTRY_ASSET_FOLDERS,
  getCatalogAsset,
  listCatalogAssets,
} from '../../assets/assetCatalog.js';
import { normalizeRegistry, findAsset } from '../../assets/AssetRegistry.js';
import { normalizeMaterialDefinition } from '../../materials/MaterialDefinition.js';
import { materialDraftForDuplicate } from '../materials/materialDraft.js';
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
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../../ui/dialogs/reportEditorMessage.js';

const AssetBrowserContext = createContext(null);

/**
 * Shared Content Browser ↔ Asset Viewer state + project asset registry.
 * Independent of GameRuntime / level world, but provides resolvers for it.
 */
export function AssetBrowserProvider({ children }) {
  const dialogs = useEditorDialogs();
  const [registry, setRegistry] = useState(() => normalizeRegistry({ assets: [] }));
  const [materialDefs, setMaterialDefs] = useState({});
  const [prefabDefs, setPrefabDefs] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatusState] = useState('');
  const [revision, setRevision] = useState(0);
  const materialCacheRef = useRef({});
  const prefabCacheRef = useRef({});

  const setStatus = useCallback((message) => {
    setStatusState(String(message ?? ''));
  }, []);

  const notify = useCallback((message, options = {}) => {
    reportEditorMessage(setStatusState, dialogs, message, { ...options, dialog: true });
  }, [dialogs]);

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
      notify(`Asset registry: ${err.message}`);
      return null;
    }
  }, [notify]);

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
    const kind = asset.kind || asset.type;
    const payload = JSON.stringify({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      kind,
      folder: asset.folder,
    });
    event.dataTransfer.setData(ASSET_DRAG_MIME, payload);
    event.dataTransfer.setData('text/plain', asset.id);
    // Kind marker so dragover can detect materials (getData is empty until drop).
    if (kind === 'material') {
      event.dataTransfer.setData(ASSET_DRAG_MIME_MATERIAL, asset.id);
    }
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  const getTextureUrl = useCallback((id) => {
    const entry = findAsset(registry, id);
    if (!entry || entry.kind !== 'texture') return null;
    return publicAssetUrl(entry.path);
  }, [registry, revision]);

  const getMeshBoundsMeters = useCallback((id) => {
    const entry = findAsset(registry, id);
    const box = entry?.meta?.boundingBoxMeters;
    if (!box || typeof box !== 'object') return null;
    const x = Number(box.x);
    const y = Number(box.y);
    const z = Number(box.z);
    if (![x, y, z].every((v) => Number.isFinite(v) && v > 0)) return null;
    return { x, y, z };
  }, [registry]);

  const getMeshBoundsCenterMeters = useCallback((id) => {
    const entry = findAsset(registry, id);
    const c = entry?.meta?.boundingBoxCenterMeters;
    if (!c || typeof c !== 'object') return null;
    const x = Number(c.x);
    const y = Number(c.y);
    const z = Number(c.z);
    if (![x, y, z].every((v) => Number.isFinite(v))) return null;
    return { x, y, z };
  }, [registry]);

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
    notify(`Imported texture ${result.asset.name}`);
    return result.asset;
  }, [notify, setStatus]);

  const importMesh = useCallback(async (file) => {
    setStatus(`Importing mesh ${file.name}…`);
    const result = await importMeshFile(file);
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);
    notify(`Imported mesh ${result.asset.name}`);
    return result.asset;
  }, [notify, setStatus]);

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
    notify(`Created material ${result.asset.name}`);
    return { asset: result.asset, definition: def };
  }, [notify, setStatus]);

  const duplicateMaterial = useCallback(async (id) => {
    const source = await (async () => {
      if (materialCacheRef.current[id]) return materialCacheRef.current[id];
      return normalizeMaterialDefinition(await fetchMaterialDefinition(id));
    })();
    const payload = materialDraftForDuplicate(source);
    if (!payload) throw new Error('Cannot duplicate material');
    setStatus(`Duplicating ${source.name}…`);
    return createNewMaterial(payload);
  }, [createNewMaterial, setStatus]);

  const saveMaterialDefinition = useCallback(async (id, partial) => {
    const result = await updateMaterial(id, partial);
    const def = normalizeMaterialDefinition(result.definition);
    if (def) {
      materialCacheRef.current[def.id] = def;
      setMaterialDefs((prev) => ({ ...prev, [def.id]: def }));
    }
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    notify(`Updated material ${result.asset.name}`);
    return def;
  }, [notify]);

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
    notify(`Saved prefab ${result.asset.name}`);
    return { asset: result.asset, definition: def };
  }, [registry, notify]);

  const assetResolver = useMemo(() => ({
    getTextureUrl,
    getMeshUrl,
    getMeshBoundsMeters,
    getMeshBoundsCenterMeters,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  }), [
    getTextureUrl,
    getMeshUrl,
    getMeshBoundsMeters,
    getMeshBoundsCenterMeters,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  ]);

  const value = useMemo(() => ({
    folders: REGISTRY_ASSET_FOLDERS,
    registry,
    revision,
    materialDefs,
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
    duplicateMaterial,
    saveMaterialDefinition,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
    savePrefabDefinition,
    prefabDefs,
    assetResolver,
    status,
    setStatus,
    notify,
  }), [
    registry,
    revision,
    materialDefs,
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
    duplicateMaterial,
    saveMaterialDefinition,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
    savePrefabDefinition,
    prefabDefs,
    assetResolver,
    status,
    setStatus,
    notify,
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
