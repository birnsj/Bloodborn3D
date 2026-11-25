import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';

const mocks = vi.hoisted(() => ({
  playerCtor: 0,
  playerStops: 0,
  renders: 0,
  playerUpdates: [],
}));

// WebGL is unavailable in node: SceneView and PlayerController are replaced by
// minimal stand-ins. Physics (Rapier) and GameRuntime itself are real.
vi.mock('../runtime/SceneView.js', async () => {
  const THREE = await import('three');
  class FakeSceneView {
    constructor() {
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
      this.camera.position.set(6, 5, 8);
      this.camera.lookAt(0, 1.5, 0);
      this.selectedActorIds = [];
      this.gizmo = { setVisible() {} };
      this.synced = 0;
    }

    syncFromWorld() { this.synced += 1; }
    syncIncremental() { this.synced += 1; }
    setEditMode() {}
    setSelection() {}
    setGridSize() {}
    setAssetResolver() {}
    setSize() {}
    render() { mocks.renders += 1; }
    dispose() {}
  }
  return { SceneView: FakeSceneView };
});

vi.mock('../runtime/PlayerController.js', async () => {
  const THREE = await import('three');
  class FakePlayerController {
    constructor() {
      mocks.playerCtor += 1;
      this.camera = new THREE.PerspectiveCamera();
    }

    start() {}
    stop() { mocks.playerStops += 1; }
    update(dt) { mocks.playerUpdates.push(dt); }
    _syncCameraFromPhysics() {}
    setLookOptions() {}
  }
  return { PlayerController: FakePlayerController };
});

const { GameRuntime } = await import('../runtime/GameRuntime.js');
const { deserializeLevel } = await import('../serialization/LevelDeserializer.js');
const { serializeLevel } = await import('../serialization/LevelSerializer.js');
const { ensureRapier } = await import('../runtime/PhysicsWorld.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function loadTestRoom() {
  return deserializeLevel(
    JSON.parse(readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8')),
  );
}

/** Controllable stand-ins for the browser's frame loop and page visibility. */
function installBrowserStubs() {
  const frames = new Map();
  let nextId = 1;
  const cancelled = [];
  const listeners = new Set();
  const fakeDocument = {
    hidden: false,
    addEventListener(type, fn) { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'visibilitychange') listeners.delete(fn); },
  };
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    cancelled.push(id);
    frames.delete(id);
  });
  return {
    frames,
    cancelled,
    listeners,
    setHidden(hidden) {
      fakeDocument.hidden = hidden;
      for (const fn of [...listeners]) fn();
    },
    /** Fire every queued frame once. */
    tick(now) {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, cb] of pending) cb(now);
    },
  };
}

describe('GameRuntime Play/Stop lifecycle', () => {
  let stubs;
  let runtime;

  beforeEach(async () => {
    await ensureRapier();
    mocks.playerCtor = 0;
    mocks.playerStops = 0;
    mocks.renders = 0;
    mocks.playerUpdates = [];
    stubs = installBrowserStubs();
    runtime = new GameRuntime({ canvas: {}, onModeChange: () => {} });
    runtime.setWorld(loadTestRoom());
  });

  afterEach(() => {
    runtime.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not start a second Play session while the first is initializing (M2)', async () => {
    const first = runtime.play();
    expect(runtime.isPlayActive).toBe(true);
    const second = runtime.play();
    const third = runtime.play();
    await Promise.all([first, second, third]);

    expect(mocks.playerCtor).toBe(1);
    expect(runtime.mode).toBe('play');
    expect(runtime.isPlayActive).toBe(true);
  });

  it('ignores Play when already playing (M2)', async () => {
    await runtime.play();
    await runtime.play();
    expect(mocks.playerCtor).toBe(1);
  });

  it('cancels a pending Play when Stop arrives before Rapier is ready (M2)', async () => {
    const pending = runtime.play();
    runtime.stop();
    await pending;

    expect(mocks.playerCtor).toBe(0);
    expect(runtime.mode).toBe('edit');
    expect(runtime.isPlayActive).toBe(false);
    expect(runtime.physics.world).toBeNull();
    // A later Play still works.
    await runtime.play();
    expect(runtime.mode).toBe('play');
  });

  it('cancels a pending Play when the world is replaced (M2)', async () => {
    const pending = runtime.play();
    runtime.setWorld(loadTestRoom());
    await pending;
    expect(mocks.playerCtor).toBe(0);
    expect(runtime.mode).toBe('edit');
    expect(runtime.physics.world).toBeNull();
  });

  it('frees every Rapier world exactly once across repeated Play/Stop cycles (M1)', async () => {
    const freeSpy = vi.spyOn(RAPIER.World.prototype, 'free');
    for (let i = 0; i < 5; i += 1) {
      await runtime.play();
      expect(runtime.physics.world).not.toBeNull();
      runtime.stop();
      expect(runtime.physics.world).toBeNull();
    }
    expect(freeSpy).toHaveBeenCalledTimes(5);
  });

  it('frees the Rapier world when Play is cancelled before it starts (M1)', async () => {
    const freeSpy = vi.spyOn(RAPIER.World.prototype, 'free');
    const pending = runtime.play();
    runtime.stop();
    await pending;
    expect(freeSpy).toHaveBeenCalledTimes(1);
  });

  it('restores the authored world with identical ids and transforms after Stop (M11)', async () => {
    const world = runtime.world;
    const before = serializeLevel(world);
    await runtime.play();

    // Simulated runtime damage that Stop must discard.
    world.getActor('actor_wall_north').transform.position.x += 500;
    world.removeActor('actor_wall_east');

    runtime.stop();
    expect(runtime.world).toBe(world);
    expect(serializeLevel(world)).toEqual(before);
  });

  it('restores the editor camera pose after Stop (M3)', async () => {
    const cam = runtime.sceneView.camera;
    cam.position.set(120, 45, -33);
    cam.lookAt(10, 2, 5);
    const position = cam.position.clone();
    const quaternion = cam.quaternion.clone();

    await runtime.play();
    // Play drives its own camera; even if the edit camera were disturbed, Stop wins.
    cam.position.set(0, 0, 0);
    runtime.stop();

    expect(cam.position.toArray()).toEqual(position.toArray());
    expect(cam.quaternion.toArray()).toEqual(quaternion.toArray());
  });

  it('keeps the default framing when no camera was captured (M3)', () => {
    runtime._restoreEditorCamera();
    expect(runtime.sceneView.camera.position.toArray()).toEqual([6, 5, 8]);
  });

  it('leaves a clean edit session if starting Play throws', async () => {
    vi.spyOn(runtime.physics, 'buildFromWorld').mockImplementation(() => {
      throw new Error('collider failure');
    });
    await expect(runtime.play()).rejects.toThrow('collider failure');

    expect(runtime.mode).toBe('edit');
    expect(runtime.isPlayActive).toBe(false);
    expect(runtime.physics.world).toBeNull();
    expect(runtime.world.mode).toBe('edit');
  });

  describe('visibility (M7)', () => {
    it('stops scheduling frames while hidden and resumes when visible', () => {
      runtime.startEditLoop();
      expect(stubs.frames.size).toBe(1);

      stubs.tick(1000);
      expect(mocks.renders).toBe(1);
      expect(stubs.frames.size).toBe(1);

      stubs.setHidden(true);
      expect(stubs.frames.size).toBe(0);
      expect(stubs.cancelled.length).toBeGreaterThan(0);

      stubs.tick(2000);
      expect(mocks.renders).toBe(1);

      stubs.setHidden(false);
      expect(stubs.frames.size).toBe(1);
      stubs.tick(3000);
      expect(mocks.renders).toBe(2);
    });

    it('does not render from a frame callback that fires after hiding', () => {
      runtime.startEditLoop();
      const [[, staleFrame]] = [...stubs.frames.entries()];
      stubs.setHidden(true);
      staleFrame(5000);
      expect(mocks.renders).toBe(0);
      expect(stubs.frames.size).toBe(0);
    });

    it('does not start a render loop while the document is hidden', () => {
      stubs.setHidden(true);
      runtime.startEditLoop();
      expect(stubs.frames.size).toBe(0);
      stubs.setHidden(false);
      expect(stubs.frames.size).toBe(1);
    });

    it('does not feed the hidden interval into Play physics as one giant step', async () => {
      const clock = vi.spyOn(performance, 'now');
      clock.mockReturnValue(1000);
      await runtime.play();
      stubs.tick(1016);
      stubs.setHidden(true);

      // Tab stays hidden for 8 seconds, then returns.
      clock.mockReturnValue(9000);
      stubs.setHidden(false);
      stubs.tick(9016);

      const dts = mocks.playerUpdates;
      expect(dts).toHaveLength(2);
      // Without the reset on resume this would be (9016-1016)/1000 clamped to 0.05.
      expect(dts[1]).toBeCloseTo(0.016, 6);
    });

    it('does not double-schedule frames after repeated visibility toggles', () => {
      runtime.startEditLoop();
      for (let i = 0; i < 4; i += 1) {
        stubs.setHidden(true);
        stubs.setHidden(false);
      }
      expect(stubs.frames.size).toBe(1);
    });

    it('stops listening and rendering after dispose', () => {
      runtime.startEditLoop();
      runtime.dispose();
      expect(stubs.listeners.size).toBe(0);
      stubs.setHidden(true);
      stubs.setHidden(false);
      expect(stubs.frames.size).toBe(0);
    });
  });
});
