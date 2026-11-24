import { serializeLevel } from '../serialization/LevelSerializer.js';
import { createBrushFromBounds } from './brushFactory.js';
import { createLightActor } from './lightFactory.js';
import { createPlayerSpawnActor } from './spawnFactory.js';
import { WORLD_SOLID_SHELL, boundsWithShell } from './newMapFactory.js';
import { World } from '../core/World.js';

/**
 * Perfect maze via recursive backtracker.
 * Returns open doorways as ordered edge keys "x1,y1|x2,y2".
 */
export function generateMazePassages(cols, rows, seed = 1) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  const key = (x, y) => `${x},${y}`;
  const visited = new Set();
  const passages = new Set();
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const stack = [[0, 0]];
  visited.add(key(0, 0));

  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const neighbors = dirs
      .map(([dx, dy]) => [cx + dx, cy + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !visited.has(key(nx, ny)));
    if (!neighbors.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = neighbors[Math.floor(rand() * neighbors.length)];
    const a = key(cx, cy);
    const b = key(nx, ny);
    passages.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    visited.add(key(nx, ny));
    stack.push([nx, ny]);
  }

  return passages;
}

/**
 * Unreal-style subtractive layout:
 * - Whole map is solid (locked World Solid additive brush).
 * - Rooms are identical grid-aligned subtract boxes on a regular pitch.
 * - Doorways are subtract boxes that flush-abut room faces and exactly fill the wall gap.
 * No overlapping “connector” volumes — shared faces share exact coordinates.
 */
export function createSubtractiveMazeWorld({
  name = 'Subractive',
  // Keep cutter count modest so World Solid stays under MAX_SUBTRACT_SOLIDS (64).
  cols = 4,
  rows = 3,
  roomSize = 400,
  wallThickness = 100,
  doorWidth = 200,
  roomHeight = 300,
  gridSize = 25,
  seed = 42,
  wallMaterialId = 'mat_hall_stone',
} = {}) {
  const world = new World({
    name,
    schemaVersion: 2,
    mapMode: 'subtractive',
  });

  const g = Math.max(1, gridSize);
  const snap = (v) => Math.round(v / g) * g;
  const room = snap(roomSize);
  const wall = snap(wallThickness);
  const door = Math.min(snap(doorWidth), room);
  const height = snap(roomHeight);
  const pitch = room + wall;
  const shell = snap(Math.max(wall, WORLD_SOLID_SHELL));

  // Room lattice origin: min-corner of cell (0,0), centered as a block on the world.
  const blockW = cols * room + (cols - 1) * wall;
  const blockD = rows * room + (rows - 1) * wall;
  const originX = snap(-blockW / 2);
  const originZ = snap(-blockD / 2);

  // World Solid hugs the carved floorplan + outer shell (not a giant empty cube).
  const solidBounds = boundsWithShell(
    { x: originX, y: 0, z: originZ },
    { x: originX + blockW, y: height, z: originZ + blockD },
    shell,
  );
  const solid = createBrushFromBounds({
    kind: 'box',
    min: solidBounds.min,
    max: solidBounds.max,
    gridSize: g,
    name: 'World Solid',
    operation: 'add',
  });
  solid.tags = [...new Set([...(solid.tags || []), 'world-solid'])];
  solid.locked = true;
  const solidBrush = solid.getComponent('Brush');
  if (solidBrush) {
    // One material on the substrate — faceMaterials would also paint wall tops/edges
    // (every piece shares px/py/… keys), which looks like stretched floor on thin ledges.
    solidBrush.materialId = wallMaterialId;
    solidBrush.faceMaterials = null;
    solidBrush.uv = {
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      rotation: 0,
    };
  }
  world.addActor(solid);

  const roomBounds = (cx, cy) => {
    const minX = originX + cx * pitch;
    const minZ = originZ + cy * pitch;
    return {
      min: { x: minX, y: 0, z: minZ },
      max: { x: minX + room, y: height, z: minZ + room },
    };
  };

  const roomCenter = (cx, cy) => {
    const b = roomBounds(cx, cy);
    return {
      x: (b.min.x + b.max.x) / 2,
      z: (b.min.z + b.max.z) / 2,
    };
  };

  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const b = roomBounds(cx, cy);
      const actor = createBrushFromBounds({
        kind: 'box',
        min: b.min,
        max: b.max,
        gridSize: g,
        name: `Room ${cx},${cy}`,
        operation: 'subtract',
      });
      actor.tags = [...new Set([...(actor.tags || []), 'maze-room'])];
      world.addActor(actor);
    }
  }

  // Doorways: flush to both room faces, exact wallThickness deep, doorWidth wide.
  const passages = generateMazePassages(cols, rows, seed);
  let doorIndex = 0;
  for (const edge of passages) {
    const [a, b] = edge.split('|');
    const [ax, ay] = a.split(',').map(Number);
    const [bx, by] = b.split(',').map(Number);
    const ra = roomBounds(ax, ay);
    const rb = roomBounds(bx, by);
    const horizontal = ay === by;
    const halfDoor = door / 2;

    let min;
    let max;
    if (horizontal) {
      // Neighbors share an X wall gap; doorway fills ra.max.x → rb.min.x.
      const left = ax < bx ? ra : rb;
      const right = ax < bx ? rb : ra;
      const cz = (left.min.z + left.max.z) / 2;
      min = { x: left.max.x, y: 0, z: snap(cz - halfDoor) };
      max = { x: right.min.x, y: height, z: snap(cz + halfDoor) };
    } else {
      // Neighbors share a Z wall gap.
      const near = ay < by ? ra : rb;
      const far = ay < by ? rb : ra;
      const cx = (near.min.x + near.max.x) / 2;
      min = { x: snap(cx - halfDoor), y: 0, z: near.max.z };
      max = { x: snap(cx + halfDoor), y: height, z: far.min.z };
    }

    const actor = createBrushFromBounds({
      kind: 'box',
      min,
      max,
      gridSize: g,
      name: `Doorway ${doorIndex}`,
      operation: 'subtract',
    });
    actor.tags = [...new Set([...(actor.tags || []), 'maze-doorway'])];
    world.addActor(actor);
    doorIndex += 1;
  }

  world.addActor(createLightActor({
    lightType: 'ambient',
    name: 'Maze Ambient',
    position: { x: 0, y: 200, z: 0 },
    color: '#c8d0e0',
    intensity: 0.22,
    castShadow: false,
    gridSize: g,
    snapY: false,
  }));

  let lightIndex = 0;
  for (let cy = 0; cy < rows; cy += 2) {
    for (let cx = 0; cx < cols; cx += 2) {
      const { x, z } = roomCenter(cx, cy);
      world.addActor(createLightActor({
        lightType: 'point',
        name: `Maze Light ${lightIndex}`,
        position: { x, y: height - 50, z },
        color: lightIndex % 2 === 0 ? '#ffe6c0' : '#dce8ff',
        intensity: 2.4,
        range: 900,
        castShadow: lightIndex === 0,
        gridSize: g,
        snapY: false,
      }));
      lightIndex += 1;
    }
  }

  const start = roomCenter(0, 0);
  world.addActor(createPlayerSpawnActor({
    name: 'Player Start',
    position: { x: start.x, y: 20, z: start.z },
    rotation: { x: 0, y: 0, z: 0 },
    gridSize: g,
    snapY: false,
  }));

  return world;
}

export function createSubtractiveMazeLevelData(options = {}) {
  return serializeLevel(createSubtractiveMazeWorld(options));
}
