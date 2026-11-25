import { serializeLevel } from '../serialization/LevelSerializer.js';
import { createBrushFromBounds } from './brushFactory.js';
import { createLightActor } from './lightFactory.js';
import { createPlayerSpawnActor } from './spawnFactory.js';
import { createStairFromBounds } from './stairFactory.js';
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

function snapTo(v, g) {
  return Math.round(v / g) * g;
}

function addSubtractBrush(world, { name, min, max, gridSize, tags = [] }) {
  const g = Math.max(1, gridSize);
  const actor = createBrushFromBounds({
    kind: 'box',
    min: { x: snapTo(min.x, g), y: snapTo(min.y, g), z: snapTo(min.z, g) },
    max: { x: snapTo(max.x, g), y: snapTo(max.y, g), z: snapTo(max.z, g) },
    gridSize: g,
    name,
    operation: 'subtract',
  });
  actor.tags = [...new Set([...(actor.tags || []), ...tags])];
  world.addActor(actor);
  return actor;
}

function addAdditiveBrush(world, {
  name, min, max, gridSize, materialId, tags = [],
}) {
  const g = Math.max(1, gridSize);
  const actor = createBrushFromBounds({
    kind: 'box',
    min: { x: snapTo(min.x, g), y: snapTo(min.y, g), z: snapTo(min.z, g) },
    max: { x: snapTo(max.x, g), y: snapTo(max.y, g), z: snapTo(max.z, g) },
    gridSize: g,
    name,
    operation: 'add',
  });
  const brush = actor.getComponent('Brush');
  if (brush && materialId) brush.materialId = materialId;
  actor.tags = [...new Set([...(actor.tags || []), ...tags])];
  world.addActor(actor);
  return actor;
}

/**
 * Hand-authored subtractive hall complex (not a grid maze).
 * Kept under MAX_SUBTRACT_SOLIDS by using few rooms and full-height window slots
 * (partial-height window punches fragment AABB carving heavily).
 * Window sills / lintels, pillars, stairs, and balconies are additive.
 */
export function createSubtractiveShowcaseWorld({
  name = 'Subractive',
  gridSize = 25,
  wallMaterialId = 'mat_hall_stone',
  floorMaterialId = 'mat_hall_floor',
} = {}) {
  const g = Math.max(1, gridSize);
  const world = new World({
    name,
    schemaVersion: 2,
    mapMode: 'subtractive',
  });

  // Room volumes (eu). Atrium is double-height; Court is taller ceremonial space.
  const rooms = [
    { name: 'Entrance', min: { x: -150, y: 0, z: -500 }, max: { x: 150, y: 300, z: -150 } },
    { name: 'Atrium', min: { x: -150, y: 0, z: -150 }, max: { x: 450, y: 550, z: 300 } },
    { name: 'West Hall', min: { x: -525, y: 0, z: -100 }, max: { x: -150, y: 300, z: 300 } },
    { name: 'Dining', min: { x: -525, y: 0, z: 300 }, max: { x: -100, y: 300, z: 650 } },
    { name: 'Court Hall', min: { x: -100, y: 0, z: 300 }, max: { x: 450, y: 450, z: 650 } },
  ];

  const doorways = [
    { name: 'Doorway Entrance', min: { x: -75, y: 0, z: -150 }, max: { x: 75, y: 250, z: -100 } },
    { name: 'Doorway West', min: { x: -150, y: 0, z: 0 }, max: { x: -100, y: 250, z: 150 } },
    { name: 'Doorway Dining', min: { x: -350, y: 0, z: 300 }, max: { x: -200, y: 250, z: 350 } },
    { name: 'Doorway Court West', min: { x: -100, y: 0, z: 375 }, max: { x: -50, y: 250, z: 550 } },
    { name: 'Doorway Court North', min: { x: 50, y: 0, z: 300 }, max: { x: 250, y: 250, z: 350 } },
  ];

  // Full-height exterior slots — cheap vs partial-height punches. Additive sills/lintels
  // turn them into readable windows without raising cutter fragmentation.
  const windows = [
    { name: 'Window Entrance', min: { x: -80, y: 0, z: -600 }, max: { x: 80, y: 300, z: -500 } },
    { name: 'Window West', min: { x: -625, y: 0, z: 0 }, max: { x: -525, y: 300, z: 200 } },
    { name: 'Window Dining', min: { x: -625, y: 0, z: 375 }, max: { x: -525, y: 300, z: 550 } },
  ];

  const cutters = [...rooms, ...doorways, ...windows];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const c of cutters) {
    minX = Math.min(minX, c.min.x);
    minZ = Math.min(minZ, c.min.z);
    maxX = Math.max(maxX, c.max.x);
    maxY = Math.max(maxY, c.max.y);
    maxZ = Math.max(maxZ, c.max.z);
  }

  const solidBounds = boundsWithShell(
    { x: minX, y: 0, z: minZ },
    { x: maxX, y: maxY, z: maxZ },
    WORLD_SOLID_SHELL,
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
    solidBrush.materialId = wallMaterialId;
    solidBrush.faceMaterials = null;
    solidBrush.uv = {
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      rotation: 0,
    };
  }
  world.addActor(solid);

  for (const room of rooms) {
    addSubtractBrush(world, {
      ...room,
      gridSize: g,
      tags: ['maze-room'],
    });
  }
  for (const door of doorways) {
    addSubtractBrush(world, {
      ...door,
      gridSize: g,
      tags: ['maze-doorway'],
    });
  }
  for (const win of windows) {
    addSubtractBrush(world, {
      ...win,
      gridSize: g,
      tags: ['maze-window'],
    });
  }

  // Window sills + lintels (additive) so openings read as windows, not doorways.
  const windowDressing = [
    {
      name: 'Sill Entrance',
      min: { x: -80, y: 0, z: -600 },
      max: { x: 80, y: 100, z: -500 },
    },
    {
      name: 'Lintel Entrance',
      min: { x: -80, y: 225, z: -600 },
      max: { x: 80, y: 300, z: -500 },
    },
    {
      name: 'Sill West',
      min: { x: -625, y: 0, z: 0 },
      max: { x: -525, y: 100, z: 200 },
    },
    {
      name: 'Lintel West',
      min: { x: -625, y: 225, z: 0 },
      max: { x: -525, y: 300, z: 200 },
    },
    {
      name: 'Sill Dining',
      min: { x: -625, y: 0, z: 375 },
      max: { x: -525, y: 100, z: 550 },
    },
    {
      name: 'Lintel Dining',
      min: { x: -625, y: 225, z: 375 },
      max: { x: -525, y: 300, z: 550 },
    },
  ];
  for (const piece of windowDressing) {
    addAdditiveBrush(world, {
      ...piece,
      gridSize: g,
      materialId: wallMaterialId,
      tags: ['maze-window-frame'],
    });
  }

  // Atrium pillars (four corners of an inset rect).
  const atrium = rooms.find((r) => r.name === 'Atrium');
  const pillarSize = 50;
  const pillarInset = 110;
  const pillarCorners = [
    { x: atrium.min.x + pillarInset, z: atrium.min.z + pillarInset },
    { x: atrium.max.x - pillarInset - pillarSize, z: atrium.min.z + pillarInset },
    { x: atrium.min.x + pillarInset, z: atrium.max.z - pillarInset - pillarSize },
    { x: atrium.max.x - pillarInset - pillarSize, z: atrium.max.z - pillarInset - pillarSize },
  ];
  pillarCorners.forEach((c, i) => {
    addAdditiveBrush(world, {
      name: `Atrium Pillar ${i}`,
      min: { x: c.x, y: 0, z: c.z },
      max: { x: c.x + pillarSize, y: 550, z: c.z + pillarSize },
      gridSize: g,
      materialId: wallMaterialId,
      tags: ['maze-pillar'],
    });
  });

  // Court pillars (shorter ceremonial set).
  const court = rooms.find((r) => r.name === 'Court Hall');
  const courtPillars = [
    { x: court.min.x + 100, z: court.min.z + 100 },
    { x: court.max.x - 150, z: court.min.z + 100 },
    { x: court.min.x + 100, z: court.max.z - 150 },
    { x: court.max.x - 150, z: court.max.z - 150 },
  ];
  courtPillars.forEach((c, i) => {
    addAdditiveBrush(world, {
      name: `Court Pillar ${i}`,
      min: { x: c.x, y: 0, z: c.z },
      max: { x: c.x + 50, y: 400, z: c.z + 50 },
      gridSize: g,
      materialId: wallMaterialId,
      tags: ['maze-pillar'],
    });
  });

  // Mezzanine balcony along the north atrium wall + stairs up to it.
  addAdditiveBrush(world, {
    name: 'Atrium Balcony',
    min: { x: -100, y: 250, z: 200 },
    max: { x: 400, y: 275, z: 290 },
    gridSize: g,
    materialId: floorMaterialId || wallMaterialId,
    tags: ['maze-platform'],
  });
  // Balcony rail stubs
  addAdditiveBrush(world, {
    name: 'Balcony Rail',
    min: { x: -100, y: 275, z: 200 },
    max: { x: 400, y: 325, z: 215 },
    gridSize: g,
    materialId: wallMaterialId,
    tags: ['maze-platform'],
  });

  const atriumStairs = createStairFromBounds({
    min: { x: 250, y: 0, z: -50 },
    max: { x: 390, y: 0, z: 220 },
    gridSize: g,
    totalRise: 250,
    name: 'Atrium Stairs',
  });
  const atriumStairComp = atriumStairs.getComponent('Stair');
  if (atriumStairComp) atriumStairComp.materialId = wallMaterialId;
  atriumStairs.tags = [...new Set([...(atriumStairs.tags || []), 'maze-stair'])];
  world.addActor(atriumStairs);

  // Low court dais with short steps.
  addAdditiveBrush(world, {
    name: 'Court Dais',
    min: { x: 150, y: 0, z: 450 },
    max: { x: 400, y: 75, z: 625 },
    gridSize: g,
    materialId: floorMaterialId || wallMaterialId,
    tags: ['maze-platform'],
  });
  const courtStairs = createStairFromBounds({
    min: { x: 150, y: 0, z: 350 },
    max: { x: 300, y: 0, z: 450 },
    gridSize: g,
    totalRise: 75,
    name: 'Court Steps',
  });
  const courtStairComp = courtStairs.getComponent('Stair');
  if (courtStairComp) courtStairComp.materialId = wallMaterialId;
  courtStairs.tags = [...new Set([...(courtStairs.tags || []), 'maze-stair'])];
  world.addActor(courtStairs);

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

  const pointLights = [
    { name: 'Entrance Light', x: 0, y: 250, z: -325, color: '#ffe6c0' },
    { name: 'Atrium Light', x: 150, y: 420, z: 75, color: '#fff0d8', intensity: 3.0, range: 1200 },
    { name: 'Dining Light', x: -325, y: 250, z: 475, color: '#dce8ff' },
    { name: 'Court Light', x: 175, y: 350, z: 475, color: '#ffe6c0' },
  ];
  pointLights.forEach((L, i) => {
    world.addActor(createLightActor({
      lightType: 'point',
      name: L.name,
      position: { x: L.x, y: L.y, z: L.z },
      color: L.color,
      intensity: L.intensity ?? 2.4,
      range: L.range ?? 900,
      castShadow: i === 1,
      gridSize: g,
      snapY: false,
    }));
  });

  world.addActor(createPlayerSpawnActor({
    name: 'Player Start',
    position: { x: 0, y: 20, z: -325 },
    rotation: { x: 0, y: 0, z: 0 },
    gridSize: g,
    snapY: false,
  }));

  return world;
}

/**
 * Unreal-style subtractive grid maze:
 * - Whole map is solid (locked World Solid additive brush).
 * - Rooms are identical grid-aligned subtract boxes on a regular pitch.
 * - Doorways are subtract boxes that flush-abut room faces and exactly fill the wall gap.
 *
 * Pass `showcase: true` for the authored hall complex (`subractive-halls.json`).
 */
export function createSubtractiveMazeWorld({
  name = 'Subractive',
  // Keep cutter count modest so World Solid stays under MAX_SUBTRACT_SOLIDS.
  cols = 4,
  rows = 3,
  roomSize = 400,
  wallThickness = 100,
  doorWidth = 200,
  roomHeight = 300,
  gridSize = 25,
  seed = 42,
  wallMaterialId = 'mat_hall_stone',
  floorMaterialId = 'mat_hall_floor',
  /** When true, build the authored multi-height hall (`subractive-halls.json`). */
  showcase = false,
} = {}) {
  if (showcase) {
    return createSubtractiveShowcaseWorld({
      name: name === 'Subractive' ? 'Subractive Halls' : name,
      gridSize,
      wallMaterialId,
      floorMaterialId,
    });
  }

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

  const blockW = cols * room + (cols - 1) * wall;
  const blockD = rows * room + (rows - 1) * wall;
  const originX = snap(-blockW / 2);
  const originZ = snap(-blockD / 2);

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
      const left = ax < bx ? ra : rb;
      const right = ax < bx ? rb : ra;
      const cz = (left.min.z + left.max.z) / 2;
      min = { x: left.max.x, y: 0, z: snap(cz - halfDoor) };
      max = { x: right.min.x, y: height, z: snap(cz + halfDoor) };
    } else {
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
