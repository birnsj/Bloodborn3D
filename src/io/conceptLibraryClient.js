/**
 * Browser client for `/api/concept-library` (dev server only).
 */

async function conceptFetch(action, { method = 'GET', body = null, query = {} } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/concept-library?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Concept Library API ${res.status}`);
    err.code = data.code || `HTTP_${res.status}`;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fetchConceptLibrary() {
  return conceptFetch('get');
}

export function fetchVisionCapability() {
  return conceptFetch('vision-capability');
}

export function createConceptArea(payload) {
  return conceptFetch('area-create', { method: 'POST', body: payload });
}

export function updateConceptArea(payload) {
  return conceptFetch('area-update', { method: 'POST', body: payload });
}

export function duplicateConceptArea(payload) {
  return conceptFetch('area-duplicate', { method: 'POST', body: payload });
}

export function deleteConceptArea(payload) {
  return conceptFetch('area-delete', { method: 'POST', body: payload });
}

export async function importConceptImage({ areaId, file, title }) {
  const qs = new URLSearchParams({
    action: 'concept-import',
    areaId,
    name: file.name,
    title: title || file.name,
  });
  const res = await fetch(`/api/concept-library?${qs}`, {
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

export function saveConceptFromStaging(payload) {
  return conceptFetch('concept-from-staging', { method: 'POST', body: payload });
}

export function updateConcept(payload) {
  return conceptFetch('concept-update', { method: 'POST', body: payload });
}

export function deleteConcept(payload) {
  return conceptFetch('concept-delete', { method: 'POST', body: payload });
}

export function reorderConcepts(payload) {
  return conceptFetch('concept-reorder', { method: 'POST', body: payload });
}

export function setPrimaryConcept(payload) {
  return conceptFetch('concept-set-primary', { method: 'POST', body: payload });
}

export function analyzeConcept(payload) {
  return conceptFetch('concept-analyze', { method: 'POST', body: payload });
}

export function createLibraryPrompt(payload) {
  return conceptFetch('prompt-create', { method: 'POST', body: payload });
}

export function updateLibraryPrompt(payload) {
  return conceptFetch('prompt-update', { method: 'POST', body: payload });
}

export function duplicateLibraryPrompt(payload) {
  return conceptFetch('prompt-duplicate', { method: 'POST', body: payload });
}

export function deleteLibraryPrompt(payload) {
  return conceptFetch('prompt-delete', { method: 'POST', body: payload });
}

/** Copy a concept image into OpenArt staging (no credit spend). */
export function stageConceptReference(payload) {
  return conceptFetch('stage-reference', { method: 'POST', body: payload });
}

/** Persist production asset ↔ concept/prompt association. */
export function attachGeneratedAsset(payload) {
  return conceptFetch('attach-asset', { method: 'POST', body: payload });
}

export function conceptImageUrl(imagePath) {
  if (!imagePath) return null;
  return `/api/concept-library?action=image&path=${encodeURIComponent(imagePath)}`;
}
