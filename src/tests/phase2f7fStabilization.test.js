import { describe, expect, it, vi } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import {
  PhysicsWorld,
  PHYSICS_FIXED_DT,
  ensureRapier,
} from '../runtime/PhysicsWorld.js';
import { PlayerController } from '../runtime/PlayerController.js';
import {
  peekLoadedMeshMeta,
  seedLoadedMeshMeta,
  clearMeshCache,
} from '../runtime/meshLoader.js';

function makeFloorWorld() {
  const world = new World({ name: 'Floor', schemaVersion: 2 });
  const floor = createBrushFromBounds({
    kind: 'box',
    min: { x: -500, y: -20, z: -500 },
    max: { x: 500, y: 0, z: 500 },
    gridSize: 25,
    name: 'Floor',
    operation: 'add',
  });
  floor.id = 'floor';
  world.addActor(floor);
  return world;
}

function makeWallWorld() {
  const world = makeFloorWorld();
  const wall = createBrushFromBounds({
    kind: 'wall',
    min: { x: -50, y: 0, z: 80 },
    max: { x: 50, y: 300, z: 100 },
    gridSize: 25,
    name: 'Wall',
    operation: 'add',
  });
  wall.id = 'wall';
  world.addActor(wall);
  return world;
}

describe('Phase 2F.7F final — jump edge + grounding', () => {
  it('queues jump only on Space press edge, not key-repeat or hold', () => {
    const physics = {
      playerBody: { linvel: () => ({ x: 0, y: 0, z: 0 }) },
      isPlayerGrounded: () => true,
      canStairAssist: () => false,
      setPlayerVelocity: vi.fn(),
      getPlayerPositionMeters: () => ({ x: 0, y: 1, z: 0 }),
    };
    const cam = { position: { set() {} }, rotation: { order: 'YXZ', set() {} } };
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const player = new PlayerController({ camera: cam, physics, canvas });
    player.enabled = true;

    player._onKeyDown({ code: 'Space', repeat: false });
    expect(player._jumpQueued).toBe(true);
    player.update(1 / 60);
    expect(player._jumpQueued).toBe(false);
    expect(physics.setPlayerVelocity.mock.calls[0][1]).toBeCloseTo(4.5, 5);

    // Held Space: key already in set → no new edge.
    physics.setPlayerVelocity.mockClear();
    player._onKeyDown({ code: 'Space', repeat: false });
    expect(player._jumpQueued).toBe(false);
    player.update(1 / 60);
    expect(physics.setPlayerVelocity.mock.calls[0][1]).toBeLessThan(1);

    // Browser key-repeat events also ignored.
    player._keys.delete('Space');
    player._onKeyDown({ code: 'Space', repeat: true });
    expect(player._jumpQueued).toBe(false);
  });

  it('does not jump or stair-assist while airborne', () => {
    const physics = {
      playerBody: { linvel: () => ({ x: 0.05, y: -0.1, z: 0.02 }) },
      isPlayerGrounded: () => false,
      canStairAssist: vi.fn(() => true),
      setPlayerVelocity: vi.fn(),
      getPlayerPositionMeters: () => ({ x: 0, y: 2, z: 0 }),
    };
    const cam = { position: { set() {} }, rotation: { order: 'YXZ', set() {} } };
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const player = new PlayerController({ camera: cam, physics, canvas, moveSpeed: 450 });
    player.enabled = true;
    player._keys.add('KeyW');
    player._jumpQueued = true;
    player.update(1 / 60);
    expect(physics.setPlayerVelocity.mock.calls[0][1]).toBeCloseTo(-0.1, 5);
    expect(physics.canStairAssist).not.toHaveBeenCalled();
  });
});

describe('Phase 2F.7F final — wall vs stair assist probes', () => {
  it('reports grounded on a floor and rejects stair assist into a tall wall', async () => {
    await ensureRapier();
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(makeWallWorld());
    // Spawn standing on the floor, facing the wall (~1 m ahead).
    physics.spawnPlayer({ position: { x: 0, y: 0, z: 0 }, eyeHeight: 160, radius: 30 });

    // Settle onto the floor.
    for (let i = 0; i < 30; i += 1) physics.step(PHYSICS_FIXED_DT);
    expect(physics.isPlayerGrounded()).toBe(true);

    // Wish toward the tall wall — down-probe should not see a short ledge.
    expect(physics.canStairAssist(0, 1)).toBe(false);
    physics.dispose();
  });

  it('accepts stair assist for a short riser ahead of the feet', async () => {
    await ensureRapier();
    const world = makeFloorWorld();
    const step = createBrushFromBounds({
      kind: 'box',
      // ~0.25–0.55 m ahead — inside default forwardDist probe.
      min: { x: -50, y: 0, z: 25 },
      max: { x: 50, y: 20, z: 55 },
      gridSize: 5,
      name: 'Step',
      operation: 'add',
    });
    step.id = 'step';
    world.addActor(step);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    physics.spawnPlayer({ position: { x: 0, y: 0, z: 0 }, eyeHeight: 160, radius: 30 });
    for (let i = 0; i < 30; i += 1) physics.step(PHYSICS_FIXED_DT);

    expect(physics.isPlayerGrounded()).toBe(true);
    expect(physics.canStairAssist(0, 1)).toBe(true);
    physics.dispose();
  });
});

describe('Phase 2F.7F final — off-center mesh colliders', () => {
  it('offsets StaticMesh box colliders by boundingBoxCenterMeters', async () => {
    await ensureRapier();
    const world = new World({ name: 'OffCenter', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'prop',
      transform: new Transform({
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }),
      components: [new StaticMeshComponent({
        id: 'sm',
        assetId: 'mesh_off',
        collidable: true,
        collisionType: 'box',
      })],
    }));

    const physics = new PhysicsWorld();
    physics.setAssetResolver({
      getMeshBoundsMeters: (id) => (id === 'mesh_off' ? { x: 2, y: 1, z: 1 } : null),
      getMeshBoundsCenterMeters: (id) => (id === 'mesh_off'
        ? { x: 0.5, y: -0.25, z: 0.1 }
        : null),
    });
    await physics.init();
    physics.buildFromWorld(world);

    const he = physics.getColliderHalfExtents('prop');
    expect(he.x).toBeCloseTo(1, 5);
    expect(he.y).toBeCloseTo(0.5, 5);
    expect(he.z).toBeCloseTo(0.5, 5);

    const local = physics.getColliderLocalTranslation('prop');
    expect(local.x).toBeCloseTo(0.5, 5);
    expect(local.y).toBeCloseTo(-0.25, 5);
    expect(local.z).toBeCloseTo(0.1, 5);
    physics.dispose();
  });

  it('prefers live glTF meta center when registry lacks center', async () => {
    clearMeshCache();
    await ensureRapier();
    const world = new World({ name: 'LiveMeta', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'prop',
      transform: new Transform({ position: { x: 0, y: 0, z: 0 } }),
      components: [new StaticMeshComponent({
        id: 'sm',
        assetId: 'mesh_live',
        collidable: true,
        collisionType: 'box',
      })],
    }));

    const url = 'asset://mesh_live.glb';
    seedLoadedMeshMeta(url, {
      boundingBoxMeters: { x: 2, y: 2, z: 2 },
      boundingBoxCenterMeters: { x: 0.75, y: 0.25, z: -0.5 },
    });
    expect(peekLoadedMeshMeta(url)?.boundingBoxCenterMeters.x).toBeCloseTo(0.75, 5);

    const physics = new PhysicsWorld();
    physics.setAssetResolver({
      getMeshUrl: (id) => (id === 'mesh_live' ? url : null),
      // Registry has size only — live meta supplies center + overrides size.
      getMeshBoundsMeters: (id) => (id === 'mesh_live' ? { x: 1, y: 1, z: 1 } : null),
    });
    await physics.init();
    physics.buildFromWorld(world);

    const he = physics.getColliderHalfExtents('prop');
    expect(he.x).toBeCloseTo(1, 5); // half of live 2 m
    const local = physics.getColliderLocalTranslation('prop');
    expect(local.x).toBeCloseTo(0.75, 5);
    expect(local.y).toBeCloseTo(0.25, 5);
    expect(local.z).toBeCloseTo(-0.5, 5);
    physics.dispose();
    clearMeshCache();
  });
});

describe('Phase 2F.7F final — FPS-stable displacement', () => {
  it('covers similar ground distance at 30 / 60 / 144 Hz over 1 s sim time', async () => {
    await ensureRapier();

    async function runAt(frameDt) {
      const physics = new PhysicsWorld();
      await physics.init();
      physics.buildFromWorld(makeFloorWorld());
      physics.spawnPlayer({ position: { x: 0, y: 0, z: 0 }, eyeHeight: 160, radius: 30 });
      for (let i = 0; i < 45; i += 1) physics.step(PHYSICS_FIXED_DT);

      const speed = 4.5; // m/s along +X
      let elapsed = 0;
      const target = 1.0;
      while (elapsed < target) {
        physics.setPlayerVelocity(speed, physics.playerBody.linvel().y, 0);
        physics.step(frameDt);
        elapsed += frameDt;
      }
      const pos = physics.getPlayerPositionMeters();
      physics.dispose();
      return pos;
    }

    const at30 = await runAt(1 / 30);
    const at60 = await runAt(1 / 60);
    const at144 = await runAt(1 / 144);

    // Fixed-step sim → nearly identical X travel; allow small contact noise.
    expect(Math.abs(at30.x - at60.x)).toBeLessThan(0.15);
    expect(Math.abs(at144.x - at60.x)).toBeLessThan(0.15);
    expect(at60.x).toBeGreaterThan(3.5);
  });
});
