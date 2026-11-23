import { useEffect, useState } from 'react';
import { AssetThumbnail } from '../assets/AssetThumbnail.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { MeshPreviewCanvas, MaterialPreviewCanvas } from '../assets/MeshPreviewCanvas.jsx';
import { loadGltfScene } from '../../runtime/meshLoader.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

/**
 * Dedicated asset preview panel.
 * Uses a separate Three preview scene — not GameRuntime.
 */
export function AssetViewer({ docked = false } = {}) {
  const { selectedAsset, clearSelection, dragMime } = useAssetBrowser();

  const onDragOver = (e) => {
    if ([...e.dataTransfer.types].includes(dragMime) || e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
  };

  return (
    <section
      className={`bb-panel-chrome bb-asset-viewer${docked ? ' bb-panel-chrome--docked' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {!docked && (
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Asset Viewer</span>
        </div>
      )}

      <div className="bb-panel-chrome__body bb-asset-viewer__body">
        {!selectedAsset ? (
          <div className="bb-asset-viewer__empty">
            <p className="bb-muted">Select an asset in the Content Browser to preview.</p>
            <p className="bb-muted">Supports meshes, materials, and textures from the project registry.</p>
          </div>
        ) : (
          <AssetPreview asset={selectedAsset} onClear={clearSelection} />
        )}
      </div>
    </section>
  );
}

function AssetPreview({ asset, onClear }) {
  const [meshMeta, setMeshMeta] = useState(null);

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

  return (
    <div className="bb-asset-preview">
      <div className="bb-asset-preview__stage" {...helpProps('assetViewer.preview')}>
        <PreviewSurface asset={asset} />
      </div>

      <div className="bb-asset-preview__meta">
        <div className="bb-asset-preview__title-row">
          <AssetThumbnail asset={asset} size={28} />
          <div>
            <div className="bb-asset-preview__name">{asset.name}</div>
            <div className="bb-muted">{asset.type} · {asset.folder}</div>
          </div>
          <button type="button" className="bb-btn" onClick={onClear} {...helpProps('assetViewer.clear')}>
            Clear
          </button>
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
      </div>
    </div>
  );
}

function PreviewSurface({ asset }) {
  if (asset.type === 'mesh' && asset.url) {
    return (
      <div className="bb-asset-preview__surface bb-asset-preview__surface--live">
        <MeshPreviewCanvas url={asset.url} />
      </div>
    );
  }

  if (asset.type === 'texture' && asset.url) {
    return (
      <div className="bb-asset-preview__surface bb-asset-preview__surface--image">
        <img src={asset.url} alt={asset.name} className="bb-asset-preview__image" />
      </div>
    );
  }

  if (asset.type === 'material') {
    return (
      <div className="bb-asset-preview__surface bb-asset-preview__surface--live">
        <MaterialPreviewWithMap asset={asset} />
      </div>
    );
  }

  return (
    <div className="bb-asset-preview__surface bb-asset-preview__surface--badge">
      <AssetThumbnail asset={asset} size={72} />
      <p className="bb-muted">{asset.preview?.note || `${asset.type} preview`}</p>
    </div>
  );
}

function MaterialPreviewWithMap({ asset }) {
  const { getTextureUrl } = useAssetBrowser();
  const color = asset.definition?.baseColor || asset.meta?.baseColor || asset.preview?.color || '#8a9099';
  const mapUrl = asset.definition?.baseColorMapId
    ? getTextureUrl(asset.definition.baseColorMapId)
    : null;
  return <MaterialPreviewCanvas color={color} mapUrl={mapUrl || null} />;
}

function previewHint(asset) {
  switch (asset.type) {
    case 'mesh':
      return 'Orbit to inspect. Models load in meters (100 editor units = 1 m). Not the Level Viewport runtime.';
    case 'material':
      return 'PBR material preview. Assign to brushes from the Details panel.';
    case 'texture':
      return 'Imported texture preview. Use Create Material to build a reusable material.';
    default:
      return 'Project asset preview.';
  }
}

function fmt(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return digits === 0 ? String(Math.round(v)) : v.toFixed(digits);
}
