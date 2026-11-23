import * as THREE from 'three';
import { toMeters, toEditorUnits } from '../core/units.js';

const AXIS_COLORS = {
  x: 0xe74c3c,
  y: 0x2ecc71,
  z: 0x3498db,
};

export const TRANSFORM_MODES = ['move', 'rotate', 'scale'];

/**
 * Edit-mode transform gizmo: Move (W) / Rotate (E) / Scale (R).
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
    this.rotateGroup = new THREE.Group();
    this.resizeGroup = new THREE.Group();
    this.scaleGroup = new THREE.Group();
    this.root.add(this.moveGroup);
    this.root.add(this.rotateGroup);
    this.root.add(this.resizeGroup);
    this.root.add(this.scaleGroup);

    this.mode = 'move';
    this._handles = [];
    this._primaryBrush = null;
    this._selectionCenter = new THREE.Vector3();
    this._drag = null;
    this._hasBrushSize = false;

    this._buildMoveHandles();
    this._buildRotateHandles();
    this._buildScaleAxisHandles();
    this._applyModeVisibility();
  }

  setMode(mode) {
    const next = TRANSFORM_MODES.includes(mode) ? mode : 'move';
    if (this.mode === next) return;
    this.mode = next;
    this._applyModeVisibility();
  }

  _applyModeVisibility() {
    this.moveGroup.visible = this.mode === 'move';
    this.rotateGroup.visible = this.mode === 'rotate';
    // Brushes: face resize. Others: axis scale boxes.
    this.resizeGroup.visible = this.mode === 'scale' && this._hasBrushSize;
    this.scaleGroup.visible = this.mode === 'scale' && !this._hasBrushSize;
    this._rebuildHandleList();
  }

  _rebuildHandleList() {
    this._handles = [];
    const collect = (group, visible) => {
      if (!visible) return;
      group.traverse((obj) => {
        if (obj.userData?.pickable && obj.userData?.kind) this._handles.push(obj);
      });
    };
    collect(this.moveGroup, this.moveGroup.visible);
    collect(this.rotateGroup, this.rotateGroup.visible);
    collect(this.resizeGroup, this.resizeGroup.visible);
    collect(this.scaleGroup, this.scaleGroup.visible);
  }

  _buildMoveHandles() {
    const makeArrow = (axis, color) => {
      const dir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      );
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), 0.9, color, 0.18, 0.1);
      const pick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false }),
      );
      pick.position.copy(dir.clone().multiplyScalar(0.45));
      if (axis === 'x') pick.rotation.z = -Math.PI / 2;
      if (axis === 'z') pick.rotation.x = Math.PI / 2;
      pick.userData = { kind: 'move', axis, pickable: true };
      pick.renderOrder = 10;
      const group = new THREE.Group();
      group.add(arrow);
      group.add(pick);
      this.moveGroup.add(group);
    };

    makeArrow('x', AXIS_COLORS.x);
    makeArrow('y', AXIS_COLORS.y);
    makeArrow('z', AXIS_COLORS.z);
  }

  _buildRotateHandles() {
    const makeRing = (axis, color) => {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(0.75, 0.035, 8, 48),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      // Torus lies in XY by default; orient so its plane is perpendicular to axis.
      if (axis === 'x') torus.rotation.y = Math.PI / 2;
      if (axis === 'y') torus.rotation.x = Math.PI / 2;
      // z: default
      torus.renderOrder = 12;
      torus.userData = { kind: 'rotate', axis, pickable: true };
      this.rotateGroup.add(torus);
    };
    makeRing('x', AXIS_COLORS.x);
    makeRing('y', AXIS_COLORS.y);
    makeRing('z', AXIS_COLORS.z);
  }

  _buildScaleAxisHandles() {
    const makeBox = (axis, color) => {
      const dir = new THREE.Vector3(
        axis === 'x' ? 1 : 0,
        axis === 'y' ? 1 : 0,
        axis === 'z' ? 1 : 0,
      );
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      mesh.position.copy(dir.multiplyScalar(0.85));
      mesh.renderOrder = 11;
      mesh.userData = { kind: 'scale', axis, pickable: true };
      this.scaleGroup.add(mesh);
    };
    makeBox('x', AXIS_COLORS.x);
    makeBox('y', AXIS_COLORS.y);
    makeBox('z', AXIS_COLORS.z);
  }

  setVisible(visible) {
    this.root.visible = !!visible;
  }

  /**
   * @param {Array<{position: object, size?: object}>} brushStates editor-unit AABBs
   * @param {object|null} primary primary brush for resize handles
   */
  update(brushStates, primary) {
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
      this._hasBrushSize = false;
      this._applyModeVisibility();
      return;
    }

    this.setVisible(true);
    this._primaryBrush = primary || brushStates[0];
    this._hasBrushSize = Boolean(this._primaryBrush?.size);

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

    if (this._hasBrushSize) {
      this._buildResizeHandles(this._primaryBrush);
    }
    this._applyModeVisibility();
  }

  _buildResizeHandles(brush) {
    const half = {
      x: toMeters(brush.size.x) * 0.5,
      y: toMeters(brush.size.y) * 0.5,
      z: toMeters(brush.size.z) * 0.5,
    };
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
      mesh.userData = { kind: 'resize', axis: face.axis, sign: face.sign, pickable: true };
      this.resizeGroup.add(mesh);
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
    if (handle.kind === 'rotate') {
      const angle = this._angleAboutAxis(pointerRay, handle.axis);
      this._drag = {
        kind: 'rotate',
        axis: handle.axis,
        startAngle: angle,
        primary: this._primaryBrush
          ? {
              position: { ...this._primaryBrush.position },
              size: this._primaryBrush.size ? { ...this._primaryBrush.size } : undefined,
            }
          : null,
      };
      return this._drag;
    }

    this._drag = {
      kind: handle.kind,
      axis: handle.axis,
      sign: handle.sign ?? 1,
      startPoint: this._projectAxis(pointerRay, handle.axis, handle.point),
      primary: this._primaryBrush
        ? {
            position: { ...this._primaryBrush.position },
            size: this._primaryBrush.size ? { ...this._primaryBrush.size } : undefined,
          }
        : null,
    };
    return this._drag;
  }

  /**
   * @returns {{ axis, kind, deltaEditor?: number, deltaDegrees?: number, sign?: number } | null}
   */
  sampleDrag(pointerRay) {
    if (!this._drag) return null;

    if (this._drag.kind === 'rotate') {
      const angle = this._angleAboutAxis(pointerRay, this._drag.axis);
      if (angle == null || this._drag.startAngle == null) return null;
      let delta = angle - this._drag.startAngle;
      // Unwrap to shortest path continuity for this sample (absolute from start).
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return {
        kind: 'rotate',
        axis: this._drag.axis,
        deltaDegrees: delta * (180 / Math.PI),
        primaryBefore: this._drag.primary,
      };
    }

    const now = this._projectAxis(pointerRay, this._drag.axis, this._drag.startPoint);
    if (!now || !this._drag.startPoint) return null;
    const deltaMeters =
      this._axisComponent(now, this._drag.axis)
      - this._axisComponent(this._drag.startPoint, this._drag.axis);
    if (!Number.isFinite(deltaMeters)) return null;
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

  _angleAboutAxis(ray, axis) {
    const axisVec = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    );
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      axisVec,
      this._selectionCenter,
    );
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(plane, hit)) return null;
    const local = hit.clone().sub(this._selectionCenter);
    if (axis === 'x') return Math.atan2(local.z, local.y);
    if (axis === 'y') return Math.atan2(local.x, local.z);
    return Math.atan2(local.y, local.x);
  }

  _axisComponent(point, axis) {
    return point[axis];
  }

  _projectAxis(ray, axis, referencePoint) {
    const axisVec = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    );
    const ref = referencePoint?.clone?.() || this._selectionCenter.clone();
    const rayDir = ray.direction.clone().normalize();
    let planeNormal = rayDir.clone().sub(axisVec.clone().multiplyScalar(rayDir.dot(axisVec)));
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
