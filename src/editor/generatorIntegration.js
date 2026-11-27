/**
 * Phase 2G map-generator integration surface (consolidation C3).
 *
 * Documents and re-exports the existing command / construction / validation APIs
 * a generator should call. No generation UI or speculative abstractions.
 *
 * Contract for future Phase 2G:
 * 1. Build actors via runtime factories (`createBrushFromBounds`, …) or Actor JSON.
 * 2. Call `validateWorldGeometry` / `validateLevelGeometry` before sync/Play/save.
 * 3. Apply via `AddActorsCommand` / `CompositeCommand` through HistoryStack so undo works.
 * 4. Preserve stable actor IDs in authored JSON.
 * 5. Stamp Cells / Prefabs / authoring layers with existing ops after placement.
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

/**
 * High-level checklist used by acceptance docs / future generator hosts.
 */
export const GENERATOR_INTEGRATION_CHECKLIST = Object.freeze([
  'Create actors with stable ids (factories or Actor.fromJSON)',
  'Assign parentId / Cell / authoringLayerId before or via companion commands',
  'validateWorldGeometry(world) / validateLevelPayloads before SceneView sync',
  'Apply with AddActorsCommand or CompositeCommand for atomic undo',
  'Do not skip solid-cap / payload validation until Play',
]);
