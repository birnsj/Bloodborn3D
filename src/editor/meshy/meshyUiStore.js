/**
 * Meshy Image-to-3D UI store — mirrors OpenArt spend-safety patterns.
 */
import {
  approveMeshyGeneration,
  createMeshyEstimate,
  discardMeshyJob,
  fetchMeshyCatalog,
  fetchMeshyStatus,
  importMeshyMesh,
  pollMeshyJob,
  recoverMeshyJob,
  recoverMeshyJobs,
  startMeshyCliLogin,
  startMeshyCliLogout,
  uploadMeshyReference,
} from '../../io/meshyClient.js';
import {
  GAME_CHARACTER_PRESET,
  GAME_PROP_PRESET,
  createDefaultMeshyFormValues,
  estimateImageTo3dCredits,
  presetForAssetCategory,
} from '../../dev/meshy/meshyModels.js';

const LISTENERS = new Set();

const initialForm = () => ({ ...createDefaultMeshyFormValues() });

let state = {
  phase: 'idle', // idle | connecting | ready | estimating | awaiting_approval | submitting | running | succeeded | failed
  busy: false,
  status: null,
  catalog: null,
  formValues: initialForm(),
  reference: null, // { stagingPath, previewUrl, title, source }
  estimate: null,
  job: null,
  imported: null,
  error: null,
  errorCode: null,
  localCreditEstimate: null,
};

function emit() {
  for (const listener of LISTENERS) {
    try { listener(state); } catch { /* ignore */ }
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
  return state;
}

export function getMeshyUiState() {
  return state;
}

export function subscribeMeshyUi(listener) {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

export function __testResetMeshyUi() {
  state = {
    phase: 'idle',
    busy: false,
    status: null,
    catalog: null,
    formValues: initialForm(),
    reference: null,
    estimate: null,
    job: null,
    imported: null,
    error: null,
    errorCode: null,
    localCreditEstimate: null,
  };
  emit();
}

function refreshLocalEstimate(formValues = state.formValues) {
  const quote = estimateImageTo3dCredits(formValues);
  return quote.ok ? quote : null;
}

export async function meshyConnect() {
  setState({ busy: true, phase: 'connecting', error: null, errorCode: null });
  try {
    const [status, catalog] = await Promise.all([
      fetchMeshyStatus(),
      fetchMeshyCatalog().catch(() => null),
    ]);
    const recovered = await recoverMeshyJobs().catch(() => null);
    let job = state.job;
    if (!job && recovered?.jobs?.length) {
      const active = recovered.jobs.find((j) => j.phase === 'pending' || j.phase === 'running')
        || recovered.jobs.find((j) => j.phase === 'succeeded');
      if (active?.jobId) {
        try {
          const polled = await recoverMeshyJob({ jobId: active.jobId });
          job = polled.job;
        } catch {
          // ignore
        }
      }
    }
    const formValues = catalog?.defaults
      ? { ...createDefaultMeshyFormValues(), ...catalog.defaults }
      : state.formValues;
    setState({
      busy: false,
      phase: status.ok ? (job?.phase === 'succeeded' ? 'succeeded' : 'ready') : 'failed',
      status,
      catalog,
      formValues,
      job: job || null,
      localCreditEstimate: refreshLocalEstimate(formValues),
      error: status.ok ? null : status.error,
      errorCode: status.ok ? null : status.code,
    });
    return state;
  } catch (err) {
    setState({
      busy: false,
      phase: 'failed',
      error: err.message,
      errorCode: err.code || 'CONNECT_FAILED',
    });
    throw err;
  }
}

/** Opens Meshy CLI browser (or device) sign-in. */
export async function meshyLogin({ device = false } = {}) {
  setState({ busy: true, error: null, errorCode: null });
  try {
    const result = await startMeshyCliLogin({ device });
    setState({
      busy: false,
      error: result.message || 'Complete browser sign-in, then Refresh.',
      errorCode: null,
    });
    return result;
  } catch (err) {
    setState({
      busy: false,
      error: err.message,
      errorCode: err.code || 'LOGIN_FAILED',
    });
    throw err;
  }
}

export async function meshyLogout() {
  setState({ busy: true, error: null, errorCode: null });
  try {
    await startMeshyCliLogout({ all: false });
    const status = await fetchMeshyStatus();
    setState({
      busy: false,
      status,
      phase: 'failed',
      error: status.error || 'Disconnected',
      errorCode: status.code || 'AUTH_FAILED',
    });
    return status;
  } catch (err) {
    setState({
      busy: false,
      error: err.message,
      errorCode: err.code || 'LOGOUT_FAILED',
    });
    throw err;
  }
}

export function meshySetFormValue(key, value) {
  let formValues = { ...state.formValues, [key]: value };
  // Switching category applies the matching preset while preserving mesh tweaks
  // only when staying within the same category's character/prop fields.
  if (key === 'asset_category') {
    const preset = presetForAssetCategory(value);
    formValues = {
      ...formValues,
      ...preset,
      // Keep the user's current mesh/texture choices when flipping category.
      model_type: state.formValues.model_type || preset.model_type,
      ai_model: state.formValues.ai_model || preset.ai_model,
      target_polycount: state.formValues.target_polycount ?? preset.target_polycount,
      topology: state.formValues.topology || preset.topology,
      should_texture: state.formValues.should_texture !== false,
      enable_pbr: state.formValues.enable_pbr !== false,
      texture_model: state.formValues.texture_model || preset.texture_model,
      texture_resolution: state.formValues.texture_resolution || preset.texture_resolution,
      asset_category: value === 'character' ? 'character' : 'prop',
      pose_mode: value === 'character' ? (state.formValues.pose_mode || '') : '',
      include_objects: value === 'character'
        ? (state.formValues.include_objects !== false)
        : false,
    };
  }
  // Keep valid combos: if PBR on, force a PBR-capable texture model.
  if (key === 'enable_pbr' && value === true) {
    formValues.should_texture = true;
    if (formValues.texture_model === 'meshy-n1') {
      formValues.texture_model = 'meshy-7';
    }
  }
  if (key === 'should_texture' && value === false) {
    formValues.enable_pbr = false;
  }
  if (key === 'model_type') {
    if (value === 'smart-topology') {
      formValues.ai_model = formValues.ai_model?.startsWith('meshy-t')
        ? formValues.ai_model
        : 'meshy-t2.5';
      formValues.topology = 'triangle';
      formValues.should_remesh = false;
    } else if (formValues.ai_model?.startsWith('meshy-t')) {
      formValues.ai_model = 'meshy-7.1';
    }
  }
  if (key === 'ai_model' && String(value).startsWith('meshy-t')) {
    formValues.model_type = 'smart-topology';
    formValues.topology = 'triangle';
  }
  if (formValues.asset_category !== 'character') {
    formValues.pose_mode = '';
    formValues.include_objects = false;
  }
  setState({
    formValues,
    estimate: null,
    localCreditEstimate: refreshLocalEstimate(formValues),
  });
}

export function meshyApplyPreset(preset = GAME_PROP_PRESET) {
  const formValues = { ...createDefaultMeshyFormValues(), ...preset };
  setState({
    formValues,
    estimate: null,
    localCreditEstimate: refreshLocalEstimate(formValues),
  });
}

/** Apply Game Prop or Character preset by category id. */
export function meshyApplyCategoryPreset(category = 'prop') {
  return meshyApplyPreset(presetForAssetCategory(category));
}

export { GAME_CHARACTER_PRESET, GAME_PROP_PRESET };

export function meshySetReference(ref) {
  setState({
    reference: ref || null,
    estimate: null,
  });
}

export function meshyClearReference() {
  setState({ reference: null, estimate: null });
}

/**
 * Apply a handoff from Project Art / OpenArt without starting generation.
 */
export function meshyApplySeed({
  reference = null,
  settings = null,
  provenance = null,
} = {}) {
  const formValues = settings
    ? { ...createDefaultMeshyFormValues(), ...settings }
    : state.formValues;
  setState({
    reference: reference
      ? { ...reference, provenance: provenance || reference.provenance || null }
      : state.reference,
    formValues,
    estimate: null,
    localCreditEstimate: refreshLocalEstimate(formValues),
    phase: state.status?.ok ? 'ready' : state.phase,
  });
}

export async function meshyUploadReferenceFile(file) {
  const uploaded = await uploadMeshyReference(file);
  meshySetReference({
    stagingPath: uploaded.relativePath,
    previewUrl: uploaded.previewUrl,
    title: file.name,
    source: 'import',
  });
  return uploaded;
}

export async function meshyEstimate() {
  if (!state.reference?.stagingPath && !state.reference?.imageDataUri) {
    const err = new Error('Add a reference image before estimating');
    err.code = 'IMAGE_REQUIRED';
    throw err;
  }
  setState({ busy: true, phase: 'estimating', error: null, errorCode: null });
  try {
    const estimate = await createMeshyEstimate({
      settings: state.formValues,
      imageDataUri: state.reference.imageDataUri || null,
      imageStagingPath: state.reference.stagingPath || null,
      provenance: {
        ...(state.reference.provenance || {}),
        referenceTitle: state.reference.title || null,
        referenceSource: state.reference.source || null,
      },
    });
    setState({
      busy: false,
      phase: 'awaiting_approval',
      estimate,
      localCreditEstimate: refreshLocalEstimate(),
    });
    return estimate;
  } catch (err) {
    setState({
      busy: false,
      phase: 'failed',
      error: err.message,
      errorCode: err.code || 'ESTIMATE_FAILED',
    });
    throw err;
  }
}

/**
 * Paid generate — requires confirmSpend === true after UI approval dialog.
 */
export async function meshyGenerate({ confirmSpend = false } = {}) {
  if (confirmSpend !== true) {
    const err = new Error('Paid Meshy generation requires explicit spend approval');
    err.code = 'APPROVAL_REQUIRED';
    throw err;
  }
  if (!state.estimate?.estimateId) {
    const err = new Error('Estimate required before generate');
    err.code = 'ESTIMATE_REQUIRED';
    throw err;
  }
  setState({ busy: true, phase: 'submitting', error: null, errorCode: null });
  try {
    const submitted = await approveMeshyGeneration({
      estimateId: state.estimate.estimateId,
      confirmSpend: true,
    });
    setState({
      busy: true,
      phase: 'running',
      job: {
        jobId: submitted.jobId,
        taskId: submitted.taskId,
        phase: 'pending',
        status: 'PENDING',
        progress: 0,
        settings: submitted.settings,
        creditsEstimated: submitted.credits,
      },
      estimate: null,
      imported: null,
    });
    return meshyPollUntilSettled(submitted.jobId);
  } catch (err) {
    setState({
      busy: false,
      phase: err.code === 'SPEND_AMBIGUOUS' ? 'failed' : 'failed',
      error: err.message,
      errorCode: err.code || 'GENERATE_FAILED',
    });
    throw err;
  }
}

export async function meshyPollUntilSettled(jobId, { maxMs = 60 * 60 * 1000 } = {}) {
  const started = Date.now();
  let delay = 5000;
  while (Date.now() - started < maxMs) {
    const result = await pollMeshyJob(jobId);
    const job = result.job;
    setState({
      job,
      phase: job.phase === 'succeeded'
        ? 'succeeded'
        : job.phase === 'failed'
          ? 'failed'
          : 'running',
      busy: job.phase !== 'succeeded' && job.phase !== 'failed',
      error: job.error || null,
      errorCode: job.code || null,
    });
    if (job.phase === 'succeeded' || job.phase === 'failed' || job.phase === 'discarded') {
      return job;
    }
    delay = Math.max(2000, Number(result.retryAfterSec) * 1000 || delay);
    await new Promise((r) => setTimeout(r, delay));
  }
  const err = new Error('Timed out waiting for Meshy task — recover the job later with the task ID');
  err.code = 'POLL_TIMEOUT';
  setState({ busy: false, phase: 'failed', error: err.message, errorCode: err.code });
  throw err;
}

export async function meshyImportModel({ name } = {}) {
  if (!state.job?.jobId) {
    const err = new Error('No Meshy result to import');
    err.code = 'NO_RESULT';
    throw err;
  }
  setState({ busy: true, error: null, errorCode: null });
  try {
    const result = await importMeshyMesh({
      jobId: state.job.jobId,
      name: name || state.reference?.title || 'Meshy Model',
    });
    setState({
      busy: false,
      imported: result.asset,
      job: result.job || state.job,
    });
    return result;
  } catch (err) {
    setState({ busy: false, error: err.message, errorCode: err.code || 'IMPORT_FAILED' });
    throw err;
  }
}

export async function meshyDiscardResult() {
  if (state.job?.jobId) {
    try {
      await discardMeshyJob(state.job.jobId);
    } catch {
      // ignore
    }
  }
  setState({
    job: null,
    estimate: null,
    imported: null,
    phase: state.status?.ok ? 'ready' : 'idle',
    busy: false,
    error: null,
    errorCode: null,
  });
}

if (typeof window !== 'undefined') {
  window.__bloodboundMeshyUi = {
    getState: getMeshyUiState,
    connect: meshyConnect,
    estimate: meshyEstimate,
    generate: meshyGenerate,
  };
}
