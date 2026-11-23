import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  SetCurvedWallPropertiesCommand,
} from '../editor/history/commands.js';
import { createCurvedWallFromBounds } from '../editor/curvedWallFactory.js';
import { CurvedWallComponent } from '../components/CurvedWallComponent.js';
import {
  createCurvedWallGeometry,
  getCurvedWallAabbSize,
  getCurvedWallColliderSolids,
  getCurvedWallLocalEndpoints,
  isClosedCurvedWall,
} from '../runtime/curvedWallGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('Phase 2D.6 — curved walls', () => {
  it('creates curved wall from footprint with inferred sweep', () => {
    const actor = createCurvedWallFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 400, y: 0, z: 400 },
      gridSize: 25,
    });
    const wall = actor.getComponent('CurvedWall');
    expect(wall).toBeTruthy();
    expect(wall.sweepAngle).toBe(360);
    expect(actor.tags).toContain('curvedWall');
    expect(actor.transform.position.y).toBe(wall.height / 2);
  });

  it('supports 45/90/180/360 sweeps with hollow interior for full circles', () => {
    for (const sweep of [45, 90, 180, 360]) {
      const wall = new CurvedWallComponent({
        radius: 200,
        sweepAngle: sweep,
        height: 300,
        thickness: 20,
        curveResolution: 16,
      });
      const solids = getCurvedWallColliderSolids(wall);
      expect(solids.length).toBe(16);
      if (sweep === 360) {
        expect(isClosedCurvedWall(wall)).toBe(true);
        // Centerline at radius keeps hollow core (innerR > 0)
        expect(wall.radius - wall.thickness * 0.5).toBeGreaterThan(0);
      }
      const geom = createCurvedWallGeometry(wall);
      expect(geom.attributes.position.count).toBeGreaterThan(24);
      geom.dispose();
    }
  });

  it('exposes start/end endpoints with tangents', () => {
    const wall = new CurvedWallComponent({
      radius: 100,
      sweepAngle: 90,
      startAngle: 0,
      thickness: 20,
    });
    const { start, end } = getCurvedWallLocalEndpoints(wall);
    expect(start.position.x).toBeCloseTo(100, 5);
    expect(start.position.z).toBeCloseTo(0, 5);
    expect(end.position.x).toBeCloseTo(0, 5);
    expect(end.position.z).toBeCloseTo(100, 5);
    expect(Math.hypot(start.tangent.x, start.tangent.z)).toBeCloseTo(1, 5);
  });

  it('AABB grows with radius and UV mesh builds', () => {
    const small = getCurvedWallAabbSize(new CurvedWallComponent({ radius: 100, sweepAngle: 90 }));
    const large = getCurvedWallAabbSize(new CurvedWallComponent({ radius: 300, sweepAngle: 90 }));
    expect(large.x).toBeGreaterThan(small.x);
  });

  it('Rapier builds segmented colliders (not one AABB)', async () => {
    const world = new World({ name: 'cw-phys' });
    const actor = createCurvedWallFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 200, z: 400 },
      gridSize: 25,
      sweepAngle: 90,
    });
    world.addActor(actor);
    const wall = actor.getComponent('CurvedWall');
    wall.curveResolution = 12;
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(actor.id)).toBe(12);
    physics.dispose();
  });

  it('serializes and undoes property edits', () => {
    const world = new World({ name: 'cw-save' });
    const actor = createCurvedWallFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 300, z: 300 },
      gridSize: 25,
    });
    world.addActor(actor);
    const wall = actor.getComponent('CurvedWall');
    const history = new HistoryStack();
    history.execute(new SetCurvedWallPropertiesCommand({
      world,
      actorId: actor.id,
      before: { sweepAngle: wall.sweepAngle, radius: wall.radius },
      after: { sweepAngle: 180, radius: 250 },
    }));
    expect(wall.sweepAngle).toBe(180);
    expect(wall.radius).toBe(250);
    history.undo();
    expect(wall.sweepAngle).not.toBe(180);

    const json = serializeLevel(world);
    const loaded = deserializeLevel(json);
    const again = loaded.actors.find((a) => a.getComponent('CurvedWall'));
    expect(again.getComponent('CurvedWall').thickness).toBe(wall.thickness);
  });

  it('AddActorsCommand round-trips curved wall', () => {
    const world = new World({ name: 'cw-add' });
    const actor = createCurvedWallFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 250, z: 250 },
      gridSize: 25,
    });
    const history = new HistoryStack();
    history.execute(new AddActorsCommand({
      world,
      actorsJson: [actor.toJSON()],
      label: 'Add',
    }));
    expect(world.getActor(actor.id)?.getComponent('CurvedWall')).toBeTruthy();
    history.undo();
    expect(world.getActor(actor.id)).toBeFalsy();
  });
});
