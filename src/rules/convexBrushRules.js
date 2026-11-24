/**
 * Editor-facing eligibility helpers for ConvexBrush (Phase 2F.0).
 */

import { convertEligibility } from '../geometry/convert.js';
import {
  findConvexBrushCutterConflicts,
  formatCutterConvexConflictMessage,
} from '../geometry/cutterIntersection.js';
import { geometryStats } from '../geometry/convexBrush.js';

export function canConvertActorToConvex(actor, world = null) {
  const brush = actor?.getComponent?.('Brush');
  if (!brush) {
    return {
      ok: false,
      code: 'UNSUPPORTED_SOURCE',
      message: 'Select a Brush actor to convert.',
    };
  }
  return convertEligibility(actor, brush, world);
}

export function describeConvexBrush(actor) {
  const convex = actor?.getComponent?.('ConvexBrush');
  if (!convex) return null;
  if (!convex.isValid) {
    return {
      valid: false,
      error: convex.geometryError,
      message: convex.geometryError?.message || 'Invalid ConvexBrush geometry.',
    };
  }
  const stats = geometryStats(convex.geometry);
  return {
    valid: true,
    vertices: stats.vertices,
    faces: stats.faces,
    volume: stats.volume,
    provenance: convex.provenance?.kind || null,
  };
}

export function listCutterConvexConflicts(world) {
  return findConvexBrushCutterConflicts(world);
}

export function cutterConvexConflictMessage(world) {
  return formatCutterConvexConflictMessage(findConvexBrushCutterConflicts(world));
}

export {
  findConvexBrushCutterConflicts,
  formatCutterConvexConflictMessage,
};
