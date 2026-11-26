import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_JSON_BODY_LIMIT,
  DEFAULT_MESH_UPLOAD_LIMIT,
  DEFAULT_UPLOAD_LIMIT,
  atomicWriteJson,
  createAsyncMutex,
  detectImageMagic,
  extensionForImageMagic,
  readBodyBufferLimited,
  readBodyLimited,
  resolveContainedPath,
} from './fsSafety.js';
import {
  bakeAndWriteMaterialSpherePreview,
  previewAbsPathForMaterial,
} from '../scripts/lib/materialSphereBake.mjs';
import {
  normalizeMaterialDefinition,
  serializeAttenuationDistance,
} from '../src/materials/MaterialDefinition.js';

function materialDefinitionForDisk(definition) {
  return {
    ...definition,
    attenuationDistance: serializeAttenuationDistance(definition.attenuationDistance),
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

let ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets');
let REGISTRY_PATH = path.join(ASSETS_DIR, 'registry.json');
const withRegistryLock = createAsyncMutex();

const KIND_DIRS = {
  texture: 'textures',
  mesh: 'meshes',
  material: 'materials',
  prefab: 'prefabs',
};

const TEXTURE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ktx2', '.hdr', '.exr']);
const ENV_MAP_EXTS = new Set(['.hdr', '.exr']);
const MESH_EXTS = new Set(['.glb', '.gltf']);

/** Test-only: redirect asset roots to a temp directory. */
export function __testSetAssetRoots(assetsDir) {
  const next = path.resolve(assetsDir);
  const production = path.join(PROJECT_ROOT, 'public', 'assets');
  if (next === path.resolve(production)) {
    throw new Error('Refusing to redirect asset roots onto production public/assets');
  }
  ASSETS_DIR = next;
  REGISTRY_PATH = path.join(ASSETS_DIR, 'registry.json');
}

export function __testResetAssetRoots() {
  ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets');
  REGISTRY_PATH = path.join(ASSETS_DIR, 'registry.json');
}

/**
 * Development-only Vite middleware for project assets under public/assets.
 */
export function assetFileApiPlugin() {
  return {
    name: 'bloodbound-asset-file-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/assets', async (req, res) => {
        try {
          await ensureAssetDirs();
          const url = new URL(req.url || '/', 'http://localhost');
          const action = url.searchParams.get('action') || 'registry';

          if (req.method === 'GET' && action === 'registry') {
            const registry = await readRegistry();
            sendJson(res, 200, registry);
            return;
          }

          if (req.method === 'GET' && action === 'material') {
            const id = url.searchParams.get('id');
            const registry = await readRegistry();
            const entry = registry.assets.find((a) => a.id === id && a.kind === 'material');
            if (!entry) {
              sendJson(res, 404, { error: 'Material not found' });
              return;
            }
            const full = resolveSafeAssetPath(entry.path);
            const raw = await fs.readFile(full, 'utf8');
            sendJson(res, 200, JSON.parse(raw));
            return;
          }

          if (req.method === 'GET' && action === 'prefab') {
            const id = url.searchParams.get('id');
            const registry = await readRegistry();
            const entry = registry.assets.find((a) => a.id === id && a.kind === 'prefab');
            if (!entry) {
              sendJson(res, 404, { error: 'Prefab not found' });
              return;
            }
            const full = resolveSafeAssetPath(entry.path);
            const raw = await fs.readFile(full, 'utf8');
            sendJson(res, 200, JSON.parse(raw));
            return;
          }

          if (req.method === 'PUT' && action === 'registry') {
            const body = JSON.parse(await readBody(req));
            await writeRegistry(body);
            sendJson(res, 200, { ok: true });
            return;
          }

          if (req.method === 'POST' && action === 'import-texture') {
            const url = new URL(req.url || '/', 'http://localhost');
            const originalName = url.searchParams.get('name') || 'import.png';
            const name = url.searchParams.get('assetName') || null;
            const tagsRaw = url.searchParams.get('tags') || '';
            const tags = tagsRaw
              ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
              : [];
            const buffer = await readBodyBuffer(req, DEFAULT_UPLOAD_LIMIT);
            const result = await importTextureBuffer(buffer, originalName, {
              name: name || undefined,
              tags,
            });
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'replace-texture') {
            const id = url.searchParams.get('id');
            const buffer = await readBodyBuffer(req, DEFAULT_UPLOAD_LIMIT);
            const result = await replaceTextureBuffer(id, buffer);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'import-mesh') {
            const result = await importBinaryAsset(req, 'mesh', MESH_EXTS);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'mesh-source') {
            const id = url.searchParams.get('id');
            const ext = url.searchParams.get('ext') || '.bin';
            const buffer = await readBodyBuffer(req, DEFAULT_MESH_UPLOAD_LIMIT);
            const result = await storeMeshSourceOriginal(id, buffer, ext);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'patch-mesh-meta') {
            const id = url.searchParams.get('id');
            const body = JSON.parse(await readBody(req));
            const result = await patchMeshAssetMeta(id, body?.meta || {});
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'patch-texture-meta') {
            const id = url.searchParams.get('id');
            const body = JSON.parse(await readBody(req));
            const result = await patchTextureAssetMeta(id, body?.meta || {});
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'mesh-preview') {
            const id = url.searchParams.get('id');
            const buffer = await readBodyBuffer(req, DEFAULT_UPLOAD_LIMIT);
            const result = await saveMeshPreviewPng(id, buffer);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'material-preview') {
            const id = url.searchParams.get('id');
            const buffer = await readBodyBuffer(req, DEFAULT_UPLOAD_LIMIT);
            const result = await saveMaterialPreviewPng(id, buffer);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'create-material') {
            const body = JSON.parse(await readBody(req));
            const result = await createMaterialAsset(body);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'bake-missing-material-previews') {
            const result = await bakeMissingMaterialPreviews();
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'PUT' && action === 'material') {
            const id = url.searchParams.get('id');
            const body = JSON.parse(await readBody(req));
            const result = await updateMaterialAsset(id, body);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'create-prefab') {
            const body = JSON.parse(await readBody(req));
            const result = await createPrefabAsset(body);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'PUT' && action === 'prefab') {
            const id = url.searchParams.get('id');
            const body = JSON.parse(await readBody(req));
            const result = await updatePrefabAsset(id, body);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'GET' && action === 'postprocessing-presets') {
            sendJson(res, 200, await readPostProcessingPresets());
            return;
          }

          if (req.method === 'PUT' && action === 'postprocessing-presets') {
            const body = JSON.parse(await readBody(req));
            const saved = await writePostProcessingPresets(body);
            sendJson(res, 200, saved);
            return;
          }

          sendJson(res, 405, { error: 'Method or action not allowed' });
        } catch (err) {
          const status = err?.code === 'BODY_TOO_LARGE' ? 413
            : err?.code === 'NOT_FOUND' ? 404
              : err?.code === 'INVALID_IMAGE' || err?.code === 'PATH_TRAVERSAL' ? 400
                : 500;
          sendJson(res, status, { error: String(err.message || err), code: err.code || null });
        }
      });
    },
  };
}

async function ensureAssetDirs() {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  for (const dir of Object.values(KIND_DIRS)) {
    await fs.mkdir(path.join(ASSETS_DIR, dir), { recursive: true });
  }
  try {
    await fs.access(REGISTRY_PATH);
  } catch {
    // Seed empty registry directly — do not call writeRegistry (would re-enter ensure).
    await atomicWriteJson(REGISTRY_PATH, { schemaVersion: 1, assets: [] });
  }
}

async function readRegistry() {
  await ensureAssetDirs();
  const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    schemaVersion: 1,
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
  };
}

async function writeRegistry(registry) {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  const normalized = {
    schemaVersion: 1,
    assets: Array.isArray(registry?.assets) ? registry.assets : [],
  };
  await atomicWriteJson(REGISTRY_PATH, normalized);
  return normalized;
}

function resolveSafeAssetPath(relPath) {
  return resolveContainedPath(ASSETS_DIR, relPath);
}

async function mutateRegistry(mutator) {
  return withRegistryLock(async () => {
    const registry = await readRegistry();
    const result = await mutator(registry);
    await writeRegistry(registry);
    return result;
  });
}

/**
 * Import a texture from an in-memory buffer through the normal registry path.
 * Used by the HTTP upload handler and by the OpenArt staging import (Phase 2H.1A).
 */
export async function importTextureBuffer(buffer, originalName = 'import.png', {
  tags = [],
  name = null,
} = {}) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('Texture import requires a binary buffer');
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!bytes.length) throw new Error('Empty upload');
  if (bytes.length > DEFAULT_UPLOAD_LIMIT) {
    const err = new Error(`Texture exceeds ${DEFAULT_UPLOAD_LIMIT} bytes`);
    err.code = 'BODY_TOO_LARGE';
    throw err;
  }

  const magic = detectImageMagic(bytes);
  // ktx2 is extension-only (no simple magic here); HDR/EXR prefer magic or extension.
  const base = path.basename(originalName || 'import.png');
  let ext = path.extname(base).toLowerCase() || '.png';
  if (ext === '.ktx2') {
    if (!TEXTURE_EXTS.has(ext)) throw Object.assign(new Error('Unsupported texture extension: .ktx2'), { code: 'INVALID_IMAGE' });
  } else if (ENV_MAP_EXTS.has(ext) || magic === 'hdr' || magic === 'exr') {
    if (magic === 'hdr' || magic === 'exr') {
      ext = extensionForImageMagic(magic) || ext;
    }
    if (!ENV_MAP_EXTS.has(ext)) {
      throw Object.assign(new Error(`Unsupported environment map extension: ${ext}`), { code: 'INVALID_IMAGE' });
    }
    if (!magic && !ENV_MAP_EXTS.has(ext)) {
      throw Object.assign(new Error('Environment map rejected: unrecognized HDR/EXR signature'), { code: 'INVALID_IMAGE' });
    }
  } else {
    if (!magic) {
      throw Object.assign(new Error('Texture rejected: unrecognized image signature'), { code: 'INVALID_IMAGE' });
    }
    const magicExt = extensionForImageMagic(magic);
    if (!TEXTURE_EXTS.has(ext) && magicExt) ext = magicExt;
    if (!TEXTURE_EXTS.has(ext)) {
      throw Object.assign(new Error(`Unsupported texture extension: ${ext}`), { code: 'INVALID_IMAGE' });
    }
    // Prefer container implied by magic when extension disagrees (e.g. .png that is jpeg).
    if (magicExt && ext !== magicExt && !(ext === '.jpeg' && magicExt === '.jpg') && !(ext === '.jpg' && magic === 'jpeg')) {
      ext = magicExt;
    }
  }

  const id = `tex_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const storedName = `${id}${ext}`;
  const relPath = `${KIND_DIRS.texture}/${storedName}`;
  const full = resolveSafeAssetPath(relPath);
  const originalRel = `${KIND_DIRS.texture}/originals/${storedName}`;
  const originalFull = resolveSafeAssetPath(originalRel);
  const isEnvMap = ENV_MAP_EXTS.has(ext);

  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  try {
    await fs.mkdir(path.dirname(originalFull), { recursive: true });
    await fs.copyFile(full, originalFull);

    const entryTags = Array.isArray(tags) ? [...tags] : [];
    if (isEnvMap && !entryTags.includes('environment')) entryTags.push('environment');
    if (isEnvMap && !entryTags.includes('hdri')) entryTags.push('hdri');

    const entry = {
      id,
      kind: 'texture',
      name: name || stripExt(base),
      folder: isEnvMap ? 'Environments' : 'Textures',
      path: relPath,
      originalName: base,
      tags: entryTags,
      meta: {
        format: ext.replace('.', ''),
        bytes: bytes.length,
        magic: magic || null,
        environmentMap: isEnvMap,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const registry = await mutateRegistry(async (reg) => {
      reg.assets.push(entry);
      return { ok: true, asset: entry, registry: reg };
    });
    return registry;
  } catch (err) {
    // Roll back orphan files so a failed registry write cannot leave broken refs.
    try { await fs.unlink(full); } catch { /* ignore */ }
    try { await fs.unlink(originalFull); } catch { /* ignore */ }
    throw err;
  }
}

/** Overwrite an existing texture's bytes while preserving id / path / registry entry. */
export async function replaceTextureBuffer(id, buffer) {
  if (!id) throw new Error('Missing texture id');
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new Error('Texture replace requires a binary buffer');
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!bytes.length) throw new Error('Empty upload');
  if (bytes.length > DEFAULT_UPLOAD_LIMIT) {
    const err = new Error(`Texture exceeds ${DEFAULT_UPLOAD_LIMIT} bytes`);
    err.code = 'BODY_TOO_LARGE';
    throw err;
  }
  const magic = detectImageMagic(bytes);
  if (!magic) {
    throw Object.assign(new Error('Texture rejected: unrecognized image signature'), {
      code: 'INVALID_IMAGE',
    });
  }

  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'texture');
    if (!entry) throw new Error('Texture not found');
    const full = resolveSafeAssetPath(entry.path);
    await fs.writeFile(full, bytes);
    const originalRel = entry.path.replace(
      `${KIND_DIRS.texture}/`,
      `${KIND_DIRS.texture}/originals/`,
    );
    try {
      const originalFull = resolveSafeAssetPath(originalRel);
      await fs.mkdir(path.dirname(originalFull), { recursive: true });
      await fs.copyFile(full, originalFull);
    } catch {
      /* originals are best-effort */
    }
    entry.meta = {
      ...(entry.meta || {}),
      format: extensionForImageMagic(magic)?.replace('.', '') || entry.meta?.format,
      bytes: bytes.length,
      magic,
    };
    entry.updatedAt = Date.now();
    return { ok: true, asset: entry, registry };
  });
}

async function importBinaryAsset(req, kind, allowedExts) {
  const url = new URL(req.url || '/', 'http://localhost');
  const originalName = url.searchParams.get('name') || `import${kind === 'mesh' ? '.glb' : '.png'}`;
  const base = path.basename(originalName);
  const ext = path.extname(base).toLowerCase();
  if (!allowedExts.has(ext)) {
    throw new Error(`Unsupported ${kind} extension: ${ext}`);
  }

  const buffer = await readBodyBuffer(req, DEFAULT_MESH_UPLOAD_LIMIT);
  if (!buffer.length) throw new Error('Empty upload');

  if (kind === 'texture') {
    return importTextureBuffer(buffer, base);
  }

  let meta = {};
  const metaRaw = url.searchParams.get('meta');
  if (metaRaw) {
    try { meta = JSON.parse(metaRaw); } catch { meta = {}; }
  }
  const tagsParam = url.searchParams.get('tags');
  const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const assetName = url.searchParams.get('assetName');

  return importMeshBuffer(buffer, {
    originalName: base,
    name: assetName || stripExt(base),
    tags,
    meta,
  });
}

/** Preserve foreign-format source bytes next to a mesh asset (Batch 7). */
export async function storeMeshSourceOriginal(id, buffer, ext = '.bin') {
  if (!id) throw new Error('Missing mesh id');
  if (!buffer?.length) throw new Error('Empty source upload');
  const safeExt = String(ext || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
  const rel = `${KIND_DIRS.mesh}/originals/${id}${safeExt.startsWith('.') ? safeExt : `.${safeExt}`}`;
  const full = resolveSafeAssetPath(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'mesh');
    if (!entry) {
      const err = new Error('Mesh not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.meta = {
      ...(entry.meta || {}),
      sourceOriginalPath: rel,
      sourceOriginalBytes: buffer.length,
    };
    entry.updatedAt = Date.now();
    return { ok: true, asset: entry, registry, sourceOriginalPath: rel };
  });
}

export async function patchMeshAssetMeta(id, metaPatch = {}) {
  if (!id) throw new Error('Missing mesh id');
  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'mesh');
    if (!entry) {
      const err = new Error('Mesh not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.meta = { ...(entry.meta || {}), ...metaPatch };
    entry.updatedAt = Date.now();
    return { ok: true, asset: entry, registry };
  });
}

export async function patchTextureAssetMeta(id, metaPatch = {}) {
  if (!id) throw new Error('Missing texture id');
  const { mergeTextureMetaPatch } = await import('../src/assets/textureSampling.js');
  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'texture');
    if (!entry) {
      const err = new Error('Texture not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.meta = mergeTextureMetaPatch(entry.meta || {}, metaPatch || {});
    entry.updatedAt = Date.now();
    return { ok: true, asset: entry, registry };
  });
}

/** Save a browser-baked mesh thumbnail PNG and attach meta.previewPath. */
export async function saveMeshPreviewPng(id, buffer) {
  if (!id) throw new Error('Missing mesh id');
  if (!buffer?.length) throw new Error('Empty mesh preview upload');
  const magic = detectImageMagic(buffer);
  if (magic !== 'png') {
    const err = new Error('Mesh preview must be a PNG');
    err.code = 'INVALID_IMAGE';
    throw err;
  }

  const previewRel = `previews/${id}_mesh.png`;
  const previewFull = resolveSafeAssetPath(previewRel);
  await fs.mkdir(path.dirname(previewFull), { recursive: true });
  await fs.writeFile(previewFull, buffer);

  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'mesh');
    if (!entry) {
      const err = new Error('Mesh not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.meta = {
      ...(entry.meta || {}),
      previewPath: previewRel,
      previewBytes: buffer.length,
    };
    entry.updatedAt = Date.now();
    return { ok: true, asset: entry, registry, previewPath: previewRel };
  });
}

/**
 * Save a browser-captured material sphere PNG (from Asset Viewer detailed preview)
 * and attach previewPath on both the definition JSON and registry meta.
 */
export async function saveMaterialPreviewPng(id, buffer) {
  if (!id) throw new Error('Missing material id');
  if (!buffer?.length) throw new Error('Empty material preview upload');
  const magic = detectImageMagic(buffer);
  if (magic !== 'png') {
    const err = new Error('Material preview must be a PNG');
    err.code = 'INVALID_IMAGE';
    throw err;
  }

  const previewRel = `previews/${id}_sphere.png`;
  const previewFull = resolveSafeAssetPath(previewRel);
  await fs.mkdir(path.dirname(previewFull), { recursive: true });
  await fs.writeFile(previewFull, buffer);

  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'material');
    if (!entry) {
      const err = new Error('Material not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const full = resolveSafeAssetPath(entry.path);
    const current = JSON.parse(await fs.readFile(full, 'utf8'));
    const definition = normalizeMaterialDefinition({
      ...current,
      id,
      previewPath: previewRel,
      updatedAt: Date.now(),
    });
    await atomicWriteJson(full, materialDefinitionForDisk(definition));

    entry.name = definition.name || entry.name;
    entry.updatedAt = definition.updatedAt;
    entry.meta = {
      ...materialRegistryMeta(definition),
      previewBytes: buffer.length,
      // Marks browser WebGL bake (studio IBL) vs CPU script approximation.
      previewRenderer: 'webgl',
      // Sphere-only, tightly framed (no ground disc).
      previewStyle: 'sphere-fill',
    };
    return { ok: true, asset: entry, definition, registry, previewPath: previewRel };
  });
}

/** Public helper — import a GLB/GLTF buffer into the mesh registry. */
export async function importMeshBuffer(buffer, {
  originalName = 'import.glb',
  name = null,
  tags = [],
  meta = {},
} = {}) {
  if (!buffer?.length) throw new Error('Empty mesh upload');
  const base = path.basename(originalName);
  const ext = path.extname(base).toLowerCase() || '.glb';
  if (!MESH_EXTS.has(ext)) {
    throw new Error(`Unsupported mesh extension: ${ext}`);
  }

  const id = `mesh_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const storedName = `${id}${ext}`;
  const relPath = `${KIND_DIRS.mesh}/${storedName}`;
  const full = resolveSafeAssetPath(relPath);
  const originalRel = `${KIND_DIRS.mesh}/originals/${storedName}`;
  const originalFull = resolveSafeAssetPath(originalRel);

  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  try {
    await fs.mkdir(path.dirname(originalFull), { recursive: true });
    await fs.copyFile(full, originalFull);

    const entry = {
      id,
      kind: 'mesh',
      name: name || stripExt(base),
      folder: 'Meshes',
      path: relPath,
      originalName: base,
      tags: Array.isArray(tags) ? [...tags] : [],
      meta: {
        format: ext === '.gltf' ? 'gltf' : 'glb',
        bytes: buffer.length,
        unitAssumption: 'meters',
        editorUnitsPerMeter: 100,
        scaleWarning: null,
        ...meta,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return await mutateRegistry(async (registry) => {
      registry.assets.push(entry);
      return { ok: true, asset: entry, registry };
    });
  } catch (err) {
    try { await fs.unlink(full); } catch { /* ignore */ }
    try { await fs.unlink(originalFull); } catch { /* ignore */ }
    throw err;
  }
}

/** Public helper for OpenArt (and other) server-side material creation. */
export async function createMaterialAssetFromDefinition(body) {
  return createMaterialAsset(body);
}

/**
 * Backfill lit-sphere PNGs for materials missing previewPath
 * (seeded/legacy assets that never went through create-material).
 */
export async function bakeMissingMaterialPreviews() {
  return mutateRegistry(async (registry) => {
    let baked = 0;
    let skipped = 0;
    let failed = 0;
    const updatedDefs = {};

    for (const entry of registry.assets) {
      if (entry.kind !== 'material') continue;
      const full = resolveSafeAssetPath(entry.path);
      let current;
      try {
        current = JSON.parse(await fs.readFile(full, 'utf8'));
      } catch {
        failed += 1;
        continue;
      }
      const definition = normalizeMaterialDefinition(current);
      if (definition.previewPath || entry.meta?.previewPath) {
        skipped += 1;
        continue;
      }
      const previewPath = bakeMaterialSpherePreview(definition, registry);
      if (!previewPath) {
        failed += 1;
        continue;
      }
      definition.previewPath = previewPath;
      definition.updatedAt = Date.now();
      await atomicWriteJson(full, materialDefinitionForDisk(definition));
      entry.name = definition.name || entry.name;
      entry.updatedAt = definition.updatedAt;
      entry.meta = materialRegistryMeta(definition);
      updatedDefs[definition.id] = definition;
      baked += 1;
    }

    return {
      ok: true,
      baked,
      skipped,
      failed,
      registry,
      definitions: updatedDefs,
    };
  });
}

function resolveTextureAbsPath(registry, textureId) {
  if (!textureId || !registry?.assets) return null;
  const entry = registry.assets.find((a) => a.id === textureId && a.kind === 'texture');
  if (!entry?.path) return null;
  try {
    return resolveSafeAssetPath(entry.path);
  } catch {
    return null;
  }
}

/** Bake lit sphere PNG used by Asset Viewer tiles; non-fatal on failure. */
function bakeMaterialSpherePreview(definition, registry) {
  if (!definition?.id) return definition?.previewPath || null;
  try {
    const { previewPath } = bakeAndWriteMaterialSpherePreview({
      definition,
      resolveTexturePath: (texId) => resolveTextureAbsPath(registry, texId),
      previewAbsPath: previewAbsPathForMaterial(ASSETS_DIR, definition.id),
    });
    return previewPath;
  } catch (err) {
    console.warn(`[assets] sphere preview bake failed for ${definition.id}:`, err.message);
    return definition.previewPath || null;
  }
}

function materialRegistryMeta(definition) {
  return {
    baseColor: definition.baseColor,
    roughness: definition.roughness,
    metalness: definition.metalness,
    shadingModel: definition.shadingModel || 'standard',
    hasBaseMap: Boolean(definition.baseColorMapId),
    hasNormalMap: Boolean(definition.normalMapId),
    hasRoughnessMap: Boolean(definition.roughnessMapId),
    ...(definition.previewPath ? { previewPath: definition.previewPath } : {}),
    ...(definition.pbrGenerator
      ? {
        pbrSourceTextureId: definition.pbrGenerator.sourceTextureId || null,
        tileHorizontal: Boolean(definition.pbrGenerator.tileHorizontal),
        tileVertical: Boolean(definition.pbrGenerator.tileVertical),
      }
      : {}),
  };
}

async function createMaterialAsset(body) {
  const id = body.id || `mat_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = Date.now();
  const definition = normalizeMaterialDefinition({
    ...body,
    id,
    createdAt: now,
    updatedAt: now,
  });

  const registrySnapshot = await readRegistry();
  if (!definition.previewPath) {
    definition.previewPath = bakeMaterialSpherePreview(definition, registrySnapshot);
  }

  const relPath = `${KIND_DIRS.material}/${id}.json`;
  const full = resolveSafeAssetPath(relPath);
  await atomicWriteJson(full, materialDefinitionForDisk(definition));

  const entry = {
    id,
    kind: 'material',
    name: definition.name,
    folder: 'Materials',
    path: relPath,
    originalName: `${id}.json`,
    tags: [],
    meta: materialRegistryMeta(definition),
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };

  try {
    return await mutateRegistry(async (registry) => {
      const existingIdx = registry.assets.findIndex((a) => a.id === id);
      if (existingIdx >= 0) registry.assets[existingIdx] = entry;
      else registry.assets.push(entry);
      return { ok: true, asset: entry, definition, registry };
    });
  } catch (err) {
    try { await fs.unlink(full); } catch { /* ignore */ }
    throw err;
  }
}

async function updateMaterialAsset(id, body) {
  if (!id) throw new Error('Missing material id');
  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'material');
    if (!entry) throw new Error('Material not found');

    const full = resolveSafeAssetPath(entry.path);
    const current = JSON.parse(await fs.readFile(full, 'utf8'));
    const definition = normalizeMaterialDefinition({
      ...current,
      ...body,
      id,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
      previewPath: body.previewPath ?? current.previewPath ?? null,
    });

    const mapsChanged = Object.keys(body || {}).some((key) => (
      key !== 'updatedAt' && key !== 'createdAt' && key !== 'id'
    ));
    if (mapsChanged || !definition.previewPath) {
      definition.previewPath = bakeMaterialSpherePreview(definition, registry) || definition.previewPath;
    }

    await atomicWriteJson(full, materialDefinitionForDisk(definition));

    entry.name = definition.name || entry.name;
    entry.updatedAt = definition.updatedAt;
    entry.meta = materialRegistryMeta(definition);
    return { ok: true, asset: entry, definition, registry };
  });
}

async function createPrefabAsset(body) {
  const id = body.id || `prefab_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const definition = {
    schemaVersion: 1,
    id,
    name: body.name || 'Prefab',
    type: 'prefab',
    rootTemplateIds: Array.isArray(body.rootTemplateIds) ? body.rootTemplateIds : [],
    actors: Array.isArray(body.actors) ? body.actors : [],
    nestedPrefabIds: Array.isArray(body.nestedPrefabIds) ? body.nestedPrefabIds : [],
    createdAt: body.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const relPath = `${KIND_DIRS.prefab}/${id}.json`;
  const full = resolveSafeAssetPath(relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });

  const entry = {
    id,
    kind: 'prefab',
    name: definition.name,
    folder: 'Prefabs',
    path: relPath,
    originalName: `${id}.json`,
    tags: Array.isArray(body.tags) ? body.tags : [],
    meta: {
      actorCount: definition.actors.length,
      nestedCount: definition.nestedPrefabIds.length,
      rootCount: definition.rootTemplateIds.length,
    },
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };

  await atomicWriteJson(full, definition);

  try {
    return await mutateRegistry(async (registry) => {
      const existingIdx = registry.assets.findIndex((a) => a.id === id);
      if (existingIdx >= 0) registry.assets[existingIdx] = entry;
      else registry.assets.push(entry);
      return { ok: true, asset: entry, definition, registry };
    });
  } catch (err) {
    try { await fs.unlink(full); } catch { /* ignore */ }
    throw err;
  }
}

async function updatePrefabAsset(id, body) {
  if (!id) throw new Error('Missing prefab id');
  return mutateRegistry(async (registry) => {
    const entry = registry.assets.find((a) => a.id === id && a.kind === 'prefab');
    if (!entry) throw new Error('Prefab not found');

    const full = resolveSafeAssetPath(entry.path);
    const current = JSON.parse(await fs.readFile(full, 'utf8'));
    const definition = {
      ...current,
      ...body,
      id,
      type: 'prefab',
      schemaVersion: 1,
      updatedAt: Date.now(),
    };
    await atomicWriteJson(full, definition);

    entry.name = definition.name || entry.name;
    entry.updatedAt = definition.updatedAt;
    entry.meta = {
      actorCount: Array.isArray(definition.actors) ? definition.actors.length : 0,
      nestedCount: Array.isArray(definition.nestedPrefabIds)
        ? definition.nestedPrefabIds.length
        : 0,
      rootCount: Array.isArray(definition.rootTemplateIds)
        ? definition.rootTemplateIds.length
        : 0,
    };
    return { ok: true, asset: entry, definition, registry };
  });
}

function postProcessingPresetsPath() {
  return path.join(ASSETS_DIR, 'postprocessing-presets.json');
}

async function readPostProcessingPresets() {
  await ensureAssetDirs();
  const full = postProcessingPresetsPath();
  try {
    const raw = await fs.readFile(full, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
    };
  } catch {
    return { schemaVersion: 1, presets: [] };
  }
}

async function writePostProcessingPresets(body) {
  await ensureAssetDirs();
  const presets = Array.isArray(body?.presets) ? body.presets : [];
  const cleaned = presets
    .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.id)
    .map((p) => ({
      id: String(p.id),
      label: String(p.label || p.id),
      builtin: false,
      settings: p.settings && typeof p.settings === 'object' ? p.settings : {},
      updatedAt: Number(p.updatedAt) || Date.now(),
    }));
  const payload = { schemaVersion: 1, presets: cleaned };
  await atomicWriteJson(postProcessingPresetsPath(), payload);
  return payload;
}

function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function sendJson(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return readBodyLimited(req, DEFAULT_JSON_BODY_LIMIT);
}

function readBodyBuffer(req, limit = DEFAULT_UPLOAD_LIMIT) {
  return readBodyBufferLimited(req, limit);
}
