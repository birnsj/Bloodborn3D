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
  replaceTextureFile,
  storeMeshSourceOriginal,
  patchMeshAssetMeta,
  patchTextureAssetMeta,
  updateMaterial,
  updatePrefab,
  uploadMaterialPreview,
  uploadMeshPreview,
} from '../../io/assetFileApi.js';
import {
  convertMeshFileToGlb,
  extensionOf,
  isSupportedMeshImportName,
  formatFromFileName,
} from '../../assets/meshFormatIO.js';
import { invalidateTextureCacheMatching } from '../../runtime/materialFactory.js';
import { normalizePrefabDefinition } from '../../prefabs/PrefabDefinition.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../../ui/dialogs/reportEditorMessage.js';
import {
  enqueueMeshThumbnailBake,
  enqueueMissingMeshThumbnails,
} from './meshThumbnailBake.js';
import {
  enqueueMaterialThumbnailBake,
  enqueueMissingMaterialThumbnails,
} from './materialThumbnailBake.js';

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

      // Prefetch material definitions before bumping revision so SceneView
      // resync (driven by assetRevision) reads the updated cache. Re-fetch when
      // the registry entry is newer than the cached definition (external API edits).
      const mats = next.assets.filter((a) => a.kind === 'material');
      const defs = { ...materialCacheRef.current };
      await Promise.all(mats.map(async (m) => {
        const cached = defs[m.id];
        if (cached && Number(cached.updatedAt) >= Number(m.updatedAt || 0)) return;
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

      setRegistry(next);
      setRevision((r) => r + 1);
      // Browser-only: bake PNG thumbs for meshes that still show the glyph.
      const missingThumbs = next.assets.some(
        (a) => a.kind === 'mesh' && !a.meta?.previewPath,
      );
      if (missingThumbs) {
        void enqueueMissingMeshThumbnails(next, uploadMeshPreview, publicAssetUrl)
          .then(async () => {
            try {
              const data = await fetchAssetRegistry();
              setRegistry(normalizeRegistry(data));
              setRevision((r) => r + 1);
            } catch {
              /* ignore — glyph thumbs remain until next refresh */
            }
          });
      }
      // Browser WebGL thumbs (studio IBL) — upgrades CPU/script spheres that lack metal look.
      const needsMaterialWebglThumbs = next.assets.some(
        (a) => a.kind === 'material' && (
          !a.meta?.previewPath
          || a.meta?.previewRenderer !== 'webgl'
          || a.meta?.previewStyle !== 'sphere-fill'
        ),
      );
      if (needsMaterialWebglThumbs) {
        const resolveTexUrl = (id) => {
          const entry = next.assets.find((a) => a.id === id && a.kind === 'texture');
          if (!entry) return null;
          const base = publicAssetUrl(entry.path);
          if (!base) return null;
          const v = Number(entry.updatedAt) || 0;
          const sep = base.includes('?') ? '&' : '?';
          return `${base}${sep}v=${v}`;
        };
        void enqueueMissingMaterialThumbnails(
          next,
          defs,
          uploadMaterialPreview,
          resolveTexUrl,
        )
          .then(async () => {
            try {
              const data = await fetchAssetRegistry();
              const refreshed = normalizeRegistry(data);
              setRegistry(refreshed);
              // Refresh material defs so previewPath + updatedAt stay in sync.
              const matDefs = { ...materialCacheRef.current };
              await Promise.all(
                refreshed.assets
                  .filter((a) => a.kind === 'material')
                  .map(async (m) => {
                    try {
                      const def = normalizeMaterialDefinition(await fetchMaterialDefinition(m.id));
                      if (def) matDefs[m.id] = def;
                    } catch {
                      /* ignore */
                    }
                  }),
              );
              materialCacheRef.current = matDefs;
              setMaterialDefs({ ...matDefs });
              setRevision((r) => r + 1);
            } catch {
              /* ignore — CPU spheres remain until next refresh */
            }
          });
      }
      return next;
    } catch (err) {
      notify(`Asset registry: ${err.message}`);
      return null;
    }
  }, [notify]);

  useEffect(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  // External tooling (scripts /api/assets import) writes registry on disk while the
  // editor is open. Refresh when the window regains focus so new textures/materials
  // resolve without requiring a full restart.
  useEffect(() => {
    const onFocus = () => {
      void refreshRegistry();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
    const base = publicAssetUrl(entry.path);
    if (!base) return null;
    // Cache-bust when texture bytes are replaced in-place (same path).
    const v = Number(entry.updatedAt) || 0;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}v=${v}`;
  }, [registry, revision]);

  /** Rich texture source for materialFactory (url + sampler/transform meta). */
  const getTextureAsset = useCallback((id) => {
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
  }, [registry, revision, getTextureUrl]);

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

  const importTexture = useCallback(async (file, options = {}) => {
    setStatus(`Importing texture ${file.name}…`);
    const result = await importTextureFile(file, options);
    materialCacheRef.current = { ...materialCacheRef.current };
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    if (options.select !== false) setSelectedAssetId(result.asset.id);
    if (options.notify !== false) notify(`Imported texture ${result.asset.name}`);
    return result.asset;
  }, [notify, setStatus]);

  const replaceTexture = useCallback(async (id, file) => {
    setStatus(`Updating texture ${id}…`);
    const result = await replaceTextureFile(id, file);
    const pathFrag = result.asset?.path || id;
    await invalidateTextureCacheMatching(pathFrag);
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    return result.asset;
  }, [setStatus]);

  const importMesh = useCallback(async (file) => {
    if (!file?.name) throw new Error('No mesh file');
    if (!isSupportedMeshImportName(file.name)) {
      throw new Error(`Unsupported mesh format: ${file.name}`);
    }
    setStatus(`Importing mesh ${file.name}…`);
    const sourceFormat = formatFromFileName(file.name);
    const ext = extensionOf(file.name);
    let uploadBlob = file;
    let uploadName = file.name;
    let meta = {};
    let warnings = [];

    // Normalize foreign formats to GLB for the production pipeline; keep source bytes.
    if (sourceFormat && sourceFormat !== 'glb' && sourceFormat !== 'gltf') {
      setStatus(`Converting ${sourceFormat.toUpperCase()} → GLB…`);
      const converted = await convertMeshFileToGlb(file);
      warnings = converted.warnings || [];
      uploadBlob = new Blob([converted.glb], { type: 'model/gltf-binary' });
      uploadName = `${file.name.replace(/\.[^.]+$/, '') || 'import'}.glb`;
      meta = {
        sourceFormat,
        sourceOriginalName: file.name,
        importWarnings: warnings,
        triangles: converted.stats?.triangles,
        vertices: converted.stats?.vertices,
        meshCount: converted.stats?.meshCount,
        materialCount: converted.stats?.materialCount,
        boundingBoxMeters: converted.stats?.boundingBoxMeters,
        relationship: 'source',
        normalizedTo: 'glb',
      };
    } else {
      meta = { sourceFormat: sourceFormat || 'glb', relationship: 'source' };
    }

    const result = await importMeshFile(uploadBlob, {
      fileName: uploadName,
      assetName: file.name.replace(/\.[^.]+$/, '') || 'Mesh',
      meta,
      tags: sourceFormat && sourceFormat !== 'glb' ? ['imported', sourceFormat] : ['imported'],
    });
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    setSelectedAssetId(result.asset.id);

    if (sourceFormat && sourceFormat !== 'glb' && sourceFormat !== 'gltf') {
      try {
        const stored = await storeMeshSourceOriginal(result.asset.id, file, { extension: ext });
        setRegistry(normalizeRegistry(stored.registry));
      } catch (err) {
        console.warn('[BloodBound] source original store failed', err);
      }
    }

    const warnSuffix = warnings.length ? ` (${warnings.length} format note${warnings.length > 1 ? 's' : ''})` : '';
    notify(`Imported mesh ${result.asset.name}${warnSuffix}`);
    void enqueueMeshThumbnailBake(result.asset, uploadMeshPreview, publicAssetUrl)
      .then(async (baked) => {
        if (!baked) return;
        if (baked.registry) {
          setRegistry(normalizeRegistry(baked.registry));
        } else {
          try {
            const data = await fetchAssetRegistry();
            setRegistry(normalizeRegistry(data));
          } catch {
            /* ignore */
          }
        }
        setRevision((r) => r + 1);
      });
    return result.asset;
  }, [notify, setStatus]);

  /**
   * Register a derived GLB (simplified / LOD) without overwriting the source asset.
   */
  const importDerivedMeshGlb = useCallback(async (glbBuffer, {
    name = 'Derived Mesh',
    sourceAssetId = null,
    meta = {},
    tags = ['derived'],
  } = {}) => {
    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const result = await importMeshFile(blob, {
      fileName: `${name}.glb`,
      assetName: name,
      tags,
      meta: {
        relationship: 'derived',
        derivedFrom: sourceAssetId,
        ...meta,
      },
    });
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    void enqueueMeshThumbnailBake(result.asset, uploadMeshPreview, publicAssetUrl);
    return result.asset;
  }, []);

  const updateMeshMeta = useCallback(async (assetId, metaPatch) => {
    const result = await patchMeshAssetMeta(assetId, metaPatch);
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    return result.asset;
  }, []);

  const updateTextureMeta = useCallback(async (assetId, metaPatch) => {
    const result = await patchTextureAssetMeta(assetId, metaPatch);
    setRegistry(normalizeRegistry(result.registry));
    setRevision((r) => r + 1);
    // Sampler changes: invalidate only this asset's cache keys (not every texture).
    const pathFrag = result.asset?.path || assetId;
    await invalidateTextureCacheMatching(pathFrag);
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
    notify(`Created material ${result.asset.name}`);
    // Overwrite CPU placeholder with studio-IBL WebGL thumb (matches detail preview).
    if (def) {
      const resolveTexUrl = (texId) => {
        const entry = result.registry?.assets?.find((a) => a.id === texId && a.kind === 'texture');
        if (!entry) return getTextureUrl(texId);
        const base = publicAssetUrl(entry.path);
        if (!base) return null;
        const v = Number(entry.updatedAt) || 0;
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}v=${v}`;
      };
      void enqueueMaterialThumbnailBake(
        result.asset,
        def,
        uploadMaterialPreview,
        resolveTexUrl,
        { force: true },
      ).then(async (baked) => {
        if (!baked) return;
        if (baked.definition) {
          const nextDef = normalizeMaterialDefinition(baked.definition);
          if (nextDef) {
            materialCacheRef.current[nextDef.id] = nextDef;
            setMaterialDefs((prev) => ({ ...prev, [nextDef.id]: nextDef }));
          }
        }
        if (baked.registry) {
          setRegistry(normalizeRegistry(baked.registry));
        } else {
          try {
            setRegistry(normalizeRegistry(await fetchAssetRegistry()));
          } catch {
            /* ignore */
          }
        }
        setRevision((r) => r + 1);
      });
    }
    return { asset: result.asset, definition: def };
  }, [getTextureUrl, notify, setStatus]);

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
    void enqueueMaterialThumbnailBake(
      result.asset,
      def,
      uploadMaterialPreview,
      getTextureUrl,
      { force: true },
    ).then(async (baked) => {
      if (!baked) return;
      if (baked.definition) {
        const nextDef = normalizeMaterialDefinition(baked.definition);
        if (nextDef) {
          materialCacheRef.current[nextDef.id] = nextDef;
          setMaterialDefs((prev) => ({ ...prev, [nextDef.id]: nextDef }));
        }
      }
      if (baked.registry) {
        setRegistry(normalizeRegistry(baked.registry));
      }
      setRevision((r) => r + 1);
    });
    return def;
  }, [getTextureUrl, notify]);

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
    getTextureAsset,
    getMeshUrl,
    getMeshBoundsMeters,
    getMeshBoundsCenterMeters,
    getMaterialDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  }), [
    getTextureUrl,
    getTextureAsset,
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
    replaceTexture,
    importMesh,
    importDerivedMeshGlb,
    updateMeshMeta,
    updateTextureMeta,
    getTextureAsset,
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
    replaceTexture,
    importMesh,
    importDerivedMeshGlb,
    updateMeshMeta,
    updateTextureMeta,
    getTextureAsset,
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
