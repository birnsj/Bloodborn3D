import * as THREE from 'three';
import { normalizeCameraMode } from './viewportPrefs.js';

/** World-space look directions for orthographic modes (camera looks toward -direction). */
export const ORTHO_LOOK = {
  top: { position: [0, 1, 0], up: [0, 0, -1] },
  bottom: { position: [0, -1, 0], up: [0, 0, 1] },
  front: { position: [0, 0, 1], up: [0, 1, 0] },
  back: { position: [0, 0, -1], up: [0, 1, 0] },
  left: { position: [-1, 0, 0], up: [0, 1, 0] },
  right: { position: [1, 0, 0], up: [0, 1, 0] },
};

/**
 * Create a Three.js camera for a pane. Perspective panes reuse a PerspectiveCamera;
 * ortho panes use OrthographicCamera.
 */
export function createPaneCamera(cameraMode, aspect = 1) {
  const mode = normalizeCameraMode(cameraMode);
  if (mode === 'perspective') {
    const cam = new THREE.PerspectiveCamera(60, Math.max(aspect, 0.0001), 0.05, 500);
    cam.position.set(6, 5, 8);
    cam.lookAt(0, 1.5, 0);
    cam.userData.viewportMode = mode;
    return cam;
  }
  const frustum = 12;
  const halfH = frustum / 2;
  const halfW = halfH * Math.max(aspect, 0.0001);
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, 500);
  cam.userData.viewportMode = mode;
  cam.userData.frustumSize = frustum;
  applyOrthoOrientation(cam, mode, new THREE.Vector3(0, 1.5, 0), 20);
  return cam;
}

export function applyOrthoOrientation(camera, cameraMode, target, distance = 20) {
  const mode = normalizeCameraMode(cameraMode);
  const look = ORTHO_LOOK[mode];
  if (!look || !camera?.isOrthographicCamera) return;
  const t = target.clone ? target.clone() : new THREE.Vector3(target.x, target.y, target.z);
  const dir = new THREE.Vector3(...look.position).normalize();
  camera.up.set(...look.up);
  camera.position.copy(t).addScaledVector(dir, distance);
  camera.lookAt(t);
  camera.updateMatrixWorld(true);
}

/**
 * Update orthographic frustum from frustumSize (world height) and aspect (width/height).
 */
export function updateOrthoFrustum(camera, frustumSize, aspect) {
  if (!camera?.isOrthographicCamera) return;
  const size = Math.max(0.5, frustumSize || 12);
  const a = Math.max(aspect, 0.0001);
  const halfH = size / 2;
  const halfW = halfH * a;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.userData.frustumSize = size;
  camera.updateProjectionMatrix();
}

export function updatePerspectiveAspect(camera, aspect) {
  if (!camera?.isPerspectiveCamera) return;
  camera.aspect = Math.max(aspect, 0.0001);
  camera.updateProjectionMatrix();
}

/** Sync camera pose from persisted pane state. */
export function applyPanePose(camera, pane) {
  if (!camera || !pane) return;
  const mode = normalizeCameraMode(pane.cameraMode);
  const target = new THREE.Vector3(...(pane.target || [0, 1.5, 0]));
  if (mode === 'perspective') {
    camera.position.set(...(pane.position || [6, 5, 8]));
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    return;
  }
  const pos = new THREE.Vector3(...(pane.position || [0, 20, 0]));
  const distance = Math.max(1, pos.distanceTo(target) || 20);
  applyOrthoOrientation(camera, mode, target, distance);
  if (pane.frustumSize != null) {
    const aspect = camera.right && camera.top
      ? Math.abs((camera.right - camera.left) / (camera.top - camera.bottom)) || 1
      : 1;
    updateOrthoFrustum(camera, pane.frustumSize, aspect);
  }
}

/** Read pose back into a plain pane-state object (mutates pane fields). */
export function readPanePose(camera, pane, orbitTarget = null) {
  if (!camera || !pane) return pane;
  pane.position = [camera.position.x, camera.position.y, camera.position.z];
  if (orbitTarget) {
    pane.target = [orbitTarget.x, orbitTarget.y, orbitTarget.z];
  } else if (camera.isOrthographicCamera) {
    // Target is along -look direction at mid-frustum distance estimate.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const dist = camera.userData.frustumSize || 12;
    const t = camera.position.clone().addScaledVector(dir, dist);
    pane.target = [t.x, t.y, t.z];
  }
  if (camera.isOrthographicCamera) {
    pane.frustumSize = camera.userData.frustumSize
      || Math.abs(camera.top - camera.bottom)
      || 12;
  }
  return pane;
}

/**
 * Frame a world-space AABB (meters) into the camera. Mutates camera + optional target.
 * @returns {{ target: THREE.Vector3, frustumSize?: number, distance?: number }}
 */
export function focusCameraOnBox(camera, box, padding = 1.25) {
  if (!camera || !box || box.isEmpty()) {
    return { target: new THREE.Vector3(0, 1.5, 0) };
  }
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.5) * padding;

  if (camera.isOrthographicCamera) {
    const mode = camera.userData.viewportMode || 'top';
    const aspect = Math.abs((camera.right - camera.left) / (camera.top - camera.bottom)) || 1;
    const frustumSize = Math.max(maxDim, maxDim / aspect);
    applyOrthoOrientation(camera, mode, center, Math.max(20, maxDim * 2));
    updateOrthoFrustum(camera, frustumSize, aspect);
    return { target: center, frustumSize };
  }

  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  if (dir.lengthSq() < 1e-8) dir.set(0, -0.3, -1).normalize();
  camera.position.copy(center).addScaledVector(dir, -Math.max(distance, 2));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { target: center, distance: Math.max(distance, 2) };
}

/** Grid plane for ortho modes: 'xz' | 'xy' | 'zy' */
export function gridPlaneForCameraMode(cameraMode) {
  switch (normalizeCameraMode(cameraMode)) {
    case 'front':
    case 'back':
      return 'xy';
    case 'left':
    case 'right':
      return 'zy';
    case 'top':
    case 'bottom':
    case 'perspective':
    default:
      return 'xz';
  }
}
