import { serializeLevel } from '../serialization/LevelSerializer.js';
import { createBrushFromBounds } from './brushFactory.js';
import { createSubtractiveMazeWorld } from './subtractiveMazeFactory.js';

/**
 * Phase 2F.7A subtractive acceptance world.
 * Starts from a compact 2×2 maze (proven under the solid cap), then adds:
 * overlapping cut, raised alcove, and additive pillar/platform.
 */
export function createSubtractiveAcceptanceWorld({
  name = 'Acceptance Subtractive',
  gridSize = 25,
  wallMaterialId = 'mat_hall_stone',
  floorMaterialId = 'mat_hall_floor',
} = {}) {
  const world = createSubtractiveMazeWorld({
    name,
    cols: 2,
    rows: 2,
    roomSize: 350,
    wallThickness: 100,
    doorWidth: 150,
    roomHeight: 280,
    gridSize,
    seed: 7,
    wallMaterialId,
  });

  const g = Math.max(1, gridSize);
  const snap = (v) => Math.round(v / g) * g;

  // Find Room 0,0 bounds from actor for extras.
  const room00 = world.actors.find((a) => a.name === 'Room 0,0');
  const rBrush = room00?.getComponent?.('Brush');
  const rp = room00?.transform?.position;
  if (room00 && rBrush && rp) {
    const hx = rBrush.size.x * 0.5;
    const hz = rBrush.size.z * 0.5;
    const minX = rp.x - hx;
    const maxX = rp.x + hx;
    const minZ = rp.z - hz;

    // Overlapping cut: alcove that overlaps Room 0,0 and extends through the wall.
    const overlap = createBrushFromBounds({
      kind: 'box',
      min: { x: snap(maxX - 75), y: 0, z: snap(minZ + 75) },
      max: { x: snap(maxX + 100), y: 240, z: snap(minZ + 200) },
      gridSize: g,
      name: 'Overlap Alcove',
      operation: 'subtract',
    });
    overlap.tags = [...new Set([...(overlap.tags || []), 'acceptance-overlap'])];
    world.addActor(overlap);

    // Raised elevation alcove inside Room 1,0 (floor at y=120).
    const room10 = world.actors.find((a) => a.name === 'Room 1,0');
    const b1 = room10?.getComponent?.('Brush');
    const p1 = room10?.transform?.position;
    if (room10 && b1 && p1) {
      const x0 = p1.x - b1.size.x * 0.25;
      const z0 = p1.z - b1.size.z * 0.25;
      const upper = createBrushFromBounds({
        kind: 'box',
        min: { x: snap(x0), y: 120, z: snap(z0) },
        max: {
          x: snap(x0 + b1.size.x * 0.45),
          y: 280,
          z: snap(z0 + b1.size.z * 0.45),
        },
        gridSize: g,
        name: 'Upper Alcove',
        operation: 'subtract',
      });
      upper.tags = [...new Set([...(upper.tags || []), 'acceptance-upper'])];
      world.addActor(upper);
    }

    // Additive pillar + platform inside Room 0,0
    const pillar = createBrushFromBounds({
      kind: 'box',
      min: { x: snap(minX + 50), y: 0, z: snap(minZ + 50) },
      max: { x: snap(minX + 100), y: 200, z: snap(minZ + 100) },
      gridSize: g,
      name: 'Pillar A',
      operation: 'add',
    });
    const pillarBrush = pillar.getComponent('Brush');
    if (pillarBrush) pillarBrush.materialId = wallMaterialId;
    world.addActor(pillar);

    const platform = createBrushFromBounds({
      kind: 'box',
      min: { x: snap(minX + 120), y: 100, z: snap(minZ + 40) },
      max: { x: snap(minX + 220), y: 125, z: snap(minZ + 140) },
      gridSize: g,
      name: 'Platform A',
      operation: 'add',
    });
    const platformBrush = platform.getComponent('Brush');
    if (platformBrush) platformBrush.materialId = floorMaterialId || wallMaterialId;
    world.addActor(platform);
  }

  // Tag rooms/doors for acceptance queries.
  for (const actor of world.actors) {
    const brush = actor.getComponent?.('Brush');
    if (!brush || brush.operation !== 'subtract') continue;
    if (actor.name?.startsWith('Room')) {
      actor.tags = [...new Set([...(actor.tags || []), 'acceptance-room'])];
    }
    if (actor.name?.startsWith('Doorway')) {
      actor.tags = [...new Set([...(actor.tags || []), 'acceptance-corridor'])];
    }
  }

  return world;
}

export function createSubtractiveAcceptanceLevelData(options = {}) {
  return serializeLevel(createSubtractiveAcceptanceWorld(options));
}