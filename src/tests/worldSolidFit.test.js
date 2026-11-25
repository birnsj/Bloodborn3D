import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { ensureWorldSolidContainsSubtracts } from '../editor/worldSolidFit.js';
import { boundsWithShell, WORLD_SOLID_SHELL } from '../editor/newMapFactory.js';

describe('ensureWorldSolidContainsSubtracts', () => {
  it('is a no-op on additive maps', () => {
    const world = new World({ name: 'Add', mapMode: 'additive' });
    expect(ensureWorldSolidContainsSubtracts(world, { gridSize: 25 })).toBe(false);
  });

  it('grows World Solid when a subtract extends past the shell', () => {
    const world = new World({ name: 'Fit', mapMode: 'subtractive' });
    const room = { min: { x: -100, y: 0, z: -100 }, max: { x: 100, y: 200, z: 100 } };
    const solidBounds = boundsWithShell(room.min, room.max, WORLD_SOLID_SHELL);
    const solid = createBrushFromBounds({
      kind: 'box',
      min: solidBounds.min,
      max: solidBounds.max,
      gridSize: 25,
      name: 'World Solid',
      operation: 'add',
    });
    solid.tags = ['world-solid'];
    solid.locked = true;
    world.addActor(solid);

    const cutter = createBrushFromBounds({
      kind: 'box',
      min: { x: -100, y: 0, z: -100 },
      max: { x: 100, y: 200, z: 100 },
      gridSize: 25,
      name: 'Room',
      operation: 'subtract',
    });
    world.addActor(cutter);
    expect(ensureWorldSolidContainsSubtracts(world, { gridSize: 25 })).toBe(false);

    // Move cutter far outside current solid.
    cutter.transform.position = { x: 800, y: 100, z: 0 };
    expect(ensureWorldSolidContainsSubtracts(world, { gridSize: 25 })).toBe(true);
    const brush = solid.getComponent('Brush');
    expect(brush.size.x).toBeGreaterThan(solidBounds.max.x - solidBounds.min.x);
  });
});