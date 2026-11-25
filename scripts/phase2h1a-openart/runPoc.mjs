#!/usr/bin/env node
/**
 * Phase 2H.1A — OpenArt end-to-end PoC (local Node).
 *
 * Default: detect → account → models → cost estimate → dry-run (NO spend).
 * Paid path: add `--approve-spend` once you have reviewed the estimate.
 *
 * Usage:
 *   node scripts/phase2h1a-openart/runPoc.mjs
 *   node scripts/phase2h1a-openart/runPoc.mjs --approve-spend
 *   node scripts/phase2h1a-openart/runPoc.mjs --approve-spend --prompt "..." --model nano-banana-2
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEstimate,
  approveAndGenerate,
  waitForJob,
  downloadJobToStaging,
  getOpenArtStatus,
  listOpenArtModels,
} from '../../src/dev/openart/openArtSession.js';
import { defaultStagingRoot } from '../../src/dev/openart/openArtCli.js';
import {
  importTextureBuffer,
  createMaterialAssetFromDefinition,
} from '../../vite-plugins/assetFileApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'results');

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const APPROVE = process.argv.includes('--approve-spend');
const PROMPT = argValue(
  '--prompt',
  'Seamless tileable ashlar stone wall albedo texture for a game, top-down orthographic, neutral lighting, no text, no watermark, PBR base color only',
);
const MODEL = argValue('--model', 'nano-banana-2');

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const report = {
    phase: '2H.1A',
    startedAt: new Date().toISOString(),
    approveSpend: APPROVE,
    steps: [],
  };

  const status = await getOpenArtStatus();
  report.steps.push({ name: 'status', ...status });
  if (!status.ok) {
    report.ok = false;
    report.error = status.error;
    await writeReport(report);
    console.error('[PoC] OpenArt unavailable:', status.code, status.error);
    process.exit(status.code === 'CLI_MISSING' ? 2 : 1);
  }
  console.log('[PoC] CLI', status.cli.version?.version || status.cli.version);
  console.log('[PoC] Account', status.account?.user?.email || '(ok)', 'credits=', status.account?.credits);

  const models = await listOpenArtModels();
  const imageModels = (models.models || []).filter((m) => m.modes?.image?.length);
  report.steps.push({ name: 'models', count: imageModels.length, sample: imageModels.slice(0, 5).map((m) => m.id) });
  console.log('[PoC] Image models available:', imageModels.length);

  const estimate = await createEstimate({ prompt: PROMPT, modelId: MODEL, mode: 'text2image' });
  report.steps.push({
    name: 'estimate',
    estimateId: estimate.estimateId,
    totalCredits: estimate.totalCredits,
    costConfig: estimate.costConfig,
    dryRun: estimate.dryRun,
  });
  console.log('[PoC] Estimate', estimate.totalCredits, 'credits for', MODEL, estimate.costConfig);
  console.log('[PoC] estimateId', estimate.estimateId);

  if (!APPROVE) {
    report.ok = true;
    report.stoppedBeforeSpend = true;
    report.message = 'Re-run with --approve-spend to submit the paid generation.';
    await writeReport(report);
    console.log('[PoC] Stopped before spend (pass --approve-spend to continue).');
    return;
  }

  const creditsBefore = status.account?.credits;
  const submitted = await approveAndGenerate({
    estimateId: estimate.estimateId,
    confirmSpend: true,
  });
  report.steps.push({ name: 'generate', ...submitted });
  console.log('[PoC] Submitted generation', submitted.generationId);

  const waited = await waitForJob({
    jobId: submitted.jobId,
    generationId: submitted.generationId,
    timeout: '5m',
  });
  report.steps.push({ name: 'wait', job: waited.job });
  console.log('[PoC] Status', waited.job.status, 'urls', waited.job.resultUrls?.length);

  const stagingRoot = defaultStagingRoot(ROOT);
  const downloaded = await downloadJobToStaging({
    jobId: submitted.jobId,
    stagingRoot,
  });
  report.steps.push({ name: 'download', staging: downloaded.staging });
  console.log('[PoC] Staged', downloaded.staging.absolutePath);

  const buf = await fs.readFile(downloaded.staging.absolutePath);
  const tex = await importTextureBuffer(buf, downloaded.staging.fileName, {
    name: 'OpenArt PoC Ashlar',
    tags: ['openart', 'phase2h1a', 'poc'],
  });
  const mat = await createMaterialAssetFromDefinition({
    name: 'OpenArt PoC Ashlar',
    baseColorMapId: tex.asset.id,
    baseColor: '#ffffff',
    roughness: 0.85,
    metalness: 0.02,
  });
  report.steps.push({
    name: 'import',
    textureId: tex.asset.id,
    texturePath: tex.asset.path,
    materialId: mat.asset.id,
  });
  console.log('[PoC] Imported texture', tex.asset.id, 'material', mat.asset.id);

  const statusAfter = await getOpenArtStatus();
  report.steps.push({
    name: 'creditsAfter',
    before: creditsBefore,
    after: statusAfter.account?.credits ?? null,
    delta: (creditsBefore != null && statusAfter.account?.credits != null)
      ? statusAfter.account.credits - creditsBefore
      : null,
  });

  report.ok = true;
  report.finishedAt = new Date().toISOString();
  report.workflow = {
    prompt: PROMPT,
    model: MODEL,
    estimateCredits: estimate.totalCredits,
    generationId: submitted.generationId,
    textureId: tex.asset.id,
    materialId: mat.asset.id,
    previewPath: `/assets/${tex.asset.path}`,
  };
  await writeReport(report);
  console.log('[PoC] Complete. Report:', path.join(OUT, 'poc-report.json'));
}

async function writeReport(report) {
  report.finishedAt = report.finishedAt || new Date().toISOString();
  await fs.writeFile(path.join(OUT, 'poc-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

main().catch(async (err) => {
  const report = {
    phase: '2H.1A',
    ok: false,
    error: err.message,
    code: err.code || null,
    finishedAt: new Date().toISOString(),
  };
  await fs.mkdir(OUT, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(OUT, 'poc-report.json'), `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
  console.error('[PoC] FAILED', err.code || '', err.message);
  process.exit(1);
});
