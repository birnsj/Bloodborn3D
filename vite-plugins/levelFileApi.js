import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLevelGeometry, validateLevelData } from '../src/serialization/LevelDeserializer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LEVELS_DIR = path.join(PROJECT_ROOT, 'public', 'levels');

/**
 * Development-only Vite middleware for reading/writing level JSON under public/levels.
 * Rejects path traversal and non-.json writes. Not available in production builds.
 * Writes are validated + atomic (temp file then rename) — Phase 2F.7E.
 */
export function levelFileApiPlugin() {
  return {
    name: 'bloodbound-level-file-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/levels', async (req, res, _next) => {
        try {
          if (req.method === 'GET') {
            await handleListOrRead(req, res);
            return;
          }
          if (req.method === 'PUT') {
            await handleWrite(req, res);
            return;
          }
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        } catch (err) {
          const invalid = err?.name === 'LevelGeometryValidationError';
          res.statusCode = invalid ? 422 : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: String(err.message || err),
            ...(invalid ? { diagnostics: err.diagnostics } : {}),
          }));
        }
      });
    },
  };
}

function resolveSafeLevelPath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Missing filename');
  }
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith('.json') || base.includes('..')) {
    throw new Error('Invalid level filename');
  }
  const full = path.resolve(LEVELS_DIR, base);
  if (!full.startsWith(LEVELS_DIR)) {
    throw new Error('Path traversal rejected');
  }
  return full;
}

async function handleListOrRead(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const name = url.searchParams.get('name');

  await fs.mkdir(LEVELS_DIR, { recursive: true });

  if (!name) {
    const entries = await fs.readdir(LEVELS_DIR);
    const levels = entries.filter((f) => f.endsWith('.json'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ levels }));
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

  const body = await readBody(req);
  const parsed = JSON.parse(body);
  // Reject malformed levels before touching disk (same rules as editor load).
  validateLevelData(parsed);
  // Geometry payloads + solid limit (Phase 2G D2/D3): refuse to persist a level
  // that would load back rejected or with cutters silently omitted.
  assertLevelGeometry(parsed);

  await fs.mkdir(LEVELS_DIR, { recursive: true });
  const payload = `${JSON.stringify(parsed, null, 2)}\n`;
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore cleanup failures
    }
    throw err;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true, name: path.basename(filePath) }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
