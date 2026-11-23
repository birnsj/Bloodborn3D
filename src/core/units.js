/**
 * BloodBound unit conversion at the engine boundary.
 *
 * Editor / authored JSON uses editor units.
 * Three.js and Rapier operate in meters.
 *
 * 100 editor units = 1 meter
 */

export const EDITOR_UNITS_PER_METER = 100;
export const DEFAULT_GRID_EDITOR_UNITS = 25;
export const GRID_INCREMENTS = [1, 5, 10, 25, 50, 100];
export const WALL_MODULE_SIZE = 300;
export const WALL_THICKNESS = 20;
export const FLOOR_THICKNESS = 20;
export const CEILING_THICKNESS = 20;
/** Construction grid visual extent in editor units (24 m). */
export const GRID_EXTENT_EDITOR_UNITS = 2400;

export function toMeters(editorUnits) {
  return editorUnits / EDITOR_UNITS_PER_METER;
}

export function toEditorUnits(meters) {
  return meters * EDITOR_UNITS_PER_METER;
}

export function vec3ToMeters(v) {
  return {
    x: toMeters(v.x),
    y: toMeters(v.y),
    z: toMeters(v.z),
  };
}

export function vec3ToEditorUnits(v) {
  return {
    x: toEditorUnits(v.x),
    y: toEditorUnits(v.y),
    z: toEditorUnits(v.z),
  };
}

/**
 * Snap a value in editor units to the construction grid.
 */
export function snapToGrid(value, gridSize = DEFAULT_GRID_EDITOR_UNITS) {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function snapVec3ToGrid(vec, gridSize = DEFAULT_GRID_EDITOR_UNITS) {
  return {
    x: snapToGrid(vec.x, gridSize),
    y: snapToGrid(vec.y, gridSize),
    z: snapToGrid(vec.z, gridSize),
  };
}
