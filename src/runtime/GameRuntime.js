import * as THREE from 'three';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { SceneView } from './SceneView.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { PlayerController } from './PlayerController.js';

/**
 * Shared runtime for standalone game and Play-in-Editor.
 * Play snapshots authored state; Stop restores it without retaining runtime mods.
 */
export class GameRuntime {
  constructor({ canvas, onModeChange } = {}) {
    this.canvas = canvas;
    this.onModeChange = onModeChange || (() => {});

    this.world = null;
    this.authoredSnapshot = null;
    this.mode = 'edit'; // 'edit' | 'play'

    this.sceneView = new SceneView({ canvas, editMode: true });
    this.physics = new PhysicsWorld();
    this.player = null;

    this._raf = 0;
    this._lastTime = 0;
    this._running = false;
  }

  get camera() {
    return this.mode === 'play' && this.player
      ? this.player.camera
      : this.sceneView.camera;
  }

  setWorld(world) {
    this.world = world;
    this.sceneView.syncFromWorld(world);
  }

  setAssetResolver(resolver) {
    this.sceneView.setAssetResolver(resolver);
    if (this.world) this.sceneView.syncFromWorld(this.world);
  }

  setSize(width, height) {
    this.sceneView.setSize(width, height);
    if (this.player?.camera) {
      this.player.camera.aspect = width / Math.max(height, 1);
      this.player.camera.updateProjectionMatrix();
    }
  }

  setSelection(actorIds) {
    this.sceneView.setSelection(actorIds, this.world);
  }

  refreshActor(actor) {
    this.sceneView.updateActorTransform(actor);
  }

  refreshBrush(actor) {
    this.sceneView.updateBrushGeometry(actor);
  }

  /**
   * After a brush moves/resizes: rebuild carved solids for dependents.
   * Subtractive changes refresh all additive brushes (cutter may leave a volume).
   */
  refreshBrushCarveDependents(actor) {
    if (!actor) return;
    const brush = actor.getComponent?.('Brush');
    if (!brush) {
      this.refreshActor(actor);
      return;
    }
    this.refreshBrush(actor);
    if (!this.world || brush.operation !== 'subtract') return;
    for (const other of this.world.actors) {
      if (other.id === actor.id) continue;
      const otherBrush = other.getComponent?.('Brush');
      if (otherBrush && otherBrush.operation !== 'subtract') {
        this.refreshBrush(other);
      }
    }
  }

  resyncWorld() {
    if (this.world) {
      this.sceneView.syncFromWorld(this.world);
      this.sceneView.setSelection(this.sceneView.selectedActorIds, this.world);
    }
  }

  setGridSize(gridSize) {
    this.sceneView.setGridSize(gridSize);
  }

  async play() {
    if (this.mode === 'play' || !this.world) return;

    // Snapshot authored level JSON before any runtime mutation
    this.authoredSnapshot = serializeLevel(this.world);

    await this.physics.init();
    this.physics.buildFromWorld(this.world);

    const spawn = this.world.actors.find((a) => a.getComponent('PlayerSpawn'));
    const spawnComp = spawn?.getComponent('PlayerSpawn');
    const spawnPos = spawn
      ? { ...spawn.transform.position }
      : { x: 0, y: 20, z: 0 };
    const yaw = spawn?.transform.rotation?.y ?? 0;

    this.physics.spawnPlayer({
      position: spawnPos,
      eyeHeight: spawnComp?.eyeHeight ?? 160,
    });

    // Fresh FPS camera — cloning the orbit camera inherits roll and tilts the horizon.
    const editCam = this.sceneView.camera;
    const playCam = new THREE.PerspectiveCamera(
      editCam.fov,
      editCam.aspect,
      editCam.near,
      editCam.far,
    );
    playCam.rotation.order = 'YXZ';

    this.player = new PlayerController({
      camera: playCam,
      physics: this.physics,
      canvas: this.canvas,
      eyeHeight: spawnComp?.eyeHeight ?? 160,
      moveSpeed: spawnComp?.moveSpeed ?? 450,
    });
    this.player.start({ position: spawnPos, yawDegrees: yaw });

    this.mode = 'play';
    this.world.mode = 'play';
    this.sceneView.setEditMode(false);
    this.sceneView.setSelection([], this.world);
    if (this.sceneView.gizmo) this.sceneView.gizmo.setVisible(false);
    this.onModeChange(this.mode);

    this._startLoop();
  }

  stop() {
    if (this.mode !== 'play') return;

    this._stopLoop();
    if (this.player) {
      this.player.stop();
      this.player = null;
    }
    this.physics.dispose();

    // Restore original authored state — discard runtime modifications
    if (this.authoredSnapshot) {
      const restored = deserializeLevel(this.authoredSnapshot);
      this.world.clear();
      this.world.name = restored.name;
      this.world.schemaVersion = restored.schemaVersion;
      for (const actor of restored.actors) {
        this.world.addActor(actor);
      }
      this.authoredSnapshot = null;
    }

    this.mode = 'edit';
    this.world.mode = 'edit';
    this.sceneView.setEditMode(true);
    this.sceneView.syncFromWorld(this.world);

    // Restore editor camera framing
    this.sceneView.camera.position.set(6, 5, 8);
    this.sceneView.camera.lookAt(0, 1.5, 0);
    this.onModeChange(this.mode);

    this._startLoop();
  }

  /**
   * Capture current authored world as the restore baseline without entering play.
   * Used by tests / explicit snapshot APIs.
   */
  captureAuthoredSnapshot() {
    if (!this.world) return null;
    this.authoredSnapshot = serializeLevel(this.world);
    return this.authoredSnapshot;
  }

  restoreAuthoredSnapshot() {
    if (!this.authoredSnapshot || !this.world) return false;
    const restored = deserializeLevel(this.authoredSnapshot);
    this.world.clear();
    this.world.name = restored.name;
    this.world.schemaVersion = restored.schemaVersion;
    for (const actor of restored.actors) {
      this.world.addActor(actor);
    }
    this.sceneView.syncFromWorld(this.world);
    return true;
  }

  _startLoop() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    const tick = (now) => {
      if (!this._running) return;
      const dt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      this._update(dt);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _update(dt) {
    if (this.mode === 'play') {
      this.player?.update(dt);
      this.physics.step(dt);
      this.player?._syncCameraFromPhysics();
      this.sceneView.render(this.player.camera);
    } else {
      this.sceneView.render(this.sceneView.camera);
    }
  }

  startEditLoop() {
    this._startLoop();
  }

  dispose() {
    this.stop();
    this._stopLoop();
    this.sceneView.dispose();
    this.physics.dispose();
  }
}
