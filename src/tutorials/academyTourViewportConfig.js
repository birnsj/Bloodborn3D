/**
 * Infer and apply viewport prefs so each Academy Tour tip can be seen clearly.
 * Layout / Cam / Fog / Mist / PP / display switch as the tip needs them.
 */

import { orientPaneToCameraMode } from '../editor/viewport/viewportCameras.js';

function viewportApi() {
  return typeof window !== 'undefined' ? window.__bloodboundViewport : null;
}

function highlightIds(step) {
  if (Array.isArray(step?.highlight)) return step.highlight.map(String);
  if (step?.highlight) return [String(step.highlight)];
  return [];
}

function patchActivePane(mutator) {
  const api = viewportApi();
  if (!api?.getPrefs || !api?.setPrefs) return false;
  const prefs = api.getPrefs();
  if (!prefs?.panes?.length) return false;
  const activeId = prefs.activePaneId || prefs.panes[0]?.id;
  api.setPrefs({
    panes: prefs.panes.map((pane) => (
      pane.id === activeId ? mutator({ ...pane }) : pane
    )),
  });
  return true;
}

export function setTourCameraMode(cameraMode) {
  return patchActivePane((pane) => orientPaneToCameraMode(pane, cameraMode));
}

export function setTourLayoutMode(layoutMode, layout) {
  if (typeof layout?.setViewportLayoutMode === 'function') {
    layout.setViewportLayoutMode(layoutMode);
    return true;
  }
  const api = viewportApi();
  if (!api?.setPrefs) return false;
  api.setPrefs({ layoutMode, maximizedPaneId: null });
  return true;
}

/** Tips that need a large single viewport so orbit / pick / create is readable. */
export function stepNeedsRoomyViewport(step) {
  const verify = step?.verify?.type || 'none';
  const ids = highlightIds(step);
  if (verify === 'viewportLayoutIs') return false;
  if (ids.some((id) => id === 'viewport.layout')) return false;
  const roomyVerify = new Set([
    'actorSelected',
    'brushCreated',
    'rampCreated',
    'stairCreated',
    'componentCreated',
    'lightPlaced',
    'cellCreated',
    'meshPlaced',
    'surfaceSelected',
    'geometrySelected',
    'faceMaterialAssigned',
    'transformMoved',
    'modeIs',
    'modeSequence',
  ]);
  if (roomyVerify.has(verify)) return true;
  if (ids.some((id) => (
    id.startsWith('toolbar.')
    || id === 'viewport.chrome'
    || id === 'viewport.viewHelper'
  ))) {
    // Focus / chrome demos still read better in one pane.
    return verify !== 'viewportCameraIs';
  }
  return /orbit|pick|frame|focus|wall|brush|select|place|create/i.test(
    `${step?.id || ''} ${step?.title || ''}`,
  );
}

/**
 * Apply the viewport arrangement this tip needs (layout, Cam, chips, display).
 * Safe to call every tour step; no-ops when the API is missing.
 */
export function ensureTourViewportConfig(step, layout) {
  const verify = step?.verify || { type: 'none' };
  const ids = highlightIds(step);
  const api = viewportApi();
  if (!api?.getPrefs || !api?.setPrefs) {
    if (verify.type === 'viewportLayoutIs') {
      return setTourLayoutMode(verify.layoutMode || 'quad', layout);
    }
    return false;
  }

  let changed = false;

  if (verify.type === 'viewportLayoutIs') {
    if (setTourLayoutMode(verify.layoutMode || 'quad', layout)) changed = true;
  } else if (stepNeedsRoomyViewport(step)) {
    if (setTourLayoutMode('single', layout)) changed = true;
  }

  if (verify.type === 'viewportCameraIs') {
    if (setTourCameraMode(verify.cameraMode || 'isometric')) changed = true;
  } else if (stepNeedsRoomyViewport(step) && verify.type !== 'manualConfirm') {
    // Building / picking reads best in perspective; leave Cam alone for pure chrome tips.
    const prefs = api.getPrefs();
    const active = prefs.panes?.find((p) => p.id === (prefs.activePaneId || prefs.panes[0]?.id));
    if (active?.cameraMode && active.cameraMode !== 'perspective') {
      if (setTourCameraMode('perspective')) changed = true;
    }
  }

  const wantFog = ids.includes('viewport.showFog');
  const wantMist = ids.includes('viewport.showMist');
  const wantPp = ids.includes('viewport.showPostProcessing');
  const aboutAtmosphere = wantFog || wantMist || wantPp
    || ids.some((id) => id.startsWith('world.scene.') || id.startsWith('world.postProcessing'));

  if (wantFog || wantMist || wantPp || aboutAtmosphere || stepNeedsRoomyViewport(step)) {
    const prefs = api.getPrefs();
    const activeId = prefs.activePaneId || prefs.panes[0]?.id;
    api.setPrefs({
      panes: prefs.panes.map((pane) => {
        if (pane.id !== activeId) return pane;
        const next = { ...pane };
        if (wantFog) next.showFog = true;
        else if (!aboutAtmosphere && stepNeedsRoomyViewport(step)) next.showFog = false;
        if (wantMist) next.showMist = true;
        if (wantPp) next.showPostProcessing = true;
        if (aboutAtmosphere) {
          next.displayMode = 'lit';
          if (wantFog || ids.some((id) => id.startsWith('world.scene.'))) next.showFog = true;
          if (wantPp || ids.some((id) => id.startsWith('world.postProcessing'))) {
            next.showPostProcessing = true;
          }
        } else if (stepNeedsRoomyViewport(step)) {
          // Sparse tutorial starters stay readable.
          next.displayMode = 'unlit';
          next.showMist = false;
        }
        return next;
      }),
    });
    changed = true;
  }

  return changed;
}
