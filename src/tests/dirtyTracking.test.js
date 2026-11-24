import { describe, expect, it } from 'vitest';
import { World } from '../core/World.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { RemoveActorsCommand, RenameActorCommand } from '../editor/history/commands.js';
import {
  SavedStateTracker,
  levelFingerprint,
  stableStringify,
} from '../editor/dirtyTracking.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';

function makeWorld() {
  const world = new World({ name: 'Dirty', schemaVersion: 2 });
  for (const id of ['a', 'b']) {
    const actor = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 100 },
      gridSize: 25,
    });
    actor.id = id;
    actor.name = id.toUpperCase();
    world.addActor(actor);
  }
  return world;
}

describe('stableStringify', () => {
  it('ignores object key order but respects array order', () => {
    expect(stableStringify({ a: 1, b: { y: 2, x: 3 } })).toBe(
      stableStringify({ b: { x: 3, y: 2 }, a: 1 }),
    );
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe('SavedStateTracker', () => {
  it('treats a world with no baseline as clean (nothing to lose)', () => {
    const tracker = new SavedStateTracker();
    expect(tracker.isDirty(makeWorld())).toBe(false);
    expect(tracker.isDirty(null)).toBe(false);
  });

  it('is clean right after markSaved and dirty after any content change', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    tracker.markSaved(levelFingerprint(world));
    expect(tracker.isDirty(world)).toBe(false);

    world.getActor('a').transform.position.x += 25;
    expect(tracker.isDirty(world)).toBe(true);
  });

  it('detects renames, removals, flags and level name changes', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    tracker.markSaved(levelFingerprint(world));

    world.getActor('a').name = 'Renamed';
    expect(tracker.isDirty(world)).toBe(true);
    world.getActor('a').name = 'A';
    expect(tracker.isDirty(world)).toBe(false);

    world.getActor('b').locked = true;
    expect(tracker.isDirty(world)).toBe(true);
    world.getActor('b').locked = false;

    world.name = 'Other';
    expect(tracker.isDirty(world)).toBe(true);
    world.name = 'Dirty';

    world.removeActor('b');
    expect(tracker.isDirty(world)).toBe(true);
  });

  it('is clean again when history undoes back to the saved state', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    tracker.markSaved(levelFingerprint(world));
    const history = new HistoryStack();

    history.execute(new RenameActorCommand({ world, actorId: 'a', before: 'A', after: 'A2' }));
    history.execute(new RemoveActorsCommand({ world, actorIds: ['b'] }));
    expect(tracker.isDirty(world)).toBe(true);

    history.undo();
    expect(tracker.isDirty(world)).toBe(true);
    history.undo();
    expect(tracker.isDirty(world)).toBe(false);
    history.redo();
    expect(tracker.isDirty(world)).toBe(true);
  });

  it('is measured against the last save, so undoing past it is dirty', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    const history = new HistoryStack();

    history.execute(new RenameActorCommand({ world, actorId: 'a', before: 'A', after: 'A2' }));
    tracker.markSaved(levelFingerprint(world));
    expect(tracker.isDirty(world)).toBe(false);

    history.undo();
    expect(tracker.isDirty(world)).toBe(true);
    history.redo();
    expect(tracker.isDirty(world)).toBe(false);
  });

  it('does not report false dirt after a serialize → deserialize round trip', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    tracker.markSaved(levelFingerprint(world));
    const restored = deserializeLevel(serializeLevel(world));
    expect(tracker.isDirty(restored)).toBe(false);
  });

  it('does not report false dirt when only component key order differs', () => {
    const world = makeWorld();
    const tracker = new SavedStateTracker();
    tracker.markSaved(levelFingerprint(world));

    const comp = world.getActor('a').getComponent('Brush');
    const copy = { ...comp };
    for (const key of Object.keys(comp)) delete comp[key];
    for (const key of Object.keys(copy).reverse()) comp[key] = copy[key];

    expect(tracker.isDirty(world)).toBe(false);
  });
});
