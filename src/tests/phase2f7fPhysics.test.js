import { describe, expect, it, vi } from 'vitest';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import {
  PhysicsWorld,
  PHYSICS_FIXED_DT,
  PHYSICS_MAX_SUBSTEPS,
  halfExtentsFromMeshBounds,
  ensureRapier,
} from '../runtime/PhysicsWorld.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import { createDefaultOpening } from '../runtime/wallOpenings.js';

describe('Phase 2F.7F — fixed timestep', () => {
  it('exposes 60 Hz fixed dt and a catch-up cap', () => {
    expect(PHYSICS_FIXED_DT).toBeCloseTo(1 / 60, 8);
    expect(PHYSICS_MAX_SUBSTEPS).toBe(5);
  });

  it('steps a fixed number of times from frame dt and caps catch-up', async () => {
    await ensureRapier();
    const physics = new PhysicsWorld();
    await physics.init();
    const stepSpy = vi.spyOn(physics.world, 'step');

    expect(physics.step(PHYSICS_FIXED_DT)).toBe(1);
    expect(stepSpy).toHaveBeenCalledTimes(1);

    stepSpy.mockClear();
    // ~6.5 frames of backlog — should clamp to maxSubsteps.
    expect(physics.step(PHYSICS_FIXED_DT * 6.5)).toBe(PHYSICS_MAX_SUBSTEPS);
    expect(stepSpy).toHaveBeenCalledTimes(PHYSICS_MAX_SUBSTEPS);

    stepSpy.mockClear();
    physics.resetAccumulator();
    expect(physics.step(PHYSICS_FIXED_DT * 0.25)).toBe(0);
    expect(stepSpy).not.toHaveBeenCalled();
    expect(physics.step(PHYSICS_FIXED_DT * 0.8)).toBe(1);

    physics.dispose();
  });
});

describe('Phase 2F.7F — StaticMesh asset-bounds collision', () => {
  it('derives half-extents from asset AABB size', () => {
    expect(halfExtentsFromMeshBounds({ x: 2, y: 4, z: 6 })).toEqual({
      x: 1, y: 2, z: 3,
    });
    expect(halfExtentsFromMeshBounds(null)).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('builds a box collider from resolver bounds (not a hardcoded 1 m cube)', async () => {
    await ensureRapier();
    const world = new World({ name: 'MeshCol', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'prop',
      transform: new Transform({
        position: { x: 0, y: 100, z: 0 },
        scale: { x: 2, y: 1, z: 1 },
      }),
      components: [new StaticMeshComponent({
        id: 'sm',
        assetId: 'mesh_tall',
        collidable: true,
        collisionType: 'box',
      })],
    }));
    world.addActor(new Actor({
      id: 'ghost',
      transform: new Transform({ position: { x: 200, y: 0, z: 0 } }),
      components: [new StaticMeshComponent({
        id: 'sm2',
        assetId: 'mesh_tall',
        collidable: false,
        collisionType: 'none',
      })],
    }));

    const physics = new PhysicsWorld();
    physics.setAssetResolver({
      getMeshBoundsMeters: (id) => (id === 'mesh_tall'
        ? { x: 1, y: 3, z: 1 }
        : null),
    });
    await physics.init();
    physics.buildFromWorld(world);

    expect(physics._bodies.has('prop')).toBe(true);
    expect(physics._bodies.has('ghost')).toBe(false);
    const he = physics.getColliderHalfExtents('prop');
    // half of 1×3×1 m, then actor scale ×2 on X
    expect(he.x).toBeCloseTo(1.0, 5); // 0.5 * scale 2
    expect(he.y).toBeCloseTo(1.5, 5);
    expect(he.z).toBeCloseTo(0.5, 5);

    physics.dispose();
  });
});

describe('Phase 2F.7F — brush collision / render solid agreement', () => {
  it('matches collider count to getBrushRenderSolids for walls with openings', async () => {
    await ensureRapier();
    const world = new World({ name: 'Openings', schemaVersion: 2 });
    const wall = createBrushFromBounds({
      kind: 'wall',
      min: { x: -200, y: 0, z: -10 },
      max: { x: 200, y: 300, z: 10 },
      gridSize: 25,
      name: 'Wall',
      operation: 'add',
    });
    wall.id = 'wall';
    const brush = wall.getComponent('Brush');
    brush.openings = [
      createDefaultOpening('door', { width: 100, height: 200 }),
    ];
    world.addActor(wall);

    const { solids } = getBrushRenderSolids(brush, { world, actor: wall });
    expect(solids.length).toBeGreaterThan(1);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount('wall')).toBe(solids.length);
    physics.dispose();
  });

  it('scales cuboid colliders with parented actor world scale', async () => {
    await ensureRapier();
    const world = new World({ name: 'Scaled', schemaVersion: 2 });
    const parent = new Actor({
      id: 'parent',
      name: 'Parent',
      transform: new Transform({
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
      }),
      components: [],
    });
    const box = createBrushFromBounds({
      kind: 'box',
      min: { x: -50, y: 0, z: -50 },
      max: { x: 50, y: 100, z: 50 },
      gridSize: 25,
      name: 'Box',
      operation: 'add',
    });
    box.id = 'box';
    box.parentId = 'parent';
    world.addActor(parent);
    world.addActor(box);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    const he = physics.getColliderHalfExtents('box');
    // Local 100×100×100 eu → 0.5 m half; × parent scale 2 → 1 m
    expect(he.x).toBeCloseTo(1, 5);
    expect(he.y).toBeCloseTo(1, 5);
    expect(he.z).toBeCloseTo(1, 5);
    physics.dispose();
  });

  it('does not emit colliders for subtractive brushes', async () => {
    await ensureRapier();
    const world = new World({ name: 'Sub', schemaVersion: 2, mapMode: 'subtractive' });
    const solid = createBrushFromBounds({
      kind: 'box',
      min: { x: -300, y: -100, z: -300 },
      max: { x: 300, y: 400, z: 300 },
      gridSize: 25,
      name: 'World Solid',
      operation: 'add',
    });
    solid.id = 'solid';
    solid.tags = ['world-solid'];
    const room = createBrushFromBounds({
      kind: 'box',
      min: { x: -200, y: 0, z: -200 },
      max: { x: 200, y: 300, z: 200 },
      gridSize: 25,
      name: 'Room',
      operation: 'subtract',
    });
    room.id = 'room';
    world.addActor(solid);
    world.addActor(room);

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount('room')).toBe(0);
    expect(physics.getColliderCount('solid')).toBeGreaterThan(0);
    physics.dispose();
  });
});
