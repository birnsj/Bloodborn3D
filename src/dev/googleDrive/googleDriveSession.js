/**
 * Google Drive external libraries session — config persistence + browse/download.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  GoogleDriveAuthError,
  beginGoogleDriveLogin,
  clearGoogleDriveTokens,
  getGoogleDriveAuthStatus,
} from './googleDriveAuth.js';
import {
  FOLDER_MIME,
  downloadDriveFileMedia,
  extensionForMime,
  fetchDriveThumbnail,
  getDriveFileMeta,
  listDriveFolderChildren,
  writeCacheFile,
} from './googleDriveClient.js';
import { driveOpenInBrowserUrl, parseGoogleDriveUrl } from './googleDriveUrl.js';

export function defaultLibrariesPath(projectRoot) {
  return path.join(projectRoot, 'project-art', '.bb-art', 'external-libraries.json');
}

export function defaultDriveCacheRoot(projectRoot) {
  return path.join(projectRoot, 'project-art', '.bb-art', 'gdrive-cache');
}

async function loadLibraries(projectRoot) {
  try {
    const raw = await fs.readFile(defaultLibrariesPath(projectRoot), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      libraries: Array.isArray(parsed.libraries) ? parsed.libraries : [],
    };
  } catch {
    return { schemaVersion: 1, libraries: [] };
  }
}

async function saveLibraries(projectRoot, data) {
  const file = defaultLibrariesPath(projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

export async function getGoogleDriveStatus(projectRoot) {
  const auth = await getGoogleDriveAuthStatus(projectRoot);
  const libs = await loadLibraries(projectRoot);
  return {
    ...auth,
    // Prefer transport success here; auth.ok still reflects session readiness.
    statusOk: true,
    libraries: libs.libraries,
  };
}

export async function connectGoogleAccount(projectRoot) {
  const status = await getGoogleDriveAuthStatus(projectRoot);
  if (status.authenticated) {
    return {
      ok: true,
      alreadyAuthenticated: true,
      message: 'Google Drive already connected.',
    };
  }
  return beginGoogleDriveLogin(projectRoot);
}

export async function disconnectGoogleAccount(projectRoot) {
  await clearGoogleDriveTokens(projectRoot);
  return { ok: true };
}

function toArtItem(file, library) {
  const id = `gdrive:${library.id}:${file.id}`;
  return {
    id,
    title: file.name || file.id,
    relativePath: null,
    source: 'gdrive',
    readOnly: true,
    driveFileId: file.id,
    driveLibraryId: library.id,
    driveResourceKey: file.resourceKey || library.resourceKey || null,
    mimeType: file.mimeType || null,
    size: file.size != null ? Number(file.size) : null,
    favorite: false,
    tags: [],
    rating: 0,
    createdAt: file.createdTime || null,
    updatedAt: file.modifiedTime || null,
    provenance: {
      source: 'google-drive',
      driveFileId: file.id,
      driveFileName: file.name || null,
      driveFolderId: library.folderId,
      driveLibraryId: library.id,
      driveLibraryName: library.name || null,
      webViewLink: file.webViewLink || null,
    },
  };
}

function toDirEntry(folder, library, parentPath) {
  const segment = folder.name || folder.id;
  const childPath = parentPath ? `${parentPath}/${segment}` : segment;
  return {
    name: segment,
    path: childPath,
    type: 'dir',
    item: null,
    driveFolderId: folder.id,
    driveLibraryId: library.id,
    source: 'gdrive',
  };
}

/**
 * Add a Drive folder URL as an external library (resolves real folder name).
 */
export async function addGoogleDriveLibrary(projectRoot, { url } = {}) {
  const parsed = parseGoogleDriveUrl(url);
  if (!parsed.ok) {
    throw new GoogleDriveAuthError(parsed.code, parsed.error);
  }
  if (parsed.kind !== 'folder') {
    throw new GoogleDriveAuthError('NOT_A_FOLDER', 'Paste a Google Drive folder URL (not a single file)');
  }

  const auth = await getGoogleDriveAuthStatus(projectRoot);
  const requireUser = auth.authenticated;
  if (!auth.authenticated && !auth.hasApiKey) {
    throw new GoogleDriveAuthError(
      'AUTH_FAILED',
      'Connect Google Account (or set GOOGLE_API_KEY for public folders) before adding a library',
    );
  }

  let meta;
  try {
    meta = await getDriveFileMeta(projectRoot, parsed.id, {
      resourceKey: parsed.resourceKey,
      requireUser: requireUser || !auth.hasApiKey,
    });
  } catch (err) {
    // Retry with user OAuth if API-key public access failed.
    if (!requireUser && auth.configured) {
      throw new GoogleDriveAuthError(
        'AUTH_FAILED',
        `${err.message}. Connect Google Account to access private / shared folders.`,
      );
    }
    throw err;
  }

  if (meta.mimeType !== FOLDER_MIME) {
    throw new GoogleDriveAuthError('NOT_A_FOLDER', `Drive item “${meta.name}” is not a folder`);
  }

  const libs = await loadLibraries(projectRoot);
  const existing = libs.libraries.find((l) => l.folderId === parsed.id);
  if (existing) {
    existing.name = meta.name || existing.name;
    existing.resourceKey = parsed.resourceKey || existing.resourceKey || null;
    existing.webViewLink = meta.webViewLink || driveOpenInBrowserUrl(parsed.id, parsed.resourceKey);
    existing.updatedAt = new Date().toISOString();
    await saveLibraries(projectRoot, libs);
    return { ok: true, library: existing, libraries: libs.libraries };
  }

  const library = {
    id: `ext_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    provider: 'google-drive',
    name: meta.name || 'Google Drive Folder',
    folderId: parsed.id,
    resourceKey: parsed.resourceKey || null,
    sourceUrl: parsed.url,
    webViewLink: meta.webViewLink || driveOpenInBrowserUrl(parsed.id, parsed.resourceKey),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  libs.libraries.push(library);
  await saveLibraries(projectRoot, libs);
  return { ok: true, library, libraries: libs.libraries };
}

export async function removeGoogleDriveLibrary(projectRoot, { libraryId } = {}) {
  const libs = await loadLibraries(projectRoot);
  const next = libs.libraries.filter((l) => l.id !== libraryId);
  if (next.length === libs.libraries.length) {
    throw new GoogleDriveAuthError('NOT_FOUND', `Library not found: ${libraryId}`);
  }
  libs.libraries = next;
  await saveLibraries(projectRoot, libs);
  return { ok: true, libraries: libs.libraries };
}

export async function listGoogleDriveLibraries(projectRoot) {
  const libs = await loadLibraries(projectRoot);
  return { ok: true, libraries: libs.libraries };
}

function findLibrary(libs, libraryId) {
  const library = libs.libraries.find((l) => l.id === libraryId);
  if (!library) {
    throw new GoogleDriveAuthError('NOT_FOUND', `Library not found: ${libraryId}`);
  }
  return library;
}

/**
 * Resolve a virtual path under a library to a Drive folder id.
 * Paths use folder names from prior listings; root = library.folderId.
 */
async function resolveFolderIdForPath(projectRoot, library, folderPath = '', { requireUser = true } = {}) {
  const parts = String(folderPath || '').split('/').map((p) => p.trim()).filter(Boolean);
  let folderId = library.folderId;
  let resourceKey = library.resourceKey || null;
  for (const part of parts) {
    const listed = await listDriveFolderChildren(projectRoot, folderId, {
      resourceKey,
      pageSize: 200,
      requireUser,
    });
    const match = listed.folders.find((f) => f.name === part);
    if (!match) {
      throw new GoogleDriveAuthError('NOT_FOUND', `Folder not found: ${part}`);
    }
    folderId = match.id;
    resourceKey = match.resourceKey || resourceKey;
  }
  return { folderId, resourceKey };
}

export async function listGoogleDriveFolder(projectRoot, {
  libraryId,
  folderPath = '',
  pageToken = null,
} = {}) {
  const libs = await loadLibraries(projectRoot);
  const library = findLibrary(libs, libraryId);
  const auth = await getGoogleDriveAuthStatus(projectRoot);
  if (!auth.authenticated && !auth.hasApiKey) {
    throw new GoogleDriveAuthError('AUTH_FAILED', 'Connect Google Account to browse this library');
  }

  const requireUser = auth.authenticated || !auth.hasApiKey;
  const { folderId, resourceKey } = await resolveFolderIdForPath(
    projectRoot,
    library,
    folderPath,
    { requireUser },
  );

  const listed = await listDriveFolderChildren(projectRoot, folderId, {
    pageToken,
    resourceKey,
    pageSize: 100,
    requireUser,
  });

  const parentPath = String(folderPath || '');
  const entries = [
    ...listed.folders.map((f) => toDirEntry(f, library, parentPath)),
    ...listed.images.map((f) => ({
      name: f.name,
      path: parentPath ? `${parentPath}/${f.name}` : f.name,
      type: 'file',
      item: toArtItem(f, library),
      source: 'gdrive',
    })),
  ];

  return {
    ok: true,
    library,
    path: parentPath,
    folderId,
    entries,
    nextPageToken: listed.nextPageToken,
    readOnly: true,
  };
}

/**
 * Build a shallow tree of one level under the library root (expandable on demand via list).
 */
export async function getGoogleDriveLibraryTree(projectRoot, { libraryId } = {}) {
  const listed = await listGoogleDriveFolder(projectRoot, { libraryId, folderPath: '' });
  const children = (listed.entries || [])
    .filter((e) => e.type === 'dir')
    .map((e) => ({
      name: e.name,
      path: e.path,
      children: [],
      driveFolderId: e.driveFolderId,
      source: 'gdrive',
      libraryId,
    }));
  return {
    ok: true,
    library: listed.library,
    tree: [{
      name: listed.library.name,
      path: '',
      children,
      driveFolderId: listed.library.folderId,
      source: 'gdrive',
      libraryId,
    }],
  };
}

export async function refreshGoogleDriveLibraryMeta(projectRoot, { libraryId } = {}) {
  const libs = await loadLibraries(projectRoot);
  const library = findLibrary(libs, libraryId);
  const meta = await getDriveFileMeta(projectRoot, library.folderId, {
    resourceKey: library.resourceKey,
    requireUser: true,
  });
  library.name = meta.name || library.name;
  library.webViewLink = meta.webViewLink || library.webViewLink;
  library.updatedAt = new Date().toISOString();
  await saveLibraries(projectRoot, libs);
  return { ok: true, library, libraries: libs.libraries };
}

/**
 * Download a Drive image into project-controlled cache (not ephemeral Drive URLs).
 */
export async function materializeGoogleDriveFile(projectRoot, {
  fileId,
  libraryId = null,
  resourceKey = null,
  filename = null,
} = {}) {
  const libs = await loadLibraries(projectRoot);
  const library = libraryId ? libs.libraries.find((l) => l.id === libraryId) : null;
  const key = resourceKey || library?.resourceKey || null;
  const meta = await getDriveFileMeta(projectRoot, fileId, { resourceKey: key, requireUser: true });
  const { buffer, contentType } = await downloadDriveFileMedia(projectRoot, fileId, {
    resourceKey: key,
    requireUser: true,
  });
  const ext = extensionForMime(contentType || meta.mimeType, filename || meta.name);
  const cacheRoot = defaultDriveCacheRoot(projectRoot);
  const saved = await writeCacheFile(
    cacheRoot,
    fileId,
    buffer,
    `${path.basename(meta.name || filename || fileId, path.extname(meta.name || ''))}${ext}`,
  );

  // Relative path under project-art for optional copy / preview via project-art API later.
  const projectArtRel = path
    .join('.bb-art', 'gdrive-cache', saved.relativePath)
    .replace(/\\/g, '/');

  return {
    ok: true,
    fileId,
    absolutePath: saved.absolutePath,
    cacheRelativePath: saved.relativePath,
    projectArtRelativePath: projectArtRel,
    bytes: saved.bytes,
    contentType: contentType || meta.mimeType,
    name: meta.name,
    provenance: {
      source: 'google-drive',
      driveFileId: fileId,
      driveFileName: meta.name,
      driveFolderId: library?.folderId || null,
      driveLibraryId: library?.id || libraryId || null,
      driveLibraryName: library?.name || null,
    },
  };
}

export async function getGoogleDriveImageBuffer(projectRoot, {
  fileId,
  libraryId = null,
  resourceKey = null,
  thumb = false,
} = {}) {
  const libs = await loadLibraries(projectRoot);
  const library = libraryId ? libs.libraries.find((l) => l.id === libraryId) : null;
  const key = resourceKey || library?.resourceKey || null;
  if (thumb) {
    return fetchDriveThumbnail(projectRoot, fileId, { resourceKey: key, requireUser: true });
  }
  return downloadDriveFileMedia(projectRoot, fileId, { resourceKey: key, requireUser: true });
}

/**
 * Copy a Drive image into a Project Art folder (local writable copy).
 */
export async function copyGoogleDriveToProjectArt(projectRoot, {
  fileId,
  libraryId = null,
  resourceKey = null,
  folder = '',
  title = null,
} = {}) {
  const materialized = await materializeGoogleDriveFile(projectRoot, {
    fileId,
    libraryId,
    resourceKey,
  });
  const { importMeshBuffer } = {}; // placeholder — use project art import via fs
  void importMeshBuffer;

  const artRoot = path.join(projectRoot, 'project-art');
  const destDir = path.join(artRoot, ...String(folder || '').split('/').filter(Boolean));
  await fs.mkdir(destDir, { recursive: true });
  const ext = path.extname(materialized.absolutePath) || '.png';
  const rawBase = String(title || materialized.name || fileId)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\x00-\x1f]/g, '_')
    .trim() || fileId;
  // Avoid "name.jpg.jpg" when the Drive title already includes an extension.
  const base = path.extname(rawBase).toLowerCase() === ext.toLowerCase()
    ? path.basename(rawBase, path.extname(rawBase))
    : rawBase;
  let destName = `${base}${ext}`;
  let destAbs = path.join(destDir, destName);
  let n = 1;
  while (true) {
    try {
      await fs.access(destAbs);
      destName = `${base}-${n}${ext}`;
      destAbs = path.join(destDir, destName);
      n += 1;
    } catch {
      break;
    }
  }
  await fs.copyFile(materialized.absolutePath, destAbs);
  const relativePath = path.relative(artRoot, destAbs).replace(/\\/g, '/');

  // Register in library.json via createArtItem shape (projectArtApi owns schema).
  const { createArtItem } = await import('../../editor/projectArt/schema.js');
  const libraryPath = path.join(artRoot, '.bb-art', 'library.json');
  let library;
  try {
    library = JSON.parse(await fs.readFile(libraryPath, 'utf8'));
  } catch {
    library = { schemaVersion: 1, items: [], collections: [], referenceSets: [], prompts: [] };
  }
  const item = createArtItem({
    id: `art_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    relativePath,
    title: title || path.basename(base),
    provenance: {
      ...materialized.provenance,
      copiedFromGoogleDrive: true,
      copiedAt: new Date().toISOString(),
    },
  });
  library.items = Array.isArray(library.items) ? library.items : [];
  library.items.push(item);
  await fs.writeFile(libraryPath, JSON.stringify(library, null, 2), 'utf8');

  return {
    ok: true,
    item,
    relativePath,
    absolutePath: destAbs,
    provenance: item.provenance,
  };
}

export { parseGoogleDriveUrl, driveOpenInBrowserUrl, GoogleDriveAuthError };
