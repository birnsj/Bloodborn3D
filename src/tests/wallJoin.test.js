import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { JoinWallEndpointsCommand } from '../editor/history/commands.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createCurvedWallFromBounds } from '../editor/curvedWallFactory.js';
import {
  computeMiterHalfAngleDeg,
  findNearestWallEndpoint,
  getMiteredWallFootprint,
  getStraightWallEndpoints,
  getWallEndpoints,
  planWallEndpointJoin,
} from '../runtime/wallEndpoints.js';
import { brushHasMiters, getMiteredWallCorners } from '../runtime/miteredWallGeometry.js';
import { BrushComponent } from '../components/BrushComponent.js';

describe('Phase 2D.6 — wall junctions', () => {
  it('computes miter half-angles for 45/90/135 turns', () => {
    // Tangents pointing away from corner
    expect(computeMiterHalfAngleDeg({ x: 1, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(45, 5); // 90° room corner
    const a45 = computeMiterHalfAngleDeg(
      { x: 1, z: 0 },
      { x: Math.cos(Math.PI / 4), z: Math.sin(Math.PI / 4) },
    );
    expect(a45).toBeCloseTo(67.5, 0); // 135° exterior / 45° interior turn → half of (180-45)=67.5
    const a135 = computeMiterHalfAngleDeg(
      { x: 1, z: 0 },
      { x: Math.cos((135 * Math.PI) / 180), z: Math.sin((135 * Math.PI) / 180) },
    );
    expect(a135).toBeCloseTo(22.5, 0);
  });

  it('exposes straight wall endpoints along length', () => {
    const world = new World({ name: 'wj' });
    const wall = createBrushFromBounds({
      kind: 'wall',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 400, y: 0, z: 20 },
      gridSize: 20,
    });
    world.addActor(wall);
    const eps = getStraightWallEndpoints(wall, world);
    expect(eps).toBeTruthy();
    expect(Math.abs(eps.end.position.x - eps.start.position.x)).toBeCloseTo(400, 0);
  });

  it('finds nearest endpoint across actors', () => {
    const world = new World({ name: 'wj2' });
    const a = createBrushFromBounds({
      kind: 'wall',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 200, z: 20 },
      gridSize: 20,
    });
    const b = createBrushFromBounds({
      kind: 'wall',
      min: { x: 200, y: 0, z: 0 },
      max: { x: 220, z: 200 },
      gridSize: 20,
    });
    world.addActor(a);
    world.addActor(b);
    const epsA = getWallEndpoints(a, world);
    const hit = findNearestWallEndpoint(world, epsA.end.position, {
      excludeActorId: a.id,
      maxDist: 50,
    });
    expect(hit).toBeTruthy();
    expect(hit.actor.id).toBe(b.id);
  });

  it('plans join that moves wall end onto target without merging actors', () => {
    const world = new World({ name: 'wj3' });
    const a = createBrushFromBounds({
      kind: 'wall',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 300, z: 20 },
      gridSize: 20,
    });
    const b = createBrushFromBounds({
      kind: 'wall',
      min: { x: 350, y: 0, z: 0 },
      max: { x: 370, z: 300 },
      gridSize: 20,
    });
    world.addActor(a);
    world.addActor(b);
    const plan = planWallEndpointJoin({
      movingActor: b,
      movingEndId: 'start',
      targetActor: a,
      targetEndId: 'end',
      world,
      applyMiter: true,
    });
    expect(plan.position).toBeTruthy();
    expect(plan.miterHalf).toBeGreaterThan(0);
    expect(world.actors).toHaveLength(2);
  });

  it('mitered footprint produces a trapezoid', () => {
    const size = { x: 400, y: 300, z: 20 };
    const foot = getMiteredWallFootprint(size, 45, 45);
    expect(foot).toHaveLength(4);
    const { bottom, top } = getMiteredWallCorners(size, 30, 30);
    expect(bottom).toHaveLength(4);
    expect(top).toHaveLength(4);
    const brush = new BrushComponent({ size, miterStart: 30, miterEnd: 30 });
    expect(brushHasMiters(brush)).toBe(true);
  });

  it('JoinWallEndpointsCommand undoes miters and pose', () => {
    const world = new World({ name: 'wj4' });
    const a = createBrushFromBounds({
      kind: 'wall',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 200, z: 20 },
      gridSize: 20,
    });
    world.addActor(a);
    const beforePos = { ...a.transform.position };
    const history = new HistoryStack();
    history.execute(new JoinWallEndpointsCommand({
      world,
      patches: [{
        actorId: a.id,
        transform: {
          before: { position: beforePos, rotation: { ...a.transform.rotation } },
          after: {
            position: { ...beforePos, x: beforePos.x + 50 },
            rotation: { ...a.transform.rotation },
          },
        },
        brushMiters: {
          before: { miterStart: 0, miterEnd: 0 },
          after: { miterStart: 0, miterEnd: 45 },
        },
      }],
    }));
    expect(a.getComponent('Brush').miterEnd).toBe(45);
    expect(a.transform.position.x).toBe(beforePos.x + 50);
    history.undo();
    expect(a.getComponent('Brush').miterEnd).toBe(0);
    expect(a.transform.position.x).toBe(beforePos.x);
  });

  it('plans curved-to-straight join with orient', () => {
    const world = new World({ name: 'wj5' });
    const curved = createCurvedWallFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 400, z: 200 },
      gridSize: 25,
      sweepAngle: 90,
    });
    const straight = createBrushFromBounds({
      kind: 'wall',
      min: { x: 500, y: 0, z: 0 },
      max: { x: 700, z: 20 },
      gridSize: 20,
    });
    world.addActor(curved);
    world.addActor(straight);
    const plan = planWallEndpointJoin({
      movingActor: straight,
      movingEndId: 'start',
      targetActor: curved,
      targetEndId: 'end',
      world,
      orient: true,
      applyMiter: true,
    });
    expect(plan.position).toBeTruthy();
    expect(plan.rotation).toBeTruthy();
  });
});
