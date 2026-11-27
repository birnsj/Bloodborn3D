/**
 * Phase 2G map-generator integration surface (consolidation C3 / C4).
 *
 * Documents and re-exports the existing command / construction / validation APIs
 * a generator should call. No generation UI or speculative abstractions.
 *
 * Contract for future Phase 2G:
 * 1. Build actors via runtime factories (`createBrushFromBounds`, …) or Actor JSON.
 * 2. Call `validateWorldGeometry` / `validateLevelGeometry` before sync/Play/save.
 * 3. Prefer `syncGeneratedWorld(sceneView, world)` so validation cannot be skipped (F14).
 * 4. Apply via `AddActorsCommand` / `CompositeCommand` through HistoryStack so undo works.
 * 5. Preserve stable actor IDs in authored JSON.
 * 6. Stamp Cells / Prefabs / authoring layers with existing ops after placement.
 */

export { AddActorsCommand, RemoveActorsCommand, CompositeCommand } from './history/commands.js';
export {
  createBrushFromBounds,
  duplicateActors,
} from '../runtime/brushFactory.js';
export { createRampFromBounds } from '../runtime/rampFactory.js';
export { createStairFromBounds } from '../runtime/stairFactory.js';
export { createColumnFromBounds } from '../runtime/columnFactory.js';
export { createArchFromBounds } from '../runtime/archFactory.js';
export { createCurvedWallFromBounds } from '../runtime/curvedWallFactory.js';
export { createCellActor } from './cellFactory.js';
export { stampAuthoringLayer, assignAuthoringLayer } from './authoringLayerStamp.js';
export {
  validateLevelPayloads,
  validateWorldGeometry,
  assertWorldGeometry,
} from '../serialization/levelGeometryValidation.js';
export { validateLevelGeometry } from '../serialization/LevelDeserializer.js';

import { assertWorldGeometry } from '../serialization/levelGeometryValidation.js';

/**
 * Assert geometry constraints then full-sync a generated (or hand-built) world.
 * Closes the F14 footgun where SceneView.sync* alone does not validate.
 *
 * @param {{ syncFromWorld?: Function, syncIncremental?: Function }} sceneView
 * @param {import('../core/World.js').World} world
 * @param {{ context?: string, incremental?: boolean }} [options]
 */
export function syncGeneratedWorld(sceneView, world, options = {}) {
  assertWorldGeometry(world, { context: options.context || 'Generator' });
  if (options.incremental && typeof sceneView?.syncIncremental === 'function') {
    sceneView.syncIncremental(world);
    return world;
  }
  if (typeof sceneView?.syncFromWorld !== 'function') {
    throw new Error('syncGeneratedWorld requires sceneView.syncFromWorld');
  }
  sceneView.syncFromWorld(world);
  return world;
}

/**
 * High-level checklist used by acceptance docs / future generator hosts.
 */
export const GENERATOR_INTEGRATION_CHECKLIST = Object.freeze([
  'Create actors with stable ids (factories or Actor.fromJSON)',
  'Assign parentId / Cell / authoringLayerId before or via companion commands',
  'validateWorldGeometry(world) / validateLevelPayloads before SceneView sync',
  'Prefer syncGeneratedWorld(sceneView, world) so assert cannot be skipped (F14)',
  'Apply with AddActorsCommand or CompositeCommand for atomic undo',
  'Do not skip solid-cap / payload validation until Play',
]);
