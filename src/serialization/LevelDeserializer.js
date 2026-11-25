import { World, normalizeMapMode, migrateLegacyWorldAmbient } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { wouldCreateCycle } from '../core/hierarchy.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import {
  LEVEL_SCHEMA_VERSION,
  MIN_SUPPORTED_LEVEL_SCHEMA_VERSION,
} from './LevelSerializer.js';

/**
 * Shared scene loading used by editor and game runtime.
 * Rejects malformed levels rather than silently rewriting authored data.
 */
export function deserializeLevel(data) {
  validateLevelData(data);

  const world = new World({
    name: data.name || 'Untitled Level',
    schemaVersion: data.schemaVersion,
    mapMode: normalizeMapMode(data.mapMode),
    ambient: migrateLegacyWorldAmbient(data.ambient),
  });

  for (const actorData of data.actors) {
    const actor = Actor.fromJSON(actorData, createComponentFromJSON);
    // ensureId must not have regenerated — validateLevelData already required string ids.
    if (actor.id !== actorData.id) {
      throw new Error(`Actor id was not preserved on load: ${JSON.stringify(actorData.id)}`);
    }
    world.addActor(actor);
  }

  assertHierarchyIntegrity(world);
  return world;
}

/**
 * Structural validation used by deserialize and by the level write API.
 * Throws on malformed data so callers never persist or apply a lossy world.
 */
export function validateLevelData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Level data must be an object');
  }
  if (data.schemaVersion == null) {
    throw new Error('Level missing schemaVersion');
  }
  assertSupportedSchemaVersion(data.schemaVersion);
  if (!Array.isArray(data.actors)) {
    throw new Error('Level missing actors array');
  }

  const seenIds = new Set();
  for (const actorData of data.actors) {
    validateActorData(actorData);
    if (seenIds.has(actorData.id)) {
      throw new Error(`Duplicate actor id: ${actorData.id}`);
    }
    seenIds.add(actorData.id);
  }

  for (const actorData of data.actors) {
    const parentId = actorData.parentId || null;
    if (!parentId) continue;
    if (typeof parentId !== 'string' || parentId.length === 0) {
      throw new Error(`Actor ${actorData.id} has invalid parentId`);
    }
    if (parentId === actorData.id) {
      throw new Error(`Actor ${actorData.id} cannot parent itself`);
    }
    if (!seenIds.has(parentId)) {
      throw new Error(`Actor ${actorData.id} references missing parent ${parentId}`);
    }
  }

  // Cycle check on the JSON graph (before Actor construction).
  for (const actorData of data.actors) {
    if (!actorData.parentId) continue;
    const seen = new Set();
    let current = actorData.parentId;
    while (current) {
      if (current === actorData.id) {
        throw new Error(`Circular hierarchy involving actor ${actorData.id}`);
      }
      if (seen.has(current)) {
        throw new Error(`Circular hierarchy involving actor ${actorData.id}`);
      }
      seen.add(current);
      const parent = data.actors.find((a) => a.id === current);
      current = parent?.parentId || null;
    }
  }
}

export function deserializeLevelString(jsonString) {
  const data = JSON.parse(jsonString);
  return deserializeLevel(data);
}

/**
 * Newer files may carry data this build would silently drop on the next save,
 * so refuse them outright rather than loading a lossy copy.
 */
function assertSupportedSchemaVersion(version) {
  if (!Number.isInteger(version) || version < MIN_SUPPORTED_LEVEL_SCHEMA_VERSION) {
    throw new Error(`Invalid level schemaVersion: ${JSON.stringify(version)}`);
  }
  if (version > LEVEL_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported level schemaVersion ${version}: this editor supports versions ${MIN_SUPPORTED_LEVEL_SCHEMA_VERSION}–${LEVEL_SCHEMA_VERSION}. Update the editor to open this level.`,
    );
  }
}

function validateActorData(actorData) {
  if (!actorData || typeof actorData !== 'object') {
    throw new Error('Invalid actor entry');
  }
  if (typeof actorData.id !== 'string' || actorData.id.length === 0) {
    throw new Error('Actor missing persistent string id');
  }
  if (!actorData.transform || typeof actorData.transform !== 'object') {
    throw new Error(`Actor ${actorData.id} missing transform`);
  }
  if (!Array.isArray(actorData.components)) {
    throw new Error(`Actor ${actorData.id} missing components array`);
  }
}

/** Second-pass hierarchy check against the live World (defensive). */
function assertHierarchyIntegrity(world) {
  for (const actor of world.actors) {
    if (!actor.parentId) continue;
    if (!world.getActor(actor.parentId)) {
      throw new Error(`Actor ${actor.id} references missing parent ${actor.parentId}`);
    }
    if (wouldCreateCycle(actor.id, actor.parentId, world)) {
      throw new Error(`Circular hierarchy involving actor ${actor.id}`);
    }
  }
}
