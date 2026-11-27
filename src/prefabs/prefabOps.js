import { createId } from '../core/ids.js';
import { Actor } from '../core/Actor.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import { getDescendants, getWorldTransform, setWorldTransform } from '../core/hierarchy.js';
import {
  createEmptyPrefabDefinition,
  normalizePrefabDefinition,
} from './PrefabDefinition.js';

/**
 * Prefab operations: create, instantiate, sync, overrides, unpack, cycles.
 *
 * Instance linkage on actors:
 *   prefab: {
 *     prefabId, instanceId, templateId, isRoot?,
 *     ownerPrefabId?, ownerInstanceId?, ownerTemplateId?,
 *     overrides? // sparse deltas keyed by templateId — stored on isRoot only
 *   }
 */

/** Detect whether nesting `prefabId` inside a definition that already depends on `nestedIds` would cycle. */
export function wouldCreatePrefabCycle(prefabId, nestedPrefabIds, getDefinition) {
  if (!prefabId) return false;
  const stack = [...(nestedPrefabIds || [])];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === prefabId) return true;
    seen.add(id);
    const def = getDefinition?.(id);
    if (def?.nestedPrefabIds?.length) {
      stack.push(...def.nestedPrefabIds);
    } else if (def?.actors) {
      for (const a of def.actors) {
        if (a.prefab?.prefabId) stack.push(a.prefab.prefabId);
      }
    }
  }
  return false;
}

function expandSelection(world, actorIds) {
  const set = new Set();
  for (const id of actorIds) {
    const actor = world.getActor(id);
    if (!actor) continue;
    set.add(actor.id);
    for (const d of getDescendants(actor.id, world)) {
      set.add(d.id);
    }
  }
  return [...set].map((id) => world.getActor(id)).filter(Boolean);
}

/**
 * Build a prefab definition from world actors (selection + descendants).
 */
export function createPrefabFromActors(world, actorIds, {
  id,
  name = 'Prefab',
  getDefinition,
} = {}) {
  const actors = expandSelection(world, actorIds);
  if (actors.length === 0) {
    return { ok: false, error: 'No actors selected' };
  }

  const selectedSet = new Set(actors.map((a) => a.id));
  const idMap = new Map();
  for (const actor of actors) {
    idMap.set(actor.id, createId('tpl'));
  }

  const nestedPrefabIds = new Set();
  const templateActors = actors.map((actor) => {
    const json = actor.toJSON();
    json.id = idMap.get(actor.id);
    const parentInSet = actor.parentId && selectedSet.has(actor.parentId);
    json.parentId = parentInSet ? idMap.get(actor.parentId) : null;

    if (json.prefab?.prefabId) {
      nestedPrefabIds.add(json.prefab.prefabId);
      // Preserve nested source identity; drop instance/overrides from capture.
      json.prefab = {
        prefabId: json.prefab.prefabId,
        templateId: json.prefab.templateId || null,
        isRoot: Boolean(json.prefab.isRoot),
      };
    } else {
      delete json.prefab;
    }
    // Prefab assets must not embed map-specific authoring layer IDs.
    delete json.authoringLayerId;
    return json;
  });

  const prefabId = id || createId('prefab');
  if (wouldCreatePrefabCycle(prefabId, [...nestedPrefabIds], getDefinition)) {
    return { ok: false, error: 'Circular prefab dependency rejected' };
  }

  const rootTemplateIds = templateActors
    .filter((a) => !a.parentId)
    .map((a) => a.id);

  const definition = createEmptyPrefabDefinition({ id: prefabId, name });
  definition.actors = templateActors;
  definition.rootTemplateIds = rootTemplateIds;
  definition.nestedPrefabIds = [...nestedPrefabIds];
  definition.updatedAt = Date.now();

  return {
    ok: true,
    definition: normalizePrefabDefinition(definition),
    templateIdMap: Object.fromEntries(idMap),
  };
}

function deepCloneActorJson(json) {
  return structuredClone(json);
}

function applyOverrideToActorJson(actorJson, override) {
  if (!override) return actorJson;
  const next = deepCloneActorJson(actorJson);
  if (override.name != null) next.name = override.name;
  if (override.visible != null) next.visible = override.visible;
  if (override.locked != null) next.locked = override.locked;
  if (override.transform) {
    next.transform = {
      ...next.transform,
      ...override.transform,
      position: { ...next.transform.position, ...(override.transform.position || {}) },
      rotation: { ...next.transform.rotation, ...(override.transform.rotation || {}) },
      scale: { ...next.transform.scale, ...(override.transform.scale || {}) },
    };
  }
  if (override.components && Array.isArray(next.components)) {
    next.components = next.components.map((comp) => {
      const o = override.components[comp.type];
      if (!o) return comp;
      return { ...comp, ...o, type: comp.type, id: comp.id };
    });
  }
  return next;
}

function groupNestedInstances(templateActors) {
  /** @type {Map<string, string[]>} nestedKey -> template ids in that nested instance within definition */
  const groups = new Map();
  const groupOf = new Map();
  const byId = new Map(templateActors.map((a) => [a.id, a]));

  function findNestedRoot(actor) {
    let current = actor;
    while (current) {
      const parent = current.parentId ? byId.get(current.parentId) : null;
      if (
        !parent
        || !parent.prefab?.prefabId
        || parent.prefab.prefabId !== current.prefab?.prefabId
      ) {
        return current;
      }
      current = parent;
    }
    return actor;
  }

  for (const actor of templateActors) {
    if (!actor.prefab?.prefabId) continue;
    const root = findNestedRoot(actor);
    const key = `${root.prefab.prefabId}::${root.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(actor.id);
    groupOf.set(actor.id, key);
  }

  return { groups, groupOf };
}

/**
 * Instantiate a prefab into the world at a world transform.
 * Returns { actors, rootActorIds, instanceId }.
 */
export function instantiatePrefab(definition, world, {
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  scale = { x: 1, y: 1, z: 1 },
  parentId = null,
  existingIdMap = null,
  existingInstanceId = null,
  overrides = null,
  owner = null,
  existingNestedInstanceIds = null,
  existingNestedOverrides = null,
  /** @type {null | Record<string, { ownerPrefabId: string, ownerInstanceId: string, ownerTemplateId: string }>} */
  existingOwnerLinks = null,
} = {}) {
  const def = normalizePrefabDefinition(definition);
  if (!def) throw new Error('Invalid prefab definition');

  const instanceId = existingInstanceId || createId('pinst');
  const idMap = new Map(existingIdMap ? Object.entries(existingIdMap) : []);
  for (const tpl of def.actors) {
    if (!idMap.has(tpl.id)) {
      idMap.set(tpl.id, createId('actor'));
    }
  }

  const { groupOf } = groupNestedInstances(def.actors);
  const nestedInstanceIds = new Map();
  for (const key of new Set(groupOf.values())) {
    // group key is `${prefabId}::${nestedRootTemplateId}` — stable across syncs
    const preserved = existingNestedInstanceIds?.[key];
    nestedInstanceIds.set(key, preserved || createId('pinst'));
  }

  const overrideMap = overrides && typeof overrides === 'object' ? overrides : {};
  const rootTemplateIds = def.rootTemplateIds.length
    ? def.rootTemplateIds
    : def.actors.filter((a) => !a.parentId).map((a) => a.id);

  const byTplId = new Map(def.actors.map((a) => [a.id, a]));
  const actors = [];

  for (const tpl of def.actors) {
    let json = deepCloneActorJson(tpl);
    json = applyOverrideToActorJson(json, overrideMap[tpl.id]);
    json.id = idMap.get(tpl.id);
    json.parentId = tpl.parentId ? idMap.get(tpl.parentId) : null;

    const isRoot = rootTemplateIds.includes(tpl.id);
    const nestedKey = groupOf.get(tpl.id);
    const nestedInst = nestedKey ? nestedInstanceIds.get(nestedKey) : null;
    const parentTpl = tpl.parentId ? byTplId.get(tpl.parentId) : null;
    const isNestedRoot = Boolean(tpl.prefab?.prefabId) && (
      !parentTpl?.prefab?.prefabId
      || parentTpl.prefab.prefabId !== tpl.prefab.prefabId
    );

    if (tpl.prefab?.prefabId) {
      const nestedIsRoot = Boolean(tpl.prefab.isRoot) || isNestedRoot;
      json.prefab = {
        prefabId: tpl.prefab.prefabId,
        instanceId: nestedInst,
        templateId: tpl.prefab.templateId || tpl.id,
        isRoot: nestedIsRoot,
        ownerPrefabId: def.id,
        ownerInstanceId: instanceId,
        ownerTemplateId: tpl.id,
      };
      if (nestedIsRoot && nestedKey) {
        const nestedOv = existingNestedOverrides?.[nestedKey];
        if (nestedOv && Object.keys(nestedOv).length) {
          json.prefab.overrides = structuredClone(nestedOv);
        }
      }
    } else {
      const link = existingOwnerLinks?.[tpl.id] || (
        owner
          ? {
            ownerPrefabId: owner.prefabId,
            ownerInstanceId: owner.instanceId,
            ownerTemplateId: owner.templateId,
          }
          : null
      );
      json.prefab = {
        prefabId: def.id,
        instanceId,
        templateId: tpl.id,
        isRoot,
        ...(link
          ? {
            ownerPrefabId: link.ownerPrefabId,
            ownerInstanceId: link.ownerInstanceId,
            ownerTemplateId: link.ownerTemplateId,
          }
          : {}),
      };
      if (isRoot) {
        json.prefab.overrides = structuredClone(overrideMap);
      }
    }

    actors.push(Actor.fromJSON(json, createComponentFromJSON));
  }

  for (const actor of actors) {
    world.addActor(actor);
  }

  const placedRoots = rootTemplateIds
    .map((tid) => world.getActor(idMap.get(tid)))
    .filter(Boolean);

  if (placedRoots.length > 0) {
    const firstLocal = { ...placedRoots[0].transform.position };
    for (const root of placedRoots) {
      const dx = root.transform.position.x - firstLocal.x;
      const dy = root.transform.position.y - firstLocal.y;
      const dz = root.transform.position.z - firstLocal.z;
      const worldXform = {
        position: {
          x: position.x + dx,
          y: position.y + dy,
          z: position.z + dz,
        },
        rotation: { ...rotation },
        scale: { ...scale },
      };
      root.parentId = parentId || null;
      setWorldTransform(root, worldXform, world);
    }
  }

  return {
    actors,
    rootActorIds: placedRoots.map((a) => a.id),
    instanceId,
    idMap: Object.fromEntries(idMap),
  };
}

/** All actors belonging to a prefab instance (by instanceId on prefab or ownerInstanceId). */
export function getInstanceActors(world, instanceId) {
  if (!world || !instanceId) return [];
  return world.actors.filter((a) => (
    a.prefab?.instanceId === instanceId
    || a.prefab?.ownerInstanceId === instanceId
  ));
}

export function findInstanceRoot(world, instanceId) {
  const actors = getInstanceActors(world, instanceId);
  return actors.find((a) => a.prefab?.isRoot && a.prefab?.instanceId === instanceId)
    || actors.find((a) => a.prefab?.isRoot)
    || actors[0]
    || null;
}

export function getOverrides(rootActor) {
  return rootActor?.prefab?.overrides && typeof rootActor.prefab.overrides === 'object'
    ? structuredClone(rootActor.prefab.overrides)
    : {};
}

export function setOverride(rootActor, templateId, partial) {
  if (!rootActor?.prefab) return;
  if (!rootActor.prefab.overrides) rootActor.prefab.overrides = {};
  const prev = rootActor.prefab.overrides[templateId] || {};
  rootActor.prefab.overrides[templateId] = {
    ...prev,
    ...partial,
    transform: partial.transform
      ? {
        ...(prev.transform || {}),
        ...partial.transform,
        position: {
          ...(prev.transform?.position || {}),
          ...(partial.transform.position || {}),
        },
        rotation: {
          ...(prev.transform?.rotation || {}),
          ...(partial.transform.rotation || {}),
        },
        scale: {
          ...(prev.transform?.scale || {}),
          ...(partial.transform.scale || {}),
        },
      }
      : prev.transform,
    components: partial.components
      ? { ...(prev.components || {}), ...partial.components }
      : prev.components,
  };
}

export function clearOverride(rootActor, templateId, path = null) {
  if (!rootActor?.prefab?.overrides) return;
  if (!templateId) {
    rootActor.prefab.overrides = {};
    return;
  }
  if (!path) {
    delete rootActor.prefab.overrides[templateId];
    return;
  }
  const entry = rootActor.prefab.overrides[templateId];
  if (!entry) return;
  if (path === 'transform') delete entry.transform;
  else if (path === 'name') delete entry.name;
  else if (path.startsWith('components.')) {
    const type = path.slice('components.'.length);
    if (entry.components) delete entry.components[type];
  }
  if (entry.components && Object.keys(entry.components).length === 0) {
    delete entry.components;
  }
  if (Object.keys(entry).length === 0) {
    delete rootActor.prefab.overrides[templateId];
  }
}

/**
 * Record an override from the live actor state vs source template.
 * Replaces the full override entry for that templateId (no stale field merge).
 */
export function captureOverrideFromActor(rootActor, actor, sourceTemplate) {
  if (!rootActor?.prefab || !actor?.prefab?.templateId || !sourceTemplate) return;
  if (!rootActor.prefab.overrides) rootActor.prefab.overrides = {};
  const tid = actor.prefab.templateId;
  const override = {};
  if (actor.name !== sourceTemplate.name) override.name = actor.name;
  if (actor.visible !== (sourceTemplate.visible !== false)) {
    override.visible = actor.visible;
  }
  if (Boolean(actor.locked) !== Boolean(sourceTemplate.locked)) {
    override.locked = actor.locked;
  }
  const st = sourceTemplate.transform;
  const at = actor.transform.toJSON();
  if (JSON.stringify(st) !== JSON.stringify(at)) {
    override.transform = at;
  }
  const compOverrides = {};
  for (const comp of actor.components) {
    const srcComp = (sourceTemplate.components || []).find((c) => c.type === comp.type);
    if (!srcComp) continue;
    const live = comp.toJSON();
    const diff = {};
    for (const key of Object.keys(live)) {
      if (key === 'id' || key === 'type') continue;
      let srcVal = srcComp[key];
      let liveVal = live[key];
      // Legacy prefab sources omit operation; treat missing as additive.
      if (key === 'operation') {
        srcVal = srcVal === 'subtract' ? 'subtract' : 'add';
        liveVal = liveVal === 'subtract' ? 'subtract' : 'add';
      }
      if (JSON.stringify(liveVal) !== JSON.stringify(srcVal)) {
        diff[key] = live[key];
      }
    }
    if (Object.keys(diff).length) compOverrides[comp.type] = diff;
  }
  if (Object.keys(compOverrides).length) override.components = compOverrides;
  if (Object.keys(override).length === 0) {
    delete rootActor.prefab.overrides[tid];
  } else {
    rootActor.prefab.overrides[tid] = override;
  }
}

/**
 * Record override for one prefab-linked actor.
 * `definition` may be provided (cached). Otherwise `options.getDefinition(id)`
 * is used (sync or async).
 */
export function recordActorPrefabOverride(world, actor, definition = null, options = {}) {
  if (!world || !actor?.prefab?.prefabId || !actor.prefab.templateId || !actor.prefab.instanceId) {
    return { ok: false, error: 'Not a prefab instance actor' };
  }

  const resolve = () => {
    const def = normalizePrefabDefinition(definition);
    if (!def) return { ok: false, error: 'Prefab source not available' };
    const template = def.actors.find((a) => a.id === actor.prefab.templateId);
    if (!template) return { ok: false, error: 'Template not found in source' };
    const root = findInstanceRoot(world, actor.prefab.instanceId);
    if (!root) return { ok: false, error: 'Instance root not found' };
    captureOverrideFromActor(root, actor, template);
    return { ok: true, rootId: root.id, templateId: actor.prefab.templateId };
  };

  if (definition) return resolve();

  const syncDef = options.getDefinitionSync?.(actor.prefab.prefabId);
  if (syncDef) {
    return recordActorPrefabOverride(world, actor, syncDef, options);
  }

  const loader = options.getDefinition;
  if (!loader) return { ok: false, error: 'Prefab source not available' };

  const loaded = loader(actor.prefab.prefabId);
  if (loaded && typeof loaded.then === 'function') {
    return loaded.then((def) => recordActorPrefabOverride(world, actor, def, options));
  }
  return recordActorPrefabOverride(world, actor, loaded, options);
}

/**
 * Record overrides for many actors. Loads missing definitions once per prefabId.
 */
export async function recordPrefabOverridesForActors(world, actorIds, options = {}) {
  if (!world || !actorIds?.length) return { recorded: 0 };
  const cache = new Map();
  let recorded = 0;
  for (const actorId of actorIds) {
    const actor = world.getActor(actorId);
    if (!actor?.prefab?.prefabId) continue;
    const prefabId = actor.prefab.prefabId;
    let def = options.getDefinitionSync?.(prefabId) || cache.get(prefabId) || null;
    if (!def && options.getDefinition) {
      def = await options.getDefinition(prefabId);
      if (def) cache.set(prefabId, def);
    }
    const result = recordActorPrefabOverride(world, actor, def, options);
    const resolved = result && typeof result.then === 'function' ? await result : result;
    if (resolved?.ok) recorded += 1;
  }
  return { recorded };
}

/**
 * Sync all instances of a prefab from its source definition.
 * Preserves instance actor IDs, instanceIds, root world transforms, and overrides.
 * options.getDefinition(id) enables re-syncing nested prefabs after a parent sync.
 */
export function syncPrefabInstances(world, definition, options = {}) {
  const def = normalizePrefabDefinition(definition);
  if (!def || !world) return { updated: 0 };

  const instanceIds = new Set();
  for (const actor of world.actors) {
    if (actor.prefab?.prefabId === def.id && actor.prefab?.instanceId) {
      instanceIds.add(actor.prefab.instanceId);
    }
  }

  let updated = 0;
  const nestedPrefabIds = new Set();
  for (const instanceId of instanceIds) {
    const result = syncOneInstance(world, def, instanceId, options);
    if (result) {
      updated += 1;
      for (const id of result.nestedPrefabIds || []) nestedPrefabIds.add(id);
    }
  }

  // After parent rebuild, push live nested sources so nested updates are not lost.
  if (options.getDefinition && nestedPrefabIds.size > 0) {
    for (const nestedId of nestedPrefabIds) {
      if (nestedId === def.id) continue;
      const nestedDef = options.getDefinition(nestedId);
      if (!nestedDef) continue;
      syncPrefabInstances(world, nestedDef, {
        ...options,
        // Prevent infinite parent↔nested recursion
        _syncingNestedFrom: new Set([...(options._syncingNestedFrom || []), def.id]),
      });
    }
  }

  return { updated };
}

function syncOneInstance(world, def, instanceId, options = {}) {
  const members = world.actors.filter((a) => a.prefab?.instanceId === instanceId
    && a.prefab?.prefabId === def.id);
  const owned = world.actors.filter((a) => a.prefab?.ownerInstanceId === instanceId
    && a.prefab?.ownerPrefabId === def.id);
  const all = [...new Map([...members, ...owned].map((a) => [a.id, a])).values()];
  if (all.length === 0) return null;

  const root = members.find((a) => a.prefab?.isRoot) || members[0] || all[0];
  const overrides = getOverrides(root);
  const rootWorld = getWorldTransform(root, world);
  const rootParent = root.parentId;

  const idMap = {};
  for (const m of members) {
    if (m.prefab?.templateId && def.actors.some((t) => t.id === m.prefab.templateId)) {
      idMap[m.prefab.templateId] = m.id;
    }
  }
  for (const m of owned) {
    if (m.prefab?.ownerTemplateId && def.actors.some((t) => t.id === m.prefab.ownerTemplateId)) {
      idMap[m.prefab.ownerTemplateId] = m.id;
    }
  }

  // Preserve owner links when syncing a nested instance from its own source.
  const existingOwnerLinks = {};
  for (const m of members) {
    if (m.prefab?.templateId && m.prefab?.ownerPrefabId) {
      existingOwnerLinks[m.prefab.templateId] = {
        ownerPrefabId: m.prefab.ownerPrefabId,
        ownerInstanceId: m.prefab.ownerInstanceId,
        ownerTemplateId: m.prefab.ownerTemplateId,
      };
    }
  }

  // Preserve nested instance identities + overrides across parent rebuilds.
  // instantiate group key = `${nestedPrefabId}::${nestedRootTemplateIdInParentDef}`
  const existingNestedInstanceIds = {};
  const existingNestedOverrides = {};
  const nestedPrefabIds = new Set();
  for (const m of owned) {
    if (!m.prefab?.prefabId || !m.prefab?.instanceId || !m.prefab?.ownerTemplateId) continue;
    nestedPrefabIds.add(m.prefab.prefabId);
    if (!m.prefab.isRoot) continue;
    const groupKey = `${m.prefab.prefabId}::${m.prefab.ownerTemplateId}`;
    existingNestedInstanceIds[groupKey] = m.prefab.instanceId;
    existingNestedOverrides[groupKey] = getOverrides(m);
  }

  for (const m of all) {
    world.removeActor(m.id);
  }

  const skipNestedCascade = options._syncingNestedFrom?.has(def.id);

  const { rootActorIds } = instantiatePrefab(def, world, {
    position: rootWorld.position,
    rotation: rootWorld.rotation,
    scale: rootWorld.scale,
    parentId: rootParent,
    existingIdMap: idMap,
    existingInstanceId: instanceId,
    overrides,
    existingNestedInstanceIds,
    existingNestedOverrides,
    existingOwnerLinks,
  });

  const newRoot = world.getActor(rootActorIds[0]);
  if (newRoot) {
    setWorldTransform(newRoot, rootWorld, world);
    newRoot.prefab.overrides = overrides;
  }

  return {
    nestedPrefabIds: skipNestedCascade ? [] : [...nestedPrefabIds],
  };
}

/**
 * Unpack a prefab instance into independent actors (clear prefab linkage).
 */
export function unpackPrefabInstance(world, instanceId) {
  const actors = getInstanceActors(world, instanceId);
  for (const actor of actors) {
    // Only clear if this instance owns them primarily
    if (actor.prefab?.instanceId === instanceId) {
      actor.prefab = null;
    } else if (actor.prefab?.ownerInstanceId === instanceId) {
      // Nested instance inside unpacked parent — keep nested linkage, clear owner
      delete actor.prefab.ownerPrefabId;
      delete actor.prefab.ownerInstanceId;
      delete actor.prefab.ownerTemplateId;
    }
  }
  return actors;
}

export function listPrefabInstanceIds(world, prefabId) {
  const ids = new Set();
  for (const a of world?.actors || []) {
    if (a.prefab?.prefabId === prefabId && a.prefab?.instanceId) {
      ids.add(a.prefab.instanceId);
    }
  }
  return [...ids];
}
