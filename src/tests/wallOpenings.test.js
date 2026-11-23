import { describe, expect, it } from 'vitest';
import { BrushComponent } from '../components/BrushComponent.js';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetBrushOpeningsCommand } from '../editor/history/commands.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import {
  OPENING_DEFAULTS,
  buildWallOpeningSolids,
  createDefaultOpening,
  getWallAxes,
  isWallBrush,
  pointInOpening,
  validateOpenings,
} from '../runtime/wallOpenings.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { Transform } from '../core/Transform.js';

const wallX = { x: 600, y: 300, z: 25 };
const wallZ = { x: 25, y: 300, z: 600 };

describe('wall openings data', () => {
  it('defaults door and window sizes', () => {
    expect(createDefaultOpening('door')).toMatchObject({
      type: 'door',
      ...OPENING_DEFAULTS.door,
      offset: 0,
    });
    expect(createDefaultOpening('window')).toMatchObject({
      type: 'window',
      ...OPENING_DEFAULTS.window,
      offset: 0,
    });
  });

  it('detects walls by tag or thickness', () => {
    const tagged = new Actor({
      id: 'a',
      name: 'W',
      tags: ['wall'],
      components: [new BrushComponent({ size: { x: 200, y: 200, z: 200 } })],
    });
    expect(isWallBrush(tagged)).toBe(true);
    expect(isWallBrush(new BrushComponent({ size: wallX }))).toBe(true);
    expect(isWallBrush(new BrushComponent({ size: { x: 200, y: 200, z: 200 } }))).toBe(false);
  });

  it('clamps openings inside wall bounds', () => {
    const { openings, errors } = validateOpenings(wallX, [{
      id: 'o1',
      type: 'door',
      offset: 500,
      bottom: -20,
      width: 200,
      height: 400,
    }]);
    expect(openings).toHaveLength(1);
    const o = openings[0];
    expect(o.offset + o.width * 0.5).toBeLessThanOrEqual(wallX.x * 0.5);
    expect(o.bottom).toBeGreaterThanOrEqual(0);
    expect(o.bottom + o.height).toBeLessThanOrEqual(wallX.y);
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('rejects overlapping openings along length×height', () => {
    const { openings, errors } = validateOpenings(wallX, [
      createDefaultOpening('door', { id: 'a', offset: 0 }),
      createDefaultOpening('door', { id: 'b', offset: 0 }),
    ]);
    expect(openings.length).toBe(1);
    expect(errors.some((e) => /overlap/i.test(e))).toBe(true);
  });

  it('serializes openings round-trip on BrushComponent', () => {
    const openings = [createDefaultOpening('door', { id: 'op_door', offset: 50 })];
    const brush = new BrushComponent({
      id: 'comp_w',
      size: wallX,
      openings,
    });
    const world = new World({ name: 'O', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'actor_w',
      name: 'Wall',
      tags: ['wall'],
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [brush],
    }));
    const json = serializeLevel(world);
    const restored = deserializeLevel(json);
    const again = restored.getActor('actor_w').getComponent('Brush');
    expect(again.openings).toHaveLength(1);
    expect(again.openings[0]).toMatchObject({
      id: 'op_door',
      type: 'door',
      offset: 50,
      width: 100,
      height: 220,
      bottom: 0,
    });
    expect(serializeLevel(restored)).toEqual(json);
  });
});

describe('wall opening solids', () => {
  it('partitions an X-aligned wall with one door into columns + lintel', () => {
    expect(getWallAxes(wallX).lengthAxis).toBe('x');
    const door = createDefaultOpening('door', { id: 'd1', offset: 0 });
    const solids = buildWallOpeningSolids(wallX, [door]);
    expect(solids.some((s) => s.role === 'column')).toBe(true);
    expect(solids.some((s) => s.role === 'lintel')).toBe(true);
    // Door bottom=0 → no sill
    expect(solids.some((s) => s.role === 'sill')).toBe(false);

    const midHole = { x: 0, y: -wallX.y * 0.5 + 110, z: 0 };
    expect(pointInOpening(wallX, [door], midHole)).toBe(true);
    for (const s of solids) {
      expect(aabbContains(s, midHole)).toBe(false);
    }
  });

  it('emits sill + lintel for a window', () => {
    const win = createDefaultOpening('window', { id: 'w1', offset: 0 });
    const solids = buildWallOpeningSolids(wallX, [win]);
    expect(solids.some((s) => s.role === 'sill')).toBe(true);
    expect(solids.some((s) => s.role === 'lintel')).toBe(true);
    const hole = { x: 0, y: -wallX.y * 0.5 + 160, z: 0 };
    expect(pointInOpening(wallX, [win], hole)).toBe(true);
    for (const s of solids) {
      expect(aabbContains(s, hole)).toBe(false);
    }
  });

  it('partitions a Z-aligned wall with two spaced openings', () => {
    expect(getWallAxes(wallZ).lengthAxis).toBe('z');
    const openings = [
      createDefaultOpening('door', { id: 'd1', offset: -150 }),
      createDefaultOpening('window', { id: 'w1', offset: 150 }),
    ];
    const { openings: valid } = validateOpenings(wallZ, openings);
    expect(valid).toHaveLength(2);
    const solids = buildWallOpeningSolids(wallZ, valid);
    expect(solids.length).toBeGreaterThanOrEqual(4);
    expect(getBrushRenderSolids({ size: wallZ, openings: valid }).hasOpenings).toBe(true);
    expect(getBrushRenderSolids({ size: wallZ, openings: valid }).solids.length).toBe(solids.length);
  });

  it('never returns zero render solids for a brush with openings', () => {
    const result = getBrushRenderSolids({
      size: { x: 50, y: 50, z: 25 },
      openings: [createDefaultOpening('door', { id: 'huge', width: 50, height: 50, bottom: 0 })],
    });
    expect(result.solids.length).toBeGreaterThan(0);
    for (const s of result.solids) {
      expect(s.size.x).toBeGreaterThan(0);
      expect(s.size.y).toBeGreaterThan(0);
      expect(s.size.z).toBeGreaterThan(0);
    }
  });
});

describe('wall openings history + physics', () => {
  it('undoes SetBrushOpeningsCommand', () => {
    const world = new World({ name: 'H', schemaVersion: 2 });
    const brush = new BrushComponent({ id: 'c', size: wallX, openings: [] });
    world.addActor(new Actor({
      id: 'a1',
      name: 'Wall',
      tags: ['wall'],
      components: [brush],
    }));
    const history = new HistoryStack();
    const after = [createDefaultOpening('door', { id: 'op1' })];
    history.execute(new SetBrushOpeningsCommand({
      world,
      actorId: 'a1',
      before: [],
      after,
    }));
    expect(world.getActor('a1').getComponent('Brush').openings).toHaveLength(1);
    history.undo();
    expect(world.getActor('a1').getComponent('Brush').openings).toHaveLength(0);
    history.redo();
    expect(world.getActor('a1').getComponent('Brush').openings[0].id).toBe('op1');
  });

  it('builds one Rapier collider per solid', async () => {
    const world = new World({ name: 'P', schemaVersion: 2 });
    const openings = [createDefaultOpening('door', { id: 'd1', offset: 0 })];
    const brush = new BrushComponent({ id: 'c', size: wallX, openings });
    world.addActor(new Actor({
      id: 'wall_phys',
      name: 'Wall',
      tags: ['wall'],
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [brush],
    }));
    const solids = getBrushRenderSolids(brush).solids;
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount('wall_phys')).toBe(solids.length);
    physics.dispose();
  });
});

function aabbContains(solid, point) {
  const hx = solid.size.x * 0.5;
  const hy = solid.size.y * 0.5;
  const hz = solid.size.z * 0.5;
  return (
    point.x >= solid.center.x - hx - 1e-6
    && point.x <= solid.center.x + hx + 1e-6
    && point.y >= solid.center.y - hy - 1e-6
    && point.y <= solid.center.y + hy + 1e-6
    && point.z >= solid.center.z - hz - 1e-6
    && point.z <= solid.center.z + hz + 1e-6
  );
}
