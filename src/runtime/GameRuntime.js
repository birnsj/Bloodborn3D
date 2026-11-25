import * as THREE from 'three';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { ensureWorldSolidContainsSubtracts } from '../editor/worldSolidFit.js';
import { SceneView } from './SceneView.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { PlayerController } from './PlayerController.js';

/** Camera framing used only when no editor camera was captured before Play. */
const DEFAULT_EDITOR_CAMERA_POSITION = [6, 5, 8];
const DEFAULT_EDITOR_CAMERA_TARGET = [0, 1.5, 0];

function isDocumentHidden() {
  return typeof document !== 'undefined' && document.hidden === true;
}

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
    /** Play-mode look prefs (applied when entering Play and live while playing). */
    this.playLook = {
      sensitivityMul: 1,
      invertY: false,
      baseSensitivity: 0.002,
    };

    this._raf = 0;
    this._lastTime = 0;
    this._running = false;
    /** True while the document is hidden: loop is "running" but not rendering. */
    this._suspended = false;
    this._disposed = false;

    /** play() is async (Rapier init); these keep overlapping/cancelled calls safe. */
    this._playPending = false;
    this._playToken = 0;
    /** Editor camera pose captured on Play and restored on Stop. */
    this._editorCamera = null;

    /**
     * Multi-viewport edit panes for scissor rendering, or null for single-camera.
     * Set by the Viewport UI each frame / on layout change.
     * @type {Array<{ paneId: string, rect: object, cameraMode: string, displayMode: string, paneState?: object }>|null}
     */
    this.viewportPanes = null;

    this._frameCb = (now) => this._onFrame(now);
    this._visibilityCb = () => this._handleVisibilityChange();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityCb);
    }
  }

  get camera() {
    return this.mode === 'play' && this.player
      ? this.player.camera
      : this.sceneView.camera;
  }

  setWorld(world) {
    // A Play that is still initializing must not start against the old world.
    if (this._playPending) this._playToken += 1;
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
    // Subtractive maps only: keep World Solid shelled around all cutters.
    ensureWorldSolidContainsSubtracts(this.world, {
      gridSize: this.sceneView?.gridSize || 25,
    });
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

  setViewportColors(colors) {
    this.sceneView.setViewportColors(colors, this.world);
  }

  setPlayLookOptions({ sensitivityMul, invertY } = {}) {
    if (sensitivityMul != null && Number.isFinite(sensitivityMul)) {
      this.playLook.sensitivityMul = sensitivityMul;
    }
    if (invertY != null) this.playLook.invertY = Boolean(invertY);
    this.player?.setLookOptions?.(this._playLookOptions());
  }

  _playLookOptions() {
    return {
      mouseSensitivity: this.playLook.baseSensitivity * this.playLook.sensitivityMul,
      invertY: this.playLook.invertY,
    };
  }

  /** True while Play is starting or running (blocks a second session). */
  get isPlayActive() {
    return this.mode === 'play' || this._playPending;
  }

  async play() {
    if (this.isPlayActive || !this.world || this._disposed) return;

    this._playPending = true;
    const token = ++this._playToken;
    try {
      // Snapshot authored level JSON before any runtime mutation
      const snapshot = serializeLevel(this.world);

      await this.physics.init();
      // Stop(), dispose() or a world swap may have happened during init.
      if (token !== this._playToken || this._disposed) {
        this.physics.dispose();
        return;
      }
      this.authoredSnapshot = snapshot;
      this._captureEditorCamera();

      this._beginPlaySession();
    } catch (err) {
      this._abortPlaySession();
      throw err;
    } finally {
      this._playPending = false;
    }
  }

  _beginPlaySession() {
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

    const look = this._playLookOptions();
    this.player = new PlayerController({
      camera: playCam,
      physics: this.physics,
      canvas: this.canvas,
      eyeHeight: spawnComp?.eyeHeight ?? 160,
      moveSpeed: spawnComp?.moveSpeed ?? 450,
      mouseSensitivity: look.mouseSensitivity,
      invertY: look.invertY,
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

  /** Undo a half-started Play so a failed start leaves a clean edit session. */
  _abortPlaySession() {
    if (this.player) {
      this.player.stop();
      this.player = null;
    }
    this.physics.dispose();
    this.authoredSnapshot = null;
    this._editorCamera = null;
    this.mode = 'edit';
    if (this.world) this.world.mode = 'edit';
  }

  stop() {
    if (this.mode !== 'play') {
      // Cancel a Play that is still waiting on Rapier.
      if (this._playPending) this._playToken += 1;
      return;
    }

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

    this._restoreEditorCamera();
    this.onModeChange(this.mode);

    this._startLoop();
  }

  _captureEditorCamera() {
    const cam = this.sceneView.camera;
    this._editorCamera = {
      position: cam.position.clone(),
      quaternion: cam.quaternion.clone(),
      zoom: cam.zoom,
    };
  }

  /** Put the editor camera back exactly where the designer left it. */
  _restoreEditorCamera() {
    const cam = this.sceneView.camera;
    const saved = this._editorCamera;
    this._editorCamera = null;
    if (saved) {
      cam.position.copy(saved.position);
      cam.quaternion.copy(saved.quaternion);
      cam.zoom = saved.zoom;
      cam.updateProjectionMatrix?.();
      return;
    }
    cam.position.set(...DEFAULT_EDITOR_CAMERA_POSITION);
    cam.lookAt(...DEFAULT_EDITOR_CAMERA_TARGET);
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
    this._suspended = isDocumentHidden();
    this._lastTime = performance.now();
    this._scheduleFrame();
  }

  _scheduleFrame() {
    if (!this._running || this._suspended || this._raf) return;
    this._raf = requestAnimationFrame(this._frameCb);
  }

  _onFrame(now) {
    this._raf = 0;
    if (!this._running || this._suspended) return;
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this._update(dt);
    this._scheduleFrame();
  }

  _stopLoop() {
    this._running = false;
    this._cancelFrame();
  }

  _cancelFrame() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  /** Stop drawing (and simulating) while hidden; resume without a time jump. */
  _handleVisibilityChange() {
    const hidden = isDocumentHidden();
    if (hidden === this._suspended) return;
    this._suspended = hidden;
    if (hidden) {
      this._cancelFrame();
      return;
    }
    if (!this._running) return;
    // Skip the hidden interval so physics does not see one giant step.
    this._lastTime = performance.now();
    this._scheduleFrame();
  }

  setViewportPanes(panes) {
    this.viewportPanes = Array.isArray(panes) && panes.length > 0 ? panes : null;
  }

  _update(dt) {
    if (this.mode === 'play') {
      this.player?.update(dt);
      this.physics.step(dt);
      this.player?._syncCameraFromPhysics();
      this.sceneView.render(this.player.camera);
    } else if (this.viewportPanes?.length) {
      this.sceneView.renderViewports(this.viewportPanes);
    } else {
      this.sceneView.render(this.sceneView.camera);
    }
  }

  startEditLoop() {
    this._startLoop();
  }

  dispose() {
    this._disposed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityCb);
    }
    this.stop();
    this._stopLoop();
    this.sceneView.dispose();
    this.physics.dispose();
  }
}
