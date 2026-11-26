import { describe, expect, it } from 'vitest';
import {
  EnvironmentComponent,
  ENVIRONMENT_TYPES,
  normalizeEnvironmentFields,
  environmentAuthorableSnapshot,
} from '../components/EnvironmentComponent.js';
import { createEnvironmentActor } from '../editor/environmentFactory.js';
import { createComponentFromJSON, getRegisteredComponentTypes } from '../components/componentRegistry.js';
import { SetEnvironmentPropertiesCommand } from '../editor/history/commands.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { World } from '../core/World.js';
import { CREATION_CATEGORIES } from '../editor/creation/creationTools.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('Batch 4 EnvironmentComponent', () => {
  it('registers Environment component type', () => {
    expect(getRegisteredComponentTypes()).toContain('Environment');
  });

  it('normalizes all environment types with defaults', () => {
    for (const envType of ENVIRONMENT_TYPES) {
      const n = normalizeEnvironmentFields({ envType });
      expect(n.envType).toBe(envType);
      expect(n.width).toBeGreaterThan(0);
      expect(n.textureResolution).toBeGreaterThanOrEqual(128);
    }
  });

  it('round-trips through component JSON', () => {
    const comp = new EnvironmentComponent({
      envType: 'water2',
      width: 500,
      flowSpeed: 0.05,
      color: '#003322',
    });
    const again = createComponentFromJSON(comp.toJSON());
    expect(again.type).toBe('Environment');
    expect(again.envType).toBe('water2');
    expect(again.width).toBe(500);
    expect(again.flowSpeed).toBe(0.05);
  });

  it('creates actors for each env type', () => {
    for (const envType of ENVIRONMENT_TYPES) {
      const actor = createEnvironmentActor({ envType, position: { x: 10, y: 0, z: 20 } });
      expect(actor.tags).toContain('environment');
      expect(actor.tags).toContain(envType);
      expect(actor.getComponent('Environment').envType).toBe(envType);
    }
  });

  it('supports undo of environment property edits', () => {
    const world = new World({ name: 'Env' });
    const actor = createEnvironmentActor({ envType: 'reflector' });
    world.addActor(actor);
    const env = actor.getComponent('Environment');
    const before = environmentAuthorableSnapshot(env);
    const after = { ...before, width: 777, color: '#ff00aa' };
    const history = new HistoryStack();
    history.execute(new SetEnvironmentPropertiesCommand({
      world,
      actorId: actor.id,
      before,
      after,
      label: 'Edit mirror',
    }));
    expect(env.width).toBe(777);
    history.undo();
    expect(env.width).toBe(before.width);
    history.redo();
    expect(env.color).toBe('#ff00aa');
  });

  it('exposes Environment category on the creation toolbar', () => {
    const envCat = CREATION_CATEGORIES.find((c) => c.id === 'environment');
    expect(envCat).toBeTruthy();
    const ids = envCat.tools.map((t) => t.envType);
    expect(ids).toEqual(expect.arrayContaining([
      'water2', 'water', 'reflector', 'refractor', 'decal', 'sprite', 'sky',
    ]));
  });

  it('serializes environment actors through level save/load', () => {
    const world = new World({ name: 'Batch4' });
    world.addActor(createEnvironmentActor({
      envType: 'water2',
      position: { x: 0, y: 5, z: 0 },
      width: 800,
      flowSpeed: 0.06,
    }));
    world.addActor(createEnvironmentActor({
      envType: 'sprite',
      position: { x: 100, y: 150, z: 0 },
      mapId: 'tex_flare_main',
    }));
    world.addActor(createEnvironmentActor({
      envType: 'sky',
      elevation: 18,
      azimuth: 90,
    }));
    const json = serializeLevel(world);
    const restored = deserializeLevel(json);
    const envs = restored.actors
      .map((a) => a.getComponent('Environment'))
      .filter(Boolean);
    expect(envs).toHaveLength(3);
    expect(envs.some((e) => e.envType === 'water2' && e.width === 800)).toBe(true);
    expect(envs.some((e) => e.envType === 'sprite' && e.mapId === 'tex_flare_main')).toBe(true);
    expect(envs.some((e) => e.envType === 'sky' && e.elevation === 18)).toBe(true);
  });

  it('loads acceptance-environment level when present', async () => {
    const fs = await import('node:fs/promises');
    let raw;
    try {
      raw = JSON.parse(
        await fs.readFile(new URL('../../public/levels/acceptance-environment.json', import.meta.url), 'utf8'),
      );
    } catch {
      return; // created later in this batch
    }
    const world = deserializeLevel(raw);
    const types = new Set(
      world.actors
        .map((a) => a.getComponent('Environment')?.envType)
        .filter(Boolean),
    );
    expect(types.has('water2')).toBe(true);
    expect(types.has('reflector')).toBe(true);
    expect(types.has('sprite')).toBe(true);
  });
});
