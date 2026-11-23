import * as THREE from 'three';
import { toMeters, toEditorUnits } from '../core/units.js';

const AXIS_COLORS = {
  x: 0xe74c3c,
  y: 0x2ecc71,
  z: 0x3498db,
};

/**
 * Edit-mode move/resize handles rendered in the shared SceneView.
 * Operates in meters visually; reports editor-unit deltas to the editor.
 */
export class BrushGizmo {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'BrushGizmo';
    this.root.visible = false;
    scene.add(this.root);

    this.moveGroup = new THREE.Group();
    this.resizeGroup = new THREE.Group();
    this.root.add(this.moveGroup);
    this.root.add(this.resizeGroup);

    this._handles = [];
    this._primaryBrush = null; // { position, size } editor units
    this._selectionCenter = new THREE.Vector3();
    this._drag = null;

    this._buildMoveHandles();
  }

  _buildMoveHandles() {
    const makeArrow = (axis, color) => {
      const dir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      );
      const origin = new THREE.Vector3(0, 0, 0);
      const arrow = new THREE.ArrowHelper(dir, origin, 0.9, color, 0.18, 0.1);
      arrow.userData = { kind: 'move', axis };
      // Enlarge pick target
      const pick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthTest: false,
        }),
      );
      pick.position.copy(dir.clone().multiplyScalar(0.45));
      if (axis === 'x') pick.rotation.z = -Math.PI / 2;
      if (axis === 'z') pick.rotation.x = Math.PI / 2;
      pick.userData = { kind: 'move', axis };
      pick.renderOrder = 10;
      const group = new THREE.Group();
      group.add(arrow);
      group.add(pick);
      group.userData = { kind: 'move', axis };
      this.moveGroup.add(group);
      this._handles.push(pick);
    };

    makeArrow('x', AXIS_COLORS.x);
    makeArrow('y', AXIS_COLORS.y);
    makeArrow('z', AXIS_COLORS.z);
  }

  setVisible(visible) {
    this.root.visible = !!visible;
  }

  /**
   * @param {Array<{position: object, size?: object}>} brushStates editor-unit brush AABBs
   * @param {object|null} primary primary brush for resize handles
   */
  update(brushStates, primary) {
    this._handles = this._handles.filter((h) => h.userData.kind === 'move');
    while (this.resizeGroup.children.length) {
      const child = this.resizeGroup.children[0];
      this.resizeGroup.remove(child);
      child.traverse?.((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
    }

    if (!brushStates || brushStates.length === 0) {
      this.setVisible(false);
      this._primaryBrush = null;
      return;
    }

    this.setVisible(true);
    this._primaryBrush = primary || brushStates[0];

    // Selection center (editor units -> meters)
    const center = { x: 0, y: 0, z: 0 };
    for (const b of brushStates) {
      center.x += b.position.x;
      center.y += b.position.y;
      center.z += b.position.z;
    }
    center.x /= brushStates.length;
    center.y /= brushStates.length;
    center.z /= brushStates.length;
    this._selectionCenter.set(toMeters(center.x), toMeters(center.y), toMeters(center.z));
    this.root.position.copy(this._selectionCenter);

    if (this._primaryBrush?.size) {
      this._buildResizeHandles(this._primaryBrush);
    }
  }

  _buildResizeHandles(brush) {
    const half = {
      x: toMeters(brush.size.x) * 0.5,
      y: toMeters(brush.size.y) * 0.5,
      z: toMeters(brush.size.z) * 0.5,
    };
    // Offset from selection center to primary brush center
    const primaryCenter = new THREE.Vector3(
      toMeters(brush.position.x),
      toMeters(brush.position.y),
      toMeters(brush.position.z),
    );
    const localOffset = primaryCenter.clone().sub(this._selectionCenter);

    const faces = [
      { axis: 'x', sign: 1, pos: [half.x, 0, 0] },
      { axis: 'x', sign: -1, pos: [-half.x, 0, 0] },
      { axis: 'y', sign: 1, pos: [0, half.y, 0] },
      { axis: 'y', sign: -1, pos: [0, -half.y, 0] },
      { axis: 'z', sign: 1, pos: [0, 0, half.z] },
      { axis: 'z', sign: -1, pos: [0, 0, -half.z] },
    ];

    for (const face of faces) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({
          color: AXIS_COLORS[face.axis],
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      mesh.position.set(
        localOffset.x + face.pos[0],
        localOffset.y + face.pos[1],
        localOffset.z + face.pos[2],
      );
      mesh.renderOrder = 11;
      mesh.userData = { kind: 'resize', axis: face.axis, sign: face.sign };
      this.resizeGroup.add(mesh);
      this._handles.push(mesh);
    }
  }

  pick(raycaster) {
    if (!this.root.visible) return null;
    const hits = raycaster.intersectObjects(this._handles, false);
    if (!hits.length) return null;
    const obj = hits[0].object;
    return {
      kind: obj.userData.kind,
      axis: obj.userData.axis,
      sign: obj.userData.sign ?? 1,
      point: hits[0].point.clone(),
    };
  }

  beginDrag(handle, pointerRay) {
    this._drag = {
      kind: handle.kind,
      axis: handle.axis,
      sign: handle.sign ?? 1,
      startPoint: this._projectAxis(pointerRay, handle.axis, handle.point),
      primary: this._primaryBrush
        ? {
            position: { ...this._primaryBrush.position },
            size: { ...this._primaryBrush.size },
          }
        : null,
    };
    return this._drag;
  }

  /**
   * @returns {{ axis, kind, deltaEditor: number } | null}
   */
  sampleDrag(pointerRay) {
    if (!this._drag) return null;
    const now = this._projectAxis(pointerRay, this._drag.axis, this._drag.startPoint);
    if (!now || !this._drag.startPoint) return null;
    const deltaMeters = now - this._axisComponent(this._drag.startPoint, this._drag.axis);
    return {
      kind: this._drag.kind,
      axis: this._drag.axis,
      sign: this._drag.sign,
      deltaEditor: toEditorUnits(deltaMeters),
      primaryBefore: this._drag.primary,
    };
  }

  endDrag() {
    const drag = this._drag;
    this._drag = null;
    return drag;
  }

  _axisComponent(point, axis) {
    return point[axis];
  }

  _projectAxis(ray, axis, referencePoint) {
    // Intersect ray with plane that contains the axis and faces the camera-ish view:
    // use the plane whose normal is the cross of axis and a stable up/right.
    const axisVec = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    );
    const ref = referencePoint?.clone?.() || this._selectionCenter.clone();
    // Choose plane normal perpendicular to axis with largest camera alignment via ray direction
    const rayDir = ray.direction.clone().normalize();
    let planeNormal = new THREE.Vector3().crossVectors(axisVec, rayDir).normalize();
    if (planeNormal.lengthSq() < 1e-6) {
      planeNormal = new THREE.Vector3().crossVectors(axisVec, new THREE.Vector3(0, 1, 0)).normalize();
      if (planeNormal.lengthSq() < 1e-6) {
        planeNormal = new THREE.Vector3(1, 0, 0);
      }
    }
    // Better: plane through ref, normal = component of rayDir orthogonal to axis
    planeNormal = rayDir.clone().sub(axisVec.clone().multiplyScalar(rayDir.dot(axisVec)));
    if (planeNormal.lengthSq() < 1e-6) {
      planeNormal = axis === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    } else {
      planeNormal.normalize();
    }

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, ref);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return null;
    return hit;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
