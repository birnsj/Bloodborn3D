/**
 * Convex brush geometry edits (Phase 2F.1).
 * Pure functions — never mutate inputs. Invalid results leave callers unchanged.
 */

import {
  canonicalizeGeometry,
  createGeometryFromParts,
  faceNormal,
  normalizeGeometry,
  roundVec3,
  scale,
  sub,
  add,
  vertexMap,
} from './convexBrush.js';
import { buildConvexHull } from './hull.js';
import { assignFaceLineage } from './lineage.js';
import { validateGeometry } from './validate.js';
import { projFromNormal } from './uvProjection.js';

/**
 * Move the listed vertices by a local-space delta (editor units).
 *
 * @param {object} geometry
 * @param {string[]} vertexIds
 * @param {[number,number,number]} deltaLocal
 * @param {{
 *   faceMaterials?: object|null,
 *   faceUVs?: object|null,
 *   selectedVertexIds?: string[]|null,
 * }} [options]
 * @returns {{
 *   ok: true,
 *   geometry: object,
 *   faceMaterials: object|null,
 *   faceUVs: object|null,
 *   lineage: object|null,
 *   path: 'fast'|'rehull',
 *   warnings?: string[],
 * } | { ok: false, code: string, message: string }}
 */
export function moveVertices(geometry, vertexIds, deltaLocal, options = {}) {
  const base = normalizeGeometry(geometry);
  if (!base) {
    return { ok: false, code: 'TOPOLOGY', message: 'Missing geometry.' };
  }
  const ids = uniqueIds(vertexIds);
  if (!ids.length) {
    return { ok: false, code: 'NO_CHANGE', message: 'No vertices selected.' };
  }
  const dx = Number(deltaLocal?.[0]) || 0;
  const dy = Number(deltaLocal?.[1]) || 0;
  const dz = Number(deltaLocal?.[2]) || 0;
  if (dx === 0 && dy === 0 && dz === 0) {
    return { ok: false, code: 'NO_CHANGE', message: 'Zero delta.' };
  }

  const idSet = new Set(ids);
  for (const id of idSet) {
    if (!base.vertices.some((v) => v.id === id)) {
      return { ok: false, code: 'TOPOLOGY', message: `Unknown vertex ${id}.` };
    }
  }

  const movedVerts = base.vertices.map((v) => {
    if (!idSet.has(v.id)) return { id: v.id, p: [...v.p] };
    return { id: v.id, p: roundVec3([v.p[0] + dx, v.p[1] + dy, v.p[2] + dz]) };
  });

  const fastGeometry = {
    ...base,
    vertices: movedVerts,
    faces: base.faces.map((f) => ({ id: f.id, loop: [...f.loop], proj: f.proj })),
  };

  const maps = {
    faceMaterials: options.faceMaterials || null,
    faceUVs: options.faceUVs || null,
  };

  const fastCheck = validateGeometry(fastGeometry, maps);
  if (fastCheck.ok) {
    return {
      ok: true,
      geometry: canonicalizeGeometry(fastCheck.geometry),
      faceMaterials: maps.faceMaterials,
      faceUVs: maps.faceUVs,
      lineage: null,
      path: 'fast',
    };
  }

  // Rehull path — every input vertex must remain a hull vertex.
  const hull = buildConvexHull(movedVerts);
  if (!hull.ok) {
    return { ok: false, code: hull.code || 'TOPOLOGY', message: hull.message || 'Hull failed.' };
  }
  if (hull.merged?.length) {
    return {
      ok: false,
      code: 'VERTEX_MERGE',
      message: `Vertices would merge: ${hull.merged.join(', ')}.`,
    };
  }
  if (hull.interior?.length) {
    const selected = options.selectedVertexIds
      ? new Set(options.selectedVertexIds)
      : idSet;
    const lostUnselected = hull.interior.filter((id) => !selected.has(id));
    if (lostUnselected.length) {
      return {
        ok: false,
        code: 'UNSELECTED_VERTEX_LOST',
        message: `Unselected vertices would leave the hull: ${lostUnselected.join(', ')}.`,
      };
    }
    return {
      ok: false,
      code: 'INTERIOR_VERTEX',
      message: `Vertices would become interior: ${hull.interior.join(', ')}.`,
    };
  }

  // Rebuild face list from hull (temporary ids), then lineage.
  let nextFace = base.nextFace;
  const tempFaces = hull.faces.map((f) => {
    const id = `f${nextFace}`;
    nextFace += 1;
    const n = f.normal;
    return {
      id,
      loop: [...f.loop],
      proj: projFromNormal(n[0], n[1], n[2]),
    };
  });

  const tempGeometry = createGeometryFromParts(
    hull.vertices,
    tempFaces,
    base.uvOrigin,
  );
  // Preserve counters past temporary ids.
  tempGeometry.nextFace = nextFace;
  tempGeometry.nextVertex = Math.max(
    base.nextVertex,
    ...hull.vertices.map((v) => {
      const n = Number(String(v.id).replace(/^v/, ''));
      return Number.isFinite(n) ? n + 1 : 0;
    }),
  );

  const lined = assignFaceLineage(base, tempGeometry, maps);
  if (!lined.ok) return lined;

  const rehulled = {
    ...tempGeometry,
    faces: lined.faces,
    nextFace: lined.nextFace,
  };
  const checked = validateGeometry(rehulled, {
    faceMaterials: lined.faceMaterials,
    faceUVs: lined.faceUVs,
  });
  if (!checked.ok) return checked;

  return {
    ok: true,
    geometry: canonicalizeGeometry(checked.geometry),
    faceMaterials: lined.faceMaterials,
    faceUVs: lined.faceUVs,
    lineage: lined.lineage,
    path: 'rehull',
  };
}

/**
 * Canonical undirected edge key: numerically sorted vertex ids joined by `|`.
 * Spec §4.2 — edges are derived, never persisted as entities.
 */
export function edgeKey(a, b) {
  const aa = String(a);
  const bb = String(b);
  return aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`;
}

export function parseEdgeKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/**
 * Unique undirected edges of a geometry (manifold: each shared by 2 faces).
 * @returns {string[]}
 */
export function listGeometryEdges(geometry) {
  const g = normalizeGeometry(geometry);
  if (!g) return [];
  const edges = new Set();
  for (const face of g.faces) {
    const loop = face.loop || [];
    for (let i = 0; i < loop.length; i += 1) {
      edges.add(edgeKey(loop[i], loop[(i + 1) % loop.length]));
    }
  }
  return [...edges];
}

export function liveEdgeKeySet(geometry) {
  return new Set(listGeometryEdges(geometry));
}

/**
 * Collect unique vertex ids for the given face ids on a geometry.
 */
export function vertexIdsForFaces(geometry, faceIds) {
  const g = normalizeGeometry(geometry);
  if (!g) return [];
  const want = new Set(faceIds || []);
  const out = new Set();
  for (const face of g.faces) {
    if (!want.has(face.id)) continue;
    for (const id of face.loop) out.add(id);
  }
  return [...out];
}

/**
 * Average outward normal of the given faces (unit vector, or null).
 */
export function averageFaceNormal(geometry, faceIds) {
  const g = normalizeGeometry(geometry);
  if (!g || !faceIds?.length) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let count = 0;
  const want = new Set(faceIds);
  for (const face of g.faces) {
    if (!want.has(face.id)) continue;
    const n = faceNormal(g, face);
    nx += n[0];
    ny += n[1];
    nz += n[2];
    count += 1;
  }
  if (!count) return null;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * World-space centroid of selected faces (actor-local verts → caller transforms).
 */
export function facesCentroidLocal(geometry, faceIds) {
  const g = normalizeGeometry(geometry);
  if (!g) return [0, 0, 0];
  const vids = vertexIdsForFaces(g, faceIds);
  const vmap = vertexMap(g);
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const id of vids) {
    const p = vmap.get(id);
    if (!p) continue;
    x += p[0];
    y += p[1];
    z += p[2];
    n += 1;
  }
  if (!n) return [0, 0, 0];
  return [x / n, y / n, z / n];
}

/**
 * Collect unique vertex ids for the given edge keys.
 */
export function vertexIdsForEdges(geometry, edgeKeys) {
  const g = normalizeGeometry(geometry);
  if (!g) return [];
  const live = liveEdgeKeySet(g);
  const out = new Set();
  for (const key of edgeKeys || []) {
    const k = String(key);
    if (!live.has(k)) continue;
    const parts = parseEdgeKey(k);
    if (!parts) continue;
    out.add(parts[0]);
    out.add(parts[1]);
  }
  return [...out];
}

/**
 * Centroid of vertices belonging to the given edge keys (actor-local).
 */
export function edgesCentroidLocal(geometry, edgeKeys) {
  const g = normalizeGeometry(geometry);
  if (!g) return [0, 0, 0];
  const vids = vertexIdsForEdges(g, edgeKeys);
  const vmap = vertexMap(g);
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const id of vids) {
    const p = vmap.get(id);
    if (!p) continue;
    x += p[0];
    y += p[1];
    z += p[2];
    n += 1;
  }
  if (!n) return [0, 0, 0];
  return [x / n, y / n, z / n];
}

/**
 * Pick an anchor vertex for grid snapping among selected faces or edges.
 * Prefer the vertex nearest to `hintLocal` (if provided).
 */
export function pickSnapAnchorVertex(geometry, elementIds, hintLocal = null, mode = 'face') {
  const g = normalizeGeometry(geometry);
  if (!g) return null;
  const vids = mode === 'edge'
    ? vertexIdsForEdges(g, elementIds)
    : vertexIdsForFaces(g, elementIds);
  const vmap = vertexMap(g);
  if (!vids.length) return null;
  if (!hintLocal) return vids[0];
  let best = vids[0];
  let bestD = Infinity;
  for (const id of vids) {
    const p = vmap.get(id);
    if (!p) continue;
    const d = Math.hypot(p[0] - hintLocal[0], p[1] - hintLocal[1], p[2] - hintLocal[2]);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** Nearer endpoint of an edge to hintLocal (or first endpoint). Spec §10.4. */
export function pickEdgeSnapAnchor(geometry, edgeKeyStr, hintLocal = null) {
  const g = normalizeGeometry(geometry);
  const parts = parseEdgeKey(edgeKeyStr);
  if (!g || !parts) return null;
  const vmap = vertexMap(g);
  const p0 = vmap.get(parts[0]);
  const p1 = vmap.get(parts[1]);
  if (!p0 || !p1) return null;
  if (!hintLocal) return parts[0];
  const d0 = Math.hypot(p0[0] - hintLocal[0], p0[1] - hintLocal[1], p0[2] - hintLocal[2]);
  const d1 = Math.hypot(p1[0] - hintLocal[0], p1[1] - hintLocal[1], p1[2] - hintLocal[2]);
  return d0 <= d1 ? parts[0] : parts[1];
}

export function vertexPosition(geometry, vertexId) {
  const vmap = vertexMap(normalizeGeometry(geometry));
  const p = vmap.get(vertexId);
  return p ? [...p] : null;
}

function uniqueIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(Boolean).map(String))];
}

/** Snap a scalar so that (start + delta) lands on the grid; return snapped delta. */
export function snapDeltaAlongAxis(startValue, delta, gridSize) {
  const g = Math.max(0, Number(gridSize) || 0);
  if (!(g > 0)) return delta;
  const target = Math.round((startValue + delta) / g) * g;
  return target - startValue;
}

/**
 * Compose a local delta from a world-axis or face-normal drag sample.
 * @param {'x'|'y'|'z'|'normal'} constraint
 * @param {number} deltaEditor signed distance along the constraint direction (world eu)
 * @param {[number,number,number]|null} worldDir unit direction in world space for 'normal'
 * @param {(v:[number,number,number]) => [number,number,number]} worldToLocalDir
 */
export function localDeltaFromConstraint(constraint, deltaEditor, worldDir, worldToLocalDir) {
  const d = Number(deltaEditor) || 0;
  if (constraint === 'x' || constraint === 'y' || constraint === 'z') {
    const world = [
      constraint === 'x' ? d : 0,
      constraint === 'y' ? d : 0,
      constraint === 'z' ? d : 0,
    ];
    return worldToLocalDir(world);
  }
  if (!worldDir) return [0, 0, 0];
  const scaled = scale(worldDir, d);
  return worldToLocalDir(scaled);
}

export { add, sub, scale };
