/**
 * Phase 2G prerequisite corrections — independent audit defects D1, D2, D3.
 *
 *  D1  additive brush carve invalidation (direct / ancestor / reparent / undo / redo)
 *  D2  subtractive complexity validated on load, save and Play (clear diagnostics)
 *  D3  geometry component payload validation before geometry or colliders exist
 */
import { afterAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  ReparentActorsCommand,
  SetTransformsCommand,
} from '../editor/history/commands.js';
import { getBrushRenderSolids } from '../runtime/brushGeometry.js';
import { MAX_SUBTRACT_SOLIDS } from '../runtime/brushBoolean.js';
import {
  assertLevelGeometry,
  deserializeLevel,
  validateLevelGeometry,
} from '../serialization/LevelDeserializer.js';
import {
  LevelGeometryValidationError,
  validateLevelPayloads,
  validateWorldGeometry,
  validateWorldSubtractLimits,
} from '../serialization/levelGeometryValidation.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { validateGeometryComponentPayload } from '../rules/geometryPayloadRules.js';
import { levelFileApiPlugin } from '../../vite-plugins/levelFileApi.js';
import { buildFlushWorld } from '../dev/phase2gSubtractiveScaleWorlds.js';

const { SceneView } = await import('../runtime/SceneView.js');
const { GameRuntime } = await import('../runtime/GameRuntime.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEVELS_DIR = path.join(ROOT, 'public/levels');

// If a regression ever lets the save API accept these, never leave them in public/levels.
const SAVE_PROBE_FILES = ['zz-phase2g-over-cap.json', 'zz-phase2g-bad-payload.json'];
afterAll(() => {
  for (const file of SAVE_PROBE_FILES) rmSync(path.join(LEVELS_DIR, file), { force: true });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function brushActor(name, {
  operation = 'add',
  size = { x: 100, y: 100, z: 100 },
  position,
  tags = [],
  parentId = null,
} = {}) {
  const actor = new Actor({ name, tags: [...tags], parentId });
  actor.addComponent(new BrushComponent({ size, operation }));
  if (position) actor.transform.position = { ...position };
  return actor;
}

function makeHarness() {
  const view = Object.create(SceneView.prototype);
  view._syncToken = 1;
  view._actorMeshes = new Map();
  view._actorEpochHighWater = new Map();
  view.selectedActorIds = [];
  view.selectedSurface = null;
  view.geometrySelection = null;
  view.editMode = true;
  view.gridSize = 25;
  view.root = new THREE.Group();
  view.syncStats = {
    fullSyncs: 0,
    incrementalSyncs: 0,
    actorAdds: 0,
    actorRemoves: 0,
    actorRebuilds: 0,
    transformUpdates: 0,
    hierarchyMoves: 0,
    geometryAllocs: 0,
    materialAllocs: 0,
  };
  view.applyWorldAmbient = () => {};
  view.setSelection = vi.fn();
  view._refreshSurfaceHighlight = vi.fn();
  view._applyEditorOverlayVisibility = vi.fn();
  view._clearGeometryFaceOverlays = () => {};
  view._clearSelectionHelpers = () => {};
  for (const key of [
    'clearWorldMeshes',
    '_createLight',
    '_stampActorVisual',
    '_detachChildActorGroups',
    '_isActorVisualCurrent',
    'updateActorTransform',
    'removeActorVisual',
    'rebuildActorVisual',
    '_populateActorComponents',
    '_syncActorHierarchy',
    'resetSyncStats',
    'getSyncStats',
    'syncIncremental',
    'syncFromWorld',
    '_addActorVisual',
  ]) {
    view[key] = SceneView.prototype[key];
  }
  // Records the carve the real brush visual would build from.
  view._addBrushVisual = (group, actor) => {
    const brush = actor.getComponent('Brush');
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.solidCount = getBrushRenderSolids(
      brush,
      actor.world ? { world: actor.world, actor } : null,
    ).solids.length;
    group.add(mesh);
  };
  for (const key of [
    '_addConvexBrushVisual', '_addRampVisual', '_addStairVisual',
    '_addColumnVisual', '_addArchVisual', '_addCurvedWallVisual',
  ]) {
    view[key] = view._addBrushVisual;
  }
  view._addStaticMeshVisual = () => {};
  return view;
}

/** Solid count baked into an actor's last-built visual. */
function builtSolids(view, actor) {
  let count = null;
  view._actorMeshes.get(actor.id).group.traverse((obj) => {
    if (obj.userData?.actorId === actor.id && obj.userData.solidCount != null) {
      count = obj.userData.solidCount;
    }
  });
  return count;
}

function liveSolids(actor) {
  return getBrushRenderSolids(actor.getComponent('Brush'), {
    world: actor.world,
    actor,
  }).solids.length;
}

const FAR = { x: 0, y: 100, z: 0 };
const ON_CUTTER = { x: 1000, y: 100, z: 0 };

function wallAndCutterWorld() {
  const world = new World({ name: 'D1', schemaVersion: 2 });
  const wall = brushActor('Wall', { size: { x: 400, y: 200, z: 50 }, position: FAR });
  const cutter = brushActor('Cutter', {
    operation: 'subtract',
    size: { x: 100, y: 100, z: 100 },
    position: { x: 1000, y: 50, z: 0 },
  });
  const bystander = brushActor('Bystander', { size: { x: 50, y: 50, z: 50 }, position: { x: -2000, y: 25, z: 0 } });
  world.addActor(wall);
  world.addActor(cutter);
  world.addActor(bystander);
  return { world, wall, cutter, bystander };
}

// ---------------------------------------------------------------------------
// D1
// ---------------------------------------------------------------------------

describe('Phase 2G D1 — additive carve invalidation', () => {
  let view;
  let ctx;

  beforeEach(() => {
    view = makeHarness();
    ctx = wallAndCutterWorld();
    view.syncFromWorld(ctx.world);
    view.resetSyncStats();
  });

  it('baseline: wall away from the cutter is uncarved', () => {
    expect(builtSolids(view, ctx.wall)).toBe(1);
    expect(liveSolids(ctx.wall)).toBe(1);
  });

  it('direct transform: moving an additive brush into a cutter re-carves only that brush', () => {
    const bystanderEpoch = view._actorMeshes.get(ctx.bystander.id).visualEpoch;
    ctx.wall.transform.position = { ...ON_CUTTER };
    view.syncIncremental(ctx.world);

    expect(liveSolids(ctx.wall)).toBeGreaterThan(1);
    expect(builtSolids(view, ctx.wall)).toBe(liveSolids(ctx.wall));
    const stats = view.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.actorRebuilds).toBe(1);
    expect(view._actorMeshes.get(ctx.bystander.id).visualEpoch).toBe(bystanderEpoch);
  });

  it('direct transform: rotating an additive brush re-carves it', () => {
    ctx.wall.transform.position = { ...ON_CUTTER };
    view.syncIncremental(ctx.world);
    const epoch = view._actorMeshes.get(ctx.wall.id).visualEpoch;
    // 45°: no longer axis-aligned to the cutter, so the cutter is skipped (uncarved).
    ctx.wall.transform.rotation = { x: 0, y: 45, z: 0 };
    view.syncIncremental(ctx.world);
    expect(view._actorMeshes.get(ctx.wall.id).visualEpoch).toBeGreaterThan(epoch);
    expect(builtSolids(view, ctx.wall)).toBe(liveSolids(ctx.wall));
    expect(builtSolids(view, ctx.wall)).toBe(1);
  });

  it('undo and redo of a move restore the matching carve (incremental only)', () => {
    const history = new HistoryStack({ limit: 20 });
    const before = ctx.wall.transform.toJSON();
    const after = { ...before, position: { ...ON_CUTTER } };

    history.execute(new SetTransformsCommand({
      world: ctx.world,
      changes: [{ actorId: ctx.wall.id, before, after }],
    }));
    view.syncIncremental(ctx.world);
    const carved = builtSolids(view, ctx.wall);
    expect(carved).toBeGreaterThan(1);

    history.undo();
    view.syncIncremental(ctx.world);
    expect(builtSolids(view, ctx.wall)).toBe(1);
    expect(builtSolids(view, ctx.wall)).toBe(liveSolids(ctx.wall));

    history.redo();
    view.syncIncremental(ctx.world);
    expect(builtSolids(view, ctx.wall)).toBe(carved);
    expect(view.getSyncStats().fullSyncs).toBe(0);
  });

  it('ancestor transform: moving a non-brush parent re-carves its additive child', () => {
    const { world, wall } = ctx;
    const parent = new Actor({ name: 'Group' });
    world.addActor(parent);
    wall.parentId = parent.id;
    view.syncFromWorld(world);
    view.resetSyncStats();
    expect(builtSolids(view, wall)).toBe(1);

    parent.transform.position = { x: 1000, y: 0, z: 0 };
    view.syncIncremental(world);

    expect(liveSolids(wall)).toBeGreaterThan(1);
    expect(builtSolids(view, wall)).toBe(liveSolids(wall));
    expect(view.getSyncStats().fullSyncs).toBe(0);
  });

  it('ancestor transform: a grandparent move re-carves a nested additive brush', () => {
    const { world, wall } = ctx;
    const grand = new Actor({ name: 'Grand' });
    const parent = new Actor({ name: 'Parent', parentId: grand.id });
    world.addActor(grand);
    world.addActor(parent);
    wall.parentId = parent.id;
    view.syncFromWorld(world);
    view.resetSyncStats();

    grand.transform.position = { x: 1000, y: 0, z: 0 };
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBe(liveSolids(wall));
    expect(builtSolids(view, wall)).toBeGreaterThan(1);
  });

  it('reparenting an additive brush re-carves it, and undo restores it', () => {
    const { world, wall } = ctx;
    const parent = new Actor({ name: 'Offset' });
    parent.transform.position = { x: 1000, y: 0, z: 0 };
    world.addActor(parent);
    view.syncFromWorld(world);
    view.resetSyncStats();

    const history = new HistoryStack({ limit: 20 });
    const transform = wall.transform.toJSON();
    history.execute(new ReparentActorsCommand({
      world,
      changes: [{
        actorId: wall.id,
        before: { parentId: null, transform },
        // Same local transform under an offset parent → the world pose changes.
        after: { parentId: parent.id, transform },
      }],
    }));
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBeGreaterThan(1);
    expect(builtSolids(view, wall)).toBe(liveSolids(wall));

    history.undo();
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBe(1);
    expect(view.getSyncStats().fullSyncs).toBe(0);
  });

  it('reparenting a cutter re-carves additive brushes', () => {
    const { world, wall, cutter } = ctx;
    wall.transform.position = { ...ON_CUTTER };
    cutter.transform.position = { x: 0, y: 50, z: 0 }; // starts far from the wall
    const parent = new Actor({ name: 'CutterRoot' });
    parent.transform.position = { x: 1000, y: 0, z: 0 };
    world.addActor(parent);
    view.syncFromWorld(world);
    view.resetSyncStats();
    expect(builtSolids(view, wall)).toBe(1);

    const transform = cutter.transform.toJSON();
    const history = new HistoryStack({ limit: 20 });
    history.execute(new ReparentActorsCommand({
      world,
      changes: [{
        actorId: cutter.id,
        before: { parentId: null, transform },
        after: { parentId: parent.id, transform },
      }],
    }));
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBeGreaterThan(1);

    history.undo();
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBe(1);
  });

  it('a cutter ancestor move still re-carves (existing behavior preserved)', () => {
    const { world, wall, cutter } = ctx;
    wall.transform.position = { ...ON_CUTTER };
    cutter.transform.position = { x: 0, y: 50, z: 0 };
    const parent = new Actor({ name: 'CutterRoot' });
    world.addActor(parent);
    cutter.parentId = parent.id;
    view.syncFromWorld(world);
    view.resetSyncStats();
    expect(builtSolids(view, wall)).toBe(1);

    parent.transform.position = { x: 1000, y: 0, z: 0 };
    view.syncIncremental(world);
    expect(builtSolids(view, wall)).toBeGreaterThan(1);
  });

  it('incremental sync is preserved: no cutters means a move is a transform update only', () => {
    const world = new World({ name: 'NoCutters', schemaVersion: 2 });
    const a = brushActor('A', { position: { x: 0, y: 50, z: 0 } });
    const b = brushActor('B', { position: { x: 500, y: 50, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    const v = makeHarness();
    v.syncFromWorld(world);
    v.resetSyncStats();

    a.transform.position = { x: 100, y: 50, z: 0 };
    v.syncIncremental(world);
    const stats = v.getSyncStats();
    expect(stats.fullSyncs).toBe(0);
    expect(stats.actorRebuilds).toBe(0);
    expect(stats.transformUpdates).toBe(1);
  });

  it('an unchanged world is a no-op even with cutters present', () => {
    view.syncIncremental(ctx.world);
    const stats = view.getSyncStats();
    expect(stats.actorRebuilds).toBe(0);
    expect(stats.transformUpdates).toBe(0);
  });
});

describe('Phase 2G D1 — editor-direct path (GameRuntime)', () => {
  function runtimeStub(world) {
    return {
      world,
      refreshBrush: vi.fn(),
      refreshBrushCarveDependents: vi.fn(),
    };
  }

  it('moving a non-brush parent re-carves additive descendants when a cutter exists', () => {
    const { world, wall } = wallAndCutterWorld();
    const parent = new Actor({ name: 'Group' });
    world.addActor(parent);
    wall.parentId = parent.id;
    const rt = runtimeStub(world);
    GameRuntime.prototype._refreshCarvedDescendants.call(rt, parent);
    expect(rt.refreshBrush).toHaveBeenCalledTimes(1);
    expect(rt.refreshBrush).toHaveBeenCalledWith(wall);
  });

  it('does nothing without cutters or without brush descendants', () => {
    const world = new World({ name: 'Plain', schemaVersion: 2 });
    const parent = new Actor({ name: 'Group' });
    const child = brushActor('Child', { parentId: parent.id });
    world.addActor(parent);
    world.addActor(child);
    const rt = runtimeStub(world);
    GameRuntime.prototype._refreshCarvedDescendants.call(rt, parent);
    expect(rt.refreshBrush).not.toHaveBeenCalled();

    const leaf = new Actor({ name: 'Leaf' });
    world.addActor(leaf);
    GameRuntime.prototype._refreshCarvedDescendants.call(rt, leaf);
    expect(rt.refreshBrush).not.toHaveBeenCalled();
  });

  it('a cutter under a moved parent triggers the full carve-dependents refresh', () => {
    const { world, cutter } = wallAndCutterWorld();
    const parent = new Actor({ name: 'Group' });
    world.addActor(parent);
    cutter.parentId = parent.id;
    const rt = runtimeStub(world);
    GameRuntime.prototype._refreshCarvedDescendants.call(rt, parent);
    expect(rt.refreshBrushCarveDependents).toHaveBeenCalledWith(cutter);
  });
});

// ---------------------------------------------------------------------------
// D2
// ---------------------------------------------------------------------------

/**
 * Subtractive world whose World Solid needs more than MAX_SUBTRACT_SOLIDS pieces.
 * Flush maze @ 200 rooms → 522 solids (product cap is 512).
 */
function overCapLevelData() {
  const world = buildFlushWorld(200);
  return { world, data: serializeLevel(world) };
}

describe('Phase 2G D2 — subtractive complexity validation', () => {
  it('keeps the product solid limit', () => {
    expect(MAX_SUBTRACT_SOLIDS).toBe(512);
  });

  it('the over-cap fixture really exceeds the cap (so the tests are meaningful)', () => {
    const { world } = overCapLevelData();
    const solid = world.actors.find((a) => a.tags.includes('world-solid'));
    const carved = getBrushRenderSolids(solid.getComponent('Brush'), { world, actor: solid });
    expect(carved.exceeded).toBe(true);
  });

  it('reports the offender, count, limit and cutter as structured diagnostics', () => {
    const { world } = overCapLevelData();
    const diagnostics = validateWorldSubtractLimits(world);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d.code).toBe('SUBTRACT_COMPLEXITY_EXCEEDED');
    expect(d.actorName).toBe('World Solid');
    expect(d.maxSolids).toBe(512);
    expect(d.solidCount).toBeGreaterThan(512);
    expect(d.offendingCutterId).toBeTruthy();
    expect(d.offendingCutterName).toBeTruthy();
    expect(d.message).toMatch(/World Solid/);
    expect(d.message).toMatch(/limit 512/);
  });

  it('loading rejects over-cap geometry instead of silently omitting cutters', () => {
    const { data } = overCapLevelData();
    let error;
    try {
      deserializeLevel(data);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(LevelGeometryValidationError);
    expect(error.message).toMatch(/World Solid/);
    expect(error.message).toMatch(/limit 512/);
    expect(error.diagnostics[0].code).toBe('SUBTRACT_COMPLEXITY_EXCEEDED');
  });

  it('trusted snapshots can opt out (Play/Stop restore path)', () => {
    const { data } = overCapLevelData();
    expect(() => deserializeLevel(data, { validateGeometry: false })).not.toThrow();
  });

  it('validateLevelGeometry returns diagnostics without throwing (generator API)', () => {
    const { data } = overCapLevelData();
    const result = validateLevelGeometry(data);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('SUBTRACT_COMPLEXITY_EXCEEDED');
    expect(() => assertLevelGeometry(data)).toThrow(LevelGeometryValidationError);
  });

  it('validateWorldGeometry covers an in-memory world (generator API)', () => {
    const { world } = overCapLevelData();
    const result = validateWorldGeometry(world);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('SUBTRACT_COMPLEXITY_EXCEEDED');
  });

  it('structurally invalid level JSON is reported, not thrown, by validateLevelGeometry', () => {
    const result = validateLevelGeometry({ schemaVersion: 2, actors: [{ id: 5 }] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('LEVEL_STRUCTURE_INVALID');
  });

  it('saving: the level file API refuses over-cap levels with 422 and writes nothing', async () => {
    const { data } = overCapLevelData();
    const name = 'zz-phase2g-over-cap.json';
    let handler;
    levelFileApiPlugin().configureServer({
      middlewares: { use: (_route, fn) => { handler = fn; } },
    });

    const req = new EventEmitter();
    req.method = 'PUT';
    req.url = `/?name=${name}`;
    const response = { headers: {}, statusCode: 0, body: '' };
    const res = {
      get statusCode() { return response.statusCode; },
      set statusCode(v) { response.statusCode = v; },
      setHeader: (k, v) => { response.headers[k] = v; },
      end: (b) => { response.body = b; },
    };
    const done = handler(req, res);
    req.emit('data', Buffer.from(JSON.stringify(data)));
    req.emit('end');
    await done;

    expect(response.statusCode).toBe(422);
    const payload = JSON.parse(response.body);
    expect(payload.error).toMatch(/limit 512/);
    expect(payload.diagnostics[0].code).toBe('SUBTRACT_COMPLEXITY_EXCEEDED');
    expect(existsSync(path.join(LEVELS_DIR, name))).toBe(false);
  });

  it('Play refuses over-cap geometry before touching physics', async () => {
    const { world } = overCapLevelData();
    const rt = {
      isPlayActive: false,
      world,
      _disposed: false,
      _playPending: false,
      _playToken: 0,
      physics: { init: vi.fn() },
      _abortPlaySession: vi.fn(),
    };
    await expect(GameRuntime.prototype.play.call(rt)).rejects.toThrow(/Play geometry is invalid/);
    expect(rt.physics.init).not.toHaveBeenCalled();
    expect(rt._abortPlaySession).toHaveBeenCalled();
    expect(rt._playPending).toBe(false);
  });

  it('all shipped levels pass geometry validation', () => {
    const files = readdirSync(LEVELS_DIR).filter((f) => f.endsWith('.json'));
    expect(files).toHaveLength(21);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(path.join(LEVELS_DIR, file), 'utf8'));
      const result = validateLevelGeometry(raw);
      expect(result.ok, `${file}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      expect(() => deserializeLevel(raw), file).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// D3
// ---------------------------------------------------------------------------

function levelWith(component, { name = 'Probe' } = {}) {
  return {
    schemaVersion: 2,
    name: 'D3',
    actors: [{
      id: 'actor_probe',
      name,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      components: [component],
    }],
  };
}

function brushJson(extra = {}) {
  return { type: 'Brush', size: { x: 100, y: 100, z: 100 }, ...extra };
}

describe('Phase 2G D3 — geometry payload validation', () => {
  const badBrushes = [
    ['missing size axis', { size: { x: 100, z: 100 } }, 'GEOMETRY_INVALID_SIZE'],
    ['null size axis', { size: { x: 100, y: null, z: 100 } }, 'GEOMETRY_INVALID_SIZE'],
    ['zero size', { size: { x: 100, y: 0, z: 100 } }, 'GEOMETRY_OUT_OF_RANGE'],
    ['negative size', { size: { x: -50, y: 100, z: 100 } }, 'GEOMETRY_OUT_OF_RANGE'],
    ['string size', { size: { x: 100, y: 100, z: 'abc' } }, 'GEOMETRY_NOT_FINITE'],
    ['numeric-string size', { size: { x: '100', y: 100, z: 100 } }, 'GEOMETRY_NOT_FINITE'],
    ['absurd size', { size: { x: 1e12, y: 100, z: 100 } }, 'GEOMETRY_OUT_OF_RANGE'],
    ['size as array', { size: [100, 100, 100] }, 'GEOMETRY_INVALID_SIZE'],
    ['unsupported operation', { operation: 'intersect' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
    ['miter at 90 degrees', { miterStart: 90 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['non-numeric miter', { miterEnd: 'wide' }, 'GEOMETRY_NOT_FINITE'],
    ['openings not an array', { openings: 'door' }, 'GEOMETRY_INVALID_OPENINGS'],
    ['opening with string width', { openings: [{ type: 'door', width: 'wide' }] }, 'GEOMETRY_NOT_FINITE'],
  ];

  it.each(badBrushes)('rejects Brush with %s', (_label, extra, code) => {
    const data = levelWith(brushJson(extra));
    const diagnostics = validateLevelPayloads(data);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((d) => d.code === code), JSON.stringify(diagnostics)).toBe(true);
    expect(diagnostics[0].actorId).toBe('actor_probe');
    expect(diagnostics[0].message).toMatch(/Probe/);
    expect(() => deserializeLevel(data)).toThrow(LevelGeometryValidationError);
  });

  it('rejects invalid payloads before any actor or component is constructed', () => {
    const spy = vi.spyOn(Actor, 'fromJSON');
    expect(() => deserializeLevel(levelWith(brushJson({ size: { x: 1e12, y: 1, z: 1 } }))))
      .toThrow(LevelGeometryValidationError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports every problem, not just the first', () => {
    const diagnostics = validateGeometryComponentPayload(brushJson({
      size: { x: -1, y: 'a', z: 0 },
      operation: 'xor',
    }));
    expect(diagnostics.length).toBeGreaterThanOrEqual(4);
  });

  it('preserves valid legacy content: absent fields use documented defaults', () => {
    const world = deserializeLevel(levelWith({ type: 'Brush' }));
    const brush = world.actors[0].getComponent('Brush');
    expect(brush.size).toEqual({ x: 300, y: 300, z: 20 });
    expect(brush.operation).toBe('add');
    expect(brush.miterStart).toBe(0);
  });

  it('accepts null for optional fields (legacy JSON) and both supported operations', () => {
    for (const operation of ['add', 'subtract', undefined, null]) {
      const data = levelWith(brushJson({
        operation,
        miterStart: null,
        miterEnd: undefined,
        openings: null,
      }));
      expect(validateLevelPayloads(data), String(operation)).toEqual([]);
    }
  });

  it('accepts a miter within range and a sane opening', () => {
    const data = levelWith(brushJson({
      miterStart: 45,
      miterEnd: -45,
      openings: [{ type: 'door', offset: -100, bottom: 0, width: 120, height: 220 }],
    }));
    expect(validateLevelPayloads(data)).toEqual([]);
    expect(() => deserializeLevel(data)).not.toThrow();
  });

  const badParametric = [
    ['Ramp', { rise: -5 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['Ramp', { direction: 'up' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
    ['Stair', { stepCount: 0 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['Stair', { stepCount: 2.5 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['Stair', { stairType: 'ladder' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
    ['Stair', { stepHeight: 'tall' }, 'GEOMETRY_NOT_FINITE'],
    ['Column', { radius: -1 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['Column', { shape: 'triangle' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
    ['Arch', { openingWidth: 1e9 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['Arch', { archType: 'ogee' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
    ['CurvedWall', { radius: 0 }, 'GEOMETRY_OUT_OF_RANGE'],
    ['CurvedWall', { sweepAngle: 'half' }, 'GEOMETRY_NOT_FINITE'],
    ['StaticMesh', { collisionType: 'trimesh' }, 'GEOMETRY_UNSUPPORTED_VALUE'],
  ];

  it.each(badParametric)('rejects %s payload %j', (type, extra, code) => {
    const diagnostics = validateLevelPayloads(levelWith({ type, ...extra }));
    expect(diagnostics.some((d) => d.code === code), JSON.stringify(diagnostics)).toBe(true);
    expect(() => deserializeLevel(levelWith({ type, ...extra }))).toThrow(LevelGeometryValidationError);
  });

  it('parametric components with absent fields keep their documented defaults', () => {
    for (const type of ['Ramp', 'Stair', 'Column', 'Arch', 'CurvedWall', 'StaticMesh']) {
      const data = levelWith({ type });
      expect(validateLevelPayloads(data), type).toEqual([]);
      expect(() => deserializeLevel(data), type).not.toThrow();
    }
    const stair = deserializeLevel(levelWith({ type: 'Stair' })).actors[0].getComponent('Stair');
    expect(stair.stepCount).toBe(8);
    expect(stair.stepHeight).toBe(20);
  });

  it('non-geometry components are not subject to payload rules', () => {
    expect(validateLevelPayloads(levelWith({ type: 'Light', intensity: 'bright' }))).toEqual([]);
    expect(validateLevelPayloads(levelWith({ type: 'PlayerSpawn' }))).toEqual([]);
  });

  it('validates live components of an in-memory world (generator path)', () => {
    const world = new World({ name: 'Gen', schemaVersion: 2 });
    const actor = new Actor({ name: 'Bad' });
    actor.addComponent(new BrushComponent({ size: { x: Number.NaN, y: 100, z: 100 } }));
    world.addActor(actor);
    const result = validateWorldGeometry(world);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('GEOMETRY_NOT_FINITE');
    // Payload problems short-circuit carving, which would be meaningless on NaN sizes.
    expect(result.diagnostics.every((d) => d.code !== 'SUBTRACT_COMPLEXITY_EXCEEDED')).toBe(true);
  });

  it('Play refuses malformed geometry before physics init (no colliders built)', async () => {
    const world = new World({ name: 'Gen', schemaVersion: 2 });
    const actor = new Actor({ name: 'Bad' });
    actor.addComponent(new BrushComponent({ size: { x: 100, y: -5, z: 100 } }));
    world.addActor(actor);
    const rt = {
      isPlayActive: false,
      world,
      _disposed: false,
      _playPending: false,
      _playToken: 0,
      physics: { init: vi.fn(), buildFromWorld: vi.fn() },
      _abortPlaySession: vi.fn(),
    };
    await expect(GameRuntime.prototype.play.call(rt)).rejects.toThrow(/Brush\.size\.y/);
    expect(rt.physics.init).not.toHaveBeenCalled();
    expect(rt.physics.buildFromWorld).not.toHaveBeenCalled();
  });

  it('saving: the level file API refuses malformed geometry with 422 and writes nothing', async () => {
    const name = 'zz-phase2g-bad-payload.json';
    let handler;
    levelFileApiPlugin().configureServer({
      middlewares: { use: (_route, fn) => { handler = fn; } },
    });
    const req = new EventEmitter();
    req.method = 'PUT';
    req.url = `/?name=${name}`;
    const response = { statusCode: 0, body: '' };
    const res = {
      get statusCode() { return response.statusCode; },
      set statusCode(v) { response.statusCode = v; },
      setHeader: () => {},
      end: (b) => { response.body = b; },
    };
    const done = handler(req, res);
    req.emit('data', Buffer.from(JSON.stringify(levelWith(brushJson({ size: { x: 100, y: 100 } })))));
    req.emit('end');
    await done;
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).diagnostics[0].code).toBe('GEOMETRY_INVALID_SIZE');
    expect(existsSync(path.join(LEVELS_DIR, name))).toBe(false);
  });
});
