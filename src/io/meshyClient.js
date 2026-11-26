/**
 * Browser client for the local Meshy API (CLI-backed).
 * Credentials stay in the Meshy CLI store — never reach this module.
 */

async function meshyFetch(action, {
  method = 'GET',
  body = null,
  query = {},
  rawBody = null,
  headers = {},
} = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/meshy?${qs}`, {
    method,
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: rawBody != null ? rawBody : (body != null ? JSON.stringify(body) : undefined),
  });
  const json = await res.json().catch(() => ({}));
  // Match OpenArt: only throw on HTTP failure. Status payloads may have ok:false
  // (CLI missing / not signed in) and must still reach the UI store.
  if (!res.ok) {
    const err = new Error(json.error || `Meshy API failed (${res.status})`);
    err.code = json.code || 'MESHY_ERROR';
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export function fetchMeshyStatus() {
  return meshyFetch('status');
}

/** Starts `meshy auth login` (browser OAuth) via the local CLI. */
export function startMeshyCliLogin({ device = false } = {}) {
  return meshyFetch('login', { method: 'POST', body: { device: Boolean(device) } });
}

export function startMeshyCliLogout({ all = false } = {}) {
  return meshyFetch('logout', { method: 'POST', body: { all: Boolean(all) } });
}

export function fetchMeshyCatalog() {
  return meshyFetch('catalog');
}

export function estimateMeshyCredits(settings) {
  return meshyFetch('estimate-credits', { method: 'POST', body: { settings } });
}

export function validateMeshySettings(settings) {
  return meshyFetch('validate', { method: 'POST', body: { settings } });
}

export function createMeshyEstimate({
  settings,
  imageDataUri = null,
  imageStagingPath = null,
  provenance = null,
} = {}) {
  return meshyFetch('estimate', {
    method: 'POST',
    body: {
      settings,
      imageDataUri,
      imageStagingPath,
      provenance,
    },
  });
}

export function approveMeshyGeneration({ estimateId, confirmSpend = false } = {}) {
  return meshyFetch('generate', {
    method: 'POST',
    body: { estimateId, confirmSpend },
  });
}

export function fetchMeshyJob(jobId) {
  return meshyFetch('job', { query: { jobId } });
}

export function pollMeshyJob(jobId) {
  return meshyFetch('poll', { method: 'POST', body: { jobId } });
}

export function recoverMeshyJobs() {
  return meshyFetch('recover-jobs', { method: 'POST', body: {} });
}

export function recoverMeshyJob({ jobId = null, taskId = null } = {}) {
  return meshyFetch('recover-job', { method: 'POST', body: { jobId, taskId } });
}

export async function uploadMeshyReference(file) {
  const buf = await file.arrayBuffer();
  return meshyFetch('upload-reference', {
    method: 'POST',
    rawBody: buf,
    query: { name: file.name || 'reference.png' },
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}

export function meshyStagingPreviewUrl(relativePath) {
  if (!relativePath) return null;
  return `/api/meshy?action=staging-file&path=${encodeURIComponent(relativePath)}`;
}

export function importMeshyMesh({ jobId, name } = {}) {
  return meshyFetch('import-mesh', { method: 'POST', body: { jobId, name } });
}

export function discardMeshyJob(jobId) {
  return meshyFetch('discard', { method: 'POST', body: { jobId } });
}
