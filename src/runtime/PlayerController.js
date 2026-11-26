import * as THREE from 'three';
import { toMeters, toEditorUnits } from '../core/units.js';

/**
 * WASD + mouse-look first-person controller.
 * Movement speed is authored in editor units/sec; converted to m/s for Rapier.
 *
 * Jump requires a grounded contact + Space press edge (no bunny-hop / hold-repeat).
 * Stair assist only runs while grounded so wall collision cannot launch the player.
 */
export class PlayerController {
  constructor({
    camera,
    physics,
    canvas,
    eyeHeight = 160,
    moveSpeed = 450,
    mouseSensitivity = 0.002,
    invertY = false,
  }) {
    this.camera = camera;
    this.physics = physics;
    this.canvas = canvas;
    this.eyeHeight = eyeHeight;
    this.moveSpeed = moveSpeed;
    this.mouseSensitivity = mouseSensitivity;
    this.invertY = Boolean(invertY);

    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this._keys = new Set();
    /** True for one update after Space transitions keydown (edge trigger). */
    this._jumpQueued = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onClick = this._onClick.bind(this);
  }

  start({ position, yawDegrees = 0 }) {
    this.yaw = THREE.MathUtils.degToRad(yawDegrees);
    this.pitch = 0;
    this.enabled = true;
    this._keys.clear();
    this._jumpQueued = false;

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.canvas.addEventListener('click', this._onClick);

    // Seed physics body already placed by PhysicsWorld.spawnPlayer
    void position;
    this._syncCameraFromPhysics();
  }

  stop() {
    this.enabled = false;
    this._keys.clear();
    this._jumpQueued = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.canvas.removeEventListener('click', this._onClick);
    document.removeEventListener('mousemove', this._onMouseMove);
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  _onClick() {
    if (this.enabled && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  _onPointerLockChange() {
    if (document.pointerLockElement === this.canvas) {
      document.addEventListener('mousemove', this._onMouseMove);
    } else {
      document.removeEventListener('mousemove', this._onMouseMove);
    }
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    const ySign = this.invertY ? -1 : 1;
    this.yaw -= e.movementX * this.mouseSensitivity;
    this.pitch -= e.movementY * this.mouseSensitivity * ySign;
    const limit = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  setLookOptions({ mouseSensitivity, invertY } = {}) {
    if (mouseSensitivity != null && Number.isFinite(mouseSensitivity)) {
      this.mouseSensitivity = mouseSensitivity;
    }
    if (invertY != null) this.invertY = Boolean(invertY);
  }

  _onKeyDown(e) {
    if (e.code === 'Space' && !this._keys.has('Space') && !e.repeat) {
      this._jumpQueued = true;
    }
    this._keys.add(e.code);
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
  }

  update(_dt) {
    if (!this.enabled || !this.physics.playerBody) return;

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw),
    );
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wish = new THREE.Vector3();
    if (this._keys.has('KeyW')) wish.add(forward);
    if (this._keys.has('KeyS')) wish.sub(forward);
    if (this._keys.has('KeyD')) wish.add(right);
    if (this._keys.has('KeyA')) wish.sub(right);

    const speedMps = toMeters(this.moveSpeed);
    if (wish.lengthSq() > 0) {
      wish.normalize().multiplyScalar(speedMps);
    }

    const grounded = this.physics.isPlayerGrounded();
    const current = this.physics.playerBody.linvel();
    let vy = current.y;

    const wantsJump = this._jumpQueued;
    this._jumpQueued = false;
    if (wantsJump && grounded) {
      vy = 4.5;
    } else if (
      // Stair/curb assist: only while grounded so wall scrapes cannot climb.
      grounded
      && wish.lengthSq() > 0
      && current.y > -0.4
      && current.y < 0.08
    ) {
      const horiz = Math.hypot(current.x, current.z);
      if (horiz < speedMps * 0.4 && this.physics.canStairAssist(wish.x, wish.z)) {
        vy = Math.max(vy, 2.35);
      }
    }

    this.physics.setPlayerVelocity(wish.x, vy, wish.z);
    this._syncCameraFromPhysics();
  }

  _syncCameraFromPhysics() {
    const pos = this.physics.getPlayerPositionMeters();
    if (!pos) return;
    // Capsule center is at spawnY + eyeHeight/2; offset by half height so the
    // camera sits at the authored eye height (was 0.35 → ~chest, looking at necks).
    const eyeOffset = toMeters(this.eyeHeight) * 0.5;
    this.camera.position.set(pos.x, pos.y + eyeOffset, pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  getCameraPositionEditorUnits() {
    return {
      x: toEditorUnits(this.camera.position.x),
      y: toEditorUnits(this.camera.position.y),
      z: toEditorUnits(this.camera.position.z),
    };
  }
}
