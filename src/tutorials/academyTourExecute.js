/**
 * Academy Tour step execution — performs the tip’s task so the viewport shows
 * the instruction instead of only auto-skipping empty starters.
 */

import { findAsset } from '../assets/AssetRegistry.js';
import { dockIdForTutorialHighlight, findDockTabElement } from './positionCoachMark.js';
import {
  stepWantsOrbit,
  tourAnimateOrbit,
  tourFocusSelection,
  tourSelectActorLikeUser,
  tourSelectFaceLikeUser,
} from './academyTourViewport.js';
import {
  ensureTourViewportConfig,
  setTourCameraMode,
  setTourLayoutMode,
} from './academyTourViewportConfig.js';
import {
  getViewportCanvasRect,
  hideTourCursor,
  moveTourCursorTo,
  tourCursorClickHighlight,
} from './tourCursor.js';
import { tourMs } from './tourSpeed.js';

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function brushBounds(kind, operation) {
  if (operation === 'subtract' || kind === 'subtract') {
    return {
      min: { x: -40, y: 0, z: -40 },
      max: { x: 40, y: 220, z: 40 },
    };
  }
  if (kind === 'floor' || kind === 'ceiling') {
    return {
      min: { x: -150, y: kind === 'ceiling' ? 250 : 0, z: -150 },
      max: { x: 150, y: kind === 'ceiling' ? 260 : 10, z: 150 },
    };
  }
  if (kind === 'wall') {
    return {
      min: { x: -120, y: 0, z: -12 },
      max: { x: 120, y: 250, z: 12 },
    };
  }
  if (kind === 'column') {
    return {
      min: { x: -25, y: 0, z: -25 },
      max: { x: 25, y: 300, z: 25 },
    };
  }
  if (kind === 'arch' || kind === 'archRoman' || kind === 'archGothic') {
    return {
      min: { x: -80, y: 0, z: -20 },
      max: { x: 80, y: 280, z: 20 },
    };
  }
  if (kind === 'curvedWall') {
    return {
      min: { x: -100, y: 0, z: -100 },
      max: { x: 100, y: 250, z: 100 },
    };
  }
  if (kind === 'ramp' || kind === 'stair') {
    return {
      min: { x: -50, y: 0, z: 0 },
      max: { x: 50, y: 100, z: 200 },
    };
  }
  return {
    min: { x: -50, y: 0, z: -50 },
    max: { x: 50, y: 100, z: 50 },
  };
}

function resolveTracked(editor, runtime, trackAs) {
  if (!trackAs || !runtime?.tracked?.[trackAs]) return null;
  return editor.world?.getActor?.(runtime.tracked[trackAs]) || null;
}

function findActorMatching(editor, verify) {
  const actors = editor.world?.actors || [];
  for (let i = actors.length - 1; i >= 0; i -= 1) {
    const actor = actors[i];
    if (verify.nameIncludes) {
      const name = String(actor.name || '').toLowerCase();
      if (!name.includes(String(verify.nameIncludes).toLowerCase())) continue;
    }
    if (verify.hasBrush && !actor.getComponent?.('Brush')) continue;
    if (verify.hasLight && !actor.getComponent?.('Light')) continue;
    if (verify.hasMesh && !actor.getComponent?.('StaticMesh')) continue;
    if (verify.hasCell && !actor.getComponent?.('Cell')) continue;
    return actor;
  }
  return null;
}

function escapeAttr(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Highlights that open save / spend / destructive / permission prompts —
 * never auto-click on tour. Record opens the browser tab/window picker
 * (cannot Cancel from the page), so it must not be clicked either.
 */
const TOUR_NO_CLICK_HIGHLIGHTS = new Set([
  'toolbar.save',
  'toolbar.saveAll',
  'toolbar.record',
  'toolbar.recordStop',
  'menu.file.save',
  'menu.file.saveAs',
  'menu.file.saveAll',
  'openart.savePrompt',
  'openart.generate',
  'meshy.generate',
]);

function isSafeTourClickHighlight(highlightId) {
  const id = String(highlightId || '');
  if (!id) return false;
  if (TOUR_NO_CLICK_HIGHLIGHTS.has(id)) return false;
  if (/\.save\b|\.saveAs\b|savePrompt|approveSpend|generate|\.record\b|recordStop/i.test(id)) {
    return false;
  }
  return true;
}

/** Exported for tests — which highlights the tour refuses to click. */
export function isTourClickHighlightAllowed(highlightId) {
  return isSafeTourClickHighlight(highlightId);
}

function clickTutorialTarget(highlightId) {
  if (!isSafeTourClickHighlight(highlightId)) return false;
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(`[data-bb-tutorial="${escapeAttr(highlightId)}"]`);
  if (!el) return false;
  const clickable = el.matches('button, a, select, input, [role="button"], [role="tab"]')
    ? el
    : (el.querySelector('button, a, select, input, [role="button"], [role="tab"]') || el);
  if (typeof clickable.click === 'function') {
    clickable.click();
    return true;
  }
  return false;
}

/** Move the fake cursor to a highlight and click it (falls back to a plain click). */
async function clickTutorialTargetWithCursor(highlightId) {
  if (!isSafeTourClickHighlight(highlightId)) return false;
  const ok = await tourCursorClickHighlight(highlightId);
  if (ok) return true;
  return clickTutorialTarget(highlightId);
}

/**
 * Close open menus / dropdowns left behind by tip clicks (Cam, View, File menu,
 * context menus, native selects). Uses outside-click events the menus already listen for.
 * Does not send Escape — that stops the Academy Tour.
 */
export function dismissTourDropdowns() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const hadOpen = Boolean(
    document.querySelector('.bb-viewport-pane-menu.is-open')
    || document.querySelector('.bb-menu-trigger.is-open')
    || document.querySelector('.bb-menu-list')
    || document.querySelector('.bb-ctx-menu')
    || document.querySelector('select:focus')
    || document.querySelector('[aria-expanded="true"][aria-haspopup]'),
  );

  const opts = {
    bubbles: true,
    cancelable: true,
    clientX: 1,
    clientY: 1,
    button: 0,
  };
  // Outside the menu roots so AppMenuBar / Cam / View / context menus close.
  const sink = document.documentElement;
  try {
    sink.dispatchEvent(new MouseEvent('mousedown', opts));
    if (typeof PointerEvent === 'function') {
      sink.dispatchEvent(new PointerEvent('pointerdown', {
        ...opts,
        pointerId: 1,
        pointerType: 'mouse',
      }));
    }
    sink.dispatchEvent(new MouseEvent('mouseup', opts));
  } catch {
    // jsdom / older browsers — still blur focused selects below.
  }

  const active = document.activeElement;
  if (
    active
    && active !== document.body
    && typeof active.blur === 'function'
    && (
      active.tagName === 'SELECT'
      || active.getAttribute?.('aria-expanded') === 'true'
    )
  ) {
    active.blur();
  }

  return hadOpen;
}

/**
 * Auto-dismiss editor popups during Academy Tour (not coach tips).
 * - Save / filename / input prompts → Cancel (never write)
 * - Unsaved / continue confirms → Discard / OK / Yes
 * - Alerts / notices → OK
 * - Anything else → Cancel, else OK
 */
export function dismissTourDialogs() {
  if (typeof document === 'undefined') return false;
  // Only `.bb-dialog` (EditorDialogContext). Coach tips also use role="dialog".
  const root = document.querySelector('.bb-dialog-root .bb-dialog');
  if (!root) return false;

  const title = root.querySelector('.bb-dialog__title')?.textContent || '';
  const message = root.querySelector('.bb-dialog__message')?.textContent || '';
  const text = `${title}\n${message}`.toLowerCase();
  const footerButtons = Array.from(
    root.querySelector('.bb-dialog__footer')?.querySelectorAll('button')
      || root.querySelectorAll('button'),
  ).filter((btn) => !btn.classList.contains('bb-dialog-backdrop'));

  const clickLabel = (re) => {
    const btn = footerButtons.find((b) => re.test((b.textContent || '').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  };

  const hasPromptInput = Boolean(root.querySelector('.bb-dialog__input, input, textarea'));
  const isSaveOrInput = hasPromptInput
    || /save tutorial|filename|save level as|keep this work|save as|enter a|input/i.test(text);
  const isUnsaved = /unsaved|discard|leave materials|switch material/i.test(text);
  const isAlertOnly = footerButtons.length === 1
    && /^(ok|close|got it|continue)$/i.test((footerButtons[0].textContent || '').trim());

  // Save / text prompts → Cancel (never commit during tour).
  if (isSaveOrInput && !isUnsaved) {
    if (clickLabel(/^cancel$/i)) return true;
    if (clickLabel(/^keep editing$/i)) return true;
    return false;
  }

  // Unsaved / leave confirms → proceed without saving.
  if (isUnsaved) {
    if (clickLabel(/^discard$/i)) return true;
    if (clickLabel(/^(ok|yes|continue|leave)$/i)) return true;
    if (clickLabel(/^cancel$/i)) return true;
    return false;
  }

  // Simple alerts / notices → OK.
  if (isAlertOnly || /notice|error|failed|warning|info/i.test(title)) {
    if (clickLabel(/^(ok|close|got it|continue)$/i)) return true;
  }

  // Default: Cancel if present, otherwise OK.
  if (clickLabel(/^cancel$/i)) return true;
  if (clickLabel(/^(ok|close|got it|continue|yes|discard)$/i)) return true;
  if (footerButtons[0]) {
    footerButtons[0].click();
    return true;
  }
  return false;
}

/** Keep dismissing popups / menus for a short window (async confirms need a few frames). */
export async function dismissTourDialogsUntilClear({
  attempts = 12,
  gapMs = 40,
} = {}) {
  let dismissed = false;
  for (let i = 0; i < attempts; i += 1) {
    if (dismissTourDialogs()) dismissed = true;
    if (dismissTourDropdowns()) dismissed = true;
    const open = typeof document !== 'undefined'
      && document.querySelector('.bb-dialog-root .bb-dialog');
    if (!open) {
      dismissTourDropdowns();
      return dismissed;
    }
    await new Promise((r) => window.setTimeout(r, tourMs(gapMs)));
  }
  dismissTourDialogs();
  dismissTourDropdowns();
  return dismissed;
}

/**
 * Infer which workspace a tip needs from its highlight ids.
 * Only returns level | materials | ai — never placeholder modules.
 * Default is Level Editor so construction tips leave Materials/AI.
 */
export function workspaceForTourStep(step) {
  const ids = Array.isArray(step?.highlight)
    ? step.highlight.map(String)
    : (step?.highlight ? [String(step.highlight)] : []);
  for (const id of ids) {
    if (id === 'workspace.materials' || id.startsWith('materials.')) return 'materials';
    if (
      id === 'workspace.ai'
      || id.startsWith('ai.')
      || id.startsWith('openart.')
      || id.startsWith('projectArt.')
      || id.startsWith('meshy.')
    ) {
      return 'ai';
    }
    if (id === 'workspace.level') return 'level';
  }
  return 'level';
}

/**
 * Switch to the tip’s module (Level / Materials / AI Assets) when needed.
 * Discards unsaved material drafts so leave-guard does not block the tour.
 * @returns {Promise<string>} workspace id targeted
 */
export async function ensureTourWorkspace(step, layout) {
  const want = workspaceForTourStep(step);
  if (!layout?.setWorkspace) return want;
  const current = layout.layout?.workspace || layout.workspace;
  if (current === want) return want;

  const pending = Promise.resolve(layout.setWorkspace(want)).catch(() => {});
  // Leave-guard confirm is async — Discard so setWorkspace can finish.
  const poll = (async () => {
    for (let i = 0; i < 40; i += 1) {
      dismissTourDialogs();
      await sleep(tourMs(40));
    }
  })();
  await Promise.all([pending, poll]);
  dismissTourDialogs();
  return want;
}

function ensureHighlightPanels(highlightIds, layout) {
  const ids = Array.isArray(highlightIds) ? highlightIds : [];
  for (const id of ids) {
    const dockId = dockIdForTutorialHighlight(id);
    if (dockId) {
      layout?.ensurePanel?.(dockId);
      const tab = findDockTabElement(dockId);
      tab?.click?.();
    }
  }
}

/**
 * Perform the action a tip describes (sync). Prefer `executeTourStepAsync` on tour.
 * @returns {{ handled: boolean, confirmManual: boolean }}
 */
export function executeTourStep({ step, runtime, editor, layout }) {
  const verify = step?.verify || { type: 'none' };
  const type = verify.type || 'none';

  dismissTourDialogs();
  ensureHighlightPanels(step?.highlight, layout);
  // UI clicks with the fake cursor happen in executeTourStepAsync.

  if (type === 'manualConfirm' || type === 'always' || type === 'none') {
    return { handled: true, confirmManual: true };
  }

  switch (type) {
    case 'actorSelected': {
      const actor = findActorMatching(editor, verify);
      if (actor) {
        editor.selectActors?.([actor.id]);
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'brushCreated': {
      const kind = verify.operation === 'subtract'
        ? 'subtract'
        : (verify.kind || 'box');
      const { min, max } = brushBounds(kind, verify.operation);
      const actor = editor.createBrushAtBounds?.(kind, min, max);
      return { handled: Boolean(actor), confirmManual: false };
    }
    case 'rampCreated': {
      const { min, max } = brushBounds('ramp');
      const actor = editor.createBrushAtBounds?.('ramp', min, max);
      return { handled: Boolean(actor), confirmManual: false };
    }
    case 'stairCreated': {
      const { min, max } = brushBounds('stair');
      const actor = editor.createBrushAtBounds?.('stair', min, max);
      return { handled: Boolean(actor), confirmManual: false };
    }
    case 'componentCreated': {
      const map = {
        Column: 'column',
        Arch: 'arch',
        CurvedWall: 'curvedWall',
        Ramp: 'ramp',
        Stair: 'stair',
      };
      const kind = map[verify.component];
      if (kind) {
        const { min, max } = brushBounds(kind);
        const actor = editor.createBrushAtBounds?.(kind, min, max);
        return { handled: Boolean(actor), confirmManual: false };
      }
      break;
    }
    case 'gridSizeIs': {
      editor.setGridSize?.(Number(verify.value));
      return { handled: true, confirmManual: false };
    }
    case 'toolIs': {
      editor.setTool?.(verify.tool);
      return { handled: true, confirmManual: false };
    }
    case 'transformModeIs': {
      editor.setTransformMode?.(verify.mode || 'move');
      return { handled: true, confirmManual: false };
    }
    case 'geometryModeIs': {
      editor.setTool?.('geometry');
      editor.setGeometryMode?.(verify.mode || 'face');
      return { handled: true, confirmManual: false };
    }
    case 'viewportCameraIs': {
      return {
        handled: setTourCameraMode(verify.cameraMode || 'isometric'),
        confirmManual: false,
      };
    }
    case 'viewportLayoutIs': {
      return {
        handled: setTourLayoutMode(verify.layoutMode || 'quad', layout),
        confirmManual: false,
      };
    }
    case 'lightPlaced': {
      const actor = editor.placeLight?.(verify.lightType || 'point', { x: 0, y: 220, z: 0 });
      return { handled: Boolean(actor), confirmManual: false };
    }
    case 'lightEdited': {
      const actor = resolveTracked(editor, runtime, verify.trackAs)
        || editor.world?.getActor?.(editor.selectedActorIds?.[editor.selectedActorIds.length - 1]);
      if (actor) {
        editor.selectActors?.([actor.id]);
        const light = actor.getComponent?.('Light');
        if (light && typeof editor.updateSelectedLight === 'function') {
          editor.updateSelectedLight({ intensity: (Number(light.intensity) || 1) + 0.5 });
          return { handled: true, confirmManual: false };
        }
        // Fallback: nudge transform so something changed if light API missing
        editor.updateSelectedTransform?.({
          position: {
            x: (actor.transform?.position?.x || 0) + 25,
            y: actor.transform?.position?.y || 200,
            z: actor.transform?.position?.z || 0,
          },
        }, { snap: false });
      }
      break;
    }
    case 'cellCreated': {
      const cell = editor.createCell?.('Tour Cell', { x: 0, y: 0, z: 0 });
      return { handled: Boolean(cell), confirmManual: false };
    }
    case 'actorParented': {
      const child = resolveTracked(editor, runtime, verify.childTrackAs);
      const parent = resolveTracked(editor, runtime, verify.parentTrackAs);
      if (child && parent) {
        editor.selectActors?.([child.id]);
        editor.reparentSelected?.(parent.id);
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'actorFlag': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        if (verify.flag === 'locked') {
          editor.setSelectedActorFlags?.({ locked: true });
        } else if (verify.flag === 'hidden') {
          editor.setSelectedActorFlags?.({ visible: false });
        } else if (verify.flag === 'visible') {
          editor.setSelectedActorFlags?.({ visible: true });
        }
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'transformChanged':
    case 'brushResized': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        if (type === 'brushResized' && actor.getComponent?.('Brush')) {
          const brush = actor.getComponent('Brush');
          editor.updateSelectedBrush?.({
            size: {
              x: brush.size.x,
              y: brush.size.y,
              z: Math.max((brush.size.z || 25) + 25, 50),
            },
          });
        } else {
          const pos = actor.transform?.position || { x: 0, y: 0, z: 0 };
          editor.updateSelectedTransform?.({
            position: { x: pos.x + 50, y: pos.y, z: pos.z },
          });
        }
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'openingAdded': {
      const actor = resolveTracked(editor, runtime, verify.trackAs)
        || findActorMatching(editor, { hasBrush: true, nameIncludes: 'Wall' });
      if (actor) {
        editor.selectActors?.([actor.id]);
        editor.addBrushOpening?.(verify.openingType || 'door');
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'materialAssigned': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        editor.updateSelectedBrush?.({
          materialId: verify.materialId || 'mat_verify_wall',
        });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'uvChanged': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        const brush = actor.getComponent?.('Brush');
        const uv = brush?.uv || { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 };
        editor.updateSelectedBrush?.({
          uv: {
            ...uv,
            scale: { x: (uv.scale?.x || 1) * 1.5, y: uv.scale?.y || 1 },
          },
        });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'faceMaterialAssigned': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        const structural = actor.getComponent?.('Brush')
          || actor.getComponent?.('ConvexBrush')
          || actor.getComponent?.('Ramp')
          || actor.getComponent?.('Stair');
        const matId = verify.materialId || 'mat_verify_wall';
        editor.updateSelectedBrush?.({
          faceMaterials: { ...(structural?.faceMaterials || {}), '+x': matId },
        });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'surfaceSelected': {
      const actor = resolveTracked(editor, runtime, verify.trackAs)
        || editor.world?.getActor?.(editor.selectedActorIds?.[0]);
      if (actor && typeof editor.setSelectedSurface === 'function') {
        editor.setSelectedSurface({ actorId: actor.id, surfaceId: '+x' });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'meshPlaced': {
      const meshId = verify.meshId || 'mesh_verify_cube';
      const asset = (editor.assetRegistry && findAsset(editor.assetRegistry, meshId))
        || { id: meshId, name: 'Verify Cube' };
      const actor = editor.placeMeshAsset?.(asset, { x: 0, y: 50, z: 0 });
      return { handled: Boolean(actor), confirmManual: false };
    }
    case 'meshCollision': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor && typeof editor.updateSelectedStaticMesh === 'function') {
        editor.selectActors?.([actor.id]);
        editor.updateSelectedStaticMesh({ collisionType: verify.collision || 'box' });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'canUndo': {
      const actor = editor.world?.actors?.find((a) => a.getComponent?.('Brush'))
        || editor.world?.actors?.[0];
      if (actor) {
        editor.selectActors?.([actor.id]);
        const pos = actor.transform?.position || { x: 0, y: 0, z: 0 };
        editor.updateSelectedTransform?.({
          position: { x: pos.x + 25, y: pos.y, z: pos.z },
        });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'undoConsumed': {
      editor.undo?.();
      return { handled: true, confirmManual: false };
    }
    case 'modeIs': {
      if (verify.mode === 'play') {
        void editor.play?.();
        return { handled: true, confirmManual: false };
      }
      if (verify.mode === 'edit') {
        void editor.stop?.();
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'modeSequence': {
      const seq = verify.sequence || [];
      if (seq.includes('play') && editor.mode !== 'play') {
        void editor.play?.();
      } else if (seq[seq.length - 1] === 'edit') {
        void editor.stop?.();
      }
      return { handled: true, confirmManual: false };
    }
    case 'hasComponent': {
      if (verify.component === 'ConvexBrush') {
        const actor = resolveTracked(editor, runtime, verify.trackAs)
          || findActorMatching(editor, { hasBrush: true, nameIncludes: 'Wall' });
        if (actor) {
          editor.selectActors?.([actor.id]);
          editor.convertSelectedToConvexBrush?.();
          return { handled: true, confirmManual: false };
        }
      }
      break;
    }
    case 'brushCarved': {
      const wall = resolveTracked(editor, runtime, verify.trackAs);
      const cutter = resolveTracked(editor, runtime, verify.byCutter);
      if (wall && cutter) {
        const wallPos = wall.transform?.position || { x: 0, y: 0, z: 0 };
        editor.selectActors?.([cutter.id]);
        editor.updateSelectedTransform?.({
          position: { x: wallPos.x, y: wallPos.y + 50, z: wallPos.z },
        }, { snap: false });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'prefabOverridePresent': {
      const actor = resolveTracked(editor, runtime, verify.trackAs);
      if (actor) {
        editor.selectActors?.([actor.id]);
        const pos = actor.transform?.position || { x: 0, y: 0, z: 0 };
        editor.updateSelectedTransform?.({
          position: { x: pos.x + 40, y: pos.y, z: pos.z },
        });
        return { handled: true, confirmManual: false };
      }
      break;
    }
    case 'stairTypeIs':
    case 'stairSweepSet': {
      const actor = resolveTracked(editor, runtime, verify.trackAs)
        || editor.world?.getActor?.(editor.selectedActorIds?.[editor.selectedActorIds.length - 1]);
      if (actor?.getComponent?.('Stair') && typeof editor.updateSelectedStair === 'function') {
        editor.selectActors?.([actor.id]);
        const patch = {};
        if (type === 'stairTypeIs') patch.stairType = verify.stairType || 'curved';
        if (type === 'stairSweepSet') patch.sweepAngle = Math.max(Number(verify.minSweep) || 90, 90);
        editor.updateSelectedStair(patch);
        return { handled: true, confirmManual: false };
      }
      break;
    }
    default:
      break;
  }

  // Last resort: tip highlights a control — clicking it may be enough (Play, Undo, etc.).
  const firstHighlight = Array.isArray(step?.highlight) ? step.highlight[0] : null;
  if (firstHighlight && clickTutorialTarget(firstHighlight)) {
    return { handled: true, confirmManual: false };
  }

  return { handled: false, confirmManual: type === 'manualConfirm' };
}

/**
 * Viewport-first interactions (orbit / focus / face pick), then API fallbacks.
 */
async function executeTourViewportStep({ step, runtime, editor }) {
  const verify = step?.verify || { type: 'none' };
  const type = verify.type || 'none';

  if (type === 'manualConfirm' || type === 'always' || type === 'none') {
    if (stepWantsOrbit(step)) {
      await tourAnimateOrbit({ azimuth: 0.9, polar: 0.1, steps: 14, stepMs: 32 });
    }
    return { handled: true, confirmManual: true };
  }

  if (type === 'actorSelected') {
    const actor = findActorMatching(editor, verify);
    if (!actor) return { handled: false, confirmManual: false };
    await tourSelectActorLikeUser(editor, actor);
    return { handled: true, confirmManual: false };
  }

  if (type === 'surfaceSelected') {
    const actor = resolveTracked(editor, runtime, verify.trackAs)
      || findActorMatching(editor, { hasBrush: true })
      || editor.world?.getActor?.(editor.selectedActorIds?.[0]);
    if (!actor) return { handled: false, confirmManual: false };
    const hit = await tourSelectFaceLikeUser(editor, actor, { geometryMode: false });
    return { handled: Boolean(hit), confirmManual: false };
  }

  if (type === 'geometrySelected') {
    const actor = resolveTracked(editor, runtime, verify.trackAs)
      || findActorMatching(editor, { hasBrush: true })
      || editor.world?.actors?.find((a) => a.getComponent?.('ConvexBrush'))
      || editor.world?.getActor?.(editor.selectedActorIds?.[0]);
    if (!actor) return { handled: false, confirmManual: false };
    const hit = await tourSelectFaceLikeUser(editor, actor, { geometryMode: true });
    return { handled: Boolean(hit), confirmManual: false };
  }

  if (type === 'faceMaterialAssigned') {
    const actor = resolveTracked(editor, runtime, verify.trackAs)
      || findActorMatching(editor, { hasBrush: true })
      || editor.world?.getActor?.(editor.selectedActorIds?.[0]);
    if (!actor) return { handled: false, confirmManual: false };
    const hit = await tourSelectFaceLikeUser(editor, actor, {
      geometryMode: false,
      materialId: verify.materialId || 'mat_verify_wall',
    });
    return { handled: Boolean(hit), confirmManual: false };
  }

  if (
    type === 'brushCreated'
    || type === 'rampCreated'
    || type === 'stairCreated'
    || type === 'componentCreated'
    || type === 'lightPlaced'
    || type === 'cellCreated'
    || type === 'meshPlaced'
  ) {
    // Create via APIs first, then frame + orbit so the user sees the result.
    return { handled: false, confirmManual: false, showAfterCreate: true };
  }

  return { handled: false, confirmManual: false };
}

async function clickStepHighlightsWithCursor(step) {
  const highlights = Array.isArray(step?.highlight)
    ? step.highlight.map(String)
    : (step?.highlight ? [String(step.highlight)] : []);
  const workspaceHit = highlights.find((id) => id.startsWith('workspace.'));
  if (workspaceHit) await clickTutorialTargetWithCursor(workspaceHit);
  const other = highlights.find((id) => (
    !id.startsWith('workspace.') && isSafeTourClickHighlight(id)
  ));
  if (other) await clickTutorialTargetWithCursor(other);
}

/** Open the right editor module, interact in the viewport, then API fallbacks. */
export async function executeTourStepAsync(args) {
  await ensureTourWorkspace(args.step, args.layout);
  ensureTourViewportConfig(args.step, args.layout);
  ensureHighlightPanels(args.step?.highlight, args.layout);
  await clickStepHighlightsWithCursor(args.step);
  // Cam / View / File clicks open menus; close them so they never cover the action.
  dismissTourDropdowns();

  const viewport = await executeTourViewportStep(args);
  if (viewport.handled) {
    dismissTourDropdowns();
    return viewport;
  }

  const result = executeTourStep(args);
  if (viewport.showAfterCreate && result.handled) {
    const selectedId = args.editor?.selectedActorIds?.[args.editor.selectedActorIds.length - 1];
    if (selectedId) {
      const rect = getViewportCanvasRect();
      if (rect) {
        await moveTourCursorTo(
          rect.left + rect.width * 0.55,
          rect.top + rect.height * 0.45,
          { ms: 300 },
        );
      }
      tourFocusSelection();
      await tourAnimateOrbit({ azimuth: 0.65, polar: 0.08, steps: 10, stepMs: 28 });
    }
  }
  dismissTourDropdowns();
  return result;
}

export { hideTourCursor };

/**
 * Wait, then re-read editor state for tour advancement.
 * Exported for tests that need the delay constant only.
 */
export { sleep };
