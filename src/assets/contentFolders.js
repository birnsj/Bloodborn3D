/**
 * Virtual Content Browser folders (registry paths, not on-disk directories).
 * Paths use `/` separators: `Textures`, `Textures/Walls`.
 */

import { ASSET_FOLDERS } from '../data/sampleAssets.js';

export const BUILTIN_CONTENT_FOLDERS = [...ASSET_FOLDERS];

const FOLDER_NAME_RE = /^[\w][\w .+-]{0,62}$/;

export function normalizeFolderPath(raw) {
  if (raw == null) return '';
  const parts = String(raw)
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.some((p) => p === '.' || p === '..')) return '';
  return parts.join('/');
}

export function folderNameOf(path) {
  const p = normalizeFolderPath(path);
  if (!p) return '';
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

export function folderParentOf(path) {
  const p = normalizeFolderPath(path);
  if (!p) return null;
  const i = p.lastIndexOf('/');
  return i < 0 ? null : p.slice(0, i);
}

export function isBuiltinContentFolder(path) {
  const p = normalizeFolderPath(path);
  return BUILTIN_CONTENT_FOLDERS.includes(p);
}

export function isValidFolderName(name) {
  const n = String(name || '').trim();
  if (!n || n.includes('/') || n.includes('\\')) return false;
  return FOLDER_NAME_RE.test(n);
}

export function isDescendantFolderPath(path, maybeAncestor) {
  const child = normalizeFolderPath(path);
  const ancestor = normalizeFolderPath(maybeAncestor);
  if (!child || !ancestor) return false;
  return child === ancestor || child.startsWith(`${ancestor}/`);
}

/**
 * Merge built-ins, persisted folder list, and folders referenced by assets.
 * Preserves relative sibling order from `persisted` when possible.
 */
export function normalizeContentFolderList(persisted, assets = [], builtins = BUILTIN_CONTENT_FOLDERS) {
  const set = new Set();
  const add = (raw) => {
    const p = normalizeFolderPath(raw);
    if (!p) return;
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      set.add(parts.slice(0, i).join('/'));
    }
  };

  for (const b of builtins) add(b);
  for (const f of Array.isArray(persisted) ? persisted : []) add(f);
  for (const asset of assets || []) add(asset?.folder);

  const hint = [];
  const hintSeen = new Set();
  const pushHint = (raw) => {
    const p = normalizeFolderPath(raw);
    if (!p || hintSeen.has(p) || !set.has(p)) return;
    hintSeen.add(p);
    hint.push(p);
  };
  for (const b of builtins) pushHint(b);
  for (const f of Array.isArray(persisted) ? persisted : []) pushHint(f);
  for (const p of set) pushHint(p);

  const hintIndex = new Map(hint.map((p, i) => [p, i]));
  return [...set].sort((a, b) => {
    const pa = folderParentOf(a);
    const pb = folderParentOf(b);
    // Group by parent path string so siblings compare together; parents before
    // unrelated deeper paths via depth when parents differ is not required for
    // buildFolderTree — only sibling order matters.
    if (pa !== pb) {
      const da = a.split('/').length;
      const db = b.split('/').length;
      if (da !== db) return da - db;
      return a.localeCompare(b);
    }
    const ia = hintIndex.get(a) ?? 1e9;
    const ib = hintIndex.get(b) ?? 1e9;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

export function buildFolderTree(folderPaths) {
  const paths = normalizeContentFolderList(folderPaths, []);
  const nodes = new Map();
  for (const path of paths) {
    nodes.set(path, { path, name: folderNameOf(path), children: [] });
  }
  const roots = [];
  for (const path of paths) {
    const parent = folderParentOf(path);
    const node = nodes.get(path);
    if (parent && nodes.has(parent)) nodes.get(parent).children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function countAssetsInFolder(assets, folderPath, { recursive = false } = {}) {
  const folder = normalizeFolderPath(folderPath);
  if (!folder) return 0;
  let n = 0;
  for (const asset of assets || []) {
    const af = normalizeFolderPath(asset?.folder);
    if (!af) continue;
    if (recursive) {
      if (isDescendantFolderPath(af, folder)) n += 1;
    } else if (af === folder) n += 1;
  }
  return n;
}

function remapFolderPath(path, from, to) {
  const p = normalizeFolderPath(path);
  const src = normalizeFolderPath(from);
  const dst = normalizeFolderPath(to);
  if (!p || !src || !dst) return p;
  if (p === src) return dst;
  if (p.startsWith(`${src}/`)) return `${dst}${p.slice(src.length)}`;
  return p;
}

/**
 * Apply a folder mutation to a registry-like object.
 * Returns { ok, error?, registry }.
 */
export function applyFolderOp(registry, op) {
  const assets = Array.isArray(registry?.assets) ? registry.assets.map((a) => ({ ...a })) : [];
  let folders = normalizeContentFolderList(registry?.folders, assets);

  const fail = (error) => ({ ok: false, error, registry: { ...registry, folders, assets } });

  if (!op || typeof op !== 'object') return fail('Missing folder operation.');

  if (op.type === 'create') {
    const parent = op.parent == null || op.parent === ''
      ? null
      : normalizeFolderPath(op.parent);
    if (parent && !folders.includes(parent)) return fail('Parent folder does not exist.');
    if (!isValidFolderName(op.name)) {
      return fail('Folder names can use letters, numbers, spaces, . + - _ (max 63).');
    }
    const name = String(op.name).trim();
    const path = parent ? `${parent}/${name}` : name;
    if (folders.includes(path)) return fail('A folder with that name already exists.');
    // Insert after last child of parent (or at end of roots).
    const siblings = folders.filter((f) => folderParentOf(f) === parent);
    if (siblings.length) {
      const last = siblings[siblings.length - 1];
      const idx = folders.indexOf(last);
      folders = [...folders.slice(0, idx + 1), path, ...folders.slice(idx + 1)];
    } else if (parent) {
      const pIdx = folders.indexOf(parent);
      folders = [...folders.slice(0, pIdx + 1), path, ...folders.slice(pIdx + 1)];
    } else {
      folders = [...folders, path];
    }
    return { ok: true, registry: { ...registry, folders, assets }, path };
  }

  if (op.type === 'rename') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be renamed.');
    if (!isValidFolderName(op.name)) {
      return fail('Folder names can use letters, numbers, spaces, . + - _ (max 63).');
    }
    const name = String(op.name).trim();
    const parent = folderParentOf(path);
    const nextPath = parent ? `${parent}/${name}` : name;
    if (nextPath !== path && folders.includes(nextPath)) {
      return fail('A folder with that name already exists.');
    }
    folders = folders.map((f) => remapFolderPath(f, path, nextPath));
    for (const asset of assets) {
      asset.folder = remapFolderPath(asset.folder, path, nextPath);
      asset.updatedAt = Date.now();
    }
    folders = normalizeContentFolderList(folders, assets);
    return { ok: true, registry: { ...registry, folders, assets }, path: nextPath };
  }

  if (op.type === 'delete') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be deleted.');
    const assetCount = countAssetsInFolder(assets, path, { recursive: true });
    if (assetCount > 0) {
      return fail(`Folder is not empty (${assetCount} asset${assetCount === 1 ? '' : 's'}). Move or delete assets first.`);
    }
    folders = folders.filter((f) => !isDescendantFolderPath(f, path));
    return { ok: true, registry: { ...registry, folders, assets } };
  }

  if (op.type === 'move') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be moved.');
    const parent = op.parent == null || op.parent === ''
      ? null
      : normalizeFolderPath(op.parent);
    if (parent) {
      if (!folders.includes(parent)) return fail('Destination folder does not exist.');
      if (isDescendantFolderPath(parent, path)) {
        return fail('Cannot move a folder into itself or a child.');
      }
    }
    const name = folderNameOf(path);
    const nextPath = parent ? `${parent}/${name}` : name;
    if (nextPath !== path && folders.includes(nextPath)) {
      return fail('A folder with that name already exists in the destination.');
    }
    folders = folders.map((f) => remapFolderPath(f, path, nextPath));
    for (const asset of assets) {
      asset.folder = remapFolderPath(asset.folder, path, nextPath);
      asset.updatedAt = Date.now();
    }
    folders = normalizeContentFolderList(folders, assets);
    // Place moved node after last sibling under new parent.
    const without = folders.filter((f) => f !== nextPath && !isDescendantFolderPath(f, nextPath));
    const movedBranch = folders.filter((f) => f === nextPath || isDescendantFolderPath(f, nextPath));
    const siblings = without.filter((f) => folderParentOf(f) === parent);
    if (siblings.length) {
      const last = siblings[siblings.length - 1];
      const idx = without.indexOf(last);
      folders = [...without.slice(0, idx + 1), ...movedBranch, ...without.slice(idx + 1)];
    } else if (parent) {
      const pIdx = without.indexOf(parent);
      folders = [...without.slice(0, pIdx + 1), ...movedBranch, ...without.slice(pIdx + 1)];
    } else {
      folders = [...without, ...movedBranch];
    }
    return { ok: true, registry: { ...registry, folders, assets }, path: nextPath };
  }

  if (op.type === 'reorder') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    const direction = op.direction === 'up' ? -1 : 1;
    const parent = folderParentOf(path);
    const siblings = folders.filter((f) => folderParentOf(f) === parent);
    const sibIdx = siblings.indexOf(path);
    const swapWith = siblings[sibIdx + direction];
    if (!swapWith) return { ok: true, registry: { ...registry, folders, assets }, path };

    const branchOf = (root) => folders.filter((f) => f === root || isDescendantFolderPath(f, root));
    const pathBranch = branchOf(path);
    const swapBranch = branchOf(swapWith);
    const skip = new Set([...pathBranch, ...swapBranch]);
    // Emit path before swapWith when moving up; swapWith before path when moving down.
    const earlyBranch = direction < 0 ? pathBranch : swapBranch;
    const lateBranch = direction < 0 ? swapBranch : pathBranch;
    const earlyRoot = direction < 0 ? swapWith : path;
    const rebuilt = [];
    let inserted = false;
    for (const f of folders) {
      if (skip.has(f)) {
        if (!inserted && f === earlyRoot) {
          rebuilt.push(...earlyBranch, ...lateBranch);
          inserted = true;
        }
        continue;
      }
      rebuilt.push(f);
    }
    folders = inserted ? rebuilt : folders;
    return { ok: true, registry: { ...registry, folders, assets }, path };
  }

  if (op.type === 'move-asset') {
    const assetId = String(op.assetId || '');
    const folder = normalizeFolderPath(op.folder);
    if (!assetId) return fail('Missing asset id.');
    if (!folder || !folders.includes(folder)) return fail('Destination folder does not exist.');
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return fail('Asset not found.');
    asset.folder = folder;
    asset.updatedAt = Date.now();
    return { ok: true, registry: { ...registry, folders, assets } };
  }

  return fail(`Unknown folder operation: ${op.type}`);
}
