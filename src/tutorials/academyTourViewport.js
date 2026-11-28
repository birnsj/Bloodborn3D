/**
 * Academy Tour viewport helpers — orbit, focus, and pick like a user click,
 * with a visible fake cursor following the action.
 */

import {
  moveTourCursorTo,
  ndcToClient,
  setTourCursorPosition,
  tourCursorClick,
  tourCursorOrbitDrag,
} from './tourCursor.js';
import { tourMs } from './tourSpeed.js';

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function viewportApi() {
  return typeof window !== 'undefined' ? window.__bloodboundViewport : null;
}

function sceneViewAndCamera() {
  const api = viewportApi();
  const runtime = api?.getRuntime?.();
  const sceneView = runtime?.sceneView || null;
  const camera = sceneView?.camera || null;
  return { api, runtime, sceneView, camera };
}

async function moveCursorToNdc(nx, ny, { ease = false, ms = 280 } = {}) {
  const pt = ndcToClient(nx, ny);
  if (!pt) return false;
  if (ease) await moveTourCursorTo(pt.x, pt.y, { ms });
  else setTourCursorPosition(pt.x, pt.y);
  return true;
}

/** Animate an orbit around the current target (RMB-style) with fake cursor drag. */
export async function tourAnimateOrbit({
  azimuth = 0.85,
  polar = 0.12,
  steps = 14,
  stepMs = 35,
} = {}) {
  const api = viewportApi();
  if (!api?.orbitCamera) return false;
  await tourCursorOrbitDrag({
    azimuth,
    polar,
    steps,
    stepMs,
    orbitCamera: (delta) => api.orbitCamera(delta),
  });
  return true;
}

/** Frame the current selection in the active pane (same as F / Focus). */
export function tourFocusSelection() {
  const api = viewportApi();
  if (!api?.focusSelected) return false;
  api.focusSelected();
  return true;
}

/**
 * Scan the viewport for a surface hit while moving the fake cursor.
 * Returns { hit, nx, ny } or null.
 */
export async function tourScanPickSurface({ preferActorId = null, step = 0.14 } = {}) {
  const { sceneView, camera } = sceneViewAndCamera();
  if (!sceneView?.pickSurface || !camera) return null;
  let fallback = null;
  let sample = 0;
  for (let y = 0.85; y >= -0.85; y -= step) {
    for (let x = -0.85; x <= 0.85; x += step) {
      const hit = sceneView.pickSurface(x, y, camera);
      sample += 1;
      if (sample % 2 === 0) {
        await moveCursorToNdc(x, y);
        await sleep(tourMs(10));
      }
      if (!hit?.actorId || !hit?.surfaceId) continue;
      if (preferActorId && hit.actorId === preferActorId) {
        return { hit, nx: x, ny: y };
      }
      if (!preferActorId) return { hit, nx: x, ny: y };
      if (!fallback) fallback = { hit, nx: x, ny: y };
    }
  }
  return fallback;
}

/**
 * Scan for any pickable actor while moving the fake cursor.
 * Returns { actorId, nx, ny } or null.
 */
export async function tourScanPickActor({ preferActorId = null, step = 0.14 } = {}) {
  const { sceneView, camera } = sceneViewAndCamera();
  if (!sceneView || !camera) return null;
  let fallback = null;
  let sample = 0;
  for (let y = 0.85; y >= -0.85; y -= step) {
    for (let x = -0.85; x <= 0.85; x += step) {
      let actorId = null;
      if (typeof sceneView.pickActorId === 'function') {
        actorId = sceneView.pickActorId(x, y, camera);
      } else {
        const hits = sceneView.pickWorldHits?.(x, y, camera) || [];
        actorId = hits.find((h) => h?.actorId)?.actorId || null;
      }
      sample += 1;
      if (sample % 2 === 0) {
        await moveCursorToNdc(x, y);
        await sleep(tourMs(10));
      }
      if (!actorId) continue;
      if (preferActorId && actorId === preferActorId) {
        return { actorId, nx: x, ny: y };
      }
      if (!preferActorId) return { actorId, nx: x, ny: y };
      if (!fallback) fallback = { actorId, nx: x, ny: y };
    }
  }
  return fallback;
}

/**
 * Select an actor the way a user would: soft-select → focus → orbit → re-pick + click.
 */
export async function tourSelectActorLikeUser(editor, actor, { orbit = true } = {}) {
  if (!actor?.id || !editor?.selectActors) return false;
  editor.setTool?.('select');
  editor.selectActors([actor.id]);
  tourFocusSelection();
  await sleep(tourMs(80));
  if (orbit) {
    await tourAnimateOrbit({ azimuth: 0.55, polar: 0.08, steps: 10, stepMs: 30 });
  }
  const picked = await tourScanPickActor({ preferActorId: actor.id });
  if (picked) {
    await moveCursorToNdc(picked.nx, picked.ny, { ease: true, ms: 220 });
    await tourCursorClick({ button: 'left' });
    editor.selectActors([picked.actorId]);
    return true;
  }
  editor.selectActors([actor.id]);
  return true;
}

/**
 * Enter Surface (or Geometry Face) and pick a face under the cursor after framing.
 */
export async function tourSelectFaceLikeUser(editor, actor, {
  geometryMode = false,
  materialId = null,
} = {}) {
  if (!actor?.id || !editor) return null;

  editor.selectActors?.([actor.id]);
  tourFocusSelection();
  await sleep(tourMs(80));
  await tourAnimateOrbit({ azimuth: 0.45, polar: 0.1, steps: 10, stepMs: 28 });

  if (geometryMode) {
    editor.setTool?.('geometry');
    editor.setGeometryMode?.('face');
  } else {
    editor.setTool?.('surface');
  }
  await sleep(tourMs(60));

  const picked = await tourScanPickSurface({ preferActorId: actor.id });
  if (!picked?.hit) {
    const surfaceId = '+x';
    if (geometryMode && editor.setGeometrySelection) {
      editor.setGeometrySelection({
        mode: 'face',
        items: [{ actorId: actor.id, ids: [surfaceId] }],
        primary: { actorId: actor.id, id: surfaceId },
      });
    } else {
      editor.setSelectedSurface?.({ actorId: actor.id, surfaceId });
    }
    if (materialId) {
      editor.selectActors?.([actor.id]);
      editor.updateSelectedBrush?.({
        faceMaterials: { [surfaceId]: materialId },
      });
    }
    return { actorId: actor.id, surfaceId };
  }

  const { hit, nx, ny } = picked;
  await moveCursorToNdc(nx, ny, { ease: true, ms: 220 });
  await tourCursorClick({ button: 'left' });

  if (geometryMode && editor.setGeometrySelection) {
    editor.setGeometrySelection({
      mode: 'face',
      items: [{ actorId: hit.actorId, ids: [hit.surfaceId] }],
      primary: { actorId: hit.actorId, id: hit.surfaceId },
    });
  } else {
    editor.setSelectedSurface?.({
      actorId: hit.actorId,
      surfaceId: hit.surfaceId,
    });
  }

  if (materialId) {
    editor.selectActors?.([hit.actorId]);
    const structural = editor.world?.getActor?.(hit.actorId)?.getComponent?.('Brush')
      || editor.world?.getActor?.(hit.actorId)?.getComponent?.('ConvexBrush');
    editor.updateSelectedBrush?.({
      faceMaterials: {
        ...(structural?.faceMaterials || {}),
        [hit.surfaceId]: materialId,
      },
    });
  }

  return hit;
}

/** Heuristic: tip is about orbiting / looking around. */
export function stepWantsOrbit(step) {
  const id = String(step?.id || '');
  const title = String(step?.title || '');
  const body = String(step?.body || '');
  return /orbit|free-fly|fly|camera|chrome|viewport/i.test(`${id} ${title} ${body}`);
}
