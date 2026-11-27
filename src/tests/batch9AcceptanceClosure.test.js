import { describe, it, expect } from 'vitest';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { AddActorsCommand } from '../editor/history/commands.js';
import { createBrushFromBounds, duplicateActors } from '../editor/brushFactory.js';
import { createCellActor } from '../editor/cellFactory.js';
import {
  isActiveAuthoringLayerLocked,
  isEditorActorLocked,
  partitionEditableActorIds,
  lockedLayerFeedback,
} from '../editor/authoringLayerGuards.js';
import {
  getLayerDescendantIds,
  isActorAuthoringLayerVisible,
  resolveAuthoringLayerId,
} from '../core/authoringLayers.js';
import { actorContentFingerprint } from '../runtime/actorVisualFingerprint.js';
import { createPrefabFromActors } from '../prefabs/prefabOps.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeBrush(name, layerId, pos = { x: 0, y: 0, z: 0 }) {
  const actor = createBrushFromBounds({
    kind: 'box',
    min: { x: pos.x, y: pos.y, z: pos.z },
    max: { x: pos.x + 100, y: pos.y + 100, z: pos.z + 100 },
    gridSize: 25,
  });
  actor.name = name;
  actor.authoringLayerId = layerId;
  return actor;
}

describe('Batch 9 closure — duplication preserves layer membership', () => {
  it('single-actor duplicate keeps source authoringLayerId (not Active)', () => {
    const world = new World({ name: 'Dup' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props');
    const arch = world.authoringLayers.layers.find((l) => l.name === 'Architecture');
    world.authoringLayers.activeLayerId = arch.id;
    const src = makeBrush('Prop', props.id);
    world.addActor(src);
    const [copy] = duplicateActors([src], { gridSize: 25 });
    expect(copy.authoringLayerId).toBe(props.id);
    expect(copy.authoringLayerId).not.toBe(arch.id);
  });

  it('multi-selection across layers preserves each membership', () => {
    const world = new World({ name: 'DupMulti' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props').id;
    const light = world.authoringLayers.layers.find((l) => l.name === 'Lighting').id;
    world.authoringLayers.activeLayerId = world.authoringLayers.layers[0].id;
    const a = makeBrush('A', props, { x: 0, y: 0, z: 0 });
    const b = makeBrush('B', light, { x: 200, y: 0, z: 0 });
    const copies = duplicateActors([a, b], { gridSize: 25 });
    expect(copies.map((c) => c.authoringLayerId)).toEqual([props, light]);
  });

  it('parent/child hierarchy duplicate preserves layers and remapped parent', () => {
    const world = new World({ name: 'DupHier' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props').id;
    const env = world.authoringLayers.layers.find((l) => l.name === 'Environment').id;
    const parent = makeBrush('Parent', props);
    const child = makeBrush('Child', env, { x: 50, y: 0, z: 0 });
    child.parentId = parent.id;
    const copies = duplicateActors([parent, child], { gridSize: 25 });
    expect(copies[0].authoringLayerId).toBe(props);
    expect(copies[1].authoringLayerId).toBe(env);
    expect(copies[1].parentId).toBe(copies[0].id);
  });

  it('cell duplicate preserves layer membership', () => {
    const world = new World({ name: 'DupCell' });
    const game = world.authoringLayers.layers.find((l) => l.name === 'Gameplay').id;
    const cell = createCellActor({ name: 'Room', position: { x: 0, y: 0, z: 0 }, gridSize: 25 });
    cell.authoringLayerId = game;
    const [copy] = duplicateActors([cell], { gridSize: 25 });
    expect(copy.authoringLayerId).toBe(game);
    expect(copy.getComponent('Cell')).toBeTruthy();
  });

  it('prefab instance duplicate preserves layer; undo removes copies', () => {
    const world = new World({ name: 'DupPrefab' });
    const history = new HistoryStack();
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props').id;
    const actor = makeBrush('Inst', props);
    actor.prefab = {
      prefabId: 'prefab_test',
      instanceId: 'pinst_1',
      templateId: 'tpl_1',
      isRoot: true,
    };
    history.execute(new AddActorsCommand({ world, actorsJson: [actor.toJSON()] }));
    const copies = duplicateActors([world.getActor(actor.id)], { gridSize: 25 });
    expect(copies[0].authoringLayerId).toBe(props);
    expect(copies[0].prefab?.prefabId).toBe('prefab_test');
    expect(copies[0].prefab?.instanceId).not.toBe('pinst_1');
    history.execute(new AddActorsCommand({
      world,
      actorsJson: copies.map((c) => c.toJSON()),
      label: 'Duplicate',
    }));
    expect(world.actors).toHaveLength(2);
    history.undo();
    expect(world.actors).toHaveLength(1);
    expect(world.getActor(actor.id).authoringLayerId).toBe(props);
  });
});

describe('Batch 9 closure — lock enforcement helpers', () => {
  it('blocks creation when Active layer is locked; layer UI stays independent', () => {
    const world = new World({ name: 'LockCreate' });
    const active = world.authoringLayers.activeLayerId;
    const layerUi = { hidden: new Set(), locked: new Set([active]), solo: { activeLayerId: null } };
    expect(isActiveAuthoringLayerLocked(world, layerUi)).toBe(true);
    expect(isActiveAuthoringLayerLocked(world, layerUi, { playMode: true })).toBe(false);
  });

  it('partitions mixed locked/unlocked selections and nested lock inheritance', () => {
    const world = new World({ name: 'LockMix' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props');
    const nested = {
      id: 'layer_nested_lock',
      name: 'Nested',
      parentId: props.id,
      color: '#abcdef',
      sortIndex: 0,
    };
    world.authoringLayers.layers.push(nested);
    const unlocked = makeBrush('Free', world.authoringLayers.layers[0].id);
    const lockedChild = makeBrush('Locked', nested.id, { x: 100, y: 0, z: 0 });
    world.addActor(unlocked);
    world.addActor(lockedChild);
    const layerUi = {
      hidden: new Set(),
      locked: new Set([props.id]),
      solo: { activeLayerId: null },
    };
    expect(isEditorActorLocked(lockedChild, world, layerUi)).toBe(true);
    expect(isEditorActorLocked(unlocked, world, layerUi)).toBe(false);
    const part = partitionEditableActorIds(
      [unlocked.id, lockedChild.id],
      world,
      layerUi,
    );
    expect(part.editable).toEqual([unlocked.id]);
    expect(part.blocked).toEqual([lockedChild.id]);
    expect(lockedLayerFeedback(1, 2, 'delete')).toMatch(/Skipped 1 locked/);
  });
});

describe('Batch 9 closure — visibility / CSG non-destructive', () => {
  it('layer hide does not change content fingerprint (no rebuild signal)', () => {
    const actor = makeBrush('Vis', 'layer_x');
    const before = actorContentFingerprint(actor);
    actor.visible = false;
    expect(actorContentFingerprint(actor)).toBe(before);
  });

  it('solo hides non-solo layers; descendants of solo remain candidates', () => {
    const world = new World({ name: 'Solo' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props');
    const nested = {
      id: 'layer_detail',
      name: 'Detail',
      parentId: props.id,
      color: '#aa7744',
      sortIndex: 0,
    };
    world.authoringLayers.layers.push(nested);
    const desc = getLayerDescendantIds(world.authoringLayers.layers, props.id);
    expect(desc.has(nested.id)).toBe(true);
    const onProps = makeBrush('OnProps', props.id);
    const onArch = makeBrush('OnArch', world.authoringLayers.layers[0].id);
    world.addActor(onProps);
    world.addActor(onArch);
    const layerUi = {
      hidden: new Set(),
      locked: new Set(),
      solo: { activeLayerId: props.id, previousHidden: [] },
    };
    expect(isActorAuthoringLayerVisible(onProps, world, layerUi)).toBe(true);
    expect(isActorAuthoringLayerVisible(onArch, world, layerUi)).toBe(false);
  });

  it('prefab save still strips authoringLayerId; place path uses Active separately', () => {
    const world = new World({ name: 'PrefabStrip' });
    const props = world.authoringLayers.layers.find((l) => l.name === 'Props').id;
    const actor = makeBrush('P', props);
    world.addActor(actor);
    const result = createPrefabFromActors(world, [actor.id], { name: 'P' });
    expect(result.ok).toBe(true);
    expect(result.definition.actors[0].authoringLayerId).toBeUndefined();
  });

  it('acceptance-layers round-trips membership', () => {
    const levelPath = path.join(rootDir, 'public/levels/acceptance-layers.json');
    expect(existsSync(levelPath)).toBe(true);
    const raw = JSON.parse(readFileSync(levelPath, 'utf8'));
    const world = deserializeLevel(raw);
    const json = serializeLevel(world);
    expect(json.authoringLayers.layers.length).toBe(raw.authoringLayers.layers.length);
    for (const actor of json.actors) {
      if (actor.authoringLayerId) {
        expect(resolveAuthoringLayerId(json.authoringLayers, actor.authoringLayerId))
          .toBe(actor.authoringLayerId);
      }
    }
  });
});
