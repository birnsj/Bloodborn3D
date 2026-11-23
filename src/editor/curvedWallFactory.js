import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  CurvedWallComponent,
  DEFAULT_CURVED_WALL_RADIUS,
  DEFAULT_CURVED_WALL_SWEEP,
} from '../components/CurvedWallComponent.js';
import { createId } from '../core/ids.js';
import {
  snapToGrid,
  DEFAULT_GRID_EDITOR_UNITS,
  WALL_MODULE_SIZE,
  WALL_THICKNESS,
} from '../core/units.js';

/**
 * Build a curved wall from a construction-plane footprint drag.
 * Circle center = footprint center; radius from half the larger horizontal span.
 * Default sweep 90° (editable). Drag aspect can bias toward 180/360 for round rooms.
 */
export function createCurvedWallFromBounds({
  min,
  max,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  sweepAngle = DEFAULT_CURVED_WALL_SWEEP,
  height = WALL_MODULE_SIZE,
  thickness = WALL_THICKNESS,
  name,
} = {}) {
  const g = Math.max(1, gridSize || 25);
  let minX = snapToGrid(Math.min(min.x, max.x), g);
  let maxX = snapToGrid(Math.max(min.x, max.x), g);
  let minZ = snapToGrid(Math.min(min.z, max.z), g);
  let maxZ = snapToGrid(Math.max(min.z, max.z), g);
  const baseY = snapToGrid(min.y ?? 0, g);

  if (maxX === minX) maxX = minX + g * 4;
  if (maxZ === minZ) maxZ = minZ + g * 4;

  const sizeX = Math.max(g, maxX - minX);
  const sizeZ = Math.max(g, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const outerSpan = Math.max(sizeX, sizeZ) * 0.5;
  const wallThickness = Math.max(g, snapToGrid(thickness, g) || WALL_THICKNESS);
  const radius = Math.max(
    wallThickness * 0.5 + g,
    snapToGrid(outerSpan - wallThickness * 0.5, g) || DEFAULT_CURVED_WALL_RADIUS,
  );

  // Near-square footprints → full circle tower; elongated → open arc corridor.
  const aspect = Math.max(sizeX, sizeZ) / Math.max(1, Math.min(sizeX, sizeZ));
  let sweep = sweepAngle;
  if (sweepAngle === DEFAULT_CURVED_WALL_SWEEP) {
    if (aspect < 1.15 && Math.min(sizeX, sizeZ) >= g * 6) sweep = 360;
    else if (aspect < 1.4) sweep = 180;
    else sweep = 90;
  }
  sweep = Math.max(1, Math.min(360, snapToGrid(sweep, 1) || sweep));

  const wallHeight = Math.max(g, snapToGrid(height, g) || WALL_MODULE_SIZE);
  const wall = new CurvedWallComponent({
    id: createId('comp'),
    radius,
    sweepAngle: sweep,
    startAngle: 0,
    height: wallHeight,
    thickness: wallThickness,
    clockwise: false,
  });

  return new Actor({
    id: createId('actor'),
    name: name || (sweep >= 359 ? 'Circular Wall' : 'Curved Wall'),
    transform: new Transform({
      position: { x: centerX, y: baseY + wallHeight / 2, z: centerZ },
    }),
    tags: ['structure', 'curvedWall', 'wall'],
    components: [wall],
  });
}
