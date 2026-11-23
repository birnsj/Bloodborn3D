import { snapToGrid, DEFAULT_GRID_EDITOR_UNITS } from '../core/units.js';

/**
 * Structural geo: snap so AABB min faces land on grid lines (edge snap).
 * Returns the center position that achieves that.
 */
export function snapCenterByEdges(
  position,
  size,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  axes = { x: true, y: true, z: true },
) {
  const g = Math.max(1, gridSize || DEFAULT_GRID_EDITOR_UNITS);
  const next = { ...position };
  for (const axis of ['x', 'y', 'z']) {
    if (axes[axis] === false) continue;
    const dim = Number(size?.[axis]);
    if (!(dim > 0)) {
      next[axis] = snapToGrid(position[axis], g);
      continue;
    }
    next[axis] = snapToGrid(position[axis] - dim / 2, g) + dim / 2;
  }
  return next;
}

/**
 * Props / lights / pivots: snap the pivot point to the grid.
 */
export function snapPivotToGrid(
  position,
  gridSize = DEFAULT_GRID_EDITOR_UNITS,
  { snapY = true } = {},
) {
  const g = Math.max(1, gridSize || DEFAULT_GRID_EDITOR_UNITS);
  return {
    x: snapToGrid(position.x, g),
    y: snapY ? snapToGrid(position.y, g) : position.y,
    z: snapToGrid(position.z, g),
  };
}

/**
 * Brush AABB size for edge snap, or null → use pivot snap.
 */
export function getBrushSnapSize(actor) {
  const size = actor?.getComponent?.('Brush')?.size;
  if (!size) return null;
  return { x: size.x, y: size.y, z: size.z };
}

/**
 * Snap a moved axis value: brushes by edge, props/lights by pivot.
 * Pivot uses relative grid steps so off-grid heights (e.g. light lift) are kept.
 */
export function snapMovedAxis({
  startValue,
  delta,
  gridSize,
  sizeAlongAxis = null,
}) {
  const g = Math.max(1, gridSize || DEFAULT_GRID_EDITOR_UNITS);
  if (sizeAlongAxis > 0) {
    const half = sizeAlongAxis / 2;
    return snapToGrid(startValue - half + delta, g) + half;
  }
  return startValue + snapToGrid(delta, g);
}
