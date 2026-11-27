/**
 * Shared authoring-layer edit guards (Batch 9 closure).
 * Layer lock is an editor filter — enforced on command paths, not only UI disable.
 */
import {
  isActorAuthoringLayerLocked,
  normalizeAuthoringLayersState,
  resolveAuthoringLayerId,
} from '../core/authoringLayers.js';
import { isEffectivelyLocked } from '../core/hierarchy.js';

export function isEditorActorLocked(actor, world, layerUi, { playMode = false } = {}) {
  if (!actor || !world) return false;
  if (isEffectivelyLocked(actor, world)) return true;
  if (playMode) return false;
  return isActorAuthoringLayerLocked(actor, world, layerUi);
}

/** Active layer locked → block new actor creation into that membership. */
export function isActiveAuthoringLayerLocked(world, layerUi, { playMode = false } = {}) {
  if (!world || playMode || !layerUi) return false;
  const state = normalizeAuthoringLayersState(world.authoringLayers, { seedIfEmpty: true });
  const activeId = resolveAuthoringLayerId(state, state.activeLayerId);
  return isActorAuthoringLayerLocked(
    { authoringLayerId: activeId },
    world,
    layerUi,
  );
}

/**
 * Split actor ids into editable vs blocked by layer/actor lock.
 * @returns {{ editable: string[], blocked: string[] }}
 */
export function partitionEditableActorIds(actorIds, world, layerUi, { playMode = false } = {}) {
  const editable = [];
  const blocked = [];
  for (const id of actorIds || []) {
    const actor = world?.getActor?.(id);
    if (!actor) continue;
    if (isEditorActorLocked(actor, world, layerUi, { playMode })) blocked.push(id);
    else editable.push(id);
  }
  return { editable, blocked };
}

export function lockedLayerFeedback(blockedCount, totalCount, action = 'edit') {
  if (!blockedCount) return null;
  if (blockedCount === totalCount) {
    return `Cannot ${action}: selection is locked (actor or authoring layer). Unlock the layer or actor first.`;
  }
  return `Skipped ${blockedCount} locked actor(s); applied ${action} to the rest.`;
}
