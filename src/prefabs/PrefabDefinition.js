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

  // Drop duplicate template ids (keep first) and clear orphan parent links.
  const seen = new Set();
  const uniqueActors = [];
  for (const actor of actors) {
    const tid = String(actor.id);
    if (seen.has(tid)) continue;
    seen.add(tid);
    uniqueActors.push(actor);
  }
  for (const actor of uniqueActors) {
    if (actor.parentId && !seen.has(String(actor.parentId))) {
      actor.parentId = null;
    }
  }

  const rootTemplateIds = Array.isArray(raw.rootTemplateIds)
    ? raw.rootTemplateIds.map(String).filter((tid) => seen.has(tid))
    : uniqueActors.filter((a) => !a.parentId).map((a) => a.id);

  const nested = new Set(
    Array.isArray(raw.nestedPrefabIds) ? raw.nestedPrefabIds.map(String) : [],
  );
  for (const actor of uniqueActors) {
    const pid = actor.prefab?.prefabId;
    if (pid) nested.add(String(pid));
  }

  return {
    schemaVersion: PREFAB_SCHEMA_VERSION,
    id,
    name: String(raw.name || id),
    type: 'prefab',
    rootTemplateIds,
    actors: uniqueActors,
    nestedPrefabIds: [...nested],
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function collectNestedPrefabIds(definition) {
  const def = normalizePrefabDefinition(definition);
  return def ? [...def.nestedPrefabIds] : [];
}
