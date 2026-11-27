import * as THREE from 'three';
import { edgeKey, listGeometryEdges, parseEdgeKey } from '../../geometry/edits.js';

/**
 * Normalize a screen-space marquee to { minX, minY, maxX, maxY } in NDC (-1..1).
 * Input corners are NDC.
 */
export function normalizeMarqueeNdc(a, b) {
  if (!a || !b) return null;
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
  };
}

export function ndcPointInMarquee(ndc, rect) {
  if (!ndc || !rect) return false;
  return (
    ndc.x >= rect.minX
    && ndc.x <= rect.maxX
    && ndc.y >= rect.minY
    && ndc.y <= rect.maxY
  );
}

/** Project a world-space Vector3 to NDC using camera. */
export function projectWorldToNdc(worldPos, camera, out = new THREE.Vector3()) {
  out.copy(worldPos).project(camera);
  return out;
}

/**
 * True if any of the world points projects inside the marquee (and in front of camera).
 */
export function anyPointInMarquee(worldPoints, camera, marquee) {
  if (!marquee || !worldPoints?.length || !camera) return false;
  const v = new THREE.Vector3();
  for (const p of worldPoints) {
    v.set(p.x, p.y, p.z).project(camera);
    if (v.z < -1 || v.z > 1) continue;
    if (ndcPointInMarquee({ x: v.x, y: v.y }, marquee)) return true;
  }
  return false;
}

/**
 * True if the AABB (Box3 in world meters) intersects the marquee when projected.
 * Uses the 8 corners.
 */
export function boxIntersectsMarquee(box, camera, marquee) {
  if (!box || box.isEmpty() || !camera || !marquee) return false;
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  return anyPointInMarquee(corners, camera, marquee);
}

/**
 * Select actor ids whose mesh groups intersect the marquee.
 * @param {Map<string, { group: THREE.Object3D, actor?: object }>} actorMeshes
 * @param {THREE.Camera} camera
 * @param {{minX,maxX,minY,maxY}} marquee
 * @param {{ isSelectable?: (actorId: string, entry: object) => boolean }} [opts]
 */
export function marqueeSelectActors(actorMeshes, camera, marquee, opts = {}) {
  const ids = [];
  if (!actorMeshes || !camera || !marquee) return ids;
  const box = new THREE.Box3();
  for (const [actorId, entry] of actorMeshes) {
    if (!entry?.group) continue;
    if (entry.group.visible === false) continue;
    if (opts.isSelectable && !opts.isSelectable(actorId, entry)) continue;
    box.setFromObject(entry.group);
    if (boxIntersectsMarquee(box, camera, marquee)) ids.push(actorId);
  }
  return ids;
}

function vertexMap(geometry) {
  const map = new Map();
  for (const v of geometry?.vertices || []) {
    if (v?.id != null && Array.isArray(v.p)) map.set(String(v.id), v.p);
  }
  return map;
}

/**
 * Marquee-select geometry elements for the active geometry mode.
 * @param {'face'|'edge'|'vertex'} elementMode
 * @param {object} sceneView SceneView with actor mesh map
 * @param {import('../../core/World.js').World} world
 * @param {THREE.Camera} camera
 * @param {{minX,maxX,minY,maxY}} marquee
 * @returns {Array<{ actorId: string, id: string }>}
 */
export function marqueeSelectGeometry(elementMode, sceneView, world, camera, marquee) {
  const hits = [];
  if (!sceneView || !world || !camera || !marquee) return hits;
  const actorMeshes = sceneView._actorMeshes;
  if (!actorMeshes) return hits;

  const tmp = new THREE.Vector3();
  const box = new THREE.Box3();

  for (const actor of world.actors) {
    const convex = actor.getComponent?.('ConvexBrush');
    if (!convex?.geometry) continue;
    const entry = actorMeshes.get(actor.id);
    if (!entry?.group) continue;

    entry.group.updateWorldMatrix(true, true);
    const geom = convex.geometry;
    const vmap = vertexMap(geom);

    if (elementMode === 'vertex') {
      for (const [vid, p] of vmap) {
        tmp.set(p[0] * 0.01, p[1] * 0.01, p[2] * 0.01);
        entry.group.localToWorld(tmp);
        tmp.project(camera);
        if (tmp.z >= -1 && tmp.z <= 1 && ndcPointInMarquee({ x: tmp.x, y: tmp.y }, marquee)) {
          hits.push({ actorId: actor.id, id: vid });
        }
      }
    } else if (elementMode === 'edge') {
      for (const key of listGeometryEdges(geom)) {
        const parts = parseEdgeKey(key);
        if (!parts) continue;
        const a = vmap.get(parts[0]);
        const b = vmap.get(parts[1]);
        if (!a || !b) continue;
        tmp.set(
          ((a[0] + b[0]) * 0.5) * 0.01,
          ((a[1] + b[1]) * 0.5) * 0.01,
          ((a[2] + b[2]) * 0.5) * 0.01,
        );
        entry.group.localToWorld(tmp);
        tmp.project(camera);
        if (tmp.z >= -1 && tmp.z <= 1 && ndcPointInMarquee({ x: tmp.x, y: tmp.y }, marquee)) {
          hits.push({ actorId: actor.id, id: key });
        }
      }
    } else if (elementMode === 'face') {
      for (const face of geom.faces || []) {
        const loop = face.loop || [];
        if (!loop.length) continue;
        box.makeEmpty();
        for (const vid of loop) {
          const p = vmap.get(String(vid));
          if (!p) continue;
          tmp.set(p[0] * 0.01, p[1] * 0.01, p[2] * 0.01);
          entry.group.localToWorld(tmp);
          box.expandByPoint(tmp);
        }
        if (!box.isEmpty() && boxIntersectsMarquee(box, camera, marquee)) {
          hits.push({ actorId: actor.id, id: String(face.id) });
        }
      }
    }
  }
  return hits;
}

export { edgeKey };
