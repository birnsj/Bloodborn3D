/**
 * Batch 9 — customizable hierarchical authoring layers.
 * Independent of actor parenting, Cells, Prefabs, and THREE.Layers.
 */
import { createId } from './ids.js';

export const AUTHORING_LAYERS_SCHEMA_VERSION = 1;

/** Editable default seed (not a hardcoded runtime enum). Stable names; IDs generated on seed. */
export const DEFAULT_AUTHORING_LAYER_SPECS = Object.freeze([
  { name: 'Architecture', color: '#6b8cae' },
  { name: 'Props', color: '#c4a35a' },
  { name: 'Lighting', color: '#e0c35a' },
  { name: 'Environment', color: '#5a9e6f' },
  { name: 'Gameplay', color: '#c45a6b' },
]);

export function createAuthoringLayerId() {
  return createId('layer');
}

/**
 * @param {object} [partial]
 * @returns {{ id: string, name: string, parentId: string|null, color: string, sortIndex: number }}
 */
export function normalizeAuthoringLayer(partial = {}) {
  const id = typeof partial.id === 'string' && partial.id
    ? partial.id
    : createAuthoringLayerId();
  const name = String(partial.name || 'Layer').trim() || 'Layer';
  const parentId = partial.parentId ? String(partial.parentId) : null;
  let color = String(partial.color || '#888888').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#888888';
  const sortIndex = Number.isFinite(Number(partial.sortIndex))
    ? Number(partial.sortIndex)
    : 0;
  return { id, name, parentId, color, sortIndex };
}

/** Seed default top-level layers with fresh IDs. */
export function createDefaultAuthoringLayers() {
  const layers = DEFAULT_AUTHORING_LAYER_SPECS.map((spec, i) => normalizeAuthoringLayer({
    ...spec,
    id: createAuthoringLayerId(),
    parentId: null,
    sortIndex: i,
  }));
  return {
    schemaVersion: AUTHORING_LAYERS_SCHEMA_VERSION,
    layers,
    activeLayerId: layers[0]?.id || null,
  };
}

/**
 * Normalize world.authoringLayers. Missing/empty → seed defaults (new levels).
 * When `seedIfEmpty` is false and input is empty, returns empty layers (caller decides).
 */
export function normalizeAuthoringLayersState(raw, { seedIfEmpty = true } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.layers) || raw.layers.length === 0) {
    return seedIfEmpty ? createDefaultAuthoringLayers() : {
      schemaVersion: AUTHORING_LAYERS_SCHEMA_VERSION,
      layers: [],
      activeLayerId: null,
    };
  }
  const layers = raw.layers.map((l, i) => normalizeAuthoringLayer({
    ...l,
    sortIndex: l.sortIndex ?? i,
  }));
  // Drop parent refs that don't exist.
  const ids = new Set(layers.map((l) => l.id));
  for (const layer of layers) {
    if (layer.parentId && !ids.has(layer.parentId)) layer.parentId = null;
  }
  // Break cycles if present in authored data.
  for (const layer of layers) {
    if (layer.parentId && wouldCreateLayerCycle(layers, layer.id, layer.parentId)) {
      layer.parentId = null;
    }
  }
  let activeLayerId = raw.activeLayerId ? String(raw.activeLayerId) : null;
  if (!activeLayerId || !ids.has(activeLayerId)) {
    activeLayerId = layers[0]?.id || null;
  }
  return {
    schemaVersion: AUTHORING_LAYERS_SCHEMA_VERSION,
    layers,
    activeLayerId,
  };
}

export function getAuthoringLayerById(state, layerId) {
  if (!layerId || !state?.layers) return null;
  return state.layers.find((l) => l.id === layerId) || null;
}

/** Architecture default (by name), else first root, else first layer. */
export function getDefaultAuthoringLayerId(state) {
  if (!state?.layers?.length) return null;
  const arch = state.layers.find((l) => l.name === 'Architecture' && !l.parentId);
  if (arch) return arch.id;
  const root = state.layers.find((l) => !l.parentId);
  return root?.id || state.layers[0].id;
}

export function resolveAuthoringLayerId(state, layerId) {
  if (layerId && getAuthoringLayerById(state, layerId)) return layerId;
  return getDefaultAuthoringLayerId(state);
}

export function wouldCreateLayerCycle(layers, layerId, newParentId) {
  if (!newParentId) return false;
  if (layerId === newParentId) return true;
  const byId = new Map(layers.map((l) => [l.id, l]));
  let cur = byId.get(newParentId);
  const seen = new Set();
  while (cur) {
    if (cur.id === layerId) return true;
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return false;
}

export function getLayerAncestors(layers, layerId) {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const out = [];
  let cur = byId.get(layerId);
  const seen = new Set();
  while (cur?.parentId) {
    if (seen.has(cur.parentId)) break;
    seen.add(cur.parentId);
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    out.push(parent);
    cur = parent;
  }
  return out;
}

export function getLayerChildren(layers, parentId) {
  const pid = parentId || null;
  return layers
    .filter((l) => (l.parentId || null) === pid)
    .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
}

export function getLayerDescendantIds(layers, layerId) {
  const out = new Set();
  const walk = (id) => {
    for (const child of getLayerChildren(layers, id)) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(layerId);
  return out;
}

/**
 * Editor-only effective visibility: layer is shown if not in hidden set and
 * no ancestor is hidden. Child hidden flags are preserved independently.
 */
export function isAuthoringLayerEffectivelyVisible(layerId, layers, hiddenIds) {
  if (!layerId) return true;
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || []);
  if (hidden.has(layerId)) return false;
  for (const ancestor of getLayerAncestors(layers, layerId)) {
    if (hidden.has(ancestor.id)) return false;
  }
  return true;
}

export function isAuthoringLayerEffectivelyLocked(layerId, layers, lockedIds) {
  if (!layerId) return false;
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds || []);
  if (locked.has(layerId)) return true;
  for (const ancestor of getLayerAncestors(layers, layerId)) {
    if (locked.has(ancestor.id)) return true;
  }
  return false;
}

/**
 * Actor visible under authoring-layer editor filters (edit mode only).
 * Solo: when active, only soloed layers (and their descendants) are visible,
 * still respecting hidden flags within that set via previous map restore.
 */
export function isActorAuthoringLayerVisible(actor, world, layerUi = null) {
  if (!actor || !world) return true;
  const state = world.authoringLayers || normalizeAuthoringLayersState(null);
  const layerId = resolveAuthoringLayerId(state, actor.authoringLayerId);
  if (!layerUi) return true;

  const hidden = layerUi.hidden instanceof Set
    ? layerUi.hidden
    : new Set(layerUi.hidden || []);
  const soloId = layerUi.solo?.activeLayerId || null;

  if (soloId) {
    const soloSet = new Set([soloId, ...getLayerDescendantIds(state.layers, soloId)]);
    if (!soloSet.has(layerId)) return false;
  }
  return isAuthoringLayerEffectivelyVisible(layerId, state.layers, hidden);
}

export function isActorAuthoringLayerLocked(actor, world, layerUi = null) {
  if (!actor || !world || !layerUi) return false;
  const state = world.authoringLayers || normalizeAuthoringLayersState(null);
  const layerId = resolveAuthoringLayerId(state, actor.authoringLayerId);
  const locked = layerUi.locked instanceof Set
    ? layerUi.locked
    : new Set(layerUi.locked || []);
  return isAuthoringLayerEffectivelyLocked(layerId, state.layers, locked);
}

/**
 * Delete layer: reassign actors, reparent children, remove layer.
 * Never deletes actors.
 * @returns {{ ok: boolean, error?: string, nextState?: object, actorUpdates?: Array<{actorId, authoringLayerId}> }}
 */
export function deleteAuthoringLayer(state, layerId, {
  reassignToLayerId = null,
  actorIdsOnLayer = [],
} = {}) {
  const layers = [...(state?.layers || [])];
  const target = layers.find((l) => l.id === layerId);
  if (!target) return { ok: false, error: 'Layer not found' };
  if (layers.length <= 1) return { ok: false, error: 'Cannot delete the last layer' };

  let destId = reassignToLayerId;
  if (!destId || destId === layerId || !layers.some((l) => l.id === destId)) {
    destId = target.parentId && layers.some((l) => l.id === target.parentId)
      ? target.parentId
      : getDefaultAuthoringLayerId({ layers: layers.filter((l) => l.id !== layerId) });
  }
  if (!destId || destId === layerId) {
    return { ok: false, error: 'Reassignment target required' };
  }

  const actorUpdates = (actorIdsOnLayer || []).map((actorId) => ({
    actorId,
    authoringLayerId: destId,
  }));

  const nextLayers = layers
    .filter((l) => l.id !== layerId)
    .map((l) => (l.parentId === layerId
      ? { ...l, parentId: target.parentId || null }
      : l));

  let activeLayerId = state.activeLayerId;
  if (activeLayerId === layerId) activeLayerId = destId;

  return {
    ok: true,
    nextState: {
      schemaVersion: AUTHORING_LAYERS_SCHEMA_VERSION,
      layers: nextLayers,
      activeLayerId,
    },
    actorUpdates,
    reassignToLayerId: destId,
  };
}

export function countActorsPerLayer(actors, state) {
  const counts = Object.fromEntries((state?.layers || []).map((l) => [l.id, 0]));
  const fallback = getDefaultAuthoringLayerId(state);
  for (const actor of actors || []) {
    const id = resolveAuthoringLayerId(state, actor.authoringLayerId) || fallback;
    if (id in counts) counts[id] += 1;
    else counts[id] = 1;
  }
  return counts;
}
