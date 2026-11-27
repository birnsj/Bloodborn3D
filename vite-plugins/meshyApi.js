/**
 * Dev-only Meshy HTTP API (`apply: 'serve'` only).
 * Credentials stay in the Meshy CLI store — never sent to the browser.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshyCliError, defaultStagingRoot, validateGlbBuffer } from '../src/dev/meshy/meshyCli.js';
import { normalizeMeshyImportGlb } from '../src/dev/mesh/glbPivot.js';
import {
  GAME_PROP_PRESET,
  GEOMETRY_MODELS,
  TEXTURE_MODELS,
  availableTextureModels,
  createDefaultMeshyFormValues,
  estimateImageTo3dCredits,
  validateImageTo3dSettings,
} from '../src/dev/meshy/meshyModels.js';
import {
  approveAndGenerateMeshy,
  beginMeshyLogin,
  beginMeshyLogout,
  createMeshyEstimate,
  getMeshyJob,
  getMeshyStatus,
  pollMeshyJob,
  readMeshyStagingFile,
  fetchMeshyJobTextureMaps,
  recoverMeshyJob,
  recoverMeshyJobsFromDisk,
  resolveMeshyMapFile,
  saveReferenceImageToStaging,
} from '../src/dev/meshy/meshySession.js';
import { listStagingMeshyMaps } from '../src/dev/meshy/meshyPbrMaps.js';
import {
  DEFAULT_JSON_BODY_LIMIT,
  DEFAULT_UPLOAD_LIMIT,
  detectImageMagic,
  extensionForImageMagic,
  isLocalDevHost,
  readBodyBufferLimited,
  readBodyLimited,
} from './fsSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STAGING_ROOT = defaultStagingRoot(PROJECT_ROOT);

export function meshyApiPlugin() {
  return {
    name: 'bloodbound-meshy-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/meshy', async (req, res) => {
        try {
          if (!isLocalDevHost(req)) {
            sendJson(res, 403, {
              ok: false,
              error: 'Meshy API is restricted to localhost during development',
              code: 'LOCALHOST_ONLY',
            });
            return;
          }

          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || '';

          if (req.method === 'GET' && action === 'status') {
            sendJson(res, 200, await getMeshyStatus(PROJECT_ROOT));
            return;
          }

          if (req.method === 'POST' && action === 'login') {
            let body = {};
            try {
              body = JSON.parse(await readBody(req) || '{}');
            } catch {
              body = {};
            }
            sendJson(res, 200, await beginMeshyLogin({ device: body.device === true }));
            return;
          }

          if (req.method === 'POST' && action === 'logout') {
            let body = {};
            try {
              body = JSON.parse(await readBody(req) || '{}');
            } catch {
              body = {};
            }
            sendJson(res, 200, await beginMeshyLogout({ all: body.all === true }));
            return;
          }

          if (req.method === 'GET' && action === 'catalog') {
            sendJson(res, 200, {
              ok: true,
              geometryModels: GEOMETRY_MODELS,
              textureModels: TEXTURE_MODELS,
              preset: GAME_PROP_PRESET,
              defaults: createDefaultMeshyFormValues(),
            });
            return;
          }

          if (req.method === 'POST' && action === 'validate') {
            const body = JSON.parse(await readBody(req));
            const result = validateImageTo3dSettings(body?.settings || body || {});
            const textures = result.ok
              ? availableTextureModels({
                shouldTexture: result.settings.should_texture,
                enablePbr: result.settings.enable_pbr,
                textureResolution: result.settings.texture_resolution,
              })
              : [];
            sendJson(res, 200, { ...result, availableTextureModels: textures });
            return;
          }

          if (req.method === 'POST' && action === 'estimate-credits') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, estimateImageTo3dCredits(body?.settings || body || {}));
            return;
          }

          if (req.method === 'POST' && action === 'estimate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await createMeshyEstimate({
              settings: body.settings || {},
              imageDataUri: body.imageDataUri || null,
              imageStagingPath: body.imageStagingPath || null,
              provenance: body.provenance || null,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
            }));
            return;
          }

          if (req.method === 'POST' && action === 'generate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await approveAndGenerateMeshy({
              estimateId: body.estimateId,
              confirmSpend: body.confirmSpend === true,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
            }));
            return;
          }

          if (req.method === 'GET' && action === 'job') {
            const jobId = url.searchParams.get('jobId');
            const job = getMeshyJob(jobId);
            if (!job) {
              sendJson(res, 404, { ok: false, code: 'JOB_NOT_FOUND', error: 'Job not found' });
              return;
            }
            sendJson(res, 200, { ok: true, job: publicJob(job) });
            return;
          }

          if (req.method === 'POST' && action === 'poll') {
            const body = JSON.parse(await readBody(req));
            const result = await pollMeshyJob({
              jobId: body.jobId,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
            });
            sendJson(res, 200, {
              ok: true,
              job: publicJob(result.job),
              retryAfterSec: result.retryAfterSec,
            });
            return;
          }

          if (req.method === 'POST' && action === 'recover-jobs') {
            sendJson(res, 200, await recoverMeshyJobsFromDisk({
              stagingRoot: STAGING_ROOT,
              projectRoot: PROJECT_ROOT,
            }));
            return;
          }

          if (req.method === 'POST' && action === 'recover-job') {
            const body = JSON.parse(await readBody(req));
            const result = await recoverMeshyJob({
              jobId: body.jobId || null,
              taskId: body.taskId || null,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
              reconcileAmbiguous: body.reconcileAmbiguous === true,
            });
            sendJson(res, 200, {
              ok: true,
              job: publicJob(result.job),
              retryAfterSec: result.retryAfterSec,
            });
            return;
          }

          if (req.method === 'POST' && action === 'upload-reference') {
            const buf = await readBodyBufferLimited(req, DEFAULT_UPLOAD_LIMIT);
            const magic = detectImageMagic(buf);
            if (!magic) {
              sendJson(res, 400, {
                ok: false,
                code: 'INVALID_IMAGE',
                error: 'Reference must be PNG, JPEG, or WebP',
              });
              return;
            }
            const filename = url.searchParams.get('name') || `reference.${extensionForImageMagic(magic)}`;
            const saved = await saveReferenceImageToStaging({
              stagingRoot: STAGING_ROOT,
              buffer: buf,
              filename,
            });
            sendJson(res, 200, {
              ok: true,
              ...saved,
              previewUrl: `/api/meshy?action=staging-file&path=${encodeURIComponent(saved.relativePath)}`,
            });
            return;
          }

          if (req.method === 'GET' && action === 'staging-file') {
            const rel = url.searchParams.get('path') || '';
            const buf = await readMeshyStagingFile(STAGING_ROOT, rel);
            const ext = path.extname(rel).toLowerCase();
            const type = ext === '.glb'
              ? 'model/gltf-binary'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'image/png';
            res.statusCode = 200;
            res.setHeader('Content-Type', type);
            res.setHeader('Cache-Control', 'no-store');
            res.end(buf);
            return;
          }

          if (req.method === 'POST' && action === 'import-mesh') {
            const body = JSON.parse(await readBody(req));
            const jobId = body.jobId;
            const job = getMeshyJob(jobId);
            if (!job?.stagingGlbPath) {
              sendJson(res, 400, {
                ok: false,
                code: 'NO_MODEL',
                error: 'Job has no staged GLB — wait for success or recover the job',
              });
              return;
            }
            const abs = path.join(STAGING_ROOT, job.stagingGlbPath);
            const buf = await fs.readFile(abs);
            const valid = validateGlbBuffer(buf);
            if (!valid.ok) {
              sendJson(res, 400, { ok: false, code: 'INVALID_GLB', error: valid.error });
              return;
            }
            // Meshy exports are typically AABB-centered and undersized for characters.
            // Pivot feet to origin and bake ~1.75 m height when the mesh looks upright/humanoid.
            const normalized = normalizeMeshyImportGlb(buf);
            const assetName = String(body.name || 'Meshy Model').trim() || 'Meshy Model';
            const { importMeshBuffer } = await import('./assetFileApi.js');
            const result = await importMeshBuffer(normalized.buffer, {
              name: assetName,
              originalName: `${assetName}.glb`,
              tags: ['meshy', 'ai-generated'],
              meta: {
                meshyTaskId: job.taskId,
                meshyJobId: job.jobId,
                meshySettings: job.settings,
                meshyCliArgv: job.cliArgv || null,
                provenance: job.provenance || null,
                creditsEstimated: job.creditsEstimated,
                creditsConsumed: job.creditsConsumed,
                generatedAt: job.createdAt,
                pivot: normalized.pivot,
                pivotOffsetMeters: normalized.offset,
                importScale: normalized.scaleApplied,
                sourceHeightMeters: normalized.sourceHeightMeters,
                targetHeightMeters: normalized.targetHeightMeters,
                boundingBoxMeters: normalized.boundingBoxMeters,
                boundingBoxCenterMeters: normalized.boundingBoxCenterMeters,
                authoredHeightMeters: normalized.boundingBoxMeters?.y ?? null,
              },
            });
            job.importedAssetId = result?.asset?.id || null;
            job.importedAt = Date.now();
            await fs.writeFile(
              path.join(STAGING_ROOT, 'jobs', `${job.jobId}.json`),
              JSON.stringify(job, null, 2),
              'utf8',
            );
            sendJson(res, 200, {
              ok: true,
              asset: result.asset || result,
              job: publicJob(job),
            });
            return;
          }

          if (req.method === 'POST' && action === 'discard') {
            const body = JSON.parse(await readBody(req));
            const job = getMeshyJob(body.jobId);
            if (job) {
              job.phase = 'discarded';
              job.discardedAt = Date.now();
              // Keep importedAssetId — discard must not delete production assets.
              await fs.writeFile(
                path.join(STAGING_ROOT, 'jobs', `${job.jobId}.json`),
                JSON.stringify(job, null, 2),
                'utf8',
              );
            }
            sendJson(res, 200, { ok: true, job: job ? publicJob(job) : null });
            return;
          }

          if (req.method === 'GET' && action === 'texture-maps') {
            const taskId = url.searchParams.get('taskId') || '';
            const jobId = url.searchParams.get('jobId') || '';
            const job = jobId ? getMeshyJob(jobId) : null;
            const id = taskId || job?.taskId;
            if (!id) {
              sendJson(res, 400, {
                ok: false,
                code: 'TASK_REQUIRED',
                error: 'taskId or jobId required',
              });
              return;
            }
            sendJson(res, 200, await listStagingMeshyMaps(STAGING_ROOT, id));
            return;
          }

          if (req.method === 'POST' && action === 'fetch-texture-maps') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await fetchMeshyJobTextureMaps({
              jobId: body.jobId || null,
              taskId: body.taskId || null,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
            }));
            return;
          }

          if (req.method === 'POST' && action === 'import-texture-map') {
            const body = JSON.parse(await readBody(req));
            const job = body.jobId ? getMeshyJob(body.jobId) : null;
            const taskId = body.taskId || job?.taskId;
            const mapId = String(body.mapId || '');
            if (!taskId || !mapId) {
              sendJson(res, 400, {
                ok: false,
                code: 'MAP_REQUIRED',
                error: 'taskId/jobId and mapId are required',
              });
              return;
            }
            const resolved = await resolveMeshyMapFile({
              taskId,
              mapId,
              projectRoot: PROJECT_ROOT,
              stagingRoot: STAGING_ROOT,
            });
            const buf = await fs.readFile(resolved.map.localPath);
            const assetName = String(
              body.name || `${body.assetBaseName || 'Meshy'} ${resolved.map.label}`,
            ).trim();
            const { importTextureBuffer } = await import('./assetFileApi.js');
            const result = await importTextureBuffer(
              buf,
              resolved.map.fileName || `${mapId}.png`,
              {
                name: assetName,
                tags: ['meshy', 'pbr', mapId, 'ai-generated'],
              },
            );
            sendJson(res, 200, {
              ok: true,
              asset: result.asset || result,
              map: {
                ...resolved.map,
                meshyTaskId: taskId,
                meshyJobId: job?.jobId || null,
              },
            });
            return;
          }

          sendJson(res, 404, { ok: false, error: `Unknown action “${action}”` });
        } catch (err) {
          const status = err instanceof MeshyCliError
            ? mapErrorStatus(err.code)
            : 500;
          sendJson(res, status, {
            ok: false,
            error: err.message || String(err),
            code: err.code || 'MESHY_ERROR',
          });
        }
      });
    },
  };
}

function mapErrorStatus(code) {
  switch (code) {
    case 'CLI_MISSING':
    case 'NODE_TOO_OLD':
      return 503;
    case 'AUTH_FAILED':
      return 401;
    case 'INSUFFICIENT_CREDITS':
      return 402;
    case 'RATE_LIMITED':
      return 429;
    case 'APPROVAL_REQUIRED':
    case 'ESTIMATE_NOT_FOUND':
    case 'ESTIMATE_MISMATCH':
    case 'ALREADY_SPENT':
    case 'SPEND_RESERVED':
    case 'SPEND_AMBIGUOUS':
    case 'IMAGE_REQUIRED':
    case 'BAD_REQUEST':
    case 'INVALID_MODEL':
    case 'INVALID_IMAGE':
      return 400;
    case 'JOB_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;
    default:
      return 400;
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    taskId: job.taskId,
    estimateId: job.estimateId,
    phase: job.phase,
    status: job.status,
    progress: job.progress,
    settings: job.settings,
    creditsEstimated: job.creditsEstimated,
    creditsConsumed: job.creditsConsumed,
    provenance: job.provenance,
    thumbnailUrl: job.stagingThumbPath
      ? `/api/meshy?action=staging-file&path=${encodeURIComponent(job.stagingThumbPath)}`
      : job.thumbnailUrl || null,
    modelUrl: job.stagingGlbPath
      ? `/api/meshy?action=staging-file&path=${encodeURIComponent(job.stagingGlbPath)}`
      : null,
    glbBytes: job.glbBytes || null,
    textureUrls: job.textureUrls || null,
    importedAssetId: job.importedAssetId || null,
    error: job.error || null,
    code: job.code || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
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
