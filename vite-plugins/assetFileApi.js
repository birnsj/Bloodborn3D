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

const TEXTURE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ktx2']);
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
            const buffer = await readBodyBuffer(req, DEFAULT_UPLOAD_LIMIT);
            const result = await importTextureBuffer(buffer, originalName);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'import-mesh') {
            const result = await importBinaryAsset(req, 'mesh', MESH_EXTS);
            sendJson(res, 200, result);
            return;
          }

          if (req.method === 'POST' && action === 'create-material') {
            const body = JSON.parse(await readBody(req));
            const result = await createMaterialAsset(body);
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

          sendJson(res, 405, { error: 'Method or action not allowed' });
        } catch (err) {
          const status = err?.code === 'BODY_TOO_LARGE' ? 413
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
  // ktx2 is extension-only (no simple magic here); other textures require signatures.
  const base = path.basename(originalName || 'import.png');
  let ext = path.extname(base).toLowerCase() || '.png';
  if (ext === '.ktx2') {
    if (!TEXTURE_EXTS.has(ext)) throw Object.assign(new Error('Unsupported texture extension: .ktx2'), { code: 'INVALID_IMAGE' });
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

  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
  try {
    await fs.mkdir(path.dirname(originalFull), { recursive: true });
    await fs.copyFile(full, originalFull);

    const entry = {
      id,
      kind: 'texture',
      name: name || stripExt(base),
      folder: 'Textures',
      path: relPath,
      originalName: base,
      tags: Array.isArray(tags) ? tags : [],
      meta: {
        format: ext.replace('.', ''),
        bytes: bytes.length,
        magic: magic || null,
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

  const id = `mesh_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const storedName = `${id}${ext}`;
  const relPath = `${KIND_DIRS[kind]}/${storedName}`;
  const full = resolveSafeAssetPath(relPath);
  const originalRel = `${KIND_DIRS[kind]}/originals/${storedName}`;
  const originalFull = resolveSafeAssetPath(originalRel);

  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
  try {
    await fs.mkdir(path.dirname(originalFull), { recursive: true });
    await fs.copyFile(full, originalFull);

    const entry = {
      id,
      kind,
      name: stripExt(base),
      folder: 'Meshes',
      path: relPath,
      originalName: base,
      tags: [],
      meta: {
        format: ext === '.gltf' ? 'gltf' : 'glb',
        bytes: buffer.length,
        unitAssumption: 'meters',
        editorUnitsPerMeter: 100,
        scaleWarning: null,
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
    hasBaseMap: Boolean(definition.baseColorMapId),
    ...(definition.previewPath ? { previewPath: definition.previewPath } : {}),
  };
}

async function createMaterialAsset(body) {
  const id = body.id || `mat_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const definition = {
    schemaVersion: 1,
    id,
    name: body.name || 'New Material',
    type: 'material',
    baseColor: body.baseColor || '#8a9099',
    baseColorMapId: body.baseColorMapId || null,
    normalMapId: body.normalMapId || null,
    normalScale: Number.isFinite(Number(body.normalScale))
      ? Math.max(0, Number(body.normalScale))
      : 1,
    roughness: body.roughness ?? 0.75,
    metalness: body.metalness ?? 0.05,
    roughnessMapId: body.roughnessMapId || null,
    metalnessMapId: body.metalnessMapId || null,
    envMapIntensity: Number.isFinite(Number(body.envMapIntensity))
      ? Math.max(0, Number(body.envMapIntensity))
      : 1,
    emissive: body.emissive || '#000000',
    emissiveIntensity: body.emissiveIntensity ?? 0,
    emissiveMapId: body.emissiveMapId || null,
    opacity: body.opacity ?? 1,
    transparent: Boolean(body.transparent) || (body.opacity != null && body.opacity < 1),
    uvScale: body.uvScale || { x: 1, y: 1 },
    uvOffset: body.uvOffset || { x: 0, y: 0 },
    uvRotation: body.uvRotation ?? 0,
    previewPath: body.previewPath || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const registrySnapshot = await readRegistry();
  if (!definition.previewPath) {
    definition.previewPath = bakeMaterialSpherePreview(definition, registrySnapshot);
  }

  const relPath = `${KIND_DIRS.material}/${id}.json`;
  const full = resolveSafeAssetPath(relPath);
  await atomicWriteJson(full, definition);

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
    const definition = {
      ...current,
      ...body,
      id,
      type: 'material',
      schemaVersion: 1,
      updatedAt: Date.now(),
    };

    const mapsChanged = [
      'baseColor',
      'baseColorMapId',
      'normalMapId',
      'roughness',
      'roughnessMapId',
      'metalness',
    ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (mapsChanged || !definition.previewPath) {
      definition.previewPath = bakeMaterialSpherePreview(definition, registry) || definition.previewPath;
    }

    await atomicWriteJson(full, definition);

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
