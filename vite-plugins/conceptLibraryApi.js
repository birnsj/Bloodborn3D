/**
 * Phase 2H.1D — Dev-only Concept Library API (`apply: 'serve'`).
 * Authoritative DB: concept-library/library.json + concept-library/images/
 * Concept images are NOT registered in the gameplay AssetRegistry.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  CONCEPT_LIBRARY_SCHEMA_VERSION,
  MAX_CONCEPTS_PER_AREA,
  conceptImageRelativePath,
  createArea,
  createConcept,
  createEmptyLibrary,
  createPrompt,
  normalizeLibrary,
} from '../src/editor/conceptLibrary/schema.js';
import { analyzeConceptImage, getVisionCapability } from '../src/editor/conceptLibrary/visionProvider.js';
import { defaultStagingRoot } from '../src/dev/openart/openArtCli.js';
import { readStagingFile } from '../src/dev/openart/openArtSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LIBRARY_ROOT = path.join(PROJECT_ROOT, 'concept-library');
const LIBRARY_JSON = path.join(LIBRARY_ROOT, 'library.json');
const IMAGES_ROOT = path.join(LIBRARY_ROOT, 'images');
const STAGING_ROOT = defaultStagingRoot(PROJECT_ROOT);

export function conceptLibraryApiPlugin() {
  return {
    name: 'bloodbound-concept-library-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/concept-library', async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || '';

          if (req.method === 'GET' && action === 'get') {
            sendJson(res, 200, { ok: true, library: await loadLibrary() });
            return;
          }

          if (req.method === 'GET' && action === 'vision-capability') {
            sendJson(res, 200, { ok: true, capability: getVisionCapability() });
            return;
          }

          if (req.method === 'GET' && action === 'image') {
            const imagePath = url.searchParams.get('path');
            await serveImage(res, imagePath);
            return;
          }

          if (req.method === 'POST' && action === 'area-create') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await createAreaAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'area-update') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await updateAreaAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'area-duplicate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await duplicateAreaAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'area-delete') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await deleteAreaAction(body));
            return;
          }

          if (req.method === 'POST' && action === 'concept-import') {
            await importConceptAction(req, res, url);
            return;
          }
          if (req.method === 'POST' && action === 'concept-from-staging') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await conceptFromStagingAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'concept-update') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await updateConceptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'concept-delete') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await deleteConceptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'concept-reorder') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await reorderConceptsAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'concept-set-primary') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await setPrimaryConceptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'concept-analyze') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await analyzeConceptAction(body));
            return;
          }

          if (req.method === 'POST' && action === 'prompt-create') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await createPromptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'prompt-update') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await updatePromptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'prompt-duplicate') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await duplicatePromptAction(body));
            return;
          }
          if (req.method === 'POST' && action === 'prompt-delete') {
            const body = JSON.parse(await readBody(req));
            sendJson(res, 200, await deletePromptAction(body));
            return;
          }

          sendJson(res, 405, { ok: false, error: 'Method or action not allowed', action });
        } catch (err) {
          const code = err.code === 'CONCEPT_LIMIT' ? 409
            : err.code === 'NOT_FOUND' ? 404
              : err.code === 'INVALID' ? 400
                : 500;
          sendJson(res, code, {
            ok: false,
            error: String(err.message || err),
            code: err.code || 'CONCEPT_LIBRARY_ERROR',
          });
        }
      });
    },
  };
}

async function loadLibrary() {
  await fs.mkdir(LIBRARY_ROOT, { recursive: true });
  await fs.mkdir(IMAGES_ROOT, { recursive: true });
  try {
    const raw = JSON.parse(await fs.readFile(LIBRARY_JSON, 'utf8'));
    return normalizeLibrary(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const empty = createEmptyLibrary();
      await saveLibrary(empty);
      return empty;
    }
    throw err;
  }
}

async function saveLibrary(library) {
  const normalized = normalizeLibrary(library);
  normalized.schemaVersion = CONCEPT_LIBRARY_SCHEMA_VERSION;
  normalized.updatedAt = new Date().toISOString();
  await fs.mkdir(LIBRARY_ROOT, { recursive: true });
  const tmp = `${LIBRARY_JSON}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, LIBRARY_JSON);
  return normalized;
}

function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

async function createAreaAction({ name, description, artDirection } = {}) {
  const library = await loadLibrary();
  const area = createArea({
    id: newId('area'),
    name,
    description,
    artDirection,
  });
  library.areas.push(area);
  const next = await saveLibrary(library);
  return { ok: true, library: next, areaId: area.id };
}

async function updateAreaAction({ areaId, patch } = {}) {
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  if (patch?.name != null) area.name = String(patch.name).trim() || area.name;
  if (patch?.description != null) area.description = String(patch.description);
  if (patch?.artDirection != null) area.artDirection = String(patch.artDirection);
  area.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function duplicateAreaAction({ areaId } = {}) {
  const library = await loadLibrary();
  const source = library.areas.find((a) => a.id === areaId);
  if (!source) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  const newAreaId = newId('area');
  const area = createArea({
    id: newAreaId,
    name: `${source.name} Copy`,
    description: source.description,
    artDirection: source.artDirection,
  });
  const idMap = new Map();
  for (const conceptId of source.conceptOrder) {
    if (area.conceptOrder.length >= MAX_CONCEPTS_PER_AREA) break;
    const src = library.concepts.find((c) => c.id === conceptId);
    if (!src) continue;
    const newConceptId = newId('concept');
    idMap.set(conceptId, newConceptId);
    let imagePath = '';
    if (src.imagePath) {
      try {
        const buf = await readConceptImageBuffer(src.imagePath);
        const ext = path.extname(src.imagePath) || '.png';
        imagePath = await writeConceptImage(newAreaId, newConceptId, ext, buf);
      } catch {
        imagePath = '';
      }
    }
    const concept = createConcept({
      ...src,
      id: newConceptId,
      areaId: newAreaId,
      title: `${src.title} Copy`,
      imagePath,
      associatedPromptIds: [],
      generatedAssetRefs: [...(src.generatedAssetRefs || [])],
    });
    library.concepts.push(concept);
    area.conceptOrder.push(newConceptId);
  }
  if (source.primaryConceptId && idMap.has(source.primaryConceptId)) {
    area.primaryConceptId = idMap.get(source.primaryConceptId);
  } else {
    area.primaryConceptId = area.conceptOrder[0] || null;
  }
  library.areas.push(area);
  const next = await saveLibrary(library);
  return { ok: true, library: next, areaId: newAreaId };
}

async function deleteAreaAction({ areaId } = {}) {
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  // Only delete concept-library images — never touch public/assets textures/materials.
  for (const concept of library.concepts.filter((c) => c.areaId === areaId)) {
    await deleteConceptImageFile(concept.imagePath);
  }
  library.concepts = library.concepts.filter((c) => c.areaId !== areaId);
  library.prompts = library.prompts.filter((p) => p.areaId !== areaId);
  library.areas = library.areas.filter((a) => a.id !== areaId);
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function importConceptAction(req, res, url) {
  const areaId = url.searchParams.get('areaId');
  const title = url.searchParams.get('title') || 'Imported concept';
  const originalName = path.basename(url.searchParams.get('name') || 'concept.png');
  const ext = path.extname(originalName).toLowerCase() || '.png';
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
    sendJson(res, 400, { ok: false, error: `Unsupported image type: ${ext}`, code: 'INVALID' });
    return;
  }
  const buffer = await readBodyBuffer(req);
  if (!buffer.length) {
    sendJson(res, 400, { ok: false, error: 'Empty upload', code: 'INVALID' });
    return;
  }
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  if (area.conceptOrder.length >= MAX_CONCEPTS_PER_AREA) {
    fail('CONCEPT_LIMIT', `Area already has ${MAX_CONCEPTS_PER_AREA} concepts`);
  }
  const conceptId = newId('concept');
  const imagePath = await writeConceptImage(areaId, conceptId, ext, buffer);
  const concept = createConcept({
    id: conceptId,
    areaId,
    title,
    imagePath,
  });
  library.concepts.push(concept);
  area.conceptOrder.push(conceptId);
  if (!area.primaryConceptId) area.primaryConceptId = conceptId;
  area.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  sendJson(res, 200, { ok: true, library: next, conceptId });
}

async function conceptFromStagingAction({
  areaId,
  stagingId,
  title = 'Generated concept',
  generationPrompt = '',
  provenance = null,
  metadata = null,
} = {}) {
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  if (area.conceptOrder.length >= MAX_CONCEPTS_PER_AREA) {
    fail('CONCEPT_LIMIT', `Area already has ${MAX_CONCEPTS_PER_AREA} concepts`);
  }
  const { meta, absolutePath } = await readStagingFile(stagingId, { stagingRoot: STAGING_ROOT });
  const buf = await fs.readFile(absolutePath);
  const ext = path.extname(meta.fileName || absolutePath) || '.png';
  const conceptId = newId('concept');
  const imagePath = await writeConceptImage(areaId, conceptId, ext, buf);
  const concept = createConcept({
    id: conceptId,
    areaId,
    title,
    imagePath,
    generationPrompt,
    description: metadata?.description || '',
    architecturalStyle: metadata?.architecturalStyle || '',
    materials: metadata?.materials || '',
    colorPalette: metadata?.colorPalette || '',
    lighting: metadata?.lighting || '',
    atmosphere: metadata?.atmosphere || '',
    distinctiveElements: metadata?.distinctiveElements || '',
    tags: metadata?.tags || [],
    provenance: provenance || {
      source: 'openart',
      stagingId,
      savedAt: new Date().toISOString(),
    },
  });
  library.concepts.push(concept);
  area.conceptOrder.push(conceptId);
  if (!area.primaryConceptId) area.primaryConceptId = conceptId;
  area.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next, conceptId };
}

async function updateConceptAction({ conceptId, patch } = {}) {
  const library = await loadLibrary();
  const concept = library.concepts.find((c) => c.id === conceptId);
  if (!concept) fail('NOT_FOUND', `Unknown concept: ${conceptId}`);
  const editable = [
    'title', 'description', 'generationPrompt', 'architecturalStyle', 'materials',
    'colorPalette', 'lighting', 'atmosphere', 'distinctiveElements',
  ];
  for (const key of editable) {
    if (patch?.[key] != null) concept[key] = String(patch[key]);
  }
  if (Array.isArray(patch?.tags)) concept.tags = patch.tags.map(String);
  if (Array.isArray(patch?.associatedPromptIds)) {
    concept.associatedPromptIds = patch.associatedPromptIds.map(String);
  }
  if (Array.isArray(patch?.generatedAssetRefs)) {
    concept.generatedAssetRefs = patch.generatedAssetRefs;
  }
  // Never auto-clobber provenance unless explicitly patched.
  if (patch?.provenance && typeof patch.provenance === 'object') {
    concept.provenance = { ...concept.provenance, ...patch.provenance };
  }
  concept.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function deleteConceptAction({ conceptId } = {}) {
  const library = await loadLibrary();
  const concept = library.concepts.find((c) => c.id === conceptId);
  if (!concept) fail('NOT_FOUND', `Unknown concept: ${conceptId}`);
  await deleteConceptImageFile(concept.imagePath);
  library.concepts = library.concepts.filter((c) => c.id !== conceptId);
  for (const area of library.areas) {
    area.conceptOrder = area.conceptOrder.filter((id) => id !== conceptId);
    if (area.primaryConceptId === conceptId) {
      area.primaryConceptId = area.conceptOrder[0] || null;
    }
  }
  for (const prompt of library.prompts) {
    prompt.conceptIds = prompt.conceptIds.filter((id) => id !== conceptId);
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function reorderConceptsAction({ areaId, conceptOrder } = {}) {
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  if (!Array.isArray(conceptOrder)) fail('INVALID', 'conceptOrder must be an array');
  const allowed = new Set(library.concepts.filter((c) => c.areaId === areaId).map((c) => c.id));
  const nextOrder = [];
  for (const id of conceptOrder) {
    if (!allowed.has(id) || nextOrder.includes(id)) continue;
    nextOrder.push(id);
  }
  for (const id of allowed) {
    if (!nextOrder.includes(id)) nextOrder.push(id);
  }
  area.conceptOrder = nextOrder.slice(0, MAX_CONCEPTS_PER_AREA);
  area.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function setPrimaryConceptAction({ areaId, conceptId } = {}) {
  const library = await loadLibrary();
  const area = library.areas.find((a) => a.id === areaId);
  if (!area) fail('NOT_FOUND', `Unknown area: ${areaId}`);
  if (!area.conceptOrder.includes(conceptId)) {
    fail('INVALID', 'Concept is not in this area');
  }
  area.primaryConceptId = conceptId;
  area.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function analyzeConceptAction({ conceptId } = {}) {
  const library = await loadLibrary();
  const concept = library.concepts.find((c) => c.id === conceptId);
  if (!concept) fail('NOT_FOUND', `Unknown concept: ${conceptId}`);
  const absolutePath = concept.imagePath
    ? resolveSafeImagePath(concept.imagePath)
    : null;
  const result = await analyzeConceptImage({
    conceptId,
    imagePath: concept.imagePath,
    absolutePath,
  });
  return {
    ok: result.ok,
    code: result.code,
    error: result.error,
    capability: getVisionCapability(),
    suggestions: result.suggestions,
    // Caller must apply suggestions via concept-update; never auto-write here.
    library,
  };
}

async function createPromptAction(body = {}) {
  const library = await loadLibrary();
  if (body.areaId && !library.areas.some((a) => a.id === body.areaId)) {
    fail('NOT_FOUND', `Unknown area: ${body.areaId}`);
  }
  const prompt = createPrompt({ ...body, id: newId('prompt') });
  library.prompts.push(prompt);
  if (Array.isArray(body.conceptIds)) {
    for (const conceptId of body.conceptIds) {
      const concept = library.concepts.find((c) => c.id === conceptId);
      if (concept && !concept.associatedPromptIds.includes(prompt.id)) {
        concept.associatedPromptIds.push(prompt.id);
      }
    }
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next, promptId: prompt.id };
}

async function updatePromptAction({ promptId, patch } = {}) {
  const library = await loadLibrary();
  const prompt = library.prompts.find((p) => p.id === promptId);
  if (!prompt) fail('NOT_FOUND', `Unknown prompt: ${promptId}`);
  const fields = [
    'name', 'category', 'promptText', 'negativePrompt',
    'preferredProvider', 'preferredModel', 'areaId',
  ];
  for (const key of fields) {
    if (patch?.[key] != null) prompt[key] = patch[key];
  }
  if (patch?.generationParams && typeof patch.generationParams === 'object') {
    prompt.generationParams = { ...patch.generationParams };
  }
  if (Array.isArray(patch?.tags)) prompt.tags = patch.tags.map(String);
  if (Array.isArray(patch?.conceptIds)) prompt.conceptIds = patch.conceptIds.map(String);
  prompt.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function duplicatePromptAction({ promptId } = {}) {
  const library = await loadLibrary();
  const source = library.prompts.find((p) => p.id === promptId);
  if (!source) fail('NOT_FOUND', `Unknown prompt: ${promptId}`);
  const prompt = createPrompt({
    ...source,
    id: newId('prompt'),
    name: `${source.name} Copy`,
  });
  library.prompts.push(prompt);
  const next = await saveLibrary(library);
  return { ok: true, library: next, promptId: prompt.id };
}

async function deletePromptAction({ promptId } = {}) {
  const library = await loadLibrary();
  if (!library.prompts.some((p) => p.id === promptId)) {
    fail('NOT_FOUND', `Unknown prompt: ${promptId}`);
  }
  library.prompts = library.prompts.filter((p) => p.id !== promptId);
  for (const concept of library.concepts) {
    concept.associatedPromptIds = concept.associatedPromptIds.filter((id) => id !== promptId);
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function writeConceptImage(areaId, conceptId, ext, buffer) {
  const rel = conceptImageRelativePath(areaId, conceptId, ext);
  const abs = resolveSafeImagePath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel;
}

async function readConceptImageBuffer(relPath) {
  const abs = resolveSafeImagePath(relPath);
  return fs.readFile(abs);
}

async function deleteConceptImageFile(relPath) {
  if (!relPath) return;
  try {
    const abs = resolveSafeImagePath(relPath);
    await fs.unlink(abs);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'INVALID') {
      // Ignore missing files; surface path traversal as soft skip.
    }
  }
}

function resolveSafeImagePath(relPath) {
  if (!relPath || typeof relPath !== 'string') fail('INVALID', 'Missing image path');
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/') || !normalized.startsWith('images/')) {
    fail('INVALID', 'Invalid concept image path');
  }
  const abs = path.resolve(LIBRARY_ROOT, normalized);
  if (!abs.startsWith(IMAGES_ROOT)) fail('INVALID', 'Path traversal rejected');
  return abs;
}

async function serveImage(res, relPath) {
  const abs = resolveSafeImagePath(relPath);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
        : 'image/png';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return readBodyBuffer(req).then((buf) => buf.toString('utf8'));
}

function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
