/**
 * Temporary Phase 2G subtractive-scale evaluation fixtures.
 * Not product map generation — evaluation-only world builders.
 */
import { createSubtractiveMazeWorld } from '../editor/subtractiveMazeFactory.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createStairFromBounds } from '../editor/stairFactory.js';
import { createLightActor } from '../editor/lightFactory.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';

export const ROOM_COUNTS = [25, 50, 100, 200];
export const SOLID_CAPS = [64, 128, 256, 512, 1024];

export function gridForRooms(roomCount) {
  const cols = Math.ceil(Math.sqrt(roomCount));
  const rows = Math.ceil(roomCount / cols);
  return { cols, rows };
}

/**
 * Representative subtractive environment:
 * - flush grid rooms + maze corridors (doorway cutters)
 * - upper-floor voids (multi-height)
 * - partial-height window punches (intersecting cutters — high fragmentation)
 * - additive stairs between floors
 * - a few overlapping corridor volumes
 */
export function buildRepresentativeWorld(roomCount, {
  seed = 7,
  windowEvery = 2,
  upperEvery = 3,
  stairs = true,
  name = null,
} = {}) {
  const { cols, rows } = gridForRooms(roomCount);
  const world = createSubtractiveMazeWorld({
    cols,
    rows,
    showcase: false,
    seed,
    roomSize: 400,
    wallThickness: 100,
    doorWidth: 200,
    roomHeight: 300,
    gridSize: 25,
    name: name || `Bench ${roomCount} rooms`,
  });

  const g = 25;
  const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
  const sb = solid.getComponent('Brush');
  // Grow shell for a second story (upper voids + stair landing height).
  const grow = 400;
  sb.size = { x: sb.size.x, y: sb.size.y + grow, z: sb.size.z };
  solid.transform.position = {
    ...solid.transform.position,
    y: solid.transform.position.y + grow / 2,
  };

  const rooms = world.actors.filter((a) => a.tags?.includes('maze-room'));
  let upperCount = 0;
  let windowCount = 0;
  let stairCount = 0;

  rooms.forEach((room, i) => {
    const b = room.getComponent('Brush');
    const p = room.transform.position;
    const hx = b.size.x / 2;
    const hz = b.size.z / 2;

    if (i % upperEvery === 0) {
      const upper = createBrushFromBounds({
        kind: 'box',
        min: { x: p.x - hx, y: 300, z: p.z - hz },
        max: { x: p.x + hx, y: 600, z: p.z + hz },
        gridSize: g,
        name: `Upper ${i}`,
        operation: 'subtract',
      });
      upper.tags = ['bench-upper'];
      world.addActor(upper);
      upperCount += 1;

      // Vertical shaft connecting floors (intersecting cutter).
      const shaft = createBrushFromBounds({
        kind: 'box',
        min: { x: p.x - 50, y: 0, z: p.z - 50 },
        max: { x: p.x + 50, y: 600, z: p.z + 50 },
        gridSize: g,
        name: `Shaft ${i}`,
        operation: 'subtract',
      });
      shaft.tags = ['bench-shaft'];
      world.addActor(shaft);
    }

    if (i % windowEvery === 0) {
      const win = createBrushFromBounds({
        kind: 'box',
        min: { x: p.x + hx - 50, y: 100, z: p.z - 60 },
        max: { x: p.x + hx + 50, y: 220, z: p.z + 60 },
        gridSize: g,
        name: `Window ${i}`,
        operation: 'subtract',
      });
      win.tags = ['bench-window'];
      world.addActor(win);
      windowCount += 1;
    }

    if (stairs && i % upperEvery === 0 && i % (upperEvery * 2) === 0) {
      const stair = createStairFromBounds({
        min: { x: p.x - 40, y: 0, z: p.z + hz - 180 },
        max: { x: p.x + 40, y: 0, z: p.z + hz - 40 },
        gridSize: g,
        totalRise: 300,
        name: `Stair ${i}`,
      });
      stair.tags = ['bench-stair'];
      world.addActor(stair);
      stairCount += 1;
    }
  });

  // Extra intersecting corridor along the first row (overlaps doorways + rooms).
  if (rooms.length >= 2) {
    const a = rooms[0];
    const b = rooms[Math.min(cols - 1, rooms.length - 1)];
    const ab = a.getComponent('Brush');
    const bb = b.getComponent('Brush');
    const z = a.transform.position.z;
    const minX = Math.min(a.transform.position.x - ab.size.x / 2, b.transform.position.x - bb.size.x / 2);
    const maxX = Math.max(a.transform.position.x + ab.size.x / 2, b.transform.position.x + bb.size.x / 2);
    const corridor = createBrushFromBounds({
      kind: 'box',
      min: { x: minX, y: 0, z: z - 75 },
      max: { x: maxX, y: 250, z: z + 75 },
      gridSize: g,
      name: 'Cross Corridor',
      operation: 'subtract',
    });
    corridor.tags = ['bench-corridor'];
    world.addActor(corridor);
  }

  // Fill light so Play is usable in the browser harness.
  world.addActor(createLightActor({
    lightType: 'ambient',
    name: 'Bench Ambient',
    position: { x: 0, y: 400, z: 0 },
    color: '#c8d0e0',
    intensity: 0.35,
    castShadow: false,
    gridSize: g,
    snapY: false,
  }));

  world._benchMeta = {
    roomCount: rooms.length,
    cols,
    rows,
    upperCount,
    windowCount,
    stairCount,
    cutters: world.actors.filter((a) => a.getComponent('Brush')?.operation === 'subtract').length,
  };
  return world;
}

/** Flush maze only (no windows / upper / stairs) — lower fragmentation baseline. */
export function buildFlushWorld(roomCount, { seed = 7, name = null } = {}) {
  const { cols, rows } = gridForRooms(roomCount);
  const world = createSubtractiveMazeWorld({
    cols,
    rows,
    showcase: false,
    seed,
    name: name || `Flush ${roomCount}`,
  });
  world._benchMeta = {
    roomCount: world.actors.filter((a) => a.tags?.includes('maze-room')).length,
    cols,
    rows,
    upperCount: 0,
    windowCount: 0,
    stairCount: 0,
    cutters: world.actors.filter((a) => a.getComponent('Brush')?.operation === 'subtract').length,
    flush: true,
  };
  return world;
}

export function worldToLevelData(world) {
  return serializeLevel(world);
}
