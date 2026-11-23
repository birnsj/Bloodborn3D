import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  StairComponent,
  DEFAULT_STEP_HEIGHT,
  DEFAULT_INNER_RADIUS,
  DEFAULT_SPIRAL_INNER_RADIUS,
  DEFAULT_STAIR_WIDTH,
} from '../components/StairComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid, DEFAULT_GRID_EDITOR_UNITS, WALL_MODULE_SIZE } from '../core/units.js';
import { getStairAabbSize } from '../runtime/stairGeometry.js';

/**
 * Build a straight staircase from a construction-plane footprint.
 * Longer axis = run; rise defaults toward one wall-module when unspecified.
 */
export function createStairFromBounds({
  min,
  max,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  totalRise = WALL_MODULE_SIZE,
  name,
} = {}) {
  const g = Math.max(1, gridSize || 25);
  let minX = snapToGrid(Math.min(min.x, max.x), g);
  let maxX = snapToGrid(Math.max(min.x, max.x), g);
  let minZ = snapToGrid(Math.min(min.z, max.z), g);
  let maxZ = snapToGrid(Math.max(min.z, max.z), g);
  const baseY = snapToGrid(min.y ?? 0, g);

  if (maxX === minX) maxX = minX + g;
  if (maxZ === minZ) maxZ = minZ + g;

  const sizeX = Math.max(g, maxX - minX);
  const sizeZ = Math.max(g, maxZ - minZ);
  const dragDx = (max.x ?? maxX) - (min.x ?? minX);
  const dragDz = (max.z ?? maxZ) - (min.z ?? minZ);

  let width;
  let runLength;
  let direction;
  if (sizeX >= sizeZ) {
    runLength = sizeX;
    width = sizeZ;
    direction = dragDx >= 0 ? 'x+' : 'x-';
  } else {
    runLength = sizeZ;
    width = sizeX;
    direction = dragDz >= 0 ? 'z+' : 'z-';
  }

  const rise = Math.max(g, snapToGrid(totalRise, g) || g);
  // Comfortable riser count from total rise; tread depth fills the footprint run.
  let stepHeight = DEFAULT_STEP_HEIGHT;
  const stepCount = Math.max(1, Math.round(rise / stepHeight));
  stepHeight = rise / stepCount;
  const treadDepth = Math.max(1, runLength / stepCount);

  const stair = new StairComponent({
    id: createId('comp'),
    width,
    stepCount,
    stepHeight,
    treadDepth,
    direction,
  });
  const aabb = getStairAabbSize(stair);

  return new Actor({
    id: createId('actor'),
    name: name || 'Stairs',
    transform: new Transform({
      position: {
        x: (minX + maxX) / 2,
        y: baseY + aabb.y / 2,
        z: (minZ + maxZ) / 2,
      },
    }),
    tags: ['structure', 'stair'],
    components: [stair],
  });
}

/**
 * Place a curved or spiral staircase centered at a world position.
 */
export function createCurvedStairActor({
  stairType = 'curved',
  position = { x: 0, y: 0, z: 0 },
  width = DEFAULT_STAIR_WIDTH,
  innerRadius = stairType === 'spiral' ? DEFAULT_SPIRAL_INNER_RADIUS : DEFAULT_INNER_RADIUS,
  sweepAngle = stairType === 'spiral' ? 360 : 180,
  clockwise = true,
  startAngle = 0,
  stepCount = stairType === 'spiral' ? 16 : 12,
  totalRise = WALL_MODULE_SIZE,
  name,
  materialId = null,
  color = '#8a9099',
} = {}) {
  const rise = Math.max(1, Number(totalRise) || WALL_MODULE_SIZE);
  const count = Math.max(1, Math.round(Number(stepCount) || 1));
  const stepHeight = rise / count;
  const type = stairType === 'spiral' ? 'spiral' : 'curved';
  const stair = new StairComponent({
    id: createId('comp'),
    stairType: type,
    width,
    innerRadius,
    sweepAngle,
    clockwise,
    startAngle,
    stepCount: count,
    stepHeight,
    materialId,
    color,
  });
  const aabb = getStairAabbSize(stair);
  const baseY = position.y ?? 0;
  return new Actor({
    id: createId('actor'),
    name: name || (type === 'spiral' ? 'Spiral Stairs' : 'Curved Stairs'),
    transform: new Transform({
      position: {
        x: position.x ?? 0,
        y: baseY + aabb.y / 2,
        z: position.z ?? 0,
      },
    }),
    tags: ['structure', 'stair', type],
    components: [stair],
  });
}
