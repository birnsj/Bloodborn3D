import { World, normalizeMapMode } from '../core/World.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { createBrushFromBounds } from './brushFactory.js';
import { createPlayerSpawnActor } from './spawnFactory.js';

/**
 * Outer shell thickness around carved space for World Solid (eu).
 * Floor / ceiling / perimeter walls are this thick — not a giant empty cube.
 */
export const WORLD_SOLID_SHELL = 100;

/**
 * @deprecated Prefer shell-fitted solids via boundsWithShell / createNewMapWorld.
 * Kept so older call sites compiling against the name still resolve.
 */
export const WORLD_SOLID_HALF_EXTENT = 2500;

/**
 * Starter room carved from World Solid so spawn is in open space (eu).
 * 600×300×800 ≈ 6 m × 3 m × 8 m.
 */
export const STARTER_ROOM = {
  min: { x: -300, y: 0, z: -200 },
  max: { x: 300, y: 300, z: 600 },
};

export const STRUCTURAL_BRUSH_KINDS = new Set(['box', 'wall', 'floor', 'ceiling']);

/** Expand an inner AABB by a uniform shell (floor, ceiling, outer walls). */
export function boundsWithShell(innerMin, innerMax, shell = WORLD_SOLID_SHELL) {
  const s = Math.max(0, Number(shell) || 0);
  return {
    min: {
      x: innerMin.x - s,
      y: innerMin.y - s,
      z: innerMin.z - s,
    },
    max: {
      x: innerMax.x + s,
      y: innerMax.y + s,
      z: innerMax.z + s,
    },
  };
}

/**
 * Normalize a user-entered level filename to `*.json` (basename only).
 */
export function normalizeLevelFileName(raw) {
  let name = String(raw || '').trim();
  if (!name) return null;
  if (!name.toLowerCase().endsWith('.json')) name = `${name}.json`;
  return name.split(/[/\\]/).pop() || null;
}

/**
 * Whether structural create tools should emit subtract brushes on this world.
 */
export function structuralBrushesAreSubtractive(worldOrMode) {
  const mode = typeof worldOrMode === 'string'
    ? worldOrMode
    : worldOrMode?.mapMode;
  return normalizeMapMode(mode) === 'subtractive';
}

/**
 * Build a brand-new map world (not yet on disk).
 * Additive: spawn only.
 * Subtractive: World Solid sized to the starter room + shell, then carve the room.
 */
export function createNewMapWorld({
  name = 'Untitled Level',
  mapMode = 'additive',
  gridSize = 25,
  shell = WORLD_SOLID_SHELL,
} = {}) {
  const mode = normalizeMapMode(mapMode);
  const world = new World({
    name,
    schemaVersion: 2,
    mapMode: mode,
  });

  if (mode === 'subtractive') {
    const solidBounds = boundsWithShell(STARTER_ROOM.min, STARTER_ROOM.max, shell);
    const solid = createBrushFromBounds({
      kind: 'box',
      min: solidBounds.min,
      max: solidBounds.max,
      gridSize,
      name: 'World Solid',
      operation: 'add',
    });
    solid.tags = [...new Set([...(solid.tags || []), 'world-solid'])];
    solid.locked = true;
    world.addActor(solid);

    // Carve open space so the map is playable / editable immediately.
    const room = createBrushFromBounds({
      kind: 'box',
      min: { ...STARTER_ROOM.min },
      max: { ...STARTER_ROOM.max },
      gridSize,
      name: 'Starter Room',
      operation: 'subtract',
    });
    room.tags = [...new Set([...(room.tags || []), 'starter-room'])];
    world.addActor(room);
  }

  const spawn = createPlayerSpawnActor({
    name: 'Player Start',
    // Center of starter room floor (or origin for additive).
    position: mode === 'subtractive'
      ? { x: 0, y: 20, z: 200 }
      : { x: 0, y: 20, z: 100 },
    rotation: { x: 0, y: 180, z: 0 },
    gridSize,
    snapY: false,
  });
  world.addActor(spawn);

  return world;
}

/** Level JSON ready for saveLevelFile / applyLevelData. */
export function createNewMapLevelData(options = {}) {
  return serializeLevel(createNewMapWorld(options));
}
