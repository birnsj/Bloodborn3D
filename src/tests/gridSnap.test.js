import { describe, expect, it } from 'vitest';
import {
  snapCenterByEdges,
  snapPivotToGrid,
  snapMovedAxis,
} from '../editor/gridSnap.js';
import { defaultFootprintAt } from '../editor/creation/surfacePlacement.js';

function expectOnGrid(value, g = 25) {
  expect(Math.abs(value / g - Math.round(value / g))).toBeLessThan(1e-9);
}

describe('gridSnap', () => {
  it('snaps brush centers so AABB edges land on the grid', () => {
    const size = { x: 75, y: 20, z: 75 };
    const pos = snapCenterByEdges(
      { x: 50, y: 10, z: 50 },
      size,
      25,
    );
    expectOnGrid(pos.x - size.x / 2);
    expectOnGrid(pos.x + size.x / 2);
    expectOnGrid(pos.z - size.z / 2);
    expectOnGrid(pos.z + size.z / 2);
  });

  it('snaps pivots to grid points for props', () => {
    expect(snapPivotToGrid({ x: 37, y: 12, z: 12 }, 25)).toEqual({
      x: 25,
      y: 0,
      z: 0,
    });
    expect(snapPivotToGrid({ x: 37, y: 88, z: 12 }, 25, { snapY: false })).toEqual({
      x: 25,
      y: 88,
      z: 0,
    });
  });

  it('moves brushes by snapping the dragged edge', () => {
    // Size 75, start center 37.5 (edges 0..75). Delta +40 → min edge to 50.
    expect(snapMovedAxis({
      startValue: 37.5,
      delta: 40,
      gridSize: 25,
      sizeAlongAxis: 75,
    })).toBe(87.5);
    expectOnGrid(87.5 - 75 / 2);
    expectOnGrid(87.5 + 75 / 2);
    // Props / lights: relative pivot steps (keeps off-grid lift heights).
    // snap(40, 25) = 50 → 40 + 50 = 90
    expect(snapMovedAxis({
      startValue: 40,
      delta: 40,
      gridSize: 25,
      sizeAlongAxis: null,
    })).toBe(90);
  });

  it('builds default footprints on whole grid cells', () => {
    const wall = defaultFootprintAt('wall', { x: 12, y: 0, z: 12 }, 25);
    expectOnGrid(wall.min.x);
    expectOnGrid(wall.max.x);
    expect(wall.max.x - wall.min.x).toBe(25);
    expectOnGrid(wall.min.z);
    expectOnGrid(wall.max.z);

    const floor = defaultFootprintAt('floor', { x: 10, y: 0, z: 10 }, 25);
    expectOnGrid(floor.min.x);
    expectOnGrid(floor.max.x);
  });
});
