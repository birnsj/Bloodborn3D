// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { getWorldMatrix, getWorldTransform } from '../../core/hierarchy.js';
import { mat4TransformPoint } from '../../core/math3d.js';
import { edgesCentroidLocal, facesCentroidLocal, parseEdgeKey, verticesCentroidLocal } from '../../geometry/edits.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { disposeObject } from './shared.js';

export class SelectionGizmoMethods {
  /**
   * @param {string|string[]|null} actorIds
   * @param {import('../core/World.js').World|null} world optional, for gizmo brush sizes
   */
  setSelection(actorIds, world = null) {
    const ids = !actorIds
      ? []
      : Array.isArray(actorIds)
        ? [...actorIds]
        : [actorIds];
    this.selectedActorIds = ids;
    this._clearSelectionHelpers();

    for (const id of ids) {
      const entry = this._actorMeshes.get(id);
      if (!entry) continue;
      const box = new THREE.Box3().setFromObject(entry.group);
      if (box.isEmpty()) continue;
      const helper = new THREE.Box3Helper(box, this.viewportColors.selection);
      helper.name = 'SelectionHelper';
      helper.visible = this._showEditorOverlays();
      this.scene.add(helper);
      this._selectionHelpers.push(helper);
    }

    this._updateGizmo(world);
  }

  setTransformMode(mode) {
    this.gizmo?.setMode?.(mode);
  }

  /** @param {'face'|'gizmo'} style */
  setScaleHandleStyle(style) {
    this.gizmo?.setScaleHandleStyle?.(style);
  }

  /**
   * Geometry Face/Edge/Vertex selection overlays + gizmo (Phase 2F.1).
   * @param {object|null} selection
   * @param {object|null} world
   * @param {{ faceNormalWorld?: {x:number,y:number,z:number}|null } } [options]
   */
  setGeometrySelection(selection, world = null, options = {}) {
    this.geometrySelection = selection && selection.items?.length
      ? {
          mode: selection.mode || 'face',
          items: selection.items.map((it) => ({
            actorId: it.actorId,
            ids: [...it.ids],
          })),
          primary: selection.primary || null,
        }
      : null;
    this._refreshGeometryFaceOverlays(world);
    if (this.geometrySelection) {
      this.gizmo?.setGeometryElementMode?.(true, options.faceNormalWorld || null);
      this._updateGeometryGizmo(world, options.gizmoCenter || null);
    } else {
      this.gizmo?.setGeometryElementMode?.(false, null);
      this._updateGizmo(world);
    }
  }

  _clearGeometryFaceOverlays() {
    for (const overlay of this._geometryFaceOverlays) {
      overlay.parent?.remove(overlay);
      disposeObject(overlay);
    }
    this._geometryFaceOverlays = [];
  }

  _refreshGeometryFaceOverlays(world = null) {
    this._clearGeometryFaceOverlays();
    if (!this.geometrySelection?.items?.length || !this.editMode) return;
    const mode = this.geometrySelection.mode || 'face';

    for (const item of this.geometrySelection.items) {
      const actor = world?.getActor?.(item.actorId)
        || this._actorMeshes.get(item.actorId)?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      const entry = this._actorMeshes.get(item.actorId);
      if (!convex?.geometry || !entry?.group) continue;
      const want = new Set(item.ids);

      if (mode === 'edge') {
        for (const key of want) {
          const overlay = this._buildEdgeOverlayLine(convex.geometry, key);
          if (!overlay) continue;
          entry.group.add(overlay);
          this._geometryFaceOverlays.push(overlay);
        }
        continue;
      }

      if (mode === 'vertex') {
        for (const vid of want) {
          const overlay = this._buildVertexOverlayHandle(convex.geometry, vid);
          if (!overlay) continue;
          entry.group.add(overlay);
          this._geometryFaceOverlays.push(overlay);
        }
        continue;
      }

      for (const face of convex.geometry.faces || []) {
        if (!want.has(face.id)) continue;
        const overlay = this._buildFaceOverlayMesh(convex.geometry, face);
        if (!overlay) continue;
        // Parent under actor group so local coords match.
        entry.group.add(overlay);
        this._geometryFaceOverlays.push(overlay);
      }
    }
  }

  _buildVertexOverlayHandle(geometry, vertexId) {
    const v = (geometry.vertices || []).find((x) => x.id === vertexId);
    if (!v?.p) return null;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xf0c040,
        depthTest: true,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.position.set(toMeters(v.p[0]), toMeters(v.p[1]), toMeters(v.p[2]));
    mesh.renderOrder = 11;
    mesh.userData.editorOnly = true;
    mesh.userData.geometryVertexOverlay = true;
    mesh.userData.pickable = false;
    return mesh;
  }

  _buildEdgeOverlayLine(geometry, edgeKeyStr) {
    const parts = parseEdgeKey(edgeKeyStr);
    if (!parts) return null;
    const vmap = new Map((geometry.vertices || []).map((v) => [v.id, v.p]));
    const p0 = vmap.get(parts[0]);
    const p1 = vmap.get(parts[1]);
    if (!p0 || !p1) return null;
    const positions = [
      toMeters(p0[0]), toMeters(p0[1]), toMeters(p0[2]),
      toMeters(p1[0]), toMeters(p1[1]), toMeters(p1[2]),
    ];
    const lineGeom = new LineGeometry();
    lineGeom.setPositions(positions);
    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const mat = new LineMaterial({
      color: 0xf0c040,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      worldUnits: false,
      resolution: size.x > 0 ? size.clone() : new THREE.Vector2(1, 1),
    });
    const line = new Line2(lineGeom, mat);
    line.computeLineDistances();
    line.renderOrder = 10;
    line.userData.editorOnly = true;
    line.userData.geometryEdgeOverlay = true;
    line.userData.pickable = false;
    return line;
  }

  _buildFaceOverlayMesh(geometry, face) {
    const vmap = new Map((geometry.vertices || []).map((v) => [v.id, v.p]));
    const loop = face.loop || [];
    if (loop.length < 3) return null;
    const pos = [];
    const p0 = vmap.get(loop[0]);
    if (!p0) return null;
    for (let i = 1; i < loop.length - 1; i += 1) {
      const p1 = vmap.get(loop[i]);
      const p2 = vmap.get(loop[i + 1]);
      if (!p1 || !p2) continue;
      for (const p of [p0, p1, p2]) {
        pos.push(toMeters(p[0]), toMeters(p[1]), toMeters(p[2]));
      }
    }
    if (!pos.length) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf0c040,
      transparent: true,
      opacity: 0.35,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 9;
    mesh.userData.editorOnly = true;
    mesh.userData.geometryFaceOverlay = true;
    mesh.userData.pickable = false;
    return mesh;
  }

  _updateGeometryGizmo(world, centerOverride = null) {
    if (!this.gizmo || !this.editMode) return;
    const center = centerOverride || this._geometrySelectionWorldCenter(world);
    if (!center) {
      this.gizmo.update([], null);
      return;
    }
    this.gizmo.update([{ position: center }], { position: center });
  }

  _geometrySelectionWorldCenter(world) {
    const sel = this.geometrySelection;
    if (!sel?.items?.length) return null;
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    const mode = sel.mode || 'face';
    for (const item of sel.items) {
      const actor = world?.getActor?.(item.actorId)
        || this._actorMeshes.get(item.actorId)?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.geometry) continue;
      const local = mode === 'edge'
        ? edgesCentroidLocal(convex.geometry, item.ids)
        : mode === 'vertex'
          ? verticesCentroidLocal(convex.geometry, item.ids)
          : facesCentroidLocal(convex.geometry, item.ids);
      const worldMat = getWorldMatrix(actor, world || actor.world);
      const wp = mat4TransformPoint(worldMat, { x: local[0], y: local[1], z: local[2] });
      x += wp.x;
      y += wp.y;
      z += wp.z;
      n += 1;
    }
    if (!n) return null;
    return { x: x / n, y: y / n, z: z / n };
  }

  setPivotEditMode(enabled) {
    this._pivotEditMode = Boolean(enabled);
    this.gizmo?.setMode?.('move');
  }

  setGizmoSpace(space) {
    this._gizmoSpace = space === 'local' ? 'local' : 'world';
    this.gizmo?.setSpace?.(this._gizmoSpace);
    if (this.selectedActorIds?.length) {
      this._updateGizmo(this.world);
    }
  }

  _updateGizmo(world) {
    if (!this.gizmo || !this._showEditorOverlays()) {
      this.gizmo?.setVisible?.(false);
      return;
    }
    if (this.geometrySelection?.items?.length) {
      this._updateGeometryGizmo(world);
      return;
    }
    this.gizmo.setGeometryElementMode?.(false, null);
    if (this._pivotEditMode) this.gizmo.setMode?.('move');
    this.gizmo.setSpace?.(this._gizmoSpace || 'world');
    const brushStates = [];
    let primary = null;
    let primaryActor = null;
    for (const id of this.selectedActorIds) {
      const actor = world?.getActor?.(id) || this._actorMeshes.get(id)?.actor;
      if (!actor) continue;
      const brush = actor.getComponent?.('Brush');
      const worldPos = getWorldTransform(actor, world || actor.world).position;
      const state = {
        position: { ...worldPos },
        // Face-scale handles only for brushes (parametric actors keep size in Details).
        size: brush && !this._pivotEditMode ? { ...brush.size } : undefined,
      };
      brushStates.push(state);
      if (!primary) {
        primary = state;
        primaryActor = actor;
      }
    }
    if (primaryActor && (this._gizmoSpace || 'world') === 'local') {
      const wt = getWorldTransform(primaryActor, world || primaryActor.world);
      this.gizmo.setLocalRotation?.(wt.rotation);
    } else {
      this.gizmo.setLocalRotation?.(null);
    }
    this.gizmo.update(brushStates, primary);
  }

  _clearSelectionHelpers() {
    for (const helper of this._selectionHelpers) {
      this.scene.remove(helper);
      disposeObject(helper);
    }
    this._selectionHelpers = [];
  }
}
