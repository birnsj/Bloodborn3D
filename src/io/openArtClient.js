/**
 * Browser client for the local-dev OpenArt API (`/api/openart`).
 * Credentials never reach the browser — only status / estimates / job ids.
 */

async function openArtFetch(action, { method = 'GET', body = null, query = {} } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`/api/openart?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `OpenArt API ${res.status}`);
    err.code = data.code || `HTTP_${res.status}`;
    err.details = data.details || null;
    err.status = res.status;
    throw err;
  }
  return data;
}

export function fetchOpenArtStatus() {
  return openArtFetch('status');
}

export function fetchOpenArtModels() {
  return openArtFetch('models');
}

export function fetchOpenArtModelForm(modelId, mode = 'text2image') {
  return openArtFetch('form', { query: { model: modelId, mode } });
}

export function estimateOpenArtGeneration(payload) {
  return openArtFetch('estimate', { method: 'POST', body: payload });
}

/** Paid call — must pass confirmSpend: true with a prior estimateId. */
export function approveOpenArtGeneration({ estimateId, confirmSpend }) {
  return openArtFetch('generate', {
    method: 'POST',
    body: { estimateId, confirmSpend },
  });
}

export function fetchOpenArtJob({ jobId, generationId }) {
  const query = {};
  if (jobId) query.jobId = jobId;
  if (generationId) query.generationId = generationId;
  return openArtFetch('job', { query });
}

export function waitOpenArtJob(payload) {
  return openArtFetch('wait', { method: 'POST', body: payload });
}

export function downloadOpenArtJob(payload) {
  return openArtFetch('download', { method: 'POST', body: payload });
}

export function importOpenArtStaging(payload) {
  return openArtFetch('import', { method: 'POST', body: payload });
}

export function openArtStagingPreviewUrl(stagingId) {
  return `/api/openart?action=staging-file&stagingId=${encodeURIComponent(stagingId)}`;
}
