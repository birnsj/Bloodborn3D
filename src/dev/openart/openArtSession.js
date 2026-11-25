/**
 * Phase 2H.1A — OpenArt session: estimate → explicit approve → one-shot generate.
 *
 * In-memory approval records bind a cost quote to exact generate args. Spending
 * credits requires `confirmSpend: true` against a live estimate. No automatic
 * retries. Staging files land under `.openart-staging/` (gitignored).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  OpenArtCliError,
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
} = {}) {
  const cost = await estimateCost({ modelId, mode, aspectRatio, resolution });
  const item = Array.isArray(cost?.items)
    ? cost.items.find((i) => i.model === modelId && i.mode === mode) || cost.items[0]
    : null;
  const dryRun = await dryRunGenerateImage({ prompt, modelId });

  const estimateId = `est_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const record = {
    estimateId,
    createdAt: Date.now(),
    prompt,
    modelId,
    mode,
    aspectRatio,
    resolution,
    totalCredits: item?.totalCredits ?? null,
    unitCredits: item?.unitCredits ?? null,
    costConfig: item?.config ?? null,
    costRaw: cost,
    dryRun,
    approved: false,
    spent: false,
    generationId: null,
  };
  estimates.set(estimateId, record);

  return {
    ok: true,
    estimateId,
    prompt,
    modelId,
    mode,
    totalCredits: record.totalCredits,
    unitCredits: record.unitCredits,
    costConfig: record.costConfig,
    dryRun,
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
  if (record.spent) {
    throw new OpenArtCliError(
      'ALREADY_SPENT',
      `Estimate ${estimateId} already submitted as generation ${record.generationId}`,
    );
  }

  record.approved = true;
  let result;
  try {
    result = await _submit({
      prompt: record.prompt,
      modelId: record.modelId,
    });
  } catch (err) {
    // Mark spent=false still, but do NOT auto-retry. Record the failure.
    record.lastError = { code: err.code, message: err.message, at: Date.now() };
    throw err;
  }

  const generationId = extractGenerationId(result);
  if (!generationId) {
    record.lastError = { code: 'NO_GENERATION_ID', message: 'CLI returned no generation id', at: Date.now(), raw: result };
    throw new OpenArtCliError('NO_GENERATION_ID', 'OpenArt async generate returned no id', { result });
  }

  // Only mark spent after a successful submit with an id (one charge).
  record.spent = true;
  record.generationId = generationId;
  record.submittedAt = Date.now();
  record.submitRaw = result;

  const job = {
    jobId: `job_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    estimateId,
    generationId,
    prompt: record.prompt,
    modelId: record.modelId,
    totalCredits: record.totalCredits,
    status: 'submitted',
    resultUrls: [],
    staging: null,
    createdAt: Date.now(),
  };
  jobs.set(job.jobId, job);
  jobs.set(generationId, job);

  return {
    ok: true,
    jobId: job.jobId,
    generationId,
    estimateId,
    totalCredits: record.totalCredits,
    status: 'submitted',
    message: 'Generation submitted. Poll getJobStatus / waitForJob. No retries will be issued.',
  };
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
    // Refresh once.
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
  // Official CLI shape: { history: { id, status }, resources: [...] }
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
    status: job.status,
    resultUrls: job.resultUrls,
    staging: job.staging,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt || null,
  };
}

/** Test helper: seed an estimate without calling the CLI. */
export function __testSeedEstimate(record) {
  estimates.set(record.estimateId, record);
  return record;
}

export function __testGetEstimate(estimateId) {
  return estimates.get(estimateId) || null;
}
