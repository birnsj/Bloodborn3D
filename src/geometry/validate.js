/**
 * Convex brush validators V1–V7 (Phase 2F.0).
 */

import {
  CONVEX_EPS,
  MIN_EDGE,
  MIN_FACE_AREA,
  MIN_THICKNESS,
  MIN_VOLUME,
  MAX_FACES,
  MAX_VERTICES,
  PLANAR_EPS,
} from './limits.js';
import {
  coordsFinite,
  dot,
  faceArea,
  faceCentroid,
  faceNormal,
  geometryCentroid,
  geometryVolume,
  isValidFaceId,
  length,
  normalizeGeometry,
  sub,
  vertexMap,
} from './convexBrush.js';

/**
 * @returns {{ ok: true, geometry } | { ok: false, code: string, message: string }}
 */
export function validateGeometry(raw, {
  faceMaterials = null,
  faceUVs = null,
} = {}) {
  const geometry = normalizeGeometry(raw);
  if (!geometry) {
    return { ok: false, code: 'TOPOLOGY', message: 'Geometry is missing or malformed.' };
  }

  const v1 = checkTopology(geometry);
  if (!v1.ok) return v1;

  if (!coordsFinite(geometry) || geometry.vertices.length > MAX_VERTICES
    || geometry.faces.length > MAX_FACES) {
    return {
      ok: false,
      code: 'LIMIT',
      message: `Geometry exceeds limits (${MAX_VERTICES} verts / ${MAX_FACES} faces) or has invalid coordinates.`,
    };
  }

  const v2 = checkPlanarity(geometry);
  if (!v2.ok) return v2;

  const v3 = checkConvexity(geometry);
  if (!v3.ok) return v3;

  const v4 = checkWinding(geometry);
  if (!v4.ok) return v4;

  const v5 = checkMinSize(geometry);
  if (!v5.ok) return v5;

  const v7 = checkIdentity(geometry, faceMaterials, faceUVs);
  if (!v7.ok) return v7;

  return { ok: true, geometry };
}

function checkTopology(geometry) {
  const { vertices, faces } = geometry;
  if (vertices.length < 4) {
    return { ok: false, code: 'TOPOLOGY', message: 'Need at least 4 vertices.' };
  }
  if (faces.length < 4) {
    return { ok: false, code: 'TOPOLOGY', message: 'Need at least 4 faces.' };
  }

  const vidSet = new Set();
  for (const v of vertices) {
    if (vidSet.has(v.id)) {
      return { ok: false, code: 'TOPOLOGY', message: `Duplicate vertex id ${v.id}.` };
    }
    vidSet.add(v.id);
  }

  const fidSet = new Set();
  const edgeUse = new Map(); // "a|b" sorted → count with direction tracking
  const directed = new Map(); // "a>b" → face id
  const usedVerts = new Set();

  for (const face of faces) {
    if (fidSet.has(face.id)) {
      return { ok: false, code: 'TOPOLOGY', message: `Duplicate face id ${face.id}.` };
    }
    fidSet.add(face.id);
    if (face.loop.length < 3) {
      return { ok: false, code: 'TOPOLOGY', message: `Face ${face.id} has fewer than 3 vertices.` };
    }
    const seen = new Set();
    for (const id of face.loop) {
      if (!vidSet.has(id)) {
        return { ok: false, code: 'TOPOLOGY', message: `Face ${face.id} references missing vertex ${id}.` };
      }
      if (seen.has(id)) {
        return { ok: false, code: 'TOPOLOGY', message: `Face ${face.id} has duplicate vertex ${id}.` };
      }
      seen.add(id);
      usedVerts.add(id);
    }
    for (let i = 0; i < face.loop.length; i += 1) {
      const a = face.loop[i];
      const b = face.loop[(i + 1) % face.loop.length];
      const dirKey = `${a}>${b}`;
      if (directed.has(dirKey)) {
        return { ok: false, code: 'TOPOLOGY', message: `Directed edge ${dirKey} used twice.` };
      }
      directed.set(dirKey, face.id);
      const undirected = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeUse.set(undirected, (edgeUse.get(undirected) || 0) + 1);
    }
  }

  for (const [edge, count] of edgeUse) {
    if (count !== 2) {
      return {
        ok: false,
        code: 'TOPOLOGY',
        message: `Edge ${edge} is shared by ${count} faces (expected 2).`,
      };
    }
    const [a, b] = edge.split('|');
    if (!directed.has(`${a}>${b}`) || !directed.has(`${b}>${a}`)) {
      return {
        ok: false,
        code: 'TOPOLOGY',
        message: `Edge ${edge} is not traversed in opposite directions.`,
      };
    }
  }

  for (const id of vidSet) {
    if (!usedVerts.has(id)) {
      return { ok: false, code: 'TOPOLOGY', message: `Unused vertex ${id}.` };
    }
  }

  // Vertex degree ≥ 3 (each vertex incident to ≥ 3 faces for a closed convex polyhedron).
  const vertFaces = new Map();
  for (const face of faces) {
    for (const id of face.loop) {
      vertFaces.set(id, (vertFaces.get(id) || 0) + 1);
    }
  }
  for (const [id, count] of vertFaces) {
    if (count < 3) {
      return {
        ok: false,
        code: 'TOPOLOGY',
        message: `Vertex ${id} belongs to only ${count} faces (need ≥ 3).`,
      };
    }
  }

  const E = edgeUse.size;
  const V = vertices.length;
  const F = faces.length;
  if (V - E + F !== 2) {
    return {
      ok: false,
      code: 'TOPOLOGY',
      message: `Euler characteristic V−E+F = ${V - E + F} (expected 2).`,
    };
  }

  return { ok: true };
}

function checkPlanarity(geometry) {
  const vmap = vertexMap(geometry);
  for (const face of geometry.faces) {
    const n = faceNormal(geometry, face);
    const c = faceCentroid(geometry, face);
    for (const id of face.loop) {
      const p = vmap.get(id);
      if (!p) continue;
      const dist = Math.abs(dot(sub(p, c), n));
      if (dist > PLANAR_EPS) {
        return {
          ok: false,
          code: 'NON_PLANAR',
          message: `Face ${face.id} is non-planar (vertex ${id} is ${dist.toFixed(4)} eu off-plane).`,
        };
      }
    }
  }
  return { ok: true };
}

function checkConvexity(geometry) {
  for (const face of geometry.faces) {
    const n = faceNormal(geometry, face);
    const c = faceCentroid(geometry, face);
    for (const v of geometry.vertices) {
      const d = dot(sub(v.p, c), n);
      // Outward normal: all points should be on or behind the plane (d ≤ eps).
      if (d > CONVEX_EPS) {
        return {
          ok: false,
          code: 'NON_CONVEX',
          message: `Vertex ${v.id} lies outside face ${face.id} (convexity violated).`,
        };
      }
    }
  }
  // Adjacent faces must not be nearly coplanar with same orientation (should have been merged).
  // Soft check: skip strict merge enforcement here; hull builder merges. Validate only strict convexity.
  return { ok: true };
}

function checkWinding(geometry) {
  const vol = geometryVolume(geometry);
  if (!(vol > 0)) {
    return {
      ok: false,
      code: 'WINDING',
      message: `Signed volume is ${vol.toFixed(4)} (expected > 0; check face winding).`,
    };
  }
  const centroid = geometryCentroid(geometry);
  for (const face of geometry.faces) {
    const n = faceNormal(geometry, face);
    const c = faceCentroid(geometry, face);
    if (dot(n, sub(c, centroid)) <= 0) {
      return {
        ok: false,
        code: 'WINDING',
        message: `Face ${face.id} normal does not point away from the brush centroid.`,
      };
    }
  }
  return { ok: true };
}

function checkMinSize(geometry) {
  const vol = geometryVolume(geometry);
  if (vol < MIN_VOLUME) {
    return {
      ok: false,
      code: 'MIN_VOLUME',
      message: `Volume ${vol.toFixed(4)} eu³ is below minimum ${MIN_VOLUME}.`,
    };
  }

  const vmap = vertexMap(geometry);
  const edges = new Set();
  for (const face of geometry.faces) {
    const area = faceArea(geometry, face);
    if (area < MIN_FACE_AREA) {
      return {
        ok: false,
        code: 'MIN_FACE_AREA',
        message: `Face ${face.id} area ${area.toFixed(4)} is below minimum ${MIN_FACE_AREA}.`,
      };
    }
    for (let i = 0; i < face.loop.length; i += 1) {
      const a = face.loop[i];
      const b = face.loop[(i + 1) % face.loop.length];
      edges.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }
  for (const edge of edges) {
    const [a, b] = edge.split('|');
    const pa = vmap.get(a);
    const pb = vmap.get(b);
    if (!pa || !pb) continue;
    const len = length(sub(pa, pb));
    if (len < MIN_EDGE) {
      return {
        ok: false,
        code: 'MIN_EDGE',
        message: `Edge ${edge} length ${len.toFixed(4)} is below minimum ${MIN_EDGE}.`,
      };
    }
  }

  // Minimum width along each face normal.
  for (const face of geometry.faces) {
    const n = faceNormal(geometry, face);
    const c = faceCentroid(geometry, face);
    let minProj = 0;
    for (const v of geometry.vertices) {
      const d = dot(sub(v.p, c), n);
      if (d < minProj) minProj = d;
    }
    const thickness = -minProj;
    if (thickness < MIN_THICKNESS - CONVEX_EPS) {
      return {
        ok: false,
        code: 'MIN_THICKNESS',
        message: `Brush is thinner than ${MIN_THICKNESS} eu along face ${face.id}.`,
      };
    }
  }

  return { ok: true };
}

function checkIdentity(geometry, faceMaterials, faceUVs) {
  for (const face of geometry.faces) {
    if (!isValidFaceId(face.id)) {
      return {
        ok: false,
        code: 'TOPOLOGY',
        message: `Invalid face id "${face.id}".`,
      };
    }
  }
  const faceIds = new Set(geometry.faces.map((f) => f.id));
  for (const map of [faceMaterials, faceUVs]) {
    if (!map || typeof map !== 'object') continue;
    for (const key of Object.keys(map)) {
      if (!faceIds.has(key)) {
        return {
          ok: false,
          code: 'TOPOLOGY',
          message: `Surface map key "${key}" does not match any face.`,
        };
      }
    }
  }
  return { ok: true };
}

/** Plane equation helpers used by hull / clip (exported for tests). */
export function planeFromFace(geometry, face) {
  const n = faceNormal(geometry, face);
  const c = faceCentroid(geometry, face);
  return { n, d: -dot(n, c), centroid: c };
}

export function pointPlaneDistance(plane, p) {
  return dot(plane.n, p) + plane.d;
}
