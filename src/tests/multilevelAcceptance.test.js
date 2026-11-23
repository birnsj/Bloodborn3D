import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import { getStairSteps } from '../runtime/stairGeometry.js';
import { getRampSlopeCollider } from '../runtime/rampGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { getWorldTransform } from '../core/hierarchy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stage 4 — multilevel acceptance', () => {
  const raw = JSON.parse(
    readFileSync(join(root, 'public/levels/acceptance-multilevel.json'), 'utf8'),
  );

  it('acceptance scene contains required multilevel pieces', () => {
    const world = deserializeLevel(raw);
    const byTag = (tag) => world.actors.filter((a) => a.tags?.includes(tag));
    expect(byTag('floor').length).toBeGreaterThanOrEqual(2);
    expect(byTag('ceiling').length).toBeGreaterThanOrEqual(1);
    expect(byTag('stair').length).toBeGreaterThanOrEqual(1);
    expect(byTag('ramp').length).toBeGreaterThanOrEqual(1);
    expect(byTag('subtract').length).toBeGreaterThanOrEqual(1);
    expect(world.actors.some((a) => a.getComponent('PlayerSpawn'))).toBe(true);
    expect(world.actors.some((a) => a.getComponent('Cell'))).toBe(true);
  });

  it('shaft subtracts through upper floor; stairs/ramp keep accurate colliders', async () => {
    const world = deserializeLevel(raw);
    const upper = world.getActor('actor_upper_floor');
    const carved = getBrushRenderSolids(upper.getComponent('Brush'), { world, actor: upper });
    expect(carved.solids.length).toBeGreaterThan(1);

    const stairs = world.getActor('actor_stairs').getComponent('Stair');
    expect(getStairSteps(stairs)).toHaveLength(stairs.stepCount);

    const ramp = world.getActor('actor_ramp').getComponent('Ramp');
    const slope = getRampSlopeCollider(ramp);
    expect(slope.halfSize.y).toBe(ramp.thickness * 0.5);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount('actor_stairs')).toBe(stairs.stepCount);
    expect(physics.getColliderCount('actor_ramp')).toBe(1);
    expect(physics.getColliderCount('actor_shaft')).toBe(0);
    expect(physics.getColliderCount('actor_upper_floor')).toBe(carved.solids.length);
    physics.dispose();
  });

  it('cell parenting preserves world transforms for ground structure', () => {
    const world = deserializeLevel(raw);
    const floor = world.getActor('actor_ground_floor');
    expect(floor.parentId).toBe('cell_ground');
    const wt = getWorldTransform(floor, world);
    expect(wt.position.y).toBe(10);
  });

  it('save/reload preserves multilevel acceptance scene', () => {
    const world = deserializeLevel(raw);
    const again = deserializeLevel(serializeLevel(world));
    expect(again.actors).toHaveLength(world.actors.length);
    expect(again.getActor('actor_stairs').getComponent('Stair').stepCount).toBe(15);
    expect(again.getActor('actor_ramp').getComponent('Ramp').rise).toBe(150);
    expect(again.getActor('actor_shaft').getComponent('Brush').operation).toBe('subtract');
  });
});
