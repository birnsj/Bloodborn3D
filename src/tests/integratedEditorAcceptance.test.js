// @vitest-environment jsdom
/**
 * Regression coverage for Pre-Batch 8 integrated editor acceptance findings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const io = vi.hoisted(() => ({
  levels: {},
  loadLevelFile: null,
  saveLevelFile: null,
  listLevels: null,
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
    registry: {
      schemaVersion: 1,
      assets: [
        {
          id: 'mesh_verify_cube',
          kind: 'mesh',
          name: 'Verify Cube',
          folder: 'Meshes',
          path: 'meshes/mesh_verify_cube.glb',
          meta: { defaultContentOffset: { x: 0, y: 75, z: 0 } },
        },
      ],
    },
    savePrefabDefinition: async () => null,
    getPrefabDefinition: async () => null,
    getPrefabDefinitionSync: () => null,
  },
}));
vi.mock('../editor/assets/AssetBrowserContext.jsx', () => ({
  useAssetBrowser: () => assetBrowser.value,
}));

vi.mock('../runtime/SceneView.js', async () => {
  const THREE = await import('three');
  class FakeSceneView {
    constructor() {
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
      this.selectedActorIds = [];
      this.gizmo = { setVisible() {} };
    }
    syncFromWorld() {}
    syncIncremental() {}
    setEditMode() {}
    setSelection() {}
    setGridSize() {}
    setAssetResolver() {}
    setSize() {}
    setTransformMode() {}
    setPivotEditMode() {}
    setSurfaceSelection() {}
    setGeometrySelection() {}
    applyWorldScene() {}
    applyPostProcessing() {}
    getStaticMeshSlots() { return []; }
    render() {}
    dispose() {}
  }
  return { SceneView: FakeSceneView };
});

vi.mock('../runtime/PlayerController.js', async () => {
  const THREE = await import('three');
  class FakePlayerController {
    constructor() {
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

const latest = { editor: null };
function Probe({ capture }) {
  capture(useEditor(), useEditorDialogs());
  return null;
}
const capture = (editorValue) => { latest.editor = editorValue; };
const editor = () => latest.editor;

let container;
let root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  io.levels = {
    'test-room.json': makeLevel('Test Room', ['a', 'b', 'c']),
  };
  assetBrowser.value.registry.assets[0].meta.defaultContentOffset = { x: 0, y: 75, z: 0 };
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(h(EditorDialogProvider, null, h(EditorProvider, null, h(Probe, { capture }))));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

describe('integrated editor acceptance regressions', () => {
  it('selectActor updates selection for immediate material apply (no render wait)', async () => {
    await mount();
    // Intentionally no act() around select+apply — mirrors harness / rapid UI sequences.
    editor().selectActor('b');
    editor().applySelectedMaterialToBrush('mat_batch2_metal');
    expect(editor().world.getActor('b').getComponent('Brush').materialId).toBe('mat_batch2_metal');
    expect(editor().world.getActor('a').getComponent('Brush').materialId).not.toBe('mat_batch2_metal');
  });

  it('placeMeshAsset inherits live registry defaultContentOffset over stale asset meta', async () => {
    await mount();
    const staleAsset = {
      id: 'mesh_verify_cube',
      name: 'Verify Cube',
      meta: { defaultContentOffset: { x: 0, y: 50, z: 0 } },
    };
    let placed = null;
    await act(async () => {
      placed = editor().placeMeshAsset(staleAsset, { x: 0, y: 50, z: 0 }, { collidable: true });
    });
    expect(placed).toBeTruthy();
    expect(placed.contentOffset).toEqual({ x: 0, y: 75, z: 0 });
  });

  it('ships mansion duplicate, harness module, acceptance doc, and preserves original mansion', () => {
    expect(existsSync(path.join(rootDir, 'public/levels/acceptance-integrated-editor.json'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'src/dev/integratedEditorAcceptance.js'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'docs/ACCEPTANCE_INTEGRATED_EDITOR.md'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'docs/acceptance-integrated-editor/01-furnished-mansion-overview.png'))).toBe(true);
    const orig = JSON.parse(readFileSync(path.join(rootDir, 'public/levels/acceptance-gothic-mansion.json'), 'utf8'));
    const dup = JSON.parse(readFileSync(path.join(rootDir, 'public/levels/acceptance-integrated-editor.json'), 'utf8'));
    expect(orig.name).toBe('Gothic Mansion Acceptance');
    expect(orig.actors.length).toBe(35);
    expect(dup.name).not.toBe(orig.name);
    expect(dup.actors.length).toBeGreaterThanOrEqual(orig.actors.length);
  });
});
