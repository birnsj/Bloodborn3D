/**
 * Convert parametric Brush → ConvexBrush geometry (Phase 2F.0).
 */

import { brushHasMiters, getMiteredWallCorners } from '../runtime/miteredWallGeometry.js';
import { isSubtractBrush } from '../runtime/brushBoolean.js';
import { isWallBrush } from '../runtime/wallOpenings.js';
import { BOX_SURFACE_IDS } from '../runtime/surfaces.js';
import {
  createGeometryFromParts,
  canonicalizeGeometry,
  faceNormal,
} from './convexBrush.js';
import { validateGeometry } from './validate.js';
import { findCuttersOverlappingBrushActor } from './cutterIntersection.js';
import { projFromNormal } from './uvProjection.js';

/**
 * @returns {{
 *   ok: true,
 *   geometry: object,
 *   faceMaterials: object|null,
 *   faceUVs: object|null,
 *   provenance: object,
 * } | { ok: false, code: string, message: string, cutters?: object[] }}
 */
export function convertBrushToConvexGeometry(actor, brush, world = null) {
  const eligibility = convertEligibility(actor, brush, world);
  if (!eligibility.ok) return eligibility;

  if (eligibility.kind === 'miteredWall') {
    return convertMiteredWall(brush);
  }
  return convertAxisAlignedBox(brush);
}

/**
 * @returns {{ ok: true, kind: 'box'|'miteredWall' } | { ok: false, code, message, cutters? }}
 */
export function convertEligibility(actor, brush, world = null) {
  if (!brush || brush.type !== 'Brush') {
    return { ok: false, code: 'UNSUPPORTED_SOURCE', message: 'Only Brush actors can be converted.' };
  }
  if (isSubtractBrush(brush)) {
    return {
      ok: false,
      code: 'SUBTRACT_BRUSH',
      message: 'Subtractive brushes cannot be converted to ConvexBrush.',
    };
  }
  if (brush.openings?.length) {
    return {
      ok: false,
      code: 'HAS_OPENINGS',
      message: `Brush has ${brush.openings.length} opening(s); openings produce concave geometry and cannot be converted.`,
    };
  }

  if (world && actor) {
    const cutters = findCuttersOverlappingBrushActor(world, actor, brush);
    if (cutters.length) {
      const names = cutters.map((c) => c.name || c.id).join(', ');
      return {
        ok: false,
        code: 'CUTTER_OVERLAP',
        message: `Conversion blocked: subtractive cutter(s) overlap this brush (${names}). Move or remove them first.`,
        cutters,
      };
    }
  }

  if (brushHasMiters(brush)) {
    if (!isWallBrush(actor || brush, brush.size)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_SOURCE',
        message: 'Miters are only supported on wall brushes.',
      };
    }
    return { ok: true, kind: 'miteredWall' };
  }

  return { ok: true, kind: 'box' };
}

function convertAxisAlignedBox(brush) {
  const sx = Math.max(1, Number(brush.size?.x) || 1);
  const sy = Math.max(1, Number(brush.size?.y) || 1);
  const sz = Math.max(1, Number(brush.size?.z) || 1);
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;

  const vertices = [
    { id: 'v0', p: [-hx, -hy, -hz] },
    { id: 'v1', p: [hx, -hy, -hz] },
    { id: 'v2', p: [hx, hy, -hz] },
    { id: 'v3', p: [-hx, hy, -hz] },
    { id: 'v4', p: [-hx, -hy, hz] },
    { id: 'v5', p: [hx, -hy, hz] },
    { id: 'v6', p: [hx, hy, hz] },
    { id: 'v7', p: [-hx, hy, hz] },
  ];

  // CCW when viewed from outside (outward normals).
  const faces = [
    { id: 'px', loop: ['v1', 'v2', 'v6', 'v5'], proj: 'px' },
    { id: 'nx', loop: ['v0', 'v4', 'v7', 'v3'], proj: 'nx' },
    { id: 'py', loop: ['v3', 'v7', 'v6', 'v2'], proj: 'py' },
    { id: 'ny', loop: ['v0', 'v1', 'v5', 'v4'], proj: 'ny' },
    { id: 'pz', loop: ['v4', 'v5', 'v6', 'v7'], proj: 'pz' },
    { id: 'nz', loop: ['v0', 'v3', 'v2', 'v1'], proj: 'nz' },
  ];

  const geometry = createGeometryFromParts(vertices, faces, [0, 0, 0]);
  const checked = validateGeometry(geometry, {
    faceMaterials: brush.faceMaterials,
    faceUVs: brush.faceUVs,
  });
  if (!checked.ok) return checked;

  return {
    ok: true,
    geometry: canonicalizeGeometry(checked.geometry),
    faceMaterials: brush.faceMaterials ? { ...brush.faceMaterials } : null,
    faceUVs: brush.faceUVs ? structuredClone(brush.faceUVs) : null,
    provenance: { kind: 'brush' },
  };
}

function convertMiteredWall(brush) {
  const { bottom, top } = getMiteredWallCorners(
    brush.size,
    brush.miterStart,
    brush.miterEnd,
  );
  const vertices = [];
  for (let i = 0; i < 4; i += 1) {
    vertices.push({ id: `v${i}`, p: [bottom[i].x, bottom[i].y, bottom[i].z] });
  }
  for (let i = 0; i < 4; i += 1) {
    vertices.push({ id: `v${i + 4}`, p: [top[i].x, top[i].y, top[i].z] });
  }

  const sideLoops = [
    ['v0', 'v1', 'v5', 'v4'],
    ['v1', 'v2', 'v6', 'v5'],
    ['v2', 'v3', 'v7', 'v6'],
    ['v3', 'v0', 'v4', 'v7'],
  ];
  const faces = sideLoops.map((loop, i) => ({
    id: `side${i}`,
    loop,
    proj: 'pz',
  }));
  faces.push({ id: 'py', loop: ['v4', 'v5', 'v6', 'v7'], proj: 'py' });
  faces.push({ id: 'ny', loop: ['v0', 'v3', 'v2', 'v1'], proj: 'ny' });

  let geometry = createGeometryFromParts(vertices, faces, [0, 0, 0]);
  geometry = remapMiterFaceIds(geometry);

  const faceMaterials = brush.faceMaterials ? { ...brush.faceMaterials } : null;
  const faceUVs = brush.faceUVs ? structuredClone(brush.faceUVs) : null;

  const checked = validateGeometry(geometry, { faceMaterials, faceUVs });
  if (!checked.ok) return checked;

  return {
    ok: true,
    geometry: canonicalizeGeometry(checked.geometry),
    faceMaterials,
    faceUVs,
    provenance: { kind: 'miteredWall' },
  };
}

function remapMiterFaceIds(geometry) {
  const used = new Set();
  const faces = geometry.faces.map((f) => {
    if (f.id === 'py' || f.id === 'ny') {
      used.add(f.id);
      return f;
    }
    const n = faceNormal(geometry, f);
    let id = projFromNormal(n[0], n[1], n[2]);
    if (used.has(id) || !BOX_SURFACE_IDS.includes(id)) {
      // Keep a unique temporary id if the box id is taken (should be rare).
      id = f.id;
    } else {
      used.add(id);
    }
    return { ...f, id, proj: BOX_SURFACE_IDS.includes(id) ? id : f.proj };
  });
  return { ...geometry, faces };
}
