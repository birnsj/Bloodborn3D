/**
 * Deterministic axis-aligned box subtraction for structural brushes.
 * No general CSG — only AABB partition (same spirit as wallOpenings.js).
 */

import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4Invert, mat4Multiply, mat4TransformPoint } from '../core/math3d.js';

export const MAX_SUBTRACT_SOLIDS = 64;
export const MIN_SOLID_SIZE = 0.5; // editor units — discard slivers

/** @typedef {{ center: {x:number,y:number,z:number}, size: {x:number,y:number,z:number}, role?: string }} BrushSolid */
/** @typedef {{ min: {x:number,y:number,z:number}, max: {x:number,y:number,z:number} }} Aabb */

export function isSubtractBrush(brushOrActor) {
  const brush = brushOrActor?.getComponent?.('Brush') || brushOrActor;
  return brush?.operation === 'subtract';
}

export function isAdditiveBrush(brushOrActor) {
  const brush = brushOrActor?.getComponent?.('Brush') || brushOrActor;
  return Boolean(brush?.size) && brush.operation !== 'subtract';
}

export function solidToAabb(solid) {
  const hx = solid.size.x * 0.5;
  const hy = solid.size.y * 0.5;
  const hz = solid.size.z * 0.5;
  return {
    min: {
      x: solid.center.x - hx,
      y: solid.center.y - hy,
      z: solid.center.z - hz,
    },
    max: {
      x: solid.center.x + hx,
      y: solid.center.y + hy,
      z: solid.center.z + hz,
    },
  };
}

export function aabbToSolid(aabb, role = 'solid') {
  const size = {
    x: aabb.max.x - aabb.min.x,
    y: aabb.max.y - aabb.min.y,
    z: aabb.max.z - aabb.min.z,
  };
  return {
    center: {
      x: (aabb.min.x + aabb.max.x) * 0.5,
      y: (aabb.min.y + aabb.max.y) * 0.5,
      z: (aabb.min.z + aabb.max.z) * 0.5,
    },
    size,
    role,
  };
}

export function aabbsOverlap(a, b, eps = 1e-6) {
  return a.min.x < b.max.x - eps
    && a.max.x > b.min.x + eps
    && a.min.y < b.max.y - eps
    && a.max.y > b.min.y + eps
    && a.min.z < b.max.z - eps
    && a.max.z > b.min.z + eps;
}

function uniqSorted(values, eps = 1e-4) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (!out.length || Math.abs(out[out.length - 1] - v) > eps) out.push(v);
  }
  return out;
}

function solidViable(solid) {
  return solid.size.x >= MIN_SOLID_SIZE
    && solid.size.y >= MIN_SOLID_SIZE
    && solid.size.z >= MIN_SOLID_SIZE;
}

/**
 * Subtract hole AABB from one solid AABB → remaining solids (0..6 typically).
 * Uses axis cut spans (same pattern as wall openings).
 */
export function subtractAabbFromSolid(solid, hole) {
  const box = solidToAabb(solid);
  if (!aabbsOverlap(box, hole)) return [solid];

  // Clip hole to solid
  const h = {
    min: {
      x: Math.max(hole.min.x, box.min.x),
      y: Math.max(hole.min.y, box.min.y),
      z: Math.max(hole.min.z, box.min.z),
    },
    max: {
      x: Math.min(hole.max.x, box.max.x),
      y: Math.min(hole.max.y, box.max.y),
      z: Math.min(hole.max.z, box.max.z),
    },
  };
  if (h.min.x >= h.max.x || h.min.y >= h.max.y || h.min.z >= h.max.z) {
    return [solid];
  }

  // Full containment → solid gone
  const covers = h.min.x <= box.min.x + 1e-4
    && h.max.x >= box.max.x - 1e-4
    && h.min.y <= box.min.y + 1e-4
    && h.max.y >= box.max.y - 1e-4
    && h.min.z <= box.min.z + 1e-4
    && h.max.z >= box.max.z - 1e-4;
  if (covers) return [];

  const xs = uniqSorted([box.min.x, box.max.x, h.min.x, h.max.x]);
  const ys = uniqSorted([box.min.y, box.max.y, h.min.y, h.max.y]);
  const zs = uniqSorted([box.min.z, box.max.z, h.min.z, h.max.z]);

  const out = [];
  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      for (let iz = 0; iz < zs.length - 1; iz += 1) {
        const cell = {
          min: { x: xs[ix], y: ys[iy], z: zs[iz] },
          max: { x: xs[ix + 1], y: ys[iy + 1], z: zs[iz + 1] },
        };
        const cx = (cell.min.x + cell.max.x) * 0.5;
        const cy = (cell.min.y + cell.max.y) * 0.5;
        const cz = (cell.min.z + cell.max.z) * 0.5;
        // Keep cells outside the hole
        if (
          cx > h.min.x + 1e-6 && cx < h.max.x - 1e-6
          && cy > h.min.y + 1e-6 && cy < h.max.y - 1e-6
          && cz > h.min.z + 1e-6 && cz < h.max.z - 1e-6
        ) {
          continue;
        }
        const piece = aabbToSolid(cell, solid.role === 'solid' ? 'cut' : (solid.role || 'cut'));
        if (solidViable(piece)) out.push(piece);
      }
    }
  }
  return out;
}

/**
 * Subtract one hole from a list of solids.
 */
export function subtractAabbFromSolids(solids, hole) {
  const next = [];
  for (const solid of solids) {
    next.push(...subtractAabbFromSolid(solid, hole));
  }
  return next;
}

/**
 * True when the 3×3 linear part is a signed permutation matrix (axis-aligned box stays AABB).
 */
export function isAxisAlignedRotationMatrix(m, eps = 1e-3) {
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ];
  const used = [false, false, false];
  for (const col of cols) {
    const ax = Math.abs(col[0]);
    const ay = Math.abs(col[1]);
    const az = Math.abs(col[2]);
    const max = Math.max(ax, ay, az);
    if (max < 1 - eps) return false;
    let axis = 0;
    if (ay >= ax && ay >= az) axis = 1;
    else if (az >= ax && az >= ay) axis = 2;
    if (used[axis]) return false;
    used[axis] = true;
    // Off-axis components near zero
    for (let i = 0; i < 3; i += 1) {
      if (i === axis) {
        if (Math.abs(Math.abs(col[i]) - 1) > eps) return false;
      } else if (Math.abs(col[i]) > eps) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Map cutter brush volume into target brush local space as an AABB.
 * Returns { ok, hole, unsupportedReason }.
 * Does NOT silently approximate rotated cutters with world AABB.
 */
export function cutterHoleInBrushLocal(targetActor, cutterActor, world) {
  const targetBrush = targetActor?.getComponent?.('Brush');
  const cutterBrush = cutterActor?.getComponent?.('Brush');
  if (!targetBrush || !cutterBrush) {
    return { ok: false, unsupportedReason: 'Missing brush component' };
  }

  const targetWorld = getWorldMatrix(targetActor, world);
  const cutterWorld = getWorldMatrix(cutterActor, world);
  const targetInv = mat4Invert(targetWorld);
  const relative = mat4Multiply(targetInv, cutterWorld);

  if (!isAxisAlignedRotationMatrix(relative)) {
    return {
      ok: false,
      unsupportedReason:
        'Subtractive brush rotation is not axis-aligned relative to the target. '
        + 'Only axis-aligned (or 90° snapped) cuts are supported — the cutter was skipped for this brush.',
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

  const hole = {
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
  };
  return { ok: true, hole };
}

/**
 * Apply all subtractive brushes in the world to a solid list for one additive brush actor.
 * Never truncates. If a cutter would push past maxSolids, that cutter (and later ones)
 * are not applied and the result is marked exceeded with the last valid solid list.
 */
export function applyWorldSubtraction(solids, targetActor, world, {
  maxSolids = MAX_SUBTRACT_SOLIDS,
  warnings = null,
} = {}) {
  if (!world || !targetActor || !solids?.length) {
    return {
      solids,
      ok: true,
      exceeded: false,
      truncated: false,
      solidCount: solids?.length || 0,
      maxSolids,
      warnings: warnings || [],
    };
  }

  const notes = warnings || [];
  let current = solids;
  const cutters = world.actors.filter((a) => {
    if (a.id === targetActor.id) return false;
    const brush = a.getComponent?.('Brush');
    return brush?.enabled !== false && brush?.operation === 'subtract';
  });

  for (const cutter of cutters) {
    const mapped = cutterHoleInBrushLocal(targetActor, cutter, world);
    if (!mapped.ok) {
      notes.push({ cutterId: cutter.id, reason: mapped.unsupportedReason });
      continue;
    }
    const next = subtractAabbFromSolids(current, mapped.hole);
    if (next.length > maxSolids) {
      notes.push({
        cutterId: cutter.id,
        reason: `Subtraction would produce ${next.length} solids (limit ${maxSolids}).`,
      });
      return {
        solids: current,
        ok: false,
        exceeded: true,
        truncated: false,
        solidCount: next.length,
        maxSolids,
        warnings: notes,
        offendingCutterId: cutter.id,
      };
    }
    current = next;
  }

  return {
    solids: current,
    ok: true,
    exceeded: false,
    truncated: false,
    solidCount: current.length,
    maxSolids,
    warnings: notes,
  };
}

export function formatSubtractComplexityMessage({
  actorName = null,
  solidCount = null,
  maxSolids = MAX_SUBTRACT_SOLIDS,
} = {}) {
  const where = actorName ? ` on “${actorName}”` : '';
  const count = Number.isFinite(solidCount) ? ` (${solidCount} solids)` : '';
  return (
    `This subtraction is too complex${where}${count}. `
    + `BloodBound limits carved brushes to ${maxSolids} solids so rendering and collision stay accurate. `
    + 'The previous valid geometry was kept. Try fewer or larger cutters, or split the structure into separate brushes.'
  );
}

/** Find additive brush actors whose geometry may be affected by a cutter. */
export function findAdditiveActorsAffectedByCutter(world, cutterActor) {
  if (!world || !cutterActor) return [];
  const cutterBrush = cutterActor.getComponent?.('Brush');
  if (!cutterBrush || cutterBrush.operation !== 'subtract') return [];

  const affected = [];
  for (const actor of world.actors) {
    if (actor.id === cutterActor.id) continue;
    const brush = actor.getComponent?.('Brush');
    if (!brush || brush.operation === 'subtract') continue;
    const mapped = cutterHoleInBrushLocal(actor, cutterActor, world);
    if (!mapped.ok) {
      // Still refresh so unsupported warnings can surface if we ever expose them per-frame.
      affected.push(actor);
      continue;
    }
    const targetSolid = {
      center: { x: 0, y: 0, z: 0 },
      size: { ...brush.size },
    };
    if (aabbsOverlap(solidToAabb(targetSolid), mapped.hole)) {
      affected.push(actor);
    }
  }
  return affected;
}
