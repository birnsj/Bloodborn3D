import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetBrushGeometryCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import {
  CEILING_THICKNESS,
  FLOOR_THICKNESS,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('Stage 1 — ceiling brush', () => {
  it('creates a ceiling slab at room height with ceiling thickness', () => {
    const actor = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 400, y: WALL_MODULE_SIZE, z: 300 },
      gridSize: 25,
    });
    const brush = actor.getComponent('Brush');
    expect(actor.tags).toContain('ceiling');
    expect(actor.name).toBe('Ceiling');
    expect(brush.size.y).toBe(CEILING_THICKNESS);
    expect(brush.size.x).toBe(400);
    expect(brush.size.z).toBe(300);
    expect(brush.operation).toBe('add');
    expect(brush.collidable).toBe(true);
    // Underside at WALL_MODULE_SIZE
    expect(actor.transform.position.y).toBe(WALL_MODULE_SIZE + CEILING_THICKNESS / 2);
  });

  it('defaults elevation to wall module height when max.y omitted', () => {
    const actor = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 100 },
      gridSize: 25,
    });
    expect(actor.transform.position.y).toBe(WALL_MODULE_SIZE + CEILING_THICKNESS / 2);
  });

  it('reuses floor thickness scale (ceiling constant matches floor)', () => {
    expect(CEILING_THICKNESS).toBe(FLOOR_THICKNESS);
  });

  it('supports subtractive openings through a ceiling', () => {
    const world = new World({ name: 'shaft' });
    const ceiling = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: -200, y: 0, z: -200 },
      max: { x: 200, y: WALL_MODULE_SIZE, z: 200 },
      gridSize: 25,
    });
    ceiling.id = 'ceil';
    const cutter = new Actor({
      id: 'shaft',
      name: 'Shaft',
      tags: ['structure', 'brush', 'subtract'],
      transform: new Transform({
        position: {
          x: 0,
          y: WALL_MODULE_SIZE + CEILING_THICKNESS / 2,
          z: 0,
        },
      }),
      components: [
        new BrushComponent({
          id: 'c_shaft',
          size: { x: 100, y: 80, z: 100 },
          operation: 'subtract',
          collidable: false,
        }),
      ],
    });
    world.addActor(ceiling);
    world.addActor(cutter);
    const carved = getBrushRenderSolids(ceiling.getComponent('Brush'), {
      world,
      actor: ceiling,
    });
    expect(carved.solids.length).toBeGreaterThan(1);
  });

  it('undo/redo create and resize', () => {
    const world = new World({ name: 'hist' });
    const actor = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 200, y: WALL_MODULE_SIZE, z: 200 },
      gridSize: 25,
    });
    const history = new HistoryStack();
    history.execute(new AddActorsCommand({
      world,
      actorsJson: [actor.toJSON()],
      label: 'Create ceiling',
    }));
    expect(world.getActor(actor.id)).toBeTruthy();

    const brush = world.getActor(actor.id).getComponent('Brush');
    const before = {
      size: { ...brush.size },
      position: { ...world.getActor(actor.id).transform.position },
    };
    const after = {
      size: { ...brush.size, x: 300 },
      position: { ...before.position },
    };
    history.execute(new SetBrushGeometryCommand({
      world,
      changes: [{ actorId: actor.id, before, after }],
      label: 'Resize',
    }));
    expect(brush.size.x).toBe(300);
    history.undo();
    expect(brush.size.x).toBe(200);
    history.redo();
    expect(brush.size.x).toBe(300);

    history.execute(new RemoveActorsCommand({
      world,
      actorIds: [actor.id],
      label: 'Delete',
    }));
    expect(world.getActor(actor.id)).toBeFalsy();
    history.undo();
    expect(world.getActor(actor.id)?.tags).toContain('ceiling');
  });

  it('serializes and reloads with collision matching solids', async () => {
    const world = new World({ name: 'save' });
    const actor = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 250, y: WALL_MODULE_SIZE, z: 250 },
      gridSize: 25,
    });
    world.addActor(actor);
    const json = serializeLevel(world);
    const loaded = deserializeLevel(json);
    const ceil = loaded.actors.find((a) => a.tags?.includes('ceiling'));
    expect(ceil).toBeTruthy();
    expect(ceil.getComponent('Brush').size.y).toBe(CEILING_THICKNESS);

    const solids = getBrushRenderSolids(ceil.getComponent('Brush'), {
      world: loaded,
      actor: ceil,
    }).solids;
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(loaded);
    expect(physics.getColliderCount(ceil.id)).toBe(solids.length);
    physics.dispose();
  });

  it('move via transform command preserves ceiling tag and size', () => {
    const world = new World({ name: 'move' });
    const actor = createBrushFromBounds({
      kind: 'ceiling',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: WALL_MODULE_SIZE, z: 100 },
      gridSize: 25,
    });
    world.addActor(actor);
    const before = actor.transform.toJSON();
    const after = structuredClone(before);
    after.position.x += 50;
    const history = new HistoryStack();
    history.execute(new SetTransformsCommand({
      world,
      changes: [{ actorId: actor.id, before, after }],
    }));
    expect(actor.transform.position.x).toBe(before.position.x + 50);
    expect(actor.tags).toContain('ceiling');
    history.undo();
    expect(actor.transform.position.x).toBe(before.position.x);
  });
});
