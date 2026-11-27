/**
 * Dev-only localhost API for editor sticky-note reminders.
 * Data lives in `.editor-local/sticky-notes.json` — never in level JSON.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atomicWriteJson,
  DEFAULT_JSON_BODY_LIMIT,
  isLocalDevHost,
  readBodyLimited,
} from './fsSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOCAL_DIR = path.join(PROJECT_ROOT, '.editor-local');
const NOTES_FILE = path.join(LOCAL_DIR, 'sticky-notes.json');

const EMPTY_DOC = {
  schemaVersion: 1,
  byLevel: {},
};

export function stickyNotesApiPlugin() {
  return {
    name: 'bloodbound-sticky-notes-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/sticky-notes', async (req, res) => {
        try {
          if (!isLocalDevHost(req)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Sticky notes API is restricted to localhost',
              code: 'LOCALHOST_ONLY',
            });
            return;
          }
          if (req.method === 'GET') {
            const doc = await readDoc();
            sendJson(res, 200, { ok: true, doc });
            return;
          }
          if (req.method === 'PUT') {
            const body = await readBodyLimited(req, DEFAULT_JSON_BODY_LIMIT);
            const parsed = JSON.parse(body);
            const doc = normalizeDoc(parsed);
            await fs.mkdir(LOCAL_DIR, { recursive: true });
            await atomicWriteJson(NOTES_FILE, doc);
            sendJson(res, 200, { ok: true, doc });
            return;
          }
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        } catch (err) {
          if (err?.code === 'BODY_TOO_LARGE') {
            sendJson(res, 413, { ok: false, error: String(err.message || err), code: 'BODY_TOO_LARGE' });
            return;
          }
          if (err instanceof SyntaxError) {
            sendJson(res, 400, { ok: false, error: 'Invalid JSON body', code: 'INVALID_JSON' });
            return;
          }
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        }
      });
    },
  };
}

async function readDoc() {
  try {
    const raw = await fs.readFile(NOTES_FILE, 'utf8');
    return normalizeDoc(JSON.parse(raw));
  } catch (err) {
    if (err?.code === 'ENOENT') return { ...EMPTY_DOC, byLevel: {} };
    throw err;
  }
}

function normalizeDoc(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const byLevel = {};
  const incoming = src.byLevel && typeof src.byLevel === 'object' ? src.byLevel : {};
  for (const [key, list] of Object.entries(incoming)) {
    if (typeof key !== 'string' || !key) continue;
    if (!Array.isArray(list)) continue;
    byLevel[key] = list;
  }
  return {
    schemaVersion: 1,
    visible: src.visible !== false,
    byLevel,
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}
