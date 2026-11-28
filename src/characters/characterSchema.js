/**
 * Engine-neutral Character documents (Characters workspace v0).
 * No Three.js types — meshAssetId references AssetRegistry mesh entries.
 */

export const CHARACTER_SCHEMA_VERSION = 1;

/** @typedef {{
 *   schemaVersion: number,
 *   id: string,
 *   name: string,
 *   meshAssetId: string,
 *   heightMeters: number|null,
 *   meshyRigTaskId: string|null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} CharacterDoc */

export function createEmptyCharacterIndex() {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characters: [],
  };
}

export function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const meshAssetId = String(raw.meshAssetId || '').trim();
  if (!id || !meshAssetId) return null;
  const height = raw.heightMeters == null || raw.heightMeters === ''
    ? null
    : Number(raw.heightMeters);
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: String(raw.name || id).trim() || id,
    meshAssetId,
    heightMeters: Number.isFinite(height) && height > 0 ? height : null,
    meshyRigTaskId: raw.meshyRigTaskId ? String(raw.meshyRigTaskId) : null,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function normalizeCharacterIndex(raw) {
  const empty = createEmptyCharacterIndex();
  if (!raw || typeof raw !== 'object') return empty;
  const list = Array.isArray(raw.characters)
    ? raw.characters.map(normalizeCharacter).filter(Boolean)
    : [];
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characters: list,
  };
}

export function createCharacterDoc({
  id,
  name,
  meshAssetId,
  heightMeters = null,
  meshyRigTaskId = null,
} = {}) {
  const now = Date.now();
  return normalizeCharacter({
    id,
    name,
    meshAssetId,
    heightMeters,
    meshyRigTaskId,
    createdAt: now,
    updatedAt: now,
  });
}
