import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import { createId } from '../core/ids.js';
import {
  snapToGrid,
  WALL_MODULE_SIZE,
  WALL_THICKNESS,
  FLOOR_THICKNESS,
  CEILING_THICKNESS,
} from '../core/units.js';
import { snapCenterByEdges, snapPivotToGrid } from './gridSnap.js';

export const BRUSH_PRESETS = {
  box: {
    name: 'Box',
    tag: 'box',
    color: '#8a9099',
    heightMode: 'box',
  },
  wall: {
    name: 'Wall',
    tag: 'wall',
    color: '#8a9099',
    heightMode: 'wall',
  },
  floor: {
    name: 'Floor',
    tag: 'floor',
    color: '#5a6270',
    heightMode: 'floor',
  },
  ceiling: {
    name: 'Ceiling',
    tag: 'ceiling',
    color: '#6a7080',
    heightMode: 'ceiling',
  },
};

/**
 * Build a brush actor from an axis-aligned footprint on the construction plane.
 * Corners and sizes snap to the construction grid. Position is brush center.
 */
export function createBrushFromBounds({
  kind = 'box',
  min,
  max,
  gridSize,
  name,
  operation = 'add',
} = {}) {
  const brushKind = kind === 'subtract' ? 'box' : kind;
  const preset = BRUSH_PRESETS[brushKind] || BRUSH_PRESETS.box;
  const isSubtract = operation === 'subtract' || kind === 'subtract';
  const g = Math.max(1, gridSize || 25);

  let minX = snapToGrid(Math.min(min.x, max.x), g);
  let maxX = snapToGrid(Math.max(min.x, max.x), g);
  let minZ = snapToGrid(Math.min(min.z, max.z), g);
  let maxZ = snapToGrid(Math.max(min.z, max.z), g);
  const baseY = snapToGrid(min.y ?? 0, g);

  if (maxX === minX) maxX = minX + g;
  if (maxZ === minZ) maxZ = minZ + g;

  let sizeX = Math.max(g, maxX - minX);
  let sizeZ = Math.max(g, maxZ - minZ);
  let sizeY;
  let centerY;
  let centerX = (minX + maxX) / 2;
  let centerZ = (minZ + maxZ) / 2;

  if (brushKind === 'wall') {
    sizeY = WALL_MODULE_SIZE;
    // Thickness snaps to grid while preferring the standard wall thickness.
    // Grow thickness from the short-axis min face so both faces sit on grid lines
    // (centering in a wide drag lands faces between cells).
    const thickness = Math.max(g, snapToGrid(WALL_THICKNESS, g) || g);
    if (sizeX <= sizeZ) {
      sizeX = thickness;
      centerX = minX + thickness / 2;
      centerZ = minZ + sizeZ / 2;
    } else {
      sizeZ = thickness;
      centerZ = minZ + thickness / 2;
      centerX = minX + sizeX / 2;
    }
    centerY = baseY + sizeY / 2;
  } else if (brushKind === 'floor') {
    sizeY = FLOOR_THICKNESS;
    centerY = baseY + sizeY / 2;
  } else if (brushKind === 'ceiling') {
    // Same slab architecture as floors; underside sits at standard room height
    // above the construction-plane base so a wall of WALL_MODULE_SIZE meets it.
    sizeY = CEILING_THICKNESS;
    const elevation = max.y != null && Number.isFinite(max.y)
      ? snapToGrid(max.y, g)
      : baseY + WALL_MODULE_SIZE;
    centerY = elevation + sizeY / 2;
  } else {
    // General box: height defaults to one grid cell unless max.y provided
    const topY = max.y != null ? snapToGrid(max.y, g) : baseY + g;
    sizeY = Math.max(g, Math.abs(topY - baseY) || g);
    centerY = baseY + sizeY / 2;
  }

  const tags = ['structure', 'brush', preset.tag];
  if (isSubtract) tags.push('subtract');

  const actor = new Actor({
    id: createId('actor'),
    name: name || (isSubtract ? 'Subtract Box' : preset.name),
    transform: new Transform({
      position: { x: centerX, y: centerY, z: centerZ },
    }),
    tags,
    components: [
      new BrushComponent({
        id: createId('comp'),
        size: { x: sizeX, y: sizeY, z: sizeZ },
        color: isSubtract ? '#c23b4a' : preset.color,
        collidable: !isSubtract,
        operation: isSubtract ? 'subtract' : 'add',
      }),
    ],
  });

  return actor;
}

/**
 * Duplicate actors with new persistent IDs.
 * Offset is snapped to grid increments; final position lands on the grid
 * (brush edge snap, otherwise pivot snap).
 */
export function duplicateActors(actors, { offset = { x: 25, y: 0, z: 0 }, gridSize = 25 } = {}) {
  const g = Math.max(1, gridSize || 25);
  return actors.map((actor) => {
    const data = structuredClone(actor.toJSON());
    data.id = createId('actor');
    data.name = `${actor.name} Copy`;
    const pos = {
      x: data.transform.position.x + snapToGrid(offset.x, g),
      y: data.transform.position.y + snapToGrid(offset.y, g),
      z: data.transform.position.z + snapToGrid(offset.z, g),
    };
    const brush = data.components?.find((c) => c.type === 'Brush');
    data.transform.position = brush?.size
      ? snapCenterByEdges(pos, brush.size, g)
      : snapPivotToGrid(pos, g);
    for (const comp of data.components) {
      comp.id = createId('comp');
    }
    return Actor.fromJSON(data, createComponentFromJSON);
  });
}

/**
 * Resize an AABB brush by moving one face, keeping the opposite face fixed.
 * Returns { size, position } in editor units.
 */
export function resizeBrushFace({ position, size, axis, sign, delta, gridSize, minSize }) {
  const g = Math.max(1, gridSize || 25);
  const minDim = minSize ?? g;
  const nextSize = { ...size };
  const nextPos = { ...position };

  const axisKey = axis; // 'x' | 'y' | 'z'
  const snappedDelta = snapToGrid(delta, g);
  let newSize = size[axisKey] + sign * snappedDelta;

  if (newSize < minDim) {
    newSize = minDim;
  }

  const actualDelta = sign * (newSize - size[axisKey]);
  nextSize[axisKey] = newSize;
  nextPos[axisKey] = position[axisKey] + actualDelta / 2;

  return { size: nextSize, position: nextPos };
}
