// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { getWorldMatrix } from '../../core/hierarchy.js';
import { mat4TransformPoint } from '../../core/math3d.js';
import { listGeometryEdges, parseEdgeKey } from '../../geometry/edits.js';
import { getStructuralComponent, surfaceIdFromHit } from '../surfaces.js';
import { distPointToSegment2D, closestParamOnSegment2D } from './shared.js';

export class PickingMethods {
  getRaycaster(normalizedX, normalizedY, camera = this.camera) {
    this._pointer.set(normalizedX, normalizedY);
    this._raycaster.setFromCamera(this._pointer, camera);
    return this._raycaster;
  }

  pickGizmo(normalizedX, normalizedY, camera = this.camera) {
    if (!this.gizmo || !this._showEditorOverlays()) return null;
    this.gizmo.updateScreenScale?.(camera);
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    return this.gizmo.pick(raycaster);
  }

  pickActorId(normalizedX, normalizedY, camera = this.camera) {
    const hits = this.pickWorldHits(normalizedX, normalizedY, camera);
    return hits[0]?.actorId || null;
  }

  /**
   * Pick a semantic surface under the cursor (Phase 2E.1).
   * @returns {{ actorId: string, surfaceId: string, componentType: string } | null}
   */
  pickSurface(normalizedX, normalizedY, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const meshes = [];
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.userData.pickable && !obj.userData.placementIgnore && !obj.userData.editorOnly) {
        meshes.push(obj);
      }
    });
    const intersects = raycaster.intersectObjects(meshes, false);
    for (const inter of intersects) {
      const actorId = inter.object.userData.actorId;
      if (!actorId) continue;
      const entry = this._actorMeshes.get(actorId);
      const actor = entry?.actor;
      if (actor && !this._isActorEditorVisible(actor, actor.world)) continue;
      // Locked still picks for surface dress (World Solid is locked but must
      // accept material drag / Face Texture). Lock only blocks transforms.
      const comp = getStructuralComponent(actor);
      if (!comp) continue;
      const surfaceId = surfaceIdFromHit(inter.object, inter.faceIndex);
      if (!surfaceId) continue;
      return {
        actorId,
        surfaceId,
        componentType: comp.type,
        faceIndex: inter.faceIndex,
        point: inter.point?.clone?.() || null,
      };
    }
    return null;
  }

  /**
   * Pick a ConvexBrush face for Geometry Face mode (Phase 2F.1).
   * @returns {{ actorId: string, faceId: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryFace(normalizedX, normalizedY, camera = this.camera) {
    const hit = this.pickSurface(normalizedX, normalizedY, camera);
    if (!hit || hit.componentType !== 'ConvexBrush') return null;
    const entry = this._actorMeshes.get(hit.actorId);
    const actor = entry?.actor;
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.isValid) return null;
    let pointLocal = null;
    if (hit.point && entry?.group) {
      const local = entry.group.worldToLocal(hit.point.clone());
      pointLocal = {
        x: local.x * 100,
        y: local.y * 100,
        z: local.z * 100,
      };
    }
    return {
      actorId: hit.actorId,
      faceId: hit.surfaceId,
      pointLocal,
    };
  }

  /**
   * Screen-space edge pick (Phase 2F.2).
   * Nearest projected edge within thresholdPx; depth-checked against brush hit unless xray.
   * @returns {{ actorId: string, edgeKey: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryEdge(normalizedX, normalizedY, camera = this.camera, options = {}) {
    const thresholdPx = Number(options.thresholdPx) > 0
      ? Number(options.thresholdPx)
      : this.geometryEdgePickThresholdPx;
    const xray = Boolean(options.xray);
    const cam = camera || this.camera;
    if (!cam) return null;

    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const width = size.x || this.renderer?.domElement?.clientWidth || 1;
    const height = size.y || this.renderer?.domElement?.clientHeight || 1;
    const pointerPx = {
      x: (normalizedX * 0.5 + 0.5) * width,
      y: (-normalizedY * 0.5 + 0.5) * height,
    };

    const surfaceHit = this.pickSurface(normalizedX, normalizedY, cam);
    const surfaceDist = surfaceHit?.point
      ? cam.position.distanceTo(surfaceHit.point)
      : null;

    let best = null;
    let bestDist = thresholdPx;

    for (const [actorId, entry] of this._actorMeshes) {
      const actor = entry?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.isValid || !convex.geometry || !entry?.group) continue;
      if (!xray && surfaceHit && surfaceHit.actorId !== actorId) continue;

      const worldMat = getWorldMatrix(actor, actor.world);
      const vmap = new Map((convex.geometry.vertices || []).map((v) => [v.id, v.p]));
      const edges = listGeometryEdges(convex.geometry);

      for (const key of edges) {
        const parts = parseEdgeKey(key);
        if (!parts) continue;
        const a = vmap.get(parts[0]);
        const b = vmap.get(parts[1]);
        if (!a || !b) continue;

        const wa = mat4TransformPoint(worldMat, { x: a[0], y: a[1], z: a[2] });
        const wb = mat4TransformPoint(worldMat, { x: b[0], y: b[1], z: b[2] });
        const pa = new THREE.Vector3(toMeters(wa.x), toMeters(wa.y), toMeters(wa.z));
        const pb = new THREE.Vector3(toMeters(wb.x), toMeters(wb.y), toMeters(wb.z));

        // Depth check: reject edges clearly behind the surface hit.
        if (!xray && surfaceDist != null) {
          const mid = pa.clone().add(pb).multiplyScalar(0.5);
          const midDist = cam.position.distanceTo(mid);
          if (midDist > surfaceDist + 0.05) continue;
        }

        const sa = this._projectToScreenPx(pa, cam, width, height);
        const sb = this._projectToScreenPx(pb, cam, width, height);
        if (!sa || !sb) continue;
        const dist = distPointToSegment2D(pointerPx, sa, sb);
        if (dist < bestDist) {
          bestDist = dist;
          const t = closestParamOnSegment2D(pointerPx, sa, sb);
          const localHint = [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
          ];
          best = {
            actorId,
            edgeKey: key,
            pointLocal: { x: localHint[0], y: localHint[1], z: localHint[2] },
            screenDist: dist,
          };
        }
      }
    }
    return best;
  }

  _projectToScreenPx(worldMeters, camera, width, height) {
    const v = worldMeters.clone().project(camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
    if (v.z < -1 || v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
    };
  }

  /**
   * Screen-space vertex pick (Phase 2F.3).
   * Nearest projected vertex within thresholdPx; depth-checked unless xray.
   * @returns {{ actorId: string, vertexId: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryVertex(normalizedX, normalizedY, camera = this.camera, options = {}) {
    const thresholdPx = Number(options.thresholdPx) > 0
      ? Number(options.thresholdPx)
      : this.geometryVertexPickThresholdPx;
    const xray = Boolean(options.xray);
    const cam = camera || this.camera;
    if (!cam) return null;

    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const width = size.x || this.renderer?.domElement?.clientWidth || 1;
    const height = size.y || this.renderer?.domElement?.clientHeight || 1;
    const pointerPx = {
      x: (normalizedX * 0.5 + 0.5) * width,
      y: (-normalizedY * 0.5 + 0.5) * height,
    };

    const surfaceHit = this.pickSurface(normalizedX, normalizedY, cam);
    const surfaceDist = surfaceHit?.point
      ? cam.position.distanceTo(surfaceHit.point)
      : null;

    let best = null;
    let bestDist = thresholdPx;

    for (const [actorId, entry] of this._actorMeshes) {
      const actor = entry?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.isValid || !convex.geometry || !entry?.group) continue;
      if (!xray && surfaceHit && surfaceHit.actorId !== actorId) continue;

      const worldMat = getWorldMatrix(actor, actor.world);
      for (const vert of convex.geometry.vertices || []) {
        const p = vert.p;
        if (!p) continue;
        const wp = mat4TransformPoint(worldMat, { x: p[0], y: p[1], z: p[2] });
        const wm = new THREE.Vector3(toMeters(wp.x), toMeters(wp.y), toMeters(wp.z));

        if (!xray && surfaceDist != null) {
          const d = cam.position.distanceTo(wm);
          if (d > surfaceDist + 0.05) continue;
        }

        const sp = this._projectToScreenPx(wm, cam, width, height);
        if (!sp) continue;
        const dist = Math.hypot(pointerPx.x - sp.x, pointerPx.y - sp.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = {
            actorId,
            vertexId: vert.id,
            pointLocal: { x: p[0], y: p[1], z: p[2] },
            screenDist: dist,
          };
        }
      }
    }
    return best;
  }

  /**
   * @param {{ actorId: string, surfaceId: string } | null} selection
   */
  setSurfaceSelection(selection) {
    this.selectedSurface = selection && selection.actorId && selection.surfaceId
      ? { actorId: selection.actorId, surfaceId: selection.surfaceId }
      : null;
    this._refreshSurfaceHighlight();
  }

  /**
   * @param {{ actorId: string, surfaceId: string } | null} selection
   */
  setAlignReferenceSurface(selection) {
    this.alignReferenceSurface = selection && selection.actorId && selection.surfaceId
      ? { actorId: selection.actorId, surfaceId: selection.surfaceId }
      : null;
    this._refreshSurfaceHighlight();
  }

  _clearSurfaceHighlight() {
    this._restoreSurfaceEmissives();
  }

  _restoreSurfaceEmissives() {
    for (const entry of this._actorMeshes.values()) {
      entry.group.traverse((obj) => {
        if (!obj.isMesh || !Array.isArray(obj.material)) return;
        for (const mat of obj.material) {
          if (!mat?.userData?._bbSurfaceHighlight) continue;
          if (mat.userData._bbPrevEmissive && mat.emissive) {
            mat.emissive.copy(mat.userData._bbPrevEmissive);
          }
          if (mat.userData._bbPrevEmissiveIntensity != null) {
            mat.emissiveIntensity = mat.userData._bbPrevEmissiveIntensity;
          }
          delete mat.userData._bbPrevEmissive;
          delete mat.userData._bbPrevEmissiveIntensity;
          delete mat.userData._bbSurfaceHighlight;
          mat.needsUpdate = true;
        }
      });
    }
  }

  _paintSurfaceHighlight(sel, color, intensity = 0.55) {
    if (!sel) return;
    const entry = this._actorMeshes.get(sel.actorId);
    if (!entry) return;
    const highlight = color instanceof THREE.Color ? color : new THREE.Color(color);
    entry.group.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.pickable) return;
      const ids = obj.userData.surfaceIds;
      if (!ids?.length || !Array.isArray(obj.material)) return;
      const matIndex = ids.indexOf(sel.surfaceId);
      if (matIndex < 0) return;
      const mat = obj.material[matIndex];
      if (!mat?.emissive) return;
      if (!mat.userData._bbSurfaceHighlight) {
        mat.userData._bbPrevEmissive = mat.emissive.clone();
        mat.userData._bbPrevEmissiveIntensity = mat.emissiveIntensity;
        mat.userData._bbSurfaceHighlight = true;
      }
      mat.emissive.copy(highlight);
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, intensity);
      mat.needsUpdate = true;
    });
  }

  _refreshSurfaceHighlight() {
    this._restoreSurfaceEmissives();
    if (!this.editMode) return;
    // Reference (amber) then selection (viewport selection color) so target wins if same.
    if (this.alignReferenceSurface) {
      this._paintSurfaceHighlight(this.alignReferenceSurface, 0xe8a838, 0.5);
    }
    if (this.selectedSurface) {
      this._paintSurfaceHighlight(
        this.selectedSurface,
        this.viewportColors.selection,
        0.55,
      );
    }
  }

  /**
   * Raycast all pickable meshes (including non-collidable props).
   * Returns nearest-first hits in editor units with normals and actor metadata.
   */
  pickWorldHits(normalizedX, normalizedY, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const meshes = [];
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.userData.pickable && !obj.userData.placementIgnore) {
        meshes.push(obj);
      }
    });
    const intersects = raycaster.intersectObjects(meshes, false);
    const seen = new Set();
    const hits = [];
    for (const inter of intersects) {
      const actorId = inter.object.userData.actorId || null;
      const key = `${actorId}|${inter.faceIndex}|${inter.distance.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = actorId ? this._actorMeshes.get(actorId) : null;
      const actor = entry?.actor || null;
      // Skip layer-hidden / actor-hidden in edit mode (Play uses authored visibility only via group.visible).
      if (actor && !this._isActorEditorVisible(actor, actor.world)) continue;
      const tags = actor?.tags ? [...actor.tags] : [];
      let brushKind = null;
      if (tags.includes('ceiling')) brushKind = 'ceiling';
      else if (tags.includes('floor')) brushKind = 'floor';
      else if (tags.includes('wall')) brushKind = 'wall';
      else if (tags.includes('box')) brushKind = 'box';

      const n = inter.face?.normal
        ? inter.face.normal.clone()
        : new THREE.Vector3(0, 1, 0);
      // Transform normal into world space.
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(inter.object.matrixWorld);
      n.applyMatrix3(normalMatrix).normalize();

      hits.push({
        actorId,
        distance: inter.distance,
        point: {
          x: inter.point.x * 100,
          y: inter.point.y * 100,
          z: inter.point.z * 100,
        },
        normal: { x: n.x, y: n.y, z: n.z },
        tags,
        brushKind,
        locked: actor ? this._isActorEditorLocked(actor, actor.world) : false,
        visible: actor ? this._isActorEditorVisible(actor, actor.world) : true,
        editorOnly: Boolean(inter.object.userData.editorOnly),
        placeable: inter.object.userData.placeable !== false,
        collidable: actor?.getComponent?.('Brush')?.collidable
          ?? actor?.getComponent?.('StaticMesh')?.collidable
          ?? true,
        componentType: actor?.components?.find((c) => c.enabled)?.type || null,
      });
    }
    return hits;
  }

  /**
   * Intersect construction plane y = planeY (editor units).
   */
  pickConstructionPoint(normalizedX, normalizedY, planeYEditor = 0, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const yMeters = toMeters(planeYEditor);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMeters);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return {
      x: hit.x * 100,
      y: planeYEditor,
      z: hit.z * 100,
    };
  }
}
