/**
 * Extrude / clip editor helpers (Phase 2F.4).
 * Pure planning — callers execute the returned commands via HistoryStack.
 */

import { Actor } from '../../core/Actor.js';
import { createId } from '../../core/ids.js';
import { getWorldMatrix } from '../../core/hierarchy.js';
import { mat4Invert, mat4TransformPoint } from '../../core/math3d.js';
import { Transform } from '../../core/Transform.js';
import { ConvexBrushComponent } from '../../components/ConvexBrushComponent.js';
import { convertBrushToConvexGeometry } from '../../geometry/convert.js';
import { extrudeFace } from '../../geometry/extrude.js';
import {
  clipByPlane,
  planeFromFace,
  planeFromPoints,
} from '../../geometry/clip.js';
import { faceNormal, geometryVolume, normalizeGeometry } from '../../geometry/convexBrush.js';
import { canConvertActorToConvex } from '../../rules/convexBrushRules.js';
import { snapToGrid } from '../../core/units.js';
import {
  AddActorsCommand,
  CompositeCommand,
  ConvertBrushToConvexCommand,
  SetConvexGeometryCommand,
} from '../history/commands.js';

/**
 * Snap a positive extrude distance to the grid (minimum one grid cell when snap on).
 */
export function snapExtrudeDistance(distance, { gridSize = 25, snapEnabled = true } = {}) {
  const d = Number(distance);
  if (!(d > 0)) return 0;
  if (!snapEnabled) return d;
  const g = Math.max(1, Number(gridSize) || 25);
  const snapped = Math.max(g, snapToGrid(d, g));
  return snapped;
}

/**
 * Resolve ConvexBrush state for an actor, auto-converting eligible Brush when needed.
 * @returns {{
 *   ok: true,
 *   actor: object,
 *   convex: object,
 *   convertCmd: object|null,
 *   geometry: object,
 *   faceMaterials: object|null,
 *   faceUVs: object|null,
 * } | { ok: false, code: string, message: string }}
 */
export function resolveConvexForEdit(actor, world) {
  if (!actor) {
    return { ok: false, code: 'NO_ACTOR', message: 'Actor not found.' };
  }
  const existing = actor.getComponent('ConvexBrush');
  if (existing?.isValid && existing.geometry) {
    return {
      ok: true,
      actor,
      convex: existing,
      convertCmd: null,
      geometry: existing.geometry,
      faceMaterials: existing.faceMaterials,
      faceUVs: existing.faceUVs,
    };
  }

  const brush = actor.getComponent('Brush');
  if (!brush) {
    return {
      ok: false,
      code: 'UNSUPPORTED',
      message: 'Select a ConvexBrush or convertible Brush.',
    };
  }
  const eligibility = canConvertActorToConvex(actor, world);
  if (!eligibility.ok) return eligibility;

  const converted = convertBrushToConvexGeometry(actor, brush, world);
  if (!converted.ok) return converted;

  const convex = new ConvexBrushComponent({
    id: brush.id,
    color: brush.color,
    collidable: brush.collidable !== false,
    materialId: brush.materialId,
    faceMaterials: converted.faceMaterials,
    faceUVs: converted.faceUVs,
    uv: brush.uv,
    geometry: converted.geometry,
    provenance: converted.provenance,
  });
  if (!convex.isValid) {
    return {
      ok: false,
      code: convex.geometryError?.code || 'TOPOLOGY',
      message: convex.geometryError?.message || 'Converted geometry is invalid.',
    };
  }
  const convertCmd = new ConvertBrushToConvexCommand({
    world,
    actorId: actor.id,
    brushJson: brush.toJSON(),
    convexJson: convex.toJSON(),
  });
  return {
    ok: true,
    actor,
    convex,
    convertCmd,
    geometry: convex.geometry,
    faceMaterials: convex.faceMaterials,
    faceUVs: convex.faceUVs,
  };
}

/**
 * Plan a face extrusion (new sibling prism actor).
 *
 * @returns {{
 *   ok: true,
 *   command: object,
 *   newActorId: string,
 *   distance: number,
 *   previewGeometry: object,
 * } | { ok: false, code: string, message: string }}
 */
export function planFaceExtrusion(world, {
  actorId,
  faceId,
  distance,
  gridSize = 25,
  snapEnabled = true,
} = {}) {
  const actor = world?.getActor?.(actorId);
  if (!actor) return { ok: false, code: 'NO_ACTOR', message: 'Actor not found.' };

  const d = snapExtrudeDistance(distance, { gridSize, snapEnabled });
  if (!(d > 0)) {
    return { ok: false, code: 'INVALID_DISTANCE', message: 'Extrude distance must be > 0.' };
  }

  const resolved = resolveConvexForEdit(actor, world);
  if (!resolved.ok) return resolved;

  const result = extrudeFace(resolved.geometry, faceId, d, {
    faceMaterials: resolved.faceMaterials,
    faceUVs: resolved.faceUVs,
  });
  if (!result.ok) return result;

  const template = resolved.convex;
  const newActorId = createId('actor');
  const newCompId = createId('comp');
  const newActor = new Actor({
    id: newActorId,
    name: `${actor.name || 'Brush'} Extrusion`,
    tags: [...(actor.tags || [])],
    parentId: actor.parentId ?? null,
    visible: actor.visible !== false,
    locked: false,
    transform: new Transform(actor.transform.toJSON()),
    components: [
      new ConvexBrushComponent({
        id: newCompId,
        color: template.color,
        collidable: template.collidable !== false,
        materialId: template.materialId,
        faceMaterials: result.faceMaterials,
        faceUVs: result.faceUVs,
        uv: template.uv,
        geometry: result.geometry,
        provenance: { kind: 'extrude', sourceActorId: actor.id, sourceFaceId: faceId },
      }),
    ],
  });

  if (!newActor.getComponent('ConvexBrush')?.isValid) {
    return {
      ok: false,
      code: 'TOPOLOGY',
      message: 'Extruded brush failed validation.',
    };
  }

  const commands = [];
  if (resolved.convertCmd) commands.push(resolved.convertCmd);
  commands.push(new AddActorsCommand({
    world,
    actorsJson: [newActor.toJSON()],
    label: 'Add extrusion',
  }));

  return {
    ok: true,
    command: commands.length === 1
      ? commands[0]
      : new CompositeCommand({ commands, label: 'Extrude face' }),
    newActorId,
    distance: d,
    previewGeometry: result.geometry,
    frontFaceId: result.frontFaceId,
  };
}

/**
 * Plan a clip of one or more actors by the same local-space plane per actor.
 *
 * For multi-actor, each actor gets the plane expressed in its own local space
 * via `planesByActorId[actorId]` or a shared `plane` (local) when single-actor.
 *
 * mode: 'front' | 'back' | 'split'
 */
export function planClip(world, {
  actorIds,
  mode = 'front',
  plane = null,
  planesByActorId = null,
} = {}) {
  const ids = [...new Set(actorIds || [])].filter(Boolean);
  if (!ids.length) {
    return { ok: false, code: 'NO_SELECTION', message: 'No brushes selected for clip.' };
  }
  if (mode !== 'front' && mode !== 'back' && mode !== 'split') {
    return { ok: false, code: 'INVALID_MODE', message: `Unknown clip mode: ${mode}` };
  }

  const convertCmds = [];
  const geomChanges = [];
  const newActors = [];

  for (const actorId of ids) {
    const actor = world.getActor(actorId);
    if (!actor) {
      return { ok: false, code: 'NO_ACTOR', message: `Actor ${actorId} not found.` };
    }
    const resolved = resolveConvexForEdit(actor, world);
    if (!resolved.ok) return resolved;
    if (resolved.convertCmd) convertCmds.push(resolved.convertCmd);

    const localPlane = planesByActorId?.[actorId] || plane;
    if (!localPlane) {
      return { ok: false, code: 'DEGENERATE_PLANE', message: 'Clip plane missing.' };
    }

    const before = {
      geometry: structuredClone(resolved.geometry),
      faceMaterials: resolved.faceMaterials
        ? structuredClone(resolved.faceMaterials)
        : null,
      faceUVs: resolved.faceUVs ? structuredClone(resolved.faceUVs) : null,
    };

    const clipped = clipByPlane(resolved.geometry, localPlane, mode, {
      faceMaterials: resolved.faceMaterials,
      faceUVs: resolved.faceUVs,
    });
    if (!clipped.ok) return clipped;

    if (mode === 'split') {
      geomChanges.push({
        actorId,
        before,
        after: {
          geometry: clipped.front.geometry,
          faceMaterials: clipped.front.faceMaterials,
          faceUVs: clipped.front.faceUVs,
        },
      });
      const template = resolved.convex;
      const newActor = new Actor({
        id: createId('actor'),
        name: `${actor.name || 'Brush'} B`,
        tags: [...(actor.tags || [])],
        parentId: actor.parentId ?? null,
        visible: actor.visible !== false,
        locked: false,
        transform: new Transform(actor.transform.toJSON()),
        components: [
          new ConvexBrushComponent({
            id: createId('comp'),
            color: template.color,
            collidable: template.collidable !== false,
            materialId: template.materialId,
            faceMaterials: clipped.back.faceMaterials,
            faceUVs: clipped.back.faceUVs,
            uv: template.uv,
            geometry: clipped.back.geometry,
            provenance: { kind: 'clip_split', sourceActorId: actor.id },
          }),
        ],
      });
      if (!newActor.getComponent('ConvexBrush')?.isValid) {
        return { ok: false, code: 'TOPOLOGY', message: 'Split half B failed validation.' };
      }
      newActors.push(newActor.toJSON());
    } else {
      const half = clipped;
      geomChanges.push({
        actorId,
        before,
        after: {
          geometry: half.geometry,
          faceMaterials: half.faceMaterials,
          faceUVs: half.faceUVs,
        },
      });
    }
  }

  const commands = [...convertCmds];
  if (geomChanges.length) {
    // After convert, SetConvexGeometry must see the ConvexBrush — Convert runs first in Composite.
    commands.push(new SetConvexGeometryCommand({
      world,
      changes: geomChanges,
      label: mode === 'split' ? 'Clip split' : `Clip keep ${mode}`,
    }));
  }
  if (newActors.length) {
    commands.push(new AddActorsCommand({
      world,
      actorsJson: newActors,
      label: 'Add clip half',
    }));
  }

  if (!commands.length) {
    return { ok: false, code: 'NO_CHANGE', message: 'Clip produced no changes.' };
  }

  return {
    ok: true,
    command: commands.length === 1
      ? commands[0]
      : new CompositeCommand({
        commands,
        label: mode === 'split' ? 'Clip split' : `Clip keep ${mode}`,
      }),
    newActorIds: newActors.map((a) => a.id),
    changes: geomChanges,
  };
}

/**
 * Preview-only clip (no commands). Returns per-actor result geometries.
 */
export function previewClip(world, {
  actorIds,
  mode = 'front',
  plane = null,
  planesByActorId = null,
} = {}) {
  const ids = [...new Set(actorIds || [])].filter(Boolean);
  const results = [];
  for (const actorId of ids) {
    const actor = world.getActor(actorId);
    if (!actor) {
      return { ok: false, code: 'NO_ACTOR', message: `Actor ${actorId} not found.` };
    }
    const resolved = resolveConvexForEdit(actor, world);
    if (!resolved.ok) return resolved;
    const localPlane = planesByActorId?.[actorId] || plane;
    if (!localPlane) {
      return { ok: false, code: 'DEGENERATE_PLANE', message: 'Clip plane missing.' };
    }
    const clipped = clipByPlane(resolved.geometry, localPlane, mode, {
      faceMaterials: resolved.faceMaterials,
      faceUVs: resolved.faceUVs,
    });
    if (!clipped.ok) return clipped;
    results.push({ actorId, clipped, convertNeeded: Boolean(resolved.convertCmd) });
  }
  return { ok: true, results };
}

export function localPlaneFromSelectedFace(world, actorId, faceId) {
  const actor = world?.getActor?.(actorId);
  const convex = actor?.getComponent?.('ConvexBrush');
  const brush = actor?.getComponent?.('Brush');
  let geometry = convex?.geometry;
  if (!geometry && brush) {
    const converted = convertBrushToConvexGeometry(actor, brush, world);
    if (!converted.ok) return converted;
    geometry = converted.geometry;
  }
  if (!geometry) {
    return { ok: false, code: 'NO_GEOMETRY', message: 'No geometry for face plane.' };
  }
  return planeFromFace(geometry, faceId);
}

/**
 * Convert three world-space points to an actor-local plane.
 * Uses full parent hierarchy via getWorldMatrix (same as face-move).
 */
export function worldPointsToLocalPlane(actor, worldPoints, world = null) {
  if (!actor || !worldPoints || worldPoints.length < 3) {
    return { ok: false, code: 'DEGENERATE_PLANE', message: 'Need three world points.' };
  }
  const localPts = worldPoints.map((wp) => worldPointToLocal(actor, wp, world));
  return planeFromPoints(localPts[0], localPts[1], localPts[2]);
}

/**
 * Build a per-actor local plane map from shared world-space points.
 * Never reuse one actor's local plane on another — re-project each time.
 */
export function planesByActorIdFromWorldPoints(world, actorIds, worldPoints) {
  const ids = [...new Set(actorIds || [])].filter(Boolean);
  if (!ids.length) {
    return { ok: false, code: 'NO_SELECTION', message: 'No brushes selected for clip.' };
  }
  if (!worldPoints || worldPoints.length < 3) {
    return {
      ok: false,
      code: 'DEGENERATE_PLANE',
      message: 'Clip needs three world-space plane points.',
    };
  }
  const planesByActorId = {};
  for (const actorId of ids) {
    const actor = world?.getActor?.(actorId);
    if (!actor) {
      return { ok: false, code: 'NO_ACTOR', message: `Actor ${actorId} not found.` };
    }
    const local = worldPointsToLocalPlane(actor, worldPoints, world);
    if (!local.ok) return local;
    planesByActorId[actorId] = local.plane;
  }
  return { ok: true, planesByActorId };
}

/** Actor-local point → world (full parent chain). */
export function localPointToWorld(actor, lp, world = null) {
  const m = getWorldMatrix(actor, world);
  const wp = mat4TransformPoint(m, {
    x: Number(lp?.[0]) || 0,
    y: Number(lp?.[1]) || 0,
    z: Number(lp?.[2]) || 0,
  });
  return [wp.x, wp.y, wp.z];
}

/** World point → actor-local (full parent chain). */
export function worldPointToLocal(actor, wp, world = null) {
  const inv = mat4Invert(getWorldMatrix(actor, world));
  const lp = mat4TransformPoint(inv, {
    x: Number(wp?.[0]) || 0,
    y: Number(wp?.[1]) || 0,
    z: Number(wp?.[2]) || 0,
  });
  return [lp.x, lp.y, lp.z];
}

export {
  extrudeFace,
  clipByPlane,
  planeFromFace,
  planeFromPoints,
  faceNormal,
  geometryVolume,
  normalizeGeometry,
};
