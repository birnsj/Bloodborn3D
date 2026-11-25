/**
 * Shared filesystem helpers for local Vite middleware (assets, concept library).
 * No new dependencies — temp+rename atomicity and a simple async mutex.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** Default JSON body cap for editor APIs (bytes). */
export const DEFAULT_JSON_BODY_LIMIT = 2 * 1024 * 1024;
/** Default binary upload cap (textures / references). */
export const DEFAULT_UPLOAD_LIMIT = 25 * 1024 * 1024;
/** Mesh upload cap. */
export const DEFAULT_MESH_UPLOAD_LIMIT = 50 * 1024 * 1024;

/**
 * Create a FIFO async mutex for read-modify-write critical sections.
 */
export function createAsyncMutex() {
  let tail = Promise.resolve();
  return function withLock(fn) {
    const run = tail.then(() => fn());
    // Prevent a rejected critical section from permanently poisoning the queue.
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

/**
 * Atomic text/binary write: write temp beside destination, then rename.
 */
export async function atomicWriteFile(destPath, data, encoding = undefined) {
  const dir = path.dirname(destPath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(destPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    if (encoding) await fs.writeFile(tmp, data, encoding);
    else await fs.writeFile(tmp, data);
    try {
      await fs.rename(tmp, destPath);
    } catch {
      // Windows cannot rename over an existing file — replace then rename.
      await fs.rm(destPath, { force: true });
      await fs.rename(tmp, destPath);
    }
  } catch (err) {
    try { await fs.unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

export async function atomicWriteJson(destPath, value) {
  await atomicWriteFile(destPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * Read request body with a hard size limit. Rejects when exceeded.
 */
export function readBodyBufferLimited(req, limitBytes = DEFAULT_UPLOAD_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      req.destroy?.();
      reject(err);
    };
    req.on('data', (c) => {
      total += c.length;
      if (total > limitBytes) {
        const err = new Error(`Request body exceeds ${limitBytes} bytes`);
        err.code = 'BODY_TOO_LARGE';
        fail(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', fail);
  });
}

export function readBodyLimited(req, limitBytes = DEFAULT_JSON_BODY_LIMIT) {
  return readBodyBufferLimited(req, limitBytes).then((buf) => buf.toString('utf8'));
}

/**
 * Detect common image formats from magic bytes (not filename).
 * @returns {'png'|'jpeg'|'webp'|'gif'|null}
 */
export function detectImageMagic(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function extensionForImageMagic(kind) {
  if (kind === 'jpeg') return '.jpg';
  if (kind === 'png' || kind === 'gif' || kind === 'webp') return `.${kind}`;
  return null;
}

/**
 * Resolve a path under `root`, rejecting traversal.
 */
export function resolveContainedPath(root, relPath) {
  if (!relPath || typeof relPath !== 'string') throw Object.assign(new Error('Missing path'), { code: 'PATH_INVALID' });
  const cleaned = relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  if (cleaned.includes('..')) {
    throw Object.assign(new Error('Path traversal rejected'), { code: 'PATH_TRAVERSAL' });
  }
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, cleaned);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    throw Object.assign(new Error('Path traversal rejected'), { code: 'PATH_TRAVERSAL' });
  }
  return full;
}

/** True when Host / forwarded host looks like loopback-only access. */
export function isLocalDevHost(req) {
  const host = String(req.headers?.host || '').split(',')[0].trim().toLowerCase();
  if (!host) return false;
  const hostname = host.replace(/:\d+$/, '');
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname === '::1';
}
