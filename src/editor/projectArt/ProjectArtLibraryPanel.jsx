import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import {
  LIBRARY_THUMB_SIZE_DEFAULT,
  LIBRARY_THUMB_SIZE_MAX,
  LIBRARY_THUMB_SIZE_MIN,
  addGenerationReferences,
  clearGenerationReferences,
  clearGenerationReferencesWarning,
  clearSelectedRegion,
  getAiAssetsUiState,
  removeGenerationReference,
  setLibraryThumbSize,
  setSelectedRegion,
  subscribeAiAssetsUi,
} from '../aiAssets/aiAssetsUiStore.js';
import {
  addItemsAsGenerationReferences,
  sendProjectArtToGeneration,
  sendProjectArtToMeshy,
  sendRegionToGeneration,
} from './generationHandoff.js';
import { describeRegionCoords, getPromptTemplate } from './promptTemplates.js';
import {
  deselectAll,
  getPrimarySelectedItem,
  getSelectedItems,
  getLibraryTagCounts,
  getVisibleEntries,
  copyExternalItemToProjectArt,
  openCollection,
  openExternalLibrary,
  openFolder,
  projectArtBootstrap,
  projectArtCopy,
  projectArtCreateCollection,
  projectArtCreatePrompt,
  projectArtCreateReferenceSet,
  projectArtDelete,
  projectArtDeleteCollection,
  projectArtFullImageUrl,
  projectArtImportImage,
  projectArtMkdir,
  projectArtMove,
  projectArtOpenInExplorer,
  projectArtPreviewUrl,
  projectArtRename,
  projectArtUpdateCollection,
  projectArtUpdateItem,
  rangeShift,
  selectAll,
  selectOnly,
  setSelection,
  setSortMode,
  setViewAll,
  setViewFavorites,
  setViewRecent,
  setViewTag,
  setExpandedPath,
  subscribeProjectArt,
  getProjectArtState,
  toggleCtrl,
  toggleExpandedPath,
  search as projectArtSearch,
  searchExternal as projectArtSearchExternal,
  googleDriveAddLibrary,
  googleDriveConnect,
  googleDriveDisconnect,
  googleDriveRefreshLibrary,
  googleDriveRemoveLibrary,
  loadMoreExternalFolder,
  refreshExternalLibraries,
} from './projectArtStore.js';

const LEFT_MIN = 180;
const LEFT_MAX = 300;
const RIGHT_MIN = 300;
const RIGHT_MAX = 460;

const DETAIL_TABS = ['details', 'prompt', 'generation'];

/**
 * Project Art Library — Adobe Bridge–inspired three-column browser.
 */
export function ProjectArtLibraryPanel() {
  const [store, setStore] = useState(() => getProjectArtState());
  const [aiUi, setAiUi] = useState(() => getAiAssetsUiState());
  const { confirm, prompt } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const { notify, setStatus } = useAssetBrowser();
  const fileRef = useRef(null);
  const loadedRef = useRef(false);
  const rootRef = useRef(null);
  const [leftW, setLeftW] = useState(220);
  const [rightW, setRightW] = useState(360);

  useEffect(() => subscribeProjectArt(setStore), []);
  useEffect(() => subscribeAiAssetsUi(setAiUi), []);
  useEffect(() => {
    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    projectArtBootstrap().catch((err) => notify(err.message));
    return undefined;
  }, [notify]);
  // Re-sync Drive auth/libraries when returning to the panel (tokens may change out-of-band).
  useEffect(() => {
    refreshExternalLibraries().catch(() => {});
    const onFocus = () => {
      refreshExternalLibraries().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

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

  const tagCounts = useMemo(() => getLibraryTagCounts(), [store.library]);

  const itemCount = useMemo(
    () => entries.filter((e) => e.type === 'file').length,
    [entries],
  );
  const selectedCount = store.selectedIds.length;

  const activeExternalLib = useMemo(
    () => (store.externalLibraries || []).find((l) => l.id === store.activeExternalLibraryId) || null,
    [store.externalLibraries, store.activeExternalLibraryId],
  );

  const breadcrumb = useMemo(() => {
    if (store.viewMode === 'favorites') return [{ label: 'Favorites', path: null }];
    if (store.viewMode === 'all') return [{ label: 'All Assets', path: null }];
    if (store.viewMode === 'recent') return [{ label: 'Recent', path: null }];
    if (store.viewMode === 'tag') {
      return [{ label: `Tag: ${store.tagFilter || '…'}`, path: null }];
    }
    if (store.viewMode === 'collection') {
      const col = collections.find((c) => c.id === store.activeCollectionId);
      return [{ label: col?.name || 'Collection', path: null }];
    }
    if (store.librarySource === 'gdrive' && activeExternalLib) {
      const parts = String(store.currentFolder || '').split('/').filter(Boolean);
      const crumbs = [{ label: activeExternalLib.name || 'Google Drive', path: '' }];
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        crumbs.push({ label: part, path: acc });
      }
      return crumbs;
    }
    const parts = String(store.currentFolder || '').split('/').filter(Boolean);
    const crumbs = [{ label: 'Project Art', path: '' }];
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }, [
    store.viewMode, store.currentFolder, store.activeCollectionId, store.tagFilter,
    store.librarySource, collections, activeExternalLib,
  ]);

  const runFolderAction = useCallback(async (action, node) => {
    try {
      if (action === 'open') {
        if (store.librarySource === 'gdrive' && store.activeExternalLibraryId) {
          await openExternalLibrary(store.activeExternalLibraryId, node?.path || '');
        } else {
          await openFolder(node?.path || '');
        }
        return;
      }
      if (store.librarySource === 'gdrive'
        && (action === 'new' || action === 'rename' || action === 'move'
          || action === 'copy' || action === 'delete' || action === 'explorer')) {
        notify('Google Drive libraries are read-only');
        return;
      }
      if (action === 'new') {
        const name = await prompt('New folder name', {
          title: 'New Folder',
          initialValue: 'New Folder',
        });
        if (!name) return;
        const path = node?.path ? `${node.path}/${name}` : name;
        await projectArtMkdir({ path });
        if (node?.path) setExpandedPath(node.path, true);
        await openFolder(path);
        setStatus(`Created folder “${name}”`);
        return;
      }
      if (action === 'rename') {
        if (!node?.path) return;
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
        setStatus(`Renamed to “${name}”`);
        return;
      }
      if (action === 'move' || action === 'copy') {
        if (!node?.path) return;
        const toDir = await prompt('Destination folder path (blank = root)', {
          title: action === 'move' ? 'Move Folder' : 'Copy Folder',
          initialValue: '',
        });
        if (toDir == null) return;
        const dest = String(toDir).trim();
        if (action === 'move') {
          await projectArtMove({ from: node.path, toDir: dest });
          await openFolder(dest ? `${dest}/${node.name}` : node.name);
          setStatus(`Moved “${node.name}”`);
        } else {
          await projectArtCopy({ from: node.path, toDir: dest });
          await openFolder(dest);
          setStatus(`Copied “${node.name}”`);
        }
        return;
      }
      if (action === 'delete') {
        if (!node?.path) return;
        const ok = await confirm(`Delete folder “${node.name}” and its contents?`, {
          title: 'Delete folder',
          confirmLabel: 'Delete',
          tone: 'warning',
        });
        if (!ok) return;
        await projectArtDelete({ path: node.path, recursive: true });
        await openFolder('');
        setStatus(`Deleted “${node.name}”`);
        return;
      }
      if (action === 'explorer') {
        await projectArtOpenInExplorer({ path: node?.path || '' });
      }
      if (action === 'refresh') {
        if (store.librarySource === 'gdrive' && store.activeExternalLibraryId) {
          await googleDriveRefreshLibrary(store.activeExternalLibraryId);
        } else {
          await openFolder(store.currentFolder || '');
        }
      }
      if (action === 'import') {
        if (store.librarySource === 'gdrive') {
          notify('Google Drive libraries are read-only');
          return;
        }
        fileRef.current?.click();
      }
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [
    confirm, prompt, notify, setStatus, store.currentFolder,
    store.librarySource, store.activeExternalLibraryId,
  ]);

  const runCollectionAction = useCallback(async (action, col) => {
    if (!col) return;
    try {
      if (action === 'open') {
        openCollection(col.id);
        return;
      }
      if (action === 'rename') {
        const name = await prompt('Rename collection', {
          title: 'Rename Collection',
          initialValue: col.name,
        });
        if (!name || name === col.name) return;
        await projectArtUpdateCollection({ id: col.id, patch: { name } });
        setStatus(`Renamed collection to “${name}”`);
        return;
      }
      if (action === 'add-selection') {
        if (!selectedItems.length) return;
        const merged = [...new Set([...(col.itemIds || []), ...selectedItems.map((t) => t.id)])];
        await projectArtUpdateCollection({ id: col.id, patch: { itemIds: merged } });
        setStatus(`Added ${selectedItems.length} item(s) to “${col.name}”`);
        return;
      }
      if (action === 'delete') {
        const ok = await confirm(`Delete collection “${col.name}”?`, {
          title: 'Delete collection',
          confirmLabel: 'Delete',
          tone: 'warning',
        });
        if (!ok) return;
        await projectArtDeleteCollection({ id: col.id });
        setStatus(`Deleted collection “${col.name}”`);
      }
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [confirm, prompt, notify, setStatus, selectedItems]);

  const selectionTargetsFor = useCallback((item) => (
    selectedItems.some((s) => s.id === item.id) ? selectedItems : [item]
  ), [selectedItems]);

  const runItemAction = useCallback(async (action, item, extra = null) => {
    if (!item) return;
    try {
      if (action === 'add-refs') {
        const targets = selectionTargetsFor(item);
        addItemsAsGenerationReferences(targets);
        setStatus(
          targets.length === 1
            ? 'Added to Generation References'
            : `Added ${targets.length} references`,
        );
        return;
      }
      if (action === 'send-generation') {
        const targets = selectionTargetsFor(item);
        const promptText = (
          item.generationPrompt
          || item.originalGenerationPrompt
          || targets.find((t) => t.generationPrompt || t.originalGenerationPrompt)?.generationPrompt
          || targets.find((t) => t.originalGenerationPrompt)?.originalGenerationPrompt
          || ''
        ).trim();
        const res = await sendProjectArtToGeneration({
          promptText,
          items: targets,
          trayRefs: aiUi.generationReferences,
          folderPath: store.currentFolder || '',
          promptId: item.associatedPromptIds?.[0] || null,
          assetCategory: item.provenance?.assetCategory || null,
          tileHorizontal: Boolean(item.provenance?.tileHorizontal),
          tileVertical: Boolean(item.provenance?.tileVertical),
        });
        if (res?.message) setStatus(res.message);
        return;
      }
      if (action === 'send-meshy') {
        const targets = selectionTargetsFor(item);
        const res = await sendProjectArtToMeshy({
          item: targets[0],
          items: targets,
          folderPath: store.currentFolder || '',
        });
        if (res?.message) setStatus(res.message);
        return;
      }
      if (action === 'copy-to-project-art') {
        const targets = selectionTargetsFor(item).filter((t) => t.source === 'gdrive');
        if (!targets.length) {
          notify('Select a Google Drive image to copy');
          return;
        }
        const folder = await prompt('Destination Project Art folder (blank = root)', {
          title: 'Copy to Project Art Library',
          initialValue: '',
        });
        if (folder == null) return;
        for (const t of targets) {
          await copyExternalItemToProjectArt(t, String(folder).trim());
        }
        setStatus(`Copied ${targets.length} image(s) into Project Art`);
        return;
      }
      if (action === 'favorite') {
        if (item.source === 'gdrive' || item.readOnly) {
          notify('Google Drive libraries are read-only — Copy to Project Art first');
          return;
        }
        await projectArtUpdateItem(item.id, { favorite: !item.favorite });
        return;
      }
      if (action === 'move' || action === 'copy') {
        if (item.source === 'gdrive' || item.readOnly) {
          notify('Google Drive libraries are read-only — use Copy to Project Art Library');
          return;
        }
        const targets = selectionTargetsFor(item);
        const toDir = await prompt('Destination folder path (blank = root)', {
          title: action === 'move' ? 'Move to Folder' : 'Copy to Folder',
          initialValue: store.currentFolder || '',
        });
        if (toDir == null) return;
        const dest = String(toDir).trim();
        for (const t of targets) {
          if (action === 'move') {
            await projectArtMove({ from: t.relativePath, toDir: dest });
          } else {
            await projectArtCopy({ from: t.relativePath, toDir: dest });
          }
        }
        await openFolder(dest);
        setStatus(
          action === 'move'
            ? `Moved ${targets.length} image(s)`
            : `Copied ${targets.length} image(s)`,
        );
        return;
      }
      if (action === 'add-to-collection' || action === 'new-collection'
        || action === 'rename' || action === 'delete' || action === 'explorer') {
        if (item.source === 'gdrive' || item.readOnly) {
          notify('Google Drive libraries are read-only — Copy to Project Art Library first');
          return;
        }
      }
      if (action === 'add-to-collection') {
        const collectionId = extra;
        if (!collectionId) return;
        const col = (store.library.collections || []).find((c) => c.id === collectionId);
        if (!col) return;
        const targets = selectionTargetsFor(item);
        const merged = [...new Set([...(col.itemIds || []), ...targets.map((t) => t.id)])];
        await projectArtUpdateCollection({ id: collectionId, patch: { itemIds: merged } });
        setStatus(`Added to “${col.name}”`);
        return;
      }
      if (action === 'new-collection') {
        const targets = selectionTargetsFor(item);
        const name = await prompt('Collection name', {
          title: 'New Collection',
          initialValue: 'New Collection',
        });
        if (!name) return;
        const res = await projectArtCreateCollection({
          name,
          itemIds: targets.map((t) => t.id),
        });
        if (res.id) openCollection(res.id);
        setStatus(`Created collection “${name}”`);
        return;
      }
      if (action === 'rename') {
        const name = await prompt('Rename image', {
          title: 'Rename',
          initialValue: item.relativePath.split('/').pop() || item.title,
        });
        if (!name || name === item.relativePath.split('/').pop()) return;
        await projectArtRename({ path: item.relativePath, newName: name });
        await openFolder(store.currentFolder || '');
        setStatus(`Renamed to “${name}”`);
        return;
      }
      if (action === 'delete') {
        const targets = selectionTargetsFor(item);
        const label = targets.length === 1
          ? `Delete “${targets[0].title}”?`
          : `Delete ${targets.length} images?`;
        const ok = await confirm(label, {
          title: 'Delete',
          confirmLabel: 'Delete',
          tone: 'warning',
        });
        if (!ok) return;
        for (const t of targets) {
          await projectArtDelete({ path: t.relativePath });
        }
        await openFolder(store.currentFolder || '');
        setStatus(`Deleted ${targets.length} image(s)`);
        return;
      }
      if (action === 'explorer') {
        await projectArtOpenInExplorer({ path: item.relativePath });
      }
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [
    confirm, prompt, notify, setStatus, selectionTargetsFor,
    store.currentFolder, store.library.collections, aiUi.generationReferences,
  ]);

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
          <span className="bb-panel-chrome__title">Library</span>
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
          <div className="bb-project-art__nav-section" {...helpProps('projectArt.nav.filters')}>
            <span className="bb-project-art__nav-section-title">Project Library</span>
            <ul className="bb-project-art__filter-list">
              <li>
                <button
                  type="button"
                  className={`bb-project-art__filter${store.viewMode === 'all' ? ' is-active' : ''}`}
                  onClick={() => setViewAll()}
                >
                  All Assets
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`bb-project-art__filter${store.viewMode === 'recent' ? ' is-active' : ''}`}
                  onClick={() => setViewRecent()}
                >
                  Recent
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`bb-project-art__filter${store.viewMode === 'favorites' ? ' is-active' : ''}`}
                  onClick={() => setViewFavorites()}
                >
                  Favorites
                </button>
              </li>
            </ul>
          </div>

          <div className="bb-project-art__nav-section">
            <span className="bb-project-art__nav-section-title">Projects</span>
            <FolderTree
              nodes={store.tree}
              currentFolder={store.librarySource === 'local' ? store.currentFolder : null}
              expandedPaths={store.expandedPaths}
              viewMode={store.viewMode}
              onOpen={(path) => openFolder(path).catch((err) => notify(err.message))}
              onToggle={toggleExpandedPath}
              onContextMenu={(event, node) => {
                openFromEvent(event, buildFolderMenuItems({
                  node,
                  isRoot: !node?.path,
                  run: (action) => runFolderAction(action, node),
                }));
              }}
            />
          </div>

          <div
            className="bb-project-art__nav-section"
            {...helpProps('projectArt.nav.externalLibraries')}
          >
            <div className="bb-project-art__collections-head">
              <span className="bb-project-art__nav-section-title">External Libraries</span>
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                onClick={async () => {
                  const url = await prompt('Google Drive folder URL', {
                    title: 'Add Google Drive Folder',
                    initialValue: '',
                    placeholder: 'https://drive.google.com/drive/folders/…',
                  });
                  if (!url) return;
                  try {
                    setStatus('Adding Google Drive folder…');
                    const res = await googleDriveAddLibrary(url);
                    setStatus(`Connected “${res.library?.name || 'Google Drive'}”`);
                    if (res.library?.id) {
                      await openExternalLibrary(res.library.id, '');
                    }
                  } catch (err) {
                    notify(err.message || String(err));
                  }
                }}
              >
                Add
              </button>
            </div>
            <div className="bb-project-art__ext-auth bb-muted">
              {store.externalAuth?.authenticated
                ? 'Google: connected (read-only)'
                : store.externalAuth?.configured
                  ? 'Google: not signed in'
                  : 'Google: OAuth not configured'}
              {!store.externalAuth?.authenticated && store.externalAuth?.configured && (
                <button
                  type="button"
                  className="bb-btn bb-btn--ghost"
                  disabled={store.busy}
                  onClick={async () => {
                    try {
                      setStatus('Checking Google Drive sign-in…');
                      // Tokens may already exist from a prior sign-in; sync UI before opening OAuth.
                      const status = await refreshExternalLibraries();
                      if (status?.authenticated) {
                        notify('Google account is already connected');
                        setStatus('Google: connected (read-only)');
                        return;
                      }
                      setStatus('Opening Google sign-in…');
                      const res = await googleDriveConnect();
                      if (res?.alreadyAuthenticated) {
                        notify('Google account is already connected');
                      } else {
                        notify(res.message || 'Finish Google sign-in in the browser, then return here.');
                      }
                      setStatus(res?.alreadyAuthenticated
                        ? 'Google: connected (read-only)'
                        : 'Waiting for Google sign-in…');
                    } catch (err) {
                      notify(err.message || String(err));
                      setStatus('Google sign-in failed');
                    }
                  }}
                >
                  Connect Google Account
                </button>
              )}
              {store.externalAuth?.authenticated && (
                <button
                  type="button"
                  className="bb-btn bb-btn--ghost"
                  onClick={() => {
                    googleDriveDisconnect()
                      .then(() => setStatus('Google account disconnected'))
                      .catch((err) => notify(err.message));
                  }}
                >
                  Disconnect
                </button>
              )}
              {!store.externalAuth?.configured && (
                <span title={store.externalAuth?.setupHint || ''}>
                  {store.externalAuth?.setupHint
                    || 'Create a Desktop OAuth client, enable Drive API, save .google-drive-oauth.json'}
                </span>
              )}
            </div>
            <ul className="bb-project-art__collection-list">
              {(store.externalLibraries || []).map((lib) => {
                const active = store.librarySource === 'gdrive'
                  && store.activeExternalLibraryId === lib.id;
                return (
                  <li key={lib.id}>
                    <button
                      type="button"
                      className={`bb-project-art__collection${active ? ' is-active' : ''}`}
                      onClick={async () => {
                        try {
                          if (!store.externalAuth?.authenticated) {
                            await refreshExternalLibraries();
                          }
                          await openExternalLibrary(lib.id, '');
                        } catch (err) {
                          notify(err.message);
                        }
                      }}
                      onContextMenu={(event) => {
                        openFromEvent(event, [
                          {
                            id: 'open',
                            label: 'Open Library',
                            onSelect: () => openExternalLibrary(lib.id, '')
                              .catch((err) => notify(err.message)),
                          },
                          {
                            id: 'refresh',
                            label: 'Refresh Folder',
                            onSelect: () => googleDriveRefreshLibrary(lib.id)
                              .then(() => setStatus(`Refreshed “${lib.name}”`))
                              .catch((err) => notify(err.message)),
                          },
                          {
                            id: 'browser',
                            label: 'Open in Google Drive',
                            onSelect: () => {
                              const href = lib.webViewLink || lib.sourceUrl;
                              if (href) window.open(href, '_blank', 'noopener,noreferrer');
                            },
                          },
                          { id: 'sep', separator: true },
                          {
                            id: 'remove',
                            label: 'Remove Library',
                            danger: true,
                            onSelect: () => googleDriveRemoveLibrary(lib.id)
                              .then(() => setStatus(`Removed “${lib.name}”`))
                              .catch((err) => notify(err.message)),
                          },
                        ]);
                      }}
                      title={lib.sourceUrl || lib.folderId}
                    >
                      {lib.name || 'Google Drive'}
                    </button>
                  </li>
                );
              })}
              {!(store.externalLibraries || []).length && (
                <li className="bb-muted" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Add a Google Drive folder URL to browse shared concept art.
                </li>
              )}
            </ul>
          </div>

          <div className="bb-project-art__nav-section" {...helpProps('projectArt.nav.collections')}>
            <div className="bb-project-art__collections">
            <div className="bb-project-art__collections-head">
              <span className="bb-project-art__nav-section-title">Collections</span>
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
                    onContextMenu={(event) => {
                      openFromEvent(event, buildCollectionMenuItems({
                        col,
                        hasSelection: selectedItems.length > 0,
                        run: (action) => runCollectionAction(action, col),
                      }));
                    }}
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
                          await runCollectionAction('delete', col);
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

          <div className="bb-project-art__nav-section" {...helpProps('projectArt.nav.tags')}>
            <span className="bb-project-art__nav-section-title">Tags</span>
            <ul className="bb-project-art__filter-list">
              {tagCounts.length === 0 && (
                <li className="bb-muted">No tags yet</li>
              )}
              {tagCounts.map(({ tag, count }) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={`bb-project-art__filter${
                      store.viewMode === 'tag' && store.tagFilter === tag ? ' is-active' : ''
                    }`}
                    onClick={() => setViewTag(tag)}
                  >
                    <span>{tag}</span>
                    <span className="bb-muted">{count}</span>
                  </button>
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
                    onClick={() => {
                      if (store.librarySource === 'gdrive' && store.activeExternalLibraryId) {
                        openExternalLibrary(store.activeExternalLibraryId, crumb.path)
                          .catch((err) => notify(err.message));
                      } else {
                        openFolder(crumb.path).catch((err) => notify(err.message));
                      }
                    }}
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
                if (store.librarySource === 'gdrive') {
                  // Client-side filter of the currently loaded Drive folder page.
                  projectArtSearchExternal(q);
                } else {
                  projectArtSearch(q).catch((err) => notify(err.message));
                }
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
            <button
              type="button"
              className="bb-btn"
              disabled={
                store.busy
                || store.librarySource === 'gdrive'
                || store.viewMode !== 'folder'
                || !store.currentFolder
              }
              title={
                store.librarySource === 'gdrive'
                  ? 'Google Drive folders are read-only — Copy to Project Art Library first'
                  : store.currentFolder
                    ? 'Import images into this folder'
                    : 'Open a folder before importing'
              }
              onClick={() => fileRef.current?.click()}
              {...helpProps(
                'projectArt.import',
                store.librarySource === 'gdrive'
                  ? 'External Drive folders are read-only.'
                  : store.viewMode !== 'folder' || !store.currentFolder
                    ? 'Open a folder before importing.'
                    : null,
              )}
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
            onOpenFolder={(path) => {
              if (store.librarySource === 'gdrive' && store.activeExternalLibraryId) {
                openExternalLibrary(store.activeExternalLibraryId, path)
                  .catch((err) => notify(err.message));
              } else {
                openFolder(path).catch((err) => notify(err.message));
              }
            }}
            onFolderContextMenu={(event, entry) => {
              openFromEvent(event, buildFolderMenuItems({
                node: { path: entry.path, name: entry.name },
                isRoot: false,
                readOnly: store.librarySource === 'gdrive' || entry.source === 'gdrive',
                run: (action) => runFolderAction(action, { path: entry.path, name: entry.name }),
              }));
            }}
            onItemContextMenu={(event, item) => {
              // Preserve multi-select: only replace selection when RMB target is outside it.
              if (!store.selectedIds.includes(item.id)) selectOnly(item.id);
              openFromEvent(event, buildImageMenuItems({
                item,
                multiCount: store.selectedIds.includes(item.id)
                  ? Math.max(1, store.selectedIds.length)
                  : 1,
                collections,
                run: (action, extra) => runItemAction(action, item, extra),
              }));
            }}
            onBackgroundContextMenu={(event) => {
              openFromEvent(event, buildGalleryBackgroundMenuItems({
                hasFolder: Boolean(store.currentFolder) && store.viewMode === 'folder',
                run: (action) => runFolderAction(action, {
                  path: store.currentFolder || '',
                  name: store.currentFolder?.split('/').pop() || 'Project Art',
                }),
              }));
            }}
            onImportFiles={async (files) => {
              if (store.librarySource === 'gdrive') {
                notify('Google Drive libraries are read-only — Copy to Project Art Library first');
                return;
              }
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
          {store.librarySource === 'gdrive' && store.externalNextPageToken && (
            <div className="bb-project-art__load-more">
              <button
                type="button"
                className="bb-btn"
                disabled={store.busy}
                onClick={() => {
                  loadMoreExternalFolder()
                    .then(() => setStatus('Loaded more Google Drive items'))
                    .catch((err) => notify(err.message));
                }}
              >
                Load more
              </button>
            </div>
          )}
        </div>

        <div className="bb-project-art__status">
          <span>
            {itemCount}
            {' '}
            item
            {itemCount === 1 ? '' : 's'}
            {' | '}
            {selectedCount}
            {' '}
            selected
          </span>
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
        </div>

        <GenerationReferencesTray
          refs={aiUi.generationReferences}
          selectedItems={selectedItems}
          notify={notify}
          setStatus={setStatus}
          prompt={prompt}
          confirm={confirm}
          openFromEvent={openFromEvent}
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
            selectedTemplateId={aiUi.selectedPromptTemplateId}
            currentFolder={store.currentFolder}
            collections={collections}
            busy={store.busy}
            notify={notify}
            setStatus={setStatus}
            openFromEvent={openFromEvent}
            runItemAction={runItemAction}
          />
        </div>
      </section>
    </div>
  );
}

function FolderTree({
  nodes, currentFolder, expandedPaths, viewMode, onOpen, onToggle, onContextMenu,
}) {
  return (
    <ul className="bb-project-art__tree">
      <li>
        <div className="bb-project-art__tree-row">
          <span className="bb-project-art__tree-twist is-spacer" />
          <button
            type="button"
            className={`bb-project-art__tree-node${
              viewMode === 'folder' && currentFolder === '' ? ' is-active' : ''
            }`}
            onClick={() => onOpen('')}
            onContextMenu={(e) => onContextMenu?.(e, { path: '', name: 'Project Art' })}
          >
            <span className="bb-project-art__tree-label">Project Art</span>
          </button>
        </div>
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
          onContextMenu={onContextMenu}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node, depth, currentFolder, expandedPaths, viewMode, onOpen, onToggle, onContextMenu,
}) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const expanded = Boolean(expandedPaths[node.path]) || currentFolder === node.path
    || String(currentFolder || '').startsWith(`${node.path}/`);
  const active = viewMode === 'folder' && currentFolder === node.path;

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
          onContextMenu={(e) => onContextMenu?.(e, node)}
        >
          <span className="bb-project-art__tree-label">{node.name}</span>
        </button>
        <button
          type="button"
          className="bb-btn bb-btn--ghost bb-project-art__tree-more"
          aria-label="Folder actions"
          onClick={(e) => onContextMenu?.(e, node)}
        >
          ⋯
        </button>
      </div>
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
              onContextMenu={onContextMenu}
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
  onFolderContextMenu,
  onItemContextMenu,
  onBackgroundContextMenu,
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
    // Don't start marquee on image tiles or folder buttons — capture would steal the click.
    if (e.target.closest('[data-id], .bb-project-art__folder-tile, button, a, input, textarea, select')) {
      return;
    }
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
      {...helpProps('projectArt.gallery')}
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        if (e.target.closest('[data-id]') || e.target.closest('.bb-project-art__folder-tile')) return;
        onBackgroundContextMenu?.(e);
      }}
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
              onContextMenu={(e) => onFolderContextMenu?.(e, entry)}
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
            onContextMenu={(e) => onItemContextMenu?.(e, item)}
          >
            {url ? (
              <img
                src={url}
                alt={item.title}
                className="bb-project-art__tile-img"
                draggable={false}
                onContextMenu={(e) => onItemContextMenu?.(e, item)}
              />
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

function GenerationReferencesTray({
  refs, selectedItems, notify, setStatus, prompt, confirm, openFromEvent,
}) {
  const saveReferenceSet = useCallback(async () => {
    if (!refs.length) return;
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
  }, [refs, prompt, setStatus, notify]);

  const clearAll = useCallback(async () => {
    if (!refs.length) return;
    const ok = await confirm(`Clear ${refs.length} generation reference(s)?`, {
      title: 'Clear References',
      confirmLabel: 'Clear',
      tone: 'warning',
    });
    if (!ok) return;
    clearGenerationReferences();
    setStatus('Cleared generation references');
  }, [refs.length, confirm, setStatus]);

  const openRefInLibrary = useCallback(async (ref) => {
    if (!ref?.relativePath) return;
    const folder = ref.relativePath.includes('/')
      ? ref.relativePath.slice(0, ref.relativePath.lastIndexOf('/'))
      : '';
    try {
      await openFolder(folder);
      selectOnly(ref.id);
      setStatus(`Opened “${ref.title || ref.id}” in library`);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [notify, setStatus]);

  return (
    <div className="bb-project-art__tray" {...helpProps('projectArt.tray')}>
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
            onClick={saveReferenceSet}
          >
            Save Reference Set
          </button>
        </div>
      </div>
      <div
        className="bb-project-art__tray-strip"
        onContextMenu={(event) => {
          if (event.target !== event.currentTarget
            && !event.target?.classList?.contains('bb-project-art__tray-empty')) {
            return;
          }
          openFromEvent(event, buildTrayBackgroundMenuItems({
            hasRefs: refs.length > 0,
            run: (action) => {
              if (action === 'clear') clearAll();
              if (action === 'save-set') saveReferenceSet();
            },
          }));
        }}
      >
        {refs.map((ref) => {
          const url = projectArtPreviewUrl(ref.relativePath);
          return (
            <div
              key={ref.id}
              className="bb-project-art__tray-thumb"
              title={ref.title}
              onContextMenu={(event) => {
                openFromEvent(event, buildTrayThumbMenuItems({
                  ref,
                  run: (action) => {
                    if (action === 'remove') {
                      removeGenerationReference(ref.id);
                      setStatus(`Removed “${ref.title || ref.id}” from tray`);
                    }
                    if (action === 'open') openRefInLibrary(ref);
                  },
                }));
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  onContextMenu={(event) => {
                    openFromEvent(event, buildTrayThumbMenuItems({
                      ref,
                      run: (action) => {
                        if (action === 'remove') {
                          removeGenerationReference(ref.id);
                          setStatus(`Removed “${ref.title || ref.id}” from tray`);
                        }
                        if (action === 'open') openRefInLibrary(ref);
                      },
                    }));
                  }}
                />
              ) : <span className="bb-muted">?</span>}
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
  item,
  selectedItems,
  trayRefs,
  selectedTemplateId,
  currentFolder,
  collections = [],
  busy,
  notify,
  setStatus,
  openFromEvent,
  runItemAction,
}) {
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [workingPrompt, setWorkingPrompt] = useState('');
  const [savedPromptId, setSavedPromptId] = useState(null);
  const [regionMode, setRegionMode] = useState(false);
  // Normalized region (0..1 of natural image size) for the current item.
  const [region, setRegion] = useState(null);
  // Live rectangle while dragging (same normalized units).
  const [dragRegion, setDragRegion] = useState(null);
  const imgRef = useRef(null);
  const dragStartRef = useRef(null);

  useEffect(() => {
    setDraft(item ? {
      ...item,
      tags: [...(item.tags || [])],
    } : null);
    const saved = item?.generationPrompt || item?.originalGenerationPrompt || '';
    setWorkingPrompt(saved);
    setSavedPromptId(item?.associatedPromptIds?.[0] || null);
    setActiveTab('details');
    // Regions belong to one item: restore a stored region for this item (e.g.
    // after switching workspace tabs), otherwise clear.
    setRegionMode(false);
    setDragRegion(null);
    dragStartRef.current = null;
    const stored = getAiAssetsUiState().selectedRegion;
    if (stored && item?.id && stored.itemId === item.id) {
      setRegion(stored);
    } else {
      setRegion(null);
      clearSelectedRegion();
    }
  }, [item?.id]);

  // Map a pointer event to normalized coords of the image content box
  // (object-fit: contain letterboxes inside the element rect).
  const pointToNormalized = useCallback((event) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const left = rect.left + (rect.width - w) / 2;
    const top = rect.top + (rect.height - h) / 2;
    return {
      x: clamp((event.clientX - left) / w, 0, 1),
      y: clamp((event.clientY - top) / h, 0, 1),
    };
  }, []);

  const rectFromPoints = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });

  const onStagePointerDown = useCallback((event) => {
    if (!regionMode || event.button !== 0) return;
    const point = pointToNormalized(event);
    if (!point) return;
    event.preventDefault();
    dragStartRef.current = point;
    setDragRegion({ ...point, width: 0, height: 0 });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [regionMode, pointToNormalized]);

  const onStagePointerMove = useCallback((event) => {
    const start = dragStartRef.current;
    if (!start) return;
    const point = pointToNormalized(event);
    if (point) setDragRegion(rectFromPoints(start, point));
  }, [pointToNormalized]);

  const onStagePointerUp = useCallback((event) => {
    const start = dragStartRef.current;
    if (!start) return;
    dragStartRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    const point = pointToNormalized(event);
    setDragRegion(null);
    if (!point || !item) return;
    const rect = rectFromPoints(start, point);
    // Ignore accidental clicks; keep the previous region.
    if (rect.width < 0.01 || rect.height < 0.01) return;
    const img = imgRef.current;
    const committed = {
      itemId: item.id,
      relativePath: item.relativePath,
      title: item.title,
      ...rect,
      naturalWidth: img?.naturalWidth || 0,
      naturalHeight: img?.naturalHeight || 0,
    };
    setRegion(committed);
    setSelectedRegion(committed);
    setRegionMode(false);
  }, [pointToNormalized, item]);

  const onClearRegion = useCallback(() => {
    setRegion(null);
    setDragRegion(null);
    dragStartRef.current = null;
    clearSelectedRegion();
  }, []);

  // Image content-box metrics for region overlays (avoid reading refs during render).
  const [imageLayout, setImageLayout] = useState(null);
  const bumpLayout = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth || !img.clientWidth || !img.clientHeight) {
      setImageLayout(null);
      return;
    }
    const scale = Math.min(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    setImageLayout({
      w,
      h,
      offX: img.offsetLeft + (img.clientWidth - w) / 2,
      offY: img.offsetTop + (img.clientHeight - h) / 2,
    });
  }, []);
  const hasDraft = Boolean(draft);
  useEffect(() => {
    const img = imgRef.current;
    if (!hasDraft || !img || typeof ResizeObserver === 'undefined') return undefined;
    bumpLayout();
    const observer = new ResizeObserver(bumpLayout);
    observer.observe(img);
    return () => observer.disconnect();
  }, [item?.id, hasDraft, bumpLayout]);

  const overlayStyle = useCallback((r) => {
    if (!r || !imageLayout) return null;
    return {
      left: imageLayout.offX + r.x * imageLayout.w,
      top: imageLayout.offY + r.y * imageLayout.h,
      width: r.width * imageLayout.w,
      height: r.height * imageLayout.h,
    };
  }, [imageLayout]);

  const prov = item?.provenance || {};
  const assetCategory = prov.assetCategory || 'environment_concept';
  const tileH = Boolean(prov.tileHorizontal);
  const tileV = Boolean(prov.tileVertical);
  const originalPrompt = item?.originalGenerationPrompt || prov.finalPrompt || '';
  const promptForSend = (workingPrompt || item?.generationPrompt || item?.originalGenerationPrompt || '').trim();
  const filename = item ? (item.relativePath?.split('/').pop() || item.title) : '';
  const folderLocation = item?.relativePath?.includes('/')
    ? item.relativePath.slice(0, item.relativePath.lastIndexOf('/'))
    : '(root)';
  const url = item
    ? (projectArtFullImageUrl(item) || projectArtPreviewUrl(item))
    : null;
  const refTargets = selectedItems.length ? selectedItems : (item ? [item] : []);

  const onSavePrompt = useCallback(async () => {
    if (!workingPrompt.trim()) {
      notify('Nothing to save — enter a prompt first');
      return;
    }
    try {
      if (item?.id) {
        await projectArtUpdateItem(item.id, { generationPrompt: workingPrompt });
        setDraft((prev) => (prev ? { ...prev, generationPrompt: workingPrompt } : prev));
      }
      const res = await projectArtCreatePrompt({
        name: `${item?.title || filename || 'Asset'} prompt`,
        promptText: workingPrompt,
        assetCategory,
        tileHorizontal: tileH,
        tileVertical: tileV,
        itemIds: item?.id ? [item.id] : [],
        category: 'other',
      });
      setSavedPromptId(res.promptId || null);
      setStatus('Prompt saved with image');
    } catch (err) {
      notify(err.message);
    }
  }, [workingPrompt, assetCategory, tileH, tileV, notify, setStatus, item, filename]);

  const onSendToGeneration = useCallback(async () => {
    try {
      const res = await sendProjectArtToGeneration({
        promptText: promptForSend,
        items: refTargets,
        trayRefs,
        folderPath: currentFolder || '',
        promptId: savedPromptId || item?.associatedPromptIds?.[0] || null,
        assetCategory,
        tileHorizontal: tileH,
        tileVertical: tileV,
      });
      if (res?.message) setStatus(res.message);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [
    promptForSend, refTargets, trayRefs, currentFolder, savedPromptId, item,
    assetCategory, tileH, tileV, notify, setStatus,
  ]);

  const onSendRegion = useCallback(async () => {
    if (!item || !region) return;
    try {
      // Prefer the Asset Generation template selection — never the source
      // concept's provenance category (that describes the old bedroom scene).
      const templateId = [selectedTemplateId, 'wall_texture']
        .find((id) => id && getPromptTemplate(id));
      const res = await sendRegionToGeneration({
        item,
        region,
        templateId,
        // Tiling comes from template suggestedDefaults / Asset Generation checkboxes.
        folderPath: currentFolder || '',
        promptId: savedPromptId || item.associatedPromptIds?.[0] || null,
      });
      const message = res?.message || 'Region sent to Asset Generation';
      setStatus(message);
      notify(message);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [
    item, region, selectedTemplateId, currentFolder, savedPromptId, notify, setStatus,
  ]);

  const onUseAsReference = useCallback(() => {
    const res = addItemsAsGenerationReferences(refTargets);
    if (res.added) {
      setStatus(res.added === 1 ? 'Added to Generation References' : `Added ${res.added} references`);
    }
  }, [refTargets, setStatus]);

  const onSendToMeshy = useCallback(async () => {
    if (!item) return;
    try {
      const res = await sendProjectArtToMeshy({
        item,
        region: region || null,
        folderPath: currentFolder || '',
      });
      const message = res?.message || 'Sent to Meshy';
      setStatus(message);
      notify(message);
    } catch (err) {
      notify(err.message || String(err));
    }
  }, [item, region, currentFolder, notify, setStatus]);

  if (!item || !draft) {
    return <div className="bb-muted">Select an image to preview.</div>;
  }

  return (
    <div className="bb-project-art-detail">
      <div className="bb-project-art-detail__hero">
        {url ? (
          <div
            className={`bb-project-art-detail__hero-stage${
              regionMode ? ' bb-project-art-detail__region-mode' : ''
            }`}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
          >
            <img
              ref={imgRef}
              className="bb-project-art-detail__preview"
              src={url}
              alt={item.title}
              draggable={false}
              onLoad={bumpLayout}
              onContextMenu={(event) => {
                // RMB opens the image menu; region select stays LMB-only.
                if (!openFromEvent || !runItemAction) {
                  event.preventDefault();
                  return;
                }
                openFromEvent(event, buildImageMenuItems({
                  item,
                  multiCount: selectedItems.some((s) => s.id === item.id)
                    ? Math.max(1, selectedItems.length)
                    : 1,
                  collections,
                  run: (action, extra) => runItemAction(action, item, extra),
                }));
              }}
            />
            {[['drag', dragRegion], ['region', dragRegion ? null : region]].map(([key, r]) => {
              const style = r ? overlayStyle(r) : null;
              if (!style) return null;
              return (
                <div
                  key={key}
                  className="bb-project-art-detail__region"
                  style={style}
                  aria-label="Selected region"
                >
                  <span className="bb-project-art-detail__region-handle is-nw" />
                  <span className="bb-project-art-detail__region-handle is-ne" />
                  <span className="bb-project-art-detail__region-handle is-sw" />
                  <span className="bb-project-art-detail__region-handle is-se" />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bb-project-art-detail__preview-empty bb-muted">No preview</div>
        )}
        {url && (
          <div className="bb-project-art-detail__hero-tools">
            <button
              type="button"
              className={`bb-btn bb-btn--ghost${regionMode ? ' is-active' : ''}`}
              disabled={busy}
              aria-pressed={regionMode}
              title="Drag on the image to select a region"
              onClick={() => setRegionMode((on) => !on)}
              {...helpProps('projectArt.region.select')}
            >
              {regionMode ? 'Drawing… (drag on image)' : 'Select Region'}
            </button>
            {region && (
              <button
                type="button"
                className="bb-btn bb-btn--ghost"
                onClick={onClearRegion}
                {...helpProps('projectArt.region.clear')}
              >
                Clear Region
              </button>
            )}
          </div>
        )}
      </div>

      <header className="bb-project-art-detail__header">
        <span className="bb-project-art-detail__filename" title={item.relativePath}>
          {filename}
        </span>
        <button
          type="button"
          className={`bb-btn bb-btn--ghost bb-project-art-detail__fav-btn${
            draft.favorite ? ' is-on' : ''
          }`}
          disabled={busy}
          aria-label={draft.favorite ? 'Remove favorite' : 'Add favorite'}
          title={draft.favorite ? 'Remove favorite' : 'Add favorite'}
          onClick={() => {
            const favorite = !draft.favorite;
            setDraft({ ...draft, favorite });
            projectArtUpdateItem(item.id, { favorite }).catch((err) => notify(err.message));
          }}
        >
          {draft.favorite ? '★' : '☆'}
        </button>
      </header>

      <div
        className="bb-project-art-detail__tabs"
        role="tablist"
        aria-label="Preview sections"
        {...helpProps('projectArt.detail.tabs')}
      >
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`bb-project-art-detail__tab${activeTab === tab ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'details' ? 'Details' : tab === 'prompt' ? 'Prompt' : 'Generation'}
          </button>
        ))}
      </div>

      <div className="bb-project-art-detail__scroll">
        {activeTab === 'details' && (
          <div className="bb-project-art-detail__meta">
            <DetailMetaRow label="Filename" value={filename} />
            <DetailMetaRow label="Location" value={folderLocation} />
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
                rows={4}
                value={draft.description || ''}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onBlur={() => {
                  projectArtUpdateItem(item.id, { description: draft.description })
                    .catch((err) => notify(err.message));
                }}
              />
            </label>
            <div className="bb-project-art-detail__meta-grid">
              <DetailMetaRow label="Type" value="Concept" />
              <DetailMetaRow label="Created" value={formatArtDate(item.createdAt || item.updatedAt)} />
              <DetailMetaRow label="Model" value={prov.modelId || prov.model} />
              <DetailMetaRow label="Generation ID" value={prov.generationId} />
              <DetailMetaRow label="Provider" value={prov.provider} />
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div className="bb-project-art-detail__prompt">
            <p className="bb-muted bb-project-art-detail__hint">
              Optional. Send to Generation transfers a saved prompt when present; otherwise compose in Asset Generation.
            </p>
            <label className="bb-field">
              <span className="bb-field-caption">Working generation prompt</span>
              <textarea
                className="bb-input bb-openart__prompt"
                rows={10}
                value={workingPrompt}
                disabled={busy}
                onChange={(e) => setWorkingPrompt(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="bb-btn"
              disabled={busy || !workingPrompt.trim()}
              onClick={onSavePrompt}
            >
              Save Prompt
            </button>
          </div>
        )}

        {activeTab === 'generation' && (
          <div className="bb-project-art-detail__generation">
            <div className="bb-project-art-detail__meta-grid">
              {originalPrompt ? (
                <div className="bb-project-art-detail__meta-row">
                  <span className="bb-field-caption">Original prompt</span>
                  <pre className="bb-project-art-detail__original-text">{originalPrompt}</pre>
                </div>
              ) : null}
              <DetailMetaRow label="Provider" value={prov.provider} />
              <DetailMetaRow label="Model" value={prov.modelId || prov.model} />
              <DetailMetaRow label="Mode" value={prov.mode} />
              <DetailMetaRow label="Generation ID" value={prov.generationId} />
              <DetailMetaRow label="Job ID" value={prov.jobId || prov.openArtJobId} />
              <DetailMetaRow label="Staging ID" value={prov.stagingId || prov.stagingPath} />
              <DetailMetaRow label="Settings" value={summarizeFormValues(prov.formValues)} />
              <DetailMetaRow
                label="Tiling"
                value={
                  prov.tileHorizontal || prov.tileVertical
                    ? [
                      prov.tileHorizontal ? 'Horizontal' : null,
                      prov.tileVertical ? 'Vertical' : null,
                    ].filter(Boolean).join(', ')
                    : null
                }
              />
              <DetailMetaRow label="Asset category" value={prov.assetCategory} />
              <DetailMetaRow label="Prompt template" value={prov.promptTemplateId} />
              <DetailMetaRow
                label="Source region"
                value={prov.sourceRegion
                  ? `${prov.sourceRegion.title || prov.sourceItemId || ''} — ${describeRegionCoords(prov.sourceRegion)}`
                  : null}
              />
              <DetailMetaRow
                label="Cropped reference"
                value={prov.croppedReference?.stagingId
                  || prov.croppedReference?.fileName
                  || prov.croppedReference?.originalName
                  || null}
              />
            </div>
            <span className="bb-field-caption">Source references</span>
            {trayRefs.length ? (
              <div className="bb-project-art__tray-strip">
                {trayRefs.map((ref) => {
                  const rurl = projectArtPreviewUrl(ref.relativePath);
                  return (
                    <div key={ref.id} className="bb-project-art__tray-thumb" title={ref.title}>
                      {rurl ? <img src={rurl} alt="" /> : <span className="bb-muted">?</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="bb-muted">
                Reference images for this item are managed in the Generation References tray below the gallery.
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="bb-project-art-detail__footer">
        <div className="bb-project-art-detail__actions">
          <button
            type="button"
            className="bb-btn"
            disabled={busy || !refTargets.length}
            onClick={onUseAsReference}
            {...helpProps(
              'projectArt.action.useAsReference',
              !refTargets.length ? 'Select an image first.' : null,
            )}
          >
            Use as Reference
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--primary"
            disabled={busy || !refTargets.length}
            onClick={onSendToGeneration}
            {...helpProps(
              'projectArt.action.sendToGeneration',
              !refTargets.length
                ? 'Select an image first.'
                : !promptForSend
                  ? 'No saved prompt — Asset Generation will open so you can pick a template or enter one.'
                  : null,
            )}
          >
            Send to Generation
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={busy || !region}
            title={region ? 'Crop the selected region and send it as an OpenArt image reference' : 'Select a region on the preview first'}
            onClick={onSendRegion}
            {...helpProps(
              'projectArt.action.sendRegion',
              !region ? 'Select a region on the preview first.' : null,
            )}
          >
            Send Region to Generation
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={busy || !item}
            onClick={onSendToMeshy}
            {...helpProps(
              'projectArt.action.sendToMeshy',
              !item ? 'Select an image first.' : null,
            )}
          >
            {region ? 'Send Region to Meshy' : 'Send to Meshy'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function DetailMetaRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="bb-project-art-detail__meta-row">
      <span className="bb-field-caption">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function formatArtDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function summarizeFormValues(formValues) {
  if (!formValues || typeof formValues !== 'object') return null;
  const keys = ['aspectRatio', 'resolution', 'width', 'height', 'steps', 'guidance', 'seed'];
  const parts = [];
  for (const key of keys) {
    if (formValues[key] != null && formValues[key] !== '') {
      parts.push(`${key}: ${formValues[key]}`);
    }
  }
  if (!parts.length) {
    const entries = Object.entries(formValues).filter(([, v]) => v != null && v !== '');
    if (!entries.length) return null;
    return entries.map(([k, v]) => `${k}: ${v}`).join(' · ');
  }
  return parts.join(' · ');
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

function buildFolderMenuItems({ node, isRoot = false, readOnly = false, run }) {
  const items = [
    { id: 'open', label: 'Open', onSelect: () => run('open') },
  ];
  if (readOnly) {
    items.push(
      { id: 'sep-sys', separator: true },
      { id: 'refresh', label: 'Refresh', onSelect: () => run('refresh') },
    );
    return items;
  }
  items.push({ id: 'new', label: 'New Folder', onSelect: () => run('new') });
  if (!isRoot && node?.path) {
    items.push(
      { id: 'sep-edit', separator: true },
      { id: 'rename', label: 'Rename', onSelect: () => run('rename') },
      { id: 'move', label: 'Move Folder…', onSelect: () => run('move') },
      { id: 'copy', label: 'Copy Folder…', onSelect: () => run('copy') },
      { id: 'delete', label: 'Delete', danger: true, onSelect: () => run('delete') },
    );
  }
  items.push(
    { id: 'sep-sys', separator: true },
    { id: 'explorer', label: 'Open in Explorer', onSelect: () => run('explorer') },
    { id: 'refresh', label: 'Refresh', onSelect: () => run('refresh') },
  );
  return items;
}

function buildCollectionMenuItems({ hasSelection = false, run }) {
  return [
    { id: 'open', label: 'Open', onSelect: () => run('open') },
    { id: 'rename', label: 'Rename', onSelect: () => run('rename') },
    {
      id: 'add-selection',
      label: 'Add Selection',
      disabled: !hasSelection,
      onSelect: () => run('add-selection'),
    },
    { id: 'sep', separator: true },
    {
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => run('delete'),
    },
  ];
}

function buildImageMenuItems({ item, multiCount = 1, collections = [], run }) {
  const deleteLabel = multiCount > 1 ? `Delete ${multiCount} Images` : 'Delete';
  const addLabel = multiCount > 1 ? `Use ${multiCount} as References` : 'Use as Reference';
  const readOnly = item?.source === 'gdrive' || item?.readOnly;
  const items = [
    { id: 'add-refs', label: addLabel, onSelect: () => run('add-refs') },
    { id: 'send-generation', label: 'Send to Generation', onSelect: () => run('send-generation') },
    {
      id: 'send-meshy',
      label: 'Send to Meshy',
      disabled: multiCount > 1,
      onSelect: () => run('send-meshy'),
    },
  ];
  if (readOnly) {
    items.push(
      { id: 'sep-ext', separator: true },
      {
        id: 'copy-to-project-art',
        label: multiCount > 1
          ? `Copy ${multiCount} to Project Art…`
          : 'Copy to Project Art Library…',
        onSelect: () => run('copy-to-project-art'),
      },
      {
        id: 'open-drive',
        label: 'Open in Google Drive',
        disabled: multiCount > 1 || !item?.provenance?.webViewLink,
        onSelect: () => {
          const href = item?.provenance?.webViewLink;
          if (href) window.open(href, '_blank', 'noopener,noreferrer');
        },
      },
    );
    return items;
  }
  items.push(
    {
      id: 'favorite',
      label: item?.favorite ? 'Remove Favorite' : 'Add to Favorites',
      onSelect: () => run('favorite'),
    },
    { id: 'sep-org', separator: true },
    { id: 'move', label: 'Move to Folder…', onSelect: () => run('move') },
    { id: 'copy', label: 'Copy to Folder…', onSelect: () => run('copy') },
  );
  if (collections.length) {
    items.push({ id: 'sep-col', separator: true });
    for (const col of collections) {
      items.push({
        id: `add-col-${col.id}`,
        label: `Add to “${col.name}”`,
        onSelect: () => run('add-to-collection', col.id),
      });
    }
  }
  items.push(
    {
      id: 'new-collection',
      label: 'New Collection…',
      onSelect: () => run('new-collection'),
    },
    { id: 'sep-edit', separator: true },
    { id: 'rename', label: 'Rename', disabled: multiCount > 1, onSelect: () => run('rename') },
    { id: 'delete', label: deleteLabel, danger: true, onSelect: () => run('delete') },
    { id: 'sep-sys', separator: true },
    { id: 'explorer', label: 'Open in Explorer', onSelect: () => run('explorer') },
  );
  return items;
}

function buildTrayThumbMenuItems({ run }) {
  return [
    { id: 'open', label: 'Open in Library', onSelect: () => run('open') },
    { id: 'remove', label: 'Remove', onSelect: () => run('remove') },
  ];
}

function buildTrayBackgroundMenuItems({ hasRefs = false, run }) {
  return [
    {
      id: 'save-set',
      label: 'Save Reference Set',
      disabled: !hasRefs,
      onSelect: () => run('save-set'),
    },
    {
      id: 'clear',
      label: 'Clear All',
      disabled: !hasRefs,
      danger: true,
      onSelect: () => run('clear'),
    },
  ];
}

function buildGalleryBackgroundMenuItems({ hasFolder, run }) {
  return [
    { id: 'new', label: 'New Folder', onSelect: () => run('new') },
    {
      id: 'import',
      label: 'Import Images…',
      disabled: !hasFolder,
      onSelect: () => run('import'),
    },
    { id: 'sep', separator: true },
    { id: 'refresh', label: 'Refresh', onSelect: () => run('refresh') },
    { id: 'explorer', label: 'Open in Explorer', onSelect: () => run('explorer') },
  ];
}
