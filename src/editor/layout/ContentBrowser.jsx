import { useMemo, useRef, useState } from 'react';
import { IconFolder, IconGrid, IconList, IconSearch } from '../../ui/icons.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { useEditor } from '../EditorContext.jsx';
import { AssetThumbnail } from '../assets/AssetThumbnail.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';

/** Content Browser — project asset registry, import, search, drag sources. */
export function ContentBrowser({ docked = false } = {}) {
  const { layout, patch } = useLayout();
  const {
    folders,
    selectedAssetId,
    selectedAsset,
    selectAsset,
    searchQuery,
    setSearchQuery,
    queryAssets,
    beginAssetDrag,
    importTexture,
    importMesh,
    createNewMaterial,
    notify,
  } = useAssetBrowser();
  const {
    createPrefabFromSelection,
    selectedActorIds,
    mode,
    notify: notifyEditor,
  } = useEditor();
  const { prompt } = useEditorDialogs();

  const folder = layout.contentFolder || 'Materials';
  const viewMode = layout.contentViewMode || 'grid';
  const [dropHover, setDropHover] = useState(false);
  const textureInputRef = useRef(null);
  const meshInputRef = useRef(null);

  const assets = useMemo(
    () => queryAssets(folder),
    [queryAssets, folder, searchQuery],
  );

  const onFilesDropped = async (fileList) => {
    const files = [...fileList];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      try {
        if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) {
          await importTexture(file);
        } else if (/\.(glb|gltf)$/i.test(lower)) {
          await importMesh(file);
        } else {
          notify(`Unsupported file: ${file.name}`);
        }
      } catch (err) {
        notify(err.message);
      }
    }
  };

  return (
    <section className={`bb-panel-chrome bb-content${docked ? ' bb-panel-chrome--docked' : ''}`}>
      <div className="bb-panel-chrome__head">
        {!docked && <span className="bb-panel-chrome__title">Content Browser</span>}
        <div className="bb-content__head-actions">
          <div className="bb-search bb-content__search">
            <span className="bb-search__icon"><IconSearch /></span>
            <input
              className="bb-input bb-input--search"
              placeholder="Search assets"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              title="Filter project assets"
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
        </div>
      </div>

      <div className="bb-content__toolbar">
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
        <input
          ref={textureInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.gif"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await importTexture(file);
              patch({ contentFolder: 'Textures' });
            } catch (err) {
              notify(err.message);
            }
          }}
        />
        <input
          ref={meshInputRef}
          type="file"
          accept=".glb,.gltf"
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

      <div className="bb-content__body">
        <aside className="bb-content__tree">
          <div className="bb-content__path">Content</div>
          <ul className="bb-content-folder-list">
            {folders.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={`bb-content-folder${folder === name ? ' is-selected' : ''}`}
                  onClick={() => patch({ contentFolder: name })}
                >
                  <IconFolder />
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div
          className={`bb-content__assets bb-content__assets--${viewMode}${dropHover ? ' is-drop-target' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropHover(true);
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDropHover(false);
            if (e.dataTransfer.files?.length) {
              await onFilesDropped(e.dataTransfer.files);
            }
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
                const selected = asset.id === selectedAssetId;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={`bb-asset-tile${selected ? ' is-selected' : ''}`}
                      draggable
                      onDragStart={(e) => beginAssetDrag(e, asset)}
                      onClick={() => selectAsset(asset.id)}
                      title={`${asset.name} (${asset.type})`}
                      {...helpProps('content.asset')}
                    >
                      <AssetThumbnail asset={asset} size={viewMode === 'grid' ? 56 : 28} />
                      <span className="bb-asset-tile__name">{asset.name}</span>
                      <span className="bb-asset-tile__type">{asset.type}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
