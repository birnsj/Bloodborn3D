import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { snapToGrid } from '../core/units.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Edit/Play restoration contract without WebGL/Rapier:
 * Play captures authored JSON; runtime edits must not survive Stop restore.
 */
describe('Edit/Play restoration', () => {
  it('restores authored transforms after simulated play mutations', () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8'),
    );
    const world = deserializeLevel(raw);
    const authoredSnapshot = serializeLevel(world);

    const wall = world.getActor('actor_wall_north');
    const original = { ...wall.transform.position };

    // Simulate runtime / accidental edit during play
    wall.transform.position = {
      x: snapToGrid(original.x + 100),
      y: original.y,
      z: snapToGrid(original.z + 50),
    };
    wall.name = 'Mutated At Runtime';

    expect(wall.transform.position).not.toEqual(original);

    // Stop restores from snapshot into a fresh world graph
    const restored = deserializeLevel(authoredSnapshot);
    const restoredWall = restored.getActor('actor_wall_north');

    expect(restoredWall.name).toBe('Wall North');
    expect(restoredWall.transform.position).toEqual(original);
    expect(serializeLevel(restored)).toEqual(authoredSnapshot);
  });

  it('keeps designer edits that were saved before Play', () => {
    const world = deserializeLevel(
      JSON.parse(
        readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8'),
      ),
    );

    const wall = world.getActor('actor_wall_east');
    wall.transform.position.x = snapToGrid(wall.transform.position.x + 25);
    const authoredSnapshot = serializeLevel(world);

    // Play-time mutation
    wall.transform.position.x += 999;

    const restored = deserializeLevel(authoredSnapshot);
    expect(restored.getActor('actor_wall_east').transform.position.x).toBe(
      JSON.parse(JSON.stringify(authoredSnapshot)).actors.find(
        (a) => a.id === 'actor_wall_east',
      ).transform.position.x,
    );
    expect(restored.getActor('actor_wall_east').transform.position.x).not.toBe(
      wall.transform.position.x,
    );
  });
});
