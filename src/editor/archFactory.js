import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import {
  ArchComponent,
  DEFAULT_ARCH_OPENING_HEIGHT,
  DEFAULT_ARCH_RISE,
  DEFAULT_ARCH_THICKNESS,
} from '../components/ArchComponent.js';
import { createId } from '../core/ids.js';
import { snapToGrid, DEFAULT_GRID_EDITOR_UNITS, WALL_THICKNESS } from '../core/units.js';
import { getArchAabbSize } from '../runtime/archGeometry.js';

/**
 * Build a freestanding arch from a construction-plane footprint drag.
 * Longer footprint axis = opening width; shorter = depth (clamped to thickness min).
 */
export function createArchFromBounds({
  min,
  max,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  archType = 'roman',
  openingHeight = DEFAULT_ARCH_OPENING_HEIGHT,
  archRise = DEFAULT_ARCH_RISE,
  name,
} = {}) {
  const g = Math.max(1, gridSize || 25);
  let minX = snapToGrid(Math.min(min.x, max.x), g);
  let maxX = snapToGrid(Math.max(min.x, max.x), g);
  let minZ = snapToGrid(Math.min(min.z, max.z), g);
  let maxZ = snapToGrid(Math.max(min.z, max.z), g);
  const baseY = snapToGrid(min.y ?? 0, g);

  if (maxX === minX) maxX = minX + g * 4;
  if (maxZ === minZ) maxZ = minZ + g;

  const sizeX = Math.max(g, maxX - minX);
  const sizeZ = Math.max(g, maxZ - minZ);

  let openingWidth;
  let depth;
  if (sizeX >= sizeZ) {
    openingWidth = Math.max(g * 2, sizeX - DEFAULT_ARCH_THICKNESS * 2);
    depth = Math.max(WALL_THICKNESS, sizeZ);
  } else {
    openingWidth = Math.max(g * 2, sizeZ - DEFAULT_ARCH_THICKNESS * 2);
    depth = Math.max(WALL_THICKNESS, sizeX);
  }

  const oh = Math.max(g, snapToGrid(openingHeight, g) || g);
  // Gothic defaults taller than a semicircle so the crown reads as pointed.
  let riseSource = archRise;
  if (archType === 'gothic' && (!archRise || archRise === DEFAULT_ARCH_RISE)) {
    riseSource = Math.max(DEFAULT_ARCH_RISE, openingWidth * 0.85);
  } else if (!archRise) {
    riseSource = Math.max(DEFAULT_ARCH_RISE, openingWidth * 0.5);
  }
  const rise = Math.max(g, snapToGrid(riseSource, g) || g);

  const arch = new ArchComponent({
    id: createId('comp'),
    archType,
    openingWidth,
    openingHeight: oh,
    archRise: rise,
    thickness: DEFAULT_ARCH_THICKNESS,
    depth,
  });
  const aabb = getArchAabbSize(arch);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const centerY = baseY + aabb.y / 2;

  // If depth was the X span, rotate 90° so opening faces along Z.
  const rotation = sizeZ > sizeX ? { x: 0, y: 90, z: 0 } : { x: 0, y: 0, z: 0 };

  return new Actor({
    id: createId('actor'),
    name: name || (archType === 'gothic' ? 'Gothic Arch' : 'Roman Arch'),
    transform: new Transform({
      position: { x: centerX, y: centerY, z: centerZ },
      rotation,
    }),
    tags: ['structure', 'arch'],
    components: [arch],
  });
}
