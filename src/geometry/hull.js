/**
 * Deterministic 3D convex hull with coplanar face merge (Phase 2F.0).
 * No randomness. Suitable for ≤ MAX_VERTICES points.
 */

import {
  COPLANAR_DIST_EPS,
  COPLANAR_NORMAL_DOT,
  CONVEX_EPS,
} from './limits.js';
import {
  cross,
  dot,
  length,
  normalize,
  roundVec3,
  sub,
} from './convexBrush.js';

/**
 * Build a convex hull from points with stable ids.
 *
 * @param {{ id: string, p: [number,number,number] }[]} points
 * @returns {{
 *   ok: true,
 *   vertices: {id,p}[],
 *   faces: { loop: string[], normal: number[], centroid: number[] }[],
 *   interior: string[],
 *   merged: string[],
 * } | { ok: false, code: string, message: string }}
 */
export function buildConvexHull(points) {
  if (!Array.isArray(points) || points.length < 4) {
    return { ok: false, code: 'TOPOLOGY', message: 'Hull needs at least 4 points.' };
  }

  // Deduplicate nearly-coincident points (keep lowest id).
  const sorted = [...points].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const unique = [];
  const merged = [];
  for (const pt of sorted) {
    const p = roundVec3(pt.p);
    const dup = unique.find((u) => length(sub(u.p, p)) <= COPLANAR_DIST_EPS);
    if (dup) {
      merged.push(pt.id);
      continue;
    }
    unique.push({ id: pt.id, p });
  }
  if (unique.length < 4) {
    return {
      ok: false,
      code: 'VERTEX_MERGE',
      message: 'Too few distinct vertices after merge.',
    };
  }

  const tris = [];
  const seenTri = new Set();
  const n = unique.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        const a = unique[i];
        const b = unique[j];
        const c = unique[k];
        const ab = sub(b.p, a.p);
        const ac = sub(c.p, a.p);
        const rawN = cross(ab, ac);
        const nLen = length(rawN);
        if (nLen < 1e-10) continue;
        let normal = [rawN[0] / nLen, rawN[1] / nLen, rawN[2] / nLen];
        let loop = [a.id, b.id, c.id];

        let pos = 0;
        let neg = 0;
        for (let t = 0; t < n; t += 1) {
          if (t === i || t === j || t === k) continue;
          const d = dot(sub(unique[t].p, a.p), normal);
          if (d > CONVEX_EPS) pos += 1;
          else if (d < -CONVEX_EPS) neg += 1;
        }
        if (pos > 0 && neg > 0) continue; // not a supporting face
        if (pos === 0 && neg === 0) continue; // degenerate / all coplanar
        // Orient outward: all other points behind the plane.
        if (pos > 0) {
          loop = [a.id, c.id, b.id];
          normal = [-normal[0], -normal[1], -normal[2]];
        }
        const key = [...loop].sort().join('|');
        if (seenTri.has(key)) continue;
        seenTri.add(key);
        tris.push({
          loop,
          normal,
          centroid: [
            (a.p[0] + b.p[0] + c.p[0]) / 3,
            (a.p[1] + b.p[1] + c.p[1]) / 3,
            (a.p[2] + b.p[2] + c.p[2]) / 3,
          ],
        });
      }
    }
  }

  if (tris.length < 4) {
    return { ok: false, code: 'TOPOLOGY', message: 'Could not form a closed hull.' };
  }

  const faces = mergeCoplanarTriangles(tris, unique);
  const used = new Set();
  for (const f of faces) {
    for (const id of f.loop) used.add(id);
  }
  const interior = unique.filter((u) => !used.has(u.id)).map((u) => u.id);

  return {
    ok: true,
    vertices: unique.filter((u) => used.has(u.id)),
    faces,
    interior,
    merged,
  };
}

function mergeCoplanarTriangles(tris, points) {
  const pmap = new Map(points.map((p) => [p.id, p.p]));
  const used = new Array(tris.length).fill(false);
  const faces = [];

  for (let i = 0; i < tris.length; i += 1) {
    if (used[i]) continue;
    const seed = tris[i];
    const ids = new Set(seed.loop);
    used[i] = true;
    for (let j = i + 1; j < tris.length; j += 1) {
      if (used[j]) continue;
      const t = tris[j];
      if (dot(seed.normal, t.normal) < COPLANAR_NORMAL_DOT) continue;
      const dist = Math.abs(dot(sub(t.centroid, seed.centroid), seed.normal));
      if (dist > COPLANAR_DIST_EPS) continue;
      used[j] = true;
      for (const id of t.loop) ids.add(id);
    }
    const loop = convexLoopOnPlane([...ids], pmap, seed.normal);
    if (loop.length >= 3) {
      faces.push({
        loop,
        normal: seed.normal,
        centroid: faceCentroidFromLoop(loop, pmap),
      });
    }
  }

  faces.sort((a, b) => {
    for (let k = 0; k < 3; k += 1) {
      if (a.centroid[k] !== b.centroid[k]) return a.centroid[k] - b.centroid[k];
    }
    return a.loop[0].localeCompare(b.loop[0], 'en');
  });
  return faces;
}

function faceCentroidFromLoop(loop, pmap) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const id of loop) {
    const p = pmap.get(id);
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = loop.length || 1;
  return [x / n, y / n, z / n];
}

/**
 * 2D convex hull of coplanar points, returned as a CCW loop wrt outward normal.
 */
function convexLoopOnPlane(ids, pmap, normal) {
  if (ids.length < 3) return [];
  const n = normalize(normal);
  // Build tangent basis.
  const axis = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(n, axis));
  const v = cross(n, u);
  const pts = ids.map((id) => {
    const p = pmap.get(id);
    return {
      id,
      x: dot(p, u),
      y: dot(p, v),
    };
  });
  pts.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

  const cross2 = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return [];
  const loop = hull.map((p) => p.id);

  // Ensure CCW when viewed along outward normal (right-hand in u/v with n = u×v).
  // Andrew's algorithm already produces CCW in the u/v plane when n = u×v.
  // Verify against 3D triangle normal.
  const p0 = pmap.get(loop[0]);
  const p1 = pmap.get(loop[1]);
  const p2 = pmap.get(loop[2]);
  const triN = normalize(cross(sub(p1, p0), sub(p2, p0)));
  if (dot(triN, n) < 0) loop.reverse();
  return loop;
}
