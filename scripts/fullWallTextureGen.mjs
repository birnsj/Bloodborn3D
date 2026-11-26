/**
 * Full Wall Texture production test — corrected region handoff.
 *
 * Crops a floor-to-ceiling wall region from mansion concept art, stages it as
 * the sole OpenArt --image reference, composes the Full Wall Texture template
 * prompt (tiling via checkboxes only), estimates, then optionally generates
 * once with confirmSpend:true. No automatic retries.
 *
 * Usage (dev server must be running):
 *   node scripts/fullWallTextureGen.mjs --verify
 *   node scripts/fullWallTextureGen.mjs --generate
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  assembleRegionTemplatePrompt,
  describeRegionCoords,
  getPromptTemplate,
} from '../src/editor/projectArt/promptTemplates.js';
import { composeGenerationPrompt } from '../src/editor/aiAssets/promptComposition.js';
import { regionToPixelRect } from '../src/editor/projectArt/cropRegionImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BB_DEV_URL || 'http://localhost:5178';
const TEMPLATE_ID = 'full_wall_texture';
const DEFAULT_REGION_TEMPLATE_ID = 'wall_texture';

function composeRegionHandoffPrompt({ templateId, region, itemTitle = '' }) {
  const assembled = assembleRegionTemplatePrompt({
    templateId,
    regionDescription: [
      region?.description,
      region ? describeRegionCoords(region) : '',
    ].filter(Boolean).join('; '),
    itemTitle,
    tileHorizontal: false,
    tileVertical: false,
    includeTiling: false,
    referenceTitles: [],
  });
  return {
    templateId,
    promptText: String(assembled.promptText || '').trim(),
  };
}

/** Full-height wall panel on the left of Master Bedroom (floor→ceiling wood). */
const SOURCE = {
  relativePath: 'Environments/Mansion/Concepts/Interiors/master_bedroom.png',
  title: 'Master Bedroom',
  folder: 'Environments/Mansion/Textures',
  // Normalized region: left wall elevation, floor to crown.
  region: {
    itemId: 'art_master_bedroom_wall',
    relativePath: 'Environments/Mansion/Concepts/Interiors/master_bedroom.png',
    title: 'Master Bedroom',
    x: 0.02,
    y: 0.08,
    width: 0.22,
    height: 0.78,
  },
};

function buildFinalPrompt(body) {
  return composeGenerationPrompt({
    prompt: body,
    tileHorizontal: true,
    tileVertical: false,
  });
}

async function api(action, { method = 'GET', body = null, query = {}, base = '/api/openart' } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`${BASE}${base}?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `${base} ${action} failed: ${res.status}`);
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

async function resolveSourceImage() {
  const abs = path.join(PROJECT_ROOT, 'project-art', SOURCE.relativePath);
  await fs.access(abs);
  return abs;
}

/** Crop via Windows System.Drawing (no extra npm deps). */
function cropWithPowerShell(srcAbs, outAbs, region) {
  // Probe natural size first via PowerShell.
  const probe = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${srcAbs.replace(/'/g, "''")}'); Write-Output ("{0} {1}" -f $i.Width, $i.Height); $i.Dispose()`,
  ], { encoding: 'utf8' });
  if (probe.status !== 0) {
    throw new Error(`Failed to probe image size: ${probe.stderr || probe.stdout}`);
  }
  const [nw, nh] = String(probe.stdout).trim().split(/\s+/).map(Number);
  if (!nw || !nh) throw new Error(`Bad image size from probe: ${probe.stdout}`);
  const { sx, sy, sw, sh } = regionToPixelRect(region, nw, nh);
  const ps = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${srcAbs.replace(/'/g, "''")}')
$rect = New-Object System.Drawing.Rectangle ${sx}, ${sy}, ${sw}, ${sh}
$crop = $src.Clone($rect, $src.PixelFormat)
$dir = Split-Path -Parent '${outAbs.replace(/'/g, "''")}'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$crop.Save('${outAbs.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$crop.Dispose(); $src.Dispose()
Write-Output "ok ${sx} ${sy} ${sw} ${sh} of ${nw}x${nh}"
`;
  const run = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`Crop failed: ${run.stderr || run.stdout}`);
  }
  return {
    naturalWidth: nw,
    naturalHeight: nh,
    pixel: { sx, sy, sw, sh },
    log: String(run.stdout).trim(),
  };
}

async function uploadCrop(cropAbs) {
  const buf = await fs.readFile(cropAbs);
  const qs = new URLSearchParams({
    action: 'upload-reference',
    name: path.basename(cropAbs),
  });
  const res = await fetch(`${BASE}/api/openart?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `upload-reference failed: ${res.status}`);
  }
  return data;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const verifyOnly = args.has('--verify') || args.has('--estimate-only');
  const doGenerate = args.has('--generate');
  if (!verifyOnly && !doGenerate) {
    console.log('Pass --verify (estimate only) or --generate (one paid image).');
    process.exit(1);
  }

  const tpl = getPromptTemplate(TEMPLATE_ID);
  if (!tpl) throw new Error(`Missing template ${TEMPLATE_ID}`);

  const composed = composeRegionHandoffPrompt({
    templateId: TEMPLATE_ID,
    region: SOURCE.region,
    itemTitle: SOURCE.title,
  });
  const finalPrompt = buildFinalPrompt(composed.promptText);

  const srcAbs = await resolveSourceImage();
  const cropAbs = path.join(
    PROJECT_ROOT,
    '.openart-staging',
    'full-wall-master-bedroom-crop.png',
  );
  const cropMeta = cropWithPowerShell(srcAbs, cropAbs, SOURCE.region);

  const status = await api('status');
  const uploaded = await uploadCrop(cropAbs);

  const estimate = await api('estimate', {
    method: 'POST',
    body: {
      prompt: finalPrompt,
      modelId: 'nano-banana-2',
      mode: 'image2image',
      aspectRatio: '1:1',
      resolution: '1K',
      imagePaths: [uploaded.absolutePath],
      formValues: {
        prompt: finalPrompt,
        aspectRatio: '1:1',
        resolution: '1K',
        imageCount: 1,
        autoEnhancePrompt: false,
      },
    },
  });

  const credits = estimate.totalCredits ?? estimate.estimate?.totalCredits;
  const estimateId = estimate.estimateId || estimate.estimate?.estimateId;

  const report = {
    templateId: TEMPLATE_ID,
    templateLabel: tpl.label,
    defaultRegionTemplate: DEFAULT_REGION_TEMPLATE_ID,
    source: SOURCE.relativePath,
    region: SOURCE.region,
    crop: {
      path: cropAbs,
      stagingId: uploaded.stagingId,
      absolutePath: uploaded.absolutePath,
      ...cropMeta,
    },
    mode: 'image2image',
    modelId: 'nano-banana-2',
    resolution: '1K',
    tileHorizontal: true,
    tileVertical: false,
    promptBody: composed.promptText,
    finalSubmittedPrompt: finalPrompt,
    estimateId,
    credits,
    creditsAvailable: status.account?.credits,
    conceptPromptCarried: /ORIGINAL|bedroom scene|victorian gothic bedroom/i.test(composed.promptText),
  };

  console.log('\n=== FULL WALL TEXTURE — PRE-SPEND VERIFICATION ===');
  console.log(JSON.stringify(report, null, 2));

  if (report.conceptPromptCarried) {
    throw new Error('ABORT: composed prompt still looks like a concept/bedroom prompt');
  }
  if (!String(finalPrompt).toLowerCase().includes('seamless horizontal tiling')) {
    throw new Error('ABORT: final prompt missing horizontal tiling sentence from checkboxes');
  }
  if (!uploaded.absolutePath || !uploaded.stagingId) {
    throw new Error('ABORT: cropped reference was not staged');
  }

  if (verifyOnly) {
    console.log('\nVerification OK — re-run with --generate to spend once.');
    return;
  }

  if ((Number(credits) || 0) > (status.account?.credits ?? 0)) {
    throw new Error(`Insufficient credits: need ${credits}, have ${status.account?.credits}`);
  }

  console.log(`\n→ Generating once (confirmSpend:true) estimate=${estimateId} credits=${credits}`);
  const gen = await api('generate', {
    method: 'POST',
    body: { estimateId, confirmSpend: true },
  });
  const jobId = gen.jobId || gen.job?.jobId;
  const generationId = gen.generationId || gen.job?.generationId;
  console.log(`  submitted job=${jobId} gen=${generationId}`);

  const waited = await api('wait', {
    method: 'POST',
    body: { jobId, generationId, timeout: '5m' },
  });
  if (waited.job?.status === 'failed') {
    throw new Error(waited.job.error || 'Generation failed (no auto-retry)');
  }

  const downloaded = await api('download', {
    method: 'POST',
    body: { jobId },
  });
  const stagingId = downloaded.staging?.stagingId;
  if (!stagingId) throw new Error('No staging result to save');

  const saved = await api('save-from-staging', {
    method: 'POST',
    base: '/api/project-art',
    body: {
      stagingId,
      folderPath: SOURCE.folder,
      title: 'full_wall_master_bedroom',
      itemIds: null,
      metadata: {
        generationPrompt: composed.promptText,
        originalGenerationPrompt: composed.promptText,
        tags: ['mansion', 'wall', 'full-wall-texture', 'tiling-h'],
        description: 'Full floor-to-ceiling wall texture from Master Bedroom region crop.',
      },
      provenance: {
        source: 'openart',
        provider: 'openart',
        modelId: 'nano-banana-2',
        mode: 'image2image',
        stagingId,
        jobId,
        generationId,
        formValues: {
          aspectRatio: '1:1',
          resolution: '1K',
          imageCount: 1,
          autoEnhancePrompt: false,
        },
        tileHorizontal: true,
        tileVertical: false,
        promptTemplateId: TEMPLATE_ID,
        assetCategory: TEMPLATE_ID,
        sourceRegion: {
          ...SOURCE.region,
          naturalWidth: cropMeta.naturalWidth,
          naturalHeight: cropMeta.naturalHeight,
        },
        sourceItemId: null,
        croppedReference: {
          stagingId: uploaded.stagingId,
          fileName: uploaded.fileName,
          originalName: uploaded.originalName,
          absolutePath: uploaded.absolutePath,
        },
        finalPrompt,
        savedAt: new Date().toISOString(),
      },
    },
  });

  // Import as gameplay texture + material for level apply.
  const imported = await api('import', {
    method: 'POST',
    body: {
      stagingId,
      createMaterial: true,
      textureName: 'Full Wall Master Bedroom',
      materialName: 'Full Wall Master Bedroom',
    },
  }).catch((err) => ({ error: err.message }));

  const after = await api('status');
  const done = {
    relativePath: saved.relativePath,
    itemId: saved.itemId,
    stagingId,
    jobId,
    generationId,
    credits,
    creditsAfter: after.account?.credits,
    imported,
    finalSubmittedPrompt: finalPrompt,
    templateId: TEMPLATE_ID,
    cropStagingId: uploaded.stagingId,
  };
  console.log('\n=== GENERATION COMPLETE (no retry) ===');
  console.log(JSON.stringify(done, null, 2));
}

main().catch((err) => {
  console.error('FAILED', err.message, err.data || '');
  process.exit(1);
});
