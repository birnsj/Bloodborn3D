/**
 * Virtual Content Browser folders (registry paths, not on-disk directories).
 * Paths use `/` separators: `Textures`, `Textures/Walls`.
 * Categories are root-level section headers (`folderMeta[path].kind === 'category'`).
 */

import { ASSET_FOLDERS } from '../data/sampleAssets.js';
import { normalizeIconColor } from '../core/iconColor.js';

export const BUILTIN_CONTENT_FOLDERS = [...ASSET_FOLDERS];

/** Default top-level section header wrapping project folders. */
export const DEFAULT_CONTENT_CATEGORY = 'Project Content';

export const FOLDER_KIND_FOLDER = 'folder';
export const FOLDER_KIND_CATEGORY = 'category';

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

/**
 * Keep only known paths; categories must stay root-level.
 * Optional `iconColor` (#rrggbb) is allowed on any folder/category entry.
 */
export function normalizeFolderMeta(raw, folders = []) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const folderSet = new Set(
    (Array.isArray(folders) ? folders : [])
      .map((f) => normalizeFolderPath(f))
      .filter(Boolean),
  );
  for (const [key, value] of Object.entries(raw)) {
    const path = normalizeFolderPath(key);
    if (!path) continue;
    if (folderSet.size && !folderSet.has(path)) continue;
    const iconColor = normalizeIconColor(value?.iconColor);
    const asCategory = value?.kind === FOLDER_KIND_CATEGORY
      && folderParentOf(path) == null
      && !isBuiltinContentFolder(path);
    if (asCategory) {
      out[path] = { kind: FOLDER_KIND_CATEGORY };
      if (iconColor) out[path].iconColor = iconColor;
      continue;
    }
    if (iconColor) {
      out[path] = { iconColor };
    }
  }
  return out;
}

export function getFolderIconColor(path, folderMeta) {
  const p = normalizeFolderPath(path);
  if (!p) return null;
  return normalizeIconColor(folderMeta?.[p]?.iconColor);
}

/**
 * When the registry has no category headers, insert `Project Content` at the
 * top so built-ins and roots sit under one organization section.
 */
export function ensureDefaultContentCategory(folders, folderMeta = {}) {
  const list = Array.isArray(folders) ? [...folders] : [];
  let meta = normalizeFolderMeta(folderMeta, list);
  const hasCategory = Object.values(meta).some((entry) => entry?.kind === FOLDER_KIND_CATEGORY);
  if (hasCategory) {
    return { folders: list, folderMeta: meta };
  }
  const name = DEFAULT_CONTENT_CATEGORY;
  const path = list.includes(name) ? uniqueFolderName(list, null, name) : name;
  const without = list.filter((f) => f !== path);
  const nextFolders = [path, ...without];
  meta = {
    ...meta,
    [path]: { kind: FOLDER_KIND_CATEGORY, ...(meta[path]?.iconColor ? { iconColor: meta[path].iconColor } : {}) },
  };
  return {
    folders: nextFolders,
    folderMeta: normalizeFolderMeta(meta, nextFolders),
  };
}

export function getFolderKind(path, folderMeta) {
  const p = normalizeFolderPath(path);
  if (!p) return FOLDER_KIND_FOLDER;
  return folderMeta?.[p]?.kind === FOLDER_KIND_CATEGORY
    ? FOLDER_KIND_CATEGORY
    : FOLDER_KIND_FOLDER;
}

export function isContentCategory(path, folderMeta) {
  return getFolderKind(path, folderMeta) === FOLDER_KIND_CATEGORY;
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
  // Prefer persisted order so user rearrange (including relative to builtins) sticks.
  for (const f of Array.isArray(persisted) ? persisted : []) pushHint(f);
  for (const b of builtins) pushHint(b);
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

/**
 * Build the Content Browser tree.
 * Real folders nest by path (`Textures/Walls`).
 * Categories are section headers only — they never own path children.
 * Following root folders (until the next category) render under the category
 * for collapse/indent; their registry paths stay unchanged.
 */
export function buildFolderTree(folderPaths, folderMeta = {}) {
  const paths = normalizeContentFolderList(folderPaths, []);
  const meta = normalizeFolderMeta(folderMeta, paths);
  const nodes = new Map();
  for (const path of paths) {
    nodes.set(path, {
      path,
      name: folderNameOf(path),
      kind: getFolderKind(path, meta),
      children: [],
    });
  }
  // Path nesting — skip category parents (legacy Category/Child becomes a root).
  const roots = [];
  for (const path of paths) {
    const parent = folderParentOf(path);
    const node = nodes.get(path);
    if (parent && nodes.has(parent) && !isContentCategory(parent, meta)) {
      nodes.get(parent).children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Section display: each category collects following roots until the next category.
  const sectioned = [];
  let currentCategory = null;
  for (const node of roots) {
    if (node.kind === FOLDER_KIND_CATEGORY) {
      currentCategory = node;
      sectioned.push(node);
      continue;
    }
    if (currentCategory) {
      currentCategory.children.push(node);
    } else {
      sectioned.push(node);
    }
  }
  return sectioned;
}

/** Root-level folder paths in list order (includes category headers). */
export function listRootFolders(folders) {
  return (Array.isArray(folders) ? folders : [])
    .map((f) => normalizeFolderPath(f))
    .filter((f) => f && folderParentOf(f) == null);
}

/**
 * Insert a folder branch at the end of a category section (after the header and
 * any existing section members, before the next category). Does not change paths.
 */
export function insertBranchIntoCategorySection(folders, folderMeta, categoryPath, branch) {
  const category = normalizeFolderPath(categoryPath);
  const moving = (Array.isArray(branch) ? branch : [])
    .map((f) => normalizeFolderPath(f))
    .filter(Boolean);
  if (!category || !moving.length) return Array.isArray(folders) ? [...folders] : [];
  const skip = new Set(moving);
  const without = (Array.isArray(folders) ? folders : []).filter((f) => !skip.has(f));
  const roots = listRootFolders(without);
  const catIdx = roots.indexOf(category);
  if (catIdx < 0) return [...without, ...moving];
  let end = catIdx + 1;
  while (end < roots.length && !isContentCategory(roots[end], folderMeta)) end += 1;
  const afterRoot = end > catIdx + 1 ? roots[end - 1] : category;
  const afterBranch = branchOf(without, afterRoot);
  const last = afterBranch[afterBranch.length - 1];
  const insertAt = without.indexOf(last) + 1;
  return [...without.slice(0, insertAt), ...moving, ...without.slice(insertAt)];
}

/** Insert a single new root path into a category section. */
export function insertRootIntoCategorySection(folders, folderMeta, categoryPath, rootPath) {
  return insertBranchIntoCategorySection(folders, folderMeta, categoryPath, [rootPath]);
}

function remapFolderMeta(meta, from, to) {
  const next = {};
  for (const [key, value] of Object.entries(meta || {})) {
    const remapped = remapFolderPath(key, from, to);
    if (!remapped) continue;
    next[remapped] = value;
  }
  return normalizeFolderMeta(next, Object.keys(next));
}

function pruneFolderMeta(meta, folders) {
  return normalizeFolderMeta(meta, folders);
}

/** First unused sibling name: `Base`, then `Base Copy`, `Base Copy 2`, … */
export function uniqueFolderName(folders, parent, baseName) {
  const base = String(baseName || '').trim() || 'Folder';
  const pathFor = (name) => (parent ? `${parent}/${name}` : name);
  const existing = new Set(Array.isArray(folders) ? folders : []);
  if (!existing.has(pathFor(base))) return base;
  const copyBase = `${base} Copy`;
  if (!existing.has(pathFor(copyBase))) return copyBase;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${copyBase} ${n}`;
    if (!existing.has(pathFor(candidate))) return candidate;
  }
  return `${copyBase} ${Date.now()}`;
}

function branchOf(folders, root) {
  const path = normalizeFolderPath(root);
  return folders.filter((f) => f === path || isDescendantFolderPath(f, path));
}

/** Place `path` branch immediately before/after another sibling `anchor`. */
function placeBranchRelative(folders, path, anchor, position) {
  const src = normalizeFolderPath(path);
  const at = normalizeFolderPath(anchor);
  if (!src || !at || src === at) return folders;
  if (folderParentOf(src) !== folderParentOf(at)) return folders;
  const moving = branchOf(folders, src);
  const skip = new Set(moving);
  const without = folders.filter((f) => !skip.has(f));
  const anchorBranch = branchOf(without, at);
  if (!anchorBranch.length) return folders;
  const anchorStart = without.indexOf(anchorBranch[0]);
  const anchorEnd = without.indexOf(anchorBranch[anchorBranch.length - 1]);
  if (anchorStart < 0 || anchorEnd < 0) return folders;
  const insertAt = position === 'before' ? anchorStart : anchorEnd + 1;
  return [
    ...without.slice(0, insertAt),
    ...moving,
    ...without.slice(insertAt),
  ];
}

function insertBranchUnderParent(folders, branch, parent) {
  const without = folders.filter((f) => !branch.includes(f));
  const siblings = without.filter((f) => folderParentOf(f) === parent);
  if (siblings.length) {
    const last = siblings[siblings.length - 1];
    const lastBranch = branchOf(without, last);
    const end = without.indexOf(lastBranch[lastBranch.length - 1]);
    return [...without.slice(0, end + 1), ...branch, ...without.slice(end + 1)];
  }
  if (parent) {
    const pIdx = without.indexOf(parent);
    if (pIdx >= 0) {
      return [...without.slice(0, pIdx + 1), ...branch, ...without.slice(pIdx + 1)];
    }
  }
  return [...without, ...branch];
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
  let folderMeta = normalizeFolderMeta(registry?.folderMeta, folders);
  // Keep a Project Content section when the registry has no category headers.
  ({ folders, folderMeta } = ensureDefaultContentCategory(folders, folderMeta));

  const fail = (error) => ({
    ok: false,
    error,
    registry: { ...registry, folders, assets, folderMeta },
  });
  const ok = (path) => ({
    ok: true,
    registry: { ...registry, folders, assets, folderMeta },
    ...(path != null ? { path } : {}),
  });

  if (!op || typeof op !== 'object') return fail('Missing folder operation.');

  if (op.type === 'create') {
    const parent = op.parent == null || op.parent === ''
      ? null
      : normalizeFolderPath(op.parent);
    const kind = op.kind === FOLDER_KIND_CATEGORY
      ? FOLDER_KIND_CATEGORY
      : FOLDER_KIND_FOLDER;
    if (kind === FOLDER_KIND_CATEGORY && parent != null) {
      return fail('Categories can only be created at the top level.');
    }
    if (parent && !folders.includes(parent)) return fail('Parent folder does not exist.');
    if (!isValidFolderName(op.name)) {
      return fail('Folder names can use letters, numbers, spaces, . + - _ (max 63).');
    }
    const name = String(op.name).trim();
    // Categories are section headers, not path parents — create a top-level folder
    // and place it in that category's section.
    const parentIsCategory = parent != null && isContentCategory(parent, folderMeta);
    const path = parent && !parentIsCategory ? `${parent}/${name}` : name;
    if (folders.includes(path)) return fail('A folder with that name already exists.');
    if (parentIsCategory) {
      folders = insertRootIntoCategorySection(folders, folderMeta, parent, path);
    } else {
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
    }
    if (kind === FOLDER_KIND_CATEGORY) {
      folderMeta = { ...folderMeta, [path]: { kind: FOLDER_KIND_CATEGORY } };
    }
    return ok(path);
  }

  if (op.type === 'set-icon-color') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    const iconColor = normalizeIconColor(op.iconColor);
    const prev = folderMeta[path] || {};
    const nextEntry = {};
    if (prev.kind === FOLDER_KIND_CATEGORY) nextEntry.kind = FOLDER_KIND_CATEGORY;
    if (iconColor) nextEntry.iconColor = iconColor;
    if (nextEntry.kind || nextEntry.iconColor) {
      folderMeta = { ...folderMeta, [path]: nextEntry };
    } else {
      const { [path]: _removed, ...rest } = folderMeta;
      folderMeta = rest;
    }
    folderMeta = pruneFolderMeta(folderMeta, folders);
    return ok(path);
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
    folderMeta = remapFolderMeta(folderMeta, path, nextPath);
    folders = normalizeContentFolderList(folders, assets);
    folderMeta = pruneFolderMeta(folderMeta, folders);
    return ok(nextPath);
  }

  if (op.type === 'delete') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be deleted.');
    // Categories are headers only — deleting one removes the header, not section folders.
    if (isContentCategory(path, folderMeta)) {
      folders = folders.filter((f) => f !== path);
      folderMeta = pruneFolderMeta(folderMeta, folders);
      return ok();
    }
    const assetCount = countAssetsInFolder(assets, path, { recursive: true });
    if (assetCount > 0) {
      return fail(`Folder is not empty (${assetCount} asset${assetCount === 1 ? '' : 's'}). Move or delete assets first.`);
    }
    folders = folders.filter((f) => !isDescendantFolderPath(f, path));
    folderMeta = pruneFolderMeta(folderMeta, folders);
    return ok();
  }

  if (op.type === 'move') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be moved.');
    const parent = op.parent == null || op.parent === ''
      ? null
      : normalizeFolderPath(op.parent);
    if (isContentCategory(path, folderMeta) && parent != null) {
      return fail('Categories stay at the top level.');
    }
    if (parent) {
      if (!folders.includes(parent)) return fail('Destination folder does not exist.');
      if (isDescendantFolderPath(parent, path)) {
        return fail('Cannot move a folder into itself or a child.');
      }
    }

    // Moving into a category = place that folder in the section. Categories are not
    // path parents — promote nested folders to root so they can sit in the section.
    const parentIsCategory = parent != null && isContentCategory(parent, folderMeta);
    if (parentIsCategory) {
      const name = folderNameOf(path);
      const nextPath = folderParentOf(path) == null ? path : name;
      if (nextPath !== path && folders.includes(nextPath)) {
        return fail('A folder with that name already exists at the top level.');
      }
      if (nextPath !== path) {
        folders = folders.map((f) => remapFolderPath(f, path, nextPath));
        for (const asset of assets) {
          asset.folder = remapFolderPath(asset.folder, path, nextPath);
          asset.updatedAt = Date.now();
        }
        folderMeta = remapFolderMeta(folderMeta, path, nextPath);
        folders = normalizeContentFolderList(folders, assets);
      }
      const movedBranch = branchOf(folders, nextPath);
      folders = insertBranchIntoCategorySection(folders, folderMeta, parent, movedBranch);
      folderMeta = pruneFolderMeta(folderMeta, folders);
      return ok(nextPath);
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
    folderMeta = remapFolderMeta(folderMeta, path, nextPath);
    folders = normalizeContentFolderList(folders, assets);
    const movedBranch = branchOf(folders, nextPath);
    folders = insertBranchUnderParent(folders, movedBranch, parent);
    const anchor = op.before || op.after;
    if (anchor) {
      const at = normalizeFolderPath(anchor);
      const position = op.before ? 'before' : 'after';
      if (at && folders.includes(at) && folderParentOf(at) === parent && at !== nextPath) {
        folders = placeBranchRelative(folders, nextPath, at, position);
      }
    }
    folderMeta = pruneFolderMeta(folderMeta, folders);
    return ok(nextPath);
  }

  if (op.type === 'reorder') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    const parent = folderParentOf(path);

    if (op.before || op.after) {
      const anchor = normalizeFolderPath(op.before || op.after);
      const position = op.before ? 'before' : 'after';
      if (!anchor || !folders.includes(anchor)) return fail('Reorder target not found.');
      if (folderParentOf(anchor) !== parent) {
        return fail('Reorder target must be a sibling.');
      }
      if (anchor === path) return ok(path);
      folders = placeBranchRelative(folders, path, anchor, position);
      return ok(path);
    }

    const direction = op.direction === 'up' ? -1 : 1;
    const siblings = folders.filter((f) => folderParentOf(f) === parent);
    const sibIdx = siblings.indexOf(path);
    const swapWith = siblings[sibIdx + direction];
    if (!swapWith) return ok(path);

    const pathBranch = branchOf(folders, path);
    const swapBranch = branchOf(folders, swapWith);
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
    return ok(path);
  }

  if (op.type === 'copy') {
    const path = normalizeFolderPath(op.path);
    if (!path || !folders.includes(path)) return fail('Folder not found.');
    if (isBuiltinContentFolder(path)) return fail('Built-in folders cannot be copied.');
    const sourceIsCategory = isContentCategory(path, folderMeta);
    const parent = op.parent == null || op.parent === ''
      ? null
      : normalizeFolderPath(op.parent);
    if (sourceIsCategory && parent != null) {
      return fail('Categories can only be copied to the top level.');
    }
    if (parent && isContentCategory(parent, folderMeta)) {
      // Copy into a category section as a new top-level folder/header.
    } else if (parent) {
      if (!folders.includes(parent)) return fail('Destination folder does not exist.');
      if (isDescendantFolderPath(parent, path)) {
        return fail('Cannot copy a folder into itself or a child.');
      }
    }
    const requested = op.name != null && String(op.name).trim()
      ? String(op.name).trim()
      : folderNameOf(path);
    if (!isValidFolderName(requested) && !isValidFolderName(folderNameOf(path))) {
      return fail('Folder names can use letters, numbers, spaces, . + - _ (max 63).');
    }
    const parentIsCategory = parent != null && isContentCategory(parent, folderMeta);
    const nameParent = parentIsCategory ? null : parent;
    const name = uniqueFolderName(
      folders,
      nameParent,
      isValidFolderName(requested) ? requested : folderNameOf(path),
    );
    // Category duplicate: header only (section members are independent folders).
    if (sourceIsCategory) {
      const nextRoot = name;
      if (folders.includes(nextRoot)) return fail('A folder with that name already exists.');
      folders = [...folders, nextRoot];
      const sourceMeta = folderMeta[path] || {};
      const copiedMeta = { kind: FOLDER_KIND_CATEGORY };
      if (sourceMeta.iconColor) copiedMeta.iconColor = sourceMeta.iconColor;
      folderMeta = { ...folderMeta, [nextRoot]: copiedMeta };
      folderMeta = pruneFolderMeta(folderMeta, folders);
      return ok(nextRoot);
    }
    const nextRoot = nameParent ? `${nameParent}/${name}` : name;
    if (folders.includes(nextRoot)) return fail('A folder with that name already exists in the destination.');

    const sourceBranch = branchOf(folders, path);
    const copiedBranch = sourceBranch.map((f) => remapFolderPath(f, path, nextRoot));
    if (parentIsCategory) {
      folders = insertBranchIntoCategorySection(folders, folderMeta, parent, copiedBranch);
    } else {
      folders = insertBranchUnderParent(folders, copiedBranch, parent);
    }

    const nextMeta = { ...folderMeta };
    folderMeta = pruneFolderMeta(nextMeta, folders);
    // Structure-only: assets stay in the original folders.
    return ok(nextRoot);
  }

  if (op.type === 'move-asset') {
    const assetId = String(op.assetId || '');
    const folder = normalizeFolderPath(op.folder);
    if (!assetId) return fail('Missing asset id.');
    if (!folder || !folders.includes(folder)) return fail('Destination folder does not exist.');
    if (isContentCategory(folder, folderMeta)) {
      return fail('Put assets in a folder, not on the category header.');
    }
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return fail('Asset not found.');
    asset.folder = folder;
    asset.updatedAt = Date.now();
    return ok();
  }

  return fail(`Unknown folder operation: ${op.type}`);
}
