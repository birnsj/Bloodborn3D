import { describe, expect, it } from 'vitest';
import {
  createSubtractiveMazeLevelData,
  createSubtractiveMazeWorld,
  generateMazePassages,
} from '../editor/subtractiveMazeFactory.js';
import { validateWorldSubtractComplexity } from '../runtime/brushGeometry.js';

describe('generateMazePassages', () => {
  it('connects every cell in a perfect maze', () => {
    const cols = 4;
    const rows = 3;
    const passages = generateMazePassages(cols, rows, 42);
    expect(passages.size).toBe(cols * rows - 1);
  });
});

describe('createSubtractiveMazeWorld', () => {
  it('builds a solid world with flush grid-aligned room and doorway boxes', () => {
    const world = createSubtractiveMazeWorld({
      cols: 4,
      rows: 3,
      roomSize: 400,
      wallThickness: 100,
      doorWidth: 200,
      roomHeight: 300,
      gridSize: 25,
    });
    expect(world.mapMode).toBe('subtractive');

    const solid = world.actors.find((a) => a.tags?.includes('world-solid'));
    expect(solid).toBeTruthy();
    expect(solid.locked).toBe(true);
    const brush = solid.getComponent('Brush');
    expect(brush.operation).toBe('add');
    expect(brush.materialId).toBe('mat_hall_stone');
    expect(brush.faceMaterials).toBeNull();
    expect(brush.uv?.scale?.x).toBe(1);
    expect(brush.uv?.scale?.y).toBe(1);
    // 4×3 rooms (400) + 3/2 walls (100) + outer shell (100) each side.
    expect(brush.size.x).toBe(4 * 400 + 3 * 100 + 2 * 100);
    expect(brush.size.z).toBe(3 * 400 + 2 * 100 + 2 * 100);
    expect(brush.size.y).toBe(300 + 2 * 100);

    const rooms = world.actors.filter((a) => a.tags?.includes('maze-room'));
    const doorways = world.actors.filter((a) => a.tags?.includes('maze-doorway'));
    expect(rooms).toHaveLength(12);
    expect(doorways).toHaveLength(11);

    // Every room is the same size and sits on the construction grid.
    for (const room of rooms) {
      const b = room.getComponent('Brush');
      expect(b.operation).toBe('subtract');
      expect(b.size.x).toBe(400);
      expect(b.size.y).toBe(300);
      expect(b.size.z).toBe(400);
      expect(Math.abs(room.transform.position.x % 25)).toBe(0);
      expect(Math.abs(room.transform.position.z % 25)).toBe(0);
    }

    // Doorways fill the wall gap exactly (depth = wall thickness) and share room faces.
    for (const door of doorways) {
      const b = door.getComponent('Brush');
      expect(b.operation).toBe('subtract');
      expect(b.size.y).toBe(300);
      const thin = Math.min(b.size.x, b.size.z);
      const wide = Math.max(b.size.x, b.size.z);
      expect(thin).toBe(100);
      expect(wide).toBe(200);
    }

    // Spot-check flush abutment: Doorway 0 sits between two rooms with shared X or Z faces.
    const door0 = doorways[0];
    const dPos = door0.transform.position;
    const dSize = door0.getComponent('Brush').size;
    const dMinX = dPos.x - dSize.x / 2;
    const dMaxX = dPos.x + dSize.x / 2;
    const dMinZ = dPos.z - dSize.z / 2;
    const dMaxZ = dPos.z + dSize.z / 2;

    const flushWithRoom = rooms.some((room) => {
      const rPos = room.transform.position;
      const rSize = room.getComponent('Brush').size;
      const rMinX = rPos.x - rSize.x / 2;
      const rMaxX = rPos.x + rSize.x / 2;
      const rMinZ = rPos.z - rSize.z / 2;
      const rMaxZ = rPos.z + rSize.z / 2;
      return dMinX === rMaxX || dMaxX === rMinX || dMinZ === rMaxZ || dMaxZ === rMinZ;
    });
    expect(flushWithRoom).toBe(true);

    expect(world.actors.some((a) => a.getComponent('PlayerSpawn'))).toBe(true);
    expect(world.actors.filter((a) => a.getComponent('Light')).length).toBeGreaterThanOrEqual(2);

    const complexity = validateWorldSubtractComplexity(world);
    expect(complexity.ok).toBe(true);
  });

  it('serializes to level data with mapMode', () => {
    const data = createSubtractiveMazeLevelData({ name: 'Subractive' });
    expect(data.mapMode).toBe('subtractive');
    expect(data.name).toBe('Subractive');
    expect(data.actors.length).toBeGreaterThan(5);
  });
});
