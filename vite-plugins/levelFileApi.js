import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LEVELS_DIR = path.join(PROJECT_ROOT, 'public', 'levels');

/**
 * Development-only Vite middleware for reading/writing level JSON under public/levels.
 * Rejects path traversal and non-.json writes. Not available in production builds.
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
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err.message || err) }));
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
  await fs.mkdir(LEVELS_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

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
