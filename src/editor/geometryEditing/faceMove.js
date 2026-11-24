/**
 * Geometry-element move helpers (Phase 2F.1 Face / 2F.2 Edge).
 * Pure computation: world drag sample → per-actor local deltas + moveVertices results.
 */

import {
  getWorldMatrix,
} from '../../core/hierarchy.js';
import {
  mat4Invert,
  mat4TransformDirection,
  mat4TransformPoint,
} from '../../core/math3d.js';
import {
  averageFaceNormal,
  edgesCentroidLocal,
  facesCentroidLocal,
  moveVertices,
  pickEdgeSnapAnchor,
  pickSnapAnchorVertex,
  snapDeltaAlongAxis,
  vertexIdsForEdges,
  vertexIdsForFaces,
  vertexPosition,
} from '../../geometry/edits.js';
import { listSelectedElementIds, normalizeGeometrySelection } from './geometrySelection.js';

/**
 * World-space unit direction of the primary face average normal (Face mode only).
 */
export function primaryFaceNormalWorld(world, geometrySelection) {
  const sel = normalizeGeometrySelection(geometrySelection);
  if (sel.mode !== 'face' || !sel.primary) return null;
  const actor = world?.getActor?.(sel.primary.actorId);
  const convex = actor?.getComponent?.('ConvexBrush');
  if (!convex?.geometry) return null;
  const localN = averageFaceNormal(convex.geometry, [sel.primary.id]);
  if (!localN) return null;
  const worldMat = getWorldMatrix(actor, world);
  const wd = mat4TransformDirection(worldMat, {
    x: localN[0],
    y: localN[1],
    z: localN[2],
  });
  const len = Math.hypot(wd.x, wd.y, wd.z) || 1;
  return { x: wd.x / len, y: wd.y / len, z: wd.z / len };
}

/**
 * World centroid of the current geometry selection (faces or edges).
 */
export function geometrySelectionWorldCenter(world, geometrySelection) {
  const sel = normalizeGeometrySelection(geometrySelection);
  if (!sel.items.length) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const it of sel.items) {
    const actor = world?.getActor?.(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.geometry) continue;
    const local = sel.mode === 'edge'
      ? edgesCentroidLocal(convex.geometry, it.ids)
      : facesCentroidLocal(convex.geometry, it.ids);
    const wp = mat4TransformPoint(getWorldMatrix(actor, world), {
      x: local[0],
      y: local[1],
      z: local[2],
    });
    x += wp.x;
    y += wp.y;
    z += wp.z;
    n += 1;
  }
  if (!n) return null;
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * Snap a world-space delta along the drag constraint using the primary anchor vertex.
 */
export function snapWorldDelta(
  world,
  geometrySelection,
  constraint,
  rawDeltaEditor,
  worldDir,
  gridSize,
  snapEnabled,
  hintLocal = null,
) {
  const d = Number(rawDeltaEditor) || 0;
  if (!snapEnabled || !(gridSize > 0)) {
    return { deltaEditor: d, worldDelta: worldDeltaFromConstraint(constraint, d, worldDir) };
  }

  const sel = normalizeGeometrySelection(geometrySelection);
  const primary = sel.primary;
  if (!primary) {
    return { deltaEditor: d, worldDelta: worldDeltaFromConstraint(constraint, d, worldDir) };
  }
  const actor = world.getActor(primary.actorId);
  const convex = actor?.getComponent?.('ConvexBrush');
  if (!convex?.geometry) {
    return { deltaEditor: d, worldDelta: worldDeltaFromConstraint(constraint, d, worldDir) };
  }

  const elementIds = listSelectedElementIds(sel, primary.actorId);
  let anchorId;
  if (sel.mode === 'edge') {
    anchorId = pickEdgeSnapAnchor(convex.geometry, primary.id, hintLocal)
      || pickSnapAnchorVertex(convex.geometry, elementIds, hintLocal, 'edge');
  } else {
    anchorId = pickSnapAnchorVertex(convex.geometry, elementIds, hintLocal, 'face');
  }
  const localP = vertexPosition(convex.geometry, anchorId);
  if (!localP) {
    return { deltaEditor: d, worldDelta: worldDeltaFromConstraint(constraint, d, worldDir) };
  }

  const worldMat = getWorldMatrix(actor, world);
  const anchorW = mat4TransformPoint(worldMat, {
    x: localP[0],
    y: localP[1],
    z: localP[2],
  });

  if (constraint === 'normal' && worldDir) {
    const dir = asVec3(worldDir);
    const start = anchorW.x * dir[0] + anchorW.y * dir[1] + anchorW.z * dir[2];
    const snapped = snapDeltaAlongAxis(start, d, gridSize);
    return {
      deltaEditor: snapped,
      worldDelta: [dir[0] * snapped, dir[1] * snapped, dir[2] * snapped],
    };
  }

  const axis = constraint;
  const startVal = anchorW[axis];
  const snapped = snapDeltaAlongAxis(startVal, d, gridSize);
  return {
    deltaEditor: snapped,
    worldDelta: worldDeltaFromConstraint(constraint, snapped, null),
  };
}

function asVec3(d) {
  if (!d) return [0, 0, 0];
  if (Array.isArray(d)) return [Number(d[0]) || 0, Number(d[1]) || 0, Number(d[2]) || 0];
  return [Number(d.x) || 0, Number(d.y) || 0, Number(d.z) || 0];
}

function worldDeltaFromConstraint(constraint, d, worldDir) {
  if (constraint === 'x') return [d, 0, 0];
  if (constraint === 'y') return [0, d, 0];
  if (constraint === 'z') return [0, 0, d];
  if (constraint === 'normal' && worldDir) {
    const dir = asVec3(worldDir);
    return [dir[0] * d, dir[1] * d, dir[2] * d];
  }
  return [0, 0, 0];
}

function vertexIdsForSelection(geometry, ids, mode) {
  return mode === 'edge'
    ? vertexIdsForEdges(geometry, ids)
    : vertexIdsForFaces(geometry, ids);
}

/**
 * Apply a world-space translation delta to every selected face or edge set.
 */
export function applyGeometryMove(world, geometrySelection, worldDelta) {
  const sel = normalizeGeometrySelection(geometrySelection);
  if (!sel.items.length) {
    return { ok: false, code: 'NO_SELECTION', message: 'No geometry elements selected.' };
  }
  const dx = Number(worldDelta?.[0]) || 0;
  const dy = Number(worldDelta?.[1]) || 0;
  const dz = Number(worldDelta?.[2]) || 0;
  if (dx === 0 && dy === 0 && dz === 0) {
    return { ok: false, code: 'NO_CHANGE', message: 'Zero delta.' };
  }

  const changes = [];
  for (const it of sel.items) {
    const actor = world.getActor(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.geometry || !convex.isValid) {
      return {
        ok: false,
        code: 'INVALID_ACTOR',
        message: `Actor ${it.actorId} is not a valid ConvexBrush.`,
      };
    }
    const inv = mat4Invert(getWorldMatrix(actor, world));
    const localDeltaObj = mat4TransformDirection(inv, { x: dx, y: dy, z: dz });
    const localDelta = [localDeltaObj.x, localDeltaObj.y, localDeltaObj.z];
    const vids = vertexIdsForSelection(convex.geometry, it.ids, sel.mode);
    if (!vids.length) {
      return {
        ok: false,
        code: 'NO_VERTICES',
        message: `No vertices for selection on ${it.actorId}.`,
      };
    }
    const before = {
      geometry: structuredClone(convex.geometry),
      faceMaterials: convex.faceMaterials ? structuredClone(convex.faceMaterials) : null,
      faceUVs: convex.faceUVs ? structuredClone(convex.faceUVs) : null,
    };
    const result = moveVertices(convex.geometry, vids, localDelta, {
      faceMaterials: before.faceMaterials,
      faceUVs: before.faceUVs,
      selectedVertexIds: vids,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message || 'Invalid geometry move.',
        actorId: it.actorId,
      };
    }
    changes.push({
      actorId: it.actorId,
      before,
      after: {
        geometry: result.geometry,
        faceMaterials: result.faceMaterials,
        faceUVs: result.faceUVs,
      },
      lineage: result.lineage,
    });
  }
  return { ok: true, changes };
}

/** @deprecated alias for applyGeometryMove (Face-era name). */
export function applyFaceMove(world, geometrySelection, worldDelta) {
  return applyGeometryMove(world, geometrySelection, worldDelta);
}

/**
 * Capture start snapshots for a geometry element drag.
 */
export function captureGeometryMoveStart(world, geometrySelection) {
  const sel = normalizeGeometrySelection(geometrySelection);
  return sel.items.map((it) => {
    const actor = world.getActor(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    return {
      actorId: it.actorId,
      elementIds: [...it.ids],
      before: {
        geometry: structuredClone(convex.geometry),
        faceMaterials: convex.faceMaterials ? structuredClone(convex.faceMaterials) : null,
        faceUVs: convex.faceUVs ? structuredClone(convex.faceUVs) : null,
      },
    };
  });
}

/** @deprecated alias */
export function captureFaceMoveStart(world, geometrySelection) {
  return captureGeometryMoveStart(world, geometrySelection);
}
