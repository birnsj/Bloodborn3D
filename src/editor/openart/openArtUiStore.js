/**
 * Phase 2H.1B — module-level OpenArt UI state.
 * Survives Asset Viewer / dock panel unmounts so in-flight jobs keep status.
 * Never stores credentials.
 */
import {
  approveOpenArtGeneration,
  downloadOpenArtJob,
  estimateOpenArtGeneration,
  fetchOpenArtJob,
  fetchOpenArtModelForm,
  fetchOpenArtModels,
  fetchOpenArtStatus,
  importOpenArtStaging,
  openArtStagingPreviewUrl,
  waitOpenArtJob,
} from '../../io/openArtClient.js';

const LISTENERS = new Set();

const initialState = () => ({
  phase: 'idle', // idle|connecting|ready|estimating|estimated|awaitingApproval|submitting|running|completed|failed
  status: null,
  models: [],
  imageModels: [],
  form: null,
  modelId: 'nano-banana-2',
  mode: 'text2image',
  prompt: '',
  formValues: {},
  referenceFileName: null,
  referenceStagingPath: null,
  estimate: null,
  job: null,
  staging: null,
  previewUrl: null,
  imported: null,
  error: null,
  errorCode: null,
  busy: false,
  submitLocked: false,
  pollTimer: null,
  lastCredits: null,
});

let state = initialState();

export function getOpenArtUiState() {
  return state;
}

export function subscribeOpenArtUi(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore subscriber errors */ }
  }
}

function setError(err) {
  setState({
    phase: 'failed',
    busy: false,
    submitLocked: false,
    error: err?.message || String(err),
    errorCode: err?.code || null,
  });
}

export async function openArtConnect() {
  setState({ phase: 'connecting', busy: true, error: null, errorCode: null });
  try {
    const status = await fetchOpenArtStatus();
    if (!status.ok) {
      setState({
        phase: 'failed',
        busy: false,
        status,
        error: status.error || 'OpenArt unavailable',
        errorCode: status.code || 'CLI_MISSING',
        lastCredits: null,
      });
      return status;
    }
    const modelsRes = await fetchOpenArtModels();
    const models = Array.isArray(modelsRes.models) ? modelsRes.models : [];
    const imageModels = models.filter((m) => Array.isArray(m.modes?.image) && m.modes.image.length);
    const preferred = imageModels.find((m) => m.id === state.modelId)
      || imageModels.find((m) => m.id === 'nano-banana-2')
      || imageModels[0]
      || null;
    const modelId = preferred?.id || state.modelId;
    const modes = preferred?.modes?.image?.map((m) => m.mode) || ['text2image'];
    const mode = modes.includes(state.mode) ? state.mode : modes[0];
    setState({
      phase: 'ready',
      busy: false,
      status,
      models,
      imageModels,
      modelId,
      mode,
      lastCredits: status.account?.credits ?? null,
      error: null,
      errorCode: null,
    });
    await openArtLoadForm(modelId, mode);
    return status;
  } catch (err) {
    setError(err);
    throw err;
  }
}

export async function openArtLoadForm(modelId = state.modelId, mode = state.mode) {
  try {
    const res = await fetchOpenArtModelForm(modelId, mode);
    const form = res.form || res;
    const defaults = {};
    const props = form?.jsonSchema?.properties || {};
    for (const [key, schema] of Object.entries(props)) {
      if (key === 'prompt') continue;
      if (schema.default !== undefined) defaults[key] = schema.default;
    }
    setState({
      modelId,
      mode,
      form,
      formValues: { ...defaults, ...pickKnown(state.formValues, props) },
    });
    return form;
  } catch (err) {
    setState({ form: null, error: err.message, errorCode: err.code || null });
    throw err;
  }
}

function pickKnown(values, props) {
  const next = {};
  for (const key of Object.keys(props || {})) {
    if (key === 'prompt') continue;
    if (values?.[key] !== undefined) next[key] = values[key];
  }
  return next;
}

export function openArtSetPrompt(prompt) {
  setState({ prompt: String(prompt ?? ''), estimate: null, phase: state.phase === 'estimated' ? 'ready' : state.phase });
}

export function openArtSetFormValue(key, value) {
  setState({
    formValues: { ...state.formValues, [key]: value },
    estimate: null,
    phase: state.phase === 'estimated' ? 'ready' : state.phase,
  });
}

export async function openArtSetModel(modelId) {
  const model = state.imageModels.find((m) => m.id === modelId);
  const modes = model?.modes?.image?.map((m) => m.mode) || ['text2image'];
  const mode = modes.includes(state.mode) ? state.mode : modes[0];
  setState({ modelId, mode, estimate: null, referenceStagingPath: mode === 'text2image' ? null : state.referenceStagingPath });
  await openArtLoadForm(modelId, mode);
}

export async function openArtSetMode(mode) {
  setState({
    mode,
    estimate: null,
    referenceFileName: mode === 'image2image' ? state.referenceFileName : null,
    referenceStagingPath: mode === 'image2image' ? state.referenceStagingPath : null,
  });
  await openArtLoadForm(state.modelId, mode);
}

export function openArtSetReference({ fileName = null, stagingPath = null } = {}) {
  setState({
    referenceFileName: fileName,
    referenceStagingPath: stagingPath,
    estimate: null,
    phase: state.phase === 'estimated' ? 'ready' : state.phase,
  });
}

export async function openArtEstimate() {
  if (state.busy || state.submitLocked) return null;
  setState({ phase: 'estimating', busy: true, error: null, errorCode: null });
  try {
    const aspectRatio = state.formValues.aspectRatio || '1:1';
    const resolution = state.formValues.resolution || '1K';
    const estimate = await estimateOpenArtGeneration({
      prompt: state.prompt,
      modelId: state.modelId,
      mode: state.mode,
      aspectRatio,
      resolution,
      imagePaths: state.referenceStagingPath ? [state.referenceStagingPath] : null,
      formValues: state.formValues,
    });
    setState({
      phase: 'estimated',
      busy: false,
      estimate,
      error: null,
    });
    return estimate;
  } catch (err) {
    setError(err);
    throw err;
  }
}

/**
 * Explicit spend path. Caller must pass confirmSpend:true after UI approval.
 * Prevents duplicate submissions via submitLocked.
 */
export async function openArtGenerate({ confirmSpend = false } = {}) {
  if (!state.estimate?.estimateId) {
    const err = new Error('Estimate the cost before generating');
    err.code = 'ESTIMATE_REQUIRED';
    setError(err);
    throw err;
  }
  if (confirmSpend !== true) {
    const err = new Error('Paid generation requires explicit approval');
    err.code = 'APPROVAL_REQUIRED';
    setError(err);
    throw err;
  }
  if (state.submitLocked || state.busy) {
    const err = new Error('A generation is already in progress');
    err.code = 'DUPLICATE_SUBMIT';
    throw err;
  }

  setState({
    phase: 'submitting',
    busy: true,
    submitLocked: true,
    error: null,
    imported: null,
    staging: null,
    previewUrl: null,
  });

  try {
    const gen = await approveOpenArtGeneration({
      estimateId: state.estimate.estimateId,
      confirmSpend: true,
    });
    setState({
      phase: 'running',
      busy: true,
      job: {
        jobId: gen.jobId,
        generationId: gen.generationId,
        status: 'submitted',
      },
    });
    // Prefer wait (single CLI poll) over client retry loops that could look like re-submit.
    const waited = await waitOpenArtJob({
      jobId: gen.jobId,
      generationId: gen.generationId,
      timeout: '5m',
    });
    setState({
      phase: waited.job?.status === 'failed' ? 'failed' : 'running',
      job: waited.job,
      error: waited.job?.status === 'failed' ? (waited.job.error || 'Generation failed') : null,
    });
    if (waited.job?.status === 'failed') {
      setState({ busy: false, submitLocked: false });
      await openArtRefreshCredits();
      return waited;
    }

    const downloaded = await downloadOpenArtJob({ jobId: gen.jobId });
    const stagingId = downloaded.staging?.stagingId;
    setState({
      phase: 'completed',
      busy: false,
      submitLocked: false,
      staging: downloaded.staging,
      job: downloaded.job || waited.job,
      previewUrl: stagingId ? openArtStagingPreviewUrl(stagingId) : null,
    });
    await openArtRefreshCredits();
    return downloaded;
  } catch (err) {
    setState({ submitLocked: false });
    setError(err);
    await openArtRefreshCredits().catch(() => {});
    throw err;
  }
}

export async function openArtRefreshCredits() {
  try {
    const status = await fetchOpenArtStatus();
    if (status.ok) {
      setState({
        status,
        lastCredits: status.account?.credits ?? state.lastCredits,
      });
    }
    return status;
  } catch {
    return null;
  }
}

export async function openArtPollJob() {
  if (!state.job?.jobId && !state.job?.generationId) return null;
  const res = await fetchOpenArtJob({
    jobId: state.job.jobId,
    generationId: state.job.generationId,
  });
  setState({ job: res.job });
  return res;
}

export async function openArtImportTexture() {
  if (!state.staging?.stagingId) throw new Error('No staged result to import');
  setState({ busy: true, error: null });
  try {
    const imported = await importOpenArtStaging({
      stagingId: state.staging.stagingId,
      createMaterial: false,
      textureName: suggestName(state.prompt, 'OpenArt Texture'),
    });
    setState({ busy: false, imported: { ...imported, kind: 'texture' } });
    return imported;
  } catch (err) {
    setError(err);
    throw err;
  }
}

export async function openArtCreateMaterial() {
  if (!state.staging?.stagingId) throw new Error('No staged result to import');
  setState({ busy: true, error: null });
  try {
    const imported = await importOpenArtStaging({
      stagingId: state.staging.stagingId,
      createMaterial: true,
      textureName: suggestName(state.prompt, 'OpenArt Texture'),
      materialName: suggestName(state.prompt, 'OpenArt Material'),
    });
    setState({ busy: false, imported: { ...imported, kind: 'material' } });
    return imported;
  } catch (err) {
    setError(err);
    throw err;
  }
}

export function openArtDiscardResult() {
  setState({
    phase: state.status?.ok ? 'ready' : state.phase,
    estimate: null,
    job: null,
    staging: null,
    previewUrl: null,
    imported: null,
    error: null,
    errorCode: null,
    busy: false,
    submitLocked: false,
  });
}

export function openArtResetSession() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state = initialState();
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

function suggestName(prompt, fallback) {
  const cleaned = String(prompt || '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
  return cleaned ? `OpenArt ${cleaned}` : fallback;
}

/** Test helper */
export function __testSetOpenArtUiState(patch) {
  setState(patch);
}

/** Browser acceptance hook (dev harness). Never stores credentials. */
if (typeof window !== 'undefined') {
  window.__bloodboundOpenArtUi = {
    get: getOpenArtUiState,
    connect: openArtConnect,
    estimate: openArtEstimate,
    generate: openArtGenerate,
    discard: openArtDiscardResult,
    reset: openArtResetSession,
    setPrompt: openArtSetPrompt,
    __testSet: __testSetOpenArtUiState,
  };
}
