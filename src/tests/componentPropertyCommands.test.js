import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { LightComponent } from '../components/LightComponent.js';
import { StairComponent } from '../components/StairComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  SetLightPropertiesCommand,
  SetStairPropertiesCommand,
  SetWorldAmbientCommand,
} from '../editor/history/commands.js';
import {
  applyPlainComponentPatch,
  createComponentPropertiesCommandClass,
} from '../editor/history/componentPropertyCommands.js';
import {
  buildPropertyPatch,
  propertySnapshotsEqual,
  updateSelectedComponentProperties,
  commitSelectedComponentGesture,
} from '../editor/propertyEditing.js';

describe('componentPropertyCommands (C3 / F21)', () => {
  it('plain light patch undoes through HistoryStack', () => {
    const world = new World({ name: 'c3-light' });
    const actor = new Actor({
      id: 'lamp',
      components: [new LightComponent({ intensity: 1, color: '#ffffff' })],
    });
    world.addActor(actor);
    const history = new HistoryStack();
    history.execute(new SetLightPropertiesCommand({
      world,
      actorId: 'lamp',
      before: { intensity: 1 },
      after: { intensity: 2.5 },
      label: 'Brighten',
    }));
    expect(world.getActor('lamp').getComponent('Light').intensity).toBe(2.5);
    history.undo();
    expect(world.getActor('lamp').getComponent('Light').intensity).toBe(1);
  });

  it('stair surface-aware patch preserves UV and stepCount clamp', () => {
    const world = new World({ name: 'c3-stair' });
    world.addActor(new Actor({
      id: 's1',
      components: [new StairComponent({ stepCount: 8 })],
    }));
    const cmd = new SetStairPropertiesCommand({
      world,
      actorId: 's1',
      before: { stepCount: 8 },
      after: { stepCount: 0.4 },
    });
    cmd.do();
    expect(world.getActor('s1').getComponent('Stair').stepCount).toBe(1);
  });

  it('world ambient command invokes onApply', () => {
    const world = new World({ name: 'c3-amb' });
    const applied = [];
    const cmd = new SetWorldAmbientCommand({
      world,
      before: { color: '#3a4a68', intensity: 0.12, playIntensity: 0.12 },
      after: { color: '#112233', intensity: 0.5, playIntensity: 0.5 },
      onApply: (a) => applied.push(a.intensity),
    });
    cmd.do();
    expect(world.ambient.intensity).toBe(0.5);
    expect(applied).toEqual([0.5]);
    cmd.undo();
    expect(applied).toEqual([0.5, 0.12]);
  });

  it('factory produces classes that share the apply contract', () => {
    const Cmd = createComponentPropertiesCommandClass({
      componentType: 'Light',
      applyPatch: applyPlainComponentPatch,
      defaultLabel: 'X',
    });
    const world = new World({ name: 'c3-factory' });
    world.addActor(new Actor({
      id: 'a',
      components: [new LightComponent({ intensity: 1 })],
    }));
    const cmd = new Cmd({
      world,
      actorId: 'a',
      before: { intensity: 1 },
      after: { intensity: 3 },
    });
    cmd.do();
    expect(world.getActor('a').getComponent('Light').intensity).toBe(3);
  });
});

describe('propertyEditing helpers (C3 / F1)', () => {
  it('buildPropertyPatch and equality helpers', () => {
    const target = { a: 1, b: { c: 2 } };
    const { before, after } = buildPropertyPatch(target, { a: 9 });
    expect(before).toEqual({ a: 1 });
    expect(after).toEqual({ a: 9 });
    expect(propertySnapshotsEqual(before, { a: 1 })).toBe(true);
    expect(propertySnapshotsEqual(before, after)).toBe(false);
  });

  it('update + commit gesture records one undoable command', () => {
    const world = new World({ name: 'c3-gesture' });
    world.addActor(new Actor({
      id: 'lamp',
      components: [new LightComponent({ intensity: 1 })],
    }));
    const recorded = [];
    const light = world.getActor('lamp').getComponent('Light');
    const beforeSnapshot = { intensity: light.intensity };

    updateSelectedComponentProperties({
      world,
      mode: 'edit',
      selectedIds: ['lamp'],
      componentType: 'Light',
      partial: { intensity: 4 },
      options: { undoable: false },
      CommandClass: SetLightPropertiesCommand,
      isEditorActorLocked: () => false,
      rebuildActorVisual: () => {},
      bump: () => {},
    });
    expect(light.intensity).toBe(4);

    commitSelectedComponentGesture({
      world,
      mode: 'edit',
      selectedIds: ['lamp'],
      componentType: 'Light',
      beforeSnapshot,
      label: 'Scrub light',
      CommandClass: SetLightPropertiesCommand,
      recordCommand: (cmd) => recorded.push(cmd),
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].label).toBe('Scrub light');
    recorded[0].undo();
    expect(light.intensity).toBe(1);
  });
});
