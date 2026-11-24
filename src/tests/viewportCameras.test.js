import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyOrthoOrientation,
  applyPanePose,
  createPaneCamera,
  focusCameraOnBox,
  gridPlaneForCameraMode,
  ISOMETRIC_POLAR_ANGLE,
  orientPaneToCameraMode,
  resetPaneCameraView,
  snapOffsetToIsometric,
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

  it('updates ortho frustum from size + aspect without clearing live zoom', () => {
    const cam = createPaneCamera('top', 1);
    cam.zoom = 2.5;
    updateOrthoFrustum(cam, 20, 2);
    expect(cam.zoom).toBe(2.5);
    expect(cam.top).toBeCloseTo(10);
    expect(cam.right).toBeCloseTo(20);
  });

  it('can reset ortho zoom when applying a pose frustum', () => {
    const cam = createPaneCamera('top', 1);
    cam.zoom = 2.5;
    updateOrthoFrustum(cam, 20, 2, { resetZoom: true });
    expect(cam.zoom).toBe(1);
  });

  it('maps camera modes to grid planes', () => {
    expect(gridPlaneForCameraMode('perspective')).toBe('xz');
    expect(gridPlaneForCameraMode('isometric')).toBe('xz');
    expect(gridPlaneForCameraMode('top')).toBe('xz');
    expect(gridPlaneForCameraMode('front')).toBe('xy');
    expect(gridPlaneForCameraMode('left')).toBe('zy');
  });

  it('creates an orthographic isometric camera along (1,1,1)', () => {
    const cam = createPaneCamera('isometric', 1);
    expect(cam.isOrthographicCamera).toBe(true);
    expect(cam.userData.viewportMode).toBe('isometric');
    expect(cam.position.x).toBeGreaterThan(0);
    expect(cam.position.y).toBeGreaterThan(0);
    expect(cam.position.z).toBeGreaterThan(0);
    expect(filterGizmoAxisForOrtho('isometric', 'y')).toBe('y');
  });

  it('keeps isometric elevation when snapping offsets', () => {
    const snapped = snapOffsetToIsometric(new THREE.Vector3(4, 1, 0));
    const spherical = new THREE.Spherical().setFromVector3(snapped);
    expect(spherical.phi).toBeCloseTo(ISOMETRIC_POLAR_ANGLE, 5);
    expect(snapped.y).toBeGreaterThan(0);
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

  it('snaps pane pose when picking a named ortho view', () => {
    const pane = orientPaneToCameraMode({
      id: 'pane-0',
      cameraMode: 'perspective',
      position: [6, 5, 8],
      target: [0, 1.5, 0],
      frustumSize: 12,
    }, 'top');
    expect(pane.cameraMode).toBe('top');
    expect(pane.position[1]).toBeGreaterThan(pane.target[1]);
    expect(Math.abs(pane.position[0] - pane.target[0])).toBeLessThan(1e-6);
    expect(Math.abs(pane.position[2] - pane.target[2])).toBeLessThan(1e-6);
  });

  it('restores free ortho eye position instead of re-snapping', () => {
    const cam = createPaneCamera('top', 1);
    applyPanePose(cam, {
      cameraMode: 'top',
      position: [10, 8, 10],
      target: [0, 1.5, 0],
      frustumSize: 12,
    });
    expect(cam.position.x).toBeCloseTo(10);
    expect(cam.position.y).toBeCloseTo(8);
    expect(cam.position.z).toBeCloseTo(10);
  });

  it('resets perspective to the home ¾ framing', () => {
    const reset = resetPaneCameraView({
      id: 'pane-0',
      cameraMode: 'perspective',
      position: [20, 2, -4],
      target: [10, 0, 10],
    });
    expect(reset.position).toEqual([6, 5, 8]);
    expect(reset.target).toEqual([0, 1.5, 0]);
  });

  it('resets isometric centered on the map with default zoom', () => {
    const reset = resetPaneCameraView({
      id: 'pane-0',
      cameraMode: 'isometric',
      position: [30, 40, 50],
      target: [12, 3, -8],
      frustumSize: 40,
    });
    expect(reset.target).toEqual([0, 0, 0]);
    expect(reset.frustumSize).toBe(12);
    expect(reset.position[0]).toBeCloseTo(reset.position[1], 5);
    expect(reset.position[1]).toBeCloseTo(reset.position[2], 5);
    expect(reset.position[0]).toBeGreaterThan(0);

    const cam = createPaneCamera('isometric', 1);
    cam.zoom = 3;
    applyPanePose(cam, reset);
    expect(cam.zoom).toBe(1);
    expect(cam.userData.frustumSize).toBe(12);
  });

  it('resets a rotated ortho pane back onto its resting axis', () => {
    const reset = resetPaneCameraView({
      id: 'pane-0',
      cameraMode: 'front',
      position: [8, 4, 9],
      target: [5, 2, 5],
      frustumSize: 12,
    });
    expect(reset.position[2]).toBeGreaterThan(reset.target[2]);
    expect(Math.abs(reset.position[0] - reset.target[0])).toBeLessThan(1e-6);
    expect(Math.abs(reset.position[1] - reset.target[1])).toBeLessThan(1e-6);
  });
});
