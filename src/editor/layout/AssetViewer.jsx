import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconFolder, IconGrid, IconList, IconSearch } from '../../ui/icons.jsx';
import { AssetThumbnail } from '../assets/AssetThumbnail.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useEditor } from '../EditorContext.jsx';
import { MeshPreviewCanvas, MaterialPreviewCanvas } from '../assets/MeshPreviewCanvas.jsx';
import { MeshAssetTools } from '../assets/MeshAssetTools.jsx';
import { TextureInspector } from '../assets/TextureInspector.jsx';
import { TexturePreviewCanvas } from '../assets/TexturePreviewCanvas.jsx';
import { TextureMapInspectDialog } from '../../ui/TextureMapInspectDialog.jsx';
import { isCompressedTextureMeta, isCompressedTexturePath } from '../../assets/textureSampling.js';
import { loadGltfScene } from '../../runtime/meshLoader.js';
import { uploadMaterialPreview, uploadMeshPreview } from '../../io/assetFileApi.js';
import { isSupportedMeshImportName } from '../../assets/meshFormatIO.js';
import { normalizeContentOffset } from '../../core/contentOffset.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import {
  suppressNativeImageMenu,
  useEditorContextMenu,
} from '../../ui/contextMenu/EditorContextMenu.jsx';
import { isContentCategory } from '../../assets/contentFolders.js';
/**
 * Bottom Asset Viewer — lists assets from the Content Browser folder.
 * Double-click opens a temporary preview window (not embedded in the panel).
 * AI generation lives in the AI Assets workspace (Phase 2H.1C).
 */
export function AssetViewer({ docked = false } = {}) {
  const { layout, patch } = useLayout();
  const {
    selectedAssetId,
    selectedAssetIds,
    selectedAsset,
    selectAsset,
    selectAssetInList,
    searchQuery,
    setSearchQuery,
    queryAssets,
    beginAssetDrag,
    importTexture,
    importMesh,
    importDerivedMeshGlb,
    updateMeshMeta,
    updateTextureMeta,
    createNewMaterial,
    dragMime,
    notify,
    folders,
    registry,
    mutateFolders,
  } = useAssetBrowser();
  const {
    createPrefabFromSelection,
    selectedActorIds,
    mode,
    notify: notifyEditor,
  } = useEditor();
  const { prompt } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();

  const folder = layout.contentFolder || 'Materials';
  const viewMode = layout.contentViewMode || 'grid';
  const thumbSize = layout.contentThumbSize || 56;
  const listThumbSize = Math.max(24, Math.round(thumbSize * 0.55));
  const [dropHover, setDropHover] = useState(false);
  const [previewAsset, setPreviewAsset] = useState(null);
  const textureInputRef = useRef(null);
  const meshInputRef = useRef(null);

  const assets = useMemo(
    () => queryAssets(folder),
    [queryAssets, folder, searchQuery],
  );
  const assetIds = useMemo(() => assets.map((a) => a.id), [assets]);
  const selectedAssetIdSet = useMemo(
    () => new Set(selectedAssetIds || []),
    [selectedAssetIds],
  );

  useEffect(() => {
    setPreviewAsset(null);
  }, [folder]);

  const onFilesDropped = async (fileList) => {
    const files = [...fileList];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      try {
        if (/\.(png|jpe?g|webp|gif|ktx2)$/i.test(lower)) {
          await importTexture(file);
          patch({ contentFolder: 'Textures' });
        } else if (isSupportedMeshImportName(file.name)) {
          await importMesh(file);
          patch({ contentFolder: 'Meshes' });
        } else {
          notify(`Unsupported file: ${file.name}`);
        }
      } catch (err) {
        notify(err.message);
      }
    }
  };

  const onDragOver = (e) => {
    const types = [...e.dataTransfer.types];
    if (types.includes('Files') || types.includes(dragMime) || types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropHover(true);
    }
  };

  const openPreview = (asset) => {
    selectAsset(asset.id);
    setPreviewAsset(asset);
  };

  return (
    <section
      className={`bb-panel-chrome bb-asset-viewer${docked ? ' bb-panel-chrome--docked' : ''}`}
      data-selected-asset={selectedAssetId || ''}
      data-folder={folder}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHover(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDropHover(false);
        if (e.dataTransfer.files?.length) {
          await onFilesDropped(e.dataTransfer.files);
        }
      }}
    >
      {!docked && (
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Asset Viewer</span>
        </div>
      )}

      <div className="bb-asset-viewer__chrome">
        <div className="bb-asset-viewer__actions">
          <button
            type="button"
            className="bb-btn"
            onClick={() => textureInputRef.current?.click()}
            {...helpProps('content.importTexture')}
          >
            Import Texture
          </button>
          <button
            type="button"
            className="bb-btn"
            onClick={() => meshInputRef.current?.click()}
            {...helpProps('content.importMesh')}
          >
            Import Mesh
          </button>
          <button
            type="button"
            className="bb-btn"
            onClick={async () => {
              try {
                const fromTex = selectedAsset?.type === 'texture' ? selectedAsset : null;
                await createNewMaterial({
                  name: fromTex ? `${fromTex.name} Material` : 'New Material',
                  baseColorMapId: fromTex?.id || null,
                  baseColor: '#ffffff',
                });
                patch({ contentFolder: 'Materials' });
              } catch (err) {
                notify(err.message);
              }
            }}
            {...helpProps('content.newMaterial')}
          >
            New Material
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={mode === 'play' || selectedActorIds.length === 0}
            title="Create prefab from selected actors / cell"
            onClick={async () => {
              try {
                const name = await prompt('Prefab name', {
                  title: 'Create Prefab',
                  initialValue: 'Cell Prefab',
                });
                if (!name?.trim()) return;
                const result = await createPrefabFromSelection(name.trim());
                if (result) patch({ contentFolder: 'Prefabs' });
              } catch (err) {
                notifyEditor(err.message);
              }
            }}
            {...helpProps(
              'content.createPrefab',
              mode === 'play'
                ? 'Unavailable during Play mode.'
                : (selectedActorIds.length === 0 ? 'Select actors or a cell first.' : null),
            )}
          >
            Create Prefab
          </button>
        </div>
        <div className="bb-asset-viewer__folder">
          <IconFolder />
          <strong>{folder}</strong>
          <span className="bb-muted">{assets.length}</span>
        </div>
        <div className="bb-search bb-asset-viewer__search">
          <span className="bb-search__icon"><IconSearch /></span>
          <input
            className="bb-input bb-input--search"
            placeholder={`Search ${folder}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            title="Filter assets in this folder"
            {...helpProps('content.search')}
          />
        </div>
        <div className="bb-seg">
          <button
            type="button"
            className={`bb-btn bb-btn--icon${viewMode === 'grid' ? ' bb-btn--active' : ''}`}
            title="Grid view"
            onClick={() => patch({ contentViewMode: 'grid' })}
            {...helpProps('content.gridView')}
          >
            <IconGrid />
          </button>
          <button
            type="button"
            className={`bb-btn bb-btn--icon${viewMode === 'list' ? ' bb-btn--active' : ''}`}
            title="List view"
            onClick={() => patch({ contentViewMode: 'list' })}
            {...helpProps('content.listView')}
          >
            <IconList />
          </button>
        </div>
        <label
          className="bb-asset-viewer__thumb-size"
          title="Thumbnail size"
          onPointerDown={(e) => e.stopPropagation()}
          {...helpProps('assetViewer.thumbSize')}
        >
          <span className="bb-muted">Size</span>
          <input
            type="range"
            className="bb-asset-viewer__thumb-slider"
            min={32}
            max={128}
            step={4}
            value={thumbSize}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onWheel={(e) => e.preventDefault()}
            onChange={(e) => patch({ contentThumbSize: Number(e.target.value) })}
            aria-label="Thumbnail size"
          />
          <span className="bb-asset-viewer__thumb-value">{thumbSize}</span>
        </label>
        <input
          ref={textureInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif,.hdr,.exr"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const result = await importTexture(file);
              const folder = result?.asset?.folder || 'Textures';
              patch({ contentFolder: folder });
            } catch (err) {
              notify(err.message);
            }
          }}
        />
        <input
          ref={meshInputRef}
          type="file"
          accept=".glb,.gltf,.fbx,.obj,.stl,.ply,.dae,.usdz"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await importMesh(file);
              patch({ contentFolder: 'Meshes' });
            } catch (err) {
              notify(err.message);
            }
          }}
        />
      </div>

      <div
        className={`bb-asset-viewer__body bb-asset-viewer__body--list-only${dropHover ? ' is-drop-target' : ''}`}
        style={{
          ['--bb-asset-thumb-size']: `${thumbSize}px`,
          ['--bb-asset-tile-size']: `${thumbSize + 40}px`,
          ['--bb-asset-list-thumb-size']: `${listThumbSize}px`,
        }}
      >
        {assets.length === 0 ? (
          <div className="bb-content-empty">
            <IconFolder />
            <span>
              {searchQuery.trim()
                ? 'No assets match this search.'
                : `${folder} is empty. Import textures/meshes or create a material.`}
            </span>
          </div>
        ) : (
          <ul className={`bb-asset-list bb-asset-list--${viewMode}`}>
            {assets.map((asset) => {
              const selected = selectedAssetIdSet.has(asset.id);
              const size = viewMode === 'grid' ? thumbSize : listThumbSize;
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={`bb-asset-tile${selected ? ' is-selected' : ''}`}
                    draggable
                    onDragStart={(e) => beginAssetDrag(e, asset)}
                    onClick={(e) => selectAssetInList(asset.id, assetIds, e)}
                    onDoubleClick={() => openPreview(asset)}
                    onContextMenu={(event) => {
                      suppressNativeImageMenu(event);
                      if (!selected) selectAsset(asset.id);
                      const moveIds = selected && selectedAssetIds.length > 1
                        ? selectedAssetIds
                        : [asset.id];
                      const moveTargets = (folders || []).filter((f) => (
                        f !== asset.folder
                        && !isContentCategory(f, registry?.folderMeta)
                      ));
                      openFromEvent(event, [
                        {
                          id: 'preview',
                          label: 'Open Preview',
                          onSelect: () => openPreview(asset),
                        },
                        {
                          id: 'select',
                          label: 'Select',
                          onSelect: () => selectAsset(asset.id),
                        },
                        {
                          id: 'move-to',
                          label: moveIds.length > 1
                            ? `Move ${moveIds.length} To Folder`
                            : 'Move To Folder',
                          disabled: !moveTargets.length || !mutateFolders,
                          submenu: moveTargets.map((target) => ({
                            id: `move-${target}`,
                            label: target,
                            onSelect: async () => {
                              try {
                                for (const assetId of moveIds) {
                                  await mutateFolders({
                                    type: 'move-asset',
                                    assetId,
                                    folder: target,
                                  });
                                }
                                notify?.(
                                  moveIds.length > 1
                                    ? `Moved ${moveIds.length} assets to ${target}`
                                    : `Moved ${asset.name} to ${target}`,
                                  { dialog: false },
                                );
                              } catch (err) {
                                notify?.(err.message || 'Could not move asset', { dialog: true });
                              }
                            },
                          })),
                        },
                      ]);
                    }}
                    title={`${asset.name} (${asset.type}) — Shift range, Ctrl toggle, Alt remove — double-click to preview`}
                    {...helpProps('content.asset')}
                  >
                    <AssetThumbnail asset={asset} size={size} />
                    <span className="bb-asset-tile__name">{asset.name}</span>
                    <span className="bb-asset-tile__type">{asset.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {previewAsset ? (
        <AssetPreviewDialog
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          importDerivedMeshGlb={importDerivedMeshGlb}
          updateMeshMeta={updateMeshMeta}
          updateTextureMeta={updateTextureMeta}
          notify={notify}
        />
      ) : null}
    </section>
  );
}

function offsetsEqual(a, b) {
  const aa = normalizeContentOffset(a);
  const bb = normalizeContentOffset(b);
  return aa.x === bb.x && aa.y === bb.y && aa.z === bb.z;
}

function AssetPreviewDialog({ asset, onClose, importDerivedMeshGlb, updateMeshMeta, updateTextureMeta, notify }) {
  const [meshMeta, setMeshMeta] = useState(null);
  const [pivotDraft, setPivotDraft] = useState(() =>
    normalizeContentOffset(asset?.meta?.defaultContentOffset));
  const [pivotEditMode, setPivotEditMode] = useState(false);
  const [pivotDragActive, setPivotDragActive] = useState(false);
  const [previewRotationY, setPreviewRotationY] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [textureDraft, setTextureDraft] = useState(null);
  const [inspectFullMap, setInspectFullMap] = useState(false);
  const previewApiRef = useRef(null);
  const isTexture = asset?.type === 'texture';
  const isMaterial = asset?.type === 'material';
  const isCompactPreview = isTexture || isMaterial;
  const onTextureDraftChange = useCallback((draft) => {
    setTextureDraft(draft);
  }, []);

  const savedOffset = normalizeContentOffset(asset?.meta?.defaultContentOffset);
  const pivotDirty = !offsetsEqual(pivotDraft, savedOffset);

  useEffect(() => {
    setPivotDraft(normalizeContentOffset(asset?.meta?.defaultContentOffset));
    setPivotEditMode(false);
    setPreviewRotationY(0);
    setPreviewScale(1);
    setPivotDragActive(false);
    setTextureDraft(null);
  }, [asset.id, asset?.meta?.defaultContentOffset]);

  useEffect(() => {
    let cancelled = false;
    setMeshMeta(null);
    if (asset.type !== 'mesh' || !asset.url) return undefined;
    loadGltfScene(asset.url).then((loaded) => {
      if (cancelled || !loaded) return;
      setMeshMeta(loaded.meta);
    });
    return () => { cancelled = true; };
  }, [asset.id, asset.url, asset.type]);

  const cancelPivotSession = useCallback(() => {
    previewApiRef.current?.cancelPivotDrag?.();
    setPivotDraft(normalizeContentOffset(asset?.meta?.defaultContentOffset));
    setPivotEditMode(false);
    setPreviewRotationY(0);
    setPreviewScale(1);
  }, [asset?.meta?.defaultContentOffset]);

  const applyPivot = useCallback(async (offset, label = 'Saved asset default pivot') => {
    if (!asset?.id || !updateMeshMeta) return;
    const next = normalizeContentOffset(offset ?? pivotDraft);
    await updateMeshMeta(asset.id, { defaultContentOffset: next });
    setPivotDraft(next);
    setPivotEditMode(false);
    notify?.(`${label}. Existing placed actors are unchanged.`);
  }, [asset?.id, updateMeshMeta, pivotDraft, notify]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (previewApiRef.current?.isPivotDragging?.()) {
        previewApiRef.current.cancelPivotDrag();
        return;
      }
      if (pivotEditMode || pivotDirty) {
        cancelPivotSession();
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, pivotEditMode, pivotDirty, cancelPivotSession, notify]);

  if (typeof document === 'undefined') return null;

  const meshAsset = asset.type === 'mesh'
    ? {
        id: asset.id,
        kind: 'mesh',
        name: asset.name,
        path: asset.path,
        meta: {
          ...(asset.meta || {}),
          ...(meshMeta || {}),
          defaultContentOffset: asset.meta?.defaultContentOffset,
        },
      }
    : null;

  const texW = Number(textureDraft?.width) || Number(asset?.meta?.width) || 0;
  const texH = Number(textureDraft?.height) || Number(asset?.meta?.height) || 0;
  const texAspect = texW > 0 && texH > 0 ? texW / texH : 1;

  const previewStage = (
    <div
      className={`bb-asset-preview__stage${isTexture ? ' bb-asset-preview__stage--texture' : ''}${isMaterial ? ' bb-asset-preview__stage--material' : ''}`}
      style={isTexture ? { '--tex-aspect': String(texAspect) } : undefined}
      {...helpProps('assetViewer.preview')}
    >
      <PreviewSurface
        asset={asset}
        pivotDraft={pivotDraft}
        pivotEditMode={pivotEditMode}
        onPivotDraftChange={setPivotDraft}
        onPivotDragActiveChange={setPivotDragActive}
        previewRotationY={previewRotationY}
        previewScale={previewScale}
        snapEnabled={snapEnabled}
        previewApiRef={previewApiRef}
        textureDraft={textureDraft}
      />
    </div>
  );

  const materialBits = isMaterial ? materialSummaryBits(asset) : [];

  const previewMeta = (
    <div className={`bb-asset-preview__meta${isCompactPreview ? ' bb-asset-preview__meta--compact' : ''}`}>
      {isCompactPreview ? (
        <>
          <p className="bb-asset-preview__identity">
            <code>{asset.id}</code>
            {asset.path ? <span className="bb-muted">{asset.path}</span> : null}
            {(asset.tags || []).length > 0 ? (
              <span className="bb-muted">{asset.tags.join(', ')}</span>
            ) : null}
          </p>
          {isMaterial && materialBits.length > 0 && (
            <p className="bb-asset-preview__summary">
              {materialBits.map((bit) => (
                <span key={bit.key} title={bit.title}>{bit.label}</span>
              ))}
            </p>
          )}
          {isMaterial && (
            <p className="bb-muted bb-asset-preview__hint bb-asset-preview__hint--compact">
              {previewHint(asset)}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="bb-asset-preview__title-row">
            <AssetThumbnail asset={asset} size={28} />
            <div>
              <div className="bb-asset-preview__name">{asset.name}</div>
              <div className="bb-muted">{asset.type} · {asset.folder}</div>
            </div>
          </div>
          <dl className="bb-asset-preview__fields">
            <div><dt>ID</dt><dd>{asset.id}</dd></div>
            {asset.path && <div><dt>Path</dt><dd>{asset.path}</dd></div>}
            {(asset.tags || []).length > 0 && (
              <div><dt>Tags</dt><dd>{asset.tags.join(', ')}</dd></div>
            )}
            {meshMeta?.boundingBoxMeters && (
              <>
                <div>
                  <dt>Size (m)</dt>
                  <dd>
                    {fmt(meshMeta.boundingBoxMeters.x)} × {fmt(meshMeta.boundingBoxMeters.y)} × {fmt(meshMeta.boundingBoxMeters.z)}
                  </dd>
                </div>
                <div>
                  <dt>Size (eu)</dt>
                  <dd>
                    {fmt(meshMeta.boundingBoxEditor.x, 0)} × {fmt(meshMeta.boundingBoxEditor.y, 0)} × {fmt(meshMeta.boundingBoxEditor.z, 0)}
                  </dd>
                </div>
                <div><dt>Triangles</dt><dd>{meshMeta.triangles}</dd></div>
              </>
            )}
            {Object.entries(asset.meta || {}).map(([key, value]) => {
              if (typeof value === 'object') return null;
              return (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              );
            })}
          </dl>
          <p className="bb-muted bb-asset-preview__hint">{previewHint(asset)}</p>
        </>
      )}
      {pivotDragActive && (
        <p className="bb-muted">Dragging pivot — release to commit draft, Escape to cancel drag.</p>
      )}
      {meshAsset && (
        <MeshAssetTools
          asset={meshAsset}
          importDerivedMeshGlb={importDerivedMeshGlb}
          updateMeshMeta={updateMeshMeta}
          notify={notify}
          pivotDraft={pivotDraft}
          onPivotDraftChange={setPivotDraft}
          pivotEditMode={pivotEditMode}
          onPivotEditModeChange={setPivotEditMode}
          previewRotationY={previewRotationY}
          onPreviewRotationYChange={setPreviewRotationY}
          previewScale={previewScale}
          onPreviewScaleChange={setPreviewScale}
          snapEnabled={snapEnabled}
          onSnapEnabledChange={setSnapEnabled}
          onApplyPivot={applyPivot}
          onCancelPivot={cancelPivotSession}
          pivotDirty={pivotDirty}
        />
      )}
      {isTexture && (
        <TextureInspector
          asset={asset}
          updateTextureMeta={updateTextureMeta}
          notify={notify}
          showPreview={false}
          onDraftChange={onTextureDraftChange}
        />
      )}
    </div>
  );

  return createPortal(
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Close asset preview"
        onClick={() => onClose?.()}
      />
      <div
        className={`bb-dialog bb-dialog--asset-preview${isTexture ? ' bb-dialog--asset-preview-texture' : ''}${isMaterial ? ' bb-dialog--asset-preview-material' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-asset-preview-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bb-dialog__header">
          <div className="bb-asset-preview__header-text">
            <h2 id="bb-asset-preview-title" className="bb-dialog__title">
              {asset.name}
            </h2>
            <p className="bb-muted bb-asset-preview__header-sub">{asset.type} · {asset.folder}</p>
          </div>
          <button
            type="button"
            className="bb-btn"
            onClick={() => onClose?.()}
            {...helpProps('assetViewer.clear')}
          >
            Close
          </button>
        </div>
        <div className="bb-dialog__body bb-asset-preview-dialog">
          {previewStage}
          {isTexture && asset?.url ? (
            <div className="bb-asset-preview__inspect-row">
              <button
                type="button"
                className="bb-btn"
                onClick={() => setInspectFullMap(true)}
                {...helpProps('meshy.pbrMaps')}
              >
                Inspect full map
              </button>
              <span className="bb-muted">Pan/zoom UV atlases in a larger viewer</span>
            </div>
          ) : null}
          {previewMeta}
        </div>
      </div>
      {isTexture ? (
        <TextureMapInspectDialog
          key={inspectFullMap ? asset?.url || 'open' : 'closed'}
          open={inspectFullMap}
          url={asset?.url || null}
          title={asset?.name || 'Texture'}
          subtitle={asset?.folder || null}
          onClose={() => setInspectFullMap(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function PreviewSurface({
  asset,
  pivotDraft,
  pivotEditMode,
  onPivotDraftChange,
  onPivotDragActiveChange,
  previewRotationY,
  previewScale,
  snapEnabled,
  previewApiRef,
  textureDraft = null,
}) {
  if (asset.type === 'mesh' && asset.url) {
    return (
      <MeshPreviewWithIcon
        asset={asset}
        pivotDraft={pivotDraft}
        pivotEditMode={pivotEditMode}
        onPivotDraftChange={onPivotDraftChange}
        onPivotDragActiveChange={onPivotDragActiveChange}
        previewRotationY={previewRotationY}
        previewScale={previewScale}
        snapEnabled={snapEnabled}
        previewApiRef={previewApiRef}
      />
    );
  }

  if (asset.type === 'texture' && (asset.url || asset.path)) {
    // Single WebGL preview (supports KTX2); draft sampling comes from TextureInspector.
    return (
      <div className="bb-asset-preview__surface bb-asset-preview__surface--image">
        <TexturePreviewCanvas
          url={asset.url}
          path={asset.path}
          sampler={textureDraft?.sampler ?? asset.meta?.sampler}
          transform={textureDraft?.transform ?? asset.meta?.transform}
          channelView={textureDraft?.channelView || 'rgba'}
          compressed={isCompressedTexturePath(asset.path || asset.url) || isCompressedTextureMeta(asset.meta)}
        />
      </div>
    );
  }

  if (asset.type === 'material') {
    return <MaterialPreviewWithIcon asset={asset} />;
  }

  return (
    <div className="bb-asset-preview__surface bb-asset-preview__surface--badge">
      <AssetThumbnail asset={asset} size={72} />
      <p className="bb-muted">{asset.preview?.note || `${asset.type} preview`}</p>
    </div>
  );
}

function MeshPreviewWithIcon({
  asset,
  pivotDraft,
  pivotEditMode,
  onPivotDraftChange,
  onPivotDragActiveChange,
  previewRotationY,
  previewScale,
  snapEnabled,
  previewApiRef,
}) {
  const previewRef = useRef(null);
  const { notify, refreshRegistry } = useAssetBrowser();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!previewApiRef) return undefined;
    previewApiRef.current = {
      cancelPivotDrag: () => previewRef.current?.cancelPivotDrag?.(),
      isPivotDragging: () => Boolean(previewRef.current?.isPivotDragging?.()),
    };
    return () => {
      previewApiRef.current = null;
    };
  }, [previewApiRef]);

  const onGenerateIcon = useCallback(async () => {
    if (!asset?.id || busy) return;
    setBusy(true);
    try {
      const blob = await previewRef.current?.captureIconPngBlob?.();
      if (!blob) throw new Error('Could not capture mesh icon');
      await uploadMeshPreview(asset.id, blob);
      await refreshRegistry?.();
      notify('Mesh icon saved');
    } catch (err) {
      notify(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [asset?.id, busy, notify, refreshRegistry]);

  return (
    <div className="bb-asset-preview__surface bb-asset-preview__surface--live">
      <div className="bb-asset-preview__mesh-toolbar">
        {pivotEditMode && (
          <span className="bb-asset-preview__pivot-badge" {...helpProps('assetViewer.pivotEdit')}>
            Pivot Edit · RGB = imported origin · gold = proposed pivot
          </span>
        )}
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={busy}
          onClick={() => { void onGenerateIcon(); }}
          {...helpProps('assetViewer.generateMeshIcon')}
        >
          {busy ? 'Saving…' : 'Generate Icon'}
        </button>
      </div>
      <MeshPreviewCanvas
        ref={previewRef}
        url={asset.url}
        contentOffset={pivotDraft}
        pivotEditMode={Boolean(pivotEditMode)}
        onContentOffsetChange={onPivotDraftChange}
        onPivotDragActiveChange={onPivotDragActiveChange}
        snapEnabled={snapEnabled}
        snapSize={25}
        previewRotationY={previewRotationY}
        previewScale={previewScale}
      />
    </div>
  );
}

function MaterialPreviewWithIcon({ asset }) {
  const previewRef = useRef(null);
  const { assetResolver, notify, refreshRegistry } = useAssetBrowser();
  const [busy, setBusy] = useState(false);
  const getTextureUrl = assetResolver?.getTextureUrl;
  const color = asset.definition?.baseColor || asset.meta?.baseColor || asset.preview?.color || '#8a9099';
  const mapUrl = asset.definition?.baseColorMapId && getTextureUrl
    ? getTextureUrl(asset.definition.baseColorMapId)
    : null;

  const onGenerateIcon = useCallback(async () => {
    if (!asset?.id || busy) return;
    setBusy(true);
    try {
      const blob = await previewRef.current?.captureIconPngBlob?.();
      if (!blob) throw new Error('Could not capture material icon');
      await uploadMaterialPreview(asset.id, blob);
      await refreshRegistry?.();
      notify('Material icon saved');
    } catch (err) {
      notify(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [asset?.id, busy, notify, refreshRegistry]);

  return (
    <div className="bb-asset-preview__surface bb-asset-preview__surface--live">
      <div className="bb-asset-preview__mesh-toolbar">
        <button
          type="button"
          className="bb-btn bb-btn--primary"
          disabled={busy}
          onClick={() => { void onGenerateIcon(); }}
          {...helpProps('assetViewer.generateMaterialIcon')}
        >
          {busy ? 'Saving…' : 'Generate Icon'}
        </button>
      </div>
      <MaterialPreviewCanvas
        ref={previewRef}
        definition={asset.definition}
        color={color}
        mapUrl={mapUrl || null}
        getTextureUrl={getTextureUrl || null}
      />
    </div>
  );
}

function previewHint(asset) {
  switch (asset.type) {
    case 'mesh':
      return 'Orbit to frame the model, then Generate Icon to save that view as the Asset Viewer thumbnail. Models load in meters (100 editor units = 1 m).';
    case 'material':
      return 'Orbit to frame, then Generate Icon for the Asset Viewer thumbnail. Assign from Details.';
    case 'texture':
      return 'Imported texture preview. Use New Material to build a reusable material.';
    default:
      return 'Project asset preview.';
  }
}

function materialSummaryBits(asset) {
  const def = asset?.definition || {};
  const meta = asset?.meta || {};
  const bits = [];
  const color = def.baseColor || meta.baseColor;
  if (color) {
    bits.push({ key: 'color', label: String(color), title: 'Base color' });
  }
  const roughness = def.roughness ?? meta.roughness;
  if (roughness != null && roughness !== '') {
    bits.push({ key: 'rough', label: `R ${roughness}`, title: 'Roughness' });
  }
  const metalness = def.metalness ?? meta.metalness;
  if (metalness != null && metalness !== '') {
    bits.push({ key: 'metal', label: `M ${metalness}`, title: 'Metalness' });
  }
  const shading = def.shadingModel || meta.shadingModel;
  if (shading) {
    bits.push({ key: 'shade', label: String(shading), title: 'Shading model' });
  }
  const maps = [];
  if (def.baseColorMapId || meta.hasBaseMap) maps.push('albedo');
  if (def.normalMapId || meta.hasNormalMap) maps.push('normal');
  if (def.roughnessMapId || meta.hasRoughness || meta.hasRoughnessMap) maps.push('roughness');
  if (def.metalnessMapId || meta.hasMetalnessMap) maps.push('metalness');
  if (def.aoMapId || meta.hasAoMap) maps.push('ao');
  if (def.emissiveMapId || meta.hasEmissiveMap) maps.push('emissive');
  if (maps.length) {
    bits.push({ key: 'maps', label: maps.join('+'), title: 'Maps' });
  }
  return bits;
}

function fmt(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return digits === 0 ? String(Math.round(v)) : v.toFixed(digits);
}
