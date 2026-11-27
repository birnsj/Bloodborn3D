/**
 * Meshy CLI adapter (Node only) — mirrors OpenArt CLI process management.
 *
 * Invokes the official `meshy` / `meshy-cli` binary with fixed argv arrays
 * (never a shell string). Credentials stay in the CLI's own store
 * (~/.config/meshy); this module never reads, copies, or stores tokens.
 *
 * Paid Image-to-3D create is submitted once via --async. Exit code 10 is
 * treated as ambiguous (reconcile before another paid submit).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODEL_TYPES,
  validateImageTo3dSettings,
} from './meshyModels.js';

const WINDOWS = process.platform === 'win32';
const MIN_NODE = { major: 22, minor: 12 };

/** CLI exit codes from https://docs.meshy.ai/en/api/cli */
export const MESHY_CLI_EXIT = Object.freeze({
  SUCCESS: 0,
  TASK_OR_ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  BAD_REQUEST: 4,
  NOT_FOUND: 5,
  RATE_LIMITED: 6,
  NETWORK: 7,
  WAIT_TIMEOUT: 8,
  INSUFFICIENT_CREDITS: 9,
  AMBIGUOUS_CREATE: 10,
  INTERRUPTED: 130,
});

export class MeshyCliError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = 'MeshyCliError';
    this.code = code;
    this.details = details;
    this.exitCode = details?.exitCode ?? null;
    this.envelope = details?.envelope ?? null;
  }
}

/** Alias retained for session / plugin error typing after REST removal. */
export const MeshyApiError = MeshyCliError;

export function defaultStagingRoot(
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
) {
  return path.join(projectRoot, '.meshy-staging');
}

/** Minimal GLB magic check (glTF binary). */
export function validateGlbBuffer(buf) {
  if (!buf || buf.length < 12) {
    return { ok: false, error: 'File too small to be a GLB' };
  }
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== 'glTF') {
    return { ok: false, error: `Invalid GLB magic “${magic}” (expected glTF)` };
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2) {
    return { ok: false, error: `Unsupported GLB version ${version}` };
  }
  const length = buf.readUInt32LE(8);
  if (length > buf.length) {
    return { ok: false, error: 'GLB length header exceeds file size' };
  }
  return { ok: true, version, length, bytes: buf.length };
}

/**
 * Resolve the meshy executable. Prefers PATH (`meshy`, then `meshy-cli`).
 * @returns {Promise<{ ok: boolean, executable: string|null, version: string|null, nodeOk: boolean, doctor: object|null, error?: string, code?: string }>}
 */
export async function detectMeshyCli({ runner = runMeshy } = {}) {
  const nodeOk = checkNodeVersion(process.versions?.node);
  const candidates = await listExecutableCandidates();
  if (!candidates.length) {
    return {
      ok: false,
      executable: null,
      version: null,
      nodeOk,
      doctor: null,
      error: nodeOk
        ? 'Meshy CLI not found. Install with: npm install -g meshy-cli'
        : `Meshy CLI requires Node.js ${MIN_NODE.major}.${MIN_NODE.minor}+ (current ${process.versions?.node || 'unknown'})`,
      code: nodeOk ? 'CLI_MISSING' : 'NODE_TOO_OLD',
      installHint: 'npm install -g meshy-cli',
    };
  }

  let lastErr = null;
  for (const exe of candidates) {
    try {
      const envelope = await runner(['--version'], {
        executable: exe,
        timeoutMs: 8000,
        json: false,
        allowNonZero: true,
      });
      const version = String(envelope?.stdout || '').trim().split(/\r?\n/)[0] || null;
      let doctor = null;
      try {
        doctor = await runner(['doctor'], { executable: exe, timeoutMs: 15000 });
      } catch {
        // doctor is diagnostic only
      }
      return {
        ok: true,
        executable: exe,
        version,
        nodeOk,
        doctor: doctor?.result || doctor || null,
        code: null,
        error: null,
        installHint: null,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  return {
    ok: false,
    executable: candidates[0],
    version: null,
    nodeOk,
    doctor: null,
    error: lastErr?.message || 'Meshy CLI found but failed to run',
    code: lastErr?.code || 'CLI_FAILED',
    installHint: 'npm install -g meshy-cli',
  };
}

async function listExecutableCandidates() {
  const found = [];
  const whichCmd = WINDOWS ? 'where' : 'which';
  for (const name of ['meshy', 'meshy-cli']) {
    try {
      const out = await spawnCapture(whichCmd, [name], { timeoutMs: 5000 });
      for (const line of out.stdout.split(/\r?\n/)) {
        const p = line.trim();
        if (p) found.push(p);
      }
    } catch {
      // fall through
    }
  }

  if (WINDOWS) {
    const roaming = process.env.APPDATA;
    if (roaming) {
      found.push(path.join(roaming, 'npm', 'meshy.cmd'));
      found.push(path.join(roaming, 'npm', 'meshy-cli.cmd'));
      found.push(path.join(roaming, 'npm', 'node_modules', 'meshy-cli', 'dist', 'index.js'));
    }
  } else {
    const home = process.env.HOME || '';
    found.push('/usr/local/bin/meshy', path.join(home, '.local', 'bin', 'meshy'));
  }

  const uniq = [];
  const seen = new Set();
  for (const p of found) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await fs.access(p);
      uniq.push(p);
    } catch {
      // skip
    }
  }
  // Prefer the Node entry over Windows .cmd shims.
  uniq.sort((a, b) => {
    const score = (p) => (p.endsWith('.js') ? 0 : /\.cmd$/i.test(p) ? 2 : 1);
    return score(a) - score(b);
  });
  return uniq;
}

function checkNodeVersion(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(String(version || ''));
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > MIN_NODE.major) return true;
  if (major < MIN_NODE.major) return false;
  return minor >= MIN_NODE.minor;
}

/**
 * Run `meshy <argv…>` with JSON output by default.
 * Never uses a shell. Distinguishes CLI envelope ok from task status.
 */
export async function runMeshy(argv, {
  executable = null,
  timeoutMs = 120_000,
  cwd = undefined,
  json = true,
  allowNonZero = false,
  env = process.env,
} = {}) {
  if (!Array.isArray(argv) || argv.some((a) => typeof a !== 'string')) {
    throw new MeshyCliError('INVALID_ARGV', 'Meshy argv must be an array of strings');
  }
  const exe = executable || (await detectMeshyCli({ runner: runMeshy })).executable;
  if (!exe) {
    throw new MeshyCliError('CLI_MISSING', 'Meshy CLI is not installed (npm install -g meshy-cli)');
  }

  const args = json
    ? withJsonFlags(argv)
    : [...argv];

  const { spawnExe, spawnArgs, shell } = resolveSpawn(exe, args);

  const { stdout, stderr, code } = await spawnCapture(spawnExe, spawnArgs, {
    timeoutMs,
    cwd,
    env,
    shell,
  });

  if (!json) {
    if (code !== 0 && !allowNonZero) {
      throw mapExitToError(code, stderr || stdout, null);
    }
    return { stdout, stderr, exitCode: code };
  }

  const envelope = parseCliEnvelope(stdout, stderr);
  if (code === MESHY_CLI_EXIT.AMBIGUOUS_CREATE) {
    throw new MeshyCliError(
      'SPEND_AMBIGUOUS',
      envelope?.error?.message
        || 'Create request was sent but the result is unknown — list tasks before retrying',
      { exitCode: code, stderr, stdout, envelope },
    );
  }
  // meshy-cli 0.8.x on Windows can print a valid JSON envelope then abort in
  // libuv teardown (UV_HANDLE_CLOSING). Prefer the envelope when ok:true.
  const windowsCliTeardownCrash = WINDOWS
    && code !== 0
    && code !== MESHY_CLI_EXIT.SUCCESS
    && /UV_HANDLE_CLOSING/i.test(String(stderr || ''));
  if (envelope?.ok === true && (code === 0 || allowNonZero || windowsCliTeardownCrash)) {
    return envelope;
  }
  if (code !== 0 && !allowNonZero) {
    throw mapExitToError(code, stderr || stdout || envelope?.error?.message, envelope);
  }
  if (envelope && envelope.ok === false && !allowNonZero) {
    throw mapExitToError(code || 1, envelope.error?.message || 'Meshy CLI reported failure', envelope);
  }
  return envelope;
}

function withJsonFlags(argv) {
  const out = [];
  let hasFormat = false;
  let hasNoUpdate = false;
  for (const a of argv) {
    if (a === '--format' || a === '--json' || a.startsWith('--format=')) hasFormat = true;
    if (a === '--no-update-check') hasNoUpdate = true;
    out.push(a);
  }
  if (!hasFormat) out.push('--format', 'json');
  if (!hasNoUpdate) out.push('--no-update-check');
  return out;
}

function parseCliEnvelope(stdout, stderr) {
  const text = String(stdout || '').trim();
  if (!text) {
    throw new MeshyCliError(
      'INVALID_JSON',
      'Meshy CLI returned empty stdout',
      { stderr },
    );
  }
  // Prefer the first top-level JSON object (progress/logs may precede it).
  // Do not use lastIndexOf('{') — nested objects make that slice invalid.
  const start = text.indexOf('{');
  const slice = start >= 0 ? text.slice(start) : text;
  try {
    const parsed = JSON.parse(slice);
    if (parsed && typeof parsed === 'object' && parsed.schema_version) {
      return parsed;
    }
    return {
      schema_version: 'meshy.cli/v1',
      command: 'unknown',
      ok: true,
      result: parsed,
      error: null,
      warnings: [],
    };
  } catch {
    throw new MeshyCliError(
      'INVALID_JSON',
      'Meshy CLI returned non-JSON stdout',
      { stdout: text.slice(0, 500), stderr },
    );
  }
}

function mapExitToError(code, message, envelope) {
  const msg = String(message || envelope?.error?.message || `meshy exited ${code}`).trim();
  let errCode = 'CLI_COMMAND_FAILED';
  if (code === MESHY_CLI_EXIT.AUTH) errCode = 'AUTH_FAILED';
  else if (code === MESHY_CLI_EXIT.INSUFFICIENT_CREDITS) errCode = 'INSUFFICIENT_CREDITS';
  else if (code === MESHY_CLI_EXIT.RATE_LIMITED) errCode = 'RATE_LIMITED';
  else if (code === MESHY_CLI_EXIT.NETWORK) errCode = 'NETWORK';
  else if (code === MESHY_CLI_EXIT.WAIT_TIMEOUT) errCode = 'WAIT_TIMEOUT';
  else if (code === MESHY_CLI_EXIT.BAD_REQUEST || code === MESHY_CLI_EXIT.USAGE) errCode = 'BAD_REQUEST';
  else if (code === MESHY_CLI_EXIT.NOT_FOUND) errCode = 'NOT_FOUND';
  else if (code === MESHY_CLI_EXIT.AMBIGUOUS_CREATE) errCode = 'SPEND_AMBIGUOUS';
  else if (envelope?.error?.code === 'auth' || /not (logged|authenticated)|no credentials/i.test(msg)) {
    errCode = 'AUTH_FAILED';
  }
  return new MeshyCliError(errCode, msg, { exitCode: code, envelope });
}

/**
 * Prefer `node dist/index.js` over Windows `.cmd` shims (shell-less spawn).
 */
function resolveSpawn(exe, args) {
  if (exe.endsWith('.js')) {
    return { spawnExe: process.execPath, spawnArgs: [exe, ...args], shell: false };
  }
  if (WINDOWS && /\.cmd$/i.test(exe)) {
    return { spawnExe: exe, spawnArgs: args, shell: true };
  }
  return { spawnExe: exe, spawnArgs: args, shell: false };
}

function spawnCapture(exe, args, { timeoutMs = 30_000, cwd, env = process.env, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      shell,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new MeshyCliError('TIMEOUT', `Timed out after ${timeoutMs}ms: ${exe} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = err.code === 'ENOENT' ? 'CLI_MISSING' : 'SPAWN_FAILED';
      reject(new MeshyCliError(code, err.message));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function getMeshyAuthStatus(opts = {}) {
  return runMeshy(['auth', 'status'], { timeoutMs: 20_000, allowNonZero: true, ...opts });
}

export async function getMeshyBalance(opts = {}) {
  return runMeshy(['balance'], { timeoutMs: 20_000, ...opts });
}

/**
 * Start Meshy sign-in.
 *
 * The Vite plugin runs in a headless Node process, so plain `meshy auth login`
 * quietly switches to device flow and prints the code to discarded stdout —
 * which looks like "Log in does nothing." Always use device + --no-wait, return
 * the URL/code to the UI, and resume polling in the background so credentials
 * land when the user finishes on meshy.ai.
 */
export async function startMeshyLogin({ executable = null, device = true } = {}) {
  void device; // Always device-flow from the editor; flag kept for API compatibility.
  const detected = executable
    ? { ok: true, executable }
    : await detectMeshyCli();
  if (!detected.ok || !detected.executable) {
    throw new MeshyCliError(
      'CLI_MISSING',
      detected.error || 'Meshy CLI is not installed (npm install -g meshy-cli)',
    );
  }

  const envelope = await runMeshy(
    ['auth', 'login', '--device', '--no-wait'],
    {
      executable: detected.executable,
      timeoutMs: 20_000,
      // Windows meshy-cli may assert after printing JSON; still accept the payload.
      allowNonZero: true,
    },
  );
  const result = envelope?.result || {};
  const userCode = result.user_code || null;
  const flowId = result.flow_id || null;
  const verificationUrl = result.verification_url
    || (userCode ? `https://www.meshy.ai/oauth/device?user_code=${encodeURIComponent(userCode)}` : null)
    || 'https://www.meshy.ai/oauth/device';
  if (!userCode || !flowId) {
    throw new MeshyCliError(
      'LOGIN_FAILED',
      'Meshy CLI did not return a device login code. Try again, or run: meshy auth login',
      { envelope },
    );
  }

  // Keep polling until the user finishes (or the flow expires).
  const { spawnExe, spawnArgs, shell } = resolveSpawn(
    detected.executable,
    ['auth', 'login', '--device-flow', String(flowId)],
  );
  try {
    const child = spawn(spawnExe, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell,
      env: process.env,
    });
    child.unref();
  } catch {
    // UI can still complete via Refresh after manual `meshy auth login --device-flow …`
  }

  return {
    ok: true,
    device: true,
    userCode,
    flowId,
    verificationUrl,
    message: `Enter code ${userCode} at Meshy (browser should open), then click Refresh.`,
  };
}

export async function logoutMeshy({ all = false } = {}, opts = {}) {
  const argv = all ? ['auth', 'logout', '--all'] : ['auth', 'logout'];
  return runMeshy(argv, { timeoutMs: 20_000, allowNonZero: true, ...opts });
}

/**
 * Non-spending dry-run via `meshy make <image> --dry-run`.
 * Confirms CLI planning for an image path. Credit figure may differ from the
 * exact Game Prop create argv — callers should prefer local documented pricing
 * for the approved request.
 */
export async function dryRunImageTo3d(imagePath, opts = {}) {
  assertLocalImagePath(imagePath);
  return runMeshy(
    ['make', imagePath, '--dry-run'],
    { timeoutMs: 30_000, ...opts },
  );
}

/**
 * Submit Image-to-3D asynchronously. Caller must have spend approval.
 * Never retries. Uses --operation-id when provided to avoid local double-submit.
 */
export async function submitImageTo3dAsync(params, opts = {}) {
  const argv = buildImageTo3dCreateArgv({ ...params, async: true });
  try {
    return await runMeshy(argv, { timeoutMs: 90_000, ...opts });
  } catch (err) {
    if (err instanceof MeshyCliError && err.code === 'SPEND_AMBIGUOUS') {
      throw err;
    }
    throw err;
  }
}

export async function getImageTo3dTask(taskId, opts = {}) {
  assertTaskId(taskId);
  return runMeshy(['image-to-3d', 'get', taskId], { timeoutMs: 30_000, allowNonZero: true, ...opts });
}

export async function listImageTo3dTasks({ page = 1, pageSize = 10 } = {}, opts = {}) {
  return runMeshy(
    [
      'image-to-3d', 'list',
      '--page', String(page),
      '--page-size', String(pageSize),
    ],
    { timeoutMs: 30_000, allowNonZero: true, ...opts },
  );
}

/**
 * Download a finished task's GLB (and optional extras) into outputDir via CLI.
 */
export async function downloadImageTo3dTask(taskId, outputDir, {
  allAssets = false,
  ...opts
} = {}) {
  assertTaskId(taskId);
  if (typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) {
    throw new MeshyCliError('INVALID_OUTPUT', 'Download output directory must be an absolute path');
  }
  await fs.mkdir(outputDir, { recursive: true });
  const argv = [
    'image-to-3d', 'get', taskId,
    '-o', outputDir,
  ];
  if (allAssets) argv.push('--all-assets');
  return runMeshy(argv, { timeoutMs: 180_000, ...opts });
}

/**
 * Build `meshy image-to-3d create` argv from validated settings.
 * Every selected editor setting that the CLI accepts is forwarded.
 */
export function buildImageTo3dCreateArgv({
  settings = {},
  imagePath = null,
  async: asyncMode = false,
  operationId = null,
} = {}) {
  const validated = validateImageTo3dSettings(settings);
  if (!validated.ok) {
    throw new MeshyCliError(validated.code || 'INVALID_MODEL', validated.error || 'Invalid settings');
  }
  assertLocalImagePath(imagePath);
  const s = validated.settings;

  const formats = Array.isArray(s.target_formats) && s.target_formats.length
    ? s.target_formats.join(',')
    : 'glb';

  const argv = [
    'image-to-3d', 'create',
    '--image-url', imagePath,
    '--model-type', s.model_type,
    '--should-texture', boolFlag(s.should_texture),
    '--target-formats', formats,
  ];

  // Extra API fields without dedicated CLI flags (or that need remesh bundling).
  const data = {};

  if (s.model_type === MODEL_TYPES.smartTopology) {
    argv.push('--ai-model', s.ai_model);
    argv.push('--target-polycount', String(s.target_polycount));
  } else {
    // Standard: default geometry is meshy-7.1. Other geometry models + remesh /
    // topology go through --data (flags win over data for overlapping keys).
    if (s.ai_model && s.ai_model !== 'meshy-7.1' && s.ai_model !== 'latest') {
      data.ai_model = s.ai_model;
    }
    if (s.should_remesh) {
      data.should_remesh = true;
      data.topology = s.topology || 'triangle';
      if (s.decimation_mode) {
        data.decimation_mode = Number(s.decimation_mode);
      } else {
        data.target_polycount = s.target_polycount;
      }
      if (s.save_pre_remeshed_model) data.save_pre_remeshed_model = true;
    } else {
      data.should_remesh = false;
    }
    if (s.geometry_resolution === '2k' || s.geometry_resolution === '4k') {
      argv.push('--geometry-resolution', s.geometry_resolution);
    }
  }

  if (s.should_texture) {
    if (s.texture_model) argv.push('--texture-model', s.texture_model);
    if (s.texture_resolution) argv.push('--texture-resolution', s.texture_resolution);
    argv.push('--enable-pbr', boolFlag(Boolean(s.enable_pbr)));
    if (s.texture_prompt) argv.push('--texture-prompt', s.texture_prompt);
  }

  // Character pose constraint — omit flag for Default (no pose_mode).
  if (s.pose_mode === 't-pose' || s.pose_mode === 'a-pose') {
    argv.push('--pose-mode', s.pose_mode);
  }

  if (s.image_enhancement === true || s.image_enhancement === false) {
    argv.push('--image-enhancement', boolFlag(s.image_enhancement));
  }
  if (s.remove_lighting === true || s.remove_lighting === false) {
    argv.push('--remove-lighting', boolFlag(s.remove_lighting));
  }

  if (s.auto_size) data.auto_size = true;
  if (s.origin_at && (s.auto_size || s.origin_at !== 'bottom')) {
    data.origin_at = s.origin_at;
  }
  if (s.alpha_thumbnail) data.alpha_thumbnail = true;
  if (s.multi_view_thumbnails) data.multi_view_thumbnails = true;

  if (Object.keys(data).length) {
    argv.push('--data', JSON.stringify(data));
  }

  if (asyncMode) argv.push('--async');
  if (operationId) {
    assertOperationId(operationId);
    argv.push('--operation-id', operationId);
  }

  return argv;
}

/** Params forwarded on `image-to-3d create` for Game Prop / editor settings. */
export const CLI_IMAGE_TO_3D_PARAMS = Object.freeze([
  'imagePath',
  'model_type',
  'ai_model',
  'target_polycount',
  'should_texture',
  'enable_pbr',
  'texture_model',
  'texture_resolution',
  'texture_prompt',
  'target_formats',
  'geometry_resolution',
  'should_remesh',
  'decimation_mode',
  'save_pre_remeshed_model',
  'topology',
  'pose_mode',
  'image_enhancement',
  'remove_lighting',
  'auto_size',
  'origin_at',
  'alpha_thumbnail',
  'multi_view_thumbnails',
  'async',
  'operationId',
]);

function boolFlag(value) {
  return value ? 'true' : 'false';
}

export function assertLocalImagePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new MeshyCliError('INVALID_IMAGE', 'Reference image path is required');
  }
  if (/^https?:\/\//i.test(filePath)) {
    // CLI accepts URLs, but BloodBound stages local files — keep argv local.
    throw new MeshyCliError('INVALID_IMAGE', 'Reference image must be a local file path');
  }
  if (!path.isAbsolute(filePath)) {
    throw new MeshyCliError('INVALID_IMAGE', 'Reference image path must be absolute');
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    throw new MeshyCliError('INVALID_IMAGE', `Unsupported reference image type: ${ext}`);
  }
}

export function assertTaskId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{6,128}$/.test(id)) {
    throw new MeshyCliError('INVALID_TASK_ID', `Invalid Meshy task id: ${id}`);
  }
}

export function assertOperationId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
    throw new MeshyCliError('INVALID_OPERATION_ID', `Invalid operation id: ${id}`);
  }
}

/** Extract task id from a create / get / list envelope. */
export function extractTaskId(envelope) {
  const r = envelope?.result;
  if (!r) return null;
  return r.submission?.task_id
    || r.task?.task_id
    || r.task_id
    || r.id
    || null;
}

export function extractTaskStatus(envelope) {
  const task = envelope?.result?.task || envelope?.result;
  if (!task || typeof task !== 'object') return null;
  return {
    taskId: task.task_id || task.id || null,
    status: String(task.status || '').toUpperCase() || null,
    progress: Number(task.progress) || 0,
    modelUrls: task.model_urls || null,
    textureUrls: task.texture_urls || null,
    thumbnailUrl: task.thumbnail_url || null,
    consumedCredits: task.consumed_credits != null ? Number(task.consumed_credits) : null,
    taskError: task.task_error || null,
    raw: task,
  };
}

export function extractBalance(envelope) {
  const r = envelope?.result;
  if (!r || typeof r !== 'object') return null;
  return {
    balance: Number(r.balance ?? r.credits ?? r.total) || 0,
    monthlyCredits: Number(r.monthly_credits ?? r.monthly) || 0,
    permanentCredits: Number(r.permanent_credits ?? r.permanent) || 0,
    monthlyResetsAt: r.monthly_resets_at ?? r.monthlyResetsAt ?? null,
  };
}
