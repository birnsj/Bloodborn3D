/**
 * List files under the Meshy staging root for the editor Staging browser.
 * Paths are relative to stagingRoot; traversal outside the root is rejected.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MODEL_EXTS = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.usdz', '.3mf']);
const MAX_ENTRIES = 500;

export function normalizeStagingRelPath(relativePath) {
  const cleaned = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!cleaned) return '';
  if (cleaned.includes('..')) return null;
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.some((p) => p === '.' || p === '..')) return null;
  return parts.join('/');
}

export function resolveStagingPath(stagingRoot, relativePath) {
  const rel = normalizeStagingRelPath(relativePath);
  if (rel == null) {
    const err = new Error('Invalid staging path');
    err.code = 'PATH_ESCAPE';
    throw err;
  }
  const root = path.resolve(stagingRoot);
  const abs = rel ? path.resolve(root, rel) : root;
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    const err = new Error('Invalid staging path');
    err.code = 'PATH_ESCAPE';
    throw err;
  }
  return { root, abs, rel };
}

function classifyFile(name) {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (MODEL_EXTS.has(ext)) return 'model';
  if (ext === '.json') return 'json';
  return 'file';
}

/**
 * @returns {Promise<{
 *   ok: true,
 *   path: string,
 *   parent: string | null,
 *   entries: Array<{
 *     name: string,
 *     path: string,
 *     kind: 'dir' | 'file',
 *     fileKind?: string,
 *     bytes: number | null,
 *     mtime: number | null,
 *     previewable: boolean,
 *   }>,
 *   truncated: boolean,
 * }>}
 */
export async function listMeshyStagingDir(stagingRoot, relativePath = '') {
  const { abs, rel } = resolveStagingPath(stagingRoot, relativePath);
  let dirents;
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return {
        ok: true,
        path: rel,
        parent: parentOf(rel),
        entries: [],
        truncated: false,
        missing: true,
      };
    }
    throw err;
  }

  const entries = [];
  for (const dent of dirents) {
    if (entries.length >= MAX_ENTRIES) break;
    const name = dent.name;
    if (!name || name.startsWith('.')) continue;
    const childRel = rel ? `${rel}/${name}` : name;
    if (normalizeStagingRelPath(childRel) == null) continue;

    if (dent.isDirectory()) {
      entries.push({
        name,
        path: childRel,
        kind: 'dir',
        bytes: null,
        mtime: null,
        previewable: false,
      });
      continue;
    }

    if (!dent.isFile()) continue;
    let bytes = null;
    let mtime = null;
    try {
      const st = await fs.stat(path.join(abs, name));
      bytes = st.size;
      mtime = st.mtimeMs;
    } catch {
      // ignore stat failures
    }
    const fileKind = classifyFile(name);
    entries.push({
      name,
      path: childRel,
      kind: 'file',
      fileKind,
      bytes,
      mtime,
      previewable: fileKind === 'image',
    });
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    ok: true,
    path: rel,
    parent: parentOf(rel),
    entries,
    truncated: dirents.length > entries.length,
    missing: false,
  };
}

function parentOf(rel) {
  if (!rel) return null;
  const i = rel.lastIndexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}
