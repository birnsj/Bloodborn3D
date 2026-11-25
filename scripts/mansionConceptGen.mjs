/**
 * Gothic mansion concept generation — uses live /api/openart + /api/project-art.
 * Estimate-first; each paid generate requires confirmSpend:true.
 *
 * Usage:
 *   node scripts/mansionConceptGen.mjs --estimate-only
 *   node scripts/mansionConceptGen.mjs --generate
 */
const BASE = process.env.BB_DEV_URL || 'http://localhost:5178';

const ART_DIRECTION = [
  'Imposing late Victorian Gothic estate, BloodBound mansion art direction.',
  'Aged dark limestone masonry, intricate carved dark oak woodwork, pointed Gothic arches,',
  'vaulted ceilings, ornate architectural moldings, antique Victorian furnishings,',
  'wrought iron fixtures, rich muted fabrics, atmospheric cinematic lighting,',
  'subtle age decay and neglect. Realistic, elegant, oppressive, mysterious.',
  'Believable architecture and consistent materials — not exaggerated fantasy.',
  'No text, labels, watermarks, borders, UI, collage, or contact sheet.',
].join(' ');

const JOBS = [
  {
    id: 'grand_hall',
    fileBase: 'grand_hall',
    title: 'Grand Hall',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'grand-hall', 'gothic', 'staircase'],
    subject: 'A grand entrance hall with a sweeping staircase, carved stone columns, pointed arches, ornate railings, patterned stone flooring and a high vaulted ceiling. Wide establishing interior view.',
    useGrandHallRef: false,
    first: true,
  },
  {
    id: 'mansion_exterior',
    fileBase: 'mansion_exterior',
    title: 'Mansion Exterior',
    folder: 'Environments/Mansion/Concepts/Exterior',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'exterior', 'gothic', 'estate'],
    subject: 'An imposing Victorian Gothic mansion exterior with dark limestone facades, pointed windows, an ornate entrance, steep roofs, weathered masonry and an overgrown estate. Full facade establishing shot.',
    useGrandHallRef: true,
  },
  {
    id: 'library',
    fileBase: 'library',
    title: 'Library',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'library', 'books'],
    subject: 'A two-story Gothic library with dark carved wooden bookcases, balconies, ladders, an elaborate fireplace and antique reading furniture. Same mansion material language as the grand hall.',
    useGrandHallRef: true,
  },
  {
    id: 'dining_room',
    fileBase: 'dining_room',
    title: 'Dining Room',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'dining'],
    subject: 'A formal Victorian dining room with a long wooden table, ornate wall paneling, Gothic windows, chandeliers and decorative architectural details. Same mansion as the grand hall.',
    useGrandHallRef: true,
  },
  {
    id: 'corridor',
    fileBase: 'corridor',
    title: 'Corridor',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'corridor', 'arches'],
    subject: 'A long mansion corridor with repeating Gothic arches, aged limestone walls, dark wooden doors, wall-mounted lighting fixtures and patterned flooring. Same estate architecture.',
    useGrandHallRef: true,
  },
  {
    id: 'master_bedroom',
    fileBase: 'master_bedroom',
    title: 'Master Bedroom',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'bedroom'],
    subject: 'An elaborate Victorian bedroom with antique furniture, a carved four-poster bed, rich fabrics, dark wood paneling and an ornate fireplace. Same mansion interiors language.',
    useGrandHallRef: true,
  },
  {
    id: 'basement',
    fileBase: 'basement',
    title: 'Basement',
    folder: 'Environments/Mansion/Concepts/Interiors',
    aspectRatio: '16:9',
    category: 'environment_concept',
    tags: ['mansion', 'interior', 'basement', 'cellar'],
    subject: 'An underground stone cellar with vaulted ceilings, rough limestone masonry, structural arches, damp surfaces and restrained environmental decay beneath the Gothic mansion.',
    useGrandHallRef: true,
  },
  {
    id: 'architectural_details',
    fileBase: 'architectural_details',
    title: 'Architectural Details',
    folder: 'Environments/Mansion/References/Architecture',
    aspectRatio: '1:1',
    category: 'architectural_element',
    tags: ['mansion', 'reference', 'architecture', 'stonework'],
    subject: 'Close-up architectural concept emphasizing Gothic stone arches, carved columns, capitals, moldings, window surrounds and ornamental stonework consistent with the mansion interiors. Detail study, not a full room.',
    useGrandHallRef: true,
  },
  {
    id: 'material_reference',
    fileBase: 'material_reference',
    title: 'Material Reference',
    folder: 'Environments/Mansion/References/Materials',
    aspectRatio: '1:1',
    category: 'wall_texture',
    tags: ['mansion', 'reference', 'materials', 'limestone', 'oak'],
    subject: 'Close-up environmental material study emphasizing aged limestone, dark carved oak, worn stone flooring, wrought iron and restrained decorative metalwork from the Gothic mansion. Material board presentation.',
    useGrandHallRef: true,
  },
  {
    id: 'furniture_reference',
    fileBase: 'furniture_reference',
    title: 'Furniture Reference',
    folder: 'Environments/Mansion/References/Furniture',
    aspectRatio: '1:1',
    category: 'furniture',
    tags: ['mansion', 'reference', 'furniture', 'victorian'],
    subject: 'Victorian Gothic furnishing study featuring antique cabinets, chairs, tables, bookshelves and decorative objects consistent with the mansion visual direction. Furniture concept sheet without text.',
    useGrandHallRef: true,
  },
];

function buildPrompt(job) {
  return `${ART_DIRECTION} Subject: ${job.subject}`;
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

async function estimateJob(job, imagePaths = null) {
  const prompt = buildPrompt(job);
  const mode = imagePaths?.length ? 'image2image' : 'text2image';
  const estimate = await api('estimate', {
    method: 'POST',
    body: {
      prompt,
      modelId: 'nano-banana-2',
      mode,
      aspectRatio: job.aspectRatio,
      resolution: '1K',
      imagePaths: imagePaths || null,
      formValues: {
        prompt,
        aspectRatio: job.aspectRatio,
        resolution: '1K',
        imageCount: 1,
        autoEnhancePrompt: false,
      },
    },
  });
  return { prompt, mode, estimate };
}

async function generateAndSave(job, { referenceAbsPath = null } = {}) {
  const imagePaths = referenceAbsPath ? [referenceAbsPath] : null;
  const { prompt, mode, estimate } = await estimateJob(job, imagePaths);
  const credits = estimate.totalCredits ?? estimate.estimate?.totalCredits;
  console.log(`\n→ ${job.title}: estimate ${credits} credits (${mode})`);

  const gen = await api('generate', {
    method: 'POST',
    body: {
      estimateId: estimate.estimateId || estimate.estimate?.estimateId,
      confirmSpend: true,
    },
  });
  console.log(`  submitted job=${gen.jobId || gen.job?.jobId} gen=${gen.generationId || gen.job?.generationId}`);

  const waited = await api('wait', {
    method: 'POST',
    body: {
      jobId: gen.jobId || gen.job?.jobId,
      generationId: gen.generationId || gen.job?.generationId,
      timeout: '5m',
    },
  });
  if (waited.job?.status === 'failed') {
    throw new Error(waited.job.error || `Generation failed for ${job.id}`);
  }

  const downloaded = await api('download', {
    method: 'POST',
    body: { jobId: gen.jobId || gen.job?.jobId },
  });
  const stagingId = downloaded.staging?.stagingId;
  if (!stagingId) throw new Error(`No staging for ${job.id}`);

  const saved = await api('save-from-staging', {
    method: 'POST',
    base: '/api/project-art',
    body: {
      stagingId,
      folderPath: job.folder,
      title: job.fileBase,
      itemIds: null,
      metadata: {
        generationPrompt: prompt,
        originalGenerationPrompt: prompt,
        tags: job.tags,
        description: job.subject,
      },
      provenance: {
        source: 'openart',
        provider: 'openart',
        modelId: 'nano-banana-2',
        mode,
        stagingId,
        jobId: gen.jobId || gen.job?.jobId || null,
        generationId: gen.generationId || gen.job?.generationId || null,
        formValues: {
          aspectRatio: job.aspectRatio,
          resolution: '1K',
          imageCount: 1,
          autoEnhancePrompt: false,
        },
        tileHorizontal: false,
        tileVertical: false,
        assetCategory: job.category,
        finalPrompt: prompt,
        savedAt: new Date().toISOString(),
      },
    },
  });

  console.log(`  saved ${saved.relativePath} (${saved.itemId}) credits=${credits}`);
  return {
    job,
    prompt,
    mode,
    credits: Number(credits) || 0,
    estimateId: estimate.estimateId || estimate.estimate?.estimateId,
    stagingId,
    itemId: saved.itemId,
    relativePath: saved.relativePath,
    jobId: gen.jobId || gen.job?.jobId,
    generationId: gen.generationId || gen.job?.generationId,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const estimateOnly = args.has('--estimate-only');
  const doGenerate = args.has('--generate');

  if (!estimateOnly && !doGenerate) {
    console.log('Pass --estimate-only or --generate');
    process.exit(1);
  }

  const status = await api('status');
  console.log(`OpenArt credits available: ${status.account?.credits}`);
  console.log(`Project art root: project-art/ (via ${BASE})`);

  // Estimate pass (text2image, no refs) for total cost preview.
  const estimates = [];
  for (const job of JOBS) {
    const { prompt, estimate } = await estimateJob(job, null);
    const credits = Number(estimate.totalCredits ?? estimate.estimate?.totalCredits ?? 0);
    estimates.push({ id: job.id, title: job.title, credits, estimateId: estimate.estimateId, prompt });
    console.log(`estimate ${job.id}: ${credits} credits`);
  }
  const total = estimates.reduce((s, e) => s + e.credits, 0);
  console.log(`\n=== ESTIMATED TOTAL (text2image, no refs): ${total} credits for ${JOBS.length} images ===`);
  console.log('(image2image with Grand Hall reference may differ slightly per subsequent shot)');

  if (estimateOnly) {
    console.log(JSON.stringify({ total, estimates, creditsAvailable: status.account?.credits }, null, 2));
    return;
  }

  if (total > (status.account?.credits ?? 0)) {
    throw new Error(`Insufficient credits: need ~${total}, have ${status.account?.credits}`);
  }

  const results = [];
  // Grand Hall first (no reference).
  const grand = JOBS.find((j) => j.first);
  const grandResult = await generateAndSave(grand);
  results.push(grandResult);

  // Resolve absolute path for Grand Hall staging/file to use as visual reference.
  // Prefer re-staging the saved project-art image via stage-references.
  const stagedRef = await api('stage-references', {
    method: 'POST',
    base: '/api/project-art',
    body: { itemIds: [grandResult.itemId], maxRefs: 1 },
  });
  const refAbs = stagedRef.staged?.[0]?.absolutePath || null;
  console.log(`Grand Hall reference staged: ${refAbs || '(none — falling back to text2image)'}`);

  for (const job of JOBS.filter((j) => !j.first)) {
    const result = await generateAndSave(job, {
      referenceAbsPath: job.useGrandHallRef ? refAbs : null,
    });
    // Link grand hall as reference association.
    if (refAbs && result.itemId) {
      await api('item-update', {
        method: 'POST',
        base: '/api/project-art',
        body: {
          id: result.itemId,
          patch: {
            provenance: {
              referenceItemIds: [grandResult.itemId],
            },
          },
        },
      }).catch(() => {});
    }
    results.push(result);
  }

  const spent = results.reduce((s, r) => s + r.credits, 0);
  const after = await api('status');

  // Collection: Mansion — Art Direction
  const col = await api('collection-create', {
    method: 'POST',
    base: '/api/project-art',
    body: {
      name: 'Mansion — Art Direction',
      itemIds: results.map((r) => r.itemId),
    },
  });

  const report = {
    projectArtRoot: 'D:/Bloodbound3D/project-art',
    estimatedTotalText2Image: total,
    creditsSpentSumOfEstimates: spent,
    creditsBefore: status.account?.credits,
    creditsAfter: after.account?.credits,
    creditsConsumedObserved: (status.account?.credits ?? 0) - (after.account?.credits ?? 0),
    collectionId: col.collectionId || col.collection?.id,
    files: results.map((r) => ({
      file: r.relativePath,
      itemId: r.itemId,
      title: r.job.title,
      credits: r.credits,
      mode: r.mode,
      generationId: r.generationId,
    })),
  };
  console.log('\n=== DONE ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('FAILED', err.message, err.data || '');
  process.exit(1);
});
