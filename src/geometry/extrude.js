/**
 * Face extrusion — new convex prism brush (Phase 2F.4 / Q1).
 * Pure: never mutates inputs. Source geometry unchanged.
 */

import {
  add,
  canonicalizeGeometry,
  createGeometryFromParts,
  faceNormal,
  normalizeGeometry,
  roundVec3,
  scale,
  vertexMap,
} from './convexBrush.js';
import { validateGeometry } from './validate.js';
import { projFromNormal } from './uvProjection.js';
import { MIN_EDGE } from './limits.js';

/**
 * Extrude a face along its outward normal by distance d > 0.
 *
 * @returns {{
 *   ok: true,
 *   geometry: object,
 *   faceMaterials: object|null,
 *   faceUVs: object|null,
 *   frontFaceId: string,
 *   backFaceId: string,
 *   sideFaceIds: string[],
 * } | { ok: false, code: string, message: string }}
 */
export function extrudeFace(geometry, faceId, distance, options = {}) {
  const g = normalizeGeometry(geometry);
  if (!g) return { ok: false, code: 'TOPOLOGY', message: 'Missing geometry.' };
  const d = Number(distance);
  if (!(d > 0)) {
    return { ok: false, code: 'INVALID_DISTANCE', message: 'Extrude distance must be > 0.' };
  }
  if (d < MIN_EDGE) {
    return {
      ok: false,
      code: 'INVALID_DISTANCE',
      message: `Extrude distance ${d} is below minimum ${MIN_EDGE} eu.`,
    };
  }

  const face = g.faces.find((f) => f.id === faceId);
  if (!face || (face.loop || []).length < 3) {
    return { ok: false, code: 'NO_FACE', message: `Face ${faceId} not found.` };
  }

  const n = faceNormal(g, face);
  const vmap = vertexMap(g);
  const loop = [...face.loop];
  const basePts = [];
  for (const id of loop) {
    const p = vmap.get(id);
    if (!p) return { ok: false, code: 'TOPOLOGY', message: `Missing vertex ${id}.` };
    basePts.push([...p]);
  }

  const frontPts = basePts.map((p) => roundVec3(add(p, scale(n, d))));

  // Vertex ids for the new brush.
  let nextV = 0;
  const baseIds = basePts.map(() => {
    const id = `v${nextV}`;
    nextV += 1;
    return id;
  });
  const frontIds = frontPts.map(() => {
    const id = `v${nextV}`;
    nextV += 1;
    return id;
  });

  const vertices = [
    ...baseIds.map((id, i) => ({ id, p: roundVec3(basePts[i]) })),
    ...frontIds.map((id, i) => ({ id, p: frontPts[i] })),
  ];

  let nextF = 0;
  const allocFace = () => {
    const id = `f${nextF}`;
    nextF += 1;
    return id;
  };

  const backId = allocFace();
  const frontId = allocFace();
  // Back face: outward = -n → reverse of source loop order.
  const backLoop = [...baseIds].reverse();
  const frontLoop = [...frontIds]; // same order as source (outward +n)

  const faces = [
    { id: backId, loop: backLoop, proj: projFromNormal(-n[0], -n[1], -n[2]) },
    { id: frontId, loop: frontLoop, proj: projFromNormal(n[0], n[1], n[2]) },
  ];
  const sideFaceIds = [];
  for (let i = 0; i < baseIds.length; i += 1) {
    const j = (i + 1) % baseIds.length;
    // Side quad: base i→j, then front j→i (outward).
    const sideId = allocFace();
    sideFaceIds.push(sideId);
    const a = basePts[i];
    const b = basePts[j];
    const edge = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    // Approximate outward: edge × n (right-hand with n).
    const ox = edge[1] * n[2] - edge[2] * n[1];
    const oy = edge[2] * n[0] - edge[0] * n[2];
    const oz = edge[0] * n[1] - edge[1] * n[0];
    faces.push({
      id: sideId,
      loop: [baseIds[i], baseIds[j], frontIds[j], frontIds[i]],
      proj: projFromNormal(ox, oy, oz),
    });
  }

  const geom = createGeometryFromParts(vertices, faces, g.uvOrigin || [0, 0, 0]);
  geom.nextVertex = nextV;
  geom.nextFace = nextF;

  const srcMats = options.faceMaterials || null;
  const srcUvs = options.faceUVs || null;
  const faceMaterials = {};
  const faceUVs = {};
  // Front cap inherits source face overrides.
  if (srcMats?.[faceId]) faceMaterials[frontId] = srcMats[faceId];
  if (srcUvs?.[faceId]) faceUVs[frontId] = structuredClone(srcUvs[faceId]);

  const matsOut = Object.keys(faceMaterials).length ? faceMaterials : null;
  const uvsOut = Object.keys(faceUVs).length ? faceUVs : null;

  const checked = validateGeometry(geom, {
    faceMaterials: matsOut,
    faceUVs: uvsOut,
  });
  if (!checked.ok) return checked;

  return {
    ok: true,
    geometry: canonicalizeGeometry(checked.geometry),
    faceMaterials: matsOut,
    faceUVs: uvsOut,
    frontFaceId: frontId,
    backFaceId: backId,
    sideFaceIds,
  };
}
