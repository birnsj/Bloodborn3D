/**
 * Browser client for `/api/google-drive` (dev server only).
 * Tokens never reach this module.
 */

async function driveFetch(action, { method = 'GET', body = null, query = {}, timeoutMs = 60_000 } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/google-drive?${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Google Drive API ${res.status}`);
      err.code = data.code || `HTTP_${res.status}`;
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeout = new Error(`Google Drive request timed out after ${Math.round(timeoutMs / 1000)}s`);
      timeout.code = 'TIMEOUT';
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchGoogleDriveStatus() {
  return driveFetch('status', { timeoutMs: 15_000 });
}

export function startGoogleDriveLogin() {
  // OAuth loopback can take a few minutes; keep the HTTP call open that long.
  return driveFetch('login', { method: 'POST', body: {}, timeoutMs: 320_000 });
}

export function startGoogleDriveLogout() {
  return driveFetch('logout', { method: 'POST', body: {} });
}

export function parseGoogleDriveUrlClient(url) {
  return driveFetch('parse-url', { method: 'POST', body: { url } });
}

export function fetchGoogleDriveLibraries() {
  return driveFetch('libraries');
}

export function addGoogleDriveLibrary(url) {
  return driveFetch('add-library', { method: 'POST', body: { url } });
}

export function removeGoogleDriveLibrary(libraryId) {
  return driveFetch('remove-library', { method: 'POST', body: { libraryId } });
}

export function refreshGoogleDriveLibrary(libraryId) {
  return driveFetch('refresh-library', { method: 'POST', body: { libraryId } });
}

export function fetchGoogleDriveTree(libraryId) {
  return driveFetch('tree', { query: { libraryId } });
}

export function listGoogleDriveFolder(libraryId, folderPath = '', pageToken = null) {
  return driveFetch('list', {
    query: {
      libraryId,
      path: folderPath || '',
      ...(pageToken ? { pageToken } : {}),
    },
  });
}

export function materializeGoogleDriveFile(payload) {
  return driveFetch('materialize', { method: 'POST', body: payload });
}

export function copyGoogleDriveToProjectArt(payload) {
  return driveFetch('copy-to-project-art', { method: 'POST', body: payload });
}

export function googleDriveImageUrl(fileId, { libraryId = null, thumb = true } = {}) {
  if (!fileId) return null;
  const qs = new URLSearchParams({
    action: 'image',
    fileId,
    thumb: thumb ? '1' : '0',
  });
  if (libraryId) qs.set('libraryId', libraryId);
  return `/api/google-drive?${qs}`;
}
