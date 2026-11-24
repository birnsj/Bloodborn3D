/**
 * Detect unsupported intersections between subtractive AABB cutters and
 * ConvexBrush / Brush actors (Phase 2F.0 approved ruling).
 */

import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4Invert, mat4Multiply, mat4TransformPoint } from '../core/math3d.js';
import {
  aabbsOverlap,
  cutterHoleInBrushLocal,
  isAxisAlignedRotationMatrix,
  isSubtractBrush,
  solidToAabb,
} from '../runtime/brushBoolean.js';
import { geometryBounds } from './convexBrush.js';

/**
 * Find enabled subtractive brushes whose AABB overlaps a target Brush actor
 * (used to block conversion).
 */
export function findCuttersOverlappingBrushActor(world, targetActor, brush = null) {
  if (!world || !targetActor) return [];
  const targetBrush = brush || targetActor.getComponent?.('Brush');
  if (!targetBrush || targetBrush.operation === 'subtract') return [];

  const out = [];
  for (const cutter of world.actors) {
    if (cutter.id === targetActor.id) continue;
    const cb = cutter.getComponent?.('Brush');
    if (!cb || cb.enabled === false || !isSubtractBrush(cb)) continue;
    const mapped = cutterHoleInBrushLocal(targetActor, cutter, world);
    if (!mapped.ok) {
      // Unsupported rotation still counts as a potential conflict for conversion safety.
      out.push(cutter);
      continue;
    }
    const targetSolid = { center: { x: 0, y: 0, z: 0 }, size: { ...targetBrush.size } };
    if (aabbsOverlap(solidToAabb(targetSolid), mapped.hole)) {
      out.push(cutter);
    }
  }
  return out;
}

/**
 * Approximate local AABB of a ConvexBrush (from vertex bounds).
 */
export function convexBrushLocalAabb(convex) {
  const b = geometryBounds(convex?.geometry);
  return {
    min: { x: b.min[0], y: b.min[1], z: b.min[2] },
    max: { x: b.max[0], y: b.max[1], z: b.max[2] },
  };
}

/**
 * Map a cutter Brush into a ConvexBrush actor's local space as an AABB.
 * Same axis-alignment rule as brushBoolean.
 */
export function cutterHoleInConvexLocal(targetActor, cutterActor, world) {
  const convex = targetActor?.getComponent?.('ConvexBrush');
  const cutterBrush = cutterActor?.getComponent?.('Brush');
  if (!convex?.geometry || !cutterBrush) {
    return { ok: false, unsupportedReason: 'Missing ConvexBrush or cutter Brush' };
  }

  // Reuse Brush mapping by synthesizing a temporary size from bounds.
  const bounds = geometryBounds(convex.geometry);
  const fakeTarget = {
    ...targetActor,
    getComponent: (type) => {
      if (type === 'Brush') {
        return {
          size: {
            x: Math.max(1, bounds.size[0]),
            y: Math.max(1, bounds.size[1]),
            z: Math.max(1, bounds.size[2]),
          },
        };
      }
      return targetActor.getComponent?.(type);
    },
  };

  // Direct relative transform — cutter corners into target local, then AABB.
  const targetWorld = getWorldMatrix(targetActor, world);
  const cutterWorld = getWorldMatrix(cutterActor, world);
  const targetInv = mat4Invert(targetWorld);
  const relative = mat4Multiply(targetInv, cutterWorld);

  if (!isAxisAlignedRotationMatrix(relative)) {
    return {
      ok: false,
      unsupportedReason:
        'Subtractive brush rotation is not axis-aligned relative to the ConvexBrush.',
    };
  }

  const hx = cutterBrush.size.x * 0.5;
  const hy = cutterBrush.size.y * 0.5;
  const hz = cutterBrush.size.z * 0.5;
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        corners.push(mat4TransformPoint(relative, {
          x: sx * hx,
          y: sy * hy,
          z: sz * hz,
        }));
      }
    }
  }
  void fakeTarget;
  return {
    ok: true,
    hole: {
      min: {
        x: Math.min(...corners.map((c) => c.x)),
        y: Math.min(...corners.map((c) => c.y)),
        z: Math.min(...corners.map((c) => c.z)),
      },
      max: {
        x: Math.max(...corners.map((c) => c.x)),
        y: Math.max(...corners.map((c) => c.y)),
        z: Math.max(...corners.map((c) => c.z)),
      },
    },
  };
}

/**
 * Report all unsupported cutter ∩ ConvexBrush intersections in a world.
 * @returns {{ cutterId, cutterName, convexId, convexName, reason }[]}
 */
export function findConvexBrushCutterConflicts(world) {
  if (!world?.actors) return [];
  const conflicts = [];
  const cutters = world.actors.filter((a) => {
    const b = a.getComponent?.('Brush');
    return b && b.enabled !== false && isSubtractBrush(b);
  });
  const convexActors = world.actors.filter((a) => {
    const c = a.getComponent?.('ConvexBrush');
    return c && c.enabled !== false;
  });

  for (const convexActor of convexActors) {
    const convex = convexActor.getComponent('ConvexBrush');
    const localAabb = convexBrushLocalAabb(convex);
    for (const cutter of cutters) {
      const mapped = cutterHoleInConvexLocal(convexActor, cutter, world);
      if (!mapped.ok) {
        conflicts.push({
          cutterId: cutter.id,
          cutterName: cutter.name || cutter.id,
          convexId: convexActor.id,
          convexName: convexActor.name || convexActor.id,
          reason: mapped.unsupportedReason || 'Unsupported cutter orientation.',
        });
        continue;
      }
      if (aabbsOverlap(localAabb, mapped.hole)) {
        conflicts.push({
          cutterId: cutter.id,
          cutterName: cutter.name || cutter.id,
          convexId: convexActor.id,
          convexName: convexActor.name || convexActor.id,
          reason:
            'Subtractive cutter overlaps a ConvexBrush. Cutters do not carve ConvexBrush geometry.',
        });
      }
    }
  }
  return conflicts;
}

export function formatCutterConvexConflictMessage(conflicts) {
  if (!conflicts?.length) return null;
  if (conflicts.length === 1) {
    const c = conflicts[0];
    return (
      `Unsupported intersection: cutter “${c.cutterName}” overlaps ConvexBrush “${c.convexName}”. `
      + 'Convex brushes are not carved by subtractive brushes.'
    );
  }
  return (
    `${conflicts.length} unsupported cutter / ConvexBrush intersections. `
    + 'Subtractive brushes do not carve ConvexBrush geometry.'
  );
}
