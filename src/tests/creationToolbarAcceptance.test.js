import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { selectPlacementHit } from '../editor/creation/surfacePlacement.js';
import { buildCreationCategories } from '../editor/creation/creationTools.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Acceptance — creation toolbar room', () => {
  const raw = JSON.parse(
    readFileSync(join(root, 'public/levels/acceptance-creation-toolbar.json'), 'utf8'),
  );

  it('has floor, ceiling, table, shelves, and spawn', () => {
    const world = deserializeLevel(raw);
    expect(world.getActor('actor_floor').tags).toContain('floor');
    expect(world.getActor('actor_ceiling').tags).toContain('ceiling');
    expect(world.getActor('actor_table')).toBeTruthy();
    expect(world.getActor('actor_shelf')).toBeTruthy();
    expect(world.getActor('actor_player_spawn').getComponent('PlayerSpawn')).toBeTruthy();
  });

  it('interior placement prefers table over ceiling', () => {
    const hits = [
      {
        actorId: 'actor_ceiling',
        distance: 1,
        point: { x: 0, y: 300, z: 40 },
        normal: { x: 0, y: -1, z: 0 },
        brushKind: 'ceiling',
        tags: ['ceiling'],
        locked: false,
        visible: true,
      },
      {
        actorId: 'actor_table',
        distance: 2,
        point: { x: 0, y: 90, z: 40 },
        normal: { x: 0, y: 1, z: 0 },
        brushKind: null,
        tags: ['table'],
        locked: false,
        visible: true,
      },
      {
        actorId: 'actor_floor',
        distance: 3,
        point: { x: 0, y: 20, z: 40 },
        normal: { x: 0, y: 1, z: 0 },
        brushKind: 'floor',
        tags: ['floor'],
        locked: false,
        visible: true,
      },
    ];
    const { hit } = selectPlacementHit(hits, { placement: 'upright' });
    expect(hit.actorId).toBe('actor_table');
  });

  it('round-trips and builds ceiling collision for play', async () => {
    const world = deserializeLevel(raw);
    const again = deserializeLevel(serializeLevel(world));
    expect(again.getActor('actor_ceiling')).toBeTruthy();

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(again);
    expect(physics.getColliderCount('actor_ceiling')).toBeGreaterThan(0);
    expect(physics.getColliderCount('actor_table')).toBeGreaterThan(0);
    physics.dispose();
  });

  it('catalog still exposes Academy tool ids', () => {
    const cats = buildCreationCategories([]);
    const ids = cats.flatMap((c) => c.tools.map((t) => t.helpId));
    expect(ids).toContain('toolbar.box');
    expect(ids).toContain('toolbar.floor');
    expect(ids).toContain('toolbar.pointLight');
    expect(ids).toContain('toolbar.subtract');
    expect(ids).toContain('toolbar.ramp');
    expect(ids).toContain('toolbar.stair');
  });
});
