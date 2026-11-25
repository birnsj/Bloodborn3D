import RAPIER from '@dimforge/rapier3d-compat';
import { toMeters } from '../core/units.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { getBrushRenderSolids } from './brushGeometry.js';
import { getRampSlopeCollider } from './rampGeometry.js';
import {
  getStairSteps,
  wedgeVerticesToMetersFlat,
} from './stairGeometry.js';
import {
  columnPointsToMetersFlat,
  getColumnColliderPoints,
  getColumnCylinderCollider,
} from './columnGeometry.js';
import { getArchColliderSolids } from './archGeometry.js';
import { getCurvedWallColliderSolids } from './curvedWallGeometry.js';
import { brushHasMiters, miteredWallPointsToMetersFlat } from './miteredWallGeometry.js';
import { convexBrushPointsToMetersFlat } from './convexBrushGeometry.js';
import { isWallBrush } from './wallOpenings.js';
import { peekLoadedMeshMeta } from './meshLoader.js';

let rapierReady = null;

/** Fixed physics rate (Hz). Decoupled from render frame rate (Phase 2F.7F). */
export const PHYSICS_FIXED_HZ = 60;
export const PHYSICS_FIXED_DT = 1 / PHYSICS_FIXED_HZ;
/** Max catch-up substeps per frame to avoid spiral-of-death stalls. */
export const PHYSICS_MAX_SUBSTEPS = 5;

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
    /** Optional asset resolver for StaticMesh bounds (`getMeshBoundsMeters`). */
    this.assetResolver = null;
    this._accumulator = 0;
    this.fixedDt = PHYSICS_FIXED_DT;
    this.maxSubsteps = PHYSICS_MAX_SUBSTEPS;
  }

  setAssetResolver(resolver) {
    this.assetResolver = resolver || null;
  }

  async init() {
    await ensureRapier();
    // Release any previous WASM world before replacing it; dropping the
    // reference alone leaks its native memory on every Play.
    this.dispose();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = this.fixedDt;
    this.resetAccumulator();
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
    this._playerCapsule = null;
  }

  /**
   * Build static colliders from brush actors and explicit mesh box colliders.
   */
  buildFromWorld(gameWorld) {
    this.clear();
    for (const actor of gameWorld.actors) {
      const convex = actor.getComponent('ConvexBrush');
      if (convex && convex.enabled && convex.collidable !== false && convex.geometry) {
        this._addConvexBrushCollider(actor, convex, gameWorld);
        continue;
      }

      const brush = actor.getComponent('Brush');
      // Subtractive brushes never generate colliders of their own.
      if (brush && brush.enabled && brush.collidable !== false && brush.operation !== 'subtract') {
        this._addBrushColliders(actor, brush, gameWorld);
        continue;
      }

      const ramp = actor.getComponent('Ramp');
      if (ramp && ramp.enabled && ramp.collidable !== false) {
        this._addRampCollider(actor, ramp);
        continue;
      }

      const stair = actor.getComponent('Stair');
      if (stair && stair.enabled && stair.collidable !== false) {
        this._addStairColliders(actor, stair);
        continue;
      }

      const column = actor.getComponent('Column');
      if (column && column.enabled && column.collidable !== false) {
        this._addColumnCollider(actor, column);
        continue;
      }

      const arch = actor.getComponent('Arch');
      if (arch && arch.enabled && arch.collidable !== false) {
        this._addArchColliders(actor, arch);
        continue;
      }

      const curvedWall = actor.getComponent('CurvedWall');
      if (curvedWall && curvedWall.enabled && curvedWall.collidable !== false) {
        this._addCurvedWallColliders(actor, curvedWall);
        continue;
      }

      const mesh = actor.getComponent('StaticMesh');
      if (
        mesh
        && mesh.enabled
        && mesh.collidable
        && mesh.collisionType === 'box'
      ) {
        // Asset-bounds box (meters) + local center offset for off-origin glTF AABBs.
        const box = this._resolveMeshCollisionBox(mesh.assetId);
        const half = halfExtentsFromMeshBounds(box.size);
        this._addBoxCollider(actor, half, box.center);
      }
    }
  }

  /**
   * Resolve mesh AABB size + local center in meters.
   * Prefers live glTF cache (includes off-origin center), then registry meta.
   */
  _resolveMeshCollisionBox(assetId) {
    const live = this._peekLiveMeshMeta(assetId);
    const size = normalizePositiveVec3(live?.boundingBoxMeters)
      || this._resolveMeshBoundsMeters(assetId)
      || { x: 1, y: 1, z: 1 };
    const center = normalizeFiniteVec3(live?.boundingBoxCenterMeters)
      || this._resolveMeshBoundsCenterMeters(assetId)
      || { x: 0, y: 0, z: 0 };
    return { size, center };
  }

  _peekLiveMeshMeta(assetId) {
    if (!assetId) return null;
    const url = this.assetResolver?.getMeshUrl?.(assetId);
    return peekLoadedMeshMeta(url);
  }

  /**
   * Resolve mesh AABB size in meters from the asset registry / resolver.
   * @returns {{ x: number, y: number, z: number }|null}
   */
  _resolveMeshBoundsMeters(assetId) {
    if (!assetId) return null;
    return normalizePositiveVec3(this.assetResolver?.getMeshBoundsMeters?.(assetId));
  }

  _resolveMeshBoundsCenterMeters(assetId) {
    if (!assetId) return null;
    return normalizeFiniteVec3(this.assetResolver?.getMeshBoundsCenterMeters?.(assetId));
  }

  _addConvexBrushCollider(actor, convex, gameWorld = null) {
    const world = gameWorld || actor.world || null;
    const worldXform = getWorldTransform(actor, world);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);
    const points = convexBrushPointsToMetersFlat(convex.geometry, scale);
    const colliderDesc = RAPIER.ColliderDesc.convexHull(points);
    if (!colliderDesc) {
      this.world.removeRigidBody(body);
      console.error(
        `[PhysicsWorld] ConvexBrush hull failed for actor ${actor.id} (${actor.name || 'unnamed'})`,
      );
      return;
    }
    colliderDesc.setFriction(0.9);
    const collider = this.world.createCollider(colliderDesc, body);
    this._bodies.set(actor.id, { body, colliders: [collider], actor });
  }

  _addBrushColliders(actor, brush, gameWorld = null) {
    const world = gameWorld || actor.world || null;
    // Mitered wall without openings: one convex prism matching the visible mesh.
    if (
      brushHasMiters(brush)
      && !(brush.openings?.length)
      && isWallBrush(actor)
    ) {
      const worldXform = getWorldTransform(actor, world);
      const pos = worldXform.position;
      const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
      const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
      const desc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
        .setRotation(eulerDegreesToQuat(rot));
      const body = this.world.createRigidBody(desc);
      const points = miteredWallPointsToMetersFlat(
        brush.size,
        brush.miterStart,
        brush.miterEnd,
        scale,
      );
      const colliderDesc = RAPIER.ColliderDesc.convexHull(points);
      if (!colliderDesc) {
        this.world.removeRigidBody(body);
        return;
      }
      colliderDesc.setFriction(0.9);
      const collider = this.world.createCollider(colliderDesc, body);
      this._bodies.set(actor.id, { body, colliders: [collider], actor });
      return;
    }

    const { solids } = getBrushRenderSolids(brush, world ? { world, actor } : null);
    if (!solids.length) return;

    const worldXform = getWorldTransform(actor, world);
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

  /**
   * Straight stairs: cuboid per step.
   * Curved / spiral: convex hull per annular wedge (matches visible shape).
   */
  _addStairColliders(actor, stair) {
    const steps = getStairSteps(stair);
    if (!steps.length) return;
    const world = actor.world || null;
    const worldXform = getWorldTransform(actor, world);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);
    const colliders = [];
    for (const step of steps) {
      let colliderDesc = null;
      if (step.kind === 'wedge' && step.vertices?.length) {
        const points = wedgeVerticesToMetersFlat(step.vertices, scale);
        colliderDesc = RAPIER.ColliderDesc.convexHull(points);
      } else if (step.size && step.center) {
        const hx = Math.max(0.01, toMeters(step.size.x) * 0.5 * Math.abs(scale.x || 1));
        const hy = Math.max(0.01, toMeters(step.size.y) * 0.5 * Math.abs(scale.y || 1));
        const hz = Math.max(0.01, toMeters(step.size.z) * 0.5 * Math.abs(scale.z || 1));
        colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(
            toMeters(step.center.x * (scale.x || 1)),
            toMeters(step.center.y * (scale.y || 1)),
            toMeters(step.center.z * (scale.z || 1)),
          );
      }
      if (!colliderDesc) continue;
      colliderDesc.setFriction(0.9);
      colliders.push(this.world.createCollider(colliderDesc, body));
    }
    if (colliders.length) {
      this._bodies.set(actor.id, { body, colliders, actor });
    } else {
      this.world.removeRigidBody(body);
    }
  }

  /**
   * Sloped board collider — rotated cuboid along the ramp hypotenuse (not AABB).
   */
  _addRampCollider(actor, ramp) {
    const world = actor.world || null;
    const worldXform = getWorldTransform(actor, world);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const slope = getRampSlopeCollider(ramp);

    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);

    const hx = Math.max(0.01, toMeters(slope.halfSize.x) * Math.abs(scale.x || 1));
    const hy = Math.max(0.01, toMeters(slope.halfSize.y) * Math.abs(scale.y || 1));
    const hz = Math.max(0.01, toMeters(slope.halfSize.z) * Math.abs(scale.z || 1));
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(
        toMeters(slope.localPosition.x * (scale.x || 1)),
        toMeters(slope.localPosition.y * (scale.y || 1)),
        toMeters(slope.localPosition.z * (scale.z || 1)),
      )
      .setRotation(eulerDegreesToQuat(slope.localRotation));
    const collider = this.world.createCollider(colliderDesc, body);
    this._bodies.set(actor.id, { body, colliders: [collider], actor });
  }

  _addColumnCollider(actor, column) {
    const world = actor.world || null;
    const worldXform = getWorldTransform(actor, world);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);

    const cyl = getColumnCylinderCollider(column);
    let colliderDesc = null;
    if (cyl && column.shape === 'round') {
      const sx = Math.abs(scale.x || 1);
      const sy = Math.abs(scale.y || 1);
      const sz = Math.abs(scale.z || 1);
      const radial = Math.max(sx, sz);
      colliderDesc = RAPIER.ColliderDesc.cylinder(
        Math.max(0.01, toMeters(cyl.halfHeight) * sy),
        Math.max(0.01, toMeters(cyl.radius) * radial),
      ).setTranslation(
        toMeters(cyl.localPosition.x * (scale.x || 1)),
        toMeters(cyl.localPosition.y * (scale.y || 1)),
        toMeters(cyl.localPosition.z * (scale.z || 1)),
      );
    } else {
      const points = columnPointsToMetersFlat(getColumnColliderPoints(column), scale);
      colliderDesc = RAPIER.ColliderDesc.convexHull(points);
    }
    if (!colliderDesc) {
      this.world.removeRigidBody(body);
      return;
    }
    colliderDesc.setFriction(0.9);
    const collider = this.world.createCollider(colliderDesc, body);
    this._bodies.set(actor.id, { body, colliders: [collider], actor });
  }

  _addArchColliders(actor, arch) {
    const solids = getArchColliderSolids(arch);
    if (!solids.length) return;
    const world = actor.world || null;
    const worldXform = getWorldTransform(actor, world);
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
      colliderDesc.setFriction(0.9);
      colliders.push(this.world.createCollider(colliderDesc, body));
    }
    if (colliders.length) {
      this._bodies.set(actor.id, { body, colliders, actor });
    } else {
      this.world.removeRigidBody(body);
    }
  }

  _addCurvedWallColliders(actor, curvedWall) {
    const solids = getCurvedWallColliderSolids(curvedWall);
    if (!solids.length) return;
    const world = actor.world || null;
    const worldXform = getWorldTransform(actor, world);
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
        )
        .setRotation(eulerDegreesToQuat(solid.localRotation || { x: 0, y: 0, z: 0 }));
      colliderDesc.setFriction(0.9);
      colliders.push(this.world.createCollider(colliderDesc, body));
    }
    if (colliders.length) {
      this._bodies.set(actor.id, { body, colliders, actor });
    } else {
      this.world.removeRigidBody(body);
    }
  }

  /**
   * @param {{ x: number, y: number, z: number }} halfMeters local half-extents before actor scale
   * @param {{ x: number, y: number, z: number }} [localCenterMeters] mesh-local AABB center offset
   */
  _addBoxCollider(actor, halfMeters, localCenterMeters = null) {
    const worldXform = getWorldTransform(actor, actor.world || null);
    const pos = worldXform.position;
    const rot = worldXform.rotation || { x: 0, y: 0, z: 0 };
    const scale = worldXform.scale || { x: 1, y: 1, z: 1 };
    const desc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z))
      .setRotation(eulerDegreesToQuat(rot));
    const body = this.world.createRigidBody(desc);
    const sx = scale.x || 1;
    const sy = scale.y || 1;
    const sz = scale.z || 1;
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      Math.max(0.01, halfMeters.x * Math.abs(sx)),
      Math.max(0.01, halfMeters.y * Math.abs(sy)),
      Math.max(0.01, halfMeters.z * Math.abs(sz)),
    );
    if (localCenterMeters) {
      colliderDesc.setTranslation(
        localCenterMeters.x * sx,
        localCenterMeters.y * sy,
        localCenterMeters.z * sz,
      );
    }
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
    this._playerCapsule = { halfHeight, radius: radiusMeters, height: heightMeters };

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

  /**
   * True when a short downward ray from the capsule finds support.
   * Excludes the player collider. Used for jump + stair-assist gating.
   */
  isPlayerGrounded(maxGap = 0.14) {
    if (!this.world || !this.playerBody || !this.playerCollider || !this._playerCapsule) {
      return false;
    }
    const t = this.playerBody.translation();
    const { halfHeight, radius } = this._playerCapsule;
    // Feet are roughly halfHeight + radius below capsule center.
    const feetY = t.y - halfHeight - radius;
    const origin = { x: t.x, y: feetY + 0.05, z: t.z };
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(
      ray,
      maxGap + 0.05,
      true,
      undefined,
      undefined,
      this.playerCollider,
    );
    return Boolean(hit);
  }

  /**
   * Stair assist probe: a short forward+down cast must hit a ledge within ~0.28 m
   * of the feet. Tall walls fail the down-cast and do not assist.
   */
  canStairAssist(wishX, wishZ, {
    forwardDist = 0.35,
    maxStep = 0.28,
  } = {}) {
    if (!this.world || !this.playerBody || !this.playerCollider || !this._playerCapsule) {
      return false;
    }
    const len = Math.hypot(wishX, wishZ);
    if (len < 1e-4) return false;
    const nx = wishX / len;
    const nz = wishZ / len;
    const t = this.playerBody.translation();
    const { halfHeight, radius } = this._playerCapsule;
    const feetY = t.y - halfHeight - radius;
    // Start slightly ahead and above the feet, cast down onto a possible riser.
    const origin = {
      x: t.x + nx * forwardDist,
      y: feetY + maxStep + 0.05,
      z: t.z + nz * forwardDist,
    };
    const ray = new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(
      ray,
      maxStep + 0.1,
      true,
      undefined,
      undefined,
      this.playerCollider,
    );
    if (!hit) return false;
    const hitY = origin.y - hit.timeOfImpact;
    const rise = hitY - feetY;
    return rise > 0.02 && rise <= maxStep;
  }

  /** Test helper: number of colliders for an actor brush body. */
  getColliderCount(actorId) {
    return this._bodies.get(actorId)?.colliders?.length || 0;
  }

  /**
   * Test helper: cuboid half-extents (meters) for the first collider of an actor.
   * Returns null when missing or not a cuboid.
   */
  getColliderHalfExtents(actorId) {
    const collider = this._bodies.get(actorId)?.colliders?.[0];
    if (!collider || typeof collider.halfExtents !== 'function') return null;
    try {
      const he = collider.halfExtents();
      return { x: he.x, y: he.y, z: he.z };
    } catch {
      return null;
    }
  }

  /**
   * Test helper: collider translation relative to its rigid body (local offset).
   */
  getColliderLocalTranslation(actorId) {
    const collider = this._bodies.get(actorId)?.colliders?.[0];
    if (!collider || typeof collider.translationWrtParent !== 'function') return null;
    try {
      const t = collider.translationWrtParent();
      if (!t) return { x: 0, y: 0, z: 0 };
      return { x: t.x, y: t.y, z: t.z };
    } catch {
      return null;
    }
  }

  /** Drop leftover frame time (Play start / tab resume). */
  resetAccumulator() {
    this._accumulator = 0;
  }

  /**
   * Advance simulation with a fixed timestep and capped catch-up substeps.
   * Frame `dt` only feeds the accumulator — rendering stays independent.
   */
  step(frameDt) {
    if (!this.world) return 0;
    const dt = Math.max(0, Number(frameDt) || 0);
    this._accumulator += dt;
    const maxAccum = this.fixedDt * this.maxSubsteps;
    if (this._accumulator > maxAccum) {
      this._accumulator = maxAccum;
    }
    this.world.timestep = this.fixedDt;
    let steps = 0;
    while (this._accumulator >= this.fixedDt && steps < this.maxSubsteps) {
      this.world.step();
      this._accumulator -= this.fixedDt;
      steps += 1;
    }
    return steps;
  }

  /** Free the Rapier world. Safe to call repeatedly or before init(). */
  dispose() {
    const world = this.world;
    // Null first so a throwing free() can never leave a half-dead world behind.
    this.world = null;
    this._bodies.clear();
    this.playerBody = null;
    this.playerCollider = null;
    this._playerCapsule = null;
    this.resetAccumulator();
    if (!world) return;
    try {
      world.free();
    } catch (err) {
      console.warn('PhysicsWorld: failed to free Rapier world', err);
    }
  }
}

/** Half-extents in meters from a full AABB size; defaults to 0.5³ (1 m cube). */
export function halfExtentsFromMeshBounds(boundsMeters) {
  const sizeOr = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  if (!boundsMeters) return { x: 0.5, y: 0.5, z: 0.5 };
  return {
    x: Math.max(0.01, sizeOr(boundsMeters.x, 1) * 0.5),
    y: Math.max(0.01, sizeOr(boundsMeters.y, 1) * 0.5),
    z: Math.max(0.01, sizeOr(boundsMeters.z, 1) * 0.5),
  };
}

function normalizePositiveVec3(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const z = Number(raw.z);
  if (![x, y, z].every((v) => Number.isFinite(v) && v > 0)) return null;
  return { x, y, z };
}

function normalizeFiniteVec3(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const z = Number(raw.z);
  if (![x, y, z].every((v) => Number.isFinite(v))) return null;
  return { x, y, z };
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
