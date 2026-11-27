/**
 * Serialize a World to engine-neutral level JSON.
 * schemaVersion 2 adds parentId / visible / locked / prefab / Cell.
 * schemaVersion 3 is emitted only when the level contains a ConvexBrush (Phase 2F.0).
 * Optional `ambient` (scene fill color / intensity / playIntensity) is written when
 * present; older levels without it load with World defaults. No schema bump required.
 * Optional `scene` / `renderer` (Three.js look) and `postProcessing` are written the
 * same way (defaults when absent). v1 levels remain loadable.
 */

import {
  normalizeWorldAmbient,
  normalizeWorldScene,
  normalizeWorldRenderer,
  normalizeAuthoringLayersState,
} from '../core/World.js';
import { normalizePostProcessing } from '../core/postprocessing/postProcessingState.js';

export const LEVEL_SCHEMA_VERSION = 3;
/** Oldest level schema the deserializer still accepts. */
export const MIN_SUPPORTED_LEVEL_SCHEMA_VERSION = 1;
/** Levels without ConvexBrush keep writing 2 so older builds re-save identically. */
export const LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX = 2;

export function worldHasConvexBrush(world) {
  if (!world?.actors) return false;
  return world.actors.some((actor) => actor.getComponent?.('ConvexBrush'));
}

export function schemaVersionForWorld(world) {
  return worldHasConvexBrush(world)
    ? LEVEL_SCHEMA_VERSION
    : LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX;
}

export function serializeLevel(world) {
  if (!world) {
    throw new Error('Cannot serialize null world');
  }
  const mapMode = world.mapMode === 'subtractive' ? 'subtractive' : 'additive';
  return {
    schemaVersion: schemaVersionForWorld(world),
    name: world.name ?? 'Untitled Level',
    mapMode,
    ambient: normalizeWorldAmbient(world.ambient),
    scene: normalizeWorldScene(world.scene),
    renderer: normalizeWorldRenderer(world.renderer),
    postProcessing: normalizePostProcessing(world.postProcessing),
    authoringLayers: normalizeAuthoringLayersState(world.authoringLayers, { seedIfEmpty: true }),
    actors: world.actors.map((actor) => actor.toJSON()),
  };
}

export function serializeLevelString(world, pretty = true) {
  const data = serializeLevel(world);
  return pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data);
}
