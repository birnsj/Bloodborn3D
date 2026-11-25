/**
 * Level geometry validation (Phase 2G prerequisite D2 + D3).
 *
 * One shared entry point for every boundary where geometry enters or leaves the
 * authored level: load (`deserializeLevel`), save (dev level API), Play start,
 * and — later — procedural map generation. It reports *all* problems as
 * structured diagnostics instead of letting carving silently drop cutters or
 * letting NaN / negative sizes reach geometry and colliders.
 *
 * Diagnostic shape:
 *   { code, message, actorId, actorName, componentType?, field?, solidCount?,
 *     maxSolids?, offendingCutterId?, offendingCutterName? }
 *
 * Codes: GEOMETRY_NOT_FINITE | GEOMETRY_OUT_OF_RANGE | GEOMETRY_INVALID_SIZE |
 *        GEOMETRY_INVALID_OPENINGS | GEOMETRY_UNSUPPORTED_VALUE |
 *        SUBTRACT_COMPLEXITY_EXCEEDED
 *
 * The solid cap itself lives in `runtime/brushBoolean.js` (`MAX_SUBTRACT_SOLIDS`).
 */
import {
  applyWorldSubtraction,
  getMaxSubtractSolids,
  isSubtractBrush,
} from '../runtime/brushBoolean.js';
import { getBrushBaseSolids } from '../runtime/brushGeometry.js';
import { validateGeometryComponentPayload } from '../rules/geometryPayloadRules.js';

/** Max diagnostics quoted in `error.message`; the full list is on `error.diagnostics`. */
const MESSAGE_DIAGNOSTIC_LIMIT = 3;

export class LevelGeometryValidationError extends Error {
  constructor(diagnostics, { context = 'Level' } = {}) {
    const list = Array.isArray(diagnostics) ? diagnostics : [];
    const shown = list.slice(0, MESSAGE_DIAGNOSTIC_LIMIT).map((d) => d.message);
    const extra = list.length > shown.length ? ` (+${list.length - shown.length} more)` : '';
    super(`${context} geometry is invalid: ${shown.join(' ')}${extra}`);
    this.name = 'LevelGeometryValidationError';
    this.diagnostics = list;
  }
}

function actorLabel(actorId, actorName) {
  return actorName ? `“${actorName}” (${actorId})` : String(actorId);
}

/**
 * Payload rules over level JSON — safe to run before any Actor / geometry exists.
 * @param {{ actors?: Array }} data level JSON
 */
export function validateLevelPayloads(data) {
  const diagnostics = [];
  for (const actorData of data?.actors || []) {
    for (const comp of actorData?.components || []) {
      for (const d of validateGeometryComponentPayload(comp)) {
        diagnostics.push({
          ...d,
          actorId: actorData.id,
          actorName: actorData.name || null,
          message: `${actorLabel(actorData.id, actorData.name)}: ${d.message}`,
        });
      }
    }
  }
  return diagnostics;
}

/** Same payload rules over live components of a World. */
export function validateWorldPayloads(world) {
  const diagnostics = [];
  for (const actor of world?.actors || []) {
    for (const comp of actor.components || []) {
      for (const d of validateGeometryComponentPayload(comp)) {
        diagnostics.push({
          ...d,
          actorId: actor.id,
          actorName: actor.name || null,
          message: `${actorLabel(actor.id, actor.name)}: ${d.message}`,
        });
      }
    }
  }
  return diagnostics;
}

/**
 * Every additive brush (including World Solid) whose carved result would exceed
 * the solid limit. Unlike the edit-time check this reports all offenders, and it
 * never truncates — callers must reject the level.
 */
export function validateWorldSubtractLimits(world, { maxSolids = getMaxSubtractSolids() } = {}) {
  const diagnostics = [];
  if (!world?.actors) return diagnostics;

  for (const actor of world.actors) {
    const brush = actor.getComponent?.('Brush');
    if (!brush || brush.enabled === false || isSubtractBrush(brush)) continue;
    const base = getBrushBaseSolids(brush);
    const carved = applyWorldSubtraction(base.solids, actor, world, { maxSolids });
    if (!carved.exceeded) continue;

    const cutter = carved.offendingCutterId ? world.getActor(carved.offendingCutterId) : null;
    const cutterText = cutter
      ? ` Carving stops at cutter ${actorLabel(cutter.id, cutter.name)}; it and every later cutter would be dropped.`
      : '';
    diagnostics.push({
      code: 'SUBTRACT_COMPLEXITY_EXCEEDED',
      actorId: actor.id,
      actorName: actor.name || null,
      componentType: 'Brush',
      solidCount: carved.solidCount,
      maxSolids: carved.maxSolids,
      offendingCutterId: carved.offendingCutterId || null,
      offendingCutterName: cutter?.name || null,
      message:
        `${actorLabel(actor.id, actor.name)} would need ${carved.solidCount} solids `
        + `after subtraction (limit ${carved.maxSolids}).${cutterText} `
        + 'Use fewer or larger cutters, or split the structure into separate brushes.',
    });
  }
  return diagnostics;
}

/**
 * Full validation of a live World: payload rules first (a malformed size would
 * make carving meaningless), then the solid limit.
 * @returns {{ ok: boolean, diagnostics: Array }}
 */
export function validateWorldGeometry(world, options = {}) {
  const payload = validateWorldPayloads(world);
  if (payload.length) return { ok: false, diagnostics: payload };
  const limits = validateWorldSubtractLimits(world, options);
  return { ok: limits.length === 0, diagnostics: limits };
}

/** Throws LevelGeometryValidationError when `world` is not valid. */
export function assertWorldGeometry(world, { context = 'Level', ...options } = {}) {
  const result = validateWorldGeometry(world, options);
  if (!result.ok) throw new LevelGeometryValidationError(result.diagnostics, { context });
  return result;
}
