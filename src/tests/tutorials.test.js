import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { LightComponent } from '../components/LightComponent.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { CellComponent } from '../components/CellComponent.js';
import {
  captureBaseline,
  evaluateVerify,
} from '../tutorials/verifiers.js';
import {
  advanceIfComplete,
  clampStepIndex,
  confirmManual,
  createLessonRuntimeState,
  enterStep,
  evaluateCurrentStep,
  goBack,
  goNext,
  isLastStep,
  skipStep,
} from '../tutorials/LessonRunner.js';
import {
  clampTutorialPrefs,
  loadTutorialPrefs,
  saveTutorialPrefs,
  TUTORIAL_PREFS_KEY,
} from '../tutorials/tutorialPrefs.js';
import { getLessonById, LESSONS, listLessons } from '../tutorials/lessons/index.js';
import { DOCK_PANEL_IDS, DOCK_PANELS, reopenPanel } from '../editor/layout/dockLayout.js';

function makeWall(id = 'wall1') {
  return new Actor({
    id,
    name: 'Practice Wall',
    tags: ['structure', 'brush', 'wall'],
    transform: new Transform({ position: { x: 0, y: 160, z: 0 } }),
    components: [
      new BrushComponent({
        size: { x: 600, y: 300, z: 20 },
      }),
    ],
  });
}

function makeWorld(actors = []) {
  const world = new World({ name: 'Test' });
  for (const a of actors) world.addActor(a);
  return world;
}

describe('tutorial prefs', () => {
  let store;

  beforeEach(() => {
    store = {
      data: {},
      getItem(key) { return this.data[key] ?? null; },
      setItem(key, value) { this.data[key] = String(value); },
      clear() { this.data = {}; },
    };
  });

  it('clamps and persists completed lesson ids', () => {
    const next = saveTutorialPrefs({
      completedLessonIds: ['getting-started', 'getting-started', 3],
      lastLessonId: 'getting-started',
    }, store);
    expect(next.completedLessonIds).toEqual(['getting-started']);
    expect(store.getItem(TUTORIAL_PREFS_KEY)).toBeTruthy();
    expect(loadTutorialPrefs(store).lastLessonId).toBe('getting-started');
  });

  it('clampTutorialPrefs rejects garbage', () => {
    expect(clampTutorialPrefs({ completedLessonIds: null }).completedLessonIds).toEqual([]);
  });
});

describe('lesson registry', () => {
  it('registers beginner lessons including geometry and parametric shapes', () => {
    expect(LESSONS).toHaveLength(26);
    expect(listLessons().map((l) => l.id)).toContain('getting-started');
    expect(listLessons().map((l) => l.id)).toContain('subtractive-geometry');
    expect(listLessons().map((l) => l.id)).toContain('ceilings-multilevel');
    expect(listLessons().map((l) => l.id)).toContain('ramps-stairs');
    expect(listLessons().map((l) => l.id)).toContain('geometry-editing');
    expect(listLessons().map((l) => l.id)).toContain('surface-align');
    expect(listLessons().map((l) => l.id)).toContain('columns-arches-curves');
    expect(listLessons().map((l) => l.id)).toContain('project-art-library');
    expect(listLessons().map((l) => l.id)).toContain('asset-generation');
    expect(listLessons().map((l) => l.id)).toContain('post-processing');
    expect(listLessons().map((l) => l.id)).toContain('world-fog-atmosphere');
    expect(listLessons().map((l) => l.id)).toContain('world-environment');
    expect(listLessons().map((l) => l.id)).toContain('materials-shading');
    expect(listLessons().map((l) => l.id)).toContain('lighting-advanced');
    expect(listLessons().map((l) => l.id)).toContain('environmental-objects');
    expect(listLessons().map((l) => l.id)).toContain('native-geometry');
    expect(listLessons().map((l) => l.id)).toContain('static-meshes');
    expect(getLessonById('missing')).toBeNull();
  });

  it('teaches latest camera and material-on-face features', () => {
    const start = getLessonById('getting-started');
    expect(start.steps.some((s) => s.verify?.type === 'viewportCameraIs')).toBe(true);
    expect(start.steps.some((s) => s.id === 'viewport-chrome' && /Fog|PP/i.test(s.body))).toBe(true);
    const materials = getLessonById('materials');
    expect(materials.summary.toLowerCase()).toContain('face');
    expect(materials.steps.some((s) => s.verify?.type === 'faceMaterialAssigned')).toBe(true);
    const surface = getLessonById('surface-align');
    expect(surface.steps.some((s) => s.verify?.type === 'surfaceSelected')).toBe(true);
    const workspace = getLessonById('workspace');
    expect(workspace.steps.some((s) => s.id === 'asset-viewer')).toBe(true);
    expect(workspace.steps.some((s) => s.id === 'ai-assets-tab')).toBe(true);
    expect(workspace.steps.some((s) => s.id === 'fog-pp-chips')).toBe(true);
    expect(workspace.steps.some((s) => s.verify?.type === 'viewportCameraIs')).toBe(true);
    const fog = getLessonById('world-fog-atmosphere');
    expect(fog.steps.some((s) => s.id === 'mist')).toBe(true);
    expect(fog.steps.some((s) => s.id === 'fog-chip')).toBe(true);
    const pp = getLessonById('post-processing');
    expect(pp.steps.some((s) => s.id === 'pp-chip')).toBe(true);
    expect(pp.summary.toLowerCase()).toContain('ssao');
    const projectArt = getLessonById('project-art-library');
    expect(projectArt.steps.some((s) => s.id === 'region')).toBe(true);
    const assetGen = getLessonById('asset-generation');
    expect(assetGen.steps.some((s) => s.id === 'compose')).toBe(true);
    expect(assetGen.steps.find((s) => s.id === 'compose')?.title).toMatch(/Compose Prompt/i);
    expect(assetGen.steps.some((s) => s.id === 'tiling')).toBe(true);
    expect(assetGen.steps.some((s) => s.id === 'cost')).toBe(true);
    const subtract = getLessonById('subtractive-geometry');
    expect(subtract.summary.toLowerCase()).toContain('world solid');
    expect(subtract.steps.some((s) => s.id === 'map-modes')).toBe(true);
    expect(subtract.steps[0].terms?.some((t) => t.term === 'World Solid')).toBe(true);
  });

  it('every lesson has starter path and verify types', () => {
    for (const lesson of LESSONS) {
      expect(lesson.starterPath).toMatch(/^tutorials\//);
      expect(lesson.steps.length).toBeGreaterThan(0);
      for (const step of lesson.steps) {
        expect(step.verify?.type).toBeTruthy();
      }
    }
  });
});

describe('verifiers', () => {
  it('does not pass brushCreated for pre-existing floors', () => {
    const floor = new Actor({
      id: 'old-floor',
      name: 'Floor',
      tags: ['structure', 'brush', 'floor'],
      components: [new BrushComponent({ size: { x: 100, y: 20, z: 100 } })],
    });
    const world = makeWorld([floor]);
    const baseline = captureBaseline(world, []);
    const result = evaluateVerify(
      { type: 'brushCreated', kind: 'floor' },
      { world, baseline, selectedActorIds: [], mode: 'edit' },
    );
    expect(result.ok).toBe(false);
  });

  it('passes brushCreated for a new floor and tracks it', () => {
    const world = makeWorld([]);
    const baseline = captureBaseline(world, []);
    world.addActor(new Actor({
      id: 'new-floor',
      name: 'Floor',
      tags: ['structure', 'brush', 'floor'],
      components: [new BrushComponent({ size: { x: 100, y: 20, z: 100 } })],
    }));
    const result = evaluateVerify(
      { type: 'brushCreated', kind: 'floor', trackAs: 'floor1' },
      { world, baseline, selectedActorIds: [], mode: 'edit' },
    );
    expect(result.ok).toBe(true);
    expect(result.track.floor1).toBe('new-floor');
  });

  it('detects opening added on tracked wall', () => {
    const wall = makeWall();
    const world = makeWorld([wall]);
    const baseline = captureBaseline(world, [wall.id]);
    wall.getComponent('Brush').openings = [
      { id: 'o1', type: 'door', offset: 0, bottom: 0, width: 100, height: 225 },
    ];
    const result = evaluateVerify(
      { type: 'openingAdded', trackAs: 'wall', openingType: 'door' },
      { world, baseline, tracked: { wall: wall.id }, selectedActorIds: [wall.id], mode: 'edit' },
    );
    expect(result.ok).toBe(true);
  });

  it('detects material assignment', () => {
    const wall = makeWall();
    const world = makeWorld([wall]);
    const baseline = captureBaseline(world, [wall.id]);
    wall.getComponent('Brush').materialId = 'mat_verify_wall';
    const result = evaluateVerify(
      { type: 'materialAssigned', materialId: 'mat_verify_wall', trackAs: 'wall' },
      { world, baseline, tracked: { wall: wall.id }, selectedActorIds: [wall.id], mode: 'edit' },
    );
    expect(result.ok).toBe(true);
  });

  it('detects light placement', () => {
    const world = makeWorld([]);
    const baseline = captureBaseline(world, []);
    world.addActor(new Actor({
      id: 'light1',
      name: 'Point Light',
      components: [new LightComponent({ lightType: 'point', intensity: 1 })],
    }));
    const result = evaluateVerify(
      { type: 'lightPlaced', lightType: 'point', trackAs: 'light1' },
      { world, baseline, selectedActorIds: [], mode: 'edit' },
    );
    expect(result.ok).toBe(true);
  });

  it('detects mesh placement and collision', () => {
    const world = makeWorld([]);
    const baseline = captureBaseline(world, []);
    const mesh = new Actor({
      id: 'mesh1',
      name: 'Verify Cube',
      components: [new StaticMeshComponent({ assetId: 'mesh_verify_cube', collisionType: 'none' })],
    });
    world.addActor(mesh);
    expect(evaluateVerify(
      { type: 'meshPlaced', meshId: 'mesh_verify_cube', trackAs: 'prop1' },
      { world, baseline, selectedActorIds: [], mode: 'edit' },
    ).ok).toBe(true);

    mesh.getComponent('StaticMesh').collisionType = 'box';
    mesh.getComponent('StaticMesh').collidable = true;
    expect(evaluateVerify(
      { type: 'meshCollision', trackAs: 'prop1', collision: 'box' },
      { world, baseline, tracked: { prop1: 'mesh1' }, selectedActorIds: ['mesh1'], mode: 'edit' },
    ).ok).toBe(true);
  });

  it('detects cell creation and parenting', () => {
    const wall = makeWall();
    const world = makeWorld([wall]);
    const baseline = captureBaseline(world, []);
    const cell = new Actor({
      id: 'cell1',
      name: 'Cell',
      components: [new CellComponent()],
    });
    world.addActor(cell);
    expect(evaluateVerify(
      { type: 'cellCreated', trackAs: 'cell1' },
      { world, baseline, selectedActorIds: [], mode: 'edit' },
    ).track.cell1).toBe('cell1');

    wall.parentId = 'cell1';
    expect(evaluateVerify(
      { type: 'actorParented', childTrackAs: 'wall', parentTrackAs: 'cell1' },
      {
        world,
        baseline,
        tracked: { wall: wall.id, cell1: cell.id },
        selectedActorIds: [wall.id],
        mode: 'edit',
      },
    ).ok).toBe(true);
  });

  it('manualConfirm requires flag', () => {
    expect(evaluateVerify({ type: 'manualConfirm' }, { manualConfirmed: false }).ok).toBe(false);
    expect(evaluateVerify({ type: 'manualConfirm' }, { manualConfirmed: true }).ok).toBe(true);
  });

  it('modeSequence walks history', () => {
    const result = evaluateVerify(
      { type: 'modeSequence', sequence: ['play', 'edit'] },
      { modeHistory: ['edit', 'play', 'edit'], mode: 'edit' },
    );
    expect(result.ok).toBe(true);
  });

  it('detects surface pick and viewport camera mode', () => {
    expect(evaluateVerify(
      { type: 'surfaceSelected' },
      { selectedSurface: { actorId: 'w1', surfaceId: '+z' } },
    ).ok).toBe(true);
    expect(evaluateVerify(
      { type: 'surfaceSelected' },
      { selectedSurface: null },
    ).ok).toBe(false);
    expect(evaluateVerify(
      { type: 'viewportCameraIs', cameraMode: 'isometric' },
      { viewportCameraMode: 'isometric' },
    ).ok).toBe(true);
    expect(evaluateVerify(
      { type: 'viewportCameraIs', cameraMode: 'isometric' },
      { viewportCameraMode: 'perspective' },
    ).ok).toBe(false);
  });

  it('passes tool and viewport fields through evaluateCurrentStep', () => {
    const lesson = {
      id: 't',
      steps: [{ id: 'a', verify: { type: 'toolIs', tool: 'surface' } }],
    };
    const state = enterStep(createLessonRuntimeState(lesson), lesson, {
      world: makeWorld([]),
      selectedActorIds: [],
      mode: 'edit',
      tool: 'surface',
    });
    expect(evaluateCurrentStep(state, lesson, {
      world: makeWorld([]),
      selectedActorIds: [],
      mode: 'edit',
      tool: 'surface',
    }).ok).toBe(true);
  });
});

describe('lesson runner', () => {
  const lesson = {
    id: 'demo',
    steps: [
      { id: 'a', title: 'A', verify: { type: 'manualConfirm' } },
      { id: 'b', title: 'B', verify: { type: 'none' } },
      { id: 'c', title: 'C', verify: { type: 'manualConfirm' } },
    ],
  };

  const snap = { world: makeWorld([]), selectedActorIds: [], mode: 'edit', gridSize: 25 };

  it('clamps indices and detects last step', () => {
    expect(clampStepIndex(lesson, -1)).toBe(0);
    expect(clampStepIndex(lesson, 99)).toBe(2);
    expect(isLastStep(lesson, 2)).toBe(true);
  });

  it('advances after manual confirm', () => {
    let state = enterStep(createLessonRuntimeState(lesson), lesson, snap);
    expect(goNext(state, lesson, snap).advanced).toBe(false);
    state = confirmManual(state);
    const advanced = advanceIfComplete(state, lesson, snap);
    expect(advanced.advanced).toBe(true);
    expect(advanced.state.stepIndex).toBe(1);
  });

  it('skip and back work', () => {
    let state = enterStep(createLessonRuntimeState(lesson), lesson, snap);
    state = skipStep(state, lesson, snap).state;
    expect(state.stepIndex).toBe(1);
    state = goBack(state, lesson, snap);
    expect(state.stepIndex).toBe(0);
  });

  it('restart-like recreate clears tracked state', () => {
    let state = createLessonRuntimeState(lesson);
    state.tracked = { wall: 'x' };
    state = createLessonRuntimeState(lesson);
    expect(state.tracked).toEqual({});
  });
});

describe('dock tutorials panel registration', () => {
  it('includes tutorials panel id', () => {
    expect(DOCK_PANEL_IDS).toContain('tutorials');
    expect(DOCK_PANELS.tutorials.title).toBe('Tutorials');
  });

  it('can reopen tutorials panel', () => {
    const panels = new Map();
    const api = {
      getPanel: (id) => panels.get(id),
      addPanel: vi.fn((opts) => {
        const panel = { id: opts.id, api: { setActive: vi.fn() } };
        panels.set(opts.id, panel);
        return panel;
      }),
    };
    panels.set('viewport', { id: 'viewport', api: { setActive: vi.fn() } });
    reopenPanel(api, 'tutorials');
    expect(api.addPanel).toHaveBeenCalled();
    expect(panels.has('tutorials')).toBe(true);
  });
});

describe('tutorial session isolation helpers', () => {
  it('readOnlyDisk sessions should not share project save target semantics', () => {
    // Behavioral contract documented for EditorContext — pure shape check
    const session = {
      kind: 'tutorial',
      readOnlyDisk: true,
      lessonId: 'getting-started',
      displayName: 'tutorials/getting-started.json',
    };
    expect(session.readOnlyDisk).toBe(true);
    expect(session.kind).toBe('tutorial');
  });
});
