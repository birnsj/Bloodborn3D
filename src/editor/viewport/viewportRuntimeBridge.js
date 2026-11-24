import {
  clampViewportPrefs,
  computePaneRects,
  isOrthographicMode,
  normalizeCameraMode,
  orthoPlaneAxes,
  paneIdAtPoint,
  pointerToPaneNdc,
} from './viewportPrefs.js';
import {
  focusCameraOnBox,
  ISOMETRIC_POLAR_ANGLE,
  readPanePose,
  snapOffsetToIsometric,
} from './viewportCameras.js';
import * as THREE from 'three';

/**
 * Bind OrbitControls to the active pane camera.
 * Damping stays off so orbit/pan stop when the mouse stops (no after-drift).
 * Do not touch controls.state / internal deltas here — this runs on pane/settings
 * sync and must not abort an in-progress drag.
 */
export function configureOrbitForPane(controls, pane, settings = null) {
  if (!controls || !pane) return;
  const mode = normalizeCameraMode(pane.cameraMode);

  // Ortho/isometric: RMB orbits. Perspective: RMB is freelook (Viewport); Ctrl+move
  // orbits without a mouse button. Middle-mouse pans; wheel zooms.
  const perspective = mode === 'perspective';
  controls.enableRotate = true;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.screenSpacePanning = true;
  controls.enableDamping = false;
  controls.mouseButtons = {
    LEFT: -1,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: perspective ? -1 : THREE.MOUSE.ROTATE,
  };

  if (mode === 'isometric') {
    // Yaw-only orbit — elevation locked to true isometric.
    controls.minPolarAngle = ISOMETRIC_POLAR_ANGLE;
    controls.maxPolarAngle = ISOMETRIC_POLAR_ANGLE;
    const cam = controls.object;
    if (cam?.isOrthographicCamera) {
      cam.up.set(0, 1, 0);
      const offset = snapOffsetToIsometric(cam.position.clone().sub(controls.target));
      cam.position.copy(controls.target).add(offset);
      cam.lookAt(controls.target);
      cam.updateMatrixWorld(true);
    }
  } else {
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
  }

  if (settings) {
    if (settings.cameraOrbitSpeed != null) controls.rotateSpeed = settings.cameraOrbitSpeed;
    if (settings.cameraOrbitZoomSpeed != null) controls.zoomSpeed = settings.cameraOrbitZoomSpeed;
    if (settings.cameraOrbitPanSpeed != null) controls.panSpeed = settings.cameraOrbitPanSpeed;
  }
}

/**
 * Build GameRuntime viewport pane descriptors from prefs + shell size.
 */
export function buildViewportPanes(prefs, width, height, sceneView) {
  const p = clampViewportPrefs(prefs);
  const rects = computePaneRects(p, width, height);
  const byId = new Map(p.panes.map((pane) => [pane.id, pane]));
  return rects.map((rect) => {
    const pane = byId.get(rect.paneId);
    return {
      paneId: rect.paneId,
      rect,
      cameraMode: pane?.cameraMode || 'perspective',
      displayMode: pane?.displayMode || 'lit',
      paneState: pane || null,
    };
  }).map((desc) => {
    if (sceneView) {
      sceneView.ensurePaneCamera(desc.paneId, desc.cameraMode, desc.paneState);
      sceneView.updatePaneCameraProjection(
        sceneView.getPaneCamera(desc.paneId),
        desc.rect,
      );
    }
    return desc;
  });
}

export function resolvePointerInPanes(prefs, width, height, clientX, clientY, shellRect) {
  const localX = clientX - shellRect.left;
  const localY = clientY - shellRect.top;
  const paneId = paneIdAtPoint(prefs, width, height, localX, localY);
  const rects = computePaneRects(prefs, width, height);
  const rect = rects.find((r) => r.paneId === paneId) || rects[0];
  const ndc = pointerToPaneNdc(rect, localX, localY);
  return {
    paneId,
    rect,
    localX,
    localY,
    nx: ndc?.x ?? 0,
    ny: ndc?.y ?? 0,
  };
}

export function syncActivePaneCamera(sceneView, prefs, orbitControls = null, options = {}) {
  const p = clampViewportPrefs(prefs);
  const pane = p.panes.find((x) => x.id === p.activePaneId) || p.panes[0];
  if (!pane || !sceneView) return null;
  const cam = sceneView.setActivePaneCamera(pane.id, pane.cameraMode, pane);
  if (orbitControls) {
    orbitControls.object = cam;
    // While free-flying, leave live target/mouse bindings alone — orbit update
    // would snap the camera around a stale pivot and fight freelook.
    if (options.flying) {
      return cam;
    }
    if (pane.target) {
      orbitControls.target.set(pane.target[0], pane.target[1], pane.target[2]);
    } else if (Array.isArray(pane.position) && cam) {
      // Fall back: keep looking along the camera's current forward.
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const dist = cam.isOrthographicCamera
        ? (cam.userData.frustumSize || 12)
        : Math.max(1, cam.position.length() * 0.35);
      orbitControls.target.copy(cam.position).addScaledVector(dir, dist);
    }
    configureOrbitForPane(orbitControls, pane, options.settings || null);
    orbitControls.update();
  }
  return cam;
}

/** Persist live camera poses from SceneView cameras back into prefs panes. */
export function capturePanePoses(prefs, sceneView, orbitTarget = null) {
  const p = clampViewportPrefs(prefs);
  const panes = p.panes.map((pane) => {
    const cam = sceneView?.getPaneCamera?.(pane.id);
    if (!cam) return pane;
    const next = { ...pane };
    const target = pane.id === p.activePaneId && orbitTarget
      ? orbitTarget
      : null;
    readPanePose(cam, next, target);
    return next;
  });
  return { ...p, panes };
}

export function focusPaneOnSelection(sceneView, prefs, paneId, selectedActorIds, orbitControls) {
  const p = clampViewportPrefs(prefs);
  const pane = p.panes.find((x) => x.id === paneId) || p.panes[0];
  if (!pane || !sceneView) return p;
  const cam = sceneView.ensurePaneCamera(pane.id, pane.cameraMode, pane);
  const box = new THREE.Box3();
  let has = false;
  for (const id of selectedActorIds || []) {
    const entry = sceneView._actorMeshes?.get(id);
    if (!entry?.group) continue;
    box.expandByObject(entry.group);
    has = true;
  }
  if (!has || box.isEmpty()) return p;
  const framed = focusCameraOnBox(cam, box);
  const nextPane = { ...pane };
  nextPane.position = [cam.position.x, cam.position.y, cam.position.z];
  nextPane.target = [framed.target.x, framed.target.y, framed.target.z];
  if (framed.frustumSize != null) nextPane.frustumSize = framed.frustumSize;
  if (orbitControls && p.activePaneId === pane.id) {
    orbitControls.object = cam;
    orbitControls.target.copy(framed.target);
    orbitControls.update();
  }
  return {
    ...p,
    panes: p.panes.map((x) => (x.id === pane.id ? nextPane : x)),
  };
}

/** Reject gizmo axes that leave the orthographic view plane. */
export function filterGizmoAxisForOrtho(cameraMode, axis) {
  if (!isOrthographicMode(cameraMode)) return axis;
  if (axis === 'normal' || axis === 'xyz') return axis;
  const allowed = orthoPlaneAxes(cameraMode);
  return allowed.includes(axis) ? axis : null;
}
