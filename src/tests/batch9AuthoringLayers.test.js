import { describe, it, expect } from 'vitest';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import {
  AUTHORING_LAYERS_SCHEMA_VERSION,
  createDefaultAuthoringLayers,
  normalizeAuthoringLayersState,
  wouldCreateLayerCycle,
  deleteAuthoringLayer,
  getLayerChildren,
  isAuthoringLayerEffectivelyVisible,
  isAuthoringLayerEffectivelyLocked,
  isActorAuthoringLayerVisible,
  isActorAuthoringLayerLocked,
  resolveAuthoringLayerId,
  getDefaultAuthoringLayerId,
  countActorsPerLayer,
} from '../core/authoringLayers.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listLessons } from '../tutorials/lessons/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Batch 9 authoring layers — model', () => {
  it('seeds five editable default layers', () => {
    const state = createDefaultAuthoringLayers();
    expect(state.schemaVersion).toBe(AUTHORING_LAYERS_SCHEMA_VERSION);
    expect(state.layers).toHaveLength(5);
    expect(state.layers.map((l) => l.name)).toEqual([
      'Architecture', 'Props', 'Lighting', 'Environment', 'Gameplay',
    ]);
    expect(state.activeLayerId).toBe(state.layers[0].id);
    expect(new Set(state.layers.map((l) => l.id)).size).toBe(5);
  });

  it('normalizes missing state to defaults and rejects cycles', () => {
    const seeded = normalizeAuthoringLayersState(null);
    expect(seeded.layers.length).toBe(5);
    const a = seeded.layers[0].id;
    const b = seeded.layers[1].id;
    seeded.layers[0].parentId = b;
    seeded.layers[1].parentId = a;
    const fixed = normalizeAuthoringLayersState(seeded);
    // Cycle broken — every remaining parent link is acyclic.
    expect(fixed.layers.every((l) => !l.parentId
      || !wouldCreateLayerCycle(fixed.layers, l.id, l.parentId))).toBe(true);
  });

  it('prevents cyclic reparent and supports nested children', () => {
    const state = createDefaultAuthoringLayers();
    const [arch, props] = state.layers;
    props.parentId = arch.id;
    expect(wouldCreateLayerCycle(state.layers, arch.id, props.id)).toBe(true);
    expect(wouldCreateLayerCycle(state.layers, props.id, arch.id)).toBe(false);
    expect(getLayerChildren(state.layers, arch.id).map((l) => l.id)).toContain(props.id);
  });

  it('deletes layer without removing actors and reassigns membership', () => {
    const state = createDefaultAuthoringLayers();
    const props = state.layers.find((l) => l.name === 'Props');
    const arch = state.layers.find((l) => l.name === 'Architecture');
    const result = deleteAuthoringLayer(state, props.id, {
      reassignToLayerId: arch.id,
      actorIdsOnLayer: ['actor_a', 'actor_b'],
    });
    expect(result.ok).toBe(true);
    expect(result.nextState.layers.find((l) => l.id === props.id)).toBeFalsy();
    expect(result.actorUpdates).toEqual([
      { actorId: 'actor_a', authoringLayerId: arch.id },
      { actorId: 'actor_b', authoringLayerId: arch.id },
    ]);
  });

  it('visibility/lock inherit from ancestors while preserving child flags', () => {
    const state = createDefaultAuthoringLayers();
    const arch = state.layers[0];
    const child = { ...state.layers[1], parentId: arch.id };
    state.layers[1] = child;
    const hidden = new Set([arch.id]);
    expect(isAuthoringLayerEffectivelyVisible(child.id, state.layers, hidden)).toBe(false);
    expect(isAuthoringLayerEffectivelyVisible(arch.id, state.layers, new Set())).toBe(true);
    const locked = new Set([arch.id]);
    expect(isAuthoringLayerEffectivelyLocked(child.id, state.layers, locked)).toBe(true);
    expect(isAuthoringLayerEffectivelyLocked(child.id, state.layers, new Set([child.id]))).toBe(true);
  });

  it('serializes authoringLayers and actor membership round-trip', () => {
    const world = new World({ name: 'Layers RT' });
    const layerId = world.authoringLayers.layers[1].id;
    const actor = new Actor({
      name: 'Prop',
      authoringLayerId: layerId,
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 100 } })],
    });
    world.addActor(actor);
    const json = serializeLevel(world);
    expect(json.authoringLayers.layers.length).toBe(5);
    expect(json.actors[0].authoringLayerId).toBe(layerId);
    const loaded = deserializeLevel(json);
    expect(loaded.authoringLayers.layers.map((l) => l.id)).toEqual(
      world.authoringLayers.layers.map((l) => l.id),
    );
    expect(loaded.actors[0].authoringLayerId).toBe(layerId);
  });

  it('loads legacy levels without authoringLayers without losing actors', () => {
    const legacy = {
      schemaVersion: 2,
      name: 'Legacy',
      mapMode: 'additive',
      actors: [{
        id: 'actor_legacy_1',
        name: 'Floor',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        tags: [],
        parentId: null,
        visible: true,
        locked: false,
        components: [{
          id: 'comp_1',
          type: 'Brush',
          enabled: true,
          size: { x: 200, y: 20, z: 200 },
          operation: 'add',
        }],
      }],
    };
    const world = deserializeLevel(legacy);
    expect(world.actors).toHaveLength(1);
    expect(world.actors[0].id).toBe('actor_legacy_1');
    expect(world.authoringLayers.layers.length).toBe(5);
    expect(world.actors[0].authoringLayerId).toBeNull();
    expect(resolveAuthoringLayerId(world.authoringLayers, null)).toBe(
      getDefaultAuthoringLayerId(world.authoringLayers),
    );
  });

  it('counts actors per layer and resolves solo visibility', () => {
    const world = new World({ name: 'Counts' });
    const propsId = world.authoringLayers.layers.find((l) => l.name === 'Props').id;
    world.addActor(new Actor({ name: 'A', authoringLayerId: propsId }));
    world.addActor(new Actor({ name: 'B', authoringLayerId: propsId }));
    const counts = countActorsPerLayer(world.actors, world.authoringLayers);
    expect(counts[propsId]).toBe(2);

    const actor = world.actors[0];
    expect(isActorAuthoringLayerVisible(actor, world, { hidden: new Set([propsId]) })).toBe(false);
    expect(isActorAuthoringLayerVisible(actor, world, {
      hidden: new Set(),
      solo: { activeLayerId: world.authoringLayers.layers[0].id },
    })).toBe(false);
    expect(isActorAuthoringLayerLocked(actor, world, { locked: new Set([propsId]) })).toBe(true);
  });
});

describe('Batch 9 acceptance artifacts', () => {
  it('ships acceptance level and Academy lesson 30', () => {
    const levelPath = path.join(rootDir, 'public/levels/acceptance-layers.json');
    expect(existsSync(levelPath)).toBe(true);
    const level = JSON.parse(readFileSync(levelPath, 'utf8'));
    expect(level.authoringLayers?.layers?.length).toBeGreaterThanOrEqual(5);
    expect(level.authoringLayers.layers.some((l) => l.parentId)).toBe(true);
    expect(Array.isArray(level.actors)).toBe(true);
    expect(level.actors.some((a) => a.authoringLayerId)).toBe(true);
    const lesson = listLessons().find((l) => l.id === 'editor-layers');
    expect(lesson?.order).toBe(30);
    expect(lesson?.starterPath).toContain('acceptance-layers');
  });
});

describe('Batch 9 visibility fingerprint + ViewHelper smoke', () => {
  it('actorContentFingerprint ignores actor.visible (no CSG rebuild on hide)', async () => {
    const { actorContentFingerprint } = await import('../runtime/actorVisualFingerprint.js');
    const actor = new Actor({ name: 'Brush', visible: true });
    actor.addComponent(new BrushComponent({ size: { x: 100, y: 100, z: 100 } }));
    const before = actorContentFingerprint(actor);
    actor.visible = false;
    expect(actorContentFingerprint(actor)).toBe(before);
  });

  it('imports ViewHelper addon', async () => {
    const { ViewHelper } = await import('three/addons/helpers/ViewHelper.js');
    expect(typeof ViewHelper).toBe('function');
  });

  it('hides ViewHelper negative-axis alpha discs', async () => {
    const { hideViewHelperNegativeAxes } = await import('../runtime/SceneView.js');
    const neg = [
      { userData: { type: 'negX' }, visible: true },
      { userData: { type: 'negY' }, visible: true },
      { userData: { type: 'negZ' }, visible: true },
    ];
    const pos = { userData: { type: 'posX' }, visible: true };
    const helper = {
      traverse(fn) {
        for (const obj of [...neg, pos]) fn(obj);
      },
    };
    hideViewHelperNegativeAxes(helper);
    expect(neg.every((o) => o.visible === false)).toBe(true);
    expect(pos.visible).toBe(true);
  });

  it('prefab capture strips authoringLayerId', async () => {
    const { createPrefabFromActors } = await import('../prefabs/prefabOps.js');
    const world = new World({ name: 'PrefabStrip' });
    const layerId = world.authoringLayers.layers[0].id;
    const actor = new Actor({ name: 'Prop', authoringLayerId: layerId });
    actor.addComponent(new BrushComponent({ size: { x: 50, y: 50, z: 50 } }));
    world.addActor(actor);
    const result = createPrefabFromActors(world, [actor.id], { name: 'StripTest' });
    expect(result.ok).toBe(true);
    expect(result.definition.actors[0].authoringLayerId).toBeUndefined();
  });
});
