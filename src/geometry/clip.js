/**
 * Plane clipping for convex brushes (Phase 2F.4).
 * Pure: never mutates inputs. Results always re-validated.
 *
 * Plane: { point: [x,y,z], normal: [nx,ny,nz] } (normal need not be unit).
 * Front half-space: signedDistance >= 0 where sd = dot(n, p - point).
 * Modes: 'front' | 'back' | 'split'
 */

import {
  add,
  canonicalizeGeometry,
  createGeometryFromParts,
  cross,
  dot,
  faceNormal,
  geometryVolume,
  length,
  normalize,
  normalizeGeometry,
  roundVec3,
  scale,
  sub,
  vertexMap,
} from './convexBrush.js';
import { validateGeometry } from './validate.js';
import { projFromNormal } from './uvProjection.js';
import { COPLANAR_DIST_EPS, PLANAR_EPS } from './limits.js';

const ON_EPS = COPLANAR_DIST_EPS;

/**
 * @param {object} geometry
 * @param {{ point: number[], normal: number[] }} plane
 * @param {'front'|'back'|'split'} mode
 * @param {{ faceMaterials?: object|null, faceUVs?: object|null }} [options]
 */
export function clipByPlane(geometry, plane, mode = 'front', options = {}) {
  const g = normalizeGeometry(geometry);
  if (!g) return { ok: false, code: 'TOPOLOGY', message: 'Missing geometry.' };

  const built = buildPlane(plane);
  if (!built.ok) return built;

  const m = mode === 'back' || mode === 'split' || mode === 'front' ? mode : null;
  if (!m) {
    return { ok: false, code: 'INVALID_MODE', message: `Unknown clip mode: ${mode}` };
  }

  if (m === 'split') {
    const front = clipHalf(g, built.plane, 'front', options);
    if (!front.ok) return front;
    const back = clipHalf(g, built.plane, 'back', options);
    if (!back.ok) return back;
    const v0 = Math.abs(geometryVolume(g));
    const v1 = Math.abs(geometryVolume(front.geometry));
    const v2 = Math.abs(geometryVolume(back.geometry));
    const rel = v0 > 1e-9 ? Math.abs((v1 + v2) - v0) / v0 : Math.abs((v1 + v2) - v0);
    if (rel > 1e-3) {
      // Soft check — still return if both halves validated; warn via relative.
      // Hard reject only when clearly broken (>1%).
      if (rel > 0.01) {
        return {
          ok: false,
          code: 'VOLUME',
          message: `Split volumes do not conserve (${v1.toFixed(2)}+${v2.toFixed(2)}≠${v0.toFixed(2)}).`,
        };
      }
    }
    return {
      ok: true,
      mode: 'split',
      front,
      back,
      plane: built.plane,
    };
  }

  const half = clipHalf(g, built.plane, m, options);
  if (!half.ok) return half;
  return {
    ok: true,
    mode: m,
    ...half,
    plane: built.plane,
  };
}

/**
 * Build a plane from three non-collinear points (grid-snapped picks).
 * Normal = normalize((b-a)×(c-a)); front is the half-space the normal points into.
 */
export function planeFromPoints(a, b, c) {
  if (!a || !b || !c) {
    return { ok: false, code: 'DEGENERATE_PLANE', message: 'Need three points.' };
  }
  const ab = sub(b, a);
  const ac = sub(c, a);
  const n = cross(ab, ac);
  if (length(n) < PLANAR_EPS) {
    return {
      ok: false,
      code: 'DEGENERATE_PLANE',
      message: 'Clip points are collinear; plane is undefined.',
    };
  }
  return buildPlane({ point: a, normal: n });
}

/**
 * Plane from an existing face (outward normal).
 */
export function planeFromFace(geometry, faceId) {
  const g = normalizeGeometry(geometry);
  if (!g) return { ok: false, code: 'TOPOLOGY', message: 'Missing geometry.' };
  const face = g.faces.find((f) => f.id === faceId);
  if (!face) return { ok: false, code: 'NO_FACE', message: `Face ${faceId} not found.` };
  const n = faceNormal(g, face);
  const vmap = vertexMap(g);
  const p0 = vmap.get(face.loop[0]);
  if (!p0) return { ok: false, code: 'TOPOLOGY', message: 'Missing face vertex.' };
  return buildPlane({ point: p0, normal: n });
}

function buildPlane(plane) {
  if (!plane?.point || !plane?.normal) {
    return { ok: false, code: 'DEGENERATE_PLANE', message: 'Plane requires point and normal.' };
  }
  const n = normalize(plane.normal);
  if (length(n) < 1e-8 || !Number.isFinite(n[0] + n[1] + n[2])) {
    return { ok: false, code: 'DEGENERATE_PLANE', message: 'Plane normal is degenerate.' };
  }
  const point = roundVec3(plane.point);
  return {
    ok: true,
    plane: {
      point,
      normal: n,
      // sd = dot(n, p) - d
      d: dot(n, point),
    },
  };
}

function signedDistance(plane, p) {
  return dot(plane.normal, p) - plane.d;
}

function clipHalf(geometry, plane, keep, options) {
  // keep 'front' → retain sd >= -eps; 'back' → retain sd <= +eps
  const keepFront = keep === 'front';
  const vmap = vertexMap(geometry);

  /** @type {Map<string, [number,number,number]>} coordKey → position */
  const newVerts = new Map();
  /** @type {Map<string, string>} coordKey → vertex id */
  const vertIds = new Map();
  let nextV = 0;

  const ensureVert = (p) => {
    const rp = roundVec3(p);
    const key = `${rp[0]},${rp[1]},${rp[2]}`;
    let id = vertIds.get(key);
    if (id) return id;
    id = `v${nextV}`;
    nextV += 1;
    vertIds.set(key, id);
    newVerts.set(id, rp);
    return id;
  };

  const keptFacePolys = [];
  /** Intersection points for cap (unordered). */
  const capPoints = [];

  const isKept = (sd) => (keepFront ? sd >= -ON_EPS : sd <= ON_EPS);
  const isOut = (sd) => (keepFront ? sd < -ON_EPS : sd > ON_EPS);

  for (const face of geometry.faces) {
    const pts = [];
    for (const vid of face.loop) {
      const p = vmap.get(vid);
      if (!p) {
        return { ok: false, code: 'TOPOLOGY', message: `Missing vertex ${vid}.` };
      }
      pts.push([...p]);
    }
    const clipped = clipPolygon(pts, plane, isKept, isOut, capPoints);
    if (clipped.length >= 3) {
      const loop = clipped.map((p) => ensureVert(p));
      // Drop degenerate (duplicate consecutive) loops.
      const dedup = [];
      for (const id of loop) {
        if (dedup.length === 0 || dedup[dedup.length - 1] !== id) dedup.push(id);
      }
      if (dedup.length >= 2 && dedup[0] === dedup[dedup.length - 1]) dedup.pop();
      if (dedup.length >= 3) {
        keptFacePolys.push({
          id: face.id,
          loop: dedup,
          proj: face.proj,
        });
      }
    }
  }

  // Cap from unique intersection points (skip if an existing kept face already seals).
  const uniqueCap = uniquePoints(capPoints);
  let capFace = null;
  if (uniqueCap.length >= 3) {
    const ordered = orderPolygonOnPlane(uniqueCap, plane.normal);
    if (ordered.length >= 3) {
      // Outward normal for kept solid: for keepFront, discarded is -n → outward = -n
      const outward = keepFront
        ? scale(plane.normal, -1)
        : [...plane.normal];
      // Ensure CCW when viewed along outward (Newell should match).
      let loop = ordered.map((p) => ensureVert(p));
      const tmpGeom = {
        vertices: [...newVerts.entries()].map(([id, p]) => ({ id, p })),
        faces: [{ id: '_cap', loop, proj: 'pz' }],
      };
      const n = faceNormal(tmpGeom, { loop });
      if (dot(n, outward) < 0) {
        loop = [...loop].reverse();
      }
      // Skip cap if a surviving face is already coplanar and covers the same area.
      const sealed = keptFacePolys.some((f) => {
        const fg = {
          vertices: [...newVerts.entries()].map(([id, p]) => ({ id, p })),
          faces: [f],
        };
        const fn = faceNormal(fg, f);
        if (Math.abs(dot(fn, plane.normal)) < 0.999) return false;
        // All verts of f near plane?
        const vm = new Map(fg.vertices.map((v) => [v.id, v.p]));
        return f.loop.every((id) => Math.abs(signedDistance(plane, vm.get(id))) <= ON_EPS * 2);
      });
      if (!sealed) {
        const capId = allocNewFaceId(keptFacePolys.map((f) => f.id), geometry.nextFace || 0);
        capFace = {
          id: capId,
          loop,
          proj: projFromNormal(outward[0], outward[1], outward[2]),
        };
        keptFacePolys.push(capFace);
      }
    }
  }

  if (keptFacePolys.length < 4 || newVerts.size < 4) {
    return {
      ok: false,
      code: 'DEGENERATE',
      message: 'Clip produced degenerate geometry (too few faces/verts).',
    };
  }

  const vertices = [...newVerts.entries()].map(([id, p]) => ({ id, p }));
  const faces = keptFacePolys;
  const geom = createGeometryFromParts(vertices, faces, geometry.uvOrigin || [0, 0, 0]);

  // Preserve materials / UVs for surviving original face IDs only (cap has none — Q3).
  const srcMats = options.faceMaterials || null;
  const srcUvs = options.faceUVs || null;
  const faceIds = new Set(faces.map((f) => f.id));
  const faceMaterials = {};
  const faceUVs = {};
  if (srcMats) {
    for (const [fid, mid] of Object.entries(srcMats)) {
      if (faceIds.has(fid) && (!capFace || fid !== capFace.id)) faceMaterials[fid] = mid;
    }
  }
  if (srcUvs) {
    for (const [fid, uv] of Object.entries(srcUvs)) {
      if (faceIds.has(fid) && (!capFace || fid !== capFace.id)) {
        faceUVs[fid] = structuredClone(uv);
      }
    }
  }
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
    capFaceId: capFace?.id || null,
  };
}

function allocNewFaceId(existingIds, nextFaceHint) {
  const used = new Set(existingIds);
  let n = Math.max(0, nextFaceHint | 0);
  for (;;) {
    const id = `f${n}`;
    if (!used.has(id)) return id;
    n += 1;
  }
}

/**
 * Sutherland–Hodgman clip of a convex polygon against one half-space.
 * Intersection points are pushed to `capSink`.
 */
function clipPolygon(pts, plane, isKept, isOut, capSink) {
  if (pts.length < 3) return [];
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = signedDistance(plane, a);
    const db = signedDistance(plane, b);
    const aKeep = isKept(da);
    const bKeep = isKept(db);

    if (aKeep && bKeep) {
      out.push(b);
    } else if (aKeep && !bKeep) {
      const hit = intersectEdge(a, b, da, db, plane);
      out.push(hit);
      capSink.push(hit);
    } else if (!aKeep && bKeep) {
      const hit = intersectEdge(a, b, da, db, plane);
      out.push(hit);
      capSink.push(hit);
      out.push(b);
    }
    // both out → nothing
    void isOut;
  }
  return out;
}

function intersectEdge(a, b, da, db, plane) {
  const denom = da - db;
  if (Math.abs(denom) < 1e-12) {
    // Nearly parallel — pick the endpoint closer to the plane.
    return Math.abs(da) <= Math.abs(db) ? roundVec3(a) : roundVec3(b);
  }
  const t = da / denom;
  const p = add(a, scale(sub(b, a), t));
  // Project onto plane to kill drift.
  const sd = signedDistance(plane, p);
  return roundVec3(sub(p, scale(plane.normal, sd)));
}

function uniquePoints(pts) {
  const map = new Map();
  for (const p of pts) {
    const rp = roundVec3(p);
    map.set(`${rp[0]},${rp[1]},${rp[2]}`, rp);
  }
  return [...map.values()];
}

/** Order points as a convex polygon in the plane (CCW about normal). */
function orderPolygonOnPlane(points, normal) {
  if (points.length < 3) return points;
  const n = normalize(normal);
  // Build orthonormal basis on the plane.
  const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(n, ref));
  const v = cross(n, u);
  const origin = points[0];
  const pts2 = points.map((p) => {
    const d = sub(p, origin);
    return { p, x: dot(d, u), y: dot(d, v) };
  });
  // Centroid in 2D
  let cx = 0;
  let cy = 0;
  for (const q of pts2) {
    cx += q.x;
    cy += q.y;
  }
  cx /= pts2.length;
  cy /= pts2.length;
  pts2.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return pts2.map((q) => q.p);
}
