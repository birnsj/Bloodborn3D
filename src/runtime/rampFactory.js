import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  RampComponent,
  DEFAULT_RAMP_RISE,
  DEFAULT_RAMP_WIDTH,
  DEFAULT_RAMP_LENGTH,
} from '../components/RampComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid, DEFAULT_GRID_EDITOR_UNITS } from '../core/units.js';
import { getRampAabbSize } from './rampGeometry.js';

/**
 * Build a ramp from a construction-plane footprint drag.
 * Drag sets placement + slope direction; undersized footprints expand to game scale.
 */
export function createRampFromBounds({
  min,
  max,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  rise = DEFAULT_RAMP_RISE,
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

  let footprintWidth;
  let footprintLength;
  let direction;
  if (sizeX >= sizeZ) {
    footprintLength = sizeX;
    footprintWidth = sizeZ;
    direction = dragDx >= 0 ? 'x+' : 'x-';
  } else {
    footprintLength = sizeZ;
    footprintWidth = sizeX;
    direction = dragDz >= 0 ? 'z+' : 'z-';
  }

  const rampRise = Math.max(g, snapToGrid(rise, g) || DEFAULT_RAMP_RISE);
  const minLength = Math.max(DEFAULT_RAMP_LENGTH, rampRise);
  const width = Math.max(DEFAULT_RAMP_WIDTH, footprintWidth);
  const length = Math.max(minLength, footprintLength);

  const ramp = new RampComponent({
    id: createId('comp'),
    width,
    length,
    rise: rampRise,
    direction,
  });
  const aabb = getRampAabbSize(ramp);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const centerY = baseY + aabb.y / 2;

  return new Actor({
    id: createId('actor'),
    name: name || 'Ramp',
    transform: new Transform({
      position: { x: centerX, y: centerY, z: centerZ },
    }),
    tags: ['structure', 'ramp'],
    components: [ramp],
  });
}
