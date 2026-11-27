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

/** Starts Meshy sign-in via the local CLI (device flow by default). */
export function startMeshyCliLogin({ device = true } = {}) {
  return meshyFetch('login', { method: 'POST', body: { device: device !== false } });
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

/** List files/folders under `.meshy-staging` (localhost Meshy API). */
export function listMeshyStaging(relativePath = '') {
  return meshyFetch('staging-list', {
    query: { path: relativePath || '' },
  });
}

export function importMeshyMesh({ jobId, name } = {}) {
  return meshyFetch('import-mesh', { method: 'POST', body: { jobId, name } });
}

export function discardMeshyJob(jobId) {
  return meshyFetch('discard', { method: 'POST', body: { jobId } });
}

/** List staged PBR / texture maps for a completed task (no spend). */
export function fetchMeshyTextureMaps({ jobId = null, taskId = null } = {}) {
  const query = {};
  if (jobId) query.jobId = jobId;
  if (taskId) query.taskId = taskId;
  return meshyFetch('texture-maps', { query });
}

/** Re-download --all-assets for an existing SUCCEEDED task (no generation spend). */
export function requestMeshyTextureMapDownload({ jobId = null, taskId = null } = {}) {
  return meshyFetch('fetch-texture-maps', {
    method: 'POST',
    body: { jobId, taskId },
  });
}

/** Import one map file into the project texture registry. */
export function importMeshyTextureMap({
  jobId = null,
  taskId = null,
  mapId,
  name = null,
  assetBaseName = null,
  folder = null,
} = {}) {
  return meshyFetch('import-texture-map', {
    method: 'POST',
    body: { jobId, taskId, mapId, name, assetBaseName, folder },
  });
}

/** Fetch (free) + import all available PBR maps into Content Browser Textures. */
export function importMeshyTextureMaps({
  jobId = null,
  taskId = null,
  assetBaseName = null,
  name = null,
} = {}) {
  return meshyFetch('import-texture-maps', {
    method: 'POST',
    body: { jobId, taskId, assetBaseName, name },
  });
}
