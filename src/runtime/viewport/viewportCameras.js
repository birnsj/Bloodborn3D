import * as THREE from 'three';
import {
  defaultShowFogForCameraMode,
  defaultShowMistForCameraMode,
  defaultShowPostProcessingForCameraMode,
  normalizeCameraMode,
} from './viewportPrefs.js';

/** World-space look directions for orthographic modes (camera looks toward -direction). */
export const ORTHO_LOOK = {
  // Classic true isometric: 45° yaw, ~35.264° elevation → equal axis foreshortening.
  isometric: { position: [1, 1, 1], up: [0, 1, 0] },
  top: { position: [0, 1, 0], up: [0, 0, -1] },
  bottom: { position: [0, -1, 0], up: [0, 0, 1] },
  front: { position: [0, 0, 1], up: [0, 1, 0] },
  back: { position: [0, 0, -1], up: [0, 1, 0] },
  left: { position: [-1, 0, 0], up: [0, 1, 0] },
  right: { position: [1, 0, 0], up: [0, 1, 0] },
};

/** OrbitControls polar angle (from +Y) for true isometric — acos(1/√3). */
export const ISOMETRIC_POLAR_ANGLE = Math.acos(1 / Math.sqrt(3));

/**
 * Keep distance + yaw, force elevation onto the isometric cone (Y-up).
 * @returns {THREE.Vector3}
 */
export function snapOffsetToIsometric(offset) {
  const spherical = new THREE.Spherical().setFromVector3(offset);
  if (!(spherical.radius > 1e-6)) {
    return new THREE.Vector3(...ORTHO_LOOK.isometric.position).setLength(20);
  }
  spherical.phi = ISOMETRIC_POLAR_ANGLE;
  return new THREE.Vector3().setFromSpherical(spherical);
}

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
 * Leaves OrbitControls `camera.zoom` alone unless `resetZoom` (Reset / pose restore).
 */
export function updateOrthoFrustum(camera, frustumSize, aspect, { resetZoom = false } = {}) {
  if (!camera?.isOrthographicCamera) return;
  const size = Math.max(0.5, frustumSize || 12);
  const a = Math.max(aspect, 0.0001);
  const halfH = size / 2;
  const halfW = halfH * a;
  if (resetZoom) camera.zoom = 1;
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

/** Home perspective framing — classic ¾ view of the map origin (matches factory pose). */
export const PERSPECTIVE_HOME = {
  position: [6, 5, 8],
  target: [0, 1.5, 0],
};

/** Map / construction-grid center (meters). */
export const MAP_CENTER = [0, 0, 0];
const MAP_LOOK_AT = [0, 1.5, 0];
const ISO_HOME_DISTANCE = 20;
const ORTHO_HOME_FRUSTUM = 12;

/**
 * Snap a pane's stored pose to a named camera mode (dropdown selection).
 * Keeps the look-at target; places the camera on the mode's resting view axis.
 */
export function orientPaneToCameraMode(pane, cameraMode) {
  if (!pane) return pane;
  const mode = normalizeCameraMode(cameraMode);
  const target = Array.isArray(pane.target) ? [...pane.target] : [...MAP_LOOK_AT];
  const t = new THREE.Vector3(...target);
  const prev = Array.isArray(pane.position)
    ? new THREE.Vector3(...pane.position)
    : null;
  const distance = prev ? Math.max(1, prev.distanceTo(t) || 20) : 20;

  if (mode === 'perspective') {
    const homeOffset = new THREE.Vector3(...PERSPECTIVE_HOME.position)
      .sub(new THREE.Vector3(...PERSPECTIVE_HOME.target));
    const homeLen = homeOffset.length();
    const position = t.clone().add(
      homeOffset.normalize().multiplyScalar(
        prev ? Math.max(1, prev.distanceTo(t)) : homeLen,
      ),
    );
    return {
      ...pane,
      cameraMode: mode,
      showFog: defaultShowFogForCameraMode(mode),
      showMist: defaultShowMistForCameraMode(mode),
      showPostProcessing: defaultShowPostProcessingForCameraMode(mode),
      position: [position.x, position.y, position.z],
      target,
    };
  }
  const look = ORTHO_LOOK[mode] || ORTHO_LOOK.isometric;
  const dir = new THREE.Vector3(...look.position).normalize();
  const position = t.clone().addScaledVector(dir, distance);
  return {
    ...pane,
    cameraMode: mode,
    showFog: defaultShowFogForCameraMode(mode),
    showMist: defaultShowMistForCameraMode(mode),
    showPostProcessing: defaultShowPostProcessingForCameraMode(mode),
    position: [position.x, position.y, position.z],
    target,
  };
}

/**
 * Reset button: restore a canonical home framing + zoom for the pane’s camera mode.
 * Perspective → factory ¾ view/distance. Iso / ortho → centered on the map, default frustum.
 */
export function resetPaneCameraView(pane) {
  if (!pane) return pane;
  const mode = normalizeCameraMode(pane.cameraMode);

  if (mode === 'perspective') {
    return {
      ...pane,
      cameraMode: mode,
      position: [...PERSPECTIVE_HOME.position],
      target: [...PERSPECTIVE_HOME.target],
      frustumSize: ORTHO_HOME_FRUSTUM,
    };
  }

  const target = mode === 'isometric' || mode === 'top' || mode === 'bottom'
    ? [...MAP_CENTER]
    : [...MAP_LOOK_AT];
  const look = ORTHO_LOOK[mode] || ORTHO_LOOK.isometric;
  const dir = new THREE.Vector3(...look.position).normalize();
  const distance = mode === 'isometric' ? ISO_HOME_DISTANCE : 20;
  const position = new THREE.Vector3(...target).addScaledVector(dir, distance);
  return {
    ...pane,
    cameraMode: mode,
    position: [position.x, position.y, position.z],
    target,
    frustumSize: ORTHO_HOME_FRUSTUM,
  };
}

/** Sync camera pose from persisted pane state. */
export function applyPanePose(camera, pane) {
  if (!camera || !pane) return;
  const mode = normalizeCameraMode(pane.cameraMode);
  const target = new THREE.Vector3(...(pane.target || [0, 1.5, 0]));
  // Restore the saved eye position for both perspective and ortho so RMB orbit
  // on ortho views survives pane sync / reload (named views snap via orientPaneToCameraMode).
  if (mode === 'perspective') {
    camera.position.set(...(pane.position || [6, 5, 8]));
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    return;
  }
  if (!camera.isOrthographicCamera) return;
  const look = ORTHO_LOOK[mode];
  const pos = Array.isArray(pane.position)
    ? new THREE.Vector3(...pane.position)
    : null;
  if (pos && pos.distanceToSquared(target) > 1e-6) {
    let eye = pos;
    if (mode === 'isometric') {
      // Preserve yaw/distance; never leave the isometric elevation.
      eye = target.clone().add(snapOffsetToIsometric(pos.clone().sub(target)));
      camera.up.set(0, 1, 0);
    } else {
      // Prefer Y-up for free ortho orbit; keep special up only for pure axis views.
      const offset = pos.clone().sub(target).normalize();
      const axisAligned = look && offset.distanceToSquared(
        new THREE.Vector3(...look.position).normalize(),
      ) < 1e-4;
      camera.up.set(...(axisAligned && look ? look.up : [0, 1, 0]));
    }
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  } else {
    applyOrthoOrientation(camera, mode, target, 20);
  }
  if (pane.frustumSize != null) {
    const aspect = camera.right && camera.top
      ? Math.abs((camera.right - camera.left) / (camera.top - camera.bottom)) || 1
      : 1;
    // Pose restore / Reset: bake zoom into frustumSize and clear camera.zoom.
    updateOrthoFrustum(camera, pane.frustumSize, aspect, { resetZoom: true });
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
    // Persist effective view height (frustum / OrbitControls zoom).
    // Keep userData.frustumSize as the unzoomed top-bottom base for live projection updates.
    const rawH = Math.abs(camera.top - camera.bottom) || 12;
    const zoom = Number(camera.zoom) > 1e-6 ? camera.zoom : 1;
    pane.frustumSize = rawH / zoom;
    camera.userData.frustumSize = rawH;
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
    const aspect = Math.abs((camera.right - camera.left) / (camera.top - camera.bottom)) || 1;
    const frustumSize = Math.max(maxDim, maxDim / aspect);
    const distance = Math.max(20, maxDim * 2);
    const mode = camera.userData.viewportMode || 'top';
    if (mode === 'isometric') {
      const offset = snapOffsetToIsometric(camera.position.clone().sub(center));
      offset.setLength(distance);
      camera.up.set(0, 1, 0);
      camera.position.copy(center).add(offset);
    } else {
      // Keep the current look direction (supports free ortho RMB orbit).
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      if (dir.lengthSq() < 1e-8) dir.set(0, -1, 0);
      camera.position.copy(center).addScaledVector(dir, -distance);
    }
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
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
    case 'isometric':
    case 'perspective':
    default:
      return 'xz';
  }
}
