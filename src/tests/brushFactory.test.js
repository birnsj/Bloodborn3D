import { describe, expect, it } from 'vitest';
import {
  createBrushFromBounds,
  resizeBrushFace,
} from '../editor/brushFactory.js';
import { GRID_INCREMENTS, snapToGrid } from '../core/units.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { World } from '../core/World.js';

describe('brushFactory', () => {
  it('creates grid-snapped walls, floors, and boxes', () => {
    const wall = createBrushFromBounds({
      kind: 'wall',
      min: { x: 12, y: 0, z: 12 },
      max: { x: 312, y: 0, z: 40 },
      gridSize: 25,
    });
    const brush = wall.getComponent('Brush');
    expect(brush.size.y).toBe(300);
    // Wide short-axis drag: thickness grows from min face so edges sit on grid.
    expect(brush.size.z).toBe(25);
    const wallMinZ = wall.transform.position.z - brush.size.z / 2;
    const wallMaxZ = wall.transform.position.z + brush.size.z / 2;
    expect(wallMinZ).toBe(0);
    expect(wallMaxZ).toBe(25);

    const floor = createBrushFromBounds({
      kind: 'floor',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 300, y: 0, z: 300 },
      gridSize: 25,
    });
    expect(floor.getComponent('Brush').size.y).toBe(20);
    const floorBrush = floor.getComponent('Brush');
    expect(floor.transform.position.x - floorBrush.size.x / 2).toBe(0);
    expect(floor.transform.position.x + floorBrush.size.x / 2).toBe(300);

    const box = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 50, z: 100 },
      gridSize: 25,
    });
    expect(box.getComponent('Brush').size.x).toBe(100);
    expect(box.getComponent('Brush').size.y).toBe(50);
  });

  it('resizes a face while keeping the opposite face fixed', () => {
    const result = resizeBrushFace({
      position: { x: 0, y: 50, z: 0 },
      size: { x: 100, y: 100, z: 100 },
      axis: 'x',
      sign: 1,
      delta: 50,
      gridSize: 25,
    });
    expect(result.size.x).toBe(150);
    expect(result.position.x).toBe(25);
    // Left face stays at x = -50
    expect(result.position.x - result.size.x / 2).toBe(-50);
  });

  it('round-trips created brushes through level JSON with stable ids', () => {
    const world = new World({ name: 'BrushMap', schemaVersion: 1 });
    const wall = createBrushFromBounds({
      kind: 'wall',
      min: { x: -150, y: 0, z: -10 },
      max: { x: 150, y: 0, z: 10 },
      gridSize: 25,
      name: 'Custom Wall',
    });
    world.addActor(wall);
    const json = serializeLevel(world);
    const restored = deserializeLevel(json);
    const again = restored.getActor(wall.id);
    expect(again.name).toBe('Custom Wall');
    expect(again.getComponent('Brush').id).toBe(wall.getComponent('Brush').id);
    expect(again.getComponent('Brush').size).toEqual(wall.getComponent('Brush').size);
  });
});

describe('grid increments', () => {
  it('exposes the Phase 2A construction grid set', () => {
    expect(GRID_INCREMENTS).toEqual([1, 5, 10, 25, 50, 100]);
    expect(snapToGrid(37, 25)).toBe(25);
    expect(snapToGrid(37, 10)).toBe(40);
    expect(snapToGrid(37, 1)).toBe(37);
  });
});
