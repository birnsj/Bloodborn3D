import {
  World,
  normalizeMapMode,
  migrateLegacyWorldAmbient,
  normalizeWorldScene,
  normalizeWorldRenderer,
} from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { wouldCreateCycle } from '../core/hierarchy.js';
import { normalizeOutlinerLayout } from '../core/outlinerLayout.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import {
  LEVEL_SCHEMA_VERSION,
  MIN_SUPPORTED_LEVEL_SCHEMA_VERSION,
} from './LevelSerializer.js';
import { getRegisteredComponentTypes } from '../components/componentRegistry.js';
import {
  LevelGeometryValidationError,
  validateLevelPayloads,
  validateWorldSubtractLimits,
} from './levelGeometryValidation.js';

/**
 * Shared scene loading used by editor and game runtime.
 * Rejects malformed levels rather than silently rewriting authored data.
 *
 * Geometry validation (Phase 2G D2/D3) runs by default: component payloads are
 * checked before any component is constructed, and the carved solid count is
 * checked once the world exists. Pass `{ validateGeometry: false }` only for
 * trusted data that was validated when it was produced (Play/Stop snapshots).
 */
export function deserializeLevel(data, { validateGeometry = true } = {}) {
  validateLevelData(data);

  if (validateGeometry) {
    const payload = validateLevelPayloads(data);
    if (payload.length) throw new LevelGeometryValidationError(payload);
  }

  const world = new World({
    name: data.name || 'Untitled Level',
    schemaVersion: data.schemaVersion,
    mapMode: normalizeMapMode(data.mapMode),
    ambient: migrateLegacyWorldAmbient(data.ambient),
    scene: normalizeWorldScene(data.scene),
    renderer: normalizeWorldRenderer(data.renderer),
    postProcessing: data.postProcessing ?? null,
    // Missing authoringLayers → seed defaults (backward compatible; actors keep null → resolve on use).
    authoringLayers: data.authoringLayers ?? null,
    outliner: data.outliner ?? null,
  });

  for (const actorData of data.actors) {
    const actor = Actor.fromJSON(actorData, createComponentFromJSON);
    // ensureId must not have regenerated — validateLevelData already required string ids.
    if (actor.id !== actorData.id) {
      throw new Error(`Actor id was not preserved on load: ${JSON.stringify(actorData.id)}`);
    }
    world.addActor(actor);
  }

  // Normalize outliner after actors exist so rootOrder can resolve root ids.
  world.outliner = normalizeOutlinerLayout(world.outliner, world);

  assertHierarchyIntegrity(world);

  if (validateGeometry) {
    const limits = validateWorldSubtractLimits(world);
    if (limits.length) throw new LevelGeometryValidationError(limits);
  }
  return world;
}

/**
 * Non-throwing geometry validation of level JSON — the same checks load and save
 * apply, exposed for tooling and future map generation.
 * @returns {{ ok: boolean, diagnostics: Array }}
 */
export function validateLevelGeometry(data) {
  try {
    validateLevelData(data);
  } catch (err) {
    return {
      ok: false,
      diagnostics: [{ code: 'LEVEL_STRUCTURE_INVALID', message: err.message }],
    };
  }
  const payload = validateLevelPayloads(data);
  if (payload.length) return { ok: false, diagnostics: payload };

  let world;
  try {
    world = deserializeLevel(data, { validateGeometry: false });
  } catch (err) {
    return {
      ok: false,
      diagnostics: [{ code: 'LEVEL_STRUCTURE_INVALID', message: err.message }],
    };
  }
  const limits = validateWorldSubtractLimits(world);
  return { ok: limits.length === 0, diagnostics: limits };
}

/** Throws LevelGeometryValidationError (with `.diagnostics`) when geometry is invalid. */
export function assertLevelGeometry(data) {
  const result = validateLevelGeometry(data);
  if (!result.ok) {
    throw result.diagnostics[0]?.code === 'LEVEL_STRUCTURE_INVALID'
      ? new Error(result.diagnostics[0].message)
      : new LevelGeometryValidationError(result.diagnostics);
  }
  return result;
}

/**
 * Structural validation used by deserialize and by the level write API.
 * Throws on malformed data so callers never persist or apply a lossy world.
 */
export function validateLevelData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Level data must be an object');
  }
  if (data.schemaVersion == null) {
    throw new Error('Level missing schemaVersion');
  }
  assertSupportedSchemaVersion(data.schemaVersion);
  if (!Array.isArray(data.actors)) {
    throw new Error('Level missing actors array');
  }

  const seenIds = new Set();
  for (const actorData of data.actors) {
    validateActorData(actorData);
    if (seenIds.has(actorData.id)) {
      throw new Error(`Duplicate actor id: ${actorData.id}`);
    }
    seenIds.add(actorData.id);
  }

  for (const actorData of data.actors) {
    const parentId = actorData.parentId || null;
    if (!parentId) continue;
    if (typeof parentId !== 'string' || parentId.length === 0) {
      throw new Error(`Actor ${actorData.id} has invalid parentId`);
    }
    if (parentId === actorData.id) {
      throw new Error(`Actor ${actorData.id} cannot parent itself`);
    }
    if (!seenIds.has(parentId)) {
      throw new Error(`Actor ${actorData.id} references missing parent ${parentId}`);
    }
  }

  // Cycle check on the JSON graph (before Actor construction).
  const byId = new Map(data.actors.map((a) => [a.id, a]));
  for (const actorData of data.actors) {
    if (!actorData.parentId) continue;
    const seen = new Set();
    let current = actorData.parentId;
    while (current) {
      if (current === actorData.id) {
        throw new Error(`Circular hierarchy involving actor ${actorData.id}`);
      }
      if (seen.has(current)) {
        throw new Error(`Circular hierarchy involving actor ${actorData.id}`);
      }
      seen.add(current);
      const parent = byId.get(current);
      current = parent?.parentId || null;
    }
  }
}

export function deserializeLevelString(jsonString) {
  const data = JSON.parse(jsonString);
  return deserializeLevel(data);
}

/**
 * Newer files may carry data this build would silently drop on the next save,
 * so refuse them outright rather than loading a lossy copy.
 */
function assertSupportedSchemaVersion(version) {
  if (!Number.isInteger(version) || version < MIN_SUPPORTED_LEVEL_SCHEMA_VERSION) {
    throw new Error(`Invalid level schemaVersion: ${JSON.stringify(version)}`);
  }
  if (version > LEVEL_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported level schemaVersion ${version}: this editor supports versions ${MIN_SUPPORTED_LEVEL_SCHEMA_VERSION}–${LEVEL_SCHEMA_VERSION}. Update the editor to open this level.`,
    );
  }
}

function validateActorData(actorData) {
  if (!actorData || typeof actorData !== 'object') {
    throw new Error('Invalid actor entry');
  }
  if (typeof actorData.id !== 'string' || actorData.id.length === 0) {
    throw new Error('Actor missing persistent string id');
  }
  if (!actorData.transform || typeof actorData.transform !== 'object') {
    throw new Error(`Actor ${actorData.id} missing transform`);
  }
  validateFiniteTransform(actorData.id, actorData.transform);
  if (!Array.isArray(actorData.components)) {
    throw new Error(`Actor ${actorData.id} missing components array`);
  }
  for (const comp of actorData.components) {
    validateComponentData(actorData.id, comp);
  }
}

/**
 * Coerce a transform axis to a finite number.
 * Accepts numbers and non-empty numeric strings (legacy levels).
 * Rejects null, '', booleans, and other Number() coercions that would silently become 0/1.
 */
export function coerceFiniteNumber(value, actorId, path) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(
    `Actor ${actorId} ${path} must be a finite number (got ${JSON.stringify(value)})`,
  );
}

function validateFiniteVec3(actorId, label, vec, { required = true } = {}) {
  if (vec == null) {
    if (required) throw new Error(`Actor ${actorId} missing transform.${label}`);
    return;
  }
  if (typeof vec !== 'object' || Array.isArray(vec)) {
    throw new Error(`Actor ${actorId} transform.${label} must be an object`);
  }
  for (const axis of ['x', 'y', 'z']) {
    coerceFiniteNumber(vec[axis], actorId, `transform.${label}.${axis}`);
  }
}

function validateFiniteTransform(actorId, transform) {
  validateFiniteVec3(actorId, 'position', transform.position);
  validateFiniteVec3(actorId, 'rotation', transform.rotation);
  // Legacy levels may omit scale; Actor/Transform defaults apply.
  validateFiniteVec3(actorId, 'scale', transform.scale, { required: false });
}

/**
 * Validate component entries without rejecting unknown future/legacy types
 * (those still load as generic Component). Known types must carry an object payload.
 */
function validateComponentData(actorId, comp) {
  if (!comp || typeof comp !== 'object') {
    throw new Error(`Actor ${actorId} has invalid component entry`);
  }
  if (typeof comp.type !== 'string' || comp.type.length === 0) {
    throw new Error(`Actor ${actorId} component missing type`);
  }
  const known = getRegisteredComponentTypes();
  if (!known.includes(comp.type)) {
    // Legacy / forward-compat: unknown types are allowed (generic Component).
    return;
  }
  if (comp.id != null && (typeof comp.id !== 'string' || comp.id.length === 0)) {
    throw new Error(`Actor ${actorId} component ${comp.type} has invalid id`);
  }
}

/** Second-pass hierarchy check against the live World (defensive). */
function assertHierarchyIntegrity(world) {
  for (const actor of world.actors) {
    if (!actor.parentId) continue;
    if (!world.getActor(actor.parentId)) {
      throw new Error(`Actor ${actor.id} references missing parent ${actor.parentId}`);
    }
    if (wouldCreateCycle(actor.id, actor.parentId, world)) {
      throw new Error(`Circular hierarchy involving actor ${actor.id}`);
    }
  }
}
