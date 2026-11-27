import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { useEditor } from './EditorContext.jsx';
import { useEditorSettings } from './EditorSettingsContext.jsx';
import { useEditorDialogs } from '../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../ui/contextMenu/EditorContextMenu.jsx';
import {
  snapToGrid,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import { getBrushSnapSize, snapMovedAxis } from './gridSnap.js';
import {
  applyActorWorldPivotPosition,
  snapshotPivotState,
  restorePivotState,
} from '../core/contentOffset.js';
import { actorSupportsPivotEdit } from '../rules/pivotEdit.js';
import { resizeBrushFace } from './brushFactory.js';
import { findAsset } from '../assets/AssetRegistry.js';
import { ASSET_DRAG_MIME_MATERIAL } from '../assets/assetCatalog.js';
import { useAssetBrowser } from './assets/AssetBrowserContext.jsx';
import { CreationToolbar } from './creation/CreationToolbar.jsx';
import {
  CREATE_DRAG_MIME,
  parseCreateDragPayload,
} from './creation/creationTools.js';
import {
  computePlacePose,
  selectPlacementHit,
} from './creation/surfacePlacement.js';
import {
  commitCreatePlacement,
  previewSizeForPayload,
  previewBoundsForPayload,
} from './creation/commitCreatePlacement.js';
import { toggleGeometryItem } from './geometryEditing/geometrySelection.js';
import {
  clampViewportPrefs,
  loadViewportPrefs,
  mergeViewportViewIntoPrefs,
  saveViewportPrefs,
  isOrthographicMode,
  viewportViewFromPrefs,
} from './viewport/viewportPrefs.js';
import { useLayout } from './layout/LayoutContext.jsx';
import { viewScaleFactor } from './layout/viewScale.js';
import { ViewportLayout } from './viewport/ViewportLayout.jsx';
import {
  applyEditorViewportLook,
  buildViewportPanes,
  capturePanePoses,
  configureOrbitForPane,
  filterGizmoAxisForOrtho,
  focusPaneOnSelection,
  resolvePointerInPanes,
  syncActivePaneCamera,
} from './viewport/viewportRuntimeBridge.js';
import { cameraBookmarkSlotFromEvent } from './viewport/cameraBookmarks.js';
import {
  goToActivePaneCameraBookmark,
  storeActivePaneCameraBookmark,
  syncLookFromCamera,
} from './viewport/cameraBookmarkActions.js';
import {
  resetAllViewportCameraViews,
  resetViewportCameraView,
} from './viewport/cameraViewReset.js';
import {
  normalizeMarqueeNdc,
  marqueeSelectActors,
  marqueeSelectGeometry,
} from './viewport/marqueeSelection.js';

export function Viewport() {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const orbitRef = useRef(null);
  const dragRef = useRef(null);
  const viewportPrefsRef = useRef(loadViewportPrefs());
  const shellSizeRef = useRef({ width: 1, height: 1 });
  const persistTimerRef = useRef(0);
  const [viewportPrefs, setViewportPrefsState] = useState(() => viewportPrefsRef.current);
  const [shellSize, setShellSize] = useState({ width: 1, height: 1 });
  const [marqueeScreen, setMarqueeScreen] = useState(null);
  /** Active toolbar/asset surface placement (preview only until commit). */
  const placeSessionRef = useRef(null);
  /** Edit-mode perspective: Ctrl+move orbits; Alt+move/rotate/scale duplicates; RMB look; WASD fly. */
  const flyKeysRef = useRef(new Set());
  const flyClockRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const flyModeRef = useRef(false);
  /** Perspective: hold Ctrl and move the mouse to orbit (no mouse button). */
  const ctrlOrbitHeldRef = useRef(false);
  /** Plain RMB drag freelook (perspective only; not while Ctrl orbits). */
  const rmbLookHeldRef = useRef(false);
  /** Distinguishes short RMB click (context menu) from drag look/orbit. */
  const rmbGestureRef = useRef(null);
  const openViewportContextMenuRef = useRef(() => {});
  const lookRef = useRef({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    yaw: 0,
    pitch: 0,
    distance: 6,
  });
  /** Live editor camera prefs (read by orbit setup / freelook handlers). */
  const editorSettingsRef = useRef(null);

  const {
    attachCanvas,
    runtimeRef,
    mode,
    tool,
    setTool,
    setSelectedSurface,
    setAlignReferenceSurface,
    alignReferenceSurface,
    alignSurfaceToReference,
    setStatus,
    transformMode,
    pivotEditMode,
    setPivotEditMode,
    gizmoSpace,
    scaleHandleStyle,
    setTransformMode,
    cycleScaleTransform,
    commitPivotChanges,
    selectActor,
    selectAllActors,
    deselectAllActors,
    cycleGridSize,
    toggleGridSnap,
    selectedActorIds,
    world,
    gridSize,
    gridSnap,
    createBrushAtBounds,
    previewActorPositions,
    previewActorLocalTransforms,
    previewBrushGeometry,
    commitTransforms,
    commitBrushGeometry,
    geometryMode,
    geometrySelection,
    setGeometrySelection,
    beginFaceMoveDrag,
    previewFaceMove,
    commitFaceMove,
    cancelFaceMove,
    clipSession,
    cancelClipSession,
    addClipPoint,
    commitClipSession,
    deleteSelected,
    duplicateSelected,
    renameSelected,
    setSelectedActorFlags,
    undo,
    redo,
    executeCommand,
    stop,
    saveLevel,
    saveAll,
    placeMeshAsset,
    placePrefabAsset,
    placeLight,
    placeEnvironment,
    placePrimitiveMesh,
    placePlayerSpawn,
    createCell,
    reparentSelected,
    createPrefabFromSelection,
    unpackSelectedPrefab,
    assignSelectedSurfaceMaterial,
    assignSelectedSurfaceUv,
    resetSelectedSurfaceUv,
    fitSelectedSurfaceUv,
    getSelectedSurfaceMaterialId,
    applySelectedMaterialToBrush,
    convertActorToConvexBrush,
  } = useEditor();
  const { settings: editorSettings } = useEditorSettings();
  const { layout, setViewportView } = useLayout();
  const { dragMime, registry, materialDefs } = useAssetBrowser();
  const { prompt, confirm } = useEditorDialogs();
  const { openContextMenu } = useEditorContextMenu();

  editorSettingsRef.current = editorSettings;

  const setViewportPrefs = useCallback((next) => {
    const prev = viewportPrefsRef.current;
    const clamped = clampViewportPrefs(
      typeof next === 'function' ? next(prev) : next,
    );
    viewportPrefsRef.current = clamped;
    setViewportPrefsState(clamped);
    // Only push layout chrome (single/multi) — ignore freelook pose churn.
    const prevView = viewportViewFromPrefs(prev);
    const nextView = viewportViewFromPrefs(clamped);
    if (JSON.stringify(prevView) !== JSON.stringify(nextView)) {
      setViewportView(nextView);
    }
    // Tutorials verify Cam / layout — notify when those change (poses alone do not).
    const prevCam = prev.panes?.find((p) => p.id === prev.activePaneId)?.cameraMode;
    const nextCam = clamped.panes?.find((p) => p.id === clamped.activePaneId)?.cameraMode;
    if (
      prev.layoutMode !== clamped.layoutMode
      || prevCam !== nextCam
      || prev.activePaneId !== clamped.activePaneId
    ) {
      window.dispatchEvent(new CustomEvent('bb:viewport-prefs', {
        detail: {
          layoutMode: clamped.layoutMode,
          cameraMode: nextCam,
          activePaneId: clamped.activePaneId,
        },
      }));
    }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      saveViewportPrefs(viewportPrefsRef.current);
    }, 200);
  }, [setViewportView]);

  // Session / named-layout viewport chrome → live prefs (poses preserved).
  useEffect(() => {
    const applyView = (view) => {
      const merged = mergeViewportViewIntoPrefs(viewportPrefsRef.current, view);
      viewportPrefsRef.current = merged;
      setViewportPrefsState(merged);
      saveViewportPrefs(merged);
    };
    applyView(layout.viewportView);
    const onApplyView = (e) => applyView(e.detail);
    window.addEventListener('bb:apply-viewport-view', onApplyView);
    return () => window.removeEventListener('bb:apply-viewport-view', onApplyView);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + named-layout events only
  }, []);

  // Editor Settings → apply display mode to every pane.
  useEffect(() => {
    const onDisplay = (e) => {
      const mode = e?.detail;
      if (typeof mode !== 'string') return;
      setViewportPrefs((prev) => ({
        ...prev,
        panes: prev.panes.map((pane) => ({ ...pane, displayMode: mode })),
      }));
    };
    window.addEventListener('bb:set-all-display-modes', onDisplay);
    return () => window.removeEventListener('bb:set-all-display-modes', onDisplay);
  }, [setViewportPrefs]);

  const clearPlacementSession = useCallback(() => {
    placeSessionRef.current = null;
    runtimeRef.current?.sceneView?.setPlacementPreview(null);
  }, [runtimeRef]);

  const resolveSurfacePose = useCallback((nx, ny, payload, candidateIndex = 0, camera = undefined) => {
    const sceneView = runtimeRef.current?.sceneView;
    if (!sceneView) return { valid: false, position: null, reason: 'No view' };
    const cam = camera || sceneView.camera;
    const hits = sceneView.pickWorldHits(nx, ny, cam);
    const placement = payload?.placement || 'upright';
    const { hit, candidates, index } = selectPlacementHit(hits, {
      placement,
      candidateIndex,
    });
    if (!hit) {
      // Fall back to construction plane so empty scenes still place.
      const plane = sceneView.pickConstructionPoint(nx, ny, 0, cam);
      if (!plane) return { valid: false, position: null, reason: 'No surface', candidates: [] };
      const pose = computePlacePose(
        { point: plane, normal: { x: 0, y: 1, z: 0 }, surfaceKind: 'support' },
        { placement, gridSize, gridSnap, lightLift: payload?.placeKind === 'light' ? 40 : 0 },
      );
      return { ...pose, candidates: [], index: 0 };
    }
    const halfHeight = payload?.placeKind === 'spawn' ? 0 : 0;
    const pose = computePlacePose(hit, {
      placement,
      gridSize,
      gridSnap,
      halfHeight,
      lightLift: payload?.placeKind === 'light' && placement === 'upright' ? 40 : 0,
    });
    return { ...pose, candidates, index };
  }, [runtimeRef, gridSize, gridSnap]);

  const updatePlacementPreview = useCallback((pose, payload) => {
    const sceneView = runtimeRef.current?.sceneView;
    if (!sceneView) return;
    if (!pose?.position) {
      sceneView.setPlacementPreview(null);
      return;
    }
    const bounds = previewBoundsForPayload(payload, pose.position, gridSize);
    sceneView.setPlacementPreview({
      position: pose.position,
      size: previewSizeForPayload(payload, gridSize),
      valid: pose.valid !== false,
      normal: pose.normal,
      rotation: pose.rotation,
      gridSnap,
      kind: bounds?.kind || null,
      min: bounds?.min || null,
      max: bounds?.max || null,
      gridSize,
    });
  }, [runtimeRef, gridSize, gridSnap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return undefined;

    const runtime = attachCanvas(canvas);
    // Seed pane cameras from persisted prefs, then bind OrbitControls to active pane.
    {
      const vp = viewportPrefsRef.current;
      for (const pane of vp.panes) {
        runtime.sceneView.ensurePaneCamera(pane.id, pane.cameraMode, pane);
      }
    }
    const camera = syncActivePaneCamera(runtime.sceneView, viewportPrefsRef.current)
      || runtime.sceneView.camera;
    const controls = new OrbitControls(camera, canvas);
    {
      const prefs = editorSettingsRef.current;
      // Invert vertical orbit by flipping phi deltas when the setting is on.
      const baseRotateUp = controls._rotateUp.bind(controls);
      controls._rotateUp = (angle) => {
        const invert = editorSettingsRef.current?.cameraInvertY;
        baseRotateUp(invert ? -angle : angle);
      };
      applyEditorViewportLook(runtime, prefs);
      runtime.setPlayLookOptions?.({
        sensitivityMul: prefs?.playLookSensitivity ?? 1,
        invertY: Boolean(prefs?.cameraInvertY),
      });
    }
    {
      const active = viewportPrefsRef.current.panes.find(
        (p) => p.id === viewportPrefsRef.current.activePaneId,
      );
      if (active?.target) controls.target.set(...active.target);
      else controls.target.set(0, 1.5, 0);
      syncActivePaneCamera(runtime.sceneView, viewportPrefsRef.current, controls, {
        settings: editorSettingsRef.current,
      });
    }
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.update();
    orbitRef.current = controls;
    flyModeRef.current = false;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const move = new THREE.Vector3();
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const activeCam = () => runtime.sceneView.camera;

    {
      const cam0 = activeCam();
      lookEuler.setFromQuaternion(cam0.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = cam0.position.distanceTo(controls.target) || 6;
    }

    const FLY_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
    const isFlyMoving = (keys) => {
      for (const code of FLY_MOVE_KEYS) {
        if (keys.has(code)) return true;
      }
      return false;
    };

    const syncLookTarget = () => {
      const cam = activeCam();
      cam.getWorldDirection(forward);
      controls.target.copy(cam.position).addScaledVector(forward, lookRef.current.distance);
    };

    const applyLookRotation = () => {
      const { yaw, pitch } = lookRef.current;
      lookEuler.set(pitch, yaw, 0);
      activeCam().quaternion.setFromEuler(lookEuler);
      syncLookTarget();
    };

    const activeCameraMode = () => {
      const activePane = viewportPrefsRef.current.panes.find(
        (p) => p.id === viewportPrefsRef.current.activePaneId,
      );
      return activePane?.cameraMode || 'perspective';
    };

    /** Perspective: RMB is freelook (never OrbitControls rotate). Ortho: plain RMB orbits. */
    const syncOrbitRightButton = () => {
      if (flyModeRef.current || runtime.mode !== 'edit') {
        controls.mouseButtons.RIGHT = -1;
        return;
      }
      controls.mouseButtons.RIGHT = isOrthographicMode(activeCameraMode())
        ? THREE.MOUSE.ROTATE
        : -1;
    };
    syncOrbitRightButton();

    /** Stop OrbitControls mid-drag so it can't fight WASD free-fly. */
    const suspendOrbitForFly = () => {
      controls.enabled = false;
      controls.state = -1; // OrbitControls STATE.NONE
      controls.mouseButtons.RIGHT = -1;
      if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
      if (controls._panOffset) controls._panOffset.set(0, 0, 0);
      if (Array.isArray(controls._pointers)) controls._pointers.length = 0;
    };

    /** Ctrl + mouse move orbit (no button). Matches OrbitControls pixel→angle scale. */
    const ctrlOrbitTrack = { primed: false, lastX: 0, lastY: 0 };
    const applyCtrlOrbit = (dx, dy) => {
      if (runtime.mode !== 'edit' || flyModeRef.current) return;
      if (isOrthographicMode(activeCameraMode())) return;
      const h = Math.max(1, canvas.clientHeight || shell.clientHeight || 1);
      const rotateSpeed = controls.rotateSpeed ?? 1;
      const scale = ((2 * Math.PI) / h) * rotateSpeed;
      if (typeof controls._rotateLeft === 'function') controls._rotateLeft(dx * scale);
      if (typeof controls._rotateUp === 'function') controls._rotateUp(dy * scale);
      controls.update();
    };

    const enterFlyMode = () => {
      if (flyModeRef.current) return;
      flyModeRef.current = true;
      suspendOrbitForFly();
      const cam = activeCam();
      lookEuler.setFromQuaternion(cam.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = Math.max(0.5, cam.position.distanceTo(controls.target));
      syncLookTarget();
    };

    const exitFlyMode = () => {
      if (!flyModeRef.current) return;
      flyModeRef.current = false;
      // RMB drag look can continue after WASD keys are released.
      if (!rmbLookHeldRef.current) {
        lookRef.current.active = false;
        lookRef.current.pointerId = null;
      }
      // Resume camera around the point currently in front of the camera.
      syncLookTarget();
      syncOrbitRightButton();
      controls.enabled = runtime.mode === 'edit' && !dragRef.current;
      controls.update();
    };

    const applySize = () => {
      // Layout CSS px (pre-transform). Pixel ratio is boosted by UI scale so the
      // WebGL buffer matches the on-screen size after EditorShell's CSS scale.
      const width = shell.clientWidth;
      const height = shell.clientHeight;
      const uiScale = viewScaleFactor(layout.uiScale);
      if (width > 0 && height > 0) {
        runtime.setSize(width, height, { uiScale });
        shellSizeRef.current = { width, height };
        setShellSize({ width, height });
        if (runtime.mode === 'play') {
          runtime.setViewportPanes(null);
          return;
        }
        const panes = buildViewportPanes(
          viewportPrefsRef.current,
          width,
          height,
          runtime.sceneView,
        );
        runtime.setViewportPanes(panes);
      }
    };
    applySize();
    const ro = new ResizeObserver(() => applySize());
    ro.observe(shell);
    const sizeRaf = requestAnimationFrame(applySize);

    const isTypingTarget = (el) => {
      if (!el || el === document.body || el === document.documentElement) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag !== 'INPUT') return false;
      // Number scrub fields should yield to WASD fly; text/search keep keyboard.
      const type = (el.type || 'text').toLowerCase();
      return type !== 'number' && type !== 'range';
    };

    const onFlyKeyDown = (e) => {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        ctrlOrbitHeldRef.current = true;
        ctrlOrbitTrack.primed = false;
        // Ctrl+move owns orbit — drop RMB freelook if it was active.
        if (rmbLookHeldRef.current) {
          rmbLookHeldRef.current = false;
          if (!flyModeRef.current) {
            lookRef.current.active = false;
            lookRef.current.pointerId = null;
          }
        }
        // Do not preventDefault — Ctrl+S / Ctrl+Z / multi-select must keep working.
        return;
      }

      const flyCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'];
      if (!flyCodes.includes(e.code)) return;

      // Text name fields keep typing; number fields blur so WASD can fly.
      if (isTypingTarget(e.target)) return;
      if (e.target?.tagName === 'INPUT' && e.target.type === 'number' && FLY_MOVE_KEYS.has(e.code)) {
        e.target.blur();
      }

      // Free-fly is perspective-only; orthographic panes keep RMB orbit + pan/zoom.
      if (isOrthographicMode(activeCameraMode())) return;

      // Important: handle e.repeat. After window blur clears flyKeys while WASD is
      // still held, browsers resume keydown repeats — ignoring them left fly dead
      // until the user released and pressed again.
      flyKeysRef.current.add(e.code);
      if (FLY_MOVE_KEYS.has(e.code)) {
        // Q/E are vertical only while already free-flying. Alone, E is Rotate (and Q
        // is unused as a tool) — do not start fly or the camera jumps on gizmo hotkeys.
        if ((e.code === 'KeyQ' || e.code === 'KeyE') && !flyModeRef.current) {
          flyKeysRef.current.delete(e.code);
          return;
        }
        e.preventDefault();
        if (runtime.mode === 'edit') enterFlyMode();
      }
    };
    const onFlyKeyUp = (e) => {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        ctrlOrbitHeldRef.current = false;
        ctrlOrbitTrack.primed = false;
      }
      flyKeysRef.current.delete(e.code);
      if (!isFlyMoving(flyKeysRef.current)) exitFlyMode();
    };
    const clearFlyInputState = () => {
      flyKeysRef.current.clear();
      ctrlOrbitHeldRef.current = false;
      ctrlOrbitTrack.primed = false;
      rmbLookHeldRef.current = false;
      exitFlyMode();
      lookRef.current.active = false;
      lookRef.current.pointerId = null;
      syncOrbitRightButton();
    };
    const onFlyBlur = () => {
      clearFlyInputState();
    };
    const onFlyVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) clearFlyInputState();
    };

    const LOOK_SENS_BASE = 0.009;
    const PITCH_LIMIT = Math.PI / 2 - 0.05;

    const beginFlyLook = (e) => {
      const look = lookRef.current;
      look.active = true;
      look.pointerId = e.pointerId;
      look.lastX = e.clientX;
      look.lastY = e.clientY;
      const cam = activeCam();
      lookEuler.setFromQuaternion(cam.quaternion, 'YXZ');
      look.yaw = lookEuler.y;
      look.pitch = lookEuler.x;
      look.distance = Math.max(0.5, cam.position.distanceTo(controls.target));
    };

    const onLookPointerDown = (e) => {
      // Clicking the viewport steals focus from Details number fields so WASD works.
      const ae = document.activeElement;
      if (ae?.tagName === 'INPUT' && ae.type === 'number') ae.blur();

      if (e.button !== 2 || runtime.mode !== 'edit') return;
      // Ctrl+move is orbit; don't treat as context / freelook start.
      if (ctrlOrbitHeldRef.current || e.ctrlKey || e.metaKey) return;

      rmbGestureRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };

      // Perspective only for freelook — ortho keeps OrbitControls RMB orbit.
      if (isOrthographicMode(activeCameraMode())) return;

      // Defer beginFlyLook until the pointer moves past a small threshold so a
      // short right-click can open the actor context menu instead.
      rmbLookHeldRef.current = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onLookPointerMove = (e) => {
      if (runtime.mode !== 'edit') return;

      // Perspective: hold Ctrl and move the mouse to orbit — no button required.
      if (
        ctrlOrbitHeldRef.current
        && !flyModeRef.current
        && !isOrthographicMode(activeCameraMode())
      ) {
        if (!ctrlOrbitTrack.primed) {
          ctrlOrbitTrack.lastX = e.clientX;
          ctrlOrbitTrack.lastY = e.clientY;
          ctrlOrbitTrack.primed = true;
          return;
        }
        const odx = e.clientX - ctrlOrbitTrack.lastX;
        const ody = e.clientY - ctrlOrbitTrack.lastY;
        ctrlOrbitTrack.lastX = e.clientX;
        ctrlOrbitTrack.lastY = e.clientY;
        if (odx !== 0 || ody !== 0) applyCtrlOrbit(odx, ody);
        return;
      }

      const gesture = rmbGestureRef.current;
      if (gesture && gesture.pointerId === e.pointerId && !gesture.moved) {
        const dist = Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y);
        if (dist >= 5) {
          gesture.moved = true;
          if (rmbLookHeldRef.current && !isOrthographicMode(activeCameraMode())) {
            beginFlyLook(e);
          }
        } else if (rmbLookHeldRef.current && !lookRef.current.active) {
          return;
        }
      }

      const looking = flyModeRef.current || rmbLookHeldRef.current;
      if (!looking) return;
      const look = lookRef.current;
      // WASD free-fly: mouse looks without a button. RMB drag: look while held.
      if (!look.active) {
        if (!gesture?.moved && rmbLookHeldRef.current) return;
        beginFlyLook(e);
      }
      if (look.pointerId != null && e.pointerId !== look.pointerId) return;
      const dx = e.clientX - look.lastX;
      const dy = e.clientY - look.lastY;
      look.lastX = e.clientX;
      look.lastY = e.clientY;
      if (dx === 0 && dy === 0) return;
      const prefs = editorSettingsRef.current;
      const lookSens = LOOK_SENS_BASE * (prefs?.cameraFlyLookSensitivity ?? 1);
      const ySign = prefs?.cameraInvertY ? -1 : 1;
      look.yaw -= dx * lookSens;
      look.pitch -= dy * lookSens * ySign;
      look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch));
      applyLookRotation();
    };
    const onLookPointerUp = (e) => {
      if (e.button != null && e.button !== 2) return;
      const gesture = rmbGestureRef.current;
      rmbGestureRef.current = null;

      if (rmbLookHeldRef.current) {
        rmbLookHeldRef.current = false;
        // Keep mouse look if still WASD flying; otherwise end the RMB look session.
        if (!flyModeRef.current) {
          lookRef.current.active = false;
          lookRef.current.pointerId = null;
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
      }

      // Short right-click (no meaningful drag) → context menu.
      if (gesture && !gesture.moved && runtime.mode === 'edit') {
        openViewportContextMenuRef.current(gesture.x, gesture.y);
      }
    };
    const onContextMenu = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', onFlyKeyDown);
    window.addEventListener('keyup', onFlyKeyUp);
    window.addEventListener('blur', onFlyBlur);
    document.addEventListener('visibilitychange', onFlyVisibility);
    canvas.addEventListener('pointerdown', onLookPointerDown);
    window.addEventListener('pointermove', onLookPointerMove);
    window.addEventListener('pointerup', onLookPointerUp);
    window.addEventListener('pointercancel', onLookPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    // ~4.5 m/s feel in editor units (100 eu = 1 m); Shift boosts. Speeds come from settings.

    let raf = 0;
    flyClockRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - flyClockRef.current) / 1000);
      flyClockRef.current = now;

      if (runtime.mode === 'edit' && orbitRef.current) {
        const keys = flyKeysRef.current;
        if (flyModeRef.current && isFlyMoving(keys)) {
          const cam = runtime.sceneView.camera;
          cam.getWorldDirection(forward);
          forward.normalize();
          right.crossVectors(forward, worldUp).normalize();
          if (right.lengthSq() < 1e-6) {
            right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
          }
          move.set(0, 0, 0);
          if (keys.has('KeyW')) move.add(forward);
          if (keys.has('KeyS')) move.sub(forward);
          if (keys.has('KeyD')) move.add(right);
          if (keys.has('KeyA')) move.sub(right);
          if (keys.has('KeyE')) move.add(worldUp);
          if (keys.has('KeyQ')) move.sub(worldUp);
          if (move.lengthSq() > 0) {
            const prefs = editorSettingsRef.current;
            const flySpeed = prefs?.cameraFlySpeed ?? 450;
            const flyBoost = prefs?.cameraFlyBoost ?? 2.75;
            const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? flyBoost : 1;
            move.normalize().multiplyScalar(flySpeed * boost * dt);
            const meters = move.multiplyScalar(0.01);
            cam.position.add(meters);
            syncLookTarget();
          }
        } else if (
          !flyModeRef.current
          && !rmbLookHeldRef.current
          && !lookRef.current.active
          && !ctrlOrbitHeldRef.current
        ) {
          // Keep OrbitControls in sync (damping is off — no post-drag coast).
          // Skip while Ctrl orbit / RMB / WASD freelook owns the camera.
          controls.update();
        }

        // Keep scissor panes + persisted poses in sync with live cameras (edit only).
        if (runtime.mode !== 'play') {
          const { width, height } = shellSizeRef.current;
          const panes = buildViewportPanes(
            viewportPrefsRef.current,
            width,
            height,
            runtime.sceneView,
          );
          runtime.setViewportPanes(panes);
          // ViewHelper axis clicks orbit around the same focus as OrbitControls.
          if (controls?.target) {
            runtime.sceneView.setViewHelperCenter?.(controls.target);
          }
        } else {
          runtime.setViewportPanes(null);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(sizeRaf);
      ro.disconnect();
      window.removeEventListener('keydown', onFlyKeyDown);
      window.removeEventListener('keyup', onFlyKeyUp);
      window.removeEventListener('blur', onFlyBlur);
      document.removeEventListener('visibilitychange', onFlyVisibility);
      canvas.removeEventListener('pointerdown', onLookPointerDown);
      window.removeEventListener('pointermove', onLookPointerMove);
      window.removeEventListener('pointerup', onLookPointerUp);
      window.removeEventListener('pointercancel', onLookPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      saveViewportPrefs(capturePanePoses(
        viewportPrefsRef.current,
        runtime.sceneView,
        controls.target,
      ));
      controls.dispose();
      runtime.dispose();
      orbitRef.current = null;
      flyKeysRef.current.clear();
      flyModeRef.current = false;
      lookRef.current.active = false;
    };
  }, [attachCanvas]);

  useEffect(() => {
    if (orbitRef.current) {
      // Keep orbit suspended while free-flying (WASD owns the camera).
      orbitRef.current.enabled = mode === 'edit' && !dragRef.current && !flyModeRef.current;
    }
  }, [mode]);

  // Re-apply drawing-buffer density when UI scale changes, and refresh Play
  // camera aspect when entering Play (shell size often does not resize).
  useEffect(() => {
    const runtime = runtimeRef.current;
    const shell = shellRef.current;
    if (!runtime || !shell) return;
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    if (width <= 0 || height <= 0) return;
    const uiScale = viewScaleFactor(layout.uiScale);
    runtime.setSize(width, height, { uiScale });
    shellSizeRef.current = { width, height };
    setShellSize({ width, height });
    if (mode === 'play') {
      runtime.setViewportPanes(null);
    }
  }, [layout.uiScale, mode, runtimeRef]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const pane = viewportPrefsRef.current.panes.find(
      (p) => p.id === viewportPrefsRef.current.activePaneId,
    ) || viewportPrefsRef.current.panes[0];
    configureOrbitForPane(controls, pane, editorSettings);
  }, [
    editorSettings.cameraOrbitSpeed,
    editorSettings.cameraOrbitZoomSpeed,
    editorSettings.cameraOrbitPanSpeed,
    viewportPrefs.activePaneId,
    viewportPrefs.panes,
  ]);

  useEffect(() => {
    applyEditorViewportLook(runtimeRef.current, editorSettings);
  }, [
    runtimeRef,
    editorSettings.viewportBackground,
    editorSettings.viewportGridMajor,
    editorSettings.viewportGridMinor,
    editorSettings.viewportSelection,
    editorSettings.viewportSubtract,
    editorSettings.showSubtractVolumes,
    editorSettings.subtractVolumeOpacity,
    editorSettings.showLightHelpers,
  ]);

  useEffect(() => {
    runtimeRef.current?.sceneView?.setPostProcessingPreview?.(
      viewportPrefs.postProcessingPreview !== false,
    );
  }, [runtimeRef, viewportPrefs.postProcessingPreview]);

  useEffect(() => {
    const onPreview = (e) => {
      const enabled = e?.detail?.enabled !== false;
      setViewportPrefs((prev) => ({ ...prev, postProcessingPreview: enabled }));
    };
    window.addEventListener('bb:post-processing-preview', onPreview);
    return () => window.removeEventListener('bb:post-processing-preview', onPreview);
  }, [setViewportPrefs]);

  useEffect(() => {
    runtimeRef.current?.setPlayLookOptions?.({
      sensitivityMul: editorSettings.playLookSensitivity,
      invertY: editorSettings.cameraInvertY,
    });
  }, [
    runtimeRef,
    editorSettings.playLookSensitivity,
    editorSettings.cameraInvertY,
  ]);

  useEffect(() => {
    runtimeRef.current?.sceneView?.setTransformMode?.(transformMode);
  }, [runtimeRef, transformMode]);

  useEffect(() => {
    runtimeRef.current?.sceneView?.setPivotEditMode?.(pivotEditMode);
  }, [runtimeRef, pivotEditMode]);

  useEffect(() => {
    runtimeRef.current?.sceneView?.setGizmoSpace?.(gizmoSpace);
  }, [runtimeRef, gizmoSpace]);

  useEffect(() => {
    runtimeRef.current?.sceneView?.setScaleHandleStyle?.(scaleHandleStyle);
  }, [runtimeRef, scaleHandleStyle]);

  const focusSelected = useCallback((paneId = null) => {
    const sceneView = runtimeRef.current?.sceneView;
    const controls = orbitRef.current;
    if (!sceneView || selectedActorIds.length === 0) return;

    flyModeRef.current = false;
    lookRef.current.active = false;
    lookRef.current.pointerId = null;

    const targetPaneId = paneId || viewportPrefsRef.current.activePaneId;
    const next = focusPaneOnSelection(
      sceneView,
      viewportPrefsRef.current,
      targetPaneId,
      selectedActorIds,
      controls,
    );
    setViewportPrefs(next);
    syncActivePaneCamera(sceneView, next, controls, {
      settings: editorSettingsRef.current,
    });

    syncLookFromCamera(lookRef, sceneView.camera, controls);
  }, [runtimeRef, selectedActorIds, setViewportPrefs]);

  /** Ctrl+1–9 stores the active pane camera on the level; plain 1–9 restores it. */
  const storeCameraBookmark = useCallback((slot) => {
    storeActivePaneCameraBookmark({
      sceneView: runtimeRef.current?.sceneView, controls: orbitRef.current,
      prefs: viewportPrefsRef.current, slot, world, executeCommand,
    });
  }, [runtimeRef, world, executeCommand]);

  const goToCameraBookmark = useCallback((slot) => {
    goToActivePaneCameraBookmark({
      sceneView: runtimeRef.current?.sceneView, controls: orbitRef.current,
      prefs: viewportPrefsRef.current, slot, world, lookRef, flyModeRef,
      editorSettings: editorSettingsRef.current, setViewportPrefs, setStatus,
    });
  }, [runtimeRef, world, setStatus, setViewportPrefs]);

  /** Snap pane camera back to its mode’s resting orientation + default zoom. */
  const resetCameraView = useCallback((paneId = null) => {
    resetViewportCameraView({
      sceneView: runtimeRef.current?.sceneView,
      controls: orbitRef.current,
      prefs: viewportPrefsRef.current,
      paneId,
      lookRef,
      flyModeRef,
      editorSettings: editorSettingsRef.current,
      setViewportPrefs,
    });
  }, [runtimeRef, setViewportPrefs]);

  /** Reset every viewport pane to its camera-mode home pose + default zoom. */
  const resetAllCameraViews = useCallback(() => {
    resetAllViewportCameraViews({
      sceneView: runtimeRef.current?.sceneView,
      controls: orbitRef.current,
      prefs: viewportPrefsRef.current,
      lookRef,
      flyModeRef,
      editorSettings: editorSettingsRef.current,
      setViewportPrefs,
    });
  }, [runtimeRef, setViewportPrefs]);

  useEffect(() => {
    const onFocusEvent = () => focusSelected();
    window.addEventListener('bb:focus-selection', onFocusEvent);
    return () => window.removeEventListener('bb:focus-selection', onFocusEvent);
  }, [focusSelected]);

  useEffect(() => {
    const onResetAllViews = () => resetAllCameraViews();
    window.addEventListener('bb:reset-all-views', onResetAllViews);
    return () => window.removeEventListener('bb:reset-all-views', onResetAllViews);
  }, [resetAllCameraViews]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && mode === 'play') {
        e.preventDefault();
        stop();
        return;
      }

      if (mode !== 'edit') return;

      // Ctrl+1–9 store / 1–9 recall (level-persisted). Blocks browser tab switches.
      const bookmarkSlot = cameraBookmarkSlotFromEvent(e);
      if (bookmarkSlot && !e.altKey && !e.shiftKey && !e.target?.isContentEditable) {
        e.preventDefault();
        if (!e.repeat) (e.ctrlKey || e.metaKey ? storeCameraBookmark : goToCameraBookmark)(bookmarkSlot);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (clipSession) {
          cancelClipSession?.();
        } else if (placeSessionRef.current) {
          clearPlacementSession();
        } else if (dragRef.current?.type === 'pivot') {
          runtimeRef.current?.sceneView?.gizmo?.endDrag?.();
          for (const s of dragRef.current.beforeStates || []) {
            restorePivotState(world, s.before);
            const actor = world.getActor(s.actorId);
            if (actor) runtimeRef.current?.sceneView?.updateActorTransform?.(actor);
            for (const row of s.before.children || []) {
              const child = world.getActor(row.actorId);
              if (child) runtimeRef.current?.sceneView?.updateActorTransform?.(child);
            }
          }
          dragRef.current = null;
          runtimeRef.current?.sceneView?.setSelection?.(selectedActorIds, world);
          setStatus('Pivot edit cancelled');
        } else if (dragRef.current?.type === 'faceMove') {
          runtimeRef.current?.sceneView?.gizmo?.endDrag?.();
          cancelFaceMove?.();
          dragRef.current = null;
        } else if (pivotEditMode) {
          setPivotEditMode(false);
          setStatus('Pivot edit off');
        } else if (tool === 'align') {
          setAlignReferenceSurface(null);
          setSelectedSurface(null);
          setTool('select');
        } else if (tool === 'surface') {
          setSelectedSurface(null);
          setTool('select');
        } else if (tool === 'geometry') {
          setGeometrySelection(null);
          setTool('select');
        } else {
          setSelectedSurface(null);
          deselectAllActors();
        }
        return;
      }
      if (e.key === 'Enter' && clipSession) {
        e.preventDefault();
        commitClipSession?.();
        return;
      }
      if (e.key === 'Tab' && placeSessionRef.current) {
        e.preventDefault();
        const session = placeSessionRef.current;
        session.candidateIndex = (session.candidateIndex || 0) + 1;
        if (session.lastNx != null) {
          const pose = resolveSurfacePose(
            session.lastNx,
            session.lastNy,
            session.payload,
            session.candidateIndex,
          );
          session.pose = pose;
          updatePlacementPreview(pose, session.payload);
        }
        return;
      }

      // W/E/R — transform · P — pivot · F — focus · G — game view · [ ] — grid · Shift+G — snap
      // R enters scale; pressing R again toggles face-resize ↔ Unreal axis gizmo.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'w') {
          setPivotEditMode(false);
          setTransformMode('move');
          setTool('select');
        } else if (k === 'e') {
          setPivotEditMode(false);
          setTransformMode('rotate');
          setTool('select');
        } else if (k === 'p') {
          e.preventDefault();
          setTool('select');
          const next = !pivotEditMode;
          setPivotEditMode(next);
          setStatus(next ? 'Pivot edit on — drag the gizmo' : 'Pivot edit off');
        } else if (k === 'r') {
          e.preventDefault();
          setPivotEditMode(false);
          setTool('select');
          const style = cycleScaleTransform();
          setStatus(
            style === 'gizmo'
              ? 'Scale: Unreal gizmo (R)'
              : 'Scale: face resize (R)',
          );
        } else if (k === 'f') {
          e.preventDefault();
          focusSelected();
        } else if (k === 'g' && e.shiftKey) {
          e.preventDefault();
          toggleGridSnap();
        } else if (k === 'g') {
          // Unreal-style Game View: hide light icons, grid, gizmos, editor overlays.
          e.preventDefault();
          if (mode === 'edit') {
            const on = runtimeRef.current?.sceneView?.toggleGameView?.();
            setStatus(on ? 'Game View on (G)' : 'Game View off (G)');
          }
        } else if (e.key === '[') {
          e.preventDefault();
          cycleGridSize(-1);
        } else if (e.key === ']') {
          e.preventDefault();
          cycleGridSize(1);
        } else if (e.code === 'Space' && !e.repeat) {
          // Toggle maximize active viewport pane (multi-view). Space = jump in Play.
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('bb:toggle-pane-maximize'));
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) saveAll();
        else saveLevel();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllActors();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    tool,
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    selectAllActors,
    deselectAllActors,
    cycleGridSize,
    toggleGridSnap,
    setTransformMode,
    cycleScaleTransform,
    setTool,
    setSelectedSurface,
    setAlignReferenceSurface,
    setGeometrySelection,
    cancelFaceMove,
    clipSession,
    cancelClipSession,
    commitClipSession,
    saveLevel,
    saveAll,
    stop,
    clearPlacementSession,
    resolveSurfacePose,
    updatePlacementPreview,
    focusSelected,
    setStatus,
    pivotEditMode,
    setPivotEditMode,
    world,
    selectedActorIds,
    storeCameraBookmark,
    goToCameraBookmark,
  ]);

  const pointerNorm = (e, { activate = true } = {}) => {
    const shell = shellRef.current;
    const shellRect = shell?.getBoundingClientRect?.() || canvasRef.current?.getBoundingClientRect();
    const { width, height } = shellSizeRef.current;
    const hit = resolvePointerInPanes(
      viewportPrefsRef.current,
      width,
      height,
      e.clientX,
      e.clientY,
      shellRect,
    );
    if (activate && hit.paneId && hit.paneId !== viewportPrefsRef.current.activePaneId) {
      const next = { ...viewportPrefsRef.current, activePaneId: hit.paneId };
      setViewportPrefs(next);
      syncActivePaneCamera(runtimeRef.current?.sceneView, next, orbitRef.current, {
        flying: flyModeRef.current,
        settings: editorSettingsRef.current,
      });
    }
    const sceneView = runtimeRef.current?.sceneView;
    const camera = sceneView?.getPaneCamera?.(hit.paneId) || sceneView?.camera;
    return {
      nx: hit.nx,
      ny: hit.ny,
      paneId: hit.paneId,
      paneRect: hit.rect,
      localX: hit.localX,
      localY: hit.localY,
      camera,
      rect: shellRect,
    };
  };

  const activePaneCameraMode = () => {
    const p = viewportPrefsRef.current;
    return p.panes.find((x) => x.id === p.activePaneId)?.cameraMode || 'perspective';
  };

  openViewportContextMenuRef.current = (clientX, clientY) => {
    if (mode !== 'edit' || !runtimeRef.current?.sceneView || !world) return;
    const fakeEvent = { clientX, clientY };
    const { nx, ny, camera } = pointerNorm(fakeEvent, { activate: true });
    const sceneView = runtimeRef.current.sceneView;
    const cam = camera || sceneView.camera;
    const hits = sceneView.pickWorldHits?.(nx, ny, cam) || [];
    const hitActorId = hits.find((h) => h?.actorId)?.actorId || null;
    const surfaceHit = sceneView.pickSurface?.(nx, ny, cam) || null;

    // Face pick / new hit force a single-actor selection. Menu enablement must
    // use that post-pick selection — selectedActorIds in this closure is still stale.
    let forcedSingleSelect = false;
    if (surfaceHit?.actorId && surfaceHit?.surfaceId) {
      // Always make the face's actor primary so brush UV writes hit the right mesh.
      selectActor(surfaceHit.actorId, { additive: false });
      setSelectedSurface({
        actorId: surfaceHit.actorId,
        surfaceId: surfaceHit.surfaceId,
      });
      forcedSingleSelect = true;
    } else if (hitActorId && !selectedActorIds.includes(hitActorId)) {
      selectActor(hitActorId, { additive: false });
      forcedSingleSelect = true;
    }

    const primaryId = surfaceHit?.actorId
      || hitActorId
      || selectedActorIds[selectedActorIds.length - 1]
      || null;
    const primary = primaryId ? world.getActor(primaryId) : null;
    const count = forcedSingleSelect
      ? 1
      : (hitActorId && selectedActorIds.includes(hitActorId)
        ? Math.max(1, selectedActorIds.length)
        : (primary ? 1 : 0));
    const hasSelection = Boolean(primary);

    const isPrefabInstance = Boolean(primary?.prefab?.instanceId);
    const faceTarget = surfaceHit?.actorId && surfaceHit?.surfaceId
      ? { actorId: surfaceHit.actorId, surfaceId: surfaceHit.surfaceId }
      : null;
    const resolveFaceMaterialUvScale = () => {
      const matId = getSelectedSurfaceMaterialId(faceTarget);
      const def = matId ? materialDefs?.[matId] : null;
      return def?.uvScale || { x: 1, y: 1 };
    };
    const runFaceFit = (axis, label) => {
      const ok = fitSelectedSurfaceUv({
        axis,
        materialUvScale: resolveFaceMaterialUvScale(),
        surfaceTarget: faceTarget,
      });
      setStatus(ok
        ? `Face ${faceTarget.surfaceId}: ${label}`
        : `${label} needs a box-brush or column face`);
    };

    const textureItems = faceTarget ? [
      { id: 'sep-tex', separator: true },
      {
        id: 'face-texture',
        label: `Face Texture (${faceTarget.surfaceId})`,
        submenu: [
          {
            id: 'tex-scale-1',
            label: 'Scale 1 × 1',
            onSelect: () => {
              assignSelectedSurfaceUv({ scale: { x: 1, y: 1 } }, faceTarget);
              setStatus(`Face ${faceTarget.surfaceId}: scale 1×1`);
            },
          },
          {
            id: 'tex-scale-2',
            label: 'Scale 2 × 2',
            onSelect: () => {
              assignSelectedSurfaceUv({ scale: { x: 2, y: 2 } }, faceTarget);
              setStatus(`Face ${faceTarget.surfaceId}: scale 2×2`);
            },
          },
          {
            id: 'tex-scale-half',
            label: 'Scale ½ × ½',
            onSelect: () => {
              assignSelectedSurfaceUv({ scale: { x: 0.5, y: 0.5 } }, faceTarget);
              setStatus(`Face ${faceTarget.surfaceId}: scale ½×½`);
            },
          },
          { id: 'tex-sep-fit', separator: true },
          {
            id: 'tex-fit-h',
            label: 'Fit Horizontal',
            // Keep clickable whenever we picked a face; report if measure fails.
            disabled: false,
            onSelect: () => runFaceFit('u', 'fit horizontal'),
          },
          {
            id: 'tex-fit-v',
            label: 'Fit Vertical',
            disabled: false,
            onSelect: () => runFaceFit('v', 'fit vertical'),
          },
          { id: 'tex-sep-reset', separator: true },
          {
            id: 'tex-reset',
            label: 'Reset UV',
            onSelect: () => {
              resetSelectedSurfaceUv(faceTarget);
              setStatus(`Face ${faceTarget.surfaceId}: UV reset`);
            },
          },
        ],
      },
    ] : [];

    openContextMenu({
      clientX,
      clientY,
      items: [
        {
          id: 'focus',
          label: 'Focus Selection',
          shortcut: 'F',
          disabled: !hasSelection,
          onSelect: () => {
            window.dispatchEvent(new CustomEvent('bb:focus-selection'));
          },
        },
        {
          id: 'rename',
          label: 'Rename',
          disabled: !hasSelection || count > 1,
          onSelect: async () => {
            if (!primary) return;
            const name = await prompt('Actor name', {
              title: 'Rename',
              initialValue: primary.name || primary.id,
            });
            if (!name || name === primary.name) return;
            renameSelected(name);
            setStatus(`Renamed to “${name}”`);
          },
        },
        {
          id: 'duplicate',
          label: count > 1 ? `Duplicate ${count} Actors` : 'Duplicate',
          shortcut: 'Ctrl+D',
          disabled: !hasSelection,
          onSelect: () => {
            duplicateSelected();
          },
        },
        {
          id: 'hide',
          label: primary?.visible === false ? 'Show' : 'Hide',
          disabled: !hasSelection,
          onSelect: () => {
            if (!primary) return;
            setSelectedActorFlags({ visible: primary.visible === false });
          },
        },
        {
          id: 'lock',
          label: primary?.locked ? 'Unlock' : 'Lock',
          disabled: !hasSelection,
          onSelect: () => {
            if (!primary) return;
            setSelectedActorFlags({ locked: !primary.locked });
          },
        },
        {
          id: 'unparent',
          label: 'Unparent',
          disabled: !hasSelection,
          onSelect: () => reparentSelected(null),
        },
        ...textureItems,
        { id: 'sep-create', separator: true },
        {
          id: 'create-cell',
          label: 'Create Cell',
          onSelect: () => createCell(),
        },
        {
          id: 'create-prefab',
          label: 'Create Prefab From Selection',
          disabled: !hasSelection,
          onSelect: async () => {
            const name = await prompt('Prefab name', {
              title: 'Create Prefab',
              initialValue: 'Prefab',
            });
            if (!name) return;
            await createPrefabFromSelection(name.trim());
          },
        },
        isPrefabInstance ? {
          id: 'unpack-prefab',
          label: 'Unpack Prefab',
          onSelect: () => unpackSelectedPrefab(),
        } : null,
        { id: 'sep-del', separator: true },
        {
          id: 'delete',
          label: count > 1 ? `Delete ${count} Actors` : 'Delete',
          shortcut: 'Del',
          danger: true,
          disabled: !hasSelection,
          onSelect: async () => {
            if (!hasSelection) return;
            const label = count > 1
              ? `Delete ${count} selected actors?`
              : `Delete “${primary?.name || primaryId}”?`;
            const ok = await confirm(label, {
              title: 'Delete',
              confirmLabel: 'Delete',
              tone: 'warning',
            });
            if (!ok) return;
            deleteSelected();
          },
        },
        { id: 'sep-sel', separator: true },
        {
          id: 'deselect',
          label: 'Deselect All',
          disabled: selectedActorIds.length === 0,
          onSelect: () => deselectAllActors(),
        },
      ],
    });
  };

  const onPointerDown = (e) => {
    // LMB / MMB / RMB all activate the pane under the cursor (overlays are
    // pointer-events:none, so this canvas handler owns multi-view focus).
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      pointerNorm(e, { activate: true });
    }

    if (mode !== 'edit' || !runtimeRef.current || !world) return;
    if (e.button !== 0) return;

    // Armed click-to-place from creation toolbar (lights, spawn, cell, assets).
    if (placeSessionRef.current?.armed) {
      void commitArmedPlacement(e);
      return;
    }

    const { nx, ny, camera, localX, localY, paneId, paneRect } = pointerNorm(e, { activate: false });
    const sceneView = runtimeRef.current.sceneView;
    const cam = camera || sceneView.camera;

    // Axis ViewHelper (perspective panes) — consume before scene picks.
    if (paneRect && cam && !cam.isOrthographicCamera) {
      const canvasH = shellSizeRef.current.height || 1;
      const scissor = {
        x: Math.round(paneRect.x || 0),
        y: Math.round(canvasH - (paneRect.y || 0) - (paneRect.height || 0)),
        width: Math.max(1, Math.round(paneRect.width || 0)),
        height: Math.max(1, Math.round(paneRect.height || 0)),
      };
      if (orbitRef.current?.target) {
        sceneView.setViewHelperCenter?.(orbitRef.current.target);
      }
      if (sceneView.handleViewHelperClick?.(e, paneId, cam, scissor)) {
        e.preventDefault();
        return;
      }
    }

    // Create tools: start footprint drag on construction plane
    if (tool === 'box' || tool === 'wall' || tool === 'floor' || tool === 'ceiling' || tool === 'ramp' || tool === 'stair' || tool === 'column' || tool === 'arch' || tool === 'archRoman' || tool === 'archGothic' || tool === 'curvedWall' || tool === 'subtract') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0, cam);
      if (!point) return;
      const g = gridSnap ? gridSize : 1;
      const snapped = {
        x: gridSnap ? snapToGrid(point.x, g) : point.x,
        y: 0,
        z: gridSnap ? snapToGrid(point.z, g) : point.z,
      };
      dragRef.current = {
        type: 'create',
        kind: tool,
        start: snapped,
        current: snapped,
      };
      if (orbitRef.current) orbitRef.current.enabled = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateCreatePreview(dragRef.current);
      return;
    }

    // Clip session: pick grid-snapped world points on brush surfaces.
    if (clipSession && tool === 'geometry') {
      const hits = sceneView.pickWorldHits?.(nx, ny, cam) || [];
      const hit = hits.find((h) => h.point && (
        world.getActor(h.actorId)?.getComponent('ConvexBrush')
        || world.getActor(h.actorId)?.getComponent('Brush')
      )) || hits.find((h) => h.point);
      if (hit?.point) {
        addClipPoint([hit.point.x, hit.point.y, hit.point.z]);
      }
      return;
    }

    // Geometry Face / Edge / Vertex mode — gizmo moves elements; click picks.
    if (
      tool === 'geometry'
      && (geometryMode === 'face' || geometryMode === 'edge' || geometryMode === 'vertex')
    ) {
      /**
       * If the click hit a parametric Brush, convert it then re-pick.
       * Select alone does not convert — only an edit-mode pick does.
       * @returns {'converted'|'blocked'|'none'}
       */
      const tryConvertBrushUnderCursor = () => {
        const surfaceHit = sceneView.pickSurface?.(nx, ny, cam);
        if (!surfaceHit || surfaceHit.componentType === 'ConvexBrush') return 'none';
        if (surfaceHit.componentType !== 'Brush') {
          setStatus(
            `Cannot edit ${surfaceHit.componentType} with Face/Edge/Vertex — only Brush → ConvexBrush.`,
          );
          return 'blocked';
        }
        const result = convertActorToConvexBrush?.(surfaceHit.actorId, { notifyOnFail: true });
        if (!result?.ok) {
          setStatus(result?.message || 'Could not convert brush for geometry edit.');
          return 'blocked';
        }
        selectActor(surfaceHit.actorId, { additive: false });
        return 'converted';
      };

      const gizmoHit = sceneView.pickGizmo(nx, ny, cam);
      if (gizmoHit && geometrySelection?.items?.length && gizmoHit.kind === 'move') {
        const axisOk = filterGizmoAxisForOrtho(activePaneCameraMode(), gizmoHit.axis);
        if (!axisOk && gizmoHit.axis !== 'normal') {
          setStatus('Axis locked in orthographic view');
          return;
        }
        const raycaster = sceneView.getRaycaster(nx, ny, cam);
        sceneView.gizmo.beginDrag(gizmoHit, raycaster.ray);
        if (!beginFaceMoveDrag()) return;
        dragRef.current = {
          type: 'faceMove',
          axis: gizmoHit.axis,
          dir: gizmoHit.dir || null,
          hintLocal: null,
        };
        if (orbitRef.current) orbitRef.current.enabled = false;
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (geometryMode === 'edge') {
        let edgeHit = sceneView.pickGeometryEdge?.(nx, ny, cam, {
          xray: e.altKey,
        });
        if (!edgeHit) {
          const prep = tryConvertBrushUnderCursor();
          if (prep === 'blocked') return;
          if (prep === 'converted') {
            edgeHit = sceneView.pickGeometryEdge?.(nx, ny, cam, { xray: e.altKey });
          }
        }
        if (edgeHit) {
          const next = toggleGeometryItem(geometrySelection, {
            actorId: edgeHit.actorId,
            id: edgeHit.edgeKey,
            mode: 'edge',
            additive: e.shiftKey || e.ctrlKey || e.metaKey,
          });
          setGeometrySelection(next);
          setStatus(
            next.items.length
              ? `Edge ${edgeHit.edgeKey} (${next.items.reduce((n, it) => n + it.ids.length, 0)} selected)`
              : 'Edge selection cleared',
          );
        } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
          // Empty click — start marquee
          dragRef.current = {
            type: 'marquee',
            mode: 'edge',
            startNdc: { x: nx, y: ny },
            startLocal: { x: localX, y: localY },
            additive: e.shiftKey || e.ctrlKey || e.metaKey,
            camera: cam,
          };
          if (orbitRef.current) orbitRef.current.enabled = false;
          e.currentTarget.setPointerCapture(e.pointerId);
          setStatus('Edge mode — drag marquee or click near an edge (Alt = x-ray)');
        }
        return;
      }
      if (geometryMode === 'vertex') {
        let vertHit = sceneView.pickGeometryVertex?.(nx, ny, cam, {
          xray: e.altKey,
        });
        if (!vertHit) {
          const prep = tryConvertBrushUnderCursor();
          if (prep === 'blocked') return;
          if (prep === 'converted') {
            vertHit = sceneView.pickGeometryVertex?.(nx, ny, cam, { xray: e.altKey });
          }
        }
        if (vertHit) {
          const next = toggleGeometryItem(geometrySelection, {
            actorId: vertHit.actorId,
            id: vertHit.vertexId,
            mode: 'vertex',
            additive: e.shiftKey || e.ctrlKey || e.metaKey,
          });
          setGeometrySelection(next);
          setStatus(
            next.items.length
              ? `Vertex ${vertHit.vertexId} (${next.items.reduce((n, it) => n + it.ids.length, 0)} selected) · Move only`
              : 'Vertex selection cleared',
          );
        } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
          dragRef.current = {
            type: 'marquee',
            mode: 'vertex',
            startNdc: { x: nx, y: ny },
            startLocal: { x: localX, y: localY },
            additive: e.shiftKey || e.ctrlKey || e.metaKey,
            camera: cam,
          };
          if (orbitRef.current) orbitRef.current.enabled = false;
          e.currentTarget.setPointerCapture(e.pointerId);
          setStatus('Vertex mode — drag marquee or click near a vertex · Move only');
        }
        return;
      }
      let faceHit = sceneView.pickGeometryFace?.(nx, ny, cam);
      let didConvert = false;
      if (!faceHit) {
        const prep = tryConvertBrushUnderCursor();
        if (prep === 'blocked') return;
        if (prep === 'converted') {
          didConvert = true;
          faceHit = sceneView.pickGeometryFace?.(nx, ny, cam);
        }
      }
      if (faceHit) {
        const next = toggleGeometryItem(geometrySelection, {
          actorId: faceHit.actorId,
          id: faceHit.faceId,
          mode: 'face',
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
        });
        setGeometrySelection(next);
        const count = next.items.reduce((n, it) => n + it.ids.length, 0);
        setStatus(
          next.items.length
            ? `${didConvert ? 'Converted · ' : ''}Face ${faceHit.faceId} (${count} selected)`
            : 'Face selection cleared',
        );
      } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
        dragRef.current = {
          type: 'marquee',
          mode: 'face',
          startNdc: { x: nx, y: ny },
          startLocal: { x: localX, y: localY },
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
          camera: cam,
        };
        if (orbitRef.current) orbitRef.current.enabled = false;
        e.currentTarget.setPointerCapture(e.pointerId);
        setStatus('Face mode — drag marquee or click a face');
      }
      return;
    }

    // Gizmo first
    let gizmoHit = sceneView.pickGizmo(nx, ny, cam);
    if (gizmoHit && selectedActorIds.length > 0) {
      const axisOk = filterGizmoAxisForOrtho(activePaneCameraMode(), gizmoHit.axis);
      if (!axisOk) {
        gizmoHit = null;
      }
    }
    if (gizmoHit && selectedActorIds.length > 0) {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      sceneView.gizmo.beginDrag(gizmoHit, raycaster.ray);

      // Unreal-style Alt+drag on move/rotate/scale: duplicate, then transform the copies.
      const altDuplicateKind = gizmoHit.kind === 'move'
        || gizmoHit.kind === 'rotate'
        || gizmoHit.kind === 'scale';
      let transformIds = selectedActorIds;
      if (altDuplicateKind && e.altKey) {
        const copyIds = duplicateSelected({
          offset: { x: 0, y: 0, z: 0 },
          label: 'Duplicate (Alt-drag)',
        }) || [];
        if (!copyIds.length) {
          sceneView.gizmo.endDrag?.();
          return;
        }
        transformIds = copyIds;
        setStatus(`Duplicated ${copyIds.length} · dragging copies`);
      }

      if (gizmoHit.kind === 'move') {
        if (pivotEditMode) {
          const beforeStates = transformIds.map((id) => {
            const actor = world.getActor(id);
            if (!actor || !actorSupportsPivotEdit(actor)) return null;
            const entry = runtimeRef.current?.sceneView?._actorMeshes?.get(id);
            let startPos;
            if (entry?.group) {
              const p = new THREE.Vector3();
              entry.group.getWorldPosition(p);
              startPos = { x: p.x * 100, y: p.y * 100, z: p.z * 100 };
            } else {
              startPos = { ...actor.transform.position };
            }
            return {
              actorId: id,
              before: snapshotPivotState(actor, world),
              startPos,
            };
          }).filter(Boolean);
          if (!beforeStates.length) {
            sceneView.gizmo.endDrag?.();
            setStatus('Pivot edit: select a mesh, primitive, or brush');
            return;
          }
          dragRef.current = {
            type: 'pivot',
            axis: gizmoHit.axis,
            beforeStates,
          };
        } else {
          const beforeStates = transformIds.map((id) => {
            const actor = world.getActor(id);
            if (!actor) return null;
            const worldPos = runtimeRef.current
              ? // use hierarchy helper via editor — fall back to local if missing
                (actor.parentId
                  ? null
                  : { ...actor.transform.position })
              : { ...actor.transform.position };
            // Capture world start via Details helper: compute from runtime scene group
            const entry = runtimeRef.current?.sceneView?._actorMeshes?.get(id);
            let startPos;
            if (entry?.group) {
              const p = new THREE.Vector3();
              entry.group.getWorldPosition(p);
              startPos = { x: p.x * 100, y: p.y * 100, z: p.z * 100 };
            } else {
              startPos = worldPos || { ...actor.transform.position };
            }
            // Brushes: edge snap via AABB size. Props: pivot snap (size null).
            const snapSize = getBrushSnapSize(actor);
            return {
              actorId: id,
              before: actor.transform.toJSON(),
              startPos,
              snapSize,
            };
          }).filter(Boolean);

          if (!beforeStates.length) {
            sceneView.gizmo.endDrag?.();
            return;
          }

          dragRef.current = {
            type: 'move',
            axis: gizmoHit.axis,
            beforeStates,
            duplicated: Boolean(e.altKey),
          };
        }
      } else if (gizmoHit.kind === 'resize') {
        const actorId = selectedActorIds[selectedActorIds.length - 1];
        const actor = world.getActor(actorId);
        const brush = actor?.getComponent('Brush');
        if (!actor || !brush) return;
        const entry = runtimeRef.current?.sceneView?._actorMeshes?.get(actorId);
        let worldPos = { ...actor.transform.position };
        if (entry?.group) {
          const p = new THREE.Vector3();
          entry.group.getWorldPosition(p);
          worldPos = { x: p.x * 100, y: p.y * 100, z: p.z * 100 };
        }
        dragRef.current = {
          type: 'resize',
          actorId,
          axis: gizmoHit.axis,
          sign: gizmoHit.sign,
          beforeLocal: {
            size: { ...brush.size },
            transform: actor.transform.toJSON(),
          },
          before: {
            size: { ...brush.size },
            position: worldPos,
          },
        };
      } else if (gizmoHit.kind === 'rotate') {
        const beforeStates = transformIds.map((id) => {
          const actor = world.getActor(id);
          if (!actor) return null;
          return {
            actorId: id,
            before: actor.transform.toJSON(),
            startRot: { ...actor.transform.rotation },
          };
        }).filter(Boolean);
        if (!beforeStates.length) {
          sceneView.gizmo.endDrag?.();
          return;
        }
        dragRef.current = {
          type: 'rotate',
          axis: gizmoHit.axis,
          beforeStates,
          duplicated: Boolean(e.altKey),
        };
      } else if (gizmoHit.kind === 'scale') {
        const beforeStates = transformIds.map((id) => {
          const actor = world.getActor(id);
          if (!actor) return null;
          return {
            actorId: id,
            before: actor.transform.toJSON(),
            startScale: { ...actor.transform.scale },
          };
        }).filter(Boolean);
        if (!beforeStates.length) {
          sceneView.gizmo.endDrag?.();
          return;
        }
        dragRef.current = {
          type: 'scale',
          axis: gizmoHit.axis,
          beforeStates,
          duplicated: Boolean(e.altKey),
        };
      }

      if (orbitRef.current) orbitRef.current.enabled = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Surface Selection mode — pick semantic surfaces without replacing actor select tool.
    if (tool === 'surface') {
      const hit = sceneView.pickSurface?.(nx, ny, cam);
      if (hit) {
        selectActor(hit.actorId, { additive: false });
        setSelectedSurface({ actorId: hit.actorId, surfaceId: hit.surfaceId });
        setStatus(`Surface ${hit.surfaceId} on ${hit.componentType}`);
      } else {
        setSelectedSurface(null);
        selectActor(null);
      }
      return;
    }

    // Align to Neighbor — first click reference, second click target.
    if (tool === 'align') {
      const hit = sceneView.pickSurface?.(nx, ny, cam);
      if (!hit) {
        setStatus('Align: click a surface (Esc cancels).');
        return;
      }
      const picked = { actorId: hit.actorId, surfaceId: hit.surfaceId };
      selectActor(hit.actorId, { additive: false });
      setSelectedSurface(picked);
      if (!alignReferenceSurface) {
        setAlignReferenceSurface(picked);
        setStatus(`Align reference: ${hit.surfaceId} — click target surface.`);
        return;
      }
      const result = alignSurfaceToReference(picked);
      if (!result.ok) {
        setStatus(result.reason || 'Align failed.');
      }
      return;
    }

    // Actor pick / multi-select — empty space starts marquee.
    setSelectedSurface(null);
    const actorId = sceneView.pickActorId(nx, ny, cam);
    if (actorId) {
      selectActor(actorId, { additive: e.ctrlKey || e.metaKey });
      return;
    }
    dragRef.current = {
      type: 'marquee',
      mode: 'actor',
      startNdc: { x: nx, y: ny },
      startLocal: { x: localX, y: localY },
      additive: e.ctrlKey || e.metaKey || e.shiftKey,
      camera: cam,
    };
    if (orbitRef.current) orbitRef.current.enabled = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const updateCreatePreview = (drag) => {
    if (!runtimeRef.current || !drag) return;
    // Match createBrushAtBounds / factory inputs so the ghost equals the placed object.
    const min = {
      x: Math.min(drag.start.x, drag.current.x),
      y: 0,
      z: Math.min(drag.start.z, drag.current.z),
    };
    const max = {
      x: Math.max(drag.start.x, drag.current.x),
      y: drag.kind === 'box' || drag.kind === 'subtract'
        ? gridSize
        : drag.kind === 'ceiling'
          ? WALL_MODULE_SIZE
          : 0,
      z: Math.max(drag.start.z, drag.current.z),
    };
    if (max.x === min.x) max.x = min.x + gridSize;
    if (max.z === min.z) max.z = min.z + gridSize;
    runtimeRef.current.sceneView.setCreatePreview({
      min,
      max,
      kind: drag.kind,
      gridSize,
      operation: drag.kind === 'subtract' ? 'subtract' : 'add',
    });
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !runtimeRef.current || !world) return;
    const { nx, ny, localX, localY, camera } = pointerNorm(e, { activate: false });
    const sceneView = runtimeRef.current.sceneView;
    const cam = drag.camera || camera || sceneView.camera;

    if (drag.type === 'marquee') {
      setMarqueeScreen({
        x0: drag.startLocal.x,
        y0: drag.startLocal.y,
        x1: localX,
        y1: localY,
      });
      drag.currentNdc = { x: nx, y: ny };
      return;
    }

    if (drag.type === 'create') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0, cam);
      if (!point) return;
      const g = gridSnap ? gridSize : 1;
      drag.current = {
        x: gridSnap ? snapToGrid(point.x, g) : point.x,
        y: 0,
        z: gridSnap ? snapToGrid(point.z, g) : point.z,
      };
      updateCreatePreview(drag);
      return;
    }

    if (drag.type === 'pivot') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      const altFine = e.altKey;
      const freeMove = !gridSnap && !altFine;
      const snapStep = altFine ? 1 : gridSize;
      let scalar = sample.deltaEditor;
      if (!freeMove) {
        scalar = Math.round(scalar / snapStep) * snapStep;
      }
      const dir = sample.dir
        ? { x: sample.dir[0], y: sample.dir[1], z: sample.dir[2] }
        : {
          x: drag.axis === 'x' ? 1 : 0,
          y: drag.axis === 'y' ? 1 : 0,
          z: drag.axis === 'z' ? 1 : 0,
        };
      for (const s of drag.beforeStates) {
        restorePivotState(world, s.before);
        const target = {
          x: s.startPos.x + dir.x * scalar,
          y: s.startPos.y + dir.y * scalar,
          z: s.startPos.z + dir.z * scalar,
        };
        const actor = world.getActor(s.actorId);
        if (!actor) continue;
        applyActorWorldPivotPosition(actor, target, world);
        runtimeRef.current?.sceneView?.updateActorTransform?.(actor);
        for (const row of s.before.children || []) {
          const child = world.getActor(row.actorId);
          if (child) runtimeRef.current?.sceneView?.updateActorTransform?.(child);
        }
      }
      runtimeRef.current?.sceneView?.setSelection?.(selectedActorIds, world);
      return;
    }

    if (drag.type === 'move') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      // Alt fine-snap only when not Alt-duplicating — duplicates stay on the construction grid.
      const altFine = e.altKey && !drag.duplicated;
      // Snap off = freeform. Alt = temporary 1-unit snap. Otherwise construction grid.
      const freeMove = !gridSnap && !altFine && !drag.duplicated;
      const snapStep = altFine ? 1 : gridSize;
      const delta = sample.deltaEditor;
      const dir = sample.dir
        ? { x: sample.dir[0], y: sample.dir[1], z: sample.dir[2] }
        : null;
      const updates = drag.beforeStates.map((s) => {
        const position = { ...s.startPos };
        if (dir && gizmoSpace === 'local') {
          let scalar = delta;
          if (!freeMove) scalar = Math.round(scalar / snapStep) * snapStep;
          position.x = s.startPos.x + dir.x * scalar;
          position.y = s.startPos.y + dir.y * scalar;
          position.z = s.startPos.z + dir.z * scalar;
        } else {
          const sizeAlong = s.snapSize?.[drag.axis] ?? null;
          if (freeMove) {
            position[drag.axis] = s.startPos[drag.axis] + delta;
          } else {
            position[drag.axis] = snapMovedAxis({
              startValue: s.startPos[drag.axis],
              delta,
              gridSize: snapStep,
              sizeAlongAxis: sizeAlong,
            });
          }
        }
        return { actorId: s.actorId, position };
      });
      previewActorPositions(updates);
      return;
    }

    if (drag.type === 'rotate') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample || sample.deltaDegrees == null) return;
      const raw = sample.deltaDegrees;
      const rotStep = editorSettingsRef.current?.rotationSnapDegrees ?? 5;
      // Alt free-rotate only when not Alt-duplicating — duplicates use rotation snap.
      const altFree = e.altKey && !drag.duplicated;
      const useRotSnap = (gridSnap || drag.duplicated) && !altFree;
      const snapDeg = useRotSnap
        ? Math.round(raw / rotStep) * rotStep
        : raw;
      const updates = drag.beforeStates.map((s) => {
        const rotation = { ...s.startRot };
        rotation[drag.axis] = s.startRot[drag.axis] + snapDeg;
        return { actorId: s.actorId, rotation };
      });
      previewActorLocalTransforms(updates);
      return;
    }

    if (drag.type === 'scale') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample || sample.deltaEditor == null) return;
      // 100 editor units of drag ≈ +1.0 scale on that axis (or all axes for xyz).
      const factor = sample.deltaEditor / 100;
      const scaleStep = editorSettingsRef.current?.scaleSnapIncrement ?? 0.1;
      const altFree = e.altKey && !drag.duplicated;
      const useScaleSnap = (gridSnap || drag.duplicated) && !altFree && scaleStep > 0;
      const uniform = drag.axis === 'xyz';
      const axes = uniform ? ['x', 'y', 'z'] : [drag.axis];
      const updates = drag.beforeStates.map((s) => {
        const scale = { ...s.startScale };
        for (const axis of axes) {
          let next = s.startScale[axis] + factor;
          if (useScaleSnap) {
            next = Math.round(next / scaleStep) * scaleStep;
          }
          scale[axis] = Math.max(0.01, next);
        }
        return { actorId: s.actorId, scale };
      });
      previewActorLocalTransforms(updates);
      return;
    }

    if (drag.type === 'faceMove') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample || sample.deltaEditor == null) return;
      const constraint = sample.axis === 'normal' ? 'normal' : sample.axis;
      const worldDir = sample.dir || drag.dir || null;
      const result = previewFaceMove(constraint, sample.deltaEditor, {
        worldDir,
        gridSize,
        snapEnabled: e.altKey ? false : gridSnap,
        hintLocal: drag.hintLocal,
      });
      if (!result.ok && result.code && result.code !== 'NO_CHANGE') {
        setStatus(result.message || `Invalid: ${result.code}`);
      }
      return;
    }

    if (drag.type === 'resize') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      const snap = e.altKey || !gridSnap ? 1 : gridSize;
      const result = resizeBrushFace({
        position: drag.before.position,
        size: drag.before.size,
        axis: drag.axis,
        sign: drag.sign,
        delta: sample.deltaEditor,
        gridSize: snap,
      });
      previewBrushGeometry(drag.actorId, result.size, result.position);
    }
  };

  const onActivateCreationTool = (toolDef) => {
    if (!toolDef || mode !== 'edit') return;
    if (toolDef.action === 'mode' && toolDef.tool) {
      setTool(toolDef.tool);
      return;
    }
    // Click-to-arm place tools: next left-click commits at surface under cursor.
    placeSessionRef.current = {
      payload: toolDef,
      armed: true,
      candidateIndex: 0,
    };
  };

  const commitArmedPlacement = async (e) => {
    const session = placeSessionRef.current;
    if (!session?.armed || !runtimeRef.current) return false;
    const { nx, ny, camera } = pointerNorm(e);
    const pose = resolveSurfacePose(
      nx,
      ny,
      session.payload,
      session.candidateIndex || 0,
      camera,
    );
    clearPlacementSession();
    if (!pose.valid) return true;
    await commitCreatePlacement(session.payload, pose, {
      createBrushAtBounds,
      placeLight,
      placeEnvironment,
      placePrimitiveMesh,
      placePlayerSpawn,
      createCell,
      placeMeshAsset,
      placePrefabAsset,
      gridSize,
      gridSnap,
    });
    setTool('select');
    return true;
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (drag.type === 'marquee') {
      const { nx, ny, camera } = pointerNorm(e, { activate: false });
      const endNdc = drag.currentNdc || { x: nx, y: ny };
      const marquee = normalizeMarqueeNdc(drag.startNdc, endNdc);
      const cam = drag.camera || camera || runtimeRef.current?.sceneView?.camera;
      const sceneView = runtimeRef.current?.sceneView;
      setMarqueeScreen(null);
      const tiny = !marquee
        || (Math.abs(marquee.maxX - marquee.minX) < 0.01
          && Math.abs(marquee.maxY - marquee.minY) < 0.01);
      if (!tiny && sceneView && cam) {
        if (drag.mode === 'actor') {
          const ids = marqueeSelectActors(sceneView._actorMeshes, cam, marquee, {
            isSelectable: (_id, entry) => {
              const actor = entry?.actor;
              if (!actor) return true;
              if (sceneView._isActorEditorLocked?.(actor, actor.world)) return false;
              return sceneView._isActorEditorVisible?.(actor, actor.world) !== false;
            },
          });
          if (drag.additive && selectedActorIds.length) {
            const set = new Set(selectedActorIds);
            for (const id of ids) set.add(id);
            // select each newly added
            for (const id of ids) selectActor(id, { additive: true });
            if (!ids.length && !drag.additive) selectActor(null);
          } else if (ids.length) {
            selectActor(null);
            for (let i = 0; i < ids.length; i += 1) {
              selectActor(ids[i], { additive: i > 0 });
            }
            setStatus(`Marquee selected ${ids.length} actor(s)`);
          } else {
            selectActor(null);
          }
        } else {
          const hits = marqueeSelectGeometry(drag.mode, sceneView, world, cam, marquee);
          let next = drag.additive ? geometrySelection : null;
          for (const hit of hits) {
            next = toggleGeometryItem(next, {
              actorId: hit.actorId,
              id: hit.id,
              mode: drag.mode,
              additive: true,
            });
          }
          setGeometrySelection(next);
          setStatus(
            hits.length
              ? `Marquee selected ${hits.length} ${drag.mode}(s)`
              : `${drag.mode} marquee — nothing hit`,
          );
        }
      } else if (drag.mode === 'actor' && !drag.additive) {
        selectActor(null);
      } else if (drag.mode !== 'actor' && !drag.additive) {
        setGeometrySelection(null);
      }
      dragRef.current = null;
      if (orbitRef.current && mode === 'edit') orbitRef.current.enabled = true;
      return;
    }

    if (drag.type === 'create') {
      runtimeRef.current?.sceneView.setCreatePreview(null);
      createBrushAtBounds(drag.kind, drag.start, {
        x: drag.current.x,
        y: drag.kind === 'box' || drag.kind === 'subtract'
          ? gridSize
          : drag.kind === 'ceiling'
            ? WALL_MODULE_SIZE
            : drag.current.y,
        z: drag.current.z,
      });
    } else if (drag.type === 'pivot') {
      runtimeRef.current?.sceneView.gizmo.endDrag();
      const changes = drag.beforeStates.map((s) => {
        const actor = world.getActor(s.actorId);
        return {
          before: s.before,
          after: actor ? snapshotPivotState(actor, world) : s.before,
        };
      });
      commitPivotChanges(changes, 'Edit pivot');
    } else if (drag.type === 'move' || drag.type === 'rotate' || drag.type === 'scale') {
      runtimeRef.current?.sceneView.gizmo.endDrag();
      const label = drag.type === 'move' ? 'Move' : drag.type === 'rotate' ? 'Rotate' : 'Scale';
      const changes = drag.beforeStates.map((s) => {
        const actor = world.getActor(s.actorId);
        return {
          actorId: s.actorId,
          before: s.before,
          after: actor ? actor.transform.toJSON() : s.before,
        };
      });
      commitTransforms(changes, label);
    } else if (drag.type === 'resize') {
      runtimeRef.current?.sceneView.gizmo.endDrag();
      const actor = world.getActor(drag.actorId);
      const brush = actor?.getComponent('Brush');
      if (actor && brush) {
        // Store local transform for undo (SetBrushGeometry uses position field).
        commitBrushGeometry([{
          actorId: drag.actorId,
          before: {
            size: drag.beforeLocal.size,
            position: drag.beforeLocal.transform.position,
          },
          after: {
            size: { ...brush.size },
            position: { ...actor.transform.position },
          },
        }], 'Resize');
      }
    } else if (drag.type === 'faceMove') {
      runtimeRef.current?.sceneView.gizmo.endDrag();
      const label = geometryMode === 'edge'
        ? 'Move edges'
        : geometryMode === 'vertex'
          ? 'Move vertices'
          : 'Move faces';
      const result = commitFaceMove(label);
      if (result?.ok) {
        setStatus(
          geometryMode === 'edge'
            ? 'Moved edges'
            : geometryMode === 'vertex'
              ? 'Moved vertices'
              : 'Moved faces',
        );
      }
    }

    dragRef.current = null;
    if (orbitRef.current && mode === 'edit') {
      orbitRef.current.enabled = true;
    }
  };

  const onCanvasDragOver = (e) => {
    if (mode !== 'edit') return;
    const types = [...e.dataTransfer.types];
    const isCreate = types.includes(CREATE_DRAG_MIME);
    const isMaterial = types.includes(ASSET_DRAG_MIME_MATERIAL);
    const isAsset = types.includes(dragMime) || types.includes('text/plain');
    if (!isCreate && !isAsset && !isMaterial) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const { nx, ny, camera } = pointerNorm(e, { activate: false });
    let payload = placeSessionRef.current?.payload || null;
    if (isCreate && !payload) {
      // Browser may not expose data until drop; use a generic upright preview.
      payload = { placement: 'upright', placeKind: 'prop' };
    }
    if ((isAsset || isMaterial) && !isCreate) {
      // Materials paint onto a picked face — no mesh placement ghost.
      // Kind MIME is readable during dragover; getData(payload) is often empty.
      if (isMaterial) {
        clearPlacementSession();
        return;
      }
      let kind = null;
      try {
        const raw = e.dataTransfer.getData(dragMime) || '';
        if (raw) kind = JSON.parse(raw)?.kind || JSON.parse(raw)?.type;
      } catch {
        kind = null;
      }
      if (kind === 'material') {
        clearPlacementSession();
        return;
      }
      payload = { placement: 'upright', action: 'asset' };
    }
    const pose = resolveSurfacePose(
      nx,
      ny,
      payload,
      placeSessionRef.current?.candidateIndex || 0,
      camera,
    );
    placeSessionRef.current = {
      ...(placeSessionRef.current || {}),
      payload: placeSessionRef.current?.payload || payload,
      lastNx: nx,
      lastNy: ny,
      pose,
      dragging: true,
      candidateIndex: placeSessionRef.current?.candidateIndex || 0,
    };
    updatePlacementPreview(pose, payload);
  };

  const onCanvasDrop = async (e) => {
    if (mode !== 'edit' || !runtimeRef.current) return;
    e.preventDefault();
    const { nx, ny, camera } = pointerNorm(e);

    // Creation toolbar drag (custom MIME, text/plain backup, or live session).
    const createRaw = e.dataTransfer.getData(CREATE_DRAG_MIME)
      || e.dataTransfer.getData('text/plain')
      || '';
    let createPayload = parseCreateDragPayload(createRaw);
    if (
      !createPayload
      && placeSessionRef.current?.dragging
      && placeSessionRef.current?.payload?.toolId
    ) {
      createPayload = placeSessionRef.current.payload;
    }
    const isCreateDrop = Boolean(
      createPayload
      && (createPayload.action === 'mode'
        || createPayload.placeKind
        || createPayload.action === 'asset'
        || createPayload.assetId),
    );
    if (isCreateDrop) {
      const pose = resolveSurfacePose(
        nx,
        ny,
        createPayload,
        placeSessionRef.current?.candidateIndex || 0,
        camera,
      );
      clearPlacementSession();
      if (!pose.valid) return;
      await commitCreatePlacement(createPayload, pose, {
        createBrushAtBounds,
        placeLight,
        placeEnvironment,
        placePrimitiveMesh,
        placePlayerSpawn,
        createCell,
        placeMeshAsset,
        placePrefabAsset,
        gridSize,
        gridSnap,
      });
      if (createPayload.action === 'mode') setTool('select');
      return;
    }

    // Content Browser asset drag
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData(dragMime) || 'null');
    } catch {
      payload = null;
    }
    const id = payload?.id || e.dataTransfer.getData('text/plain');
    if (!id) {
      clearPlacementSession();
      return;
    }
    const entry = findAsset(registry, id);
    const kind = payload?.kind || payload?.type || entry?.kind;
    if (kind === 'material') {
      clearPlacementSession();
      const sceneView = runtimeRef.current?.sceneView;
      const hit = sceneView?.pickSurface?.(nx, ny, camera);
      if (hit?.actorId && hit?.surfaceId) {
        selectActor(hit.actorId);
        setSelectedSurface({ actorId: hit.actorId, surfaceId: hit.surfaceId });
        assignSelectedSurfaceMaterial(id, hit);
        setStatus(`Applied material to ${hit.surfaceId}`);
        return;
      }
      if (selectedActorIds.length > 0) {
        applySelectedMaterialToBrush(id);
        setStatus('Applied material to selection');
      }
      return;
    }

    const placePayload = {
      action: 'asset',
      assetId: id,
      assetKind: kind,
      label: payload?.name || entry?.name || id,
      placement: 'upright',
    };
    const pose = resolveSurfacePose(nx, ny, placePayload, 0, camera);
    clearPlacementSession();
    if (!pose.valid) return;
    await commitCreatePlacement(placePayload, pose, {
      createBrushAtBounds,
      placeLight,
      placeEnvironment,
      placePrimitiveMesh,
      placePlayerSpawn,
      createCell,
      placeMeshAsset,
      placePrefabAsset,
      gridSize,
      gridSnap,
    });
  };

  const onCanvasDragLeave = () => {
    if (placeSessionRef.current?.dragging && !placeSessionRef.current?.armed) {
      clearPlacementSession();
    }
  };

  // Rebind OrbitControls + scissor panes when layout / active pane / camera mode changes.
  // Play uses a single full-bleed FPS camera — clear multi-pane scissors.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.sceneView) return;
    if (mode === 'play') {
      runtime.setViewportPanes(null);
      return;
    }
    syncActivePaneCamera(runtime.sceneView, viewportPrefs, orbitRef.current, {
      flying: flyModeRef.current,
      settings: editorSettingsRef.current,
    });
    // configureOrbitForPane resets RMB — keep perspective RIGHT disabled (Ctrl+move orbits).
    if (orbitRef.current && !flyModeRef.current && mode === 'edit') {
      const pane = viewportPrefs.panes.find((p) => p.id === viewportPrefs.activePaneId);
      const camMode = pane?.cameraMode || 'perspective';
      if (camMode === 'perspective') {
        orbitRef.current.mouseButtons.RIGHT = -1;
      }
    }
    const { width, height } = shellSizeRef.current;
    runtime.setViewportPanes(
      buildViewportPanes(viewportPrefs, width, height, runtime.sceneView),
    );
  }, [runtimeRef, viewportPrefs, mode]);

  const togglePaneMaximize = useCallback(() => {
    const prefs = viewportPrefsRef.current;
    if (prefs.maximizedPaneId) {
      const restore = prefs.maximizeRestore || {};
      setViewportPrefs({
        ...prefs,
        maximizedPaneId: null,
        maximizeRestore: null,
        layoutMode: restore.layoutMode || prefs.layoutMode,
        splitX: restore.splitX ?? prefs.splitX,
        splitY: restore.splitY ?? prefs.splitY,
        splitY2: restore.splitY2 ?? prefs.splitY2,
      });
      return;
    }
    if (prefs.layoutMode === 'single') return;
    const paneId = prefs.activePaneId || prefs.panes[0]?.id;
    if (!paneId) return;
    setViewportPrefs({
      ...prefs,
      maximizedPaneId: paneId,
      maximizeRestore: {
        layoutMode: prefs.layoutMode,
        splitX: prefs.splitX,
        splitY: prefs.splitY,
        splitY2: prefs.splitY2,
      },
    });
  }, [setViewportPrefs]);

  useEffect(() => {
    const onToggle = () => togglePaneMaximize();
    window.addEventListener('bb:toggle-pane-maximize', onToggle);
    return () => window.removeEventListener('bb:toggle-pane-maximize', onToggle);
  }, [togglePaneMaximize]);

  // Harness / debug bridge for Phase 2F.6 acceptance.
  useEffect(() => {
    window.__bloodboundViewport = {
      getPrefs: () => ({ ...viewportPrefsRef.current }),
      setPrefs: (partial) => {
        setViewportPrefs({ ...viewportPrefsRef.current, ...partial });
      },
      getRuntime: () => runtimeRef.current,
      getShellSize: () => ({ ...shellSizeRef.current }),
      focusSelected: () => focusSelected(),
      measureFrameTimes: async (seconds = 0.4, {
        warmupFrames = 12,
        // Automation / background tabs often inject ~500–1000ms rAF gaps.
        // Discard those so median FPS reflects render cost, not focus stalls.
        stallMs = 120,
        settleStableFrames = 6,
        minSamples = 20,
      } = {}) => {
        const waitFrame = () => new Promise((r) => requestAnimationFrame(r));

        // Warm-up: discard early frames (shader compile, layout settle).
        for (let i = 0; i < warmupFrames; i += 1) {
          await waitFrame();
        }

        // Wait until rAF is healthy before the timed sample window.
        // Cap settle attempts tightly — background tabs throttle to ~1 FPS and
        // must not block the acceptance harness for minutes.
        let stable = 0;
        let last = performance.now();
        let settleGuard = 0;
        const settleCap = Math.max(settleStableFrames * 4, 24);
        while (stable < settleStableFrames && settleGuard < settleCap) {
          await waitFrame();
          const now = performance.now();
          const dt = now - last;
          last = now;
          settleGuard += 1;
          if (dt <= stallMs) stable += 1;
          else stable = 0;
        }

        const times = [];
        let discardedStalls = 0;
        last = performance.now();
        const end = last + seconds * 1000;
        const hardDeadline = performance.now() + Math.max(seconds * 1000, 1500) + 4000;
        // Keep sampling until the window ends *and* we have enough non-stall frames.
        while (performance.now() < end || times.length < minSamples) {
          if (performance.now() > hardDeadline) break;
          await waitFrame();
          const now = performance.now();
          const dt = now - last;
          last = now;
          if (dt > stallMs) {
            discardedStalls += 1;
            // Cap runaway waits if the tab stays throttled.
            if (discardedStalls > 12 && times.length === 0) break;
            continue;
          }
          times.push(dt);
          if (times.length >= minSamples && performance.now() >= end) break;
          // Hard cap so a throttled tab cannot spin forever.
          if (times.length + discardedStalls > 120) break;
        }
        const sorted = [...times].sort((a, b) => a - b);
        const avgMs = times.length
          ? times.reduce((a, b) => a + b, 0) / times.length
          : 0;
        const pct = (p) => {
          if (!sorted.length) return 0;
          const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
          return sorted[idx];
        };
        const medianMs = sorted.length
          ? (sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
          : 0;
        return {
          samples: times.length,
          discardedStalls,
          avgFrameMs: +avgMs.toFixed(2),
          medianFrameMs: +medianMs.toFixed(2),
          p95FrameMs: +pct(95).toFixed(2),
          minFrameMs: sorted.length ? +sorted[0].toFixed(2) : 0,
          maxFrameMs: sorted.length ? +sorted[sorted.length - 1].toFixed(2) : 0,
          avgFps: avgMs > 0 ? +(1000 / avgMs).toFixed(1) : 0,
          medianFps: medianMs > 0 ? +(1000 / medianMs).toFixed(1) : 0,
        };
      },
      /**
       * Snapshot renderer.info after an explicit info.reset() + one render.
       * Without reset, drawCalls/triangles accumulate across shadow/PP/depth passes
       * and prior frames — do not treat raw info as a single-pass cost.
       */
      measureGpuSnapshot: async ({ layoutMode = null } = {}) => {
        const rt = runtimeRef.current;
        const sv = rt?.sceneView;
        const renderer = sv?.renderer;
        if (!renderer?.info) return null;
        if (layoutMode && typeof window.__bloodboundViewport?.setPrefs === 'function') {
          window.__bloodboundViewport.setPrefs({ layoutMode });
          await new Promise((r) => requestAnimationFrame(r));
          await new Promise((r) => requestAnimationFrame(r));
        }
        renderer.info.reset();
        const t0 = performance.now();
        if (rt.viewportPanes?.length && sv.renderViewports) {
          sv.renderViewports(rt.viewportPanes);
        } else {
          sv.render?.(sv.camera);
        }
        if (renderer.getContext?.()?.finish) {
          try { renderer.getContext().finish(); } catch { /* ignore */ }
        }
        const cpuMs = +(performance.now() - t0).toFixed(2);
        const r = renderer.info.render;
        return {
          cpuSubmitMs: cpuMs,
          drawCalls: r.calls,
          triangles: r.triangles,
          points: r.points,
          lines: r.lines,
          geometries: renderer.info.memory?.geometries ?? null,
          textures: renderer.info.memory?.textures ?? null,
          paneCount: rt.viewportPanes?.length || 1,
          dpr: renderer.getPixelRatio?.() ?? null,
          size: sv._size ? { ...sv._size } : null,
        };
      },
    };
    return () => {
      delete window.__bloodboundViewport;
    };
  }, [setViewportPrefs, focusSelected]);

  return (
    <div className="bb-viewport" ref={shellRef}>
      {mode === 'edit' ? (
        <CreationToolbar
          viewportRef={shellRef}
          disabled={false}
          onActivateTool={onActivateCreationTool}
          onToolDragStart={(payload) => {
            placeSessionRef.current = {
              payload,
              dragging: true,
              candidateIndex: 0,
            };
            // Keep the active create tool in sync so a failed HTML5 drop
            // still footprint-drags the intended kind (not a prior Subtract).
            if (payload?.action === 'mode' && payload.tool) {
              setTool(payload.tool);
            }
          }}
          onToolDragEnd={() => {
            // Drop handler clears; if cancelled, clear preview.
            if (placeSessionRef.current?.dragging) {
              clearPlacementSession();
            }
          }}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className="bb-viewport-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={onCanvasDragOver}
        onDragLeave={onCanvasDragLeave}
        onDrop={onCanvasDrop}
      />
      {mode === 'edit' ? (
        <ViewportLayout
          prefs={viewportPrefs}
          shellWidth={shellSize.width}
          shellHeight={shellSize.height}
          marqueeRect={marqueeScreen}
          onChangePrefs={setViewportPrefs}
          onActivatePane={(paneId) => {
            const next = { ...viewportPrefsRef.current, activePaneId: paneId };
            setViewportPrefs(next);
            syncActivePaneCamera(runtimeRef.current?.sceneView, next, orbitRef.current, {
              flying: flyModeRef.current,
              settings: editorSettingsRef.current,
            });
          }}
          onResetCamera={(paneId) => resetCameraView(paneId)}
        />
      ) : (
        <div className="bb-viewport-play-chrome" aria-hidden="true">
          <span className="bb-viewport-play-chrome__badge">Play</span>
          <span className="bb-viewport-play-chrome__hint">Esc releases mouse · Stop ends Play</span>
        </div>
      )}
    </div>
  );
}
