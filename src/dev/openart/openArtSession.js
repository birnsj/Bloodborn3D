/**
 * Phase 2H.1A — OpenArt session: estimate → explicit approve → one-shot generate.
 *
 * In-memory approval records bind a cost quote to exact generate args. Spending
 * credits requires `confirmSpend: true` against a live estimate. No automatic
 * retries. Staging files land under `.openart-staging/` (gitignored).
 *
 * Hardening:
 * - Synchronous reservation before paid submit (blocks concurrent double-spend).
 * - Ambiguous provider failures block resubmit (charge may already have occurred).
 * - Jobs persisted under staging for restart recovery without re-spend.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  OpenArtCliError,
  CLI_GENERATE_IMAGE_PARAMS,
  UNSUPPORTED_GENERATE_CLI_PARAMS,
  defaultStagingRoot,
  detectOpenArtCli,
  downloadUrlToFile,
  dryRunGenerateImage,
  estimateCost,
  getAccount,
  getCreation,
  getModelForm,
  listModels,
  submitGenerateImageAsync,
  waitCreation,
} from './openArtCli.js';

/** @type {Map<string, object>} */
const estimates = new Map();
/** @type {Map<string, object>} */
const jobs = new Map();

const DEFAULT_MODEL = 'nano-banana-2';
const DEFAULT_MODE = 'text2image';

/** Codes that mean the paid CLI call never left this process. Safe to release reservation. */
const PREFLIGHT_FAILURE_CODES = new Set([
  'INVALID_ARGV',
  'INVALID_PROMPT',
  'INVALID_MODEL',
  'INVALID_MODE',
  'INVALID_IMAGE',
  'INVALID_ASPECT',
  'INVALID_RESOLUTION',
  'CLI_MISSING',
  'APPROVAL_REQUIRED',
  'ESTIMATE_NOT_FOUND',
  'ALREADY_SPENT',
  'SPEND_RESERVED',
  'SPEND_AMBIGUOUS',
]);

export function clearOpenArtSessionState() {
  estimates.clear();
  jobs.clear();
}

export async function getOpenArtStatus() {
  const cli = await detectOpenArtCli();
  if (!cli.ok) {
    return {
      ok: false,
      cli,
      account: null,
      code: cli.code || 'CLI_MISSING',
      error: cli.error,
    };
  }
  try {
    const account = await getAccount({ executable: cli.executable });
    return { ok: true, cli, account, code: null, error: null };
  } catch (err) {
    return {
      ok: false,
      cli,
      account: null,
      code: err.code || 'AUTH_FAILED',
      error: err.message,
    };
  }
}

export async function listOpenArtModels() {
  const models = await listModels();
  return { ok: true, models: Array.isArray(models) ? models : models?.items || models };
}

export async function getOpenArtModelForm(modelId, mode = DEFAULT_MODE) {
  const form = await getModelForm(modelId, mode);
  return { ok: true, form };
}

function buildCliSubmitParams(record) {
  return {
    prompt: record.prompt,
    modelId: record.modelId,
    imagePaths: record.imagePaths?.length ? [...record.imagePaths] : null,
  };
}

/**
 * Quote cost + dry-run the exact generate request. Creates an estimate record
 * that must be approved before any paid call.
 */
export async function createEstimate({
  prompt,
  modelId = DEFAULT_MODEL,
  mode = DEFAULT_MODE,
  aspectRatio = '1:1',
  resolution = '1K',
  imagePaths = null,
  formValues = null,
} = {}) {
  const cost = await estimateCost({ modelId, mode, aspectRatio, resolution });
  const item = Array.isArray(cost?.items)
    ? cost.items.find((i) => i.model === modelId && i.mode === mode) || cost.items[0]
    : null;
  const images = Array.isArray(imagePaths) ? imagePaths.filter(Boolean) : [];
  const dryRun = await dryRunGenerateImage({
    prompt,
    modelId,
    imagePaths: images.length ? images : null,
  });

  const estimateId = `est_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const record = {
    estimateId,
    createdAt: Date.now(),
    prompt,
    modelId,
    mode,
    aspectRatio,
    resolution,
    imagePaths: images,
    formValues: formValues && typeof formValues === 'object' ? { ...formValues } : null,
    totalCredits: item?.totalCredits ?? null,
    unitCredits: item?.unitCredits ?? null,
    costConfig: item?.config ?? null,
    costRaw: cost,
    dryRun,
    approved: false,
    spent: false,
    /** null | 'reserved' | 'confirmed' | 'ambiguous' */
    reservation: null,
    generationId: null,
  };
  estimates.set(estimateId, record);

  const cliSubmitParams = buildCliSubmitParams(record);

  return {
    ok: true,
    estimateId,
    prompt,
    modelId,
    mode,
    aspectRatio,
    resolution,
    totalCredits: record.totalCredits,
    unitCredits: record.unitCredits,
    costConfig: record.costConfig,
    dryRun,
    cliSubmitParams,
    cliGenerateParams: CLI_GENERATE_IMAGE_PARAMS,
    unsupportedForCliSubmit: UNSUPPORTED_GENERATE_CLI_PARAMS,
    pricingNote: cost?.pricingNote || null,
    approvalRequired: true,
    message: 'Call approveAndGenerate with confirmSpend:true to spend credits once.',
  };
}

/**
 * Explicit paid generation. Requires confirmSpend:true and a prior estimate.
 * Submits async exactly once — never retries on failure.
 */
export async function approveAndGenerate({
  estimateId,
  confirmSpend = false,
  _submit = submitGenerateImageAsync,
  stagingRoot = defaultStagingRoot(),
} = {}) {
  if (confirmSpend !== true) {
    throw new OpenArtCliError(
      'APPROVAL_REQUIRED',
      'Paid generation requires confirmSpend:true (no automatic spend)',
    );
  }
  const record = estimates.get(estimateId);
  if (!record) {
    throw new OpenArtCliError('ESTIMATE_NOT_FOUND', `Unknown estimateId: ${estimateId}`);
  }
  if (record.reservation === 'reserved') {
    throw new OpenArtCliError(
      'SPEND_RESERVED',
      `Estimate ${estimateId} is already reserved by an in-flight submit`,
    );
  }
  if (record.reservation === 'ambiguous') {
    throw new OpenArtCliError(
      'SPEND_AMBIGUOUS',
      `Estimate ${estimateId} had an ambiguous submit failure — recover the provider job; do not resubmit`,
      { lastError: record.lastError || null },
    );
  }
  if (record.spent || record.reservation === 'confirmed') {
    throw new OpenArtCliError(
      'ALREADY_SPENT',
      `Estimate ${estimateId} already submitted as generation ${record.generationId}`,
    );
  }

  // Synchronous reservation BEFORE awaiting any paid provider call.
  record.approved = true;
  record.reservation = 'reserved';
  record.reservedAt = Date.now();

  const cliSubmitParams = buildCliSubmitParams(record);
  let result;
  try {
    result = await _submit(cliSubmitParams);
  } catch (err) {
    const code = err?.code || 'CLI_COMMAND_FAILED';
    record.lastError = { code, message: err.message, at: Date.now() };
    if (PREFLIGHT_FAILURE_CODES.has(code)) {
      record.reservation = null;
      record.approved = false;
    } else {
      // Provider may have accepted the job — block accidental resubmit/charge.
      record.reservation = 'ambiguous';
      record.spent = true;
    }
    throw err;
  }

  const generationId = extractGenerationId(result);
  if (!generationId) {
    record.lastError = {
      code: 'NO_GENERATION_ID',
      message: 'CLI returned no generation id',
      at: Date.now(),
      raw: result,
    };
    record.reservation = 'ambiguous';
    record.spent = true;
    throw new OpenArtCliError(
      'NO_GENERATION_ID',
      'OpenArt async generate returned no id — treat as ambiguous; do not resubmit',
      { result },
    );
  }

  record.spent = true;
  record.reservation = 'confirmed';
  record.generationId = generationId;
  record.submittedAt = Date.now();
  record.submitRaw = result;
  record.submittedParams = cliSubmitParams;

  const job = {
    jobId: `job_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    estimateId,
    generationId,
    prompt: record.prompt,
    modelId: record.modelId,
    totalCredits: record.totalCredits,
    submittedParams: cliSubmitParams,
    status: 'submitted',
    resultUrls: [],
    staging: null,
    createdAt: Date.now(),
    recovered: false,
  };
  jobs.set(job.jobId, job);
  jobs.set(generationId, job);
  await persistJob(job, stagingRoot);

  return {
    ok: true,
    jobId: job.jobId,
    generationId,
    estimateId,
    totalCredits: record.totalCredits,
    status: 'submitted',
    submittedParams: cliSubmitParams,
    unsupportedForCliSubmit: UNSUPPORTED_GENERATE_CLI_PARAMS,
    message: 'Generation submitted. Poll getJobStatus / waitForJob. No retries will be issued.',
  };
}

/**
 * Attach an existing provider generation id without spending.
 * Used after restart / ambiguous failures when a charge may already exist.
 */
export async function recoverExistingGeneration({
  generationId,
  estimateId = null,
  prompt = null,
  modelId = null,
  stagingRoot = defaultStagingRoot(),
} = {}) {
  if (typeof generationId !== 'string' || !generationId.trim()) {
    throw new OpenArtCliError('INVALID_CREATION_ID', 'generationId is required for recovery');
  }
  const existing = jobs.get(generationId);
  if (existing) {
    return { ok: true, job: publicJob(existing), recovered: false, spent: false };
  }

  // Poll provider only — never call generate.
  const creation = await getCreation(generationId);
  const job = {
    jobId: `job_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    estimateId,
    generationId,
    prompt,
    modelId,
    totalCredits: null,
    submittedParams: null,
    status: 'submitted',
    resultUrls: [],
    staging: null,
    createdAt: Date.now(),
    recovered: true,
  };
  applyCreationToJob(job, creation);
  jobs.set(job.jobId, job);
  jobs.set(generationId, job);
  await persistJob(job, stagingRoot);

  if (estimateId && estimates.has(estimateId)) {
    const record = estimates.get(estimateId);
    record.spent = true;
    record.reservation = 'confirmed';
    record.generationId = generationId;
  }

  return {
    ok: true,
    job: publicJob(job),
    recovered: true,
    spent: false,
    message: 'Recovered existing provider job without submitting a new paid generation.',
  };
}

/**
 * Reload persisted jobs from staging after a process restart.
 * Never initiates paid generation.
 */
export async function recoverJobsFromDisk({ stagingRoot = defaultStagingRoot() } = {}) {
  const dir = path.join(stagingRoot, 'jobs');
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: true, loaded: 0, jobs: [] };
    throw err;
  }

  let loaded = 0;
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      if (!raw?.jobId || !raw?.generationId) continue;
      if (jobs.has(raw.jobId) || jobs.has(raw.generationId)) continue;
      const job = {
        ...raw,
        recovered: true,
        resultUrls: Array.isArray(raw.resultUrls) ? raw.resultUrls : [],
      };
      jobs.set(job.jobId, job);
      jobs.set(job.generationId, job);
      loaded += 1;
      out.push(publicJob(job));
    } catch {
      // skip corrupt job files
    }
  }
  return { ok: true, loaded, jobs: out };
}

export async function getJobStatus({ jobId = null, generationId = null } = {}) {
  const job = resolveJob(jobId, generationId);
  const creation = await getCreation(job.generationId);
  applyCreationToJob(job, creation);
  return { ok: true, job: publicJob(job), creation };
}

export async function waitForJob({
  jobId = null,
  generationId = null,
  timeout = '5m',
} = {}) {
  const job = resolveJob(jobId, generationId);
  const creation = await waitCreation(job.generationId, { timeout });
  applyCreationToJob(job, creation);
  if (job.status === 'failed') {
    throw new OpenArtCliError('GENERATION_FAILED', job.error || 'Generation failed', { job, creation });
  }
  return { ok: true, job: publicJob(job), creation };
}

/**
 * Download first result URL into staging. Does not import into the asset registry.
 */
export async function downloadJobToStaging({
  jobId = null,
  generationId = null,
  stagingRoot = defaultStagingRoot(),
} = {}) {
  const job = resolveJob(jobId, generationId);
  if (!job.resultUrls?.length) {
    const creation = await getCreation(job.generationId);
    applyCreationToJob(job, creation);
  }
  if (!job.resultUrls?.length) {
    throw new OpenArtCliError('NO_RESULT_YET', 'Generation has no result URLs yet', { job });
  }

  const url = job.resultUrls[0];
  const stagingId = `stg_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const ext = extFromUrl(url) || '.png';
  const fileName = `${stagingId}${ext}`;
  const dest = path.join(stagingRoot, fileName);
  const downloaded = await downloadUrlToFile(url, dest);

  const meta = {
    stagingId,
    jobId: job.jobId,
    generationId: job.generationId,
    prompt: job.prompt,
    modelId: job.modelId,
    sourceUrl: url,
    fileName,
    relativePath: fileName,
    absolutePath: dest,
    bytes: downloaded.bytes,
    createdAt: Date.now(),
  };
  await fs.mkdir(stagingRoot, { recursive: true });
  await fs.writeFile(
    path.join(stagingRoot, `${stagingId}.json`),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf8',
  );
  job.staging = meta;
  await persistJob(job, stagingRoot);
  return { ok: true, staging: meta, job: publicJob(job) };
}

export async function readStagingFile(stagingId, { stagingRoot = defaultStagingRoot() } = {}) {
  if (typeof stagingId !== 'string' || !/^stg_[a-f0-9]{12}$/i.test(stagingId)) {
    throw new OpenArtCliError('INVALID_STAGING_ID', `Invalid stagingId: ${stagingId}`);
  }
  const metaPath = path.join(stagingRoot, `${stagingId}.json`);
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  const abs = path.resolve(stagingRoot, path.basename(meta.fileName || `${stagingId}.png`));
  if (!abs.startsWith(path.resolve(stagingRoot))) {
    throw new OpenArtCliError('PATH_TRAVERSAL', 'Staging path rejected');
  }
  const buffer = await fs.readFile(abs);
  return { meta, buffer, absolutePath: abs };
}

async function persistJob(job, stagingRoot) {
  const dir = path.join(stagingRoot, 'jobs');
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${job.jobId}.json`);
  const tmp = `${dest}.${process.pid}.tmp`;
  const payload = {
    jobId: job.jobId,
    estimateId: job.estimateId,
    generationId: job.generationId,
    prompt: job.prompt,
    modelId: job.modelId,
    totalCredits: job.totalCredits,
    submittedParams: job.submittedParams || null,
    status: job.status,
    resultUrls: job.resultUrls || [],
    staging: job.staging || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt || null,
    recovered: Boolean(job.recovered),
    error: job.error || null,
  };
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, dest);
}

function resolveJob(jobId, generationId) {
  const job = (jobId && jobs.get(jobId)) || (generationId && jobs.get(generationId));
  if (!job) {
    throw new OpenArtCliError('JOB_NOT_FOUND', `Unknown job: ${jobId || generationId}`);
  }
  return job;
}

function applyCreationToJob(job, creation) {
  const status = normalizeStatus(creation);
  job.status = status;
  job.resultUrls = extractResultUrls(creation);
  job.error = creation?.error || creation?.message || null;
  job.creationRaw = creation;
  job.updatedAt = Date.now();
  if (status === 'failed') {
    job.error = job.error || 'Generation failed';
  }
}

function normalizeStatus(creation) {
  const raw = String(
    creation?.history?.status
    || creation?.status
    || creation?.state
    || '',
  ).toLowerCase();
  if (!raw) {
    if (extractResultUrls(creation).length) return 'completed';
    return 'unknown';
  }
  if (['completed', 'complete', 'success', 'succeeded', 'done', 'finished'].includes(raw)) {
    return 'completed';
  }
  if (['failed', 'error', 'cancelled', 'canceled'].includes(raw)) return 'failed';
  if (['pending', 'queued', 'running', 'processing', 'submitted', 'in_progress'].includes(raw)) {
    return 'running';
  }
  return raw;
}

function extractGenerationId(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;
  return result.id
    || result.generationId
    || result.historyId
    || result.creationId
    || result.history?.id
    || result.data?.id
    || null;
}

function extractResultUrls(creation) {
  if (!creation) return [];
  const urls = [];
  const push = (u) => {
    if (typeof u === 'string' && /^https:\/\//i.test(u)) urls.push(u);
  };
  push(creation.url);
  push(creation.resultUrl);
  if (Array.isArray(creation.urls)) creation.urls.forEach(push);
  if (Array.isArray(creation.resources)) {
    for (const r of creation.resources) {
      push(r?.url);
      push(r?.imageUrl);
    }
  }
  if (Array.isArray(creation.results)) {
    for (const r of creation.results) {
      push(r?.url);
      push(r?.imageUrl);
    }
  }
  if (Array.isArray(creation.data)) {
    for (const r of creation.data) {
      push(r?.url);
      push(r?.imageUrl);
    }
  }
  if (creation.output?.url) push(creation.output.url);
  if (Array.isArray(creation.output?.urls)) creation.output.urls.forEach(push);
  return [...new Set(urls)];
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const ext = path.extname(p).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return ext;
  } catch {
    // ignore
  }
  return '.png';
}

function publicJob(job) {
  return {
    jobId: job.jobId,
    estimateId: job.estimateId,
    generationId: job.generationId,
    prompt: job.prompt,
    modelId: job.modelId,
    totalCredits: job.totalCredits,
    submittedParams: job.submittedParams || null,
    status: job.status,
    resultUrls: job.resultUrls,
    staging: job.staging,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt || null,
    recovered: Boolean(job.recovered),
  };
}

/** Test helper: seed an estimate without calling the CLI. */
export function __testSeedEstimate(record) {
  estimates.set(record.estimateId, {
    reservation: null,
    spent: false,
    approved: false,
    generationId: null,
    imagePaths: [],
    ...record,
  });
  return estimates.get(record.estimateId);
}

export function __testGetEstimate(estimateId) {
  return estimates.get(estimateId) || null;
}

export function __testGetJob(id) {
  return jobs.get(id) || null;
}
