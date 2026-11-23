import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { Transform } from '../core/Transform.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('level serialization', () => {
  it('loads the authored test room JSON', () => {
    const raw = readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8');
    const world = deserializeLevel(JSON.parse(raw));

    expect(world.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(world.name).toBe('Test Room');
    expect(world.actors.length).toBeGreaterThanOrEqual(7);

    const floor = world.getActor('actor_floor');
    expect(floor).toBeTruthy();
    expect(floor.getComponent('Brush').size).toEqual({ x: 600, y: 20, z: 600 });

    const walls = ['actor_wall_north', 'actor_wall_south', 'actor_wall_west', 'actor_wall_east'];
    for (const id of walls) {
      expect(world.getActor(id)?.getComponent('Brush')).toBeTruthy();
    }

    expect(world.getActor('actor_light_main')?.getComponent('Light')).toBeTruthy();
    expect(world.getActor('actor_player_spawn')?.getComponent('PlayerSpawn')).toBeTruthy();
  });

  it('round-trips actors and persistent IDs', () => {
    const world = new World({ name: 'RoundTrip', schemaVersion: 1 });
    world.addActor(
      new Actor({
        id: 'actor_box',
        name: 'Box',
        transform: new Transform({ position: { x: 25, y: 50, z: 75 } }),
        components: [
          new BrushComponent({
            id: 'comp_box',
            size: { x: 100, y: 100, z: 100 },
            color: '#abcdef',
          }),
        ],
      }),
    );

    const json = serializeLevel(world);
    const restored = deserializeLevel(json);
    const again = serializeLevel(restored);

    expect(again).toEqual(json);
    expect(restored.getActor('actor_box').transform.position).toEqual({
      x: 25,
      y: 50,
      z: 75,
    });
    expect(restored.getActor('actor_box').getComponent('Brush').id).toBe('comp_box');
  });

  it('rejects invalid level payloads', () => {
    expect(() => deserializeLevel(null)).toThrow();
    expect(() => deserializeLevel({ name: 'x' })).toThrow(/schemaVersion/);
    expect(() => deserializeLevel({ schemaVersion: 1 })).toThrow(/actors/);
  });
});
