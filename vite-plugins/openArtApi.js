/**
 * Phase 2H.1A — Dev-only OpenArt HTTP API (`apply: 'serve'` only).
 *
 * Credentials never leave the OpenArt CLI credential store. The browser only
 * talks to this local middleware; paid generate requires confirmSpend:true.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importTextureBuffer, createMaterialAssetFromDefinition } from './assetFileApi.js';
import {
  OpenArtCliError,
  defaultStagingRoot,
} from '../src/dev/openart/openArtCli.js';
import {
  approveAndGenerate,
  createEstimate,
  downloadJobToStaging,
  getJobStatus,
  getOpenArtModelForm,
  getOpenArtStatus,
  listOpenArtModels,
  readStagingFile,
  waitForJob,
} from '../src/dev/openart/openArtSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STAGING_ROOT = defaultStagingRoot(PROJECT_ROOT);

export function openArtApiPlugin() {
  return {
    name: 'bloodbound-openart-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/openart', async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || '';

          if (req.method === 'GET' && action === 'status') {
            sendJson(res, 200, await getOpenArtStatus());
            return;
          }

          if (req.method === 'GET' && action === 'models') {
            sendJson(res, 200, await listOpenArtModels());
            return;
          }

          if (req.method === 'GET' && action === 'form') {
            const modelId = url.searchParams.get('model') || 'nano-banana-2';
            const mode = url.searchParams.get('mode') || 'text2image';
            sendJson(res, 200, await getOpenArtModelForm(modelId, mode));
            return;
          }

          if (req.method === 'GET' && action === 'job') {
            const jobId = url.searchParams.get('jobId');
            const generationId = url.searchParams.get('generationId');
            sendJson(res, 200, await getJobStatus({ jobId, generationId }));
            return;
          }

          if (req.method === 'POST' && action === 'estimate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await createEstimate(body));
            return;
          }

          if (req.method === 'POST' && action === 'generate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await approveAndGenerate(body));
            return;
          }

          if (req.method === 'POST' && action === 'wait') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await waitForJob(body));
            return;
          }

          if (req.method === 'POST' && action === 'download') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await downloadJobToStaging({
              ...body,
              stagingRoot: STAGING_ROOT,
            }));
            return;
          }

          if (req.method === 'POST' && action === 'import') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await importStagingToAssets(body));
            return;
          }

          if (req.method === 'GET' && action === 'staging-file') {
            const stagingId = url.searchParams.get('stagingId');
            const { meta, absolutePath } = await readStagingFile(stagingId, {
              stagingRoot: STAGING_ROOT,
            });
            const buf = await fs.readFile(absolutePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentTypeFor(meta.fileName));
            res.setHeader('Cache-Control', 'no-store');
            res.end(buf);
            return;
          }

          sendJson(res, 405, { error: 'Method or action not allowed', action });
        } catch (err) {
          const code = err instanceof OpenArtCliError ? mapErrorStatus(err.code) : 500;
          sendJson(res, code, {
            ok: false,
            error: String(err.message || err),
            code: err.code || 'OPENART_ERROR',
            details: err.details || null,
          });
        }
      });
    },
  };
}

async function importStagingToAssets({
  stagingId,
  createMaterial = true,
  materialName = null,
  textureName = null,
} = {}) {
  const { meta, buffer } = await readStagingFile(stagingId, { stagingRoot: STAGING_ROOT });
  const tex = await importTextureBuffer(buffer, meta.fileName || `${stagingId}.png`, {
    name: textureName || `OpenArt ${meta.modelId || 'image'}`,
    tags: ['openart', 'generated', 'phase2h1a'],
  });

  let material = null;
  if (createMaterial) {
    material = await createMaterialAssetFromDefinition({
      name: materialName || `OpenArt ${meta.modelId || 'Material'}`,
      baseColorMapId: tex.asset.id,
      baseColor: '#ffffff',
      roughness: 0.85,
      metalness: 0.02,
    });
  }

  return {
    ok: true,
    stagingId,
    texture: tex.asset,
    material: material?.asset || null,
    materialDefinition: material?.definition || null,
    registry: material?.registry || tex.registry,
    previewUrl: `/assets/${tex.asset.path}`,
  };
}

function mapErrorStatus(code) {
  switch (code) {
    case 'CLI_MISSING':
      return 503;
    case 'AUTH_FAILED':
      return 401;
    case 'APPROVAL_REQUIRED':
    case 'ESTIMATE_NOT_FOUND':
    case 'ALREADY_SPENT':
    case 'INVALID_PROMPT':
    case 'INVALID_MODEL':
    case 'INVALID_ARGV':
      return 400;
    case 'GENERATION_FAILED':
    case 'INSUFFICIENT_CREDITS':
      return 402;
    case 'JOB_NOT_FOUND':
    case 'NO_RESULT_YET':
      return 404;
    case 'TIMEOUT':
      return 504;
    default:
      return 500;
  }
}

function contentTypeFor(name = '') {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
