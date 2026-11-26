/**
 * Google Drive API v3 helpers (Node). Read-only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleDriveAuthError, getAccessToken, loadOAuthClientConfig } from './googleDriveAuth.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const IMAGE_MIME_PREFIX = 'image/';

export { FOLDER_MIME };

async function authHeaders(projectRoot, { requireUser = true } = {}) {
  const config = await loadOAuthClientConfig(projectRoot);
  if (requireUser) {
    const { accessToken } = await getAccessToken(projectRoot);
    return {
      headers: { Authorization: `Bearer ${accessToken}` },
      apiKey: config.apiKey || null,
    };
  }
  if (config.apiKey) {
    return { headers: {}, apiKey: config.apiKey };
  }
  // Fall back to user token when no API key.
  const { accessToken } = await getAccessToken(projectRoot);
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    apiKey: null,
  };
}

function withKey(url, apiKey) {
  if (!apiKey) return url;
  const u = new URL(url);
  u.searchParams.set('key', apiKey);
  return u.toString();
}

async function driveFetch(projectRoot, urlPath, {
  query = {},
  requireUser = true,
  raw = false,
  timeoutMs = 60_000,
} = {}) {
  const { headers, apiKey } = await authHeaders(projectRoot, { requireUser });
  const url = new URL(`${DRIVE_BASE}${urlPath}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(withKey(url.toString(), apiKey), {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Google Drive HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        message = j?.error?.message || message;
      } catch {
        if (text) message = text.slice(0, 300);
      }
      let code = 'DRIVE_HTTP_ERROR';
      if (res.status === 401 || res.status === 403) code = 'AUTH_FAILED';
      if (res.status === 404) code = 'NOT_FOUND';
      throw new GoogleDriveAuthError(code, message, { status: res.status });
    }
    if (raw) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, contentType: res.headers.get('content-type') || 'application/octet-stream' };
    }
    return res.json();
  } catch (err) {
    if (err instanceof GoogleDriveAuthError) throw err;
    if (err?.name === 'AbortError') {
      throw new GoogleDriveAuthError('TIMEOUT', `Drive request timed out after ${timeoutMs}ms`);
    }
    throw new GoogleDriveAuthError('NETWORK', err.message || String(err));
  } finally {
    clearTimeout(timer);
  }
}

export async function getDriveFileMeta(projectRoot, fileId, { resourceKey = null, requireUser = true } = {}) {
  const query = {
    supportsAllDrives: 'true',
    fields: 'id,name,mimeType,parents,size,modifiedTime,createdTime,thumbnailLink,webViewLink,iconLink,capabilities,resourceKey,shared,driveId',
  };
  // resourceKey is passed as a header for some shared links.
  const { headers, apiKey } = await authHeaders(projectRoot, { requireUser });
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`;
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(withKey(url.toString(), apiKey), { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleDriveAuthError(
      res.status === 404 ? 'NOT_FOUND' : (res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'DRIVE_HTTP_ERROR'),
      json?.error?.message || `Drive get failed (${res.status})`,
      { status: res.status },
    );
  }
  return json;
}

/**
 * List direct children of a folder (paginated). Images + subfolders only.
 */
export async function listDriveFolderChildren(projectRoot, folderId, {
  pageToken = null,
  pageSize = 100,
  resourceKey = null,
  requireUser = true,
} = {}) {
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
  const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,iconLink,resourceKey)';
  const { headers, apiKey } = await authHeaders(projectRoot, { requireUser });
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${folderId}/${resourceKey}`;

  const url = new URL(`${DRIVE_BASE}/files`);
  url.searchParams.set('q', q);
  url.searchParams.set('pageSize', String(Math.min(1000, Math.max(1, pageSize))));
  url.searchParams.set('fields', fields);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('orderBy', 'folder,name_natural');
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(withKey(url.toString(), apiKey), { headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleDriveAuthError(
      res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'DRIVE_HTTP_ERROR',
      json?.error?.message || `Drive list failed (${res.status})`,
      { status: res.status },
    );
  }

  const files = Array.isArray(json.files) ? json.files : [];
  const folders = [];
  const images = [];
  for (const f of files) {
    if (f.mimeType === FOLDER_MIME) folders.push(f);
    else if (String(f.mimeType || '').startsWith(IMAGE_MIME_PREFIX)) images.push(f);
  }
  return {
    folders,
    images,
    nextPageToken: json.nextPageToken || null,
  };
}

export async function downloadDriveFileMedia(projectRoot, fileId, {
  resourceKey = null,
  requireUser = true,
  timeoutMs = 120_000,
} = {}) {
  const { headers, apiKey } = await authHeaders(projectRoot, { requireUser });
  if (resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`;
  const url = new URL(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(withKey(url.toString(), apiKey), {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GoogleDriveAuthError(
        res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'DOWNLOAD_FAILED',
        text.slice(0, 300) || `Download failed (${res.status})`,
        { status: res.status },
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      contentType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDriveThumbnail(projectRoot, fileId, {
  resourceKey = null,
  requireUser = true,
  meta = null,
} = {}) {
  const file = meta || await getDriveFileMeta(projectRoot, fileId, { resourceKey, requireUser });
  if (!file.thumbnailLink) {
    // Fall back to full media for small images.
    return downloadDriveFileMedia(projectRoot, fileId, { resourceKey, requireUser });
  }
  const { accessToken } = await getAccessToken(projectRoot).catch(() => ({ accessToken: null }));
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(file.thumbnailLink, { headers });
  if (!res.ok) {
    return downloadDriveFileMedia(projectRoot, fileId, { resourceKey, requireUser });
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'image/jpeg',
  };
}

export function extensionForMime(mime, fallbackName = '') {
  const fromName = path.extname(fallbackName || '').toLowerCase();
  if (fromName) return fromName;
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'image/tiff': '.tif',
  };
  return map[String(mime || '').toLowerCase()] || '.bin';
}

export async function writeCacheFile(cacheRoot, fileId, buffer, filename) {
  await fs.mkdir(cacheRoot, { recursive: true });
  const safe = String(filename || fileId).replace(/[^\w.\-]+/g, '_');
  const rel = path.join(fileId, safe);
  const abs = path.join(cacheRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return { absolutePath: abs, relativePath: rel.replace(/\\/g, '/'), bytes: buffer.length };
}
