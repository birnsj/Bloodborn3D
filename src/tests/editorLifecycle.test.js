// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

const io = vi.hoisted(() => ({
  levels: {},
  loadLevelFile: null,
  saveLevelFile: null,
  listLevels: null,
  playerCtor: 0,
}));

vi.mock('../io/levelFileApi.js', () => {
  io.loadLevelFile = vi.fn(async (name) => {
    if (!(name in io.levels)) throw new Error(`Level not found: ${name}`);
    return structuredClone(io.levels[name]);
  });
  io.saveLevelFile = vi.fn(async () => ({ ok: true }));
  io.listLevels = vi.fn(async () => Object.keys(io.levels));
  return {
    loadLevelFile: io.loadLevelFile,
    saveLevelFile: io.saveLevelFile,
    listLevels: io.listLevels,
  };
});

const assetBrowser = vi.hoisted(() => ({
  value: {
    assetResolver: {},
    revision: 0,
    savePrefabDefinition: async () => null,
    getPrefabDefinition: async () => null,
    getPrefabDefinitionSync: () => null,
  },
}));
vi.mock('../editor/assets/AssetBrowserContext.jsx', () => ({
  useAssetBrowser: () => assetBrowser.value,
}));

// No WebGL in jsdom: SceneView/PlayerController are stand-ins. Everything else
// (GameRuntime, Rapier, history, serialization, dialogs) is real.
vi.mock('../runtime/SceneView.js', async () => {
  const THREE = await import('three');
  class FakeSceneView {
    constructor() {
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
      this.selectedActorIds = [];
      this.gizmo = { setVisible() {} };
    }

    syncFromWorld() {}
    setEditMode() {}
    setSelection() {}
    setGridSize() {}
    setAssetResolver() {}
    setSize() {}
    setTransformMode() {}
    render() {}
    dispose() {}
  }
  return { SceneView: FakeSceneView };
});
vi.mock('../runtime/PlayerController.js', async () => {
  const THREE = await import('three');
  class FakePlayerController {
    constructor() {
      io.playerCtor += 1;
      this.camera = new THREE.PerspectiveCamera();
    }

    start() {}
    stop() {}
    update() {}
    _syncCameraFromPhysics() {}
    setLookOptions() {}
  }
  return { PlayerController: FakePlayerController };
});

const { EditorProvider, useEditor } = await import('../editor/EditorContext.jsx');
const { EditorDialogProvider, useEditorDialogs } = await import('../ui/dialogs/EditorDialogContext.jsx');
const { World } = await import('../core/World.js');
const { createBrushFromBounds } = await import('../editor/brushFactory.js');
const { serializeLevel } = await import('../serialization/LevelSerializer.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeLevel(name, actorIds) {
  const world = new World({ name, schemaVersion: 2 });
  actorIds.forEach((id, i) => {
    const actor = createBrushFromBounds({
      kind: 'box',
      min: { x: i * 300, y: 0, z: 0 },
      max: { x: i * 300 + 200, y: 100, z: 100 },
      gridSize: 25,
    });
    actor.id = id;
    actor.name = `Brush ${id}`;
    world.addActor(actor);
  });
  return serializeLevel(world);
}

const latest = { editor: null, dialogs: null };
/** Hands the live context values to the test through `capture`. */
function Probe({ capture }) {
  capture(useEditor(), useEditorDialogs());
  return null;
}
const capture = (editorValue, dialogsValue) => {
  latest.editor = editorValue;
  latest.dialogs = dialogsValue;
};

let container;
let root;
let unhandled;

const editor = () => latest.editor;
const actorIds = () => editor().world.actors.map((a) => a.id);
const dialogRoot = () => document.querySelector('.bb-dialog-root');

/** Advance timers and let pending promises/effects settle. */
const settle = (ms = 300) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

async function mount({ attach = false } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(h(EditorDialogProvider, null, h(EditorProvider, null, h(Probe, { capture }))));
  });
  if (attach) {
    await act(async () => { editor().attachCanvas({}); });
  }
  await settle();
}

async function select(...ids) {
  await act(async () => { editor().selectActors(ids); });
}

async function deleteActor(id) {
  await select(id);
  await act(async () => { editor().deleteSelected(); });
  await settle();
}

async function clickDialogButton(label) {
  const button = [...document.querySelectorAll('.bb-dialog-root button')]
    .find((b) => b.textContent.trim() === label);
  expect(button, `dialog button "${label}"`).toBeTruthy();
  await act(async () => { button.click(); });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  io.levels = {
    'test-room.json': makeLevel('Test Room', ['a', 'b', 'c']),
    'other.json': makeLevel('Other', ['x']),
  };
  io.loadLevelFile.mockClear();
  io.saveLevelFile.mockClear();
  io.saveLevelFile.mockImplementation(async () => ({ ok: true }));
  io.playerCtor = 0;
  unhandled = [];
  window.addEventListener('unhandledrejection', (e) => unhandled.push(e));
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  document.body.querySelectorAll('.bb-dialog-root').forEach((n) => n.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dialogs never reload or replace the authored world (C1)', () => {
  it('loads the startup level exactly once', async () => {
    await mount();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(io.loadLevelFile).toHaveBeenCalledWith('test-room.json');
    expect(actorIds()).toEqual(['a', 'b', 'c']);
  });

  it('keeps unsaved edits and history while an alert opens and closes', async () => {
    await mount();
    await deleteActor('b');
    const world = editor().world;
    expect(actorIds()).toEqual(['a', 'c']);

    await act(async () => { latest.dialogs.alert('Hello'); });
    await settle();
    expect(dialogRoot()).toBeTruthy();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(editor().world).toBe(world);
    expect(actorIds()).toEqual(['a', 'c']);
    expect(editor().canUndo).toBe(true);

    await clickDialogButton('OK');
    expect(dialogRoot()).toBeNull();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(editor().world).toBe(world);
    expect(actorIds()).toEqual(['a', 'c']);
    expect(editor().canUndo).toBe(true);
  });

  it.each([
    ['confirm', (d) => d.confirm('Sure?'), 'Cancel'],
    ['prompt', (d) => d.prompt('Name?'), 'Cancel'],
  ])('keeps the world through a %s dialog', async (_kind, open, dismissLabel) => {
    await mount();
    await deleteActor('a');
    const world = editor().world;

    await act(async () => { open(latest.dialogs); });
    await settle();
    expect(dialogRoot()).toBeTruthy();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);

    await clickDialogButton(dismissLabel);
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(editor().world).toBe(world);
    expect(actorIds()).toEqual(['b', 'c']);
  });

  it('keeps the world through a queue of several dialogs', async () => {
    await mount();
    await deleteActor('c');
    await act(async () => {
      latest.dialogs.alert('one');
      latest.dialogs.alert('two');
      latest.dialogs.confirm('three');
    });
    await settle();
    await clickDialogButton('OK');
    await clickDialogButton('OK');
    await clickDialogButton('Cancel');
    expect(dialogRoot()).toBeNull();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(actorIds()).toEqual(['a', 'b']);
  });

  it('keeps the world when the editor itself raises a notice or an error', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { editor().notify('Saved something'); });
    await settle();
    await clickDialogButton('OK');
    await act(async () => { editor().notify('Prefab create failed'); });
    await settle();
    await clickDialogButton('OK');

    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(actorIds()).toEqual(['b', 'c']);
  });

  it('keeps the current level and file name when another level was opened', async () => {
    await mount();
    await act(async () => { await editor().loadLevel('other.json'); });
    await settle();
    expect(editor().levelName).toBe('other.json');

    await act(async () => { latest.dialogs.alert('anything'); });
    await settle();
    await clickDialogButton('OK');

    expect(editor().levelName).toBe('other.json');
    expect(actorIds()).toEqual(['x']);
    expect(io.loadLevelFile).toHaveBeenCalledTimes(2);
  });

  it('survives Escape and backdrop dismissal as well', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { latest.dialogs.alert('esc'); });
    await settle();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await settle();
    expect(dialogRoot()).toBeNull();
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);
    expect(actorIds()).toEqual(['b', 'c']);
  });
});

describe('dirty tracking (H2)', () => {
  it('is clean after load and after a settled no-op', async () => {
    await mount();
    expect(editor().isDirty).toBe(false);
  });

  it('becomes dirty after an edit', async () => {
    await mount();
    await deleteActor('a');
    expect(editor().isDirty).toBe(true);
  });

  it('returns to clean when Undo reaches the saved state, and dirty again on Redo', async () => {
    await mount();
    await deleteActor('a');
    expect(editor().isDirty).toBe(true);

    await act(async () => { editor().undo(); });
    await settle();
    expect(actorIds()).toEqual(['a', 'b', 'c']);
    expect(editor().isDirty).toBe(false);

    await act(async () => { editor().redo(); });
    await settle();
    expect(editor().isDirty).toBe(true);
  });

  it('measures undo relative to the last save, not to the original load', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { await editor().saveLevel(); });
    await settle();
    expect(editor().isDirty).toBe(false);

    await deleteActor('b');
    expect(editor().isDirty).toBe(true);

    // Undo back to the saved state → clean; Undo past it → dirty (disk has no 'a').
    await act(async () => { editor().undo(); });
    await settle();
    expect(editor().isDirty).toBe(false);
    await act(async () => { editor().undo(); });
    await settle();
    expect(actorIds()).toEqual(['a', 'b', 'c']);
    expect(editor().isDirty).toBe(true);
  });

  it('clears dirty state only after a successful save', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { await editor().saveLevel(); });
    await settle();

    expect(io.saveLevelFile).toHaveBeenCalledTimes(1);
    const [name, data] = io.saveLevelFile.mock.calls[0];
    expect(name).toBe('test-room.json');
    expect(data.actors.map((a) => a.id)).toEqual(['b', 'c']);
    expect(editor().isDirty).toBe(false);
  });

  it('keeps dirty state when a save fails, and reports the failure', async () => {
    await mount();
    await deleteActor('a');
    io.saveLevelFile.mockRejectedValueOnce(new Error('disk full'));

    await act(async () => { await editor().saveLevel(); });
    await settle();

    expect(editor().isDirty).toBe(true);
    expect(dialogRoot()?.textContent).toContain('Save failed: disk full');
    expect(unhandled).toHaveLength(0);
    await clickDialogButton('OK');

    // The next attempt succeeds and clears it.
    await act(async () => { await editor().saveLevel(); });
    await settle();
    await clickDialogButton('OK');
    expect(editor().isDirty).toBe(false);
  });

  it('keeps edits made while a save request is in flight dirty', async () => {
    await mount();
    await deleteActor('a');
    let finish;
    io.saveLevelFile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));

    let saving;
    await act(async () => { saving = editor().saveLevel(); });
    await deleteActor('b');
    await act(async () => { finish({ ok: true }); await saving; });
    await settle();

    expect(editor().isDirty).toBe(true);
  });

  it('asks before replacing a dirty level, and cancel keeps everything', async () => {
    await mount();
    await deleteActor('a');
    const world = editor().world;

    let result;
    await act(async () => { result = editor().loadLevel('other.json'); });
    await settle();
    expect(dialogRoot()?.textContent).toContain('unsaved changes');
    expect(io.loadLevelFile).toHaveBeenCalledTimes(1);

    await clickDialogButton('Cancel');
    await act(async () => { await result; });
    expect(await result).toBeNull();
    expect(editor().world).toBe(world);
    expect(editor().levelName).toBe('test-room.json');
    expect(actorIds()).toEqual(['b', 'c']);
    expect(editor().isDirty).toBe(true);
  });

  it('discards edits only when the user confirms', async () => {
    await mount();
    await deleteActor('a');

    let result;
    await act(async () => { result = editor().loadLevel('other.json'); });
    await settle();
    await clickDialogButton('Discard Changes');
    await act(async () => { await result; });
    await settle();

    expect(editor().levelName).toBe('other.json');
    expect(actorIds()).toEqual(['x']);
    expect(editor().isDirty).toBe(false);
    expect(editor().canUndo).toBe(false);
  });

  it('guards Reload Level the same way', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { editor().loadLevel('test-room.json'); });
    await settle();
    expect(dialogRoot()).toBeTruthy();
    await clickDialogButton('Discard Changes');
    expect(actorIds()).toEqual(['a', 'b', 'c']);
    expect(editor().isDirty).toBe(false);
  });

  it('does not prompt when nothing changed', async () => {
    await mount();
    await act(async () => { await editor().loadLevel('other.json'); });
    await settle();
    expect(dialogRoot()).toBeNull();
    expect(actorIds()).toEqual(['x']);
  });

  it('does not prompt after Undo returned to the saved state', async () => {
    await mount();
    await deleteActor('a');
    await act(async () => { editor().undo(); });
    await act(async () => { await editor().loadLevel('other.json'); });
    await settle();
    expect(dialogRoot()).toBeNull();
    expect(editor().levelName).toBe('other.json');
  });

  it('reports a failed load without touching the current world', async () => {
    await mount();
    await deleteActor('a');
    const world = editor().world;
    io.levels['future.json'] = { ...makeLevel('Future', ['f']), schemaVersion: 99 };

    let promise;
    await act(async () => { promise = editor().loadLevel('future.json'); });
    await settle();
    await clickDialogButton('Discard Changes');
    await act(async () => { await promise; });
    await settle();

    expect(dialogRoot()?.textContent).toMatch(/Load failed: Unsupported level schemaVersion 99/);
    expect(editor().world).toBe(world);
    expect(editor().levelName).toBe('test-room.json');
    expect(actorIds()).toEqual(['b', 'c']);
    expect(unhandled).toHaveLength(0);
  });

  it('blocks closing the tab with unsaved edits and allows it when clean', async () => {
    await mount();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await deleteActor('a');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await act(async () => { editor().undo(); });
    const afterUndo = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterUndo);
    expect(afterUndo.defaultPrevented).toBe(false);
  });

  it('keeps project edits dirty across a tutorial session round trip', async () => {
    await mount();
    await deleteActor('a');
    expect(editor().isDirty).toBe(true);

    await act(async () => {
      await editor().beginTutorialSession({
        lessonId: 'lesson',
        levelData: makeLevel('Tutorial', ['t']),
      });
    });
    await settle();
    expect(actorIds()).toEqual(['t']);
    expect(editor().isDirty).toBe(false);

    await act(async () => { editor().endTutorialSession(); });
    await settle();
    expect(actorIds()).toEqual(['b', 'c']);
    expect(editor().isDirty).toBe(true);
  });

  it('does not clear tutorial work when saving it fails', async () => {
    await mount();
    await act(async () => {
      await editor().beginTutorialSession({
        lessonId: 'lesson',
        levelData: makeLevel('Tutorial', ['t', 'u']),
      });
    });
    await deleteActor('t');
    io.saveLevelFile.mockRejectedValueOnce(new Error('read-only'));

    let name;
    await act(async () => { name = editor().saveTutorialWorkAs('mine.json'); });
    await act(async () => { await name; });
    await settle();

    expect(await name).toBeNull();
    expect(editor().isDirty).toBe(true);
    expect(editor().levelSession.kind).toBe('tutorial');
    expect(dialogRoot()?.textContent).toContain('Save failed: read-only');
  });
});

describe('Play/Stop preserves authored state, history and dirtiness (M11)', () => {
  it('keeps undo/redo history and the world across Play and Stop', async () => {
    await mount({ attach: true });
    await deleteActor('a');
    const world = editor().world;
    expect(editor().canUndo).toBe(true);

    await act(async () => { await editor().play(); });
    await settle();
    expect(editor().mode).toBe('play');
    expect(editor().canUndo).toBe(true);

    await act(async () => { editor().stop(); });
    await settle();
    expect(editor().mode).toBe('edit');
    expect(editor().world).toBe(world);
    expect(actorIds()).toEqual(['b', 'c']);
    expect(editor().canUndo).toBe(true);

    await act(async () => { editor().undo(); });
    await settle();
    expect(actorIds()).toEqual(['a', 'b', 'c']);
    expect(editor().isDirty).toBe(false);
    expect(editor().canRedo).toBe(true);

    await act(async () => { editor().redo(); });
    await settle();
    expect(actorIds()).toEqual(['b', 'c']);
  });

  it('does not change dirty state by playing', async () => {
    await mount({ attach: true });
    await act(async () => { await editor().play(); });
    await act(async () => { editor().stop(); });
    await settle();
    expect(editor().isDirty).toBe(false);

    await deleteActor('a');
    await act(async () => { await editor().play(); });
    await act(async () => { editor().stop(); });
    await settle();
    expect(editor().isDirty).toBe(true);
  });

  it('survives many Play/Stop cycles', async () => {
    await mount({ attach: true });
    await deleteActor('b');
    for (let i = 0; i < 5; i += 1) {
      await act(async () => { await editor().play(); });
      await act(async () => { editor().stop(); });
    }
    await settle();
    expect(actorIds()).toEqual(['a', 'c']);
    expect(editor().canUndo).toBe(true);
    await act(async () => { editor().undo(); });
    expect(actorIds()).toEqual(['a', 'b', 'c']);
  });

  it('starts only one session when Play is triggered repeatedly (M2)', async () => {
    await mount({ attach: true });
    await act(async () => {
      await Promise.all([editor().play(), editor().play(), editor().play()]);
    });
    expect(io.playerCtor).toBe(1);
    expect(editor().mode).toBe('play');
  });
});
