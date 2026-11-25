/**
 * Dev-only Project Art Library API (`apply: 'serve'`).
 * Filesystem browser root: project-art/  Metadata: project-art/.bb-art/library.json
 * Concept images stay out of gameplay AssetRegistry.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  DEFAULT_FOLDER_TREE,
  IMAGE_EXTENSIONS,
  PROJECT_ART_SCHEMA_VERSION,
  createArtItem,
  createArtPrompt,
  createCollection,
  createEmptyLibrary,
  createReferenceSet,
  isImagePath,
  migrateConceptLibraryToProjectArt,
  normalizeAssetRefs,
  normalizeLibrary,
  sanitizePathSegment,
  toPosixPath,
} from '../src/editor/projectArt/schema.js';
import {
  analyzeAssetPromptRequest,
  composeTemplateAssetPrompt,
  getVisionCapability,
} from '../src/editor/projectArt/visionProvider.js';
import { defaultStagingRoot } from '../src/dev/openart/openArtCli.js';
import { readStagingFile } from '../src/dev/openart/openArtSession.js';
import {
  DEFAULT_JSON_BODY_LIMIT,
  DEFAULT_UPLOAD_LIMIT,
  atomicWriteJson,
  createAsyncMutex,
  detectImageMagic,
  extensionForImageMagic,
  readBodyBufferLimited,
  readBodyLimited,
  resolveContainedPath,
} from './fsSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ART_ROOT = path.join(PROJECT_ROOT, 'project-art');
const META_DIR = path.join(ART_ROOT, '.bb-art');
const LIBRARY_JSON = path.join(META_DIR, 'library.json');
const THUMBS_DIR = path.join(META_DIR, 'thumbs');
const CONCEPT_LIBRARY_ROOT = path.join(PROJECT_ROOT, 'concept-library');
const CONCEPT_LIBRARY_JSON = path.join(CONCEPT_LIBRARY_ROOT, 'library.json');
const STAGING_ROOT = defaultStagingRoot(PROJECT_ROOT);
const withLibraryLock = createAsyncMutex();

const BB_ART_SEGMENT = '.bb-art';

export function projectArtApiPlugin() {
  return {
    name: 'bloodbound-project-art-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/project-art', async (req, res) => {
        await withLibraryLock(async () => {
          try {
            const url = new URL(req.url || '/', 'http://localhost');
            const action = url.searchParams.get('action') || '';

            if (req.method === 'GET' && action === 'meta') {
              sendJson(res, 200, { ok: true, library: await loadLibrary() });
              return;
            }
            if (req.method === 'GET' && action === 'tree') {
              await ensureRoot();
              sendJson(res, 200, { ok: true, tree: await buildFolderTree(ART_ROOT, '') });
              return;
            }
            if (req.method === 'GET' && action === 'list') {
              sendJson(res, 200, await listFolderAction(url.searchParams.get('path') || ''));
              return;
            }
            if (req.method === 'GET' && action === 'image') {
              await serveImage(res, url.searchParams.get('path'));
              return;
            }
            if (req.method === 'GET' && action === 'vision-capability') {
              sendJson(res, 200, { ok: true, capability: getVisionCapability() });
              return;
            }
            if (req.method === 'GET' && action === 'search') {
              sendJson(res, 200, await searchAction(url.searchParams.get('q') || ''));
              return;
            }

            if (req.method === 'POST' && action === 'mkdir') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await mkdirAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'rename') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await renameAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'move') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await moveAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'copy') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await copyAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'delete') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await deleteAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'item-update') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await itemUpdateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'collection-create') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await collectionCreateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'collection-update') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await collectionUpdateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'collection-delete') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await collectionDeleteAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'reference-set-create') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await referenceSetCreateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'reference-set-update') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await referenceSetUpdateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'reference-set-delete') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await referenceSetDeleteAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'prompt-create') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await promptCreateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'prompt-update') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await promptUpdateAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'prompt-delete') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await promptDeleteAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'compose-prompt') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await composePromptAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'analyze-prompt') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await analyzePromptAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'stage-references') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await stageReferencesAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'save-from-staging') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await saveFromStagingAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'attach-asset') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await attachAssetAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'open-folder') {
              const body = JSON.parse(await readBody(req));
              sendJson(res, 200, await openFolderAction(body));
              return;
            }
            if (req.method === 'POST' && action === 'import') {
              await importAction(req, res, url);
              return;
            }

            sendJson(res, 405, { ok: false, error: 'Method or action not allowed', action });
          } catch (err) {
            const code = err.code === 'BODY_TOO_LARGE' ? 413
              : err.code === 'NOT_FOUND' || err.code === 'MISSING_IMAGE' ? 404
                : err.code === 'INVALID'
                  || err.code === 'PATH_INVALID'
                  || err.code === 'PATH_TRAVERSAL'
                  || err.code === 'REF_LIMIT'
                  ? 400
                  : 500;
            sendJson(res, code, {
              ok: false,
              error: String(err.message || err),
              code: err.code || 'PROJECT_ART_ERROR',
              dropped: err.dropped || undefined,
            });
          }
        });
      });
    },
  };
}

async function ensureRoot() {
  await fs.mkdir(ART_ROOT, { recursive: true });
  await fs.mkdir(META_DIR, { recursive: true });
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  for (const rel of DEFAULT_FOLDER_TREE) {
    await fs.mkdir(path.join(ART_ROOT, ...rel.split('/')), { recursive: true });
  }
}

async function loadLibrary() {
  await ensureRoot();
  try {
    const raw = JSON.parse(await fs.readFile(LIBRARY_JSON, 'utf8'));
    const library = normalizeLibrary(raw);
    if (isLibraryEmpty(library)) {
      const migrated = await tryMigrateFromConceptLibrary(library);
      if (migrated) return migrated;
    }
    return library;
  } catch (err) {
    if (err.code === 'ENOENT') {
      const empty = createEmptyLibrary();
      const migrated = await tryMigrateFromConceptLibrary(empty);
      if (migrated) return migrated;
      await saveLibraryUnlocked(empty);
      return empty;
    }
    throw err;
  }
}

function isLibraryEmpty(library) {
  return !library.items.length
    && !library.prompts.length
    && !library.collections.length
    && !library.referenceSets.length
    && !library.migratedFrom;
}

async function tryMigrateFromConceptLibrary(current) {
  let conceptRaw;
  try {
    conceptRaw = JSON.parse(await fs.readFile(CONCEPT_LIBRARY_JSON, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const hasContent = Array.isArray(conceptRaw?.areas) && conceptRaw.areas.length > 0
    && Array.isArray(conceptRaw?.concepts) && conceptRaw.concepts.length > 0;
  if (!hasContent) return null;

  const { library, fileCopies } = migrateConceptLibraryToProjectArt(conceptRaw);
  for (const copy of fileCopies) {
    try {
      const src = resolveContainedPath(CONCEPT_LIBRARY_ROOT, copy.sourceRelative);
      const dest = resolveUserPath(copy.destRelative, { allowBbArt: false });
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    } catch {
      // Missing source image — keep metadata item; skip file.
    }
  }
  const saved = await saveLibraryUnlocked(library);
  return saved || current;
}

async function saveLibraryUnlocked(library) {
  const normalized = normalizeLibrary(library);
  normalized.schemaVersion = PROJECT_ART_SCHEMA_VERSION;
  normalized.updatedAt = new Date().toISOString();
  await fs.mkdir(META_DIR, { recursive: true });
  await atomicWriteJson(LIBRARY_JSON, normalized);
  return normalized;
}

async function saveLibrary(library) {
  return saveLibraryUnlocked(library);
}

function newId(prefix) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function fail(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  throw err;
}

/**
 * Resolve a user-facing path under project-art/. Rejects traversal and .bb-art writes
 * unless allowBbArt is set for internal reads.
 */
function resolveUserPath(relPath, { allowBbArt = false } = {}) {
  const cleaned = toPosixPath(relPath);
  if (!cleaned) {
    return ART_ROOT;
  }
  if (cleaned.includes('..')) fail('PATH_TRAVERSAL', 'Path traversal rejected');
  const segments = cleaned.split('/').filter(Boolean);
  if (!allowBbArt && segments[0] === BB_ART_SEGMENT) {
    fail('INVALID', 'Cannot access .bb-art via user folder operations');
  }
  const abs = resolveContainedPath(ART_ROOT, cleaned);
  return abs;
}

function relativeFromArt(absPath) {
  return toPosixPath(path.relative(ART_ROOT, absPath));
}

async function buildFolderTree(dirAbs, relBase) {
  let entries;
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  const children = [];
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ent.isDirectory()) continue;
    if (ent.name === BB_ART_SEGMENT) continue;
    if (ent.name === '.git') continue;
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    children.push({
      name: ent.name,
      path: toPosixPath(rel),
      type: 'dir',
      children: await buildFolderTree(path.join(dirAbs, ent.name), rel),
    });
  }
  return children;
}

async function listFolderAction(folderRel) {
  const library = await loadLibrary();
  const abs = resolveUserPath(folderRel || '');
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') fail('NOT_FOUND', `Folder not found: ${folderRel || '/'}`);
    throw err;
  }

  const folderPosix = toPosixPath(folderRel || '');
  const byPath = new Map(library.items.map((item) => [item.relativePath, item]));
  let dirty = false;
  const files = [];

  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.name === BB_ART_SEGMENT) continue;
    if (ent.name.startsWith('.')) continue;
    const rel = folderPosix ? `${folderPosix}/${ent.name}` : ent.name;
    const relPosix = toPosixPath(rel);
    if (ent.isDirectory()) {
      files.push({ name: ent.name, path: relPosix, type: 'dir', item: null });
      continue;
    }
    if (!isImagePath(ent.name)) continue;
    let item = byPath.get(relPosix);
    if (!item) {
      item = createArtItem({
        id: newId('art'),
        relativePath: relPosix,
        title: path.basename(ent.name, path.extname(ent.name)),
      });
      library.items.push(item);
      byPath.set(relPosix, item);
      dirty = true;
    }
    files.push({ name: ent.name, path: relPosix, type: 'file', item });
  }

  const next = dirty ? await saveLibrary(library) : library;
  return { ok: true, path: folderPosix, entries: files, library: next };
}

async function searchAction(q) {
  const library = await loadLibrary();
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) {
    return { ok: true, query: '', results: [] };
  }
  const results = [];
  for (const item of library.items) {
    const hay = [
      item.title,
      item.description,
      item.relativePath,
      ...(item.tags || []),
    ].join(' ').toLowerCase();
    if (hay.includes(needle)) {
      results.push(item);
    }
  }
  return { ok: true, query: q, results };
}

async function mkdirAction({ path: folderPath } = {}) {
  const rel = toPosixPath(folderPath);
  if (!rel) fail('INVALID', 'path is required');
  const abs = resolveUserPath(rel);
  await fs.mkdir(abs, { recursive: true });
  return { ok: true, path: rel };
}

async function renameAction({ path: srcPath, newName } = {}) {
  const rel = toPosixPath(srcPath);
  if (!rel) fail('INVALID', 'path is required');
  const name = sanitizePathSegment(newName);
  if (!name) fail('INVALID', 'newName is required');
  const abs = resolveUserPath(rel);
  const destAbs = path.join(path.dirname(abs), name);
  if (!destAbs.startsWith(ART_ROOT + path.sep) && destAbs !== ART_ROOT) {
    fail('PATH_TRAVERSAL', 'Path traversal rejected');
  }
  // Reject renaming into .bb-art
  if (toPosixPath(path.relative(ART_ROOT, destAbs)).split('/')[0] === BB_ART_SEGMENT) {
    fail('INVALID', 'Cannot rename into .bb-art');
  }
  try {
    await fs.access(destAbs);
    fail('INVALID', `Target already exists: ${name}`);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'INVALID') throw err;
    if (err.code === 'INVALID') throw err;
  }
  await fs.rename(abs, destAbs);
  const newRel = relativeFromArt(destAbs);
  const library = await loadLibrary();
  const prefix = rel.endsWith('/') ? rel : `${rel}`;
  for (const item of library.items) {
    if (item.relativePath === prefix) {
      item.relativePath = newRel;
      item.updatedAt = new Date().toISOString();
    } else if (item.relativePath.startsWith(`${prefix}/`)) {
      item.relativePath = `${newRel}${item.relativePath.slice(prefix.length)}`;
      item.updatedAt = new Date().toISOString();
    }
  }
  const next = await saveLibrary(library);
  return { ok: true, path: newRel, library: next };
}

async function moveAction({ from, toDir } = {}) {
  const srcRel = toPosixPath(from);
  if (!srcRel) fail('INVALID', 'from is required');
  const destDirRel = toPosixPath(toDir || '');
  const srcAbs = resolveUserPath(srcRel);
  const destDirAbs = resolveUserPath(destDirRel);
  const baseName = path.basename(srcAbs);
  const destAbs = path.join(destDirAbs, baseName);
  resolveContainedPath(ART_ROOT, relativeFromArt(destAbs));
  if (toPosixPath(path.relative(ART_ROOT, destAbs)).split('/')[0] === BB_ART_SEGMENT) {
    fail('INVALID', 'Cannot move into .bb-art');
  }
  await fs.mkdir(destDirAbs, { recursive: true });
  try {
    await fs.access(destAbs);
    fail('INVALID', `Target already exists: ${baseName}`);
  } catch (err) {
    if (err.code === 'INVALID') throw err;
    if (err.code !== 'ENOENT') throw err;
  }
  await fs.rename(srcAbs, destAbs);
  const newRel = relativeFromArt(destAbs);
  const library = await loadLibrary();
  for (const item of library.items) {
    if (item.relativePath === srcRel) {
      item.relativePath = newRel;
      item.updatedAt = new Date().toISOString();
    } else if (item.relativePath.startsWith(`${srcRel}/`)) {
      item.relativePath = `${newRel}${item.relativePath.slice(srcRel.length)}`;
      item.updatedAt = new Date().toISOString();
    }
  }
  const next = await saveLibrary(library);
  return { ok: true, path: newRel, library: next };
}

async function copyAction({ from, toDir } = {}) {
  const srcRel = toPosixPath(from);
  if (!srcRel) fail('INVALID', 'from is required');
  const destDirRel = toPosixPath(toDir || '');
  const srcAbs = resolveUserPath(srcRel);
  const destDirAbs = resolveUserPath(destDirRel);
  const baseName = path.basename(srcAbs);
  await fs.mkdir(destDirAbs, { recursive: true });
  const uniqueName = await uniqueFileName(destDirAbs, baseName);
  const destAbs = path.join(destDirAbs, uniqueName);
  if (toPosixPath(path.relative(ART_ROOT, destAbs)).split('/')[0] === BB_ART_SEGMENT) {
    fail('INVALID', 'Cannot copy into .bb-art');
  }
  const stat = await fs.stat(srcAbs);
  if (stat.isDirectory()) {
    await copyDirRecursive(srcAbs, destAbs);
  } else {
    await fs.copyFile(srcAbs, destAbs);
  }
  const newRel = relativeFromArt(destAbs);
  const library = await loadLibrary();
  if (!stat.isDirectory() && isImagePath(uniqueName)) {
    const srcItem = library.items.find((i) => i.relativePath === srcRel);
    const item = createArtItem({
      id: newId('art'),
      relativePath: newRel,
      title: srcItem?.title ? `${srcItem.title} Copy` : path.basename(uniqueName, path.extname(uniqueName)),
      description: srcItem?.description || '',
      tags: srcItem?.tags || [],
      generationPrompt: srcItem?.generationPrompt || '',
      architecturalStyle: srcItem?.architecturalStyle || '',
      materials: srcItem?.materials || '',
      colorPalette: srcItem?.colorPalette || '',
      lighting: srcItem?.lighting || '',
      atmosphere: srcItem?.atmosphere || '',
      distinctiveElements: srcItem?.distinctiveElements || '',
      provenance: srcItem?.provenance ? { ...srcItem.provenance, copiedFrom: srcRel } : { source: 'copy', copiedFrom: srcRel },
    });
    library.items.push(item);
  }
  const next = await saveLibrary(library);
  return { ok: true, path: newRel, library: next };
}

async function copyDirRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === BB_ART_SEGMENT) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) await copyDirRecursive(s, d);
    else await fs.copyFile(s, d);
  }
}

async function deleteAction({ path: targetPath, recursive = false } = {}) {
  const rel = toPosixPath(targetPath);
  if (!rel) fail('INVALID', 'path is required');
  const abs = resolveUserPath(rel);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch (err) {
    if (err.code === 'ENOENT') fail('NOT_FOUND', `Not found: ${rel}`);
    throw err;
  }
  if (stat.isDirectory()) {
    const entries = await fs.readdir(abs);
    const visible = entries.filter((n) => n !== '.gitkeep');
    if (visible.length && !recursive) {
      fail('INVALID', 'Folder is not empty (pass recursive: true to delete)');
    }
    await fs.rm(abs, { recursive: true, force: true });
  } else {
    await fs.unlink(abs);
  }
  const library = await loadLibrary();
  library.items = library.items.filter((item) => {
    if (item.relativePath === rel) return false;
    if (item.relativePath.startsWith(`${rel}/`)) return false;
    return true;
  });
  const surviving = new Set(library.items.map((i) => i.id));
  for (const prompt of library.prompts) {
    prompt.itemIds = prompt.itemIds.filter((id) => surviving.has(id));
  }
  for (const col of library.collections) {
    col.itemIds = col.itemIds.filter((id) => surviving.has(id));
  }
  for (const rs of library.referenceSets) {
    rs.itemIds = rs.itemIds.filter((id) => surviving.has(id));
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function itemUpdateAction({ id, patch } = {}) {
  const library = await loadLibrary();
  const item = library.items.find((i) => i.id === id);
  if (!item) fail('NOT_FOUND', `Unknown item: ${id}`);
  const editable = [
    'title', 'description', 'generationPrompt', 'originalGenerationPrompt',
    'architecturalStyle', 'materials',
    'colorPalette', 'lighting', 'atmosphere', 'distinctiveElements',
  ];
  for (const key of editable) {
    if (patch?.[key] != null) item[key] = String(patch[key]);
  }
  if (Array.isArray(patch?.tags)) item.tags = patch.tags.map(String);
  if (patch?.rating != null) item.rating = Math.max(0, Math.min(5, Math.round(Number(patch.rating) || 0)));
  if (patch?.favorite != null) item.favorite = Boolean(patch.favorite);
  if (Array.isArray(patch?.associatedPromptIds)) {
    item.associatedPromptIds = patch.associatedPromptIds.map(String);
  }
  if (Array.isArray(patch?.generatedAssetRefs)) {
    item.generatedAssetRefs = normalizeAssetRefs(patch.generatedAssetRefs);
  }
  if (patch?.provenance && typeof patch.provenance === 'object') {
    item.provenance = { ...item.provenance, ...patch.provenance };
  }
  item.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function collectionCreateAction({ name, itemIds } = {}) {
  const library = await loadLibrary();
  const col = createCollection({ id: newId('col'), name, itemIds });
  library.collections.push(col);
  const next = await saveLibrary(library);
  return { ok: true, library: next, id: col.id };
}

async function collectionUpdateAction({ id, patch } = {}) {
  const library = await loadLibrary();
  const col = library.collections.find((c) => c.id === id);
  if (!col) fail('NOT_FOUND', `Unknown collection: ${id}`);
  if (patch?.name != null) col.name = String(patch.name).trim() || col.name;
  if (Array.isArray(patch?.itemIds)) col.itemIds = patch.itemIds.map(String);
  col.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function collectionDeleteAction({ id } = {}) {
  const library = await loadLibrary();
  if (!library.collections.some((c) => c.id === id)) fail('NOT_FOUND', `Unknown collection: ${id}`);
  library.collections = library.collections.filter((c) => c.id !== id);
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function referenceSetCreateAction({ name, itemIds } = {}) {
  const library = await loadLibrary();
  const rs = createReferenceSet({ id: newId('refset'), name, itemIds });
  library.referenceSets.push(rs);
  const next = await saveLibrary(library);
  return { ok: true, library: next, id: rs.id };
}

async function referenceSetUpdateAction({ id, patch } = {}) {
  const library = await loadLibrary();
  const rs = library.referenceSets.find((c) => c.id === id);
  if (!rs) fail('NOT_FOUND', `Unknown reference set: ${id}`);
  if (patch?.name != null) rs.name = String(patch.name).trim() || rs.name;
  if (Array.isArray(patch?.itemIds)) rs.itemIds = patch.itemIds.map(String);
  rs.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function referenceSetDeleteAction({ id } = {}) {
  const library = await loadLibrary();
  if (!library.referenceSets.some((c) => c.id === id)) fail('NOT_FOUND', `Unknown reference set: ${id}`);
  library.referenceSets = library.referenceSets.filter((c) => c.id !== id);
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function promptCreateAction(body = {}) {
  const library = await loadLibrary();
  const prompt = createArtPrompt({ ...body, id: newId('prompt') });
  library.prompts.push(prompt);
  if (Array.isArray(body.itemIds)) {
    for (const itemId of body.itemIds) {
      const item = library.items.find((i) => i.id === itemId);
      if (item && !item.associatedPromptIds.includes(prompt.id)) {
        item.associatedPromptIds.push(prompt.id);
      }
    }
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next, promptId: prompt.id };
}

async function promptUpdateAction({ promptId, id, patch } = {}) {
  const pid = promptId || id;
  const library = await loadLibrary();
  const prompt = library.prompts.find((p) => p.id === pid);
  if (!prompt) fail('NOT_FOUND', `Unknown prompt: ${pid}`);
  const fields = [
    'name', 'category', 'promptText', 'negativePrompt',
    'preferredProvider', 'preferredModel', 'assetCategory',
  ];
  for (const key of fields) {
    if (patch?.[key] != null) prompt[key] = patch[key];
  }
  if (patch?.tileHorizontal != null) prompt.tileHorizontal = Boolean(patch.tileHorizontal);
  if (patch?.tileVertical != null) prompt.tileVertical = Boolean(patch.tileVertical);
  if (patch?.generationParams && typeof patch.generationParams === 'object') {
    prompt.generationParams = { ...patch.generationParams };
  }
  if (Array.isArray(patch?.tags)) prompt.tags = patch.tags.map(String);
  if (Array.isArray(patch?.itemIds)) prompt.itemIds = patch.itemIds.map(String);
  if (Array.isArray(patch?.generatedAssetRefs)) {
    prompt.generatedAssetRefs = normalizeAssetRefs(patch.generatedAssetRefs);
  }
  prompt.updatedAt = new Date().toISOString();
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function promptDeleteAction({ promptId, id } = {}) {
  const pid = promptId || id;
  const library = await loadLibrary();
  if (!library.prompts.some((p) => p.id === pid)) fail('NOT_FOUND', `Unknown prompt: ${pid}`);
  library.prompts = library.prompts.filter((p) => p.id !== pid);
  for (const item of library.items) {
    item.associatedPromptIds = item.associatedPromptIds.filter((x) => x !== pid);
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next };
}

async function composePromptAction({
  itemIds = [],
  assetCategory = 'other',
  instruction = '',
  tileHorizontal = false,
  tileVertical = false,
} = {}) {
  const library = await loadLibrary();
  const ids = Array.isArray(itemIds) ? itemIds.map(String) : [];
  const referenceTitles = ids
    .map((id) => library.items.find((i) => i.id === id)?.title)
    .filter(Boolean);
  const composed = composeTemplateAssetPrompt({
    assetCategory,
    instruction,
    tileHorizontal,
    tileVertical,
    referenceTitles,
  });
  return {
    ok: true,
    source: 'template',
    promptText: composed.promptText,
    notes: composed.notes,
    assetCategory: composed.assetCategory,
    itemIds: ids,
  };
}

async function analyzePromptAction(body = {}) {
  const library = await loadLibrary();
  const ids = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
  const referenceTitles = ids
    .map((id) => library.items.find((i) => i.id === id)?.title)
    .filter(Boolean);
  return analyzeAssetPromptRequest({
    ...body,
    referenceTitles: body.referenceTitles || referenceTitles,
  });
}

/**
 * Copy reference images into .openart-staging. Never silently drop —
 * if maxRefs is exceeded, return error listing which would be dropped.
 */
async function stageReferencesAction({ itemIds = [], maxRefs = null } = {}) {
  const library = await loadLibrary();
  const ids = Array.isArray(itemIds) ? itemIds.map(String) : [];
  if (!ids.length) fail('INVALID', 'itemIds required');

  const items = [];
  for (const id of ids) {
    const item = library.items.find((i) => i.id === id);
    if (!item) fail('NOT_FOUND', `Unknown item: ${id}`);
    if (!item.relativePath) fail('MISSING_IMAGE', `Item has no path: ${id}`);
    items.push(item);
  }

  const limit = maxRefs == null || maxRefs === '' ? null : Number(maxRefs);
  if (limit != null && Number.isFinite(limit) && limit >= 0 && items.length > limit) {
    const kept = items.slice(0, limit).map((i) => i.id);
    const dropped = items.slice(limit).map((i) => ({
      id: i.id,
      title: i.title,
      relativePath: i.relativePath,
    }));
    fail(
      'REF_LIMIT',
      `Too many references: ${items.length} requested, maxRefs=${limit}. Would drop: ${dropped.map((d) => d.id).join(', ')}`,
      { dropped, kept },
    );
  }

  await fs.mkdir(STAGING_ROOT, { recursive: true });
  const staged = [];
  for (const item of items) {
    const abs = resolveUserPath(item.relativePath);
    let buffer;
    try {
      buffer = await fs.readFile(abs);
    } catch (err) {
      if (err.code === 'ENOENT') fail('MISSING_IMAGE', `Image missing: ${item.relativePath}`);
      throw err;
    }
    const ext = path.extname(item.relativePath).toLowerCase() || '.png';
    const stagingId = `aref_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
    const fileName = `${stagingId}${ext}`;
    const absolutePath = path.join(STAGING_ROOT, fileName);
    await fs.writeFile(absolutePath, buffer);
    staged.push({
      itemId: item.id,
      stagingId,
      fileName,
      originalName: path.basename(item.relativePath),
      absolutePath,
      bytes: buffer.length,
    });
  }
  return { ok: true, staged };
}

async function saveFromStagingAction({
  stagingId = null,
  fileName = null,
  folderPath = '',
  title = 'Generated art',
  provenance = null,
  promptId = null,
  itemIds = null,
  metadata = null,
} = {}) {
  const library = await loadLibrary();
  const folderRel = toPosixPath(folderPath || '');
  const destDir = resolveUserPath(folderRel);
  await fs.mkdir(destDir, { recursive: true });

  let buffer;
  let sourceName = 'generated.png';
  if (stagingId) {
    const { meta, absolutePath } = await readStagingFile(stagingId, { stagingRoot: STAGING_ROOT });
    buffer = await fs.readFile(absolutePath);
    sourceName = meta.fileName || path.basename(absolutePath);
  } else if (fileName) {
    const safe = path.basename(String(fileName));
    const abs = resolveContainedPath(STAGING_ROOT, safe);
    buffer = await fs.readFile(abs);
    sourceName = safe;
  } else {
    fail('INVALID', 'stagingId or fileName required');
  }

  const magic = detectImageMagic(buffer);
  if (!magic) fail('INVALID', 'Unrecognized image signature');
  const ext = extensionForImageMagic(magic) || path.extname(sourceName) || '.png';
  const base = sanitizePathSegment(title || path.basename(sourceName, path.extname(sourceName)));
  const uniqueName = await uniqueFileName(destDir, `${base}${ext}`);
  const destAbs = path.join(destDir, uniqueName);
  await fs.writeFile(destAbs, buffer);
  const relativePath = relativeFromArt(destAbs);

  const submittedPrompt = String(
    metadata?.originalGenerationPrompt
    || metadata?.generationPrompt
    || '',
  );
  const item = createArtItem({
    id: newId('art'),
    relativePath,
    title,
    description: metadata?.description || '',
    architecturalStyle: metadata?.architecturalStyle || '',
    materials: metadata?.materials || '',
    colorPalette: metadata?.colorPalette || '',
    lighting: metadata?.lighting || '',
    atmosphere: metadata?.atmosphere || '',
    distinctiveElements: metadata?.distinctiveElements || '',
    tags: metadata?.tags || [],
    generationPrompt: metadata?.generationPrompt || submittedPrompt,
    originalGenerationPrompt: submittedPrompt,
    provenance: provenance || {
      source: 'openart',
      stagingId: stagingId || null,
      fileName: sourceName,
      savedAt: new Date().toISOString(),
    },
  });
  if (promptId) {
    item.associatedPromptIds = [String(promptId)];
    const prompt = library.prompts.find((p) => p.id === promptId);
    if (prompt && !prompt.itemIds.includes(item.id)) {
      prompt.itemIds.push(item.id);
      prompt.updatedAt = new Date().toISOString();
    }
  }
  if (Array.isArray(itemIds)) {
    // Optional: link related reference item ids into tags/provenance only.
    item.provenance = {
      ...item.provenance,
      referenceItemIds: itemIds.map(String),
    };
  }
  library.items.push(item);
  const next = await saveLibrary(library);
  return { ok: true, library: next, itemId: item.id, relativePath };
}

async function attachAssetAction({
  itemId = null,
  promptId = null,
  itemIds = null,
  asset = null,
} = {}) {
  if (!asset?.id || !asset?.kind) fail('INVALID', 'asset.id and asset.kind are required');
  const library = await loadLibrary();
  const targetIds = itemId
    ? [itemId]
    : Array.isArray(itemIds) ? itemIds.map(String) : [];
  if (!targetIds.length && !promptId) {
    fail('INVALID', 'itemId/itemIds or promptId required');
  }
  const now = new Date().toISOString();
  const refs = [];
  for (const id of targetIds) {
    const item = library.items.find((i) => i.id === id);
    if (!item) fail('NOT_FOUND', `Unknown item: ${id}`);
    const ref = normalizeAssetRefs([{
      id: String(asset.id),
      kind: String(asset.kind),
      name: String(asset.name || asset.id),
      itemId: item.id,
      conceptId: item.id,
      promptId: promptId || null,
      attachedAt: now,
    }])[0];
    const existing = Array.isArray(item.generatedAssetRefs) ? item.generatedAssetRefs : [];
    item.generatedAssetRefs = normalizeAssetRefs([
      ...existing.filter((r) => !(r.id === ref.id && r.kind === ref.kind)),
      ref,
    ]);
    item.updatedAt = now;
    refs.push(ref);
  }
  if (promptId) {
    const prompt = library.prompts.find((p) => p.id === promptId);
    if (!prompt) fail('NOT_FOUND', `Unknown prompt: ${promptId}`);
    const ref = normalizeAssetRefs([{
      id: String(asset.id),
      kind: String(asset.kind),
      name: String(asset.name || asset.id),
      itemId: targetIds[0] || null,
      promptId,
      attachedAt: now,
    }])[0];
    const prefs = Array.isArray(prompt.generatedAssetRefs) ? prompt.generatedAssetRefs : [];
    prompt.generatedAssetRefs = normalizeAssetRefs([
      ...prefs.filter((r) => !(r.id === ref.id && r.kind === ref.kind)),
      ref,
    ]);
    prompt.updatedAt = now;
    if (!refs.length) refs.push(ref);
  }
  const next = await saveLibrary(library);
  return { ok: true, library: next, refs };
}

async function openFolderAction({ path: targetPath = '' } = {}) {
  const rel = toPosixPath(targetPath || '');
  let abs;
  if (!rel) {
    abs = ART_ROOT;
  } else {
    abs = resolveUserPath(rel, { allowBbArt: false });
  }
  let selectFile = false;
  try {
    const st = await fs.stat(abs);
    selectFile = st.isFile();
  } catch (err) {
    if (err.code === 'ENOENT') fail('NOT_FOUND', `Path not found: ${rel || '/'}`);
    throw err;
  }

  if (process.platform === 'win32') {
    if (selectFile) {
      spawn('explorer.exe', [`/select,${abs}`], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('explorer.exe', [abs], { detached: true, stdio: 'ignore' }).unref();
    }
  } else if (process.platform === 'darwin') {
    const args = selectFile ? ['-R', abs] : [abs];
    spawn('open', args, { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [selectFile ? path.dirname(abs) : abs], { detached: true, stdio: 'ignore' }).unref();
  }
  return { ok: true, path: rel || '', absolutePath: abs };
}

async function importAction(req, res, url) {
  const folderRel = toPosixPath(url.searchParams.get('folder') || '');
  const title = url.searchParams.get('title') || '';
  const originalName = path.basename(url.searchParams.get('name') || 'import.png');
  const ext = path.extname(originalName).toLowerCase() || '.png';
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    sendJson(res, 400, { ok: false, error: `Unsupported image type: ${ext}`, code: 'INVALID' });
    return;
  }
  const buffer = await readBodyBuffer(req);
  if (!buffer.length) {
    sendJson(res, 400, { ok: false, error: 'Empty upload', code: 'INVALID' });
    return;
  }
  const magic = detectImageMagic(buffer);
  if (!magic) {
    sendJson(res, 400, { ok: false, error: 'Unrecognized image signature', code: 'INVALID' });
    return;
  }
  const magicExt = extensionForImageMagic(magic) || ext;
  const destDir = resolveUserPath(folderRel);
  await fs.mkdir(destDir, { recursive: true });
  const base = sanitizePathSegment(path.basename(originalName, path.extname(originalName)));
  const uniqueName = await uniqueFileName(destDir, `${base}${magicExt}`);
  const destAbs = path.join(destDir, uniqueName);
  await fs.writeFile(destAbs, buffer);
  const relativePath = relativeFromArt(destAbs);
  const library = await loadLibrary();
  const item = createArtItem({
    id: newId('art'),
    relativePath,
    title: title || path.basename(uniqueName, path.extname(uniqueName)),
    provenance: { source: 'import', originalName, savedAt: new Date().toISOString() },
  });
  library.items.push(item);
  const next = await saveLibrary(library);
  sendJson(res, 200, { ok: true, library: next, itemId: item.id, relativePath });
}

async function uniqueFileName(dirAbs, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = fileName;
  let i = 1;
  while (true) {
    try {
      await fs.access(path.join(dirAbs, candidate));
      candidate = `${stem}_${i}${ext}`;
      i += 1;
    } catch {
      return candidate;
    }
  }
}

async function serveImage(res, relPath) {
  try {
    const abs = resolveUserPath(relPath, { allowBbArt: true });
    // Images may live under project-art (user folders) — still reject path traversal.
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
  } catch (err) {
    sendJson(res, err.code === 'INVALID' || err.code === 'PATH_TRAVERSAL' || err.code === 'PATH_INVALID' ? 400 : 404, {
      ok: false,
      error: err.message || 'Image not found',
      code: err.code === 'INVALID' || err.code === 'PATH_TRAVERSAL' || err.code === 'PATH_INVALID'
        ? err.code
        : 'MISSING_IMAGE',
    });
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return readBodyLimited(req, DEFAULT_JSON_BODY_LIMIT);
}

function readBodyBuffer(req, limit = DEFAULT_UPLOAD_LIMIT) {
  return readBodyBufferLimited(req, limit);
}
