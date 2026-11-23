import { describe, expect, it } from 'vitest';
import {
  EDITOR_UNITS_PER_METER,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_INCREMENTS,
  WALL_MODULE_SIZE,
  WALL_THICKNESS,
  FLOOR_THICKNESS,
  toMeters,
  toEditorUnits,
  vec3ToMeters,
  vec3ToEditorUnits,
  snapToGrid,
  snapVec3ToGrid,
} from '../core/units.js';

describe('unit conversion', () => {
  it('uses 100 editor units per meter', () => {
    expect(EDITOR_UNITS_PER_METER).toBe(100);
    expect(toMeters(100)).toBe(1);
    expect(toEditorUnits(1)).toBe(100);
  });

  it('converts standard module sizes to meters', () => {
    expect(toMeters(WALL_MODULE_SIZE)).toBe(3);
    expect(toMeters(WALL_THICKNESS)).toBe(0.2);
    expect(toMeters(FLOOR_THICKNESS)).toBe(0.2);
  });

  it('round-trips vectors', () => {
    const editor = { x: 300, y: 20, z: -150 };
    const meters = vec3ToMeters(editor);
    expect(meters).toEqual({ x: 3, y: 0.2, z: -1.5 });
    expect(vec3ToEditorUnits(meters)).toEqual(editor);
  });

  it('snaps to the default 25-unit construction grid', () => {
    expect(DEFAULT_GRID_EDITOR_UNITS).toBe(25);
    expect(GRID_INCREMENTS).toContain(25);
    expect(snapToGrid(12)).toBe(0);
    expect(snapToGrid(13)).toBe(25);
    expect(snapToGrid(37)).toBe(25);
    expect(snapToGrid(38)).toBe(50);
    expect(snapVec3ToGrid({ x: 12, y: 40, z: -13 })).toEqual({
      x: 0,
      y: 50,
      z: -25,
    });
  });
});
