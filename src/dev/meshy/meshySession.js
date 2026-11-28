/**
 * Meshy Image-to-3D session (CLI transport): estimate → explicit approve →
 * one-shot async create → poll → CLI download into .meshy-staging/.
 *
 * - Paid create requires confirmSpend:true against a live estimate.
 * - Exact CLI argv is bound to the estimate and reused on submit.
 * - No automatic retries of paid submissions.
 * - Exit code 10 / ambiguous create blocks resubmit until reconciled.
 * - Jobs persisted under .meshy-staging/ for editor-restart recovery.
 * - Credentials stay in the Meshy CLI store — never read here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  MeshyCliError,
  buildImageTo3dCreateArgv,
  buildRiggingCreateArgv,
  defaultStagingRoot,
  detectMeshyCli,
  downloadImageTo3dTask,
  downloadRiggingTask,
  dryRunImageTo3d,
  extractBalance,
  extractTaskId,
  extractTaskStatus,
  getImageTo3dTask,
  getMeshyAuthStatus,
  getMeshyBalance,
  getRiggingTask,
  listImageTo3dTasks,
  logoutMeshy,
  startMeshyLogin,
  submitImageTo3dAsync,
  submitRiggingAsync,
  validateGlbBuffer,
} from './meshyCli.js';
import {
  estimateImageTo3dCredits,
  validateImageTo3dSettings,
} from './meshyModels.js';
import { estimateRiggingCredits } from './meshyRigging.js';

/** @type {Map<string, object>} */
const estimates = new Map();
/** @type {Map<string, object>} */
const jobs = new Map();

const PREFLIGHT_FAILURE_CODES = new Set([
  'CLI_MISSING',
  'NODE_TOO_OLD',
  'CLI_FAILED',
  'AUTH_FAILED',
  'INVALID_ARGV',
  'INVALID_MODEL',
  'INVALID_PBR',
  'INVALID_TEXTURE_MODEL',
  'INVALID_RESOLUTION',
  'INVALID_TOPOLOGY',
  'INVALID_POLYCOUNT',
  'INVALID_GEOMETRY_RESOLUTION',
  'MODEL_TYPE_MISMATCH',
  'DEPRECATED_MODEL',
  'INVALID_IMAGE',
  'INVALID_OPERATION_ID',
  'APPROVAL_REQUIRED',
  'ESTIMATE_NOT_FOUND',
  'ESTIMATE_MISMATCH',
  'ALREADY_SPENT',
  'SPEND_RESERVED',
  'SPEND_AMBIGUOUS',
  'IMAGE_REQUIRED',
  'BAD_REQUEST',
]);

export function clearMeshySessionState() {
  estimates.clear();
  jobs.clear();
}

function jobsDir(stagingRoot) {
  return path.join(stagingRoot, 'jobs');
}

async function writeJobSidecar(stagingRoot, job) {
  const dir = jobsDir(stagingRoot);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.jobId}.json`);
  await fs.writeFile(file, JSON.stringify(job, null, 2), 'utf8');
}

async function readJobSidecar(stagingRoot, jobId) {
  try {
    const raw = await fs.readFile(path.join(jobsDir(stagingRoot), `${jobId}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveImageAbsolute(stagingRoot, imageStagingPath, imageDataUri) {
  if (imageStagingPath) {
    return path.isAbsolute(imageStagingPath)
      ? imageStagingPath
      : path.join(stagingRoot, imageStagingPath);
  }
  if (imageDataUri) {
    return null;
  }
  return null;
}

/**
 * Connection status: CLI install + auth + balance. Never reads credential files.
 */
export async function getMeshyStatus(projectRoot) {
  void projectRoot;
  const cli = await detectMeshyCli();
  if (!cli.ok) {
    return {
      ok: false,
      configured: false,
      authenticated: false,
      cli,
      account: null,
      balance: null,
      code: cli.code || 'CLI_MISSING',
      error: cli.error,
      installHint: cli.installHint || 'npm install -g meshy-cli',
    };
  }

  let authEnvelope;
  try {
    authEnvelope = await getMeshyAuthStatus({ executable: cli.executable });
  } catch (err) {
    return {
      ok: false,
      configured: true,
      authenticated: false,
      cli,
      account: null,
      balance: null,
      code: err.code || 'AUTH_FAILED',
      error: err.message || String(err),
      installHint: null,
    };
  }

  const authResult = authEnvelope?.result || {};
  const authenticated = Boolean(authResult.authenticated);
  const account = authenticated
    ? {
      profile: authResult.active_profile || authResult.profile || 'default',
      profiles: authResult.profiles || [],
      credentialsFile: authResult.credentials_file || null,
    }
    : null;

  if (!authenticated) {
    return {
      ok: false,
      configured: true,
      authenticated: false,
      cli,
      account: null,
      balance: null,
      code: 'AUTH_FAILED',
      error: authResult.hint || 'Not signed in — use Log in to open browser sign-in',
      installHint: null,
    };
  }

  // auth status often already includes balance after verify — prefer it to
  // avoid an extra CLI spawn (and a Windows teardown crash on balance).
  let balance = extractBalance({ result: authResult.balance })
    || (authResult.balance && typeof authResult.balance === 'object'
      ? {
        balance: Number(authResult.balance.balance) || 0,
        monthlyCredits: Number(authResult.balance.monthly_credits) || 0,
        permanentCredits: Number(authResult.balance.permanent_credits) || 0,
        monthlyResetsAt: authResult.balance.monthly_resets_at ?? null,
      }
      : null);

  if (!balance) {
    try {
      const balEnvelope = await getMeshyBalance({ executable: cli.executable });
      balance = extractBalance(balEnvelope);
    } catch {
      balance = null;
    }
  }

  return {
    ok: true,
    configured: true,
    authenticated: true,
    cli,
    account,
    balance,
    code: null,
    error: null,
    installHint: null,
  };
}

export async function beginMeshyLogin({ device = false } = {}) {
  const cli = await detectMeshyCli();
  if (!cli.ok) {
    throw new MeshyCliError(cli.code || 'CLI_MISSING', cli.error || 'Meshy CLI not found');
  }
  return startMeshyLogin({ executable: cli.executable, device });
}

export async function beginMeshyLogout({ all = false } = {}) {
  return logoutMeshy({ all });
}

/**
 * Quote credits for exact settings + bind staged image + CLI argv + dry-run.
 * Does not call paid create.
 */
export async function createMeshyEstimate({
  settings = {},
  imageDataUri = null,
  imageStagingPath = null,
  provenance = null,
  projectRoot,
  stagingRoot = null,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error || 'Meshy CLI missing');
  }
  if (!status.authenticated) {
    throw new MeshyCliError(status.code || 'AUTH_FAILED', status.error || 'Meshy not authenticated');
  }

  const quote = estimateImageTo3dCredits(settings);
  if (!quote.ok) {
    throw new MeshyCliError(quote.code || 'INVALID_MODEL', quote.error || 'Invalid settings');
  }

  let imagePath = resolveImageAbsolute(staging, imageStagingPath, imageDataUri);
  if (!imagePath && imageDataUri) {
    // Persist data-URI to staging so the CLI receives a local path.
    const saved = await materializeDataUri(staging, imageDataUri);
    imagePath = saved.absolutePath;
    imageStagingPath = saved.relativePath;
  }
  if (!imagePath) {
    throw new MeshyCliError('IMAGE_REQUIRED', 'A reference image is required for Image-to-3D');
  }
  try {
    await fs.access(imagePath);
  } catch {
    throw new MeshyCliError('IMAGE_REQUIRED', `Reference image not found: ${imagePath}`);
  }

  const operationId = `op_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const cliArgv = buildImageTo3dCreateArgv({
    settings: quote.settings,
    imagePath,
    async: true,
    operationId,
  });

  let cliDryRun = null;
  try {
    cliDryRun = await dryRunImageTo3d(imagePath, { executable: status.cli.executable });
  } catch (err) {
    // Dry-run is advisory — local documented pricing remains authoritative for approval.
    cliDryRun = {
      ok: false,
      error: err.message,
      code: err.code || 'DRY_RUN_FAILED',
    };
  }

  const estimateId = `mest_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const record = {
    estimateId,
    createdAt: Date.now(),
    settings: quote.settings,
    credits: quote.credits,
    breakdown: quote.breakdown,
    imageDataUri: null,
    imageStagingPath: imageStagingPath || null,
    imagePath,
    provenance: provenance || null,
    cliArgv,
    operationId,
    cliDryRun,
    spent: false,
    reserved: false,
    ambiguous: false,
    jobId: null,
  };
  estimates.set(estimateId, record);

  const dryCredits = cliDryRun?.result?.estimated_credits ?? null;

  return {
    ok: true,
    estimateId,
    credits: quote.credits,
    breakdown: quote.breakdown,
    settings: quote.settings,
    balance: status.balance,
    cliArgv,
    cliSubmitParams: CLI_SUBMIT_PARAMS_FROM_ARGV(cliArgv),
    cliDryRun: cliDryRun?.result || cliDryRun,
    cliDryRunCredits: dryCredits,
    note: dryCredits != null && dryCredits !== quote.credits
      ? `CLI make --dry-run quotes ${dryCredits} for the default textured path; approved Game Prop request is ${quote.credits} credits.`
      : null,
  };
}

function CLI_SUBMIT_PARAMS_FROM_ARGV(argv) {
  const params = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      params[key] = next;
      i += 1;
    } else {
      params[key] = true;
    }
  }
  return params;
}

async function materializeDataUri(stagingRoot, dataUri) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(String(dataUri || ''));
  if (!m) {
    throw new MeshyCliError('INVALID_IMAGE', 'Unsupported image data URI');
  }
  const mime = m[1].toLowerCase();
  const ext = mime.includes('jpeg') || mime.includes('jpg')
    ? '.jpg'
    : mime.includes('webp')
      ? '.webp'
      : '.png';
  const buf = Buffer.from(m[2], 'base64');
  return saveReferenceImageToStaging({
    stagingRoot,
    buffer: buf,
    filename: `reference${ext}`,
  });
}

/**
 * Approve a live estimate and submit exactly one Image-to-3D task via CLI.
 * Requires confirmSpend === true. Never auto-retries.
 */
export async function approveAndGenerateMeshy({
  estimateId,
  confirmSpend = false,
  projectRoot,
  stagingRoot = null,
  _submit = submitImageTo3dAsync,
} = {}) {
  if (confirmSpend !== true) {
    throw new MeshyCliError('APPROVAL_REQUIRED', 'Paid Meshy generation requires confirmSpend: true');
  }
  const record = estimates.get(estimateId);
  if (!record) {
    throw new MeshyCliError('ESTIMATE_NOT_FOUND', 'Estimate not found or expired — re-estimate first');
  }
  if (record.ambiguous) {
    throw new MeshyCliError(
      'SPEND_AMBIGUOUS',
      'A previous submit may have charged credits — recover the task instead of resubmitting',
    );
  }
  if (record.spent || record.jobId) {
    throw new MeshyCliError('ALREADY_SPENT', 'This estimate was already used for a paid submission');
  }
  if (record.reserved) {
    throw new MeshyCliError('SPEND_RESERVED', 'A submission is already in progress for this estimate');
  }

  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error);
  }
  if (!status.authenticated) {
    throw new MeshyCliError(status.code || 'AUTH_FAILED', status.error);
  }

  const imagePath = record.imagePath
    || resolveImageAbsolute(staging, record.imageStagingPath, null);
  if (!imagePath) {
    throw new MeshyCliError('IMAGE_REQUIRED', 'Estimate has no reference image');
  }

  // Rebuild argv and require exact match with the estimate binding.
  const expectedArgv = buildImageTo3dCreateArgv({
    settings: record.settings,
    imagePath,
    async: true,
    operationId: record.operationId,
  });
  if (JSON.stringify(expectedArgv) !== JSON.stringify(record.cliArgv)) {
    throw new MeshyCliError(
      'ESTIMATE_MISMATCH',
      'Settings or reference changed since estimate — re-estimate before generating',
    );
  }

  record.reserved = true;

  let taskId = null;
  let createEnvelope = null;
  try {
    createEnvelope = await _submit({
      settings: record.settings,
      imagePath,
      operationId: record.operationId,
    }, { executable: status.cli.executable });
    taskId = extractTaskId(createEnvelope);
    if (!taskId) {
      throw new MeshyCliError(
        'SPEND_AMBIGUOUS',
        'Create returned no task id — reconcile with meshy image-to-3d list before retrying',
        { envelope: createEnvelope },
      );
    }
  } catch (err) {
    record.reserved = false;
    if (err instanceof MeshyCliError && PREFLIGHT_FAILURE_CODES.has(err.code) && err.code !== 'SPEND_AMBIGUOUS') {
      throw err;
    }
    // Ambiguous: request may have reached Meshy. Block resubmit.
    record.ambiguous = true;
    await writeJobSidecar(staging, {
      jobId: `ambiguous_${record.estimateId}`,
      estimateId: record.estimateId,
      phase: 'ambiguous',
      settings: record.settings,
      credits: record.credits,
      provenance: record.provenance,
      cliArgv: record.cliArgv,
      operationId: record.operationId,
      error: err.message,
      code: err.code || 'SPEND_AMBIGUOUS',
      updatedAt: Date.now(),
    });
    throw new MeshyCliError(
      'SPEND_AMBIGUOUS',
      `Submit failed after reservation — do not retry: ${err.message}. `
      + 'Run meshy image-to-3d list / recover before another paid submission.',
      { exitCode: err.exitCode, envelope: err.envelope },
    );
  }

  record.spent = true;
  record.reserved = false;
  const jobId = `msj_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`;
  record.jobId = jobId;

  const job = {
    jobId,
    taskId: String(taskId),
    estimateId: record.estimateId,
    resource: 'image-to-3d',
    phase: 'pending',
    status: 'PENDING',
    progress: 0,
    settings: record.settings,
    creditsEstimated: record.credits,
    creditsConsumed: null,
    provenance: record.provenance,
    imageStagingPath: record.imageStagingPath,
    cliArgv: record.cliArgv,
    operationId: record.operationId,
    modelUrls: null,
    textureUrls: null,
    thumbnailUrl: null,
    stagingGlbPath: null,
    stagingThumbPath: null,
    importedAssetId: null,
    error: null,
    code: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(jobId, job);
  await writeJobSidecar(staging, job);

  return {
    ok: true,
    jobId,
    taskId: String(taskId),
    estimateId: record.estimateId,
    credits: record.credits,
    settings: record.settings,
    cliArgv: record.cliArgv,
    resource: 'image-to-3d',
  };
}

export async function pollMeshyJob({
  jobId,
  projectRoot,
  stagingRoot = null,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  let job = jobs.get(jobId) || await readJobSidecar(staging, jobId);
  if (!job) {
    throw new MeshyCliError('JOB_NOT_FOUND', `Unknown Meshy job “${jobId}”`);
  }
  jobs.set(jobId, job);

  if (job.phase === 'succeeded' || job.phase === 'failed' || job.phase === 'discarded') {
    return { ok: true, job, retryAfterSec: 0 };
  }

  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error);
  }

  const envelope = job.resource === 'rigging'
    ? await getRiggingTask(job.taskId, { executable: status.cli.executable })
    : await getImageTo3dTask(job.taskId, { executable: status.cli.executable });
  // CLI ok means the get worked; task may still be FAILED.
  const taskInfo = extractTaskStatus(envelope);
  if (!taskInfo?.status) {
    // WAIT_TIMEOUT / network on get should not mark the remote job failed.
    if (envelope?.ok === false) {
      throw new MeshyCliError(
        'NETWORK',
        envelope.error?.message || 'Failed to query Meshy task',
        { envelope },
      );
    }
    return { ok: true, job, retryAfterSec: 5 };
  }

  job.status = taskInfo.status;
  job.progress = taskInfo.progress;
  job.updatedAt = Date.now();
  job.modelUrls = taskInfo.modelUrls;
  job.textureUrls = taskInfo.textureUrls;
  job.thumbnailUrl = taskInfo.thumbnailUrl;
  if (taskInfo.consumedCredits != null) {
    job.creditsConsumed = taskInfo.consumedCredits;
  }

  if (taskInfo.status === 'SUCCEEDED') {
    job.phase = 'succeeded';
    try {
      await downloadJobGlb(job, staging, status.cli.executable);
    } catch (err) {
      job.phase = 'failed';
      job.error = err.message;
      job.code = err.code || 'DOWNLOAD_FAILED';
    }
  } else if (taskInfo.status === 'FAILED' || taskInfo.status === 'CANCELED') {
    job.phase = 'failed';
    job.error = taskInfo.taskError?.message || taskInfo.taskError || `Task ${taskInfo.status}`;
    job.code = 'TASK_FAILED';
  } else if (taskInfo.status === 'IN_PROGRESS') {
    job.phase = 'running';
  } else {
    job.phase = 'pending';
  }

  await writeJobSidecar(staging, job);
  return { ok: true, job, retryAfterSec: 5 };
}

async function downloadJobGlb(job, staging, executable) {
  const outDir = path.join(staging, 'models', job.taskId);
  await fs.mkdir(outDir, { recursive: true });
  if (job.resource === 'rigging') {
    // Rigged GLB only in v0 — bundled walk/run stay on Meshy until Animation workspace.
    await downloadRiggingTask(job.taskId, outDir, { executable, allAssets: false });
  } else {
    // --all-assets pulls separate PBR maps when present (base/normal/metallic/roughness).
    // Free for already-SUCCEEDED tasks — no generation spend.
    await downloadImageTo3dTask(job.taskId, outDir, {
      executable,
      allAssets: Boolean(job.settings?.enable_pbr || job.settings?.should_texture !== false),
    });
  }

  const glbPath = await findDownloadedGlb(outDir);
  if (!glbPath) {
    throw new MeshyCliError('NO_GLB', 'CLI download finished but no GLB was found in the output folder');
  }
  const buf = await fs.readFile(glbPath);
  const valid = validateGlbBuffer(buf);
  if (!valid.ok) {
    throw new MeshyCliError('INVALID_GLB', valid.error);
  }
  // Normalize to models/<taskId>.glb for stable staging paths.
  const dest = path.join(staging, 'models', `${job.taskId}.glb`);
  if (path.resolve(glbPath) !== path.resolve(dest)) {
    await fs.copyFile(glbPath, dest);
  }
  job.stagingGlbPath = path.relative(staging, dest).replace(/\\/g, '/');
  job.glbBytes = valid.bytes;

  const thumb = await findDownloadedThumb(outDir);
  if (thumb) {
    const thumbDest = path.join(staging, 'thumbs', `${job.taskId}.png`);
    await fs.mkdir(path.dirname(thumbDest), { recursive: true });
    await fs.copyFile(thumb, thumbDest);
    job.stagingThumbPath = path.relative(staging, thumbDest).replace(/\\/g, '/');
  }
}

async function findDownloadedGlb(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (ent.isFile() && ent.name.toLowerCase().endsWith('.glb')) {
      return path.join(dir, ent.name);
    }
  }
  // Nested folders from -o dir layouts
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const nested = await findDownloadedGlb(path.join(dir, ent.name));
    if (nested) return nested;
  }
  return null;
}

async function findDownloadedThumb(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (ent.isFile() && /thumb/i.test(ent.name) && /\.(png|jpe?g|webp)$/i.test(ent.name)) {
      return path.join(dir, ent.name);
    }
  }
  for (const ent of entries) {
    if (ent.isFile() && /\.png$/i.test(ent.name) && !/\.glb$/i.test(ent.name)) {
      return path.join(dir, ent.name);
    }
  }
  return null;
}

export function getMeshyJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * Re-download a SUCCEEDED task with --all-assets so separate PBR map files
 * land in staging. Does not create a new generation (no credit spend).
 */
export async function fetchMeshyJobTextureMaps({
  jobId = null,
  taskId = null,
  projectRoot,
  stagingRoot = null,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error || 'Meshy CLI missing');
  }

  let job = jobId ? (jobs.get(jobId) || await readJobSidecar(staging, jobId)) : null;
  const id = taskId || job?.taskId;
  if (!id) {
    throw new MeshyCliError('TASK_REQUIRED', 'taskId or jobId with a Meshy task is required');
  }

  const outDir = path.join(staging, 'models', id, 'all-assets');
  await fs.mkdir(outDir, { recursive: true });
  await downloadImageTo3dTask(id, outDir, {
    executable: status.cli.executable,
    allAssets: true,
  });

  const { listStagingMeshyMaps } = await import('./meshyPbrMaps.js');
  const listed = await listStagingMeshyMaps(staging, id);
  if (job) {
    job.textureMaps = listed.maps;
    job.textureMapsFetchedAt = Date.now();
    await writeJobSidecar(staging, job);
  }
  return { ok: true, taskId: id, jobId: job?.jobId || null, ...listed };
}

/**
 * Resolve a local staging map file for import (absolute path + slot).
 */
export async function resolveMeshyMapFile({
  taskId,
  mapId,
  projectRoot,
  stagingRoot = null,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const { listStagingMeshyMaps } = await import('./meshyPbrMaps.js');
  let listed = await listStagingMeshyMaps(staging, taskId);
  if (!listed.maps.some((m) => m.id === mapId && m.localPath)) {
    await fetchMeshyJobTextureMaps({
      taskId,
      projectRoot,
      stagingRoot: staging,
    });
    listed = await listStagingMeshyMaps(staging, taskId);
  }
  const map = listed.maps.find((m) => m.id === mapId);
  if (!map?.localPath) {
    throw new MeshyCliError(
      'MAP_NOT_FOUND',
      `No local file for map “${mapId}” — it may be missing from this task (e.g. emission on meshy-7)`,
    );
  }
  return { ok: true, map, listed };
}

export async function recoverMeshyJobsFromDisk({ stagingRoot, projectRoot } = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const dir = jobsDir(staging);
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return { ok: true, recovered: 0, jobs: [] };
  }
  const recovered = [];
  for (const name of files) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      const job = JSON.parse(raw);
      if (job?.jobId) {
        jobs.set(job.jobId, job);
        recovered.push({
          jobId: job.jobId,
          taskId: job.taskId,
          phase: job.phase,
          status: job.status,
        });
      }
    } catch {
      // skip corrupt
    }
  }
  return { ok: true, recovered: recovered.length, jobs: recovered };
}

/**
 * Recover a job after restart. For ambiguous creates, list recent tasks first.
 */
export async function recoverMeshyJob({
  jobId,
  taskId = null,
  projectRoot,
  stagingRoot = null,
  reconcileAmbiguous = false,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  await recoverMeshyJobsFromDisk({ stagingRoot: staging, projectRoot });
  let job = jobId ? (jobs.get(jobId) || await readJobSidecar(staging, jobId)) : null;

  if (!job && reconcileAmbiguous) {
    const listed = await listImageTo3dTasks({ page: 1, pageSize: 10 });
    const items = listed?.result?.tasks
      || listed?.result?.items
      || listed?.result
      || [];
    const list = Array.isArray(items) ? items : [];
    if (taskId) {
      const match = list.find((t) => (t.task_id || t.id) === taskId);
      if (match) {
        taskId = match.task_id || match.id;
      }
    } else if (list[0]) {
      taskId = list[0].task_id || list[0].id || null;
    }
  }

  if (!job && taskId) {
    job = {
      jobId: `msj_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`,
      taskId: String(taskId),
      phase: 'pending',
      status: 'PENDING',
      progress: 0,
      settings: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    jobs.set(job.jobId, job);
    await writeJobSidecar(staging, job);
  }
  if (!job) {
    throw new MeshyCliError('JOB_NOT_FOUND', 'No Meshy job to recover');
  }
  return pollMeshyJob({ jobId: job.jobId, projectRoot, stagingRoot: staging });
}

export async function readMeshyStagingFile(stagingRoot, relativePath) {
  // Separator-aware containment — reject `..` and prefix tricks (C6 API safety).
  let abs;
  try {
    const cleaned = String(relativePath || '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
    if (!cleaned || cleaned.includes('..')) {
      throw new MeshyCliError('PATH_ESCAPE', 'Invalid staging path');
    }
    const root = path.resolve(stagingRoot);
    abs = path.resolve(root, cleaned);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new MeshyCliError('PATH_ESCAPE', 'Invalid staging path');
    }
  } catch (err) {
    if (err instanceof MeshyCliError) throw err;
    throw new MeshyCliError('PATH_ESCAPE', 'Invalid staging path');
  }
  return fs.readFile(abs);
}

export async function saveReferenceImageToStaging({
  stagingRoot,
  buffer,
  filename = 'reference.png',
}) {
  const id = `ref_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const safeName = String(filename || 'reference.png').replace(/[^\w.-]+/g, '_');
  const rel = path.join('refs', `${id}_${safeName}`).replace(/\\/g, '/');
  const abs = path.join(stagingRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return { stagingId: id, relativePath: rel, absolutePath: abs, bytes: buffer.length };
}

/**
 * Create a spend estimate for Meshy Auto-rig (humanoid biped).
 * Binds exact CLI argv for later approve+submit.
 */
export async function createMeshyRigEstimate({
  settings = {},
  projectRoot,
  stagingRoot = null,
} = {}) {
  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error || 'Meshy CLI missing');
  }
  if (!status.authenticated) {
    throw new MeshyCliError(status.code || 'AUTH_FAILED', status.error || 'Meshy not authenticated');
  }

  const quote = estimateRiggingCredits(settings);
  if (!quote.ok) {
    throw new MeshyCliError(quote.code || 'INVALID_MODEL', quote.error || 'Invalid rig settings');
  }

  // Resolve staged GLB to absolute path when using model_url fallback.
  const resolved = { ...quote.settings };
  if (!resolved.input_task_id && resolved.model_url) {
    const abs = path.isAbsolute(resolved.model_url)
      ? resolved.model_url
      : path.join(staging, resolved.model_url);
    try {
      await fs.access(abs);
    } catch {
      throw new MeshyCliError('SOURCE_REQUIRED', `Staged GLB not found: ${abs}`);
    }
    resolved.model_url = abs;
  }

  const operationId = `op_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const cliArgv = buildRiggingCreateArgv({
    settings: resolved,
    async: true,
    operationId,
  });

  const estimateId = `mrig_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const record = {
    estimateId,
    resource: 'rigging',
    createdAt: Date.now(),
    settings: resolved,
    credits: quote.credits,
    breakdown: quote.breakdown,
    cliArgv,
    operationId,
    spent: false,
    reserved: false,
    ambiguous: false,
    jobId: null,
  };
  estimates.set(estimateId, record);

  return {
    ok: true,
    estimateId,
    credits: quote.credits,
    breakdown: quote.breakdown,
    settings: resolved,
    balance: status.balance,
    cliArgv,
    resource: 'rigging',
  };
}

/**
 * Approve a rig estimate and submit exactly one Rigging task.
 * Requires confirmSpend === true. Never auto-retries.
 */
export async function approveAndRigMeshy({
  estimateId,
  confirmSpend = false,
  projectRoot,
  stagingRoot = null,
  _submit = submitRiggingAsync,
} = {}) {
  if (confirmSpend !== true) {
    throw new MeshyCliError('APPROVAL_REQUIRED', 'Paid Meshy Auto-rig requires confirmSpend: true');
  }
  const record = estimates.get(estimateId);
  if (!record || record.resource !== 'rigging') {
    throw new MeshyCliError('ESTIMATE_NOT_FOUND', 'Rig estimate not found or expired — re-estimate first');
  }
  if (record.ambiguous) {
    throw new MeshyCliError(
      'SPEND_AMBIGUOUS',
      'A previous rig submit may have charged credits — recover the task instead of resubmitting',
    );
  }
  if (record.spent || record.jobId) {
    throw new MeshyCliError('ALREADY_SPENT', 'This rig estimate was already used for a paid submission');
  }
  if (record.reserved) {
    throw new MeshyCliError('SPEND_RESERVED', 'A rig submission is already in progress for this estimate');
  }

  const staging = stagingRoot || defaultStagingRoot(projectRoot);
  const status = await getMeshyStatus(projectRoot);
  if (!status.cli?.ok) {
    throw new MeshyCliError(status.code || 'CLI_MISSING', status.error);
  }
  if (!status.authenticated) {
    throw new MeshyCliError(status.code || 'AUTH_FAILED', status.error);
  }

  const expectedArgv = buildRiggingCreateArgv({
    settings: record.settings,
    async: true,
    operationId: record.operationId,
  });
  if (JSON.stringify(expectedArgv) !== JSON.stringify(record.cliArgv)) {
    throw new MeshyCliError(
      'ESTIMATE_MISMATCH',
      'Rig settings changed since estimate — re-estimate before generating',
    );
  }

  record.reserved = true;

  let taskId = null;
  let createEnvelope = null;
  try {
    createEnvelope = await _submit({
      settings: record.settings,
      operationId: record.operationId,
    }, { executable: status.cli.executable });
    taskId = extractTaskId(createEnvelope);
    if (!taskId) {
      throw new MeshyCliError(
        'SPEND_AMBIGUOUS',
        'Rig create returned no task id — reconcile with meshy rigging list before retrying',
        { envelope: createEnvelope },
      );
    }
  } catch (err) {
    record.reserved = false;
    if (err instanceof MeshyCliError && PREFLIGHT_FAILURE_CODES.has(err.code) && err.code !== 'SPEND_AMBIGUOUS') {
      throw err;
    }
    record.ambiguous = true;
    await writeJobSidecar(staging, {
      jobId: `ambiguous_${record.estimateId}`,
      estimateId: record.estimateId,
      resource: 'rigging',
      phase: 'ambiguous',
      settings: record.settings,
      credits: record.credits,
      cliArgv: record.cliArgv,
      operationId: record.operationId,
      error: err.message,
      code: err.code || 'SPEND_AMBIGUOUS',
      updatedAt: Date.now(),
    });
    throw new MeshyCliError(
      'SPEND_AMBIGUOUS',
      `Rig submit failed after reservation — do not retry: ${err.message}. `
      + 'Run meshy rigging list / recover before another paid submission.',
      { exitCode: err.exitCode, envelope: err.envelope },
    );
  }

  record.spent = true;
  record.reserved = false;
  const jobId = `mrg_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24)}`;
  record.jobId = jobId;

  const job = {
    jobId,
    taskId: String(taskId),
    estimateId: record.estimateId,
    resource: 'rigging',
    phase: 'pending',
    status: 'PENDING',
    progress: 0,
    settings: record.settings,
    creditsEstimated: record.credits,
    creditsConsumed: null,
    provenance: {
      kind: 'meshy-rigging',
      inputTaskId: record.settings.input_task_id || null,
    },
    imageStagingPath: null,
    cliArgv: record.cliArgv,
    operationId: record.operationId,
    modelUrls: null,
    textureUrls: null,
    thumbnailUrl: null,
    stagingGlbPath: null,
    stagingThumbPath: null,
    importedAssetId: null,
    error: null,
    code: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(jobId, job);
  await writeJobSidecar(staging, job);

  return {
    ok: true,
    jobId,
    taskId: String(taskId),
    estimateId: record.estimateId,
    credits: record.credits,
    settings: record.settings,
    cliArgv: record.cliArgv,
    resource: 'rigging',
  };
}

export {
  validateImageTo3dSettings,
  estimateImageTo3dCredits,
  estimateRiggingCredits,
  PREFLIGHT_FAILURE_CODES,
  validateGlbBuffer,
  defaultStagingRoot,
};
