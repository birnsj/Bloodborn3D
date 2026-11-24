/**
 * Three.js adapter for ConvexBrush geometry (Phase 2F.0).
 */

import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { applySurfaceGroups } from './surfaces.js';
import { mapDensityUvArray } from './uvMapping.js';
import { densityUvOnProjection } from '../geometry/uvProjection.js';
import { geometryBounds, vertexMap } from '../geometry/convexBrush.js';

/**
 * Build a non-indexed BufferGeometry with one group per face.
 * Flat normals; per-face density → actor → face UV composition.
 *
 * @param {object} convex ConvexBrushComponent-like
 * @returns {THREE.BufferGeometry|null}
 */
export function createConvexBrushGeometry(convex) {
  const geometry = convex?.geometry;
  if (!geometry?.faces?.length || !geometry?.vertices?.length) return null;

  const vmap = vertexMap(geometry);
  const pos = [];
  const densityUv = [];
  const surfaceIdPerVertex = [];
  const batches = [];
  const size = (() => {
    const b = geometryBounds(geometry);
    return { x: b.size[0], y: b.size[1], z: b.size[2] };
  })();

  for (const face of geometry.faces) {
    const loop = face.loop;
    if (loop.length < 3) continue;
    const pts = loop.map((id) => vmap.get(id)).filter(Boolean);
    if (pts.length < 3) continue;

    let triCount = 0;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const tri = [pts[0], pts[i], pts[i + 1]];
      const ids = [loop[0], loop[i], loop[i + 1]];
      for (let k = 0; k < 3; k += 1) {
        const p = tri[k];
        pos.push(toMeters(p[0]), toMeters(p[1]), toMeters(p[2]));
        const [u, v] = densityUvOnProjection(p, face.proj, {
          size,
          uvOrigin: geometry.uvOrigin,
          geometry,
        });
        densityUv.push(u, v);
        surfaceIdPerVertex.push(face.id);
      }
      triCount += 1;
      void ids;
    }
    if (triCount > 0) {
      batches.push({ surfaceId: face.id, triCount });
    }
  }

  if (!pos.length) return null;

  const uvs = mapDensityUvArray(
    densityUv,
    convex.uv || {},
    convex.faceUVs || null,
    surfaceIdPerVertex,
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const surfaceIds = applySurfaceGroups(geom, batches);
  geom.userData.surfaceIds = surfaceIds;
  geom.userData.surfaceScheme = 'grouped';
  geom.computeVertexNormals();
  return geom;
}

/**
 * Flat meters Float32Array for Rapier convexHull (honors actor scale).
 */
export function convexBrushPointsToMetersFlat(geometry, scale = { x: 1, y: 1, z: 1 }) {
  const verts = geometry?.vertices || [];
  const out = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i += 1) {
    const p = verts[i].p;
    out[i * 3] = toMeters(p[0] * (scale.x || 1));
    out[i * 3 + 1] = toMeters(p[1] * (scale.y || 1));
    out[i * 3 + 2] = toMeters(p[2] * (scale.z || 1));
  }
  return out;
}
