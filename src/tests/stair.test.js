import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  SetStairPropertiesCommand,
} from '../editor/history/commands.js';
import { createStairFromBounds } from '../editor/stairFactory.js';
import { StairComponent } from '../components/StairComponent.js';
import { getStairAabbSize, getStairStepSolids } from '../runtime/stairGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { WALL_MODULE_SIZE } from '../core/units.js';
import { PlayerController } from '../runtime/PlayerController.js';

describe('Stage 3 — procedural stairs', () => {
  it('creates a single stair actor with multiple step solids', () => {
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 120, z: 400 },
      gridSize: 25,
      totalRise: WALL_MODULE_SIZE,
    });
    const stair = actor.getComponent('Stair');
    expect(stair).toBeTruthy();
    expect(actor.tags).toContain('stair');
    expect(stair.stepCount).toBeGreaterThan(1);
    expect(stair.totalRise).toBeCloseTo(WALL_MODULE_SIZE, 5);
    const solids = getStairStepSolids(stair);
    expect(solids).toHaveLength(stair.stepCount);
    expect(getStairAabbSize(stair).y).toBeCloseTo(stair.totalRise, 5);
  });

  it('physics builds one collider per step', async () => {
    const world = new World({ name: 'stair-phys' });
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 300 },
      gridSize: 25,
      totalRise: 160,
    });
    world.addActor(actor);
    const stair = actor.getComponent('Stair');
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(actor.id)).toBe(stair.stepCount);
    physics.dispose();
  });

  it('serializes as one component and reloads', () => {
    const world = new World({ name: 'stair-save' });
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 250 },
      gridSize: 25,
    });
    world.addActor(actor);
    const loaded = deserializeLevel(serializeLevel(world));
    const stair = loaded.actors.find((a) => a.getComponent('Stair'))?.getComponent('Stair');
    expect(stair.stepCount).toBe(actor.getComponent('Stair').stepCount);
    expect(stair.treadDepth).toBeCloseTo(actor.getComponent('Stair').treadDepth, 5);
  });

  it('undo/redo step count edit keeps a single actor', () => {
    const world = new World({ name: 'stair-hist' });
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 300 },
      gridSize: 25,
    });
    world.addActor(actor);
    const history = new HistoryStack();
    history.execute(new AddActorsCommand({
      world,
      actorsJson: [actor.toJSON()],
      label: 'noop-already-added',
    }));
    // Actor already in world — command no-ops on duplicate id; clear and use property cmd
    const stair = actor.getComponent('Stair');
    const before = { stepCount: stair.stepCount };
    history.execute(new SetStairPropertiesCommand({
      world,
      actorId: actor.id,
      before,
      after: { stepCount: before.stepCount + 2 },
      label: 'Add steps',
    }));
    expect(stair.stepCount).toBe(before.stepCount + 2);
    expect(world.actors.filter((a) => a.getComponent('Stair'))).toHaveLength(1);
    history.undo();
    expect(stair.stepCount).toBe(before.stepCount);
  });

  it('player controller applies stair assist when blocked while grounded', () => {
    const physics = {
      playerBody: {
        linvel: () => ({ x: 0.05, y: 0, z: 0.02 }),
      },
      setPlayerVelocity: () => {},
      getPlayerPositionMeters: () => ({ x: 0, y: 1, z: 0 }),
    };
    const cam = { position: { set() {} }, rotation: { order: 'YXZ', set() {} } };
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const player = new PlayerController({
      camera: cam,
      physics,
      canvas,
      moveSpeed: 450,
    });
    player.enabled = true;
    player._keys.add('KeyW');
    let setArgs = null;
    physics.setPlayerVelocity = (x, y, z) => { setArgs = { x, y, z }; };
    player.update(1 / 60);
    expect(setArgs.y).toBeGreaterThanOrEqual(2.35);
  });

  it('StairComponent totalRise tracks stepCount * stepHeight', () => {
    const stair = new StairComponent({ stepCount: 10, stepHeight: 25, treadDepth: 30 });
    expect(stair.totalRise).toBe(250);
    expect(stair.length).toBe(300);
  });
});
