/**
 * Browser client for `/api/project-art` (dev server only).
 */

async function artFetch(action, { method = 'GET', body = null, query = {} } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/project-art?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Project Art API ${res.status}`);
    err.code = data.code || `HTTP_${res.status}`;
    err.status = res.status;
    err.dropped = data.dropped;
    throw err;
  }
  return data;
}

export function fetchProjectArtMeta() {
  return artFetch('meta');
}

export function fetchProjectArtTree() {
  return artFetch('tree');
}

export function listProjectArtFolder(folderPath = '') {
  return artFetch('list', { query: { path: folderPath } });
}

export function searchProjectArt(q) {
  return artFetch('search', { query: { q: q || '' } });
}

export function fetchProjectArtVisionCapability() {
  return artFetch('vision-capability');
}

export function mkdirProjectArt(payload) {
  return artFetch('mkdir', { method: 'POST', body: payload });
}

export function renameProjectArt(payload) {
  return artFetch('rename', { method: 'POST', body: payload });
}

export function moveProjectArt(payload) {
  return artFetch('move', { method: 'POST', body: payload });
}

export function copyProjectArt(payload) {
  return artFetch('copy', { method: 'POST', body: payload });
}

export function deleteProjectArt(payload) {
  return artFetch('delete', { method: 'POST', body: payload });
}

export function updateProjectArtItem(payload) {
  return artFetch('item-update', { method: 'POST', body: payload });
}

export function createProjectArtCollection(payload) {
  return artFetch('collection-create', { method: 'POST', body: payload });
}

export function updateProjectArtCollection(payload) {
  return artFetch('collection-update', { method: 'POST', body: payload });
}

export function deleteProjectArtCollection(payload) {
  return artFetch('collection-delete', { method: 'POST', body: payload });
}

export function createProjectArtReferenceSet(payload) {
  return artFetch('reference-set-create', { method: 'POST', body: payload });
}

export function updateProjectArtReferenceSet(payload) {
  return artFetch('reference-set-update', { method: 'POST', body: payload });
}

export function deleteProjectArtReferenceSet(payload) {
  return artFetch('reference-set-delete', { method: 'POST', body: payload });
}

export function createProjectArtPrompt(payload) {
  return artFetch('prompt-create', { method: 'POST', body: payload });
}

export function updateProjectArtPrompt(payload) {
  return artFetch('prompt-update', { method: 'POST', body: payload });
}

export function deleteProjectArtPrompt(payload) {
  return artFetch('prompt-delete', { method: 'POST', body: payload });
}

export function composeProjectArtPrompt(payload) {
  return artFetch('compose-prompt', { method: 'POST', body: payload });
}

export function analyzeProjectArtPrompt(payload) {
  return artFetch('analyze-prompt', { method: 'POST', body: payload });
}

export function stageProjectArtReferences(payload) {
  return artFetch('stage-references', { method: 'POST', body: payload });
}

export function saveProjectArtFromStaging(payload) {
  return artFetch('save-from-staging', { method: 'POST', body: payload });
}

export function attachProjectArtAsset(payload) {
  return artFetch('attach-asset', { method: 'POST', body: payload });
}

export function openProjectArtFolder(payload) {
  return artFetch('open-folder', { method: 'POST', body: payload });
}

export async function importProjectArtImage({ folder = '', file, title }) {
  const qs = new URLSearchParams({
    action: 'import',
    folder,
    name: file.name,
    title: title || file.name,
  });
  const res = await fetch(`/api/project-art?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Import failed: ${res.status}`);
    err.code = data.code || `HTTP_${res.status}`;
    throw err;
  }
  return data;
}

export function projectArtImageUrl(relativePath) {
  if (!relativePath) return null;
  return `/api/project-art?action=image&path=${encodeURIComponent(relativePath)}`;
}
