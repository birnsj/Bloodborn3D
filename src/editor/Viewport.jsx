import { useCallback, useEffect, useRef } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { useEditor } from './EditorContext.jsx';
import { useLayout } from './layout/LayoutContext.jsx';
import {
  snapToGrid,
  WALL_MODULE_SIZE,
} from '../core/units.js';
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

export function Viewport() {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const orbitRef = useRef(null);
  const dragRef = useRef(null);
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

  const {
    attachCanvas,
    runtimeRef,
    mode,
    tool,
    setTool,
    selectActor,
    selectedActorIds,
    world,
    gridSize,
    gridSnap,
    createBrushAtBounds,
    previewActorPositions,
    previewBrushGeometry,
    commitTransforms,
    commitBrushGeometry,
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
  const { layout, toggleMaximizeViewport } = useLayout();
  const { dragMime, registry } = useAssetBrowser();

  const clearPlacementSession = useCallback(() => {
    placeSessionRef.current = null;
    runtimeRef.current?.sceneView?.setPlacementPreview(null);
  }, [runtimeRef]);

  const resolveSurfacePose = useCallback((nx, ny, payload, candidateIndex = 0) => {
    const sceneView = runtimeRef.current?.sceneView;
    if (!sceneView) return { valid: false, position: null, reason: 'No view' };
    const hits = sceneView.pickWorldHits(nx, ny);
    const placement = payload?.placement || 'upright';
    const { hit, candidates, index } = selectPlacementHit(hits, {
      placement,
      candidateIndex,
    });
    if (!hit) {
      // Fall back to construction plane so empty scenes still place.
      const plane = sceneView.pickConstructionPoint(nx, ny, 0);
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
    const camera = runtime.sceneView.camera;
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.5, 0);
    // Default: RMB orbits. While WASD/QE are held we switch to freelook.
    controls.mouseButtons = {
      LEFT: -1,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.update();
    orbitRef.current = controls;
    flyModeRef.current = false;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const move = new THREE.Vector3();
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    {
      lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = camera.position.distanceTo(controls.target) || 6;
    }

    const FLY_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
    const isFlyMoving = (keys) => {
      for (const code of FLY_MOVE_KEYS) {
        if (keys.has(code)) return true;
      }
      return false;
    };

    const syncLookTarget = () => {
      camera.getWorldDirection(forward);
      controls.target.copy(camera.position).addScaledVector(forward, lookRef.current.distance);
    };

    const applyLookRotation = () => {
      const { yaw, pitch } = lookRef.current;
      lookEuler.set(pitch, yaw, 0);
      camera.quaternion.setFromEuler(lookEuler);
      syncLookTarget();
    };

    const enterFlyMode = () => {
      if (flyModeRef.current) return;
      flyModeRef.current = true;
      // Hand RMB to freelook so orbit rotate doesn't fight WASD.
      controls.mouseButtons.RIGHT = -1;
      lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = Math.max(0.5, camera.position.distanceTo(controls.target));
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
      if (width > 0 && height > 0) runtime.setSize(width, height);
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

    const LOOK_SENS = 0.005;
    const PITCH_LIMIT = Math.PI / 2 - 0.05;

    const onLookPointerDown = (e) => {
      // Freelook only while flying (WASD/QE). Otherwise OrbitControls owns RMB.
      if (e.button !== 2 || runtime.mode !== 'edit' || !flyModeRef.current) return;
      lookRef.current.active = true;
      lookRef.current.pointerId = e.pointerId;
      lookRef.current.lastX = e.clientX;
      lookRef.current.lastY = e.clientY;
      lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      lookRef.current.yaw = lookEuler.y;
      lookRef.current.pitch = lookEuler.x;
      lookRef.current.distance = Math.max(0.5, camera.position.distanceTo(controls.target));
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
      look.yaw -= dx * LOOK_SENS;
      look.pitch -= dy * LOOK_SENS;
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

    // ~4.5 m/s feel in editor units (100 eu = 1 m); Shift boosts.
    const FLY_SPEED = 450;
    const FLY_BOOST = 2.75;

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
            const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? FLY_BOOST : 1;
            move.normalize().multiplyScalar(FLY_SPEED * boost * dt);
            const meters = move.multiplyScalar(0.01);
            cam.position.add(meters);
            syncLookTarget();
          }
        } else if (!flyModeRef.current) {
          // Idle orbit / pan / zoom — damping needs per-frame update.
          controls.update();
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
      canvas.removeEventListener('pointerdown', onLookPointerDown);
      window.removeEventListener('pointermove', onLookPointerMove);
      window.removeEventListener('pointerup', onLookPointerUp);
      window.removeEventListener('pointercancel', onLookPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
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
    const onKeyDown = (e) => {
      if (mode !== 'edit') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && placeSessionRef.current) {
        e.preventDefault();
        clearPlacementSession();
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    saveLevel,
    clearPlacementSession,
    resolveSurfacePose,
    updatePlacementPreview,
  ]);

  const pointerNorm = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      nx: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      ny: -((e.clientY - rect.top) / rect.height) * 2 + 1,
      rect,
    };
  };

  const onPointerDown = (e) => {
    if (mode !== 'edit' || !runtimeRef.current || !world) return;
    if (e.button !== 0) return;

    // Armed click-to-place from creation toolbar (lights, spawn, cell, assets).
    if (placeSessionRef.current?.armed) {
      void commitArmedPlacement(e);
      return;
    }

    const { nx, ny } = pointerNorm(e);
    const sceneView = runtimeRef.current.sceneView;

    // Create tools: start footprint drag on construction plane
    if (tool === 'box' || tool === 'wall' || tool === 'floor' || tool === 'ceiling' || tool === 'ramp' || tool === 'stair' || tool === 'column' || tool === 'arch' || tool === 'archRoman' || tool === 'archGothic' || tool === 'curvedWall' || tool === 'subtract') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0);
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

    // Gizmo first
    const gizmoHit = sceneView.pickGizmo(nx, ny);
    if (gizmoHit && selectedActorIds.length > 0) {
      const raycaster = sceneView.getRaycaster(nx, ny);
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
          return {
            actorId: id,
            before: actor.transform.toJSON(),
            startPos,
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
      }

      if (orbitRef.current) orbitRef.current.enabled = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Actor pick / multi-select
    const actorId = sceneView.pickActorId(nx, ny);
    selectActor(actorId, { additive: e.ctrlKey || e.metaKey });
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
    const { nx, ny } = pointerNorm(e);
    const sceneView = runtimeRef.current.sceneView;

    if (drag.type === 'create') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0);
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
      const raycaster = sceneView.getRaycaster(nx, ny);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      // Hold Alt to temporarily disable grid snapping during gizmo drags.
      const snap = e.altKey || !gridSnap ? 1 : gridSize;
      const delta = snapToGrid(sample.deltaEditor, snap);
      const updates = drag.beforeStates.map((s) => {
        const position = { ...s.startPos };
        position[drag.axis] = snapToGrid(s.startPos[drag.axis] + delta, snap);
        return { actorId: s.actorId, position };
      });
      previewActorPositions(updates);
      return;
    }

    if (drag.type === 'resize') {
      const raycaster = sceneView.getRaycaster(nx, ny);
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
    const { nx, ny } = pointerNorm(e);
    const pose = resolveSurfacePose(nx, ny, session.payload, session.candidateIndex || 0);
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
    } else if (drag.type === 'move') {
      runtimeRef.current?.sceneView.gizmo.endDrag();
      const changes = drag.beforeStates.map((s) => {
        const actor = world.getActor(s.actorId);
        return {
          actorId: s.actorId,
          before: s.before,
          after: actor ? actor.transform.toJSON() : s.before,
        };
      });
      commitTransforms(changes, 'Move');
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
    return 'LMB select · Ctrl+LMB multi · Gizmo move/resize · Del delete · Ctrl+D duplicate · Ctrl+Z/Y undo/redo · RMB orbit · WASD free-fly (RMB freelook while flying) · Q/E up/down · Shift boost · MMB pan · wheel zoom';
  };

  const onCanvasDragOver = (e) => {
    if (mode !== 'edit') return;
    const types = [...e.dataTransfer.types];
    const isCreate = types.includes(CREATE_DRAG_MIME);
    const isAsset = types.includes(dragMime) || types.includes('text/plain');
    if (!isCreate && !isAsset) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    const { nx, ny } = pointerNorm(e);
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
    const { nx, ny } = pointerNorm(e);

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
    const pose = resolveSurfacePose(nx, ny, placePayload, 0);
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

  return (
    <div className="bb-viewport" ref={shellRef}>
      <div className="bb-viewport-chrome">
        <div className="bb-seg">
          <button type="button" className="bb-btn bb-btn--active" disabled title="Perspective">
            Perspective
          </button>
          <button type="button" className="bb-btn" disabled title="Lit shading">
            Lit
          </button>
          <button type="button" className="bb-btn" disabled title="Show options">
            Show
          </button>
        </div>
        <button
          type="button"
          className="bb-btn bb-btn--icon"
          title={layout.viewportMaximized ? 'Restore viewport' : 'Maximize viewport'}
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
