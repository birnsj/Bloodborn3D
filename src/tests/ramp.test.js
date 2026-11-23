import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  SetRampPropertiesCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import { createRampFromBounds } from '../editor/rampFactory.js';
import { RampComponent } from '../components/RampComponent.js';
import {
  getRampAabbSize,
  getRampSlopeAngleDegrees,
  getRampSlopeCollider,
  getRampWedgeVertices,
} from '../runtime/rampGeometry.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('Stage 2 — parametric ramps', () => {
  it('creates ramp from footprint with slope along longer axis', () => {
    const actor = createRampFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 0, z: 400 },
      gridSize: 25,
      rise: 150,
    });
    const ramp = actor.getComponent('Ramp');
    expect(ramp).toBeTruthy();
    expect(ramp.width).toBe(100);
    expect(ramp.length).toBe(400);
    expect(ramp.rise).toBe(150);
    expect(ramp.direction).toBe('z+');
    expect(actor.tags).toContain('ramp');
    const aabb = getRampAabbSize(ramp);
    expect(aabb.y).toBe(150);
    expect(actor.transform.position.y).toBe(75);
  });

  it('slope collider is rotated along hypotenuse, not AABB half-extents', () => {
    const ramp = new RampComponent({
      width: 100,
      length: 300,
      rise: 150,
      direction: 'z+',
      thickness: 20,
    });
    const slope = getRampSlopeCollider(ramp);
    const hyp = Math.sqrt(300 * 300 + 150 * 150);
    expect(slope.halfSize.z).toBeCloseTo(hyp / 2, 5);
    expect(slope.halfSize.y).toBe(10);
    expect(slope.halfSize.x).toBe(50);
    expect(slope.localRotation.x).toBeCloseTo(-getRampSlopeAngleDegrees(ramp), 5);
    // Must not equal AABB half-size (150/2 rise)
    expect(slope.halfSize.y).not.toBe(75);
  });

  it('wedge has six vertices', () => {
    const ramp = new RampComponent({ width: 80, length: 200, rise: 100, direction: 'x+' });
    expect(getRampWedgeVertices(ramp)).toHaveLength(6);
  });

  it('Rapier builds one slope collider for a ramp', async () => {
    const world = new World({ name: 'ramp-phys' });
    const actor = createRampFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 300 },
      gridSize: 25,
    });
    world.addActor(actor);
    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);
    expect(physics.getColliderCount(actor.id)).toBe(1);
    physics.dispose();
  });

  it('serializes ramp properties round-trip', () => {
    const world = new World({ name: 'ramp-save' });
    const actor = createRampFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 150, z: 350 },
      gridSize: 25,
      rise: 125,
    });
    actor.getComponent('Ramp').materialId = 'mat_stone';
    world.addActor(actor);
    const loaded = deserializeLevel(serializeLevel(world));
    const ramp = loaded.actors.find((a) => a.getComponent('Ramp'))?.getComponent('Ramp');
    expect(ramp.width).toBe(150);
    expect(ramp.length).toBe(350);
    expect(ramp.rise).toBe(125);
    expect(ramp.materialId).toBe('mat_stone');
    expect(ramp.direction).toMatch(/^[xz][+-]$/);
  });

  it('undo/redo property and transform edits', () => {
    const world = new World({ name: 'ramp-hist' });
    const actor = createRampFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 300 },
      gridSize: 25,
    });
    world.addActor(actor);
    const history = new HistoryStack();
    const ramp = actor.getComponent('Ramp');
    history.execute(new SetRampPropertiesCommand({
      world,
      actorId: actor.id,
      before: { rise: ramp.rise },
      after: { rise: 200 },
      label: 'Edit rise',
    }));
    expect(ramp.rise).toBe(200);
    history.undo();
    expect(ramp.rise).toBe(150);

    const before = actor.transform.toJSON();
    const after = structuredClone(before);
    after.position.x += 50;
    history.execute(new SetTransformsCommand({
      world,
      changes: [{ actorId: actor.id, before, after }],
    }));
    expect(actor.transform.position.x).toBe(before.position.x + 50);
    history.undo();
    expect(actor.transform.position.x).toBe(before.position.x);
  });

  it('AddActorsCommand places ramp', () => {
    const world = new World({ name: 'ramp-add' });
    const actor = createRampFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, z: 200 },
      gridSize: 25,
    });
    const history = new HistoryStack();
    history.execute(new AddActorsCommand({
      world,
      actorsJson: [actor.toJSON()],
      label: 'Create ramp',
    }));
    expect(world.getActor(actor.id)?.getComponent('Ramp')).toBeTruthy();
    history.undo();
    expect(world.getActor(actor.id)).toBeFalsy();
  });
});
