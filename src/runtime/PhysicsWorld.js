import RAPIER from '@dimforge/rapier3d-compat';
import { toMeters } from '../core/units.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { getBrushRenderSolids } from './brushGeometry.js';

let rapierReady = null;

export function ensureRapier() {
  if (!rapierReady) {
    rapierReady = RAPIER.init();
  }
  return rapierReady;
}

/**
 * Rapier adapter. All authored sizes/positions convert editor units -> meters.
 */
export class PhysicsWorld {
  constructor() {
    this.world = null;
    this._bodies = new Map();
    this.playerBody = null;
    this.playerCollider = null;
  }

  async init() {
    await ensureRapier();
    this.clear();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    return this;
  }

  clear() {
    if (!this.world) return;
    for (const entry of this._bodies.values()) {
      this.world.removeRigidBody(entry.body);
    }
    this._bodies.clear();
    this.playerBody = null;
    this.playerCollider = null;
  }

  /**
   * Build static colliders from brush actors and explicit mesh box colliders.
   */
  buildFromWorld(gameWorld) {
    this.clear();
    for (const actor of gameWorld.actors) {
      const brush = actor.getComponent('Brush');
      if (brush && brush.enabled && brush.collidable !== false) {
        this._addBrushColliders(actor, brush);
        continue;
      }

      const mesh = actor.getComponent('StaticMesh');
      if (
        mesh
        && mesh.enabled
        && mesh.collidable
        && mesh.collisionType === 'box'
      ) {
        // Explicit primitive: 1 m unit cube; world scale applied in _addBoxCollider.
        this._addBoxCollider(actor, { x: 0.5, y: 0.5, z: 0.5 });
      }
    }
  }

  _addBrushColliders(actor, brush) {
    const { solids } = getBrushRenderSolids(brush);
    const worldXform = getWorldTransform(actor, actor.world || null);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);
    const colliders = [];

    for (const solid of solids) {
      const hx = Math.max(0.01, toMeters(solid.size.x) * 0.5 * Math.abs(scale.x || 1));
      const hy = Math.max(0.01, toMeters(solid.size.y) * 0.5 * Math.abs(scale.y || 1));
      const hz = Math.max(0.01, toMeters(solid.size.z) * 0.5 * Math.abs(scale.z || 1));
      const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(
          toMeters(solid.center.x * (scale.x || 1)),
          toMeters(solid.center.y * (scale.y || 1)),
          toMeters(solid.center.z * (scale.z || 1)),
        );
      colliders.push(this.world.createCollider(colliderDesc, body));
    }

    this._bodies.set(actor.id, { body, colliders, actor });
  }

  _addBoxCollider(actor, halfMeters) {
    const worldXform = getWorldTransform(actor, actor.world || null);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      Math.max(0.01, halfMeters.x * Math.abs(scale.x || 1)),
      Math.max(0.01, halfMeters.y * Math.abs(scale.y || 1)),
      Math.max(0.01, halfMeters.z * Math.abs(scale.z || 1)),
    );
    const collider = this.world.createCollider(colliderDesc, body);
    this._bodies.set(actor.id, { body, colliders: [collider], actor });
  }

  /**
   * Create a kinematic character-style capsule for the player.
   * eyeHeight / radius are editor units.
   */
  spawnPlayer({ position, eyeHeight = 160, radius = 30 }) {
    const heightMeters = toMeters(eyeHeight);
    const radiusMeters = toMeters(radius);
    // Capsule half-height is distance from sphere centers; total visual ~ eyeHeight
    const halfHeight = Math.max(0.05, (heightMeters - radiusMeters * 2) * 0.5);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        toMeters(position.x),
        toMeters(position.y) + heightMeters * 0.5,
        toMeters(position.z),
      )
      .lockRotations()
      .setLinearDamping(4)
      .setCcdEnabled(true);

    this.playerBody = this.world.createRigidBody(desc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radiusMeters)
      .setFriction(0.8)
      .setRestitution(0);
    this.playerCollider = this.world.createCollider(colliderDesc, this.playerBody);
    return this.playerBody;
  }

  setPlayerVelocity(vx, vy, vz) {
    if (!this.playerBody) return;
    this.playerBody.setLinvel({ x: vx, y: vy, z: vz }, true);
  }

  getPlayerPositionMeters() {
    if (!this.playerBody) return null;
    const t = this.playerBody.translation();
    return { x: t.x, y: t.y, z: t.z };
  }

  /** Test helper: number of colliders for an actor brush body. */
  getColliderCount(actorId) {
    return this._bodies.get(actorId)?.colliders?.length || 0;
  }

  step(dt) {
    if (!this.world) return;
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }

  dispose() {
    this.clear();
    this.world = null;
  }
}

function eulerDegreesToQuat({ x = 0, y = 0, z = 0 }) {
  const toRad = Math.PI / 180;
  const hx = x * toRad * 0.5;
  const hy = y * toRad * 0.5;
  const hz = z * toRad * 0.5;
  const cx = Math.cos(hx);
  const sx = Math.sin(hx);
  const cy = Math.cos(hy);
  const sy = Math.sin(hy);
  const cz = Math.cos(hz);
  const sz = Math.sin(hz);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}
