import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { Transform } from '../core/Transform.js';
import { Actor } from '../core/Actor.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  SetStairPropertiesCommand,
} from '../editor/history/commands.js';
import { StairComponent } from '../components/StairComponent.js';
import { createCurvedStairActor, createStairFromBounds } from '../editor/stairFactory.js';
import {
  getCurvedStairSteps,
  getStairSteps,
  isCurvedStair,
  createStairGeometry,
  wedgeVerticesToMetersFlat,
} from '../runtime/stairGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { CellComponent } from '../components/CellComponent.js';
import { getWorldTransform } from '../core/hierarchy.js';

describe('Phase 2D.4B — curved and spiral stairs', () => {
  it('keeps straight stairs unchanged (backward compatible)', () => {
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 300 },
      gridSize: 25,
      totalRise: 160,
    });
    const stair = actor.getComponent('Stair');
    expect(stair.stairType).toBe('straight');
    expect(isCurvedStair(stair)).toBe(false);
    const steps = getStairSteps(stair);
    expect(steps.every((s) => s.kind === 'box')).toBe(true);
    expect(steps).toHaveLength(stair.stepCount);
  });

  it('generates wedge steps for 90/180/270/360 sweeps', () => {
    for (const sweep of [90, 180, 270, 360]) {
      const stair = new StairComponent({
        stairType: sweep === 360 ? 'spiral' : 'curved',
        sweepAngle: sweep,
        stepCount: 12,
        stepHeight: 20,
        innerRadius: 100,
        width: 120,
        clockwise: true,
      });
      const steps = getCurvedStairSteps(stair);
      expect(steps).toHaveLength(12);
      expect(steps.every((s) => s.kind === 'wedge' && s.vertices.length === 8)).toBe(true);
      const geom = createStairGeometry(stair);
      expect(geom.children).toHaveLength(12);
    }
  });

  it('supports clockwise and counterclockwise winding', () => {
    const cw = new StairComponent({
      stairType: 'curved',
      sweepAngle: 180,
      stepCount: 8,
      clockwise: true,
      startAngle: 0,
      innerRadius: 80,
      width: 100,
    });
    const ccw = new StairComponent({
      stairType: 'curved',
      sweepAngle: 180,
      stepCount: 8,
      clockwise: false,
      startAngle: 0,
      innerRadius: 80,
      width: 100,
    });
    const a0cw = getCurvedStairSteps(cw)[0].angles.a0;
    const a1cw = getCurvedStairSteps(cw)[0].angles.a1;
    const a0ccw = getCurvedStairSteps(ccw)[0].angles.a0;
    const a1ccw = getCurvedStairSteps(ccw)[0].angles.a1;
    expect(Math.sign(a1cw - a0cw)).not.toBe(Math.sign(a1ccw - a0ccw));
  });

  it('builds convex-hull colliders for curved steps', async () => {
    const world = new World({ name: 'curve-phys' });
    const actor = createCurvedStairActor({
      stairType: 'curved',
      sweepAngle: 180,
      stepCount: 10,
      totalRise: 200,
      position: { x: 0, y: 0, z: 0 },
    });
    world.addActor(actor);
    const points = wedgeVerticesToMetersFlat(getCurvedStairSteps(actor.getComponent('Stair'))[0].vertices);
    expect(points.length).toBe(24);
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(actor.id)).toBe(10);
    physics.dispose();
  });

  it('serializes curved properties and reloads', () => {
    const world = new World({ name: 'curve-save' });
    const actor = createCurvedStairActor({
      stairType: 'spiral',
      sweepAngle: 360,
      clockwise: false,
      startAngle: 45,
      innerRadius: 50,
      width: 90,
      stepCount: 16,
      totalRise: 320,
    });
    world.addActor(actor);
    const loaded = deserializeLevel(serializeLevel(world));
    const stair = loaded.actors.find((a) => a.getComponent('Stair')).getComponent('Stair');
    expect(stair.stairType).toBe('spiral');
    expect(stair.sweepAngle).toBe(360);
    expect(stair.clockwise).toBe(false);
    expect(stair.startAngle).toBe(45);
    expect(stair.innerRadius).toBe(50);
    expect(getStairSteps(stair).every((s) => s.kind === 'wedge')).toBe(true);
  });

  it('undo/redo type switch preserves history integrity', () => {
    const world = new World({ name: 'curve-hist' });
    const actor = createStairFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 250 },
      gridSize: 25,
    });
    world.addActor(actor);
    const stair = actor.getComponent('Stair');
    const history = new HistoryStack();
    history.execute(new SetStairPropertiesCommand({
      world,
      actorId: actor.id,
      before: { stairType: 'straight' },
      after: {
        stairType: 'curved',
        innerRadius: 150,
        sweepAngle: 180,
        clockwise: true,
        startAngle: 0,
      },
      label: 'Set curved stairs',
    }));
    expect(stair.stairType).toBe('curved');
    history.undo();
    expect(stair.stairType).toBe('straight');
    history.redo();
    expect(stair.stairType).toBe('curved');
  });

  it('works under a rotated cell parent', async () => {
    const world = new World({ name: 'curve-cell' });
    const cell = new Actor({
      id: 'cell',
      name: 'Tower',
      transform: new Transform({
        position: { x: 100, y: 0, z: 50 },
        rotation: { x: 0, y: 90, z: 0 },
      }),
      components: [new CellComponent({ id: 'c' })],
    });
    world.addActor(cell);
    const actor = createCurvedStairActor({
      stairType: 'spiral',
      position: { x: 0, y: 0, z: 0 },
      sweepAngle: 360,
      stepCount: 8,
      totalRise: 160,
    });
    actor.parentId = 'cell';
    world.addActor(actor);
    const wt = getWorldTransform(actor, world);
    expect(wt.position.x).not.toBe(actor.transform.position.x); // rotated parent offset
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(actor.id)).toBe(8);
    physics.dispose();
  });

  it('legacy JSON without stairType loads as straight', () => {
    const stair = StairComponent.fromJSON({
      id: 'c',
      type: 'Stair',
      width: 100,
      stepCount: 5,
      stepHeight: 20,
      treadDepth: 30,
      direction: 'z+',
    });
    expect(stair.stairType).toBe('straight');
    expect(getStairSteps(stair)[0].kind).toBe('box');
  });
});
