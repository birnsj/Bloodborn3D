import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';

/**
 * Shared scene loading used by editor and game runtime.
 */
export function deserializeLevel(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Level data must be an object');
  }
  if (data.schemaVersion == null) {
    throw new Error('Level missing schemaVersion');
  }
  if (!Array.isArray(data.actors)) {
    throw new Error('Level missing actors array');
  }

  const world = new World({
    name: data.name || 'Untitled Level',
    schemaVersion: data.schemaVersion,
  });

  for (const actorData of data.actors) {
    validateActorData(actorData);
    const actor = Actor.fromJSON(actorData, createComponentFromJSON);
    world.addActor(actor);
  }

  // Validate parent references after all actors exist (v1 has no parents).
  for (const actor of world.actors) {
    if (actor.parentId && !world.getActor(actor.parentId)) {
      actor.parentId = null;
    }
  }

  return world;
}

export function deserializeLevelString(jsonString) {
  const data = JSON.parse(jsonString);
  return deserializeLevel(data);
}

function validateActorData(actorData) {
  if (!actorData || typeof actorData !== 'object') {
    throw new Error('Invalid actor entry');
  }
  if (!actorData.id) {
    throw new Error('Actor missing persistent id');
  }
  if (!actorData.transform) {
    throw new Error(`Actor ${actorData.id} missing transform`);
  }
  if (!Array.isArray(actorData.components)) {
    throw new Error(`Actor ${actorData.id} missing components array`);
  }
}
