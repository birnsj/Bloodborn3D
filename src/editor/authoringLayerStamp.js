/**
 * Stamp authoringLayerId on newly created actors from the world's active layer.
 */
import {
  resolveAuthoringLayerId,
  normalizeAuthoringLayersState,
} from '../core/authoringLayers.js';

export function getActiveAuthoringLayerId(world) {
  const state = normalizeAuthoringLayersState(world?.authoringLayers, { seedIfEmpty: true });
  if (world && !world.authoringLayers) world.authoringLayers = state;
  return resolveAuthoringLayerId(state, state.activeLayerId);
}

/** Mutates actor (or actors) in place; returns same reference(s). */
export function stampAuthoringLayer(actorOrActors, world, layerId = null) {
  const id = layerId || getActiveAuthoringLayerId(world);
  const list = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
  for (const actor of list) {
    if (!actor) continue;
    if (!actor.authoringLayerId) actor.authoringLayerId = id;
  }
  return actorOrActors;
}

/** Force-assign (prefab place / bulk). */
export function assignAuthoringLayer(actorOrActors, layerId) {
  const list = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
  for (const actor of list) {
    if (actor) actor.authoringLayerId = layerId || null;
  }
  return actorOrActors;
}
