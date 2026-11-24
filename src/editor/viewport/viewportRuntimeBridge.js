import {
  clampViewportPrefs,
  computePaneRects,
  isOrthographicMode,
  orthoPlaneAxes,
  paneIdAtPoint,
  pointerToPaneNdc,
} from './viewportPrefs.js';
import { readPanePose, focusCameraOnBox } from './viewportCameras.js';
import * as THREE from 'three';

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

export function syncActivePaneCamera(sceneView, prefs, orbitControls = null) {
  const p = clampViewportPrefs(prefs);
  const pane = p.panes.find((x) => x.id === p.activePaneId) || p.panes[0];
  if (!pane || !sceneView) return null;
  const cam = sceneView.setActivePaneCamera(pane.id, pane.cameraMode, pane);
  if (orbitControls) {
    orbitControls.object = cam;
    if (pane.target) {
      orbitControls.target.set(pane.target[0], pane.target[1], pane.target[2]);
    }
    const ortho = isOrthographicMode(pane.cameraMode);
    orbitControls.enableRotate = !ortho;
    // Ortho: pan + zoom only. Perspective: existing RMB rotate / MMB pan.
    orbitControls.mouseButtons = {
      LEFT: -1,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: ortho ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    };
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
  if (axis === 'normal') return axis;
  const allowed = orthoPlaneAxes(cameraMode);
  return allowed.includes(axis) ? axis : null;
}
