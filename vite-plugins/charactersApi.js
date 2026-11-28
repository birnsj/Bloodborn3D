/**
 * Dev-only Characters library API (`apply: 'serve'`).
 * Files: public/characters/index.json + public/characters/<id>.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  atomicWriteJson,
  DEFAULT_JSON_BODY_LIMIT,
  isLocalDevHost,
  readBodyLimited,
} from './fsSafety.js';
import {
  createCharacterDoc,
  createEmptyCharacterIndex,
  normalizeCharacter,
  normalizeCharacterIndex,
} from '../src/characters/characterSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CHAR_ROOT = path.join(PROJECT_ROOT, 'public', 'characters');
const INDEX_FILE = path.join(CHAR_ROOT, 'index.json');

export function charactersApiPlugin() {
  return {
    name: 'bloodbound-characters-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/characters', async (req, res) => {
        try {
          if (!isLocalDevHost(req)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Characters API is restricted to localhost',
              code: 'LOCALHOST_ONLY',
            });
            return;
          }

          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || '';

          if (req.method === 'GET' && (action === 'list' || action === '')) {
            sendJson(res, 200, { ok: true, index: await loadIndex() });
            return;
          }

          if (req.method === 'GET' && action === 'get') {
            const id = url.searchParams.get('id');
            const character = await readCharacter(id);
            if (!character) {
              sendJson(res, 404, { ok: false, code: 'NOT_FOUND', error: 'Character not found' });
              return;
            }
            sendJson(res, 200, { ok: true, character });
            return;
          }

          if (req.method === 'POST' && action === 'create') {
            const body = JSON.parse(await readBody(req));
            const id = String(body.id || `char_${randomUUID().replace(/-/g, '').slice(0, 12)}`);
            const character = createCharacterDoc({
              id,
              name: body.name,
              meshAssetId: body.meshAssetId,
              heightMeters: body.heightMeters,
              meshyRigTaskId: body.meshyRigTaskId,
            });
            if (!character) {
              sendJson(res, 400, {
                ok: false,
                code: 'INVALID_CHARACTER',
                error: 'name and meshAssetId are required',
              });
              return;
            }
            await ensureRoot();
            await atomicWriteJson(path.join(CHAR_ROOT, `${character.id}.json`), character);
            const index = await loadIndex();
            index.characters = [
              ...index.characters.filter((c) => c.id !== character.id),
              summarize(character),
            ];
            await atomicWriteJson(INDEX_FILE, index);
            sendJson(res, 200, { ok: true, character, index });
            return;
          }

          if (req.method === 'POST' && action === 'update') {
            const body = JSON.parse(await readBody(req));
            const existing = await readCharacter(body.id);
            if (!existing) {
              sendJson(res, 404, { ok: false, code: 'NOT_FOUND', error: 'Character not found' });
              return;
            }
            const character = normalizeCharacter({
              ...existing,
              ...body,
              id: existing.id,
              updatedAt: Date.now(),
            });
            await atomicWriteJson(path.join(CHAR_ROOT, `${character.id}.json`), character);
            const index = await loadIndex();
            index.characters = index.characters.map((c) => (
              c.id === character.id ? summarize(character) : c
            ));
            if (!index.characters.some((c) => c.id === character.id)) {
              index.characters.push(summarize(character));
            }
            await atomicWriteJson(INDEX_FILE, index);
            sendJson(res, 200, { ok: true, character, index });
            return;
          }

          if (req.method === 'POST' && action === 'delete') {
            const body = JSON.parse(await readBody(req));
            const id = String(body.id || '').trim();
            if (!id) {
              sendJson(res, 400, { ok: false, code: 'INVALID_ID', error: 'id required' });
              return;
            }
            try {
              await fs.unlink(path.join(CHAR_ROOT, `${id}.json`));
            } catch (err) {
              if (err?.code !== 'ENOENT') throw err;
            }
            const index = await loadIndex();
            index.characters = index.characters.filter((c) => c.id !== id);
            await atomicWriteJson(INDEX_FILE, index);
            sendJson(res, 200, { ok: true, index });
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

function summarize(character) {
  return {
    id: character.id,
    name: character.name,
    meshAssetId: character.meshAssetId,
    heightMeters: character.heightMeters,
    meshyRigTaskId: character.meshyRigTaskId,
    updatedAt: character.updatedAt,
  };
}

async function ensureRoot() {
  await fs.mkdir(CHAR_ROOT, { recursive: true });
}

async function loadIndex() {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf8');
    return normalizeCharacterIndex(JSON.parse(raw));
  } catch (err) {
    if (err?.code === 'ENOENT') return createEmptyCharacterIndex();
    throw err;
  }
}

async function readCharacter(id) {
  const safe = String(id || '').trim();
  if (!safe || safe.includes('..') || safe.includes('/') || safe.includes('\\')) return null;
  try {
    const raw = await fs.readFile(path.join(CHAR_ROOT, `${safe}.json`), 'utf8');
    return normalizeCharacter(JSON.parse(raw));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

async function readBody(req) {
  return readBodyLimited(req, DEFAULT_JSON_BODY_LIMIT);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
