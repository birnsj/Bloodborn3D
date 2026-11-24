import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyOrthoOrientation,
  createPaneCamera,
  focusCameraOnBox,
  gridPlaneForCameraMode,
  updateOrthoFrustum,
} from '../editor/viewport/viewportCameras.js';
import { filterGizmoAxisForOrtho } from '../editor/viewport/viewportRuntimeBridge.js';

describe('viewportCameras', () => {
  it('creates perspective and orthographic cameras', () => {
    const persp = createPaneCamera('perspective', 16 / 9);
    expect(persp.isPerspectiveCamera).toBe(true);
    const top = createPaneCamera('top', 1);
    expect(top.isOrthographicCamera).toBe(true);
    expect(top.userData.viewportMode).toBe('top');
  });

  it('orients ortho cameras along world axes', () => {
    const cam = createPaneCamera('front', 1);
    const target = new THREE.Vector3(0, 1.5, 0);
    applyOrthoOrientation(cam, 'front', target, 20);
    expect(cam.position.z).toBeGreaterThan(target.z);
    expect(Math.abs(cam.position.x - target.x)).toBeLessThan(1e-6);
  });

  it('updates ortho frustum from size + aspect', () => {
    const cam = createPaneCamera('top', 1);
    updateOrthoFrustum(cam, 20, 2);
    expect(cam.top).toBeCloseTo(10);
    expect(cam.right).toBeCloseTo(20);
  });

  it('maps camera modes to grid planes', () => {
    expect(gridPlaneForCameraMode('perspective')).toBe('xz');
    expect(gridPlaneForCameraMode('top')).toBe('xz');
    expect(gridPlaneForCameraMode('front')).toBe('xy');
    expect(gridPlaneForCameraMode('left')).toBe('zy');
  });

  it('focuses orthographic camera on a box', () => {
    const cam = createPaneCamera('top', 1);
    const box = new THREE.Box3(
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 2, 1),
    );
    const framed = focusCameraOnBox(cam, box);
    expect(framed.target.y).toBeCloseTo(1);
    expect(framed.frustumSize).toBeGreaterThan(1);
  });

  it('filters gizmo axes in ortho views', () => {
    expect(filterGizmoAxisForOrtho('top', 'y')).toBeNull();
    expect(filterGizmoAxisForOrtho('top', 'x')).toBe('x');
    expect(filterGizmoAxisForOrtho('front', 'z')).toBeNull();
    expect(filterGizmoAxisForOrtho('perspective', 'y')).toBe('y');
  });
});
