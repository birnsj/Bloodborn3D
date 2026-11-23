import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetTransformsCommand,
  SetBrushGeometryCommand,
} from '../editor/history/commands.js';
import { createBrushFromBounds, duplicateActors, resizeBrushFace } from '../editor/brushFactory.js';

describe('HistoryStack + brush commands', () => {
  it('undoes and redoes brush creation', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const history = new HistoryStack();
    const brush = createBrushFromBounds({
      kind: 'wall',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 300, y: 0, z: 25 },
      gridSize: 25,
    });

    history.execute(
      new AddActorsCommand({
        world,
        actorsJson: [brush.toJSON()],
        label: 'Create wall',
      }),
    );
    expect(world.getActor(brush.id)).toBeTruthy();
    expect(world.getActor(brush.id).getComponent('Brush').size.y).toBe(300);

    history.undo();
    expect(world.getActor(brush.id)).toBeNull();

    history.redo();
    expect(world.getActor(brush.id)).toBeTruthy();
    expect(world.getActor(brush.id).id).toBe(brush.id);
  });

  it('undoes delete and preserves persistent ids', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const history = new HistoryStack();
    const brush = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 100 },
      gridSize: 25,
    });
    history.execute(new AddActorsCommand({ world, actorsJson: [brush.toJSON()] }));
    const id = brush.id;
    const brushCompId = brush.getComponent('Brush').id;

    history.execute(new RemoveActorsCommand({ world, actorIds: [id] }));
    expect(world.getActor(id)).toBeNull();

    history.undo();
    const restored = world.getActor(id);
    expect(restored).toBeTruthy();
    expect(restored.getComponent('Brush').id).toBe(brushCompId);
  });

  it('undoes move and resize', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const history = new HistoryStack();
    const brush = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 100 },
      gridSize: 25,
    });
    history.execute(new AddActorsCommand({ world, actorsJson: [brush.toJSON()] }));
    const actor = world.getActor(brush.id);
    const beforeT = actor.transform.toJSON();
    const afterT = structuredClone(beforeT);
    afterT.position.x = 50;

    history.execute(
      new SetTransformsCommand({
        world,
        changes: [{ actorId: actor.id, before: beforeT, after: afterT }],
      }),
    );
    expect(actor.transform.position.x).toBe(50);
    history.undo();
    expect(actor.transform.position.x).toBe(beforeT.position.x);

    const beforeG = {
      size: { ...actor.getComponent('Brush').size },
      position: { ...actor.transform.position },
    };
    const resized = resizeBrushFace({
      ...beforeG,
      axis: 'x',
      sign: 1,
      delta: 50,
      gridSize: 25,
    });
    history.execute(
      new SetBrushGeometryCommand({
        world,
        changes: [{ actorId: actor.id, before: beforeG, after: resized }],
      }),
    );
    expect(actor.getComponent('Brush').size.x).toBe(resized.size.x);
    history.undo();
    expect(actor.getComponent('Brush').size.x).toBe(beforeG.size.x);
  });

  it('duplicates with new ids and can undo', () => {
    const world = new World({ name: 'H', schemaVersion: 1 });
    const history = new HistoryStack();
    const brush = createBrushFromBounds({
      kind: 'floor',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 200, y: 0, z: 200 },
      gridSize: 25,
    });
    history.execute(new AddActorsCommand({ world, actorsJson: [brush.toJSON()] }));
    const copies = duplicateActors([world.getActor(brush.id)], { gridSize: 25 });
    expect(copies[0].id).not.toBe(brush.id);
    expect(copies[0].getComponent('Brush').id).not.toBe(brush.getComponent('Brush').id);

    history.execute(
      new AddActorsCommand({
        world,
        actorsJson: copies.map((a) => a.toJSON()),
        label: 'Duplicate',
      }),
    );
    expect(world.actors.length).toBe(2);
    history.undo();
    expect(world.actors.length).toBe(1);
    expect(world.getActor(brush.id)).toBeTruthy();
  });
});
