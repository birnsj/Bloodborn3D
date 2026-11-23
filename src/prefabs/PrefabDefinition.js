/**
 * Engine-neutral prefab asset definition.
 * Actors use stable template IDs; parentId references other template IDs.
 */

export const PREFAB_SCHEMA_VERSION = 1;

export function createEmptyPrefabDefinition({
  id,
  name = 'Prefab',
} = {}) {
  return {
    schemaVersion: PREFAB_SCHEMA_VERSION,
    id: id || null,
    name,
    type: 'prefab',
    rootTemplateIds: [],
    actors: [],
    nestedPrefabIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function normalizePrefabDefinition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id ? String(raw.id) : null;
  if (!id) return null;
  const actors = Array.isArray(raw.actors)
    ? raw.actors.filter((a) => a && a.id).map((a) => structuredClone(a))
    : [];
  const rootTemplateIds = Array.isArray(raw.rootTemplateIds)
    ? raw.rootTemplateIds.map(String).filter((tid) => actors.some((a) => a.id === tid))
    : actors.filter((a) => !a.parentId).map((a) => a.id);

  const nested = new Set(
    Array.isArray(raw.nestedPrefabIds) ? raw.nestedPrefabIds.map(String) : [],
  );
  for (const actor of actors) {
    const pid = actor.prefab?.prefabId;
    if (pid) nested.add(String(pid));
  }

  return {
    schemaVersion: PREFAB_SCHEMA_VERSION,
    id,
    name: String(raw.name || id),
    type: 'prefab',
    rootTemplateIds,
    actors,
    nestedPrefabIds: [...nested],
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function collectNestedPrefabIds(definition) {
  const def = normalizePrefabDefinition(definition);
  return def ? [...def.nestedPrefabIds] : [];
}
