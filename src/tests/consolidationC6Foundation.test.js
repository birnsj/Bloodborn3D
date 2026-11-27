/**
 * Consolidation C6 — foundation closure: API safety, shared-cache release,
 * Phase 2G generatorIntegration readiness (synthetic fixtures only).
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  AddActorsCommand,
  CompositeCommand,
  GENERATOR_INTEGRATION_CHECKLIST,
  createBrushFromBounds,
  createCellActor,
  stampAuthoringLayer,
  syncGeneratedWorld,
  validateWorldGeometry,
  assertWorldGeometry,
} from '../editor/generatorIntegration.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel, validateLevelGeometry } from '../serialization/LevelDeserializer.js';
import { normalizeAuthoringLayersState } from '../core/authoringLayers.js';
import { releaseSharedAssetCaches } from '../runtime/releaseSharedAssetCaches.js';
import {
  clearMeshCache,
  getMeshCacheSize,
  seedLoadedMeshScene,
} from '../runtime/meshLoader.js';
import {
  clearTextureCache,
  getTextureCacheSize,
} from '../runtime/materialFactory.js';
import {
  clearEnvironmentMapCache,
  getEnvironmentMapCacheSize,
} from '../runtime/environmentMapCache.js';
import {
  markSharedGpuResource,
} from '../runtime/gpuResources.js';
import {
  levelFileApiPlugin,
  resolveSafeLevelPath,
  LEVEL_JSON_BODY_LIMIT,
} from '../../vite-plugins/levelFileApi.js';
import { readMeshyStagingFile } from '../dev/meshy/meshySession.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEVELS_DIR = path.join(rootDir, 'public', 'levels');

function makeReq({ method = 'PUT', url = '/', host = 'localhost:5173', body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host };
  req.destroy = vi.fn();
  queueMicrotask(() => {
    if (body != null) req.emit('data', Buffer.from(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  const response = { statusCode: 0, body: '', headers: {} };
  return {
    response,
    res: {
      get statusCode() { return response.statusCode; },
      set statusCode(v) { response.statusCode = v; },
      setHeader: (k, v) => { response.headers[k] = v; },
      end: (b) => { response.body = b; },
    },
  };
}

async function withLevelHandler(fn) {
  let handler;
  levelFileApiPlugin().configureServer({
    middlewares: { use: (_route, h) => { handler = h; } },
  });
  return fn(handler);
}

describe('C6 level API safety', () => {
  it('rejects non-localhost hosts with 403', async () => {
    await withLevelHandler(async (handler) => {
      const { res, response } = makeRes();
      const req = makeReq({
        method: 'GET',
        url: '/',
        host: 'evil.example:5173',
      });
      await handler(req, res);
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).code).toBe('LOCALHOST_ONLY');
    });
  });

  it('rejects oversize PUT bodies with 413 and writes nothing', async () => {
    const name = 'zz-c6-body-limit.json';
    await withLevelHandler(async (handler) => {
      const { res, response } = makeRes();
      const huge = 'x'.repeat(LEVEL_JSON_BODY_LIMIT + 64);
      const req = makeReq({
        method: 'PUT',
        url: `/?name=${name}`,
        body: huge,
      });
      await handler(req, res);
      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.body).code).toBe('BODY_TOO_LARGE');
      expect(existsSync(path.join(LEVELS_DIR, name))).toBe(false);
    });
  });

  it('rejects invalid JSON with 400 and writes nothing', async () => {
    const name = 'zz-c6-bad-json.json';
    await withLevelHandler(async (handler) => {
      const { res, response } = makeRes();
      const req = makeReq({
        method: 'PUT',
        url: `/?name=${name}`,
        body: '{not-json',
      });
      await handler(req, res);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).code).toBe('INVALID_JSON');
      expect(existsSync(path.join(LEVELS_DIR, name))).toBe(false);
    });
  });

  it('resolveSafeLevelPath rejects traversal and non-json', () => {
    expect(() => resolveSafeLevelPath('../secret.json')).toThrow(/Invalid/);
    expect(() => resolveSafeLevelPath('foo.txt')).toThrow(/Invalid/);
    expect(resolveSafeLevelPath('test-room.json')).toContain(`${path.sep}levels${path.sep}`);
  });
});

describe('C6 meshy staging path containment', () => {
  const staging = path.join(rootDir, '.meshy-staging', 'c6-path-fixture');

  beforeEach(() => {
    mkdirSync(path.join(staging, 'refs'), { recursive: true });
    writeFileSync(path.join(staging, 'refs', 'ok.bin'), Buffer.from([1, 2, 3]));
  });

  afterEach(() => {
    rmSync(staging, { recursive: true, force: true });
  });

  it('reads contained relative paths', async () => {
    const buf = await readMeshyStagingFile(staging, 'refs/ok.bin');
    expect(Buffer.from(buf)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('rejects .. traversal', async () => {
    await expect(readMeshyStagingFile(staging, '../package.json'))
      .rejects.toMatchObject({ code: 'PATH_ESCAPE' });
  });
});

describe('C6 releaseSharedAssetCaches', () => {
  beforeEach(async () => {
    clearMeshCache({ dispose: true });
    await clearTextureCache();
    await clearEnvironmentMapCache({ dispose: true });
  });

  it('clears mesh cache entries after consumers are gone', async () => {
    const geom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markSharedGpuResource(new THREE.MeshBasicMaterial());
    const root = new THREE.Mesh(geom, mat);
    const disposeGeom = vi.spyOn(geom, 'dispose');
    seedLoadedMeshScene('c6://release.glb', root);
    expect(getMeshCacheSize()).toBe(1);

    const report = await releaseSharedAssetCaches();
    expect(report.before.meshes).toBe(1);
    expect(report.after.meshes).toBe(0);
    expect(report.after.textures).toBe(0);
    expect(report.after.environments).toBe(0);
    expect(getMeshCacheSize()).toBe(0);
    expect(getTextureCacheSize()).toBe(0);
    expect(getEnvironmentMapCacheSize()).toBe(0);
    expect(disposeGeom).toHaveBeenCalled();
  });
});

describe('C6 Phase 2G generatorIntegration readiness', () => {
  it('exposes a non-empty integration checklist', () => {
    expect(GENERATOR_INTEGRATION_CHECKLIST.length).toBeGreaterThanOrEqual(5);
    expect(GENERATOR_INTEGRATION_CHECKLIST.some((line) => /syncGeneratedWorld/i.test(line))).toBe(true);
  });

  it('builds candidates offline, validates, commits via history, undoes atomically', () => {
    const world = new World({ name: 'c6-gen', schemaVersion: 2 });
    world.authoringLayers = normalizeAuthoringLayersState({
      activeLayerId: 'layer_gen',
      layers: [
        { id: 'layer_gen', name: 'Generated', visible: true, locked: false, color: '#88aacc' },
      ],
    });
    const history = new HistoryStack();
    const beforeIds = new Set(world.actors.map((a) => a.id));

    // Offline candidate construction — no world mutation yet.
    const brush = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 100 },
      gridSize: 25,
      name: 'Gen Box',
    });
    const cell = createCellActor({ name: 'Gen Cell' });
    expect(beforeIds.has(brush.id)).toBe(false);
    expect(world.getActor(brush.id)).toBeFalsy();

    stampAuthoringLayer([brush, cell], world, 'layer_gen');
    brush.parentId = cell.id;

    const candidates = [cell, brush];
    const probe = new World({ name: 'probe' });
    for (const a of candidates) {
      probe.addActor(Actor.fromJSON(a.toJSON(), createComponentFromJSON));
    }
    const validation = validateWorldGeometry(probe);
    expect(validation.ok).toBe(true);

    history.execute(new AddActorsCommand({
      world,
      actorsJson: candidates.map((a) => a.toJSON()),
      label: 'C6 generate fixture',
    }));
    expect(world.getActor(brush.id)).toBeTruthy();
    expect(world.getActor(cell.id)).toBeTruthy();
    expect(world.getActor(brush.id).authoringLayerId).toBe('layer_gen');
    expect(world.getActor(brush.id).parentId).toBe(cell.id);

    // Save/reload round-trip preserves stable IDs + hierarchy.
    const json = serializeLevel(world);
    const reloaded = deserializeLevel(json);
    expect(reloaded.getActor(brush.id)?.parentId).toBe(cell.id);
    expect(validateLevelGeometry(json).ok).toBe(true);

    history.undo();
    expect(world.getActor(brush.id)).toBeFalsy();
    expect(world.getActor(cell.id)).toBeFalsy();
    expect(world.actors.every((a) => beforeIds.has(a.id) || beforeIds.size === 0)).toBe(true);
  });

  it('rejects invalid candidates without mutating the active world', () => {
    const world = new World({ name: 'c6-reject' });
    const actorCount = world.actors.length;
    const bad = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 100 },
      gridSize: 25,
    });
    // Corrupt after construction.
    bad.getComponent('Brush').size.y = -10;
    const probe = new World({ name: 'bad-probe' });
    probe.addActor(Actor.fromJSON(bad.toJSON(), createComponentFromJSON));
    expect(validateWorldGeometry(probe).ok).toBe(false);
    expect(() => assertWorldGeometry(probe, { context: 'C6' })).toThrow();
    expect(world.actors).toHaveLength(actorCount);
    expect(world.getActor(bad.id)).toBeFalsy();
  });

  it('syncGeneratedWorld asserts before sync (F14)', () => {
    const world = new World({ name: 'c6-sync' });
    const bad = createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 50, y: 50, z: 50 },
      gridSize: 25,
    });
    bad.getComponent('Brush').size.x = 0;
    world.addActor(bad);
    const sceneView = { syncFromWorld: vi.fn(), syncIncremental: vi.fn() };
    expect(() => syncGeneratedWorld(sceneView, world)).toThrow();
    expect(sceneView.syncFromWorld).not.toHaveBeenCalled();

    const good = new World({ name: 'c6-sync-ok' });
    good.addActor(createBrushFromBounds({
      kind: 'box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 50, y: 50, z: 50 },
      gridSize: 25,
    }));
    syncGeneratedWorld(sceneView, good);
    expect(sceneView.syncFromWorld).toHaveBeenCalledWith(good);
  });

  it('CompositeCommand undoes generated batches atomically', () => {
    const world = new World({ name: 'c6-composite' });
    const history = new HistoryStack();
    const a = createBrushFromBounds({
      kind: 'box', min: { x: 0, y: 0, z: 0 }, max: { x: 50, y: 50, z: 50 }, gridSize: 25, name: 'A',
    });
    const b = createBrushFromBounds({
      kind: 'box', min: { x: 100, y: 0, z: 0 }, max: { x: 150, y: 50, z: 50 }, gridSize: 25, name: 'B',
    });
    history.execute(new CompositeCommand({
      label: 'Gen batch',
      commands: [
        new AddActorsCommand({ world, actorsJson: [a.toJSON()] }),
        new AddActorsCommand({ world, actorsJson: [b.toJSON()] }),
      ],
    }));
    expect(world.getActor(a.id)).toBeTruthy();
    expect(world.getActor(b.id)).toBeTruthy();
    history.undo();
    expect(world.getActor(a.id)).toBeFalsy();
    expect(world.getActor(b.id)).toBeFalsy();
  });
});

describe('C6 persistence failure-path pointers', () => {
  it('shipped gothic and integrated levels still validate', () => {
    for (const name of ['acceptance-gothic-mansion.json', 'acceptance-integrated-editor.json']) {
      const raw = JSON.parse(readFileSync(path.join(LEVELS_DIR, name), 'utf8'));
      expect(validateLevelGeometry(raw).ok, name).toBe(true);
      expect(() => deserializeLevel(raw), name).not.toThrow();
    }
  });
});
