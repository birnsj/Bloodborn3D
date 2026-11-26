import { Component } from '../core/Component.js';

/**
 * Places an imported mesh asset in the level (Batch 6).
 * assetId references the project asset registry (not a file path).
 *
 * Collision mirrors PrimitiveMesh modes. Material overrides are keyed by
 * stable slot ids discovered from the GLB (meshName:matIndex). LOD levels
 * reference other mesh assets. Instancing is opt-in (default off).
 */

export const STATIC_MESH_COLLISION_TYPES = Object.freeze([
  'none',
  'auto',
  'box',
  'sphere',
  'capsule',
  'cylinder',
  'convex',
  'trimesh',
]);

export const STATIC_MESH_INSTANCING = Object.freeze(['off', 'auto', 'force']);

function clampNum(v, fallback, min = -Infinity, max = Infinity) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function vec3(raw, fallback = { x: 0, y: 0, z: 0 }) {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  return {
    x: clampNum(raw.x, fallback.x),
    y: clampNum(raw.y, fallback.y),
    z: clampNum(raw.z, fallback.z),
  };
}

function normalizeLodLevels(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      assetId: row?.assetId ? String(row.assetId) : null,
      distance: Math.max(0, clampNum(row?.distance, 0, 0, 1e7)),
    }))
    .filter((row) => row.assetId);
}

function normalizeMaterialOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    if (value == null || value === '') continue;
    out[String(key)] = String(value);
  }
  return out;
}

/**
 * Normalize StaticMesh fields with backward-compatible defaults.
 * Legacy levels only had assetId + collidable + collisionType none|box.
 */
export function normalizeStaticMeshFields(raw = {}) {
  let collisionType = 'none';
  if (STATIC_MESH_COLLISION_TYPES.includes(raw.collisionType)) {
    collisionType = raw.collisionType;
  } else if (raw.collidable && raw.collisionType !== 'none') {
    // Legacy levels: collidable + implicit/unknown type → box
    collisionType = 'box';
  }

  const collidable = collisionType === 'none'
    ? false
    : Boolean(raw.collidable ?? true);

  const instancing = STATIC_MESH_INSTANCING.includes(raw.instancing) ? raw.instancing : 'off';

  return {
    assetId: raw.assetId || null,
    collidable,
    collisionType,
    /** Editor-unit full size override for box (0 = use asset AABB). */
    collisionSize: vec3(raw.collisionSize, { x: 0, y: 0, z: 0 }),
    collisionOffset: vec3(raw.collisionOffset, { x: 0, y: 0, z: 0 }),
    /** Editor units — 0 = derive from AABB. */
    collisionRadius: Math.max(0, clampNum(raw.collisionRadius, 0)),
    collisionHeight: Math.max(0, clampNum(raw.collisionHeight, 0)),
    castShadow: raw.castShadow !== false,
    receiveShadow: raw.receiveShadow !== false,
    renderOrder: Math.round(clampNum(raw.renderOrder, 0, -1e6, 1e6)),
    frustumCulled: raw.frustumCulled !== false,
    showCollision: Boolean(raw.showCollision),
    materialOverrides: normalizeMaterialOverrides(raw.materialOverrides),
    lodLevels: normalizeLodLevels(raw.lodLevels),
    lodHysteresis: Math.max(0, clampNum(raw.lodHysteresis, 0, 0, 1e6)),
    /** -1 = automatic camera distance; >=0 forces that LOD index in editor. */
    lodPreview: Math.round(clampNum(raw.lodPreview, -1, -1, 32)),
    instancing,
  };
}

export function staticMeshAuthorableSnapshot(comp) {
  return normalizeStaticMeshFields(comp || {});
}

export function serializeStaticMeshFields(fields) {
  const f = normalizeStaticMeshFields(fields);
  return {
    assetId: f.assetId,
    collidable: f.collidable,
    collisionType: f.collisionType,
    collisionSize: f.collisionSize,
    collisionOffset: f.collisionOffset,
    collisionRadius: f.collisionRadius,
    collisionHeight: f.collisionHeight,
    castShadow: f.castShadow,
    receiveShadow: f.receiveShadow,
    renderOrder: f.renderOrder,
    frustumCulled: f.frustumCulled,
    showCollision: f.showCollision,
    materialOverrides: f.materialOverrides,
    lodLevels: f.lodLevels,
    lodHysteresis: f.lodHysteresis,
    lodPreview: f.lodPreview,
    instancing: f.instancing,
  };
}

/**
 * Rapier: trimesh + convex require a fixed body (static). We always use fixed
 * bodies for StaticMesh / PrimitiveMesh props in this phase.
 */
export function assertStaticColliderAllowed(collisionType, rigidBodyKind = 'fixed') {
  if (rigidBodyKind !== 'fixed' && (collisionType === 'trimesh' || collisionType === 'convex')) {
    return {
      ok: false,
      message: `${collisionType} colliders require a fixed (static) rigid body in this pipeline.`,
    };
  }
  return { ok: true, message: null };
}

export class StaticMeshComponent extends Component {
  constructor(raw = {}) {
    const fields = normalizeStaticMeshFields(raw);
    super({ id: raw.id, type: StaticMeshComponent.componentType, enabled: raw.enabled });
    Object.assign(this, fields);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      ...serializeStaticMeshFields(this),
    };
  }

  static fromJSON(data) {
    return new StaticMeshComponent(data);
  }
}

StaticMeshComponent.componentType = 'StaticMesh';
