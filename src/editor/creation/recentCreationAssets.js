/** Last-used mesh/prefab strip for the Creation toolbox Prefabs / Assets flyout. */

export const RECENT_CREATION_ASSETS_MAX = 8;
export const RECENT_CREATION_ASSETS_STORAGE_KEY = 'bloodbound.editor.creationRecentAssets.v1';
export const RECENT_CREATION_ASSETS_EVENT = 'bb:creation-recent-assets';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Array<{ id: string, kind: 'mesh'|'prefab', name?: string }>}
 */
export function loadRecentCreationAssets() {
  try {
    const raw = storage()?.getItem(RECENT_CREATION_ASSETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeRecentCreationAssets(parsed);
  } catch {
    return [];
  }
}

export function normalizeRecentCreationAssets(list = []) {
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String(entry.id || '').trim();
    const kind = entry.kind === 'prefab' ? 'prefab' : entry.kind === 'mesh' ? 'mesh' : null;
    if (!id || !kind || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind,
      name: typeof entry.name === 'string' && entry.name ? entry.name : id,
    });
    if (out.length >= RECENT_CREATION_ASSETS_MAX) break;
  }
  return out;
}

export function saveRecentCreationAssets(list) {
  const next = normalizeRecentCreationAssets(list);
  try {
    storage()?.setItem(RECENT_CREATION_ASSETS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/**
 * Push a placed mesh/prefab to the front of the recent list (max 8).
 * @returns {Array<{ id: string, kind: string, name?: string }>}
 */
export function rememberRecentCreationAsset(asset) {
  if (!asset?.id) return loadRecentCreationAssets();
  const kind = asset.kind === 'prefab' ? 'prefab' : asset.kind === 'mesh' ? 'mesh' : null;
  if (!kind) return loadRecentCreationAssets();
  const next = normalizeRecentCreationAssets([
    { id: asset.id, kind, name: asset.name || asset.id },
    ...loadRecentCreationAssets(),
  ]);
  saveRecentCreationAssets(next);
  try {
    window.dispatchEvent(new CustomEvent(RECENT_CREATION_ASSETS_EVENT, { detail: next }));
  } catch {
    /* non-browser */
  }
  return next;
}

/**
 * Build flyout tools for the Prefabs / Assets category from recent ids + live registry.
 * @param {Array<{id:string,name:string,kind:string,meta?:object,updatedAt?:number,path?:string}>} assets
 * @param {Array<{id:string,kind:string,name?:string}>} [recent]
 */
export function buildRecentCreationAssetTools(assets = [], recent = loadRecentCreationAssets()) {
  const placeable = new Map();
  for (const a of assets || []) {
    if (a && (a.kind === 'mesh' || a.kind === 'prefab')) placeable.set(a.id, a);
  }
  const tools = [];
  for (const entry of normalizeRecentCreationAssets(recent)) {
    const live = placeable.get(entry.id);
    if (!live) continue;
    tools.push({
      id: `asset.${live.id}`,
      label: live.name || entry.name || live.id,
      helpId: live.kind === 'prefab' ? 'creation.prefab' : 'creation.mesh',
      icon: live.kind === 'prefab' ? 'prefab' : 'mesh',
      action: 'asset',
      assetKind: live.kind,
      assetId: live.id,
      placement: 'upright',
      asset: live,
    });
  }
  return tools;
}
