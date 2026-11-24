/**
 * Engine-neutral convex brush geometry (Phase 2F.0).
 * No Three.js / React / DOM. Editor units throughout.
 */

import {
  COORD_ROUND,
  FACE_ID_RE,
  GEOMETRY_VERSION,
  MAX_COORD,
  MAX_FACES,
  MAX_VERTICES,
} from './limits.js';

export function roundCoord(n) {
  return Math.round(Number(n) * COORD_ROUND) / COORD_ROUND;
}

export function roundVec3(p) {
  return [roundCoord(p[0]), roundCoord(p[1]), roundCoord(p[2])];
}

function parseIndex(id, prefix) {
  if (typeof id !== 'string' || !id.startsWith(prefix)) return -1;
  const n = Number(id.slice(prefix.length));
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/**
 * Create an empty geometry shell (invalid until faces/verts added).
 */
export function createEmptyGeometry() {
  return {
    version: GEOMETRY_VERSION,
    vertices: [],
    faces: [],
    uvOrigin: [0, 0, 0],
    nextVertex: 0,
    nextFace: 0,
  };
}

/**
 * Build geometry from explicit vertices + faces (used by convert).
 * @param {{ id: string, p: [number,number,number] }[]} vertices
 * @param {{ id: string, loop: string[], proj?: string }[]} faces
 * @param {[number,number,number]} [uvOrigin]
 */
export function createGeometryFromParts(vertices, faces, uvOrigin = [0, 0, 0]) {
  let maxV = -1;
  let maxF = -1;
  for (const v of vertices) {
    const n = parseIndex(v.id, 'v');
    if (n > maxV) maxV = n;
  }
  for (const f of faces) {
    const n = parseIndex(f.id, 'f');
    if (n > maxF) maxF = n;
  }
  return canonicalizeGeometry({
    version: GEOMETRY_VERSION,
    vertices: vertices.map((v) => ({ id: v.id, p: roundVec3(v.p) })),
    faces: faces.map((f) => ({
      id: f.id,
      loop: [...f.loop],
      proj: f.proj || 'pz',
    })),
    uvOrigin: roundVec3(uvOrigin),
    nextVertex: maxV + 1,
    nextFace: Math.max(0, maxF + 1),
  });
}

/**
 * Deep-clone + normalize field shapes. Does not validate convexity.
 */
export function normalizeGeometry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const vertices = Array.isArray(raw.vertices)
    ? raw.vertices
      .filter((v) => v && typeof v.id === 'string' && Array.isArray(v.p) && v.p.length === 3)
      .map((v) => ({
        id: String(v.id),
        p: [Number(v.p[0]) || 0, Number(v.p[1]) || 0, Number(v.p[2]) || 0],
      }))
    : [];
  const faces = Array.isArray(raw.faces)
    ? raw.faces
      .filter((f) => f && typeof f.id === 'string' && Array.isArray(f.loop) && f.loop.length >= 3)
      .map((f) => ({
        id: String(f.id),
        loop: f.loop.map(String),
        proj: typeof f.proj === 'string' ? f.proj : 'pz',
      }))
    : [];
  const uv = Array.isArray(raw.uvOrigin) && raw.uvOrigin.length === 3
    ? [Number(raw.uvOrigin[0]) || 0, Number(raw.uvOrigin[1]) || 0, Number(raw.uvOrigin[2]) || 0]
    : [0, 0, 0];
  let nextVertex = Number.isInteger(raw.nextVertex) ? raw.nextVertex : 0;
  let nextFace = Number.isInteger(raw.nextFace) ? raw.nextFace : 0;
  for (const v of vertices) {
    const n = parseIndex(v.id, 'v');
    if (n >= nextVertex) nextVertex = n + 1;
  }
  for (const f of faces) {
    const n = parseIndex(f.id, 'f');
    if (n >= nextFace) nextFace = n + 1;
  }
  return {
    version: Number.isInteger(raw.version) ? raw.version : GEOMETRY_VERSION,
    vertices,
    faces,
    uvOrigin: uv,
    nextVertex,
    nextFace,
  };
}

/**
 * Stable order + rounded coords for serialization / fingerprints.
 */
export function canonicalizeGeometry(geometry) {
  const g = normalizeGeometry(geometry);
  if (!g) return null;
  const vertices = [...g.vertices]
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
    .map((v) => ({ id: v.id, p: roundVec3(v.p) }));
  const faces = [...g.faces]
    .sort((a, b) => {
      // Legacy box ids first in FACE_KEYS order, then fN numeric.
      const order = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };
      const ao = order[a.id];
      const bo = order[b.id];
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return a.id.localeCompare(b.id, 'en');
    })
    .map((f) => ({ id: f.id, loop: [...f.loop], proj: f.proj }));
  return {
    version: GEOMETRY_VERSION,
    vertices,
    faces,
    uvOrigin: roundVec3(g.uvOrigin),
    nextVertex: g.nextVertex,
    nextFace: g.nextFace,
  };
}

export function geometryFingerprint(geometry) {
  return JSON.stringify(canonicalizeGeometry(geometry));
}

export function listFaceIds(geometry) {
  return (geometry?.faces || []).map((f) => f.id);
}

export function vertexMap(geometry) {
  const map = new Map();
  for (const v of geometry?.vertices || []) map.set(v.id, v.p);
  return map;
}

/**
 * Axis-aligned bounds of vertices in actor-local eu.
 */
export function geometryBounds(geometry) {
  const verts = geometry?.vertices || [];
  if (!verts.length) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const v of verts) {
    const [x, y, z] = v.p;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
  };
}

/**
 * Signed volume via face fan about origin (assumes closed manifold, outward CCW).
 */
export function geometryVolume(geometry) {
  const vmap = vertexMap(geometry);
  let vol = 0;
  for (const face of geometry?.faces || []) {
    const loop = face.loop;
    if (loop.length < 3) continue;
    const p0 = vmap.get(loop[0]);
    if (!p0) continue;
    for (let i = 1; i < loop.length - 1; i += 1) {
      const p1 = vmap.get(loop[i]);
      const p2 = vmap.get(loop[i + 1]);
      if (!p1 || !p2) continue;
      vol += scalarTriple(p0, p1, p2);
    }
  }
  return vol / 6;
}

export function scalarTriple(a, b, c) {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1])
    + a[1] * (b[2] * c[0] - b[0] * c[2])
    + a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a) {
  const len = length(a) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** Newell normal for a face loop. */
export function faceNormal(geometry, face) {
  const vmap = vertexMap(geometry);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const loop = face.loop;
  for (let i = 0; i < loop.length; i += 1) {
    const a = vmap.get(loop[i]);
    const b = vmap.get(loop[(i + 1) % loop.length]);
    if (!a || !b) continue;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize([nx, ny, nz]);
}

export function faceCentroid(geometry, face) {
  const vmap = vertexMap(geometry);
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const id of face.loop) {
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

export function faceArea(geometry, face) {
  const vmap = vertexMap(geometry);
  const loop = face.loop;
  if (loop.length < 3) return 0;
  const p0 = vmap.get(loop[0]);
  if (!p0) return 0;
  let area2 = 0;
  for (let i = 1; i < loop.length - 1; i += 1) {
    const p1 = vmap.get(loop[i]);
    const p2 = vmap.get(loop[i + 1]);
    if (!p1 || !p2) continue;
    area2 += length(cross(sub(p1, p0), sub(p2, p0)));
  }
  return area2 * 0.5;
}

export function geometryCentroid(geometry) {
  const verts = geometry?.vertices || [];
  if (!verts.length) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of verts) {
    x += v.p[0];
    y += v.p[1];
    z += v.p[2];
  }
  const n = verts.length;
  return [x / n, y / n, z / n];
}

export function isValidFaceId(id) {
  return typeof id === 'string' && FACE_ID_RE.test(id);
}

export function geometryStats(geometry) {
  return {
    vertices: geometry?.vertices?.length || 0,
    faces: geometry?.faces?.length || 0,
    volume: geometryVolume(geometry),
    bounds: geometryBounds(geometry),
    withinLimits:
      (geometry?.vertices?.length || 0) <= MAX_VERTICES
      && (geometry?.faces?.length || 0) <= MAX_FACES,
  };
}

export function coordsFinite(geometry) {
  for (const v of geometry?.vertices || []) {
    for (const c of v.p) {
      if (!Number.isFinite(c) || Math.abs(c) > MAX_COORD) return false;
    }
  }
  return true;
}
