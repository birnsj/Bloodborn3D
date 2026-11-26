/**
 * Dev-only Google Drive external library API (`apply: 'serve'` only).
 * OAuth tokens stay on disk — never sent to the browser.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GoogleDriveAuthError,
  addGoogleDriveLibrary,
  connectGoogleAccount,
  copyGoogleDriveToProjectArt,
  disconnectGoogleAccount,
  getGoogleDriveImageBuffer,
  getGoogleDriveLibraryTree,
  getGoogleDriveStatus,
  listGoogleDriveFolder,
  listGoogleDriveLibraries,
  materializeGoogleDriveFile,
  parseGoogleDriveUrl,
  refreshGoogleDriveLibraryMeta,
  removeGoogleDriveLibrary,
} from '../src/dev/googleDrive/googleDriveSession.js';
import {
  DEFAULT_JSON_BODY_LIMIT,
  isLocalDevHost,
  readBodyLimited,
} from './fsSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function googleDriveApiPlugin() {
  return {
    name: 'bloodbound-google-drive-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/google-drive', async (req, res) => {
        try {
          if (!isLocalDevHost(req)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Google Drive API is restricted to localhost during development',
              code: 'LOCALHOST_ONLY',
            });
            return;
          }

          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || '';

          if (req.method === 'GET' && action === 'status') {
            sendJson(res, 200, await getGoogleDriveStatus(PROJECT_ROOT));
            return;
          }

          if (req.method === 'POST' && action === 'login') {
            sendJson(res, 200, await connectGoogleAccount(PROJECT_ROOT));
            return;
          }

          if (req.method === 'POST' && action === 'logout') {
            sendJson(res, 200, await disconnectGoogleAccount(PROJECT_ROOT));
            return;
          }

          if (req.method === 'POST' && action === 'parse-url') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, parseGoogleDriveUrl(body.url || ''));
            return;
          }

          if (req.method === 'GET' && action === 'libraries') {
            sendJson(res, 200, await listGoogleDriveLibraries(PROJECT_ROOT));
            return;
          }

          if (req.method === 'POST' && action === 'add-library') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await addGoogleDriveLibrary(PROJECT_ROOT, { url: body.url }));
            return;
          }

          if (req.method === 'POST' && action === 'remove-library') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await removeGoogleDriveLibrary(PROJECT_ROOT, {
              libraryId: body.libraryId,
            }));
            return;
          }

          if (req.method === 'POST' && action === 'refresh-library') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await refreshGoogleDriveLibraryMeta(PROJECT_ROOT, {
              libraryId: body.libraryId,
            }));
            return;
          }

          if (req.method === 'GET' && action === 'tree') {
            const libraryId = url.searchParams.get('libraryId');
            sendJson(res, 200, await getGoogleDriveLibraryTree(PROJECT_ROOT, { libraryId }));
            return;
          }

          if (req.method === 'GET' && action === 'list') {
            sendJson(res, 200, await listGoogleDriveFolder(PROJECT_ROOT, {
              libraryId: url.searchParams.get('libraryId'),
              folderPath: url.searchParams.get('path') || '',
              pageToken: url.searchParams.get('pageToken') || null,
            }));
            return;
          }

          if (req.method === 'GET' && action === 'image') {
            const fileId = url.searchParams.get('fileId');
            const libraryId = url.searchParams.get('libraryId') || null;
            const thumb = url.searchParams.get('thumb') === '1';
            const { buffer, contentType } = await getGoogleDriveImageBuffer(PROJECT_ROOT, {
              fileId,
              libraryId,
              thumb,
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType || 'image/jpeg');
            res.setHeader('Cache-Control', thumb ? 'private, max-age=300' : 'private, max-age=60');
            res.end(buffer);
            return;
          }

          if (req.method === 'POST' && action === 'materialize') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await materializeGoogleDriveFile(PROJECT_ROOT, body));
            return;
          }

          if (req.method === 'POST' && action === 'copy-to-project-art') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await copyGoogleDriveToProjectArt(PROJECT_ROOT, body));
            return;
          }

          sendJson(res, 404, { ok: false, error: `Unknown action “${action}”` });
        } catch (err) {
          const status = err instanceof GoogleDriveAuthError
            ? mapErrorStatus(err.code)
            : 500;
          sendJson(res, status, {
            ok: false,
            error: err.message || String(err),
            code: err.code || 'GDRIVE_ERROR',
          });
        }
      });
    },
  };
}

function mapErrorStatus(code) {
  switch (code) {
    case 'AUTH_FAILED':
    case 'AUTH_CANCELLED':
    case 'AUTH_TIMEOUT':
    case 'TOKEN_REFRESH_FAILED':
    case 'TOKEN_EXCHANGE_FAILED':
      return 401;
    case 'OAUTH_CONFIG_MISSING':
      return 503;
    case 'NOT_FOUND':
      return 404;
    default:
      return 400;
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
