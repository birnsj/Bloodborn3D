import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { getStairSteps } from '../runtime/stairGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { createPrefabFromActors } from '../prefabs/prefabOps.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 2D.4B acceptance — curved stairs scene', () => {
  const raw = JSON.parse(
    readFileSync(join(root, 'public/levels/acceptance-curved-stairs.json'), 'utf8'),
  );

  it('contains 180° curved and 360° spiral stairs plus landing and spawn', () => {
    const world = deserializeLevel(raw);
    const curved = world.getActor('actor_curved_180').getComponent('Stair');
    const spiral = world.getActor('actor_spiral_360').getComponent('Stair');
    expect(curved.stairType).toBe('curved');
    expect(curved.sweepAngle).toBe(180);
    expect(spiral.stairType).toBe('spiral');
    expect(spiral.sweepAngle).toBe(360);
    expect(world.getActor('actor_landing')).toBeTruthy();
    expect(world.actors.some((a) => a.getComponent('PlayerSpawn'))).toBe(true);
  });

  it('builds matching convex step colliders', async () => {
    const world = deserializeLevel(raw);
    const curved = world.getActor('actor_curved_180').getComponent('Stair');
    const spiral = world.getActor('actor_spiral_360').getComponent('Stair');
    expect(getStairSteps(curved).every((s) => s.kind === 'wedge')).toBe(true);
    expect(getStairSteps(spiral)).toHaveLength(spiral.stepCount);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount('actor_curved_180')).toBe(curved.stepCount);
    expect(physics.getColliderCount('actor_spiral_360')).toBe(spiral.stepCount);
    physics.dispose();
  });

  it('round-trips and can be captured as a prefab source', () => {
    const world = deserializeLevel(raw);
    const again = deserializeLevel(serializeLevel(world));
    expect(again.getActor('actor_curved_180').getComponent('Stair').sweepAngle).toBe(180);

    const result = createPrefabFromActors(again, ['actor_curved_180'], {
      name: 'Sweeping Stairs Prefab',
    });
    expect(result.ok).toBe(true);
    expect(result.definition.actors.some((a) => a.components?.some((c) => c.type === 'Stair'))).toBe(true);
  });
});
