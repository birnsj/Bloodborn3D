import { describe, expect, it } from 'vitest';
import { createSubtractiveAcceptanceWorld } from '../editor/subtractiveAcceptanceFactory.js';
import { createNewMapWorld } from '../editor/newMapFactory.js';
import {
  getBrushRenderSolids,
  validateWorldSubtractComplexity,
} from '../runtime/brushGeometry.js';
import {
  isWorldSolidActor,
  solidFacesOnBrushHull,
  solidFacesToHide,
  solidToAabb,
} from '../runtime/brushBoolean.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('Phase 2F.7A subtractive map mode', () => {
  it('defaults maps without mapMode to additive', () => {
    const world = deserializeLevel({
      schemaVersion: 2,
      name: 'Legacy',
      actors: [],
    });
    expect(world.mapMode).toBe('additive');
  });

  it('creates subtractive new maps with locked World Solid + starter room', () => {
    const world = createNewMapWorld({ name: 'Sub', mapMode: 'subtractive' });
    expect(world.mapMode).toBe('subtractive');
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    expect(solid?.locked).toBe(true);
    const room = world.actors.find((a) => a.getComponent('Brush')?.operation === 'subtract');
    expect(room).toBeTruthy();
  });

  it('acceptance world validates under the solid cap', () => {
    const world = createSubtractiveAcceptanceWorld();
    const check = validateWorldSubtractComplexity(world);
    expect(check.ok).toBe(true);
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    const carved = getBrushRenderSolids(solid.getComponent('Brush'), {
      world,
      actor: solid,
    });
    expect(carved.solids.length).toBeGreaterThan(1);
    expect(carved.solids.length).toBeLessThanOrEqual(64);
  });

  it('hides internal partitions between sibling solids', () => {
    const world = createSubtractiveAcceptanceWorld();
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    const brush = solid.getComponent('Brush');
    const { solids } = getBrushRenderSolids(brush, { world, actor: solid });
    // Find a pair of solids that share a face; their shared sides must hide.
    let foundShared = false;
    for (let i = 0; i < solids.length; i += 1) {
      for (let j = i + 1; j < solids.length; j += 1) {
        const a = solidToAabb(solids[i]);
        const b = solidToAabb(solids[j]);
        const shareX = Math.abs(a.max.x - b.min.x) < 0.6 || Math.abs(b.max.x - a.min.x) < 0.6;
        const overlapYZ = a.min.y < b.max.y - 1 && a.max.y > b.min.y + 1
          && a.min.z < b.max.z - 1 && a.max.z > b.min.z + 1;
        if (shareX && overlapYZ) {
          foundShared = true;
          const hideA = solidFacesToHide(solids[i], solids, brush.size);
          const hideB = solidFacesToHide(solids[j], solids, brush.size);
          // At least one of the facing sides is hidden on each piece.
          expect(hideA.px || hideA.nx).toBe(true);
          expect(hideB.px || hideB.nx).toBe(true);
          break;
        }
      }
      if (foundShared) break;
    }
    expect(foundShared).toBe(true);
  });

  it('exposes carved interior faces that hull-only would also keep', () => {
    // Floor slab under a room: top visible, bottom + sides on hull hidden.
    const floor = { center: { x: 0, y: -40, z: 0 }, size: { x: 200, y: 20, z: 200 } };
    const brushSize = { x: 200, y: 100, z: 200 };
    const solids = [floor];
    const hide = solidFacesToHide(floor, solids, brushSize);
    const hull = solidFacesOnBrushHull(floor, brushSize);
    expect(hide.py).toBe(false);
    expect(hide.ny).toBe(true);
    expect(hull.py).toBe(false);
    expect(hull.ny).toBe(true);
  });

  it('round-trips acceptance level JSON as subtractive', () => {
    const data = serializeLevel(createSubtractiveAcceptanceWorld());
    expect(data.mapMode).toBe('subtractive');
    const restored = deserializeLevel(data);
    expect(restored.mapMode).toBe('subtractive');
    expect(validateWorldSubtractComplexity(restored).ok).toBe(true);
  });

  it('does not alter additive new-map construction', () => {
    const world = createNewMapWorld({ name: 'Add', mapMode: 'additive' });
    expect(world.mapMode).toBe('additive');
    expect(world.actors.some((a) => isWorldSolidActor(a))).toBe(false);
  });
});