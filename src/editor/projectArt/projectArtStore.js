/**
 * Project Art Library UI store (survives panel switches).
 * Filesystem browser + metadata selection state.
 */
import {
  attachProjectArtAsset,
  composeProjectArtPrompt,
  analyzeProjectArtPrompt,
  createProjectArtCollection,
  createProjectArtPrompt,
  createProjectArtReferenceSet,
  deleteProjectArt,
  deleteProjectArtCollection,
  fetchProjectArtMeta,
  fetchProjectArtTree,
  fetchProjectArtVisionCapability,
  copyProjectArt,
  importProjectArtImage,
  listProjectArtFolder,
  mkdirProjectArt,
  moveProjectArt,
  openProjectArtFolder,
  projectArtImageUrl,
  renameProjectArt,
  saveProjectArtFromStaging,
  searchProjectArt,
  stageProjectArtReferences,
  updateProjectArtCollection,
  updateProjectArtItem,
} from '../../io/projectArtClient.js';
import {
  addGoogleDriveLibrary,
  copyGoogleDriveToProjectArt,
  fetchGoogleDriveStatus,
  googleDriveImageUrl,
  listGoogleDriveFolder,
  materializeGoogleDriveFile,
  refreshGoogleDriveLibrary,
  removeGoogleDriveLibrary,
  startGoogleDriveLogin,
  startGoogleDriveLogout,
} from '../../io/googleDriveClient.js';
import { createEmptyLibrary } from './schema.js';

const LISTENERS = new Set();

const SORT_MODES = Object.freeze(['name', 'date', 'rating']);

const initialState = () => ({
  loaded: false,
  busy: false,
  error: null,
  library: createEmptyLibrary(),
  tree: [],
  currentFolder: '',
  folderEntries: [],
  searchQuery: '',
  searchResults: null, // null = not searching; array = search hit items
  sortMode: 'name', // name | date | rating
  viewMode: 'folder', // folder | favorites | collection | all | recent | tag
  activeCollectionId: null,
  tagFilter: null,
  selectedIds: [],
  anchorId: null,
  expandedPaths: {},
  vision: null,
  // External Libraries (Google Drive)
  librarySource: 'local', // local | gdrive
  externalLibraries: [],
  externalAuth: null,
  activeExternalLibraryId: null,
  externalFolderPath: '',
  externalNextPageToken: null,
  externalItemsById: {},
});

let state = initialState();

export function getProjectArtState() {
  return state;
}

export function subscribeProjectArt(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

function syncLibrary(library) {
  if (!library) return state.library;
  return library;
}

export async function loadMeta() {
  setState({ busy: true, error: null });
  try {
    const [metaRes, visionRes] = await Promise.all([
      fetchProjectArtMeta(),
      fetchProjectArtVisionCapability().catch(() => ({ capability: null })),
    ]);
    setState({
      loaded: true,
      busy: false,
      library: syncLibrary(metaRes.library) || createEmptyLibrary(),
      vision: visionRes.capability || null,
    });
    return state.library;
  } catch (err) {
    setState({ busy: false, error: err.message, loaded: true });
    throw err;
  }
}

export async function refreshTree() {
  setState({ busy: true, error: null });
  try {
    const res = await fetchProjectArtTree();
    setState({ busy: false, tree: res.tree || [] });
    return res.tree || [];
  } catch (err) {
    setState({ busy: false, error: err.message });
    throw err;
  }
}

let openFolderSeq = 0;

export async function openFolder(folderPath = '') {
  const path = String(folderPath || '');
  const seq = ++openFolderSeq;
  setState({
    busy: true,
    error: null,
    currentFolder: path,
    viewMode: 'folder',
    activeCollectionId: null,
    tagFilter: null,
    searchQuery: '',
    searchResults: null,
    librarySource: 'local',
    activeExternalLibraryId: null,
    externalFolderPath: '',
    externalNextPageToken: null,
    externalItemsById: {},
  });
  try {
    const res = await listProjectArtFolder(path);
    // Ignore stale responses when the user navigates quickly.
    if (seq !== openFolderSeq) return res;
    setState({
      busy: false,
      folderEntries: res.entries || [],
      library: syncLibrary(res.library) || state.library,
      currentFolder: res.path != null ? res.path : path,
    });
    return res;
  } catch (err) {
    if (seq !== openFolderSeq) throw err;
    setState({ busy: false, error: err.message });
    throw err;
  }
}

export async function refreshExternalLibraries() {
  try {
    const status = await fetchGoogleDriveStatus();
    setState({
      externalLibraries: status.libraries || [],
      externalAuth: {
        authenticated: Boolean(status.authenticated),
        configured: Boolean(status.configured),
        hasApiKey: Boolean(status.hasApiKey),
        configError: status.configError || null,
        setupHint: status.setupHint || null,
      },
    });
    return status;
  } catch (err) {
    setState({
      externalAuth: {
        authenticated: false,
        configured: false,
        error: err.message,
        code: err.code,
      },
    });
    throw err;
  }
}

export async function openExternalLibrary(libraryId, folderPath = '') {
  const path = String(folderPath || '');
  const seq = ++openFolderSeq;
  setState({
    busy: true,
    error: null,
    librarySource: 'gdrive',
    activeExternalLibraryId: libraryId,
    externalFolderPath: path,
    currentFolder: path,
    viewMode: 'folder',
    activeCollectionId: null,
    tagFilter: null,
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
  try {
    const res = await listGoogleDriveFolder(libraryId, path);
    if (seq !== openFolderSeq) return res;
    const externalItemsById = {};
    for (const entry of res.entries || []) {
      if (entry.type === 'file' && entry.item?.id) {
        externalItemsById[entry.item.id] = entry.item;
      }
    }
    setState({
      busy: false,
      folderEntries: res.entries || [],
      externalFolderPath: res.path != null ? res.path : path,
      currentFolder: res.path != null ? res.path : path,
      externalNextPageToken: res.nextPageToken || null,
      externalItemsById,
    });
    return res;
  } catch (err) {
    if (seq !== openFolderSeq) throw err;
    setState({ busy: false, error: err.message });
    throw err;
  }
}

/** Append the next page of the current Google Drive folder listing. */
export async function loadMoreExternalFolder() {
  if (state.librarySource !== 'gdrive' || !state.activeExternalLibraryId || !state.externalNextPageToken) {
    return null;
  }
  const libraryId = state.activeExternalLibraryId;
  const path = state.externalFolderPath || state.currentFolder || '';
  const pageToken = state.externalNextPageToken;
  const seq = openFolderSeq;
  setState({ busy: true, error: null });
  try {
    const res = await listGoogleDriveFolder(libraryId, path, pageToken);
    if (seq !== openFolderSeq) return res;
    const externalItemsById = { ...(state.externalItemsById || {}) };
    const appended = [];
    for (const entry of res.entries || []) {
      if (entry.type === 'file' && entry.item?.id) {
        externalItemsById[entry.item.id] = entry.item;
      }
      appended.push(entry);
    }
    setState({
      busy: false,
      folderEntries: [...(state.folderEntries || []), ...appended],
      externalNextPageToken: res.nextPageToken || null,
      externalItemsById,
    });
    return res;
  } catch (err) {
    if (seq !== openFolderSeq) throw err;
    setState({ busy: false, error: err.message });
    throw err;
  }
}

export async function googleDriveConnect() {
  // Prefer an existing session before launching another OAuth browser window.
  const existing = await refreshExternalLibraries().catch(() => null);
  if (existing?.authenticated) {
    return { ok: true, message: 'Google Drive already connected.', alreadyAuthenticated: true };
  }
  const res = await startGoogleDriveLogin();
  await refreshExternalLibraries().catch(() => {});
  return res;
}

export async function googleDriveDisconnect() {
  const res = await startGoogleDriveLogout();
  await refreshExternalLibraries().catch(() => {});
  return res;
}

export async function googleDriveAddLibrary(url) {
  const res = await addGoogleDriveLibrary(url);
  setState({ externalLibraries: res.libraries || state.externalLibraries });
  return res;
}

export async function googleDriveRemoveLibrary(libraryId) {
  const res = await removeGoogleDriveLibrary(libraryId);
  const patch = { externalLibraries: res.libraries || [] };
  if (state.activeExternalLibraryId === libraryId) {
    patch.librarySource = 'local';
    patch.activeExternalLibraryId = null;
    patch.externalFolderPath = '';
    patch.folderEntries = [];
    patch.externalItemsById = {};
  }
  setState(patch);
  if (state.librarySource === 'local' || patch.librarySource === 'local') {
    await openFolder(state.currentFolder || '').catch(() => {});
  }
  return res;
}

export async function googleDriveRefreshLibrary(libraryId) {
  const res = await refreshGoogleDriveLibrary(libraryId);
  setState({ externalLibraries: res.libraries || state.externalLibraries });
  if (state.librarySource === 'gdrive' && state.activeExternalLibraryId === libraryId) {
    await openExternalLibrary(libraryId, state.externalFolderPath || '');
  }
  return res;
}

export async function materializeSelectedGoogleDriveItem(item) {
  if (!item || item.source !== 'gdrive' || !item.driveFileId) {
    return { ok: true, item };
  }
  const res = await materializeGoogleDriveFile({
    fileId: item.driveFileId,
    libraryId: item.driveLibraryId || state.activeExternalLibraryId,
    resourceKey: item.driveResourceKey || null,
    filename: item.title,
  });
  return {
    ok: true,
    item: {
      ...item,
      // Local project-art cache path — generation uses this, not Drive URLs.
      relativePath: res.projectArtRelativePath || item.relativePath,
      absolutePath: res.absolutePath,
      projectArtRelativePath: res.projectArtRelativePath,
      materialized: res,
      provenance: {
        ...(item.provenance || {}),
        ...(res.provenance || {}),
        materializedAt: new Date().toISOString(),
      },
    },
    materialize: res,
  };
}

export async function copyExternalItemToProjectArt(item, folder = '') {
  if (!item?.driveFileId) {
    throw Object.assign(new Error('Not a Google Drive item'), { code: 'NOT_GDRIVE' });
  }
  const res = await copyGoogleDriveToProjectArt({
    fileId: item.driveFileId,
    libraryId: item.driveLibraryId || state.activeExternalLibraryId,
    resourceKey: item.driveResourceKey || null,
    folder,
    title: item.title,
  });
  await loadMeta().catch(() => {});
  return res;
}

export async function search(query) {
  const q = String(query || '');
  setState({ searchQuery: q, busy: true, error: null });
  if (!q.trim()) {
    setState({ busy: false, searchResults: null });
    return [];
  }
  try {
    const res = await searchProjectArt(q);
    setState({
      busy: false,
      searchResults: res.results || [],
      viewMode: 'folder',
      activeCollectionId: null,
      tagFilter: null,
    });
    return res.results || [];
  } catch (err) {
    setState({ busy: false, error: err.message });
    throw err;
  }
}

/** Filter currently loaded Google Drive folder entries by name (no full-Drive crawl). */
export function searchExternal(query) {
  const q = String(query || '').trim().toLowerCase();
  setState({ searchQuery: String(query || '') });
  if (!q) {
    setState({ searchResults: null });
    return [];
  }
  const matches = (state.folderEntries || [])
    .filter((e) => e.type === 'file' && e.item)
    .map((e) => e.item)
    .filter((item) => String(item.title || '').toLowerCase().includes(q));
  setState({ searchResults: matches });
  return matches;
}

export function setSortMode(mode) {
  const next = SORT_MODES.includes(mode) ? mode : 'name';
  setState({ sortMode: next });
}

export function setViewFavorites() {
  setState({
    viewMode: 'favorites',
    activeCollectionId: null,
    tagFilter: null,
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
}

/** Flat gallery of every library item (Bridge “All Assets”). */
export function setViewAll() {
  setState({
    viewMode: 'all',
    activeCollectionId: null,
    tagFilter: null,
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
}

/** Flat gallery sorted by recency (Bridge “Recent”). */
export function setViewRecent() {
  setState({
    viewMode: 'recent',
    activeCollectionId: null,
    tagFilter: null,
    sortMode: 'date',
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
}

export function setViewTag(tag) {
  const next = String(tag || '').trim();
  if (!next) {
    setViewAll();
    return;
  }
  setState({
    viewMode: 'tag',
    tagFilter: next,
    activeCollectionId: null,
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
}

export function openCollection(collectionId) {
  setState({
    viewMode: 'collection',
    activeCollectionId: collectionId || null,
    tagFilter: null,
    searchQuery: '',
    searchResults: null,
    selectedIds: [],
    anchorId: null,
  });
}

export function toggleExpandedPath(folderPath) {
  const key = String(folderPath || '');
  setState({
    expandedPaths: {
      ...state.expandedPaths,
      [key]: !state.expandedPaths[key],
    },
  });
}

export function setExpandedPath(folderPath, expanded) {
  const key = String(folderPath || '');
  setState({
    expandedPaths: {
      ...state.expandedPaths,
      [key]: Boolean(expanded),
    },
  });
}

/** Ordered gallery item ids for the current view (files only). */
export function getVisibleItemIds() {
  return getVisibleEntries()
    .filter((e) => e.type === 'file' && e.item?.id)
    .map((e) => e.item.id);
}

function itemToEntry(item) {
  return {
    name: item.title || item.relativePath,
    path: item.relativePath,
    type: 'file',
    item,
  };
}

export function getVisibleEntries() {
  const {
    library, folderEntries, searchResults, viewMode, activeCollectionId, sortMode, tagFilter,
  } = state;

  let entries;
  if (searchResults) {
    entries = searchResults.map(itemToEntry);
  } else if (viewMode === 'favorites') {
    entries = (library.items || []).filter((item) => item.favorite).map(itemToEntry);
  } else if (viewMode === 'all' || viewMode === 'recent') {
    entries = (library.items || []).map(itemToEntry);
  } else if (viewMode === 'tag' && tagFilter) {
    const needle = String(tagFilter).toLowerCase();
    entries = (library.items || [])
      .filter((item) => (item.tags || []).some((t) => String(t).toLowerCase() === needle))
      .map(itemToEntry);
  } else if (viewMode === 'collection' && activeCollectionId) {
    const col = (library.collections || []).find((c) => c.id === activeCollectionId);
    const idSet = new Set(col?.itemIds || []);
    entries = (library.items || []).filter((item) => idSet.has(item.id)).map(itemToEntry);
  } else {
    entries = [...(folderEntries || [])];
  }

  return sortEntries(entries, viewMode === 'recent' ? 'date' : sortMode);
}

/** Tag frequency list for the library sidebar. */
export function getLibraryTagCounts() {
  const counts = new Map();
  for (const item of state.library.items || []) {
    for (const tag of item.tags || []) {
      const key = String(tag).trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function sortEntries(entries, sortMode) {
  const dirs = entries.filter((e) => e.type === 'dir');
  const files = entries.filter((e) => e.type !== 'dir');
  const cmpName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  dirs.sort(cmpName);
  if (sortMode === 'date') {
    files.sort((a, b) => {
      const da = a.item?.updatedAt || a.item?.createdAt || '';
      const db = b.item?.updatedAt || b.item?.createdAt || '';
      return String(db).localeCompare(String(da)) || cmpName(a, b);
    });
  } else if (sortMode === 'rating') {
    files.sort((a, b) => (Number(b.item?.rating) || 0) - (Number(a.item?.rating) || 0) || cmpName(a, b));
  } else {
    files.sort(cmpName);
  }
  return [...dirs, ...files];
}

function findItemById(id) {
  if (!id) return null;
  return (state.library.items || []).find((i) => i.id === id)
    || state.externalItemsById?.[id]
    || null;
}

export function getPrimarySelectedItem() {
  const id = state.selectedIds[state.selectedIds.length - 1] || null;
  return findItemById(id);
}

export function getSelectedItems() {
  return state.selectedIds.map((id) => findItemById(id)).filter(Boolean);
}

export function selectOnly(id) {
  if (!id) {
    setState({ selectedIds: [], anchorId: null });
    return;
  }
  setState({ selectedIds: [id], anchorId: id });
}

export function toggleCtrl(id) {
  if (!id) return;
  const selectedIds = state.selectedIds.includes(id)
    ? state.selectedIds.filter((x) => x !== id)
    : [...state.selectedIds, id];
  setState({
    selectedIds,
    anchorId: id,
  });
}

export function rangeShift(id) {
  if (!id) return;
  const visible = getVisibleItemIds();
  const anchor = state.anchorId && visible.includes(state.anchorId)
    ? state.anchorId
    : (state.selectedIds[0] || id);
  const a = visible.indexOf(anchor);
  const b = visible.indexOf(id);
  if (a < 0 || b < 0) {
    selectOnly(id);
    return;
  }
  const [lo, hi] = a < b ? [a, b] : [b, a];
  setState({
    selectedIds: visible.slice(lo, hi + 1),
    anchorId: anchor,
  });
}

export function selectAll() {
  const ids = getVisibleItemIds();
  setState({
    selectedIds: ids,
    anchorId: ids[0] || state.anchorId,
  });
}

export function deselectAll() {
  setState({ selectedIds: [], anchorId: null });
}

export function setSelection(ids, anchorId = null) {
  const next = Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
  setState({
    selectedIds: next,
    anchorId: anchorId || next[next.length - 1] || null,
  });
}

async function mutate(fn, { refreshFolder = true } = {}) {
  setState({ busy: true, error: null });
  try {
    const result = await fn();
    const patch = {
      busy: false,
      library: syncLibrary(result.library) || state.library,
    };
    setState(patch);
    if (refreshFolder && state.viewMode === 'folder' && !state.searchResults) {
      await openFolder(state.currentFolder);
    } else {
      setState({ busy: false });
    }
    return result;
  } catch (err) {
    setState({ busy: false, error: err.message });
    throw err;
  }
}

export function projectArtMkdir(payload) {
  return mutate(async () => {
    const result = await mkdirProjectArt(payload);
    await refreshTree().catch(() => {});
    return result;
  });
}

export function projectArtRename(payload) {
  return mutate(async () => {
    const result = await renameProjectArt(payload);
    await refreshTree().catch(() => {});
    return result;
  });
}

export function projectArtMove(payload) {
  return mutate(async () => {
    const result = await moveProjectArt(payload);
    await refreshTree().catch(() => {});
    return result;
  });
}

export function projectArtCopy(payload) {
  return mutate(async () => {
    const result = await copyProjectArt(payload);
    await refreshTree().catch(() => {});
    return result;
  });
}

export function projectArtDelete(payload) {
  return mutate(async () => {
    const result = await deleteProjectArt(payload);
    const deletedPath = payload?.path ? String(payload.path) : '';
    const selectedIds = state.selectedIds.filter((id) => {
      const item = state.library.items.find((i) => i.id === id);
      if (!item) return false;
      if (!deletedPath) return true;
      return item.relativePath !== deletedPath && !item.relativePath.startsWith(`${deletedPath}/`);
    });
    setState({ selectedIds });
    await refreshTree().catch(() => {});
    return result;
  });
}

export function projectArtUpdateItem(itemId, patch) {
  return mutate(() => updateProjectArtItem({ id: itemId, patch }), {
    refreshFolder: false,
  }).then(async (result) => {
    // Keep folder entries' embedded item objects in sync.
    if (state.folderEntries?.length) {
      setState({
        folderEntries: state.folderEntries.map((e) => (
          e.item?.id === itemId
            ? { ...e, item: (result.library?.items || []).find((i) => i.id === itemId) || e.item }
            : e
        )),
      });
    }
    return result;
  });
}

export function projectArtImportImage({ folder, file, title }) {
  return mutate(() => importProjectArtImage({ folder, file, title }));
}

export function projectArtCreateCollection(payload) {
  return mutate(() => createProjectArtCollection(payload), { refreshFolder: false });
}

export function projectArtUpdateCollection(payload) {
  return mutate(() => updateProjectArtCollection(payload), { refreshFolder: false });
}

export function projectArtDeleteCollection(payload) {
  return mutate(async () => {
    const result = await deleteProjectArtCollection(payload);
    if (state.activeCollectionId === payload?.id) {
      setState({ viewMode: 'folder', activeCollectionId: null });
    }
    return result;
  }, { refreshFolder: false });
}

export function projectArtCreateReferenceSet(payload) {
  return mutate(() => createProjectArtReferenceSet(payload), { refreshFolder: false });
}

export function projectArtCreatePrompt(payload) {
  return mutate(() => createProjectArtPrompt(payload), { refreshFolder: false });
}

export function projectArtComposePrompt(payload) {
  return composeProjectArtPrompt(payload);
}

export function projectArtAnalyzePrompt(payload) {
  return analyzeProjectArtPrompt(payload);
}

export function projectArtStageReferences(payload) {
  return stageProjectArtReferences(payload);
}

export function projectArtSaveFromStaging(payload) {
  return mutate(() => saveProjectArtFromStaging(payload));
}

export function projectArtAttachAsset(payload) {
  return mutate(() => attachProjectArtAsset(payload), { refreshFolder: false });
}

export function projectArtOpenInExplorer(payload) {
  return openProjectArtFolder(payload);
}

export function projectArtPreviewUrl(itemOrPath) {
  if (!itemOrPath) return null;
  if (typeof itemOrPath === 'object' && itemOrPath.source === 'gdrive' && itemOrPath.driveFileId) {
    return googleDriveImageUrl(itemOrPath.driveFileId, {
      libraryId: itemOrPath.driveLibraryId || state.activeExternalLibraryId,
      thumb: true,
    });
  }
  if (typeof itemOrPath === 'string') return projectArtImageUrl(itemOrPath);
  if (itemOrPath.relativePath) return projectArtImageUrl(itemOrPath.relativePath);
  return null;
}

/** Full-resolution same-origin URL for crop / detail preview. */
export function projectArtFullImageUrl(itemOrPath) {
  if (!itemOrPath) return null;
  if (typeof itemOrPath === 'object' && itemOrPath.source === 'gdrive' && itemOrPath.driveFileId) {
    return googleDriveImageUrl(itemOrPath.driveFileId, {
      libraryId: itemOrPath.driveLibraryId || state.activeExternalLibraryId,
      thumb: false,
    });
  }
  return projectArtPreviewUrl(itemOrPath);
}

export async function projectArtBootstrap() {
  await loadMeta();
  await refreshTree();
  await refreshExternalLibraries().catch(() => {});
  await openFolder(state.currentFolder || '');
}

export function __testResetProjectArt() {
  state = initialState();
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

export function __testSetProjectArt(patch) {
  setState(patch);
}

if (typeof window !== 'undefined') {
  window.__bloodboundProjectArt = {
    get: getProjectArtState,
    subscribe: subscribeProjectArt,
    loadMeta,
    refreshTree,
    openFolder,
    reset: __testResetProjectArt,
  };
}
