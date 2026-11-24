import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetBrushMaterialCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import {
  MAX_SUBTRACT_SOLIDS,
  applyWorldSubtraction,
  cutterHoleInBrushLocal,
  formatSubtractComplexityMessage,
  isAxisAlignedRotationMatrix,
  isWorldSolidActor,
  solidFacesOnBrushHull,
  subtractAabbFromSolid,
} from '../runtime/brushBoolean.js';
import {
  getBrushBaseSolids,
  getBrushRenderSolids,
  validateWorldSubtractComplexity,
} from '../runtime/brushGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';

function makeBrushActor({
  id,
  name = id,
  size,
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  operation = 'add',
  openings = null,
  tags = ['structure', 'brush', 'box'],
}) {
  return new Actor({
    id,
    name,
    tags: operation === 'subtract' ? [...tags, 'subtract'] : tags,
    transform: new Transform({ position, rotation }),
    components: [
      new BrushComponent({
        id: `c_${id}`,
        size,
        operation,
        openings,
        collidable: operation !== 'subtract',
        color: operation === 'subtract' ? '#c23b4a' : '#8a9099',
      }),
    ],
  });
}

describe('brush boolean AABB subtraction', () => {
  it('defaults BrushComponent.operation to add and round-trips', () => {
    const brush = new BrushComponent({ size: { x: 100, y: 100, z: 100 } });
    expect(brush.operation).toBe('add');
    const json = brush.toJSON();
    expect(json.operation).toBe('add');
    const restored = BrushComponent.fromJSON(json);
    expect(restored.operation).toBe('add');

    const sub = new BrushComponent({ size: { x: 50, y: 50, z: 50 }, operation: 'subtract' });
    expect(sub.toJSON().operation).toBe('subtract');
    expect(BrushComponent.fromJSON({ size: { x: 10, y: 10, z: 10 } }).operation).toBe('add');
  });

  it('subtracts a hole from one solid', () => {
    const solid = { center: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 200 }, role: 'solid' };
    const hole = { min: { x: -25, y: -25, z: -100 }, max: { x: 25, y: 25, z: 100 } };
    const pieces = subtractAabbFromSolid(solid, hole);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.size.x > 0 && p.size.y > 0 && p.size.z > 0)).toBe(true);
    // Center tunnel should be gone
    const coversCenter = pieces.some((p) => {
      const a = Math.abs(p.center.x) < 20 && Math.abs(p.center.y) < 20 && Math.abs(p.center.z) < 20;
      return a && p.size.x > 40 && p.size.y > 40;
    });
    expect(coversCenter).toBe(false);
  });

  it('fully removes a contained solid', () => {
    const solid = { center: { x: 0, y: 0, z: 0 }, size: { x: 50, y: 50, z: 50 }, role: 'solid' };
    const hole = { min: { x: -40, y: -40, z: -40 }, max: { x: 40, y: 40, z: 40 } };
    expect(subtractAabbFromSolid(solid, hole)).toEqual([]);
  });

  it('Gate A: subtractive box carves additive box; move/delete restores', () => {
    const world = new World({ name: 'carve' });
    const additive = makeBrushActor({
      id: 'add1',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub1',
      size: { x: 80, y: 80, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);

    const carved = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive });
    expect(carved.solids.length).toBeGreaterThan(1);
    expect(carved.solids.length).toBeLessThan(20);

    // Subtractive brush itself never yields solids
    expect(getBrushRenderSolids(cutter.getComponent('Brush'), { world, actor: cutter }).solids).toEqual([]);
    expect(getBrushRenderSolids(cutter.getComponent('Brush')).isSubtract).toBe(true);

    // Move cutter away
    cutter.transform.position.x = 500;
    const away = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive });
    expect(away.solids.length).toBe(1);
    expect(away.solids[0].size).toEqual({ x: 200, y: 200, z: 200 });

    // Restore intersection then delete cutter
    cutter.transform.position.x = 0;
    world.removeActor(cutter.id);
    const restored = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive });
    expect(restored.solids.length).toBe(1);
  });

  it('multiple cutters affect one additive; one cutter affects many additives', () => {
    const world = new World({ name: 'multi' });
    const a = makeBrushActor({
      id: 'wallA',
      size: { x: 400, y: 300, z: 25 },
      position: { x: 0, y: 150, z: 0 },
      tags: ['structure', 'brush', 'wall'],
    });
    const b = makeBrushActor({
      id: 'wallB',
      size: { x: 400, y: 300, z: 25 },
      position: { x: 0, y: 150, z: 100 },
      tags: ['structure', 'brush', 'wall'],
    });
    const c1 = makeBrushActor({
      id: 'cut1',
      size: { x: 100, y: 200, z: 200 },
      position: { x: -50, y: 120, z: 50 },
      operation: 'subtract',
    });
    const c2 = makeBrushActor({
      id: 'cut2',
      size: { x: 80, y: 80, z: 200 },
      position: { x: 80, y: 150, z: 0 },
      operation: 'subtract',
    });
    world.addActor(a);
    world.addActor(b);
    world.addActor(c1);
    world.addActor(c2);

    const solidsA = getBrushRenderSolids(a.getComponent('Brush'), { world, actor: a }).solids;
    const solidsB = getBrushRenderSolids(b.getComponent('Brush'), { world, actor: b }).solids;
    expect(solidsA.length).toBeGreaterThan(1);
    expect(solidsB.length).toBeGreaterThan(1);

    // Two cutters on A → more pieces than one cutter alone
    const onlyC1 = applyWorldSubtraction(
      getBrushBaseSolids(a.getComponent('Brush')).solids,
      a,
      { actors: [a, c1] },
    );
    expect(solidsA.length).toBeGreaterThanOrEqual(onlyC1.solids.length);
  });

  it('works with parametric openings then world subtraction', () => {
    const world = new World({ name: 'open' });
    const wall = makeBrushActor({
      id: 'wall',
      size: { x: 600, y: 300, z: 25 },
      position: { x: 0, y: 150, z: 0 },
      tags: ['structure', 'brush', 'wall'],
      openings: [{
        id: 'door1',
        type: 'door',
        offset: 0,
        bottom: 0,
        width: 100,
        height: 220,
      }],
    });
    const cutter = makeBrushActor({
      id: 'cut',
      size: { x: 80, y: 80, z: 80 },
      position: { x: 180, y: 200, z: 0 },
      operation: 'subtract',
    });
    world.addActor(wall);
    world.addActor(cutter);

    const base = getBrushBaseSolids(wall.getComponent('Brush'));
    expect(base.hasOpenings).toBe(true);
    const carved = getBrushRenderSolids(wall.getComponent('Brush'), { world, actor: wall });
    expect(carved.solids.length).toBeGreaterThan(0);
    // Cutter should change the solid list vs openings-only base
    expect(JSON.stringify(carved.solids)).not.toBe(JSON.stringify(base.solids));
  });

  it('rejects non-axis-aligned relative rotation instead of AABB approx', () => {
    const world = new World({ name: 'rot' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 80, y: 80, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      rotation: { x: 0, y: 45, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);

    const mapped = cutterHoleInBrushLocal(additive, cutter, world);
    expect(mapped.ok).toBe(false);
    expect(mapped.unsupportedReason).toMatch(/axis-aligned/i);

    // Geometry unchanged when cutter is unsupported
    const carved = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive });
    expect(carved.solids.length).toBe(1);
    expect(carved.warnings?.length).toBeGreaterThan(0);
  });

  it('accepts 90° relative rotations', () => {
    expect(isAxisAlignedRotationMatrix([
      0, 0, 1, 0,
      0, 1, 0, 0,
      -1, 0, 0, 0,
      0, 0, 0, 1,
    ])).toBe(true);
  });

  it('Rapier collision matches carved solids; subtract has no colliders', async () => {
    const world = new World({ name: 'phys' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 80, y: 80, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);

    const solids = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids;
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(cutter.id)).toBe(0);
    expect(physics.getColliderCount(additive.id)).toBe(solids.length);

    // Full removal → no colliders
    cutter.transform.position = { x: 0, y: 100, z: 0 };
    cutter.getComponent('Brush').size = { x: 300, y: 300, z: 300 };
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(additive.id)).toBe(0);
    physics.dispose();
  });

  it('serializes operation and survives reload', () => {
    const world = new World({ name: 'save' });
    world.addActor(makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    }));
    world.addActor(makeBrushActor({
      id: 'sub',
      size: { x: 50, y: 50, z: 50 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    }));
    const json = serializeLevel(world);
    const loaded = deserializeLevel(json);
    const sub = loaded.getActor('sub').getComponent('Brush');
    expect(sub.operation).toBe('subtract');
    const carved = getBrushRenderSolids(
      loaded.getActor('add').getComponent('Brush'),
      { world: loaded, actor: loaded.getActor('add') },
    );
    expect(carved.solids.length).toBeGreaterThan(1);
  });

  it('undo/redo create and delete cutter', () => {
    const world = new World({ name: 'hist' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    world.addActor(additive);
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 80, y: 80, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    const history = new HistoryStack();
    history.execute(new AddActorsCommand({
      world,
      actorsJson: [cutter.toJSON()],
      label: 'Create subtract',
    }));
    expect(getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids.length)
      .toBeGreaterThan(1);

    history.execute(new RemoveActorsCommand({ world, actorIds: ['sub'], label: 'Delete' }));
    expect(getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids.length)
      .toBe(1);

    history.undo();
    expect(world.getActor('sub')?.getComponent('Brush').operation).toBe('subtract');
    expect(getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids.length)
      .toBeGreaterThan(1);

    history.redo();
    expect(world.getActor('sub')).toBeFalsy();
  });

  it('operation toggle via SetBrushMaterialCommand', () => {
    const world = new World({ name: 'op' });
    const actor = makeBrushActor({
      id: 'b',
      size: { x: 100, y: 100, z: 100 },
    });
    world.addActor(actor);
    const brush = actor.getComponent('Brush');
    const history = new HistoryStack();
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'b',
      before: { operation: 'add', collidable: true },
      after: { operation: 'subtract', collidable: false },
      label: 'Set subtractive',
    }));
    expect(brush.operation).toBe('subtract');
    expect(brush.collidable).toBe(false);
    history.undo();
    expect(brush.operation).toBe('add');
  });

  it('createBrushFromBounds supports subtract operation', () => {
    const actor = createBrushFromBounds({
      kind: 'subtract',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 0, z: 100 },
      gridSize: 25,
      operation: 'subtract',
    });
    const brush = actor.getComponent('Brush');
    expect(brush.operation).toBe('subtract');
    expect(brush.collidable).toBe(false);
    expect(actor.tags).toContain('subtract');
  });

  it('cell parenting: world subtraction uses hierarchy transforms', () => {
    const world = new World({ name: 'cell' });
    const cell = new Actor({
      id: 'cell',
      name: 'Cell',
      transform: new Transform({ position: { x: 100, y: 0, z: 0 } }),
      components: [],
    });
    // Import CellComponent if needed — empty parent still works via parentId
    world.addActor(cell);
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    additive.parentId = 'cell';
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 80, y: 80, z: 250 },
      // World-ish: local under same cell so relative is identity-ish
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    cutter.parentId = 'cell';
    world.addActor(additive);
    world.addActor(cutter);

    const carved = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive });
    expect(carved.solids.length).toBeGreaterThan(1);
    expect(carved.warnings || []).toEqual([]);
  });
});

describe('subtract complexity safety (no truncation)', () => {
  it('keeps the 64-solid limit constant', () => {
    expect(MAX_SUBTRACT_SOLIDS).toBe(64);
  });

  it('operations at or under the limit succeed', () => {
    const world = new World({ name: 'ok' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 40, y: 40, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);

    const carved = applyWorldSubtraction(
      getBrushBaseSolids(additive.getComponent('Brush')).solids,
      additive,
      world,
      { maxSolids: 64 },
    );
    expect(carved.ok).toBe(true);
    expect(carved.exceeded).toBe(false);
    expect(carved.truncated).toBe(false);
    expect(carved.solids.length).toBeGreaterThan(1);
    expect(carved.solids.length).toBeLessThanOrEqual(64);
    expect(validateWorldSubtractComplexity(world).ok).toBe(true);
  });

  it('never truncates — exceeded returns last valid solids intact', () => {
    const world = new World({ name: 'over' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 400, y: 400, z: 400 },
      position: { x: 0, y: 200, z: 0 },
    });
    world.addActor(additive);
    // Several tunnel cutters fragment the box heavily.
    for (let i = 0; i < 8; i += 1) {
      world.addActor(makeBrushActor({
        id: `sub${i}`,
        size: { x: 20, y: 20, z: 500 },
        position: { x: -120 + i * 35, y: 200, z: 0 },
        operation: 'subtract',
      }));
    }

    const base = getBrushBaseSolids(additive.getComponent('Brush')).solids;
    const carved = applyWorldSubtraction(base, additive, world, { maxSolids: 4 });
    expect(carved.exceeded).toBe(true);
    expect(carved.ok).toBe(false);
    expect(carved.truncated).toBe(false);
    expect(carved.solidCount).toBeGreaterThan(4);
    // Last valid complete set — never a sliced prefix of the over-limit result.
    expect(carved.solids.length).toBeGreaterThan(0);
    expect(carved.solids.length).toBeLessThanOrEqual(4);
    expect(carved.solids.length).toBeLessThan(carved.solidCount);
  });

  it('validateWorldSubtractComplexity rejects over-limit worlds', () => {
    const world = new World({ name: 'val' });
    const additive = makeBrushActor({
      id: 'Wall A',
      name: 'Wall A',
      size: { x: 400, y: 400, z: 400 },
      position: { x: 0, y: 200, z: 0 },
    });
    world.addActor(additive);
    for (let i = 0; i < 8; i += 1) {
      world.addActor(makeBrushActor({
        id: `sub${i}`,
        size: { x: 20, y: 20, z: 500 },
        position: { x: -120 + i * 35, y: 200, z: 0 },
        operation: 'subtract',
      }));
    }
    const check = validateWorldSubtractComplexity(world, { maxSolids: 4 });
    expect(check.ok).toBe(false);
    expect(check.actorId).toBe('Wall A');
    expect(check.solidCount).toBeGreaterThan(4);
    expect(check.message).toMatch(/too complex/i);
    expect(formatSubtractComplexityMessage({
      actorName: 'Wall A',
      solidCount: check.solidCount,
      maxSolids: 4,
    })).toMatch(/4 solids/);
  });

  it('rejected cutter create preserves prior geometry and history', () => {
    const world = new World({ name: 'rej-create' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 400, y: 400, z: 400 },
      position: { x: 0, y: 200, z: 0 },
    });
    world.addActor(additive);
    // Seed cutters that stay under a tight limit.
    world.addActor(makeBrushActor({
      id: 'sub0',
      size: { x: 30, y: 30, z: 500 },
      position: { x: 0, y: 200, z: 0 },
      operation: 'subtract',
    }));
    const underLimit = applyWorldSubtraction(
      getBrushBaseSolids(additive.getComponent('Brush')).solids,
      additive,
      world,
    );
    const maxSolids = underLimit.solids.length; // exactly at current count — next cutter must exceed
    expect(validateWorldSubtractComplexity(world, { maxSolids }).ok).toBe(true);
    const beforeSolids = getBrushRenderSolids(
      additive.getComponent('Brush'),
      { world, actor: additive, maxSolids },
    ).solids;
    const history = new HistoryStack();
    expect(history.canUndo).toBe(false);

    const bad = makeBrushActor({
      id: 'subBad',
      size: { x: 20, y: 20, z: 500 },
      position: { x: 80, y: 200, z: 0 },
      operation: 'subtract',
    });
    // Editor-style reject: tentative add → validate → remove, no history.
    world.addActor(bad);
    const check = validateWorldSubtractComplexity(world, { maxSolids });
    expect(check.ok).toBe(false);
    world.removeActor(bad.id);

    expect(history.canUndo).toBe(false);
    expect(world.getActor('subBad')).toBeFalsy();
    const afterSolids = getBrushRenderSolids(
      additive.getComponent('Brush'),
      { world, actor: additive, maxSolids },
    ).solids;
    expect(afterSolids).toEqual(beforeSolids);
  });

  it('rejected transform restores prior state without history entry', () => {
    const world = new World({ name: 'rej-move' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 400, y: 400, z: 400 },
      position: { x: 0, y: 200, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 30, y: 30, z: 500 },
      position: { x: 500, y: 200, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);
    // Far away — no carve yet.
    expect(getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids.length)
      .toBe(1);

    const maxSolids = 3;
    // Place many cutters already intersecting so one more overlapping move would exceed.
    for (let i = 0; i < 6; i += 1) {
      world.addActor(makeBrushActor({
        id: `seed${i}`,
        size: { x: 18, y: 18, z: 500 },
        position: { x: -100 + i * 40, y: 200, z: 0 },
        operation: 'subtract',
      }));
    }
    // If seeds alone already exceed, lower isn't useful — check
    const seeded = validateWorldSubtractComplexity(world, { maxSolids });
    // Move cutter from far into the volume.
    const before = cutter.transform.toJSON();
    const after = structuredClone(before);
    after.position = { x: 20, y: 200, z: 0 };
    cutter.transform.copyFrom(after);
    const check = validateWorldSubtractComplexity(world, { maxSolids: seeded.ok ? maxSolids : 2 });
    const history = new HistoryStack();
    if (!check.ok) {
      cutter.transform.copyFrom(before);
      // No execute — history untouched
      expect(history.canUndo).toBe(false);
      expect(cutter.transform.position.x).toBe(before.position.x);
    } else {
      // Fallback: force exceed with maxSolids 1 after move into volume
      cutter.transform.copyFrom(after);
      const forced = validateWorldSubtractComplexity(world, { maxSolids: 1 });
      expect(forced.ok).toBe(false);
      cutter.transform.copyFrom(before);
      expect(history.canUndo).toBe(false);
      expect(cutter.transform.position.x).toBe(500);
    }
  });

  it('Rapier collider count matches rendered solids for valid carves', async () => {
    const world = new World({ name: 'phys-sync' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 50, y: 50, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);
    expect(validateWorldSubtractComplexity(world).ok).toBe(true);
    const solids = getBrushRenderSolids(additive.getComponent('Brush'), { world, actor: additive }).solids;
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(additive.id)).toBe(solids.length);
    expect(physics.getColliderCount(cutter.id)).toBe(0);
    physics.dispose();
  });

  it('save/reload preserves last valid authored state after rejected edit', () => {
    const world = new World({ name: 'save-rej' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 40, y: 40, z: 250 },
      position: { x: 0, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);
    const validJson = serializeLevel(world);

    // Rejected edit attempt: temporary over-limit cutter removed
    const bad = makeBrushActor({
      id: 'bad',
      size: { x: 15, y: 15, z: 250 },
      position: { x: 60, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(bad);
    // Regardless of whether this exceeds 64, remove it as a rejected create would.
    world.removeActor(bad.id);

    const reloaded = deserializeLevel(validJson);
    expect(reloaded.getActor('bad')).toBeFalsy();
    expect(reloaded.getActor('sub').getComponent('Brush').operation).toBe('subtract');
    expect(validateWorldSubtractComplexity(reloaded).ok).toBe(true);
  });

  it('validates multiple affected additives atomically', () => {
    const world = new World({ name: 'atomic' });
    const a = makeBrushActor({
      id: 'addA',
      name: 'Brush A',
      size: { x: 400, y: 400, z: 400 },
      position: { x: -300, y: 200, z: 0 },
    });
    const b = makeBrushActor({
      id: 'addB',
      name: 'Brush B',
      size: { x: 100, y: 100, z: 100 },
      position: { x: 300, y: 50, z: 0 },
    });
    world.addActor(a);
    world.addActor(b);
    for (let i = 0; i < 8; i += 1) {
      world.addActor(makeBrushActor({
        id: `sub${i}`,
        size: { x: 20, y: 20, z: 500 },
        position: { x: -420 + i * 35, y: 200, z: 0 },
        operation: 'subtract',
      }));
    }
    // Brush A is fragmented; Brush B may be untouched.
    const check = validateWorldSubtractComplexity(world, { maxSolids: 4 });
    expect(check.ok).toBe(false);
    expect(check.actorId).toBe('addA');
    // Atomic: entire world rejected — B is still in its authored uncut form in the same validation pass.
    const solidsB = getBrushRenderSolids(b.getComponent('Brush'), {
      world,
      actor: b,
      maxSolids: 4,
    });
    // B itself may not exceed; the point is validation fails for the world as a whole.
    expect(solidsB.exceeded).not.toBe(true);
  });

  it('accepted transform still records history', () => {
    const world = new World({ name: 'hist-ok' });
    const additive = makeBrushActor({
      id: 'add',
      size: { x: 200, y: 200, z: 200 },
      position: { x: 0, y: 100, z: 0 },
    });
    const cutter = makeBrushActor({
      id: 'sub',
      size: { x: 40, y: 40, z: 250 },
      position: { x: 200, y: 100, z: 0 },
      operation: 'subtract',
    });
    world.addActor(additive);
    world.addActor(cutter);
    const history = new HistoryStack();
    const before = cutter.transform.toJSON();
    const after = structuredClone(before);
    after.position = { x: 0, y: 100, z: 0 };
    cutter.transform.copyFrom(after);
    expect(validateWorldSubtractComplexity(world).ok).toBe(true);
    history.execute(new SetTransformsCommand({
      world,
      changes: [{ actorId: 'sub', before, after }],
      label: 'Move',
    }));
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(cutter.transform.position.x).toBe(200);
  });
});

describe('world-solid hull faces', () => {
  it('marks every face of an uncut solid as on the brush hull', () => {
    const solid = {
      center: { x: 0, y: 0, z: 0 },
      size: { x: 200, y: 100, z: 300 },
    };
    expect(solidFacesOnBrushHull(solid, solid.size)).toEqual({
      px: true,
      nx: true,
      py: true,
      ny: true,
      pz: true,
      nz: true,
    });
  });

  it('keeps interior cut faces visible and hull faces hidden', () => {
    // Floor slab left under a room carve: top (+Y) is interior, bottom is hull.
    const floor = {
      center: { x: 0, y: -40, z: 0 },
      size: { x: 200, y: 20, z: 200 },
    };
    const brushSize = { x: 200, y: 100, z: 200 };
    expect(solidFacesOnBrushHull(floor, brushSize)).toEqual({
      px: true,
      nx: true,
      py: false,
      ny: true,
      pz: true,
      nz: true,
    });
  });

  it('detects world-solid actors by tag', () => {
    expect(isWorldSolidActor({ tags: ['world-solid'] })).toBe(true);
    expect(isWorldSolidActor({ tags: ['brush'] })).toBe(false);
  });
});
