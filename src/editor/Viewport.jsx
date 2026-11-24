import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { useEditor } from './EditorContext.jsx';
import { useEditorSettings } from './EditorSettingsContext.jsx';
import {
  orbitDampingFromFloatiness,
  viewportColorsFromSettings,
} from './editorSettingsPrefs.js';
import { useLayout } from './layout/LayoutContext.jsx';
import {
  snapToGrid,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import { getBrushSnapSize, snapMovedAxis } from './gridSnap.js';
import { resizeBrushFace } from './brushFactory.js';
import { IconMaximize, IconRestore } from '../ui/icons.jsx';
import { findAsset } from '../assets/AssetRegistry.js';
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
  saveViewportPrefs,
  isOrthographicMode,
} from './viewport/viewportPrefs.js';
import { LayoutModeToolbar, ViewportLayout } from './viewport/ViewportLayout.jsx';
import {
  buildViewportPanes,
  capturePanePoses,
  filterGizmoAxisForOrtho,
  focusPaneOnSelection,
  resolvePointerInPanes,
  syncActivePaneCamera,
} from './viewport/viewportRuntimeBridge.js';
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
  /** Edit-mode: idle = RMB orbit; WASD/QE = free-fly + RMB freelook. */
  const flyKeysRef = useRef(new Set());
  const flyClockRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const flyModeRef = useRef(false);
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
    setTransformMode,
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
    beginClipSession,
    cancelClipSession,
    addClipPoint,
    commitClipSession,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    saveLevel,
    placeMeshAsset,
    placePrefabAsset,
    placeLight,
    placePlayerSpawn,
    createCell,
    updateSelectedBrush,
  } = useEditor();
  const { settings: editorSettings } = useEditorSettings();
  const { layout, toggleMaximizeViewport } = useLayout();
  const { dragMime, registry } = useAssetBrowser();

  editorSettingsRef.current = editorSettings;

  const setViewportPrefs = useCallback((next) => {
    const clamped = clampViewportPrefs(
      typeof next === 'function' ? next(viewportPrefsRef.current) : next,
    );
    viewportPrefsRef.current = clamped;
    setViewportPrefsState(clamped);
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      saveViewportPrefs(viewportPrefsRef.current);
    }, 200);
  }, []);

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
      const damping = orbitDampingFromFloatiness(prefs?.cameraOrbitFloatiness);
      controls.enableDamping = damping.enableDamping;
      controls.dampingFactor = damping.dampingFactor;
      controls.rotateSpeed = prefs?.cameraOrbitSpeed ?? 1;
      controls.zoomSpeed = prefs?.cameraOrbitZoomSpeed ?? 1;
      controls.panSpeed = prefs?.cameraOrbitPanSpeed ?? 1;
      // Invert vertical orbit by flipping phi deltas when the setting is on.
      const baseRotateUp = controls._rotateUp.bind(controls);
      controls._rotateUp = (angle) => {
        const invert = editorSettingsRef.current?.cameraInvertY;
        baseRotateUp(invert ? -angle : angle);
      };
      runtime.setViewportColors?.(viewportColorsFromSettings(prefs));
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
      syncActivePaneCamera(runtime.sceneView, viewportPrefsRef.current, controls);
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

    const enterFlyMode = () => {
      if (flyModeRef.current) return;
      flyModeRef.current = true;
      // Hand RMB to freelook so orbit rotate doesn't fight WASD.
      controls.mouseButtons.RIGHT = -1;
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
      lookRef.current.active = false;
      lookRef.current.pointerId = null;
      // Resume orbit around the point currently in front of the camera.
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      controls.update();
    };

    const applySize = () => {
      const width = shell.clientWidth;
      const height = shell.clientHeight;
      if (width > 0 && height > 0) {
        runtime.setSize(width, height);
        shellSizeRef.current = { width, height };
        setShellSize({ width, height });
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

    const onFlyKeyDown = (e) => {
      if (e.repeat) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target?.isContentEditable) return;
      // Free-fly is perspective-only; orthographic panes use pan/zoom.
      const activePane = viewportPrefsRef.current.panes.find(
        (p) => p.id === viewportPrefsRef.current.activePaneId,
      );
      if (activePane && isOrthographicMode(activePane.cameraMode)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
        flyKeysRef.current.add(e.code);
        if (FLY_MOVE_KEYS.has(e.code)) {
          e.preventDefault();
          if (runtime.mode === 'edit') enterFlyMode();
        }
      }
    };
    const onFlyKeyUp = (e) => {
      flyKeysRef.current.delete(e.code);
      if (!isFlyMoving(flyKeysRef.current)) exitFlyMode();
    };
    const onFlyBlur = () => {
      flyKeysRef.current.clear();
      exitFlyMode();
    };

    const LOOK_SENS_BASE = 0.005;
    const PITCH_LIMIT = Math.PI / 2 - 0.05;

    const onLookPointerDown = (e) => {
      // Freelook only while flying (WASD/QE). Otherwise OrbitControls owns RMB.
      if (e.button !== 2 || runtime.mode !== 'edit' || !flyModeRef.current) return;
      lookRef.current.active = true;
      lookRef.current.pointerId = e.pointerId;
      lookRef.current.lastX = e.clientX;
      lookRef.current.lastY = e.clientY;
      const cam = activeCam();
      lookEuler.setFromQuaternion(cam.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = Math.max(0.5, cam.position.distanceTo(controls.target));
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onLookPointerMove = (e) => {
      const look = lookRef.current;
      if (!look.active || e.pointerId !== look.pointerId || !flyModeRef.current) return;
      const dx = e.clientX - look.lastX;
      const dy = e.clientY - look.lastY;
      look.lastX = e.clientX;
      look.lastY = e.clientY;
      const prefs = editorSettingsRef.current;
      const lookSens = LOOK_SENS_BASE * (prefs?.cameraFlyLookSensitivity ?? 1);
      const ySign = prefs?.cameraInvertY ? -1 : 1;
      look.yaw -= dx * lookSens;
      look.pitch -= dy * lookSens * ySign;
      look.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.pitch));
      applyLookRotation();
    };
    const onLookPointerUp = (e) => {
      const look = lookRef.current;
      if (e.pointerId !== look.pointerId) return;
      look.active = false;
      look.pointerId = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onContextMenu = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', onFlyKeyDown);
    window.addEventListener('keyup', onFlyKeyUp);
    window.addEventListener('blur', onFlyBlur);
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
        } else if (!flyModeRef.current) {
          // Idle orbit / pan / zoom — damping needs per-frame update.
          controls.update();
        }

        // Keep scissor panes + persisted poses in sync with live cameras.
        const { width, height } = shellSizeRef.current;
        const panes = buildViewportPanes(
          viewportPrefsRef.current,
          width,
          height,
          runtime.sceneView,
        );
        runtime.setViewportPanes(panes);
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
      orbitRef.current.enabled = mode === 'edit' && !dragRef.current;
    }
  }, [mode]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const damping = orbitDampingFromFloatiness(editorSettings.cameraOrbitFloatiness);
    controls.enableDamping = damping.enableDamping;
    controls.dampingFactor = damping.dampingFactor;
    controls.rotateSpeed = editorSettings.cameraOrbitSpeed;
    controls.zoomSpeed = editorSettings.cameraOrbitZoomSpeed;
    controls.panSpeed = editorSettings.cameraOrbitPanSpeed;
  }, [
    editorSettings.cameraOrbitFloatiness,
    editorSettings.cameraOrbitSpeed,
    editorSettings.cameraOrbitZoomSpeed,
    editorSettings.cameraOrbitPanSpeed,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setViewportColors?.(viewportColorsFromSettings(editorSettings));
  }, [
    runtimeRef,
    editorSettings.viewportBackground,
    editorSettings.viewportGridMajor,
    editorSettings.viewportGridMinor,
    editorSettings.viewportSelection,
    editorSettings.viewportSubtract,
  ]);

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
    syncActivePaneCamera(sceneView, next, controls);

    const cam = sceneView.camera;
    lookRef.current.distance = Math.max(0.5, cam.position.distanceTo(controls?.target || new THREE.Vector3()));
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    lookEuler.setFromQuaternion(cam.quaternion, 'YXZ');
    lookRef.current.yaw = lookEuler.y;
    lookRef.current.pitch = lookEuler.x;
  }, [runtimeRef, selectedActorIds, setViewportPrefs]);

  useEffect(() => {
    const onFocusEvent = () => focusSelected();
    window.addEventListener('bb:focus-selection', onFocusEvent);
    return () => window.removeEventListener('bb:focus-selection', onFocusEvent);
  }, [focusSelected]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (mode !== 'edit') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (clipSession) {
          cancelClipSession?.();
        } else if (placeSessionRef.current) {
          clearPlacementSession();
        } else if (dragRef.current?.type === 'faceMove') {
          runtimeRef.current?.sceneView?.gizmo?.endDrag?.();
          cancelFaceMove?.();
          dragRef.current = null;
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

      // W/E/R — transform · F — focus · [ ] — grid · Shift+G — snap
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'w') {
          setTransformMode('move');
          setTool('select');
        } else if (k === 'e') {
          setTransformMode('rotate');
          setTool('select');
        } else if (k === 'r') {
          setTransformMode('scale');
          setTool('select');
        } else if (k === 'f') {
          e.preventDefault();
          focusSelected();
        } else if (e.key === '[') {
          e.preventDefault();
          cycleGridSize(-1);
        } else if (e.key === ']') {
          e.preventDefault();
          cycleGridSize(1);
        } else if (k === 'g' && e.shiftKey) {
          e.preventDefault();
          toggleGridSnap();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveLevel();
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
    setTool,
    setSelectedSurface,
    setAlignReferenceSurface,
    setGeometrySelection,
    cancelFaceMove,
    clipSession,
    cancelClipSession,
    commitClipSession,
    saveLevel,
    clearPlacementSession,
    resolveSurfacePose,
    updatePlacementPreview,
    focusSelected,
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
      syncActivePaneCamera(runtimeRef.current?.sceneView, next, orbitRef.current);
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

  const onPointerDown = (e) => {
    if (mode !== 'edit' || !runtimeRef.current || !world) return;
    if (e.button !== 0) return;

    // Armed click-to-place from creation toolbar (lights, spawn, cell, assets).
    if (placeSessionRef.current?.armed) {
      void commitArmedPlacement(e);
      return;
    }

    const { nx, ny, camera, localX, localY } = pointerNorm(e);
    const sceneView = runtimeRef.current.sceneView;
    const cam = camera || sceneView.camera;

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
        const edgeHit = sceneView.pickGeometryEdge?.(nx, ny, cam, {
          xray: e.altKey,
        });
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
        const vertHit = sceneView.pickGeometryVertex?.(nx, ny, cam, {
          xray: e.altKey,
        });
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
      const faceHit = sceneView.pickGeometryFace?.(nx, ny, cam);
      if (faceHit) {
        const next = toggleGeometryItem(geometrySelection, {
          actorId: faceHit.actorId,
          id: faceHit.faceId,
          mode: 'face',
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
        });
        setGeometrySelection(next);
        setStatus(
          next.items.length
            ? `Face ${faceHit.faceId} (${next.items.reduce((n, it) => n + it.ids.length, 0)} selected)`
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

      if (gizmoHit.kind === 'move') {
        const beforeStates = selectedActorIds.map((id) => {
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

        dragRef.current = {
          type: 'move',
          axis: gizmoHit.axis,
          beforeStates,
        };
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
        const beforeStates = selectedActorIds.map((id) => {
          const actor = world.getActor(id);
          if (!actor) return null;
          return {
            actorId: id,
            before: actor.transform.toJSON(),
            startRot: { ...actor.transform.rotation },
          };
        }).filter(Boolean);
        dragRef.current = {
          type: 'rotate',
          axis: gizmoHit.axis,
          beforeStates,
        };
      } else if (gizmoHit.kind === 'scale') {
        const beforeStates = selectedActorIds.map((id) => {
          const actor = world.getActor(id);
          if (!actor) return null;
          return {
            actorId: id,
            before: actor.transform.toJSON(),
            startScale: { ...actor.transform.scale },
          };
        }).filter(Boolean);
        dragRef.current = {
          type: 'scale',
          axis: gizmoHit.axis,
          beforeStates,
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

    if (drag.type === 'move') {
      const raycaster = sceneView.getRaycaster(nx, ny, cam);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      // Snap off = freeform. Alt = temporary 1-unit snap. Otherwise construction grid.
      const freeMove = !gridSnap && !e.altKey;
      const snapStep = e.altKey ? 1 : gridSize;
      const delta = sample.deltaEditor;
      const updates = drag.beforeStates.map((s) => {
        const position = { ...s.startPos };
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
      const snapDeg = e.altKey ? raw : Math.round(raw / 5) * 5;
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
      // 100 editor units of drag ≈ +1.0 scale on that axis.
      const factor = sample.deltaEditor / 100;
      const updates = drag.beforeStates.map((s) => {
        const scale = { ...s.startScale };
        scale[drag.axis] = Math.max(0.01, s.startScale[drag.axis] + factor);
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
          const ids = marqueeSelectActors(sceneView._actorMeshes, cam, marquee);
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

  const toolHint = () => {
    if (mode !== 'edit') {
      return 'Click to lock mouse · WASD move · Mouse look · Space jump · Esc release';
    }
    if (tool === 'box') return 'Drag on grid to create a box · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'wall') return 'Drag on grid to create a wall · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'floor') return 'Drag on grid to create a floor · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'ceiling') return 'Drag on grid to create a ceiling · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'ramp') return 'Drag on grid to create a ramp · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'stair') return 'Drag on grid to create stairs · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'column') return 'Drag on grid to create a column · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'curvedWall') return 'Drag on grid to create a curved wall · near-square → circle · RMB orbit · WASD free-fly · Q/E · Shift boost';
    if (tool === 'archRoman' || tool === 'archGothic' || tool === 'arch') return 'Drag on grid to create an arch · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'subtract') return 'Drag on grid to create a subtractive cutter · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
    if (tool === 'geometry') {
      if (geometryMode === 'edge') {
        return 'Edge mode — click near edges (Shift multi · Alt x-ray) · gizmo move · Esc cancel · RMB orbit · WASD free-fly';
      }
      if (geometryMode === 'vertex') {
        return 'Vertex mode — click near vertices (Shift multi · Alt x-ray) · Move only · Esc cancel · RMB orbit · WASD free-fly';
      }
      return 'Face mode — click faces (Shift multi) · gizmo move · Esc cancel · RMB orbit · WASD free-fly';
    }
    return `LMB select · Ctrl+LMB multi · W move · E rotate · R scale (${transformMode}) · F focus · Del delete · Ctrl+D duplicate · Ctrl+Z/Y undo/redo · RMB orbit · WASD free-fly · Q/E up/down · Shift boost · MMB pan · wheel zoom`;
  };

  const onCanvasDragOver = (e) => {
    if (mode !== 'edit') return;
    const types = [...e.dataTransfer.types];
    const isCreate = types.includes(CREATE_DRAG_MIME);
    const isAsset = types.includes(dragMime) || types.includes('text/plain');
    if (!isCreate && !isAsset) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const { nx, ny, camera } = pointerNorm(e, { activate: false });
    let payload = placeSessionRef.current?.payload || null;
    if (isCreate && !payload) {
      // Browser may not expose data until drop; use a generic upright preview.
      payload = { placement: 'upright', placeKind: 'prop' };
    }
    if (isAsset && !isCreate) {
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
    if (kind === 'material' && selectedActorIds.length > 0) {
      clearPlacementSession();
      updateSelectedBrush({ materialId: id });
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
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.sceneView) return;
    syncActivePaneCamera(runtime.sceneView, viewportPrefs, orbitRef.current);
    const { width, height } = shellSizeRef.current;
    runtime.setViewportPanes(
      buildViewportPanes(viewportPrefs, width, height, runtime.sceneView),
    );
  }, [runtimeRef, viewportPrefs]);

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
      measureFrameTimes: async (seconds = 0.4) => {
        const times = [];
        let last = performance.now();
        const end = last + seconds * 1000;
        while (performance.now() < end) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now();
          times.push(now - last);
          last = now;
        }
        const avgMs = times.length
          ? times.reduce((a, b) => a + b, 0) / times.length
          : 0;
        return {
          samples: times.length,
          avgFrameMs: +avgMs.toFixed(2),
          avgFps: avgMs > 0 ? +(1000 / avgMs).toFixed(1) : 0,
        };
      },
    };
    return () => {
      delete window.__bloodboundViewport;
    };
  }, [setViewportPrefs, focusSelected]);

  return (
    <div className="bb-viewport" ref={shellRef}>
      <div className="bb-viewport-chrome">
        <LayoutModeToolbar
          layoutMode={viewportPrefs.layoutMode}
          maximizedPaneId={viewportPrefs.maximizedPaneId}
          onLayoutMode={(layoutMode) => {
            setViewportPrefs({
              ...viewportPrefsRef.current,
              layoutMode,
              maximizedPaneId: null,
              maximizeRestore: null,
            });
          }}
        />
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          title={layout.viewportMaximized ? 'Restore dock viewport' : 'Maximize dock viewport'}
          onClick={() => toggleMaximizeViewport()}
        >
          {layout.viewportMaximized ? <IconRestore /> : <IconMaximize />}
        </button>
      </div>
      <CreationToolbar
        viewportRef={shellRef}
        disabled={mode !== 'edit'}
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
      <ViewportLayout
        prefs={viewportPrefs}
        shellWidth={shellSize.width}
        shellHeight={shellSize.height}
        marqueeRect={marqueeScreen}
        onChangePrefs={setViewportPrefs}
        onActivatePane={(paneId) => {
          const next = { ...viewportPrefsRef.current, activePaneId: paneId };
          setViewportPrefs(next);
          syncActivePaneCamera(runtimeRef.current?.sceneView, next, orbitRef.current);
        }}
        onFocusSelected={(paneId) => focusSelected(paneId)}
      />
      <div className="bb-viewport-hint">
        {toolHint()}
        {placeSessionRef.current?.armed ? ' · Click surface to place · Esc cancel · Tab cycle' : ''}
        {selectedActorIds.length > 0 && mode === 'edit'
          ? ` · ${selectedActorIds.length} selected`
          : ''}
      </div>
    </div>
  );
}
