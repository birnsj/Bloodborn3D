import { afterEach, describe, expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PhysicsWorld Rapier disposal (M1)', () => {
  it('frees the Rapier world on dispose', async () => {
    const freeSpy = vi.spyOn(RAPIER.World.prototype, 'free');
    const physics = new PhysicsWorld();
    await physics.init();
    const world = physics.world;
    expect(world).not.toBeNull();

    physics.dispose();

    expect(freeSpy).toHaveBeenCalledTimes(1);
    expect(freeSpy.mock.contexts[0]).toBe(world);
    expect(physics.world).toBeNull();
    expect(physics.playerBody).toBeNull();
  });

  it('is safe to dispose repeatedly and before init', async () => {
    const freeSpy = vi.spyOn(RAPIER.World.prototype, 'free');
    const physics = new PhysicsWorld();
    expect(() => physics.dispose()).not.toThrow();

    await physics.init();
    physics.dispose();
    physics.dispose();
    physics.dispose();

    expect(freeSpy).toHaveBeenCalledTimes(1);
  });

  it('frees the previous world when init runs again instead of leaking it', async () => {
    const freeSpy = vi.spyOn(RAPIER.World.prototype, 'free');
    const physics = new PhysicsWorld();
    await physics.init();
    const first = physics.world;
    await physics.init();

    expect(freeSpy).toHaveBeenCalledTimes(1);
    expect(freeSpy.mock.contexts[0]).toBe(first);
    expect(physics.world).not.toBe(first);
    expect(physics.world).not.toBeNull();

    physics.dispose();
    expect(freeSpy).toHaveBeenCalledTimes(2);
  });

  it('stays usable after a dispose/init cycle (player body, stepping)', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    physics.spawnPlayer({ position: { x: 0, y: 500, z: 0 } });
    physics.dispose();

    await physics.init();
    physics.spawnPlayer({ position: { x: 0, y: 500, z: 0 } });
    const start = physics.getPlayerPositionMeters().y;
    for (let i = 0; i < 10; i += 1) physics.step(1 / 60);
    expect(physics.getPlayerPositionMeters().y).toBeLessThan(start);
    physics.dispose();
  });

  it('does not throw and still clears state when free() fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(RAPIER.World.prototype, 'free').mockImplementation(() => {
      throw new Error('already freed');
    });
    const physics = new PhysicsWorld();
    await physics.init();

    expect(() => physics.dispose()).not.toThrow();
    expect(physics.world).toBeNull();
    expect(warn).toHaveBeenCalled();
    // A second dispose must not retry the failing free.
    physics.dispose();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
