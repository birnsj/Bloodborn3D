/**
 * Active-pane camera bookmark store / recall (Ctrl+1–9 / 1–9).
 * Bookmarks persist on the level (`world.cameraBookmarks`) via undoable command.
 */

import { applyPanePose, readPanePose } from './viewportCameras.js';
import {
  clearLegacyCameraBookmarks,
  normalizeCameraBookmarksDoc,
  resolveCameraBookmark,
  setCameraBookmark,
} from './cameraBookmarks.js';
import { syncActivePaneCamera } from './viewportRuntimeBridge.js';
import { SetCameraBookmarksCommand } from '../history/commands.js';
import * as THREE from 'three';

/** Copy active camera pose into freelook yaw/pitch/distance. */
export function syncLookFromCamera(lookRef, camera, controls) {
  if (!lookRef?.current || !camera || !controls?.target) return;
  lookRef.current.distance = Math.max(0.5, camera.position.distanceTo(controls.target));
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  lookRef.current.yaw = lookEuler.y;
  lookRef.current.pitch = lookEuler.x;
}

export function storeActivePaneCameraBookmark({
  sceneView,
  controls,
  prefs,
  slot,
  world,
  executeCommand,
}) {
  if (!world || typeof executeCommand !== 'function') return false;
  const pane = prefs?.panes?.find((p) => p.id === prefs.activePaneId) || prefs?.panes?.[0];
  if (!sceneView || !pane) return false;
  const cam = sceneView.getPaneCamera?.(pane.id) || sceneView.camera;
  if (!cam) return false;
  const draft = { cameraMode: pane.cameraMode || 'perspective' };
  readPanePose(
    cam,
    draft,
    pane.id === prefs.activePaneId && controls?.target ? controls.target : null,
  );
  const before = normalizeCameraBookmarksDoc(world.cameraBookmarks);
  const after = setCameraBookmark(before, slot, draft);
  executeCommand(
    new SetCameraBookmarksCommand({
      world,
      before,
      after,
      label: `Camera bookmark ${slot} set`,
    }),
    { resync: false },
  );
  clearLegacyCameraBookmarks();
  return true;
}

export function goToActivePaneCameraBookmark({
  sceneView,
  controls,
  prefs,
  slot,
  world,
  lookRef,
  flyModeRef,
  editorSettings,
  setViewportPrefs,
  setStatus,
}) {
  const bookmark = resolveCameraBookmark(world?.cameraBookmarks, slot);
  if (!bookmark) {
    setStatus?.(`No camera bookmark ${slot} — Ctrl+${slot} to set`);
    return false;
  }
  const paneId = prefs.activePaneId;
  const panes = prefs.panes.map((pane) => {
    if (pane.id !== paneId) return pane;
    return {
      ...pane,
      cameraMode: bookmark.cameraMode || pane.cameraMode,
      position: [...bookmark.position],
      target: [...bookmark.target],
      ...(bookmark.frustumSize != null ? { frustumSize: bookmark.frustumSize } : {}),
    };
  });
  const next = { ...prefs, panes, activePaneId: paneId };

  if (flyModeRef) flyModeRef.current = false;
  if (lookRef?.current) {
    lookRef.current.active = false;
    lookRef.current.pointerId = null;
  }

  setViewportPrefs?.(next);
  if (sceneView) {
    const pane = panes.find((p) => p.id === paneId);
    if (pane) {
      const cam = sceneView.ensurePaneCamera(paneId, pane.cameraMode, pane);
      applyPanePose(cam, pane);
    }
    syncActivePaneCamera(sceneView, next, controls, { settings: editorSettings });
    controls?.update?.();
  }
  syncLookFromCamera(lookRef, sceneView?.camera, controls);
  setStatus?.(`Camera bookmark ${slot}`);
  return true;
}
