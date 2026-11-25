import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import {
  LIBRARY_THUMB_SIZE_DEFAULT,
  LIBRARY_THUMB_SIZE_MAX,
  LIBRARY_THUMB_SIZE_MIN,
  addGenerationReferences,
  clearGenerationReferencesWarning,
  getAiAssetsUiState,
  removeGenerationReference,
  selectAiProvider,
  setAiAssetsSection,
  setArtSaveTargetFolder,
  setConceptSaveTargetAreaId,
  setGenerationOrigin,
  setGenerationReferences,
  setLibraryThumbSize,
  setPromptComposition,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import {
  getOpenArtUiState,
  openArtApplySeed,
  openArtConnect,
  openArtSetReference,
} from '../openart/openArtUiStore.js';
import { ASSET_CATEGORIES } from './promptTemplates.js';
import {
  createArtGenerationOrigin,
  openArtSupportsReferenceImages,
  preferReferenceMode,
  resolveOpenArtMaxRefs,
} from './generation.js';
import {
  deselectAll,
  getPrimarySelectedItem,
  getSelectedItems,
  getVisibleEntries,
  openCollection,
  openFolder,
  projectArtAnalyzePrompt,
  projectArtBootstrap,
  projectArtComposePrompt,
  projectArtCreateCollection,
  projectArtCreatePrompt,
  projectArtCreateReferenceSet,
  projectArtDelete,
  projectArtDeleteCollection,
  projectArtImportImage,
  projectArtMkdir,
  projectArtOpenInExplorer,
  projectArtPreviewUrl,
  projectArtRename,
  projectArtStageReferences,
  projectArtUpdateItem,
  rangeShift,
  selectAll,
  selectOnly,
  setSelection,
  setSortMode,
  setViewFavorites,
  setExpandedPath,
  subscribeProjectArt,
  getProjectArtState,
  toggleCtrl,
  toggleExpandedPath,
  search as projectArtSearch,
} from './projectArtStore.js';

const LEFT_MIN = 160;
const LEFT_MAX = 280;
const RIGHT_MIN = 280;
const RIGHT_MAX = 420;

/**
 * Project Art Library — Adobe Bridge–inspired three-column browser.
 */
export function ProjectArtLibraryPanel() {
  const [store, setStore] = useState(() => getProjectArtState());
  const [aiUi, setAiUi] = useState(() => getAiAssetsUiState());
  const { confirm, prompt } = useEditorDialogs();
  const { notify, setStatus } = useAssetBrowser();
  const fileRef = useRef(null);
  const loadedRef = useRef(false);
  const rootRef = useRef(null);
  const [leftW, setLeftW] = useState(200);
  const [rightW, setRightW] = useState(320);

  useEffect(() => subscribeProjectArt(setStore), []);
  useEffect(() => subscribeAiAssetsUi(setAiUi), []);
  useEffect(() => {
    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    projectArtBootstrap().catch((err) => notify(err.message));
    return undefined;
  }, [notify]);

  useEffect(() => {
    if (aiUi.generationReferencesWarning) {
      notify(aiUi.generationReferencesWarning);
      clearGenerationReferencesWarning();
    }
  }, [aiUi.generationReferencesWarning, notify]);

  const entries = useMemo(() => getVisibleEntries(), [store]);
  const primary = getPrimarySelectedItem();
  const selectedItems = getSelectedItems();
  const thumbSize = Number(aiUi.libraryThumbSize) || LIBRARY_THUMB_SIZE_DEFAULT;
  const collections = store.library.collections || [];

  const breadcrumb = useMemo(() => {
    if (store.viewMode === 'favorites') return [{ label: 'Favorites', path: null }];
    if (store.viewMode === 'collection') {
      const col = collections.find((c) => c.id === store.activeCollectionId);
      return [{ label: col?.name || 'Collection', path: null }];
    }
    const parts = String(store.currentFolder || '').split('/').filter(Boolean);
    const crumbs = [{ label: 'Project Art', path: '' }];
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [store.viewMode, store.currentFolder, store.activeCollectionId, collections]);

  return (
    <div
      ref={rootRef}
      className="bb-project-art"
      style={{
        '--bb-pa-left-w': `${leftW}px`,
        '--bb-pa-right-w': `${rightW}px`,
        '--bb-pa-thumb-size': `${thumbSize}px`,
      }}
    >
      <aside className="bb-panel-chrome bb-project-art__nav">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Folders</span>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={async () => {
              const name = await prompt('New folder name', {
                title: 'New Folder',
                initialValue: 'New Folder',
              });
              if (!name) return;
              const parent = store.currentFolder || '';
              const path = parent ? `${parent}/${name}` : name;
              try {
                await projectArtMkdir({ path });
                await openFolder(path);
                setStatus(`Created folder “${name}”`);
              } catch (err) {
                notify(err.message);
              }
            }}
          >
            New
          </button>
        </div>
        <div className="bb-panel-chrome__body bb-project-art__nav-body">
          <FolderTree
            nodes={store.tree}
            currentFolder={store.currentFolder}
            expandedPaths={store.expandedPaths}
            viewMode={store.viewMode}
            onOpen={(path) => openFolder(path).catch((err) => notify(err.message))}
            onToggle={toggleExpandedPath}
            onContextAction={async (action, node) => {
              try {
                if (action === 'new') {
                  const name = await prompt('New folder name', {
                    title: 'New Folder',
                    initialValue: 'New Folder',
                  });
                  if (!name) return;
                  const path = node.path ? `${node.path}/${name}` : name;
                  await projectArtMkdir({ path });
                  setExpandedPath(node.path, true);
                  await openFolder(path);
                } else if (action === 'rename') {
                  const name = await prompt('Rename folder', {
                    title: 'Rename',
                    initialValue: node.name,
                  });
                  if (!name || name === node.name) return;
                  await projectArtRename({ path: node.path, newName: name });
                  const parent = node.path.includes('/')
                    ? node.path.slice(0, node.path.lastIndexOf('/'))
                    : '';
                  await openFolder(parent ? `${parent}/${name}` : name);
                } else if (action === 'delete') {
                  const ok = await confirm(`Delete folder “${node.name}”?`, {
                    title: 'Delete folder',
                    confirmLabel: 'Delete',
                    tone: 'warning',
                  });
                  if (!ok) return;
                  await projectArtDelete({ path: node.path, recursive: true });
                  await openFolder('');
                } else if (action === 'explorer') {
                  await projectArtOpenInExplorer({ path: node.path });
                }
              } catch (err) {
                notify(err.message);
              }
            }}
          />

          <button
            type="button"
            className={`bb-project-art__filter${store.viewMode === 'favorites' ? ' is-active' : ''}`}
            onClick={() => setViewFavorites()}
          >
            Favorites
          </button>

          <div className="bb-project-art__collections">
            <div className="bb-project-art__collections-head">
              <span className="bb-field-caption">Collections</span>
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                onClick={async () => {
                  const name = await prompt('Collection name', {
                    title: 'New Collection',
                    initialValue: 'New Collection',
                  });
                  if (!name) return;
                  try {
                    const res = await projectArtCreateCollection({
                      name,
                      itemIds: selectedItems.map((i) => i.id),
                    });
                    if (res.id) openCollection(res.id);
                    setStatus(`Created collection “${name}”`);
                  } catch (err) {
                    notify(err.message);
                  }
                }}
              >
                New
              </button>
            </div>
            <ul className="bb-project-art__collection-list">
              {collections.map((col) => (
                <li key={col.id}>
                  <button
                    type="button"
                    className={`bb-project-art__collection${
                      store.viewMode === 'collection' && store.activeCollectionId === col.id
                        ? ' is-active'
                        : ''
                    }`}
                    onClick={() => openCollection(col.id)}
                  >
                    <span>{col.name}</span>
                    <span className="bb-muted">{(col.itemIds || []).length}</span>
                  </button>
                  {store.activeCollectionId === col.id && store.viewMode === 'collection' && (
                    <div className="bb-project-art__collection-tools">
                      <button
                        type="button"
                        className="bb-btn bb-btn--ghost"
                        onClick={async () => {
                          const ok = await confirm(`Delete collection “${col.name}”?`, {
                            title: 'Delete collection',
                            confirmLabel: 'Delete',
                            tone: 'warning',
                          });
                          if (!ok) return;
                          await projectArtDeleteCollection({ id: col.id })
                            .catch((err) => notify(err.message));
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <ColumnResizeHandle
        ariaLabel="Resize folders column"
        onDelta={(delta) => setLeftW((w) => clamp(w + delta, LEFT_MIN, LEFT_MAX))}
      />

      <section className="bb-panel-chrome bb-project-art__center">
        <div className="bb-panel-chrome__head bb-project-art__center-head">
          <nav className="bb-project-art__breadcrumb" aria-label="Path">
            {breadcrumb.map((crumb, i) => (
              <span key={`${crumb.path}-${crumb.label}`} className="bb-project-art__crumb">
                {i > 0 && <span className="bb-muted"> / </span>}
                {crumb.path != null ? (
                  <button
                    type="button"
                    className="bb-project-art__crumb-btn"
                    onClick={() => openFolder(crumb.path).catch((err) => notify(err.message))}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="bb-project-art__toolbar">
            <input
              className="bb-input bb-project-art__search"
              placeholder="Search…"
              value={store.searchQuery}
              onChange={(e) => {
                const q = e.target.value;
                projectArtSearch(q).catch((err) => notify(err.message));
              }}
            />
            <select
              className="bb-select"
              value={store.sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              aria-label="Sort"
            >
              <option value="name">Name</option>
              <option value="date">Date</option>
              <option value="rating">Rating</option>
            </select>
            <label className="bb-project-art__size" title="Thumbnail size">
              <span className="bb-muted">Size</span>
              <input
                type="range"
                min={LIBRARY_THUMB_SIZE_MIN}
                max={LIBRARY_THUMB_SIZE_MAX}
                step={4}
                value={thumbSize}
                onChange={(e) => setLibraryThumbSize(Number(e.target.value))}
                aria-label="Gallery thumbnail size"
              />
            </label>
            <button
              type="button"
              className="bb-btn"
              disabled={store.busy || store.viewMode !== 'folder' || !store.currentFolder}
              title={store.currentFolder ? 'Import images into this folder' : 'Open a folder before importing'}
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
          </div>
        </div>

        <div className="bb-panel-chrome__body bb-project-art__center-body">
          <ArtGallery
            entries={entries}
            selectedIds={store.selectedIds}
            busy={store.busy}
            onSelectOnly={selectOnly}
            onToggleCtrl={toggleCtrl}
            onRangeShift={rangeShift}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onSetSelection={setSelection}
            onOpenFolder={(path) => openFolder(path).catch((err) => notify(err.message))}
            onImportFiles={async (files) => {
              if (store.viewMode !== 'folder') {
                notify('Switch to a folder to import files');
                return;
              }
              for (const file of files) {
                try {
                  await projectArtImportImage({
                    folder: store.currentFolder || '',
                    file,
                    title: file.name.replace(/\.[^.]+$/, ''),
                  });
                } catch (err) {
                  notify(err.message);
                }
              }
              if (files.length) setStatus(`Imported ${files.length} file(s)`);
            }}
            notify={notify}
          />
        </div>

        <GenerationReferencesTray
          refs={aiUi.generationReferences}
          selectedItems={selectedItems}
          notify={notify}
          setStatus={setStatus}
          prompt={prompt}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files || [])];
            e.target.value = '';
            if (!files.length) return;
            (async () => {
              for (const file of files) {
                try {
                  await projectArtImportImage({
                    folder: store.currentFolder || '',
                    file,
                    title: file.name.replace(/\.[^.]+$/, ''),
                  });
                } catch (err) {
                  notify(err.message);
                }
              }
              setStatus(`Imported ${files.length} file(s)`);
            })();
          }}
        />
      </section>

      <ColumnResizeHandle
        ariaLabel="Resize preview column"
        onDelta={(delta) => setRightW((w) => clamp(w - delta, RIGHT_MIN, RIGHT_MAX))}
      />

      <section className="bb-panel-chrome bb-project-art__detail">
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Preview</span>
        </div>
        <div className="bb-panel-chrome__body bb-project-art__detail-body">
          <ArtPreviewDetail
            item={primary}
            selectedItems={selectedItems}
            trayRefs={aiUi.generationReferences}
            currentFolder={store.currentFolder}
            busy={store.busy}
            notify={notify}
            setStatus={setStatus}
          />
        </div>
      </section>
    </div>
  );
}

function FolderTree({
  nodes, currentFolder, expandedPaths, viewMode, onOpen, onToggle, onContextAction,
}) {
  return (
    <ul className="bb-project-art__tree">
      <li>
        <button
          type="button"
          className={`bb-project-art__tree-node${
            viewMode === 'folder' && currentFolder === '' ? ' is-active' : ''
          }`}
          onClick={() => onOpen('')}
        >
          <span className="bb-project-art__tree-label">Project Art</span>
        </button>
      </li>
      {(nodes || []).map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          currentFolder={currentFolder}
          expandedPaths={expandedPaths}
          viewMode={viewMode}
          onOpen={onOpen}
          onToggle={onToggle}
          onContextAction={onContextAction}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node, depth, currentFolder, expandedPaths, viewMode, onOpen, onToggle, onContextAction,
}) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const expanded = Boolean(expandedPaths[node.path]) || currentFolder === node.path
    || String(currentFolder || '').startsWith(`${node.path}/`);
  const active = viewMode === 'folder' && currentFolder === node.path;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <li style={{ paddingLeft: depth ? 10 : 0 }}>
      <div className="bb-project-art__tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="bb-project-art__tree-twist"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={() => onToggle(node.path)}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="bb-project-art__tree-twist is-spacer" />
        )}
        <button
          type="button"
          className={`bb-project-art__tree-node${active ? ' is-active' : ''}`}
          onClick={() => onOpen(node.path)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
        >
          <span className="bb-project-art__tree-label">{node.name}</span>
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost bb-project-art__tree-more"
          aria-label="Folder actions"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div className="bb-project-art__ctx">
          <button type="button" className="bb-btn bb-btn--ghost" onClick={() => { setMenuOpen(false); onContextAction('new', node); }}>New Folder</button>
          <button type="button" className="bb-btn bb-btn--ghost" onClick={() => { setMenuOpen(false); onContextAction('rename', node); }}>Rename</button>
          <button type="button" className="bb-btn bb-btn--ghost" onClick={() => { setMenuOpen(false); onContextAction('delete', node); }}>Delete</button>
          <button type="button" className="bb-btn bb-btn--ghost" onClick={() => { setMenuOpen(false); onContextAction('explorer', node); }}>Open in Explorer</button>
        </div>
      )}
      {hasChildren && expanded && (
        <ul className="bb-project-art__tree">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              currentFolder={currentFolder}
              expandedPaths={expandedPaths}
              viewMode={viewMode}
              onOpen={onOpen}
              onToggle={onToggle}
              onContextAction={onContextAction}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ArtGallery({
  entries,
  selectedIds,
  busy,
  onSelectOnly,
  onToggleCtrl,
  onRangeShift,
  onSelectAll,
  onDeselectAll,
  onSetSelection,
  onOpenFolder,
  onImportFiles,
  notify,
}) {
  const galleryRef = useRef(null);
  const [marquee, setMarquee] = useState(null);
  const dragRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onSelectAll();
      } else if (e.key === 'Escape') {
        onDeselectAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectAll, onDeselectAll]);

  const onPointerDownBg = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-id]')) return;
    const root = galleryRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX - rect.left + root.scrollLeft,
      originY: e.clientY - rect.top + root.scrollTop,
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
      base: e.ctrlKey || e.metaKey || e.shiftKey ? [...selectedIds] : [],
    };
    setMarquee({
      x: dragRef.current.originX,
      y: dragRef.current.originY,
      w: 0,
      h: 0,
    });
    root.setPointerCapture?.(e.pointerId);
  }, [selectedIds]);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    const root = galleryRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !root) return;
    const rect = root.getBoundingClientRect();
    const x = e.clientX - rect.left + root.scrollLeft;
    const y = e.clientY - rect.top + root.scrollTop;
    const left = Math.min(drag.originX, x);
    const top = Math.min(drag.originY, y);
    const w = Math.abs(x - drag.originX);
    const h = Math.abs(y - drag.originY);
    setMarquee({ x: left, y: top, w, h });

    if (w < 3 && h < 3) return;
    const selRect = {
      left,
      top,
      right: left + w,
      bottom: top + h,
    };
    const hit = [];
    root.querySelectorAll('[data-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const er = {
        left: r.left - rect.left + root.scrollLeft,
        top: r.top - rect.top + root.scrollTop,
        right: r.right - rect.left + root.scrollLeft,
        bottom: r.bottom - rect.top + root.scrollTop,
      };
      const intersects = !(
        er.right < selRect.left
        || er.left > selRect.right
        || er.bottom < selRect.top
        || er.top > selRect.bottom
      );
      if (intersects) hit.push(el.getAttribute('data-id'));
    });
    const next = drag.additive
      ? [...new Set([...drag.base, ...hit])]
      : hit;
    onSetSelection(next);
  }, [onSetSelection]);

  const onPointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setMarquee(null);
    try {
      galleryRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      ref={galleryRef}
      className="bb-project-art__gallery"
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) onImportFiles(files);
        else notify('Drop image files to import');
      }}
    >
      {entries.map((entry) => {
        if (entry.type === 'dir') {
          return (
            <button
              key={`dir:${entry.path}`}
              type="button"
              className="bb-project-art__folder-tile"
              onDoubleClick={() => onOpenFolder(entry.path)}
              onClick={() => onOpenFolder(entry.path)}
            >
              <span className="bb-project-art__folder-icon" aria-hidden />
              <span className="bb-project-art__tile-title">{entry.name}</span>
            </button>
          );
        }
        const item = entry.item;
        if (!item) return null;
        const url = projectArtPreviewUrl(item);
        const selected = selectedSet.has(item.id);
        return (
          <div
            key={item.id}
            data-id={item.id}
            className={`bb-project-art__tile${selected ? ' is-selected' : ''}`}
            onClick={(e) => {
              if (e.shiftKey) onRangeShift(item.id);
              else if (e.ctrlKey || e.metaKey) onToggleCtrl(item.id);
              else onSelectOnly(item.id);
            }}
            onDoubleClick={() => onSelectOnly(item.id)}
          >
            {url ? (
              <img src={url} alt={item.title} className="bb-project-art__tile-img" draggable={false} />
            ) : (
              <div className="bb-project-art__tile-empty bb-muted">No image</div>
            )}
            {selected && <span className="bb-project-art__check" aria-hidden>✓</span>}
            <span className="bb-project-art__tile-title">{item.title}</span>
          </div>
        );
      })}
      {!entries.length && !busy && (
        <div className="bb-muted bb-project-art__empty">No items — Import or drop images here.</div>
      )}
      {marquee && marquee.w > 2 && marquee.h > 2 && (
        <div
          className="bb-project-art__marquee"
          style={{
            left: marquee.x,
            top: marquee.y,
            width: marquee.w,
            height: marquee.h,
          }}
        />
      )}
    </div>
  );
}

function GenerationReferencesTray({ refs, selectedItems, notify, setStatus, prompt }) {
  return (
    <div className="bb-project-art__tray">
      <div className="bb-project-art__tray-head">
        <span className="bb-field-caption">
          Generation References ({refs.length})
        </span>
        <div className="bb-project-art__tray-actions">
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!selectedItems.length}
            title="Add selected to tray"
            onClick={() => {
              addGenerationReferences(selectedItems.map((i) => ({
                id: i.id,
                relativePath: i.relativePath,
                title: i.title,
              })));
              setStatus(`Added ${selectedItems.length} reference(s)`);
            }}
          >
            +
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!refs.length}
            onClick={async () => {
              const name = await prompt('Reference set name', {
                title: 'Save Reference Set',
                initialValue: 'Reference Set',
              });
              if (!name) return;
              try {
                await projectArtCreateReferenceSet({
                  name,
                  itemIds: refs.map((r) => r.id),
                });
                setStatus(`Saved reference set “${name}”`);
              } catch (err) {
                notify(err.message);
              }
            }}
          >
            Save Reference Set
          </button>
        </div>
      </div>
      <div className="bb-project-art__tray-strip">
        {refs.map((ref) => {
          const url = projectArtPreviewUrl(ref.relativePath);
          return (
            <div key={ref.id} className="bb-project-art__tray-thumb" title={ref.title}>
              {url ? <img src={url} alt="" /> : <span className="bb-muted">?</span>}
              <button
                type="button"
                className="bb-project-art__tray-remove"
                aria-label={`Remove ${ref.title}`}
                onClick={() => removeGenerationReference(ref.id)}
              >
                ×
              </button>
            </div>
          );
        })}
        {!refs.length && (
          <span className="bb-muted bb-project-art__tray-empty">
            Select items and click + to pin references (persists across tabs)
          </span>
        )}
      </div>
    </div>
  );
}

function ArtPreviewDetail({
  item, selectedItems, trayRefs, currentFolder, busy, notify, setStatus,
}) {
  const [draft, setDraft] = useState(null);
  const [metaOpen, setMetaOpen] = useState(true);
  const [promptOpen, setPromptOpen] = useState(true);
  const [assetCategory, setAssetCategory] = useState('environment_concept');
  const [instruction, setInstruction] = useState('');
  const [tileH, setTileH] = useState(false);
  const [tileV, setTileV] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [promptSource, setPromptSource] = useState(null);
  const [savedPromptId, setSavedPromptId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setDraft(item ? {
      ...item,
      tags: [...(item.tags || [])],
    } : null);
  }, [item]);

  const url = item ? projectArtPreviewUrl(item) : null;
  const refStrip = trayRefs.length
    ? trayRefs
    : selectedItems.map((i) => ({
      id: i.id,
      relativePath: i.relativePath,
      title: i.title,
    }));

  const onAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const itemIds = refStrip.map((r) => r.id);
      let result;
      try {
        result = await projectArtAnalyzePrompt({
          mode: 'vision',
          assetCategory,
          instruction,
          tileHorizontal: tileH,
          tileVertical: tileV,
          itemIds,
        });
      } catch {
        result = null;
      }
      if (!result?.ok || result?.source === 'template' || !result?.promptText) {
        result = await projectArtComposePrompt({
          assetCategory,
          instruction,
          tileHorizontal: tileH,
          tileVertical: tileV,
          itemIds,
        });
      }
      setGeneratedPrompt(result.promptText || '');
      setPromptSource(result.source || 'template');
      setSavedPromptId(null);
      if ((result.source || 'template') === 'template') {
        notify('Prompt composed from template (not vision analysis)');
      }
    } catch (err) {
      notify(err.message || String(err));
    } finally {
      setAnalyzing(false);
    }
  }, [assetCategory, instruction, tileH, tileV, refStrip, notify]);

  const onSavePrompt = useCallback(async () => {
    if (!generatedPrompt.trim()) {
      notify('Nothing to save — create a prompt first');
      return;
    }
    try {
      const res = await projectArtCreatePrompt({
        name: `${ASSET_CATEGORIES.find((c) => c.id === assetCategory)?.label || 'Asset'} prompt`,
        promptText: generatedPrompt,
        assetCategory,
        tileHorizontal: tileH,
        tileVertical: tileV,
        itemIds: refStrip.map((r) => r.id),
        category: 'other',
      });
      setSavedPromptId(res.promptId || null);
      setStatus('Prompt saved to Project Art Library');
    } catch (err) {
      notify(err.message);
    }
  }, [generatedPrompt, assetCategory, tileH, tileV, refStrip, notify, setStatus]);

  const onSendToGeneration = useCallback(async () => {
    const text = generatedPrompt.trim();
    if (!text) {
      notify('Create or enter a prompt before sending to Asset Generation');
      return;
    }

    let refs = [...trayRefs];
    if (!refs.length && selectedItems.length) {
      addGenerationReferences(selectedItems.map((i) => ({
        id: i.id,
        relativePath: i.relativePath,
        title: i.title,
      })));
      refs = selectedItems.map((i) => ({
        id: i.id,
        relativePath: i.relativePath,
        title: i.title,
      }));
    }
    setGenerationReferences(refs);

    setPromptComposition({ tileHorizontal: tileH, tileVertical: tileV });
    const folderPath = currentFolder || '';
    const origin = createArtGenerationOrigin({
      itemIds: refs.map((r) => r.id),
      promptId: savedPromptId,
      finalPrompt: text,
      assetCategory,
      tileHorizontal: tileH,
      tileVertical: tileV,
      folderPath,
    });
    setGenerationOrigin(origin);
    setConceptSaveTargetAreaId(null);
    setArtSaveTargetFolder(folderPath);
    selectAiProvider('openart');
    setAiAssetsSection('generation');

    try {
      await openArtConnect().catch(() => {});
      await openArtApplySeed({ prompt: text });

      const oa = getOpenArtUiState();
      const model = oa.imageModels.find((m) => m.id === oa.modelId);
      const availableModes = model?.modes?.image || [{ mode: 'text2image' }];
      const schemaProperties = oa.form?.jsonSchema?.properties || {};
      const supportsRefs = openArtSupportsReferenceImages({
        mode: oa.mode,
        schemaProperties,
        availableModes,
      });

      let referenceFileName = null;
      let referenceStagingPath = null;
      let mode = null;

      if (supportsRefs && refs.length) {
        const maxRefs = resolveOpenArtMaxRefs({ schemaProperties });
        try {
          const staged = await projectArtStageReferences({
            itemIds: refs.map((r) => r.id),
            maxRefs,
          });
          const first = staged.staged?.[0];
          if (first) {
            referenceFileName = first.originalName || first.fileName || 'art-reference';
            referenceStagingPath = first.absolutePath;
            mode = preferReferenceMode({
              availableModes,
              currentMode: oa.mode,
              hasReference: true,
            });
          }
        } catch (err) {
          if (err.code === 'REF_LIMIT') {
            const dropped = err.dropped || [];
            const names = dropped.map((d) => d.title || d.id).join(', ');
            notify(
              `Too many references for this model (max ${maxRefs}). Would drop: ${names || 'unknown'}. Reduce the tray and try again — nothing was discarded silently.`,
            );
            return;
          }
          notify(err.message || 'Could not stage references');
        }
      }

      if (referenceStagingPath || mode) {
        await openArtApplySeed({
          prompt: text,
          mode,
          referenceFileName,
          referenceStagingPath,
        });
      }
      if (!referenceStagingPath) openArtSetReference({});

      setStatus(referenceStagingPath
        ? 'OpenArt seeded with Project Art references — estimate before spending'
        : 'OpenArt seeded from Project Art — estimate before spending');
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [
    generatedPrompt, trayRefs, selectedItems, tileH, tileV, currentFolder,
    savedPromptId, assetCategory, notify, setStatus,
  ]);

  if (!item || !draft) {
    return <div className="bb-muted">Select an image to preview.</div>;
  }

  return (
    <div className="bb-project-art-detail">
      <div className="bb-project-art-detail__hero">
        {url ? (
          <img className="bb-project-art-detail__preview" src={url} alt={item.title} />
        ) : (
          <div className="bb-project-art-detail__preview-empty bb-muted">No preview</div>
        )}
      </div>

      <div className="bb-project-art-detail__scroll">
        <div className="bb-project-art-detail__filename" title={item.relativePath}>
          {item.relativePath.split('/').pop()}
        </div>

        <details open={metaOpen} onToggle={(e) => setMetaOpen(e.currentTarget.open)}>
          <summary className="bb-project-art-detail__summary">Metadata</summary>
          <div className="bb-project-art-detail__meta">
            <div className="bb-project-art-detail__rating">
              <span className="bb-field-caption">Rating</span>
              <div className="bb-project-art-detail__stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`bb-project-art-detail__star${(draft.rating || 0) >= n ? ' is-on' : ''}`}
                    disabled={busy}
                    onClick={() => {
                      const rating = draft.rating === n ? 0 : n;
                      setDraft({ ...draft, rating });
                      projectArtUpdateItem(item.id, { rating }).catch((err) => notify(err.message));
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <label className="bb-project-art-detail__fav">
                <input
                  type="checkbox"
                  checked={Boolean(draft.favorite)}
                  disabled={busy}
                  onChange={(e) => {
                    const favorite = e.target.checked;
                    setDraft({ ...draft, favorite });
                    projectArtUpdateItem(item.id, { favorite }).catch((err) => notify(err.message));
                  }}
                />
                Favorite
              </label>
            </div>
            <label className="bb-field">
              <span className="bb-field-caption">Tags</span>
              <input
                className="bb-input"
                value={(draft.tags || []).join(', ')}
                disabled={busy}
                onChange={(e) => setDraft({
                  ...draft,
                  tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                })}
                onBlur={() => {
                  projectArtUpdateItem(item.id, { tags: draft.tags })
                    .catch((err) => notify(err.message));
                }}
              />
            </label>
            <label className="bb-field">
              <span className="bb-field-caption">Description</span>
              <textarea
                className="bb-input bb-openart__prompt"
                rows={3}
                value={draft.description || ''}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onBlur={() => {
                  projectArtUpdateItem(item.id, { description: draft.description })
                    .catch((err) => notify(err.message));
                }}
              />
            </label>
          </div>
        </details>

        <details open={promptOpen} onToggle={(e) => setPromptOpen(e.currentTarget.open)}>
          <summary className="bb-project-art-detail__summary">Generate Asset Prompt</summary>
          <div className="bb-project-art-detail__gen">
            <label className="bb-field">
              <span className="bb-field-caption">Asset Category</span>
              <select
                className="bb-select"
                value={assetCategory}
                onChange={(e) => setAssetCategory(e.target.value)}
              >
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="bb-field">
              <span className="bb-field-caption">Instruction</span>
              <textarea
                className="bb-input bb-openart__prompt"
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Describe the asset you want to generate…"
              />
            </label>
            <div className="bb-project-art-detail__tiles">
              <label>
                <input
                  type="checkbox"
                  checked={tileH}
                  onChange={(e) => setTileH(e.target.checked)}
                />
                {' '}
                Tile Horizontal
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tileV}
                  onChange={(e) => setTileV(e.target.checked)}
                />
                {' '}
                Tile Vertical
              </label>
            </div>

            <div className="bb-project-art-detail__ref-strip">
              <span className="bb-field-caption">References</span>
              <div className="bb-project-art__tray-strip">
                {refStrip.map((ref) => {
                  const rurl = projectArtPreviewUrl(ref.relativePath);
                  return (
                    <div key={ref.id} className="bb-project-art__tray-thumb" title={ref.title}>
                      {rurl ? <img src={rurl} alt="" /> : <span className="bb-muted">?</span>}
                    </div>
                  );
                })}
                {!refStrip.length && <span className="bb-muted">None selected</span>}
              </div>
            </div>

            <button
              type="button"
              className="bb-btn"
              disabled={analyzing || busy}
              onClick={onAnalyze}
            >
              Analyze References & Create Prompt
            </button>

            {promptSource === 'template' && (
              <div className="bb-project-art-detail__banner">
                Template-based prompt (not vision analysis). Review before generating.
              </div>
            )}

            <label className="bb-field">
              <span className="bb-field-caption">Generated prompt</span>
              <textarea
                className="bb-input bb-openart__prompt"
                rows={5}
                value={generatedPrompt}
                onChange={(e) => setGeneratedPrompt(e.target.value)}
              />
            </label>

            <div className="bb-project-art-detail__actions">
              <button
                type="button"
                className="bb-btn"
                disabled={busy || !generatedPrompt.trim()}
                onClick={onSavePrompt}
              >
                Save Prompt
              </button>
              <button
                type="button"
                className="bb-btn bb-btn--primary"
                disabled={busy || !generatedPrompt.trim()}
                onClick={onSendToGeneration}
              >
                Send to Asset Generation
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function ColumnResizeHandle({ onDelta, ariaLabel, title }) {
  const dragging = useRef(false);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('is-dragging');
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    onDelta?.(e.movementX);
  }, [onDelta]);

  const onPointerUp = useCallback((e) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.classList.remove('is-dragging');
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="bb-resize-v bb-project-art__splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      title={title || ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
