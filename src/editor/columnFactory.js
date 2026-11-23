import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  ColumnComponent,
  DEFAULT_COLUMN_HEIGHT,
  DEFAULT_COLUMN_RADIUS,
} from '../components/ColumnComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid, DEFAULT_GRID_EDITOR_UNITS } from '../core/units.js';
import { getColumnAabbSize } from '../runtime/columnGeometry.js';

/**
 * Build a column from a construction-plane footprint drag.
 * Footprint diagonal drives radius; height defaults to one wall module.
 */
export function createColumnFromBounds({
  min,
  max,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  height = DEFAULT_COLUMN_HEIGHT,
  shape = 'round',
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
  const footprintRadius = snapToGrid(Math.min(sizeX, sizeZ) * 0.5, g) || g;
  // Tiny footprints still place a full-height, game-scale column.
  const radius = Math.max(DEFAULT_COLUMN_RADIUS, footprintRadius);
  const colHeight = Math.max(g, snapToGrid(height, g) || DEFAULT_COLUMN_HEIGHT);

  const column = new ColumnComponent({
    id: createId('comp'),
    shape,
    height: colHeight,
    radius,
  });
  const aabb = getColumnAabbSize(column);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const centerY = baseY + aabb.y / 2;

  return new Actor({
    id: createId('actor'),
    name: name || 'Column',
    transform: new Transform({
      position: { x: centerX, y: centerY, z: centerZ },
    }),
    tags: ['structure', 'column'],
    components: [column],
  });
}
