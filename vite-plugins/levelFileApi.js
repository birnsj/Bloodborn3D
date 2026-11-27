import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLevelGeometry, validateLevelData } from '../src/serialization/LevelDeserializer.js';
import {
  atomicWriteFile,
  DEFAULT_JSON_BODY_LIMIT,
  isLocalDevHost,
  readBodyLimited,
  resolveContainedPath,
} from './fsSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LEVELS_DIR = path.join(PROJECT_ROOT, 'public', 'levels');

/** Levels can be larger than typical editor JSON; keep well under memory DoS. */
export const LEVEL_JSON_BODY_LIMIT = Math.max(DEFAULT_JSON_BODY_LIMIT, 8 * 1024 * 1024);

/**
 * Development-only Vite middleware for reading/writing level JSON under public/levels.
 * Rejects path traversal and non-.json writes. Not available in production builds.
 * Writes are validated + atomic (temp file then rename) — Phase 2F.7E / C6.
 * Localhost-only + body size limit — C6 foundation API safety.
 */
export function levelFileApiPlugin() {
  return {
    name: 'bloodbound-level-file-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/levels', async (req, res, _next) => {
        try {
          if (!isLocalDevHost(req)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Level API is restricted to localhost during development',
              code: 'LOCALHOST_ONLY',
            });
            return;
          }
          if (req.method === 'GET') {
            await handleListOrRead(req, res);
            return;
          }
          if (req.method === 'PUT') {
            await handleWrite(req, res);
            return;
          }
          sendJson(res, 405, { error: 'Method not allowed' });
        } catch (err) {
          if (err?.code === 'BODY_TOO_LARGE') {
            sendJson(res, 413, {
              ok: false,
              error: String(err.message || err),
              code: 'BODY_TOO_LARGE',
            });
            return;
          }
          if (err instanceof SyntaxError) {
            sendJson(res, 400, {
              ok: false,
              error: 'Invalid JSON body',
              code: 'INVALID_JSON',
            });
            return;
          }
          const invalid = err?.name === 'LevelGeometryValidationError'
            || err?.name === 'LevelValidationError';
          sendJson(res, invalid ? 422 : 500, {
            error: String(err.message || err),
            ...(invalid && err.diagnostics ? { diagnostics: err.diagnostics } : {}),
          });
        }
      });
    },
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export function resolveSafeLevelPath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Missing filename');
  }
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith('.json') || base.includes('..')) {
    throw new Error('Invalid level filename');
  }
  // Separator-aware containment (same contract as fsSafety.resolveContainedPath).
  return resolveContainedPath(LEVELS_DIR, base);
}

async function handleListOrRead(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const name = url.searchParams.get('name');

  await fs.mkdir(LEVELS_DIR, { recursive: true });

  if (!name) {
    const entries = await fs.readdir(LEVELS_DIR);
    const levels = entries.filter((f) => f.endsWith('.json'));
    sendJson(res, 200, { levels });
    return;
  }

  const filePath = resolveSafeLevelPath(name);
  const data = await fs.readFile(filePath, 'utf8');
  JSON.parse(data);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(data);
}

async function handleWrite(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const name = url.searchParams.get('name');
  const filePath = resolveSafeLevelPath(name);

  const body = await readBodyLimited(req, LEVEL_JSON_BODY_LIMIT);
  const parsed = JSON.parse(body);
  // Reject malformed levels before touching disk (same rules as editor load).
  validateLevelData(parsed);
  // Geometry payloads + solid limit (Phase 2G D2/D3): refuse to persist a level
  // that would load back rejected or with cutters silently omitted.
  assertLevelGeometry(parsed);

  await fs.mkdir(LEVELS_DIR, { recursive: true });
  const payload = `${JSON.stringify(parsed, null, 2)}\n`;
  await atomicWriteFile(filePath, payload, 'utf8');

  sendJson(res, 200, { ok: true, name: path.basename(filePath) });
}
