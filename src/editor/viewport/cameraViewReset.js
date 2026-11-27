/**
 * Reset one or all viewport panes to camera-mode home poses.
 */

import { applyPanePose, resetPaneCameraView } from './viewportCameras.js';
import { syncActivePaneCamera } from './viewportRuntimeBridge.js';
import { syncLookFromCamera } from './cameraBookmarkActions.js';

function stopFreelook(flyModeRef, lookRef) {
  if (flyModeRef) flyModeRef.current = false;
  if (lookRef?.current) {
    lookRef.current.active = false;
    lookRef.current.pointerId = null;
  }
}

/** Reset a single pane (default: active) to its mode home pose + zoom. */
export function resetViewportCameraView({
  sceneView,
  controls,
  prefs,
  paneId = null,
  lookRef,
  flyModeRef,
  editorSettings,
  setViewportPrefs,
}) {
  const targetPaneId = paneId || prefs.activePaneId;
  const panes = prefs.panes.map((pane) => (
    pane.id === targetPaneId ? resetPaneCameraView(pane) : pane
  ));
  const next = { ...prefs, panes, activePaneId: targetPaneId };

  stopFreelook(flyModeRef, lookRef);
  setViewportPrefs?.(next);
  if (sceneView) {
    const pane = panes.find((p) => p.id === targetPaneId);
    if (pane) {
      const cam = sceneView.ensurePaneCamera(targetPaneId, pane.cameraMode, pane);
      // applyPanePose resets ortho frustum + camera.zoom; perspective uses home distance.
      applyPanePose(cam, pane);
    }
    syncActivePaneCamera(sceneView, next, controls, { settings: editorSettings });
    controls?.update?.();
  }
  syncLookFromCamera(lookRef, sceneView?.camera, controls);
  return next;
}

/** Reset every pane to its camera-mode home pose + default zoom. */
export function resetAllViewportCameraViews({
  sceneView,
  controls,
  prefs,
  lookRef,
  flyModeRef,
  editorSettings,
  setViewportPrefs,
}) {
  const panes = prefs.panes.map((pane) => resetPaneCameraView(pane));
  const next = { ...prefs, panes };

  stopFreelook(flyModeRef, lookRef);
  setViewportPrefs?.(next);
  if (sceneView) {
    for (const pane of panes) {
      const cam = sceneView.ensurePaneCamera(pane.id, pane.cameraMode, pane);
      applyPanePose(cam, pane);
    }
    syncActivePaneCamera(sceneView, next, controls, { settings: editorSettings });
    controls?.update?.();
  }
  syncLookFromCamera(lookRef, sceneView?.camera, controls);
  return next;
}
