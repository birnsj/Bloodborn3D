/**
 * Serialize a World to engine-neutral level JSON.
 * schemaVersion 2 adds parentId / visible / locked / prefab / Cell.
 * v1 levels remain loadable.
 */
export const LEVEL_SCHEMA_VERSION = 2;

export function serializeLevel(world) {
  if (!world) {
    throw new Error('Cannot serialize null world');
  }
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    name: world.name ?? 'Untitled Level',
    actors: world.actors.map((actor) => actor.toJSON()),
  };
}

export function serializeLevelString(world, pretty = true) {
  const data = serializeLevel(world);
  return pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data);
}
