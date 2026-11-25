/**
 * Phase 2H.1A — OpenArt CLI adapter (Node only).
 *
 * Invokes the official `openart` binary with fixed argv arrays (never a shell
 * string). Credentials stay in the CLI's own store
 * (`%USERPROFILE%\.openart\cli-credentials.json`); this module never reads them.
 *
 * Paid generation is NOT performed here without an explicit caller decision —
 * see openArtSession.js for the estimate → approve → generate gate.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WINDOWS = process.platform === 'win32';

/** Model ids are lowercase tokens with hyphens / dots only. */
const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const ASPECT_RATIOS = new Set([
  '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16',
]);
const RESOLUTIONS = new Set(['1K', '2K', '4K']);
const CREATION_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

export class OpenArtCliError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'OpenArtCliError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Resolve the openart executable. Prefers PATH, then the Windows installer path.
 * @returns {Promise<{ ok: boolean, executable: string|null, version: object|null, error?: string }>}
 */
export async function detectOpenArtCli({ runner = runOpenArt } = {}) {
  const candidates = await listExecutableCandidates();
  if (!candidates.length) {
    return {
      ok: false,
      executable: null,
      version: null,
      error: 'OpenArt CLI not found on PATH (install from https://github.com/OpenArt-AI/cli)',
      code: 'CLI_MISSING',
    };
  }

  let lastErr = null;
  for (const exe of candidates) {
    try {
      const version = await runner(['version'], { executable: exe, timeoutMs: 8000 });
      return { ok: true, executable: exe, version, code: null };
    } catch (err) {
      lastErr = err;
    }
  }
  return {
    ok: false,
    executable: candidates[0],
    version: null,
    error: lastErr?.message || 'OpenArt CLI found but failed to run',
    code: lastErr?.code || 'CLI_FAILED',
  };
}

async function listExecutableCandidates() {
  const found = [];
  const whichCmd = WINDOWS ? 'where' : 'which';
  try {
    const out = await spawnCapture(whichCmd, ['openart'], { timeoutMs: 5000 });
    for (const line of out.stdout.split(/\r?\n/)) {
      const p = line.trim();
      if (p) found.push(p);
    }
  } catch {
    // fall through to known install paths
  }

  if (WINDOWS) {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      found.push(path.join(local, 'Programs', 'openart', 'bin', 'openart.exe'));
    }
  } else {
    found.push('/usr/local/bin/openart', path.join(process.env.HOME || '', '.local', 'bin', 'openart'));
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
      // skip missing
    }
  }
  return uniq;
}

/**
 * Run `openart <argv…> --json --no-input --quiet` and parse stdout JSON.
 * Never uses a shell. `argv` must already be a validated argument list.
 */
export async function runOpenArt(argv, {
  executable = null,
  timeoutMs = 120_000,
  cwd = undefined,
} = {}) {
  if (!Array.isArray(argv) || argv.some((a) => typeof a !== 'string')) {
    throw new OpenArtCliError('INVALID_ARGV', 'OpenArt argv must be an array of strings');
  }
  const exe = executable || (await detectOpenArtCli()).executable;
  if (!exe) {
    throw new OpenArtCliError('CLI_MISSING', 'OpenArt CLI is not installed');
  }

  const args = [...argv, '--json', '--no-input', '--quiet'];
  const { stdout, stderr, code } = await spawnCapture(exe, args, { timeoutMs, cwd });

  if (code !== 0) {
    const reason = (stderr || stdout || '').trim() || `openart exited ${code}`;
    const lower = reason.toLowerCase();
    let errCode = 'CLI_COMMAND_FAILED';
    if (lower.includes('not logged') || lower.includes('unauthor') || lower.includes('auth')) {
      errCode = 'AUTH_FAILED';
    } else if (lower.includes('credit')) {
      errCode = 'INSUFFICIENT_CREDITS';
    } else if (lower.includes('timeout')) {
      errCode = 'TIMEOUT';
    }
    throw new OpenArtCliError(errCode, reason, { exitCode: code, stderr, stdout });
  }

  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new OpenArtCliError(
      'INVALID_JSON',
      'OpenArt CLI returned non-JSON stdout',
      { stdout: text.slice(0, 500), stderr },
    );
  }
}

function spawnCapture(exe, args, { timeoutMs = 30_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new OpenArtCliError('TIMEOUT', `Timed out after ${timeoutMs}ms: ${exe} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = err.code === 'ENOENT' ? 'CLI_MISSING' : 'SPAWN_FAILED';
      reject(new OpenArtCliError(code, err.message));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function getAccount(opts = {}) {
  return runOpenArt(['account'], { timeoutMs: 20_000, ...opts });
}

/**
 * Start browser OAuth (`openart login`). Fire-and-forget — the CLI opens a
 * browser and writes credentials locally. Does not use --no-input / --quiet.
 * Caller should re-check `account` after the user finishes.
 */
export async function startOpenArtLogin({ executable = null } = {}) {
  const detected = executable
    ? { ok: true, executable }
    : await detectOpenArtCli();
  if (!detected.ok || !detected.executable) {
    throw new OpenArtCliError(
      'CLI_MISSING',
      detected.error || 'OpenArt CLI is not installed',
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(detected.executable, ['login'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false,
      env: process.env,
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(started);
      const code = err.code === 'ENOENT' ? 'CLI_MISSING' : 'SPAWN_FAILED';
      reject(new OpenArtCliError(code, err.message));
    });
    // Brief delay so ENOENT can surface before we report success.
    const started = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve({
        ok: true,
        message: 'Browser login started. Finish signing in, then Refresh.',
      });
    }, 100);
  });
}

export async function listModels(opts = {}) {
  return runOpenArt(['model', 'list'], { timeoutMs: 30_000, ...opts });
}

export async function getModelForm(modelId, mode = 'text2image', opts = {}) {
  assertModelId(modelId);
  assertMode(mode);
  return runOpenArt(['model', 'form', modelId, mode], { timeoutMs: 20_000, ...opts });
}

/**
 * Quote credits for a model/mode/config. Never spends credits.
 */
export async function estimateCost({
  modelId,
  mode = 'text2image',
  aspectRatio = '1:1',
  resolution = '1K',
} = {}, opts = {}) {
  assertModelId(modelId);
  assertMode(mode);
  assertAspectRatio(aspectRatio);
  assertResolution(resolution);
  return runOpenArt([
    'model', 'cost',
    '--model', modelId,
    '--mode', mode,
  ], { timeoutMs: 20_000, ...opts });
}

/** Dry-run a generate request — prints the body OpenArt would send, spends nothing. */
export async function dryRunGenerateImage({
  prompt,
  modelId,
  imagePaths = null,
} = {}, opts = {}) {
  const argv = buildGenerateImageArgv({
    prompt,
    modelId,
    imagePaths,
    dryRun: true,
    async: false,
  });
  return runOpenArt(argv, { timeoutMs: 20_000, ...opts });
}

/**
 * Submit an image generation asynchronously. Caller must have already obtained
 * explicit spend approval — this function does not enforce that gate itself.
 * Never retries. Never downloads (async cannot combine with -o).
 */
export async function submitGenerateImageAsync(params, opts = {}) {
  const argv = buildGenerateImageArgv({ ...params, dryRun: false, async: true });
  return runOpenArt(argv, { timeoutMs: 60_000, ...opts });
}

export async function getCreation(creationId, opts = {}) {
  assertCreationId(creationId);
  return runOpenArt(['creation', 'get', creationId], { timeoutMs: 30_000, ...opts });
}

export async function waitCreation(creationId, { timeout = '5m', ...opts } = {}) {
  assertCreationId(creationId);
  if (typeof timeout !== 'string' || !/^\d+[smh]$/.test(timeout)) {
    throw new OpenArtCliError('INVALID_TIMEOUT', 'timeout must look like 90s, 5m, or 1h');
  }
  return runOpenArt(
    ['creation', 'wait', creationId, '--timeout', timeout],
    { timeoutMs: parseTimeoutMs(timeout) + 5000, ...opts },
  );
}

/**
 * Download a finished creation into `outputDir` via `creation wait` + URL fetch
 * is handled by the session layer. This helper uses `openart` only when a local
 * sync generate with -o is requested — preferred path for PoC is async + HTTP
 * download of the result URL so we never re-submit.
 *
 * For async jobs: pass the result HTTPS URL from `creation get` / `wait`.
 */
export async function downloadUrlToFile(url, destPath, { fetchImpl = fetch } = {}) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    throw new OpenArtCliError('INVALID_URL', 'Download URL must be https');
  }
  // Host allowlist — OpenArt CDN / API hosts only.
  const host = new URL(url).hostname.toLowerCase();
  if (!host.endsWith('openart.ai') && !host.endsWith('openartcdn.com')) {
    throw new OpenArtCliError('URL_HOST_REJECTED', `Refusing download host: ${host}`);
  }
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new OpenArtCliError('DOWNLOAD_FAILED', `Download failed: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
  return { path: destPath, bytes: buf.length };
}

export function buildGenerateImageArgv({
  prompt,
  modelId,
  imagePaths = null,
  dryRun = false,
  async: asyncMode = false,
} = {}) {
  assertPrompt(prompt);
  assertModelId(modelId);
  if (dryRun && asyncMode) {
    throw new OpenArtCliError('INVALID_ARGV', 'dry-run and async cannot be combined for generate');
  }

  // Prompt is a single argv element — never interpolated into a shell string.
  // CLI 0.1.1 `generate image` accepts --model / --image / --async / -o only.
  // aspect-ratio / resolution / free-form formValues are NOT CLI generate flags —
  // they are used for `model cost` quotes and UI display; do not invent argv for them.
  const argv = ['generate', 'image', prompt, '--model', modelId];
  const images = Array.isArray(imagePaths) ? imagePaths : (imagePaths ? [imagePaths] : []);
  for (const img of images) {
    assertLocalImagePath(img);
    argv.push('--image', img);
  }
  if (dryRun) argv.push('--dry-run');
  if (asyncMode) argv.push('--async');
  return argv;
}

/** Params actually forwarded to `openart generate image` (CLI 0.1.x). */
export const CLI_GENERATE_IMAGE_PARAMS = Object.freeze(['prompt', 'modelId', 'imagePaths', 'async', 'dryRun']);

/**
 * Estimate/UI fields that are NOT accepted by `generate image` argv.
 * Quoted via `model cost` only — never invent CLI flags for these.
 */
export const UNSUPPORTED_GENERATE_CLI_PARAMS = Object.freeze([
  'aspectRatio',
  'resolution',
  'formValues',
  'mode',
]);

/** Reference images must be absolute local paths (no URLs in argv for safety). */
export function assertLocalImagePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new OpenArtCliError('INVALID_IMAGE', 'Reference image path is required');
  }
  if (/^https?:\/\//i.test(filePath)) {
    throw new OpenArtCliError('INVALID_IMAGE', 'Reference image must be a local file path');
  }
  if (!path.isAbsolute(filePath)) {
    throw new OpenArtCliError('INVALID_IMAGE', 'Reference image path must be absolute');
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    throw new OpenArtCliError('INVALID_IMAGE', `Unsupported reference image type: ${ext}`);
  }
}

export function assertModelId(modelId) {
  if (typeof modelId !== 'string' || !MODEL_ID_RE.test(modelId)) {
    throw new OpenArtCliError('INVALID_MODEL', `Invalid model id: ${modelId}`);
  }
}

export function assertMode(mode) {
  if (mode !== 'text2image' && mode !== 'image2image') {
    throw new OpenArtCliError('INVALID_MODE', `Unsupported mode: ${mode}`);
  }
}

export function assertAspectRatio(value) {
  if (!ASPECT_RATIOS.has(value)) {
    throw new OpenArtCliError('INVALID_ASPECT', `Unsupported aspect ratio: ${value}`);
  }
}

export function assertResolution(value) {
  if (!RESOLUTIONS.has(value)) {
    throw new OpenArtCliError('INVALID_RESOLUTION', `Unsupported resolution: ${value}`);
  }
}

export function assertPrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new OpenArtCliError('INVALID_PROMPT', 'Prompt is required');
  }
  if (prompt.length > 4000) {
    throw new OpenArtCliError('INVALID_PROMPT', 'Prompt exceeds 4000 characters');
  }
}

export function assertCreationId(id) {
  if (typeof id !== 'string' || !CREATION_ID_RE.test(id)) {
    throw new OpenArtCliError('INVALID_CREATION_ID', `Invalid creation id: ${id}`);
  }
}

function parseTimeoutMs(timeout) {
  const m = /^(\d+)([smh])$/.exec(timeout);
  if (!m) return 300_000;
  const n = Number(m[1]);
  if (m[2] === 's') return n * 1000;
  if (m[2] === 'm') return n * 60_000;
  return n * 3_600_000;
}

/** Staging root under the project (gitignored). */
export function defaultStagingRoot(projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')) {
  return path.join(projectRoot, '.openart-staging');
}
