/**
 * Lightweight sample asset catalog for Content Browser / Asset Viewer.
 * Not a production asset pipeline — descriptors only.
 */

export const ASSET_FOLDERS = [
  'Meshes',
  'Materials',
  'Textures',
  'Environments',
  'Prefabs',
  'Audio',
  'AI Assets',
];

/** @typedef {'mesh'|'material'|'texture'|'prefab'|'audio'|'ai'} AssetType */

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   type: AssetType,
 *   folder: string,
 *   tags?: string[],
 *   preview?: { kind: string, color?: string, secondary?: string, note?: string },
 *   meta?: Record<string, string|number|boolean>
 * }>}
 */
export const SAMPLE_ASSETS = [
  {
    id: 'mesh.crate',
    name: 'Crate',
    type: 'mesh',
    folder: 'Meshes',
    tags: ['prop', 'wood'],
    preview: { kind: 'mesh', note: 'Static mesh placeholder' },
    meta: { tris: 240, materials: 1 },
  },
  {
    id: 'mesh.door',
    name: 'Door Frame',
    type: 'mesh',
    folder: 'Meshes',
    tags: ['architecture'],
    preview: { kind: 'mesh', note: 'Static mesh placeholder' },
    meta: { tris: 860, materials: 2 },
  },
  {
    id: 'mat.bloodsteel',
    name: 'Bloodsteel',
    type: 'material',
    folder: 'Materials',
    tags: ['metal'],
    preview: { kind: 'swatch', color: '#6b2a32', secondary: '#2a3038' },
    meta: { shading: 'standard', roughness: 0.35 },
  },
  {
    id: 'mat.stone',
    name: 'Ashen Stone',
    type: 'material',
    folder: 'Materials',
    tags: ['stone'],
    preview: { kind: 'swatch', color: '#7a7f88', secondary: '#4a5058' },
    meta: { shading: 'standard', roughness: 0.82 },
  },
  {
    id: 'tex.noise',
    name: 'Noise Mask',
    type: 'texture',
    folder: 'Textures',
    tags: ['mask'],
    preview: { kind: 'checker', color: '#c8cdd6', secondary: '#3a4250' },
    meta: { width: 512, height: 512, format: 'RGBA' },
  },
  {
    id: 'tex.blood',
    name: 'Blood Splash',
    type: 'texture',
    folder: 'Textures',
    tags: ['decal'],
    preview: { kind: 'swatch', color: '#8b3a42', secondary: '#1a1012' },
    meta: { width: 1024, height: 1024, format: 'RGBA' },
  },
  {
    id: 'prefab.spawn',
    name: 'Player Start',
    type: 'prefab',
    folder: 'Prefabs',
    tags: ['gameplay'],
    preview: { kind: 'badge', note: 'Prefab shell' },
    meta: { actors: 1 },
  },
  {
    id: 'audio.ambience',
    name: 'Hall Ambience',
    type: 'audio',
    folder: 'Audio',
    tags: ['loop'],
    preview: { kind: 'badge', note: 'Audio clip placeholder' },
    meta: { durationSec: 12, channels: 2 },
  },
  {
    id: 'ai.patrol',
    name: 'Patrol Behavior',
    type: 'ai',
    folder: 'AI Assets',
    tags: ['behavior'],
    preview: { kind: 'badge', note: 'AI asset placeholder' },
    meta: { version: 1 },
  },
];

export function getAssetById(id) {
  return SAMPLE_ASSETS.find((a) => a.id === id) || null;
}

export function listAssetsInFolder(folder) {
  if (!folder) return SAMPLE_ASSETS;
  return SAMPLE_ASSETS.filter((a) => a.folder === folder);
}

export function filterAssets({ folder, query } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return SAMPLE_ASSETS.filter((a) => {
    if (folder && a.folder !== folder) return false;
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q)
      || a.id.toLowerCase().includes(q)
      || a.type.toLowerCase().includes(q)
      || (a.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });
}

export const ASSET_DRAG_MIME = 'application/x-bloodbound-asset';
