import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { useEditor } from './EditorContext.jsx';
import { useLayout } from './layout/LayoutContext.jsx';
import { snapToGrid, WALL_MODULE_SIZE, FLOOR_THICKNESS } from '../core/units.js';
import { resizeBrushFace } from './brushFactory.js';
import { IconMaximize, IconRestore } from '../ui/icons.jsx';
import { findAsset } from '../assets/AssetRegistry.js';
import { useAssetBrowser } from './assets/AssetBrowserContext.jsx';

export function Viewport() {
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const orbitRef = useRef(null);
  const dragRef = useRef(null);
  /** Edit-mode fly: RMB + WASD (Q/E up/down). */
  const flyKeysRef = useRef(new Set());
  const rmbDownRef = useRef(false);
  const flyClockRef = useRef(typeof performance !== 'undefined' ? performance.now() : 0);

  const {
    attachCanvas,
    runtimeRef,
    mode,
    tool,
    selectActor,
    selectedActorIds,
    world,
    gridSize,
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
    updateSelectedBrush,
  } = useEditor();
  const { layout, toggleMaximizeViewport } = useLayout();
  const { dragMime, registry } = useAssetBrowser();

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
    controls.mouseButtons = {
      LEFT: -1, // LMB reserved for select / create / gizmo
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.update();
    orbitRef.current = controls;

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
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        flyKeysRef.current.add(e.code);
      }
    };
    const onFlyKeyUp = (e) => {
      flyKeysRef.current.delete(e.code);
    };
    const onFlyBlur = () => {
      flyKeysRef.current.clear();
      rmbDownRef.current = false;
    };
    const onPointerDownFly = (e) => {
      if (e.button === 2) rmbDownRef.current = true;
    };
    const onPointerUpFly = (e) => {
      if (e.button === 2) rmbDownRef.current = false;
    };
    const onContextMenu = (e) => {
      // Keep RMB for orbit/fly; suppress browser menu on the canvas.
      e.preventDefault();
    };

    window.addEventListener('keydown', onFlyKeyDown);
    window.addEventListener('keyup', onFlyKeyUp);
    window.addEventListener('blur', onFlyBlur);
    canvas.addEventListener('pointerdown', onPointerDownFly);
    window.addEventListener('pointerup', onPointerUpFly);
    canvas.addEventListener('contextmenu', onContextMenu);

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const move = new THREE.Vector3();
    // ~4.5 m/s feel in editor units (100 eu = 1 m)
    const FLY_SPEED = 450;

    let raf = 0;
    flyClockRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - flyClockRef.current) / 1000);
      flyClockRef.current = now;

      if (runtime.mode === 'edit' && orbitRef.current) {
        const controls = orbitRef.current;
        const keys = flyKeysRef.current;
        // Hold right mouse + WASD to fly (Unreal/Unity-style); Q/E vertical.
        if (rmbDownRef.current && keys.size > 0) {
          const cam = runtime.sceneView.camera;
          cam.getWorldDirection(forward);
          forward.normalize();
          right.crossVectors(forward, up).normalize();
          move.set(0, 0, 0);
          if (keys.has('KeyW')) move.add(forward);
          if (keys.has('KeyS')) move.sub(forward);
          if (keys.has('KeyD')) move.add(right);
          if (keys.has('KeyA')) move.sub(right);
          if (keys.has('KeyE')) move.y += 1;
          if (keys.has('KeyQ')) move.y -= 1;
          if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(FLY_SPEED * dt);
            // Convert editor-unit speed → meters for Three camera (scene is meters).
            const meters = move.multiplyScalar(0.01);
            cam.position.add(meters);
            controls.target.add(meters);
          }
        }
        controls.update();
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
      canvas.removeEventListener('pointerdown', onPointerDownFly);
      window.removeEventListener('pointerup', onPointerUpFly);
      canvas.removeEventListener('contextmenu', onContextMenu);
      controls.dispose();
      runtime.dispose();
      orbitRef.current = null;
      flyKeysRef.current.clear();
      rmbDownRef.current = false;
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
  }, [mode, undo, redo, duplicateSelected, deleteSelected, saveLevel]);

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

    const { nx, ny } = pointerNorm(e);
    const sceneView = runtimeRef.current.sceneView;

    // Create tools: start footprint drag on construction plane
    if (tool === 'box' || tool === 'wall' || tool === 'floor') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0);
      if (!point) return;
      const snapped = {
        x: snapToGrid(point.x, gridSize),
        y: 0,
        z: snapToGrid(point.z, gridSize),
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
    const min = {
      x: Math.min(drag.start.x, drag.current.x),
      y: 0,
      z: Math.min(drag.start.z, drag.current.z),
    };
    const max = {
      x: Math.max(drag.start.x, drag.current.x),
      y: drag.kind === 'floor'
        ? FLOOR_THICKNESS
        : drag.kind === 'wall'
          ? WALL_MODULE_SIZE
          : Math.max(gridSize, gridSize),
      z: Math.max(drag.start.z, drag.current.z),
    };
    if (max.x === min.x) max.x = min.x + gridSize;
    if (max.z === min.z) max.z = min.z + gridSize;
    runtimeRef.current.sceneView.setCreatePreview({ min, max });
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !runtimeRef.current || !world) return;
    const { nx, ny } = pointerNorm(e);
    const sceneView = runtimeRef.current.sceneView;

    if (drag.type === 'create') {
      const point = sceneView.pickConstructionPoint(nx, ny, 0);
      if (!point) return;
      drag.current = {
        x: snapToGrid(point.x, gridSize),
        y: 0,
        z: snapToGrid(point.z, gridSize),
      };
      updateCreatePreview(drag);
      return;
    }

    if (drag.type === 'move') {
      const raycaster = sceneView.getRaycaster(nx, ny);
      const sample = sceneView.gizmo.sampleDrag(raycaster.ray);
      if (!sample) return;
      // Hold Alt to temporarily disable grid snapping during gizmo drags.
      const snap = e.altKey ? 1 : gridSize;
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
      const snap = e.altKey ? 1 : gridSize;
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
        y: drag.kind === 'box' ? gridSize : drag.current.y,
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
    if (tool === 'box') return 'Drag on grid to create a box · RMB orbit · RMB+WASD fly · MMB zoom';
    if (tool === 'wall') return 'Drag on grid to create a wall · RMB orbit · RMB+WASD fly · MMB zoom';
    if (tool === 'floor') return 'Drag on grid to create a floor · RMB orbit · RMB+WASD fly · MMB zoom';
    return 'LMB select · Ctrl+LMB multi · Gizmo move/resize · Del delete · Ctrl+D duplicate · Ctrl+Z/Y undo/redo · RMB orbit · RMB+WASD fly · Q/E up/down · MMB zoom';
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
      <canvas
        ref={canvasRef}
        className="bb-viewport-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => {
          if (mode !== 'edit') return;
          if (
            [...e.dataTransfer.types].includes(dragMime)
            || e.dataTransfer.types.includes('text/plain')
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          if (mode !== 'edit' || !runtimeRef.current) return;
          e.preventDefault();
          let payload = null;
          try {
            payload = JSON.parse(e.dataTransfer.getData(dragMime) || 'null');
          } catch {
            payload = null;
          }
          const id = payload?.id || e.dataTransfer.getData('text/plain');
          if (!id) return;
          const entry = findAsset(registry, id);
          const kind = payload?.kind || payload?.type || entry?.kind;
          const { nx, ny } = pointerNorm(e);
          const point = runtimeRef.current.sceneView.pickConstructionPoint(nx, ny, 0)
            || { x: 0, y: 0, z: 0 };

          if (kind === 'mesh') {
            placeMeshAsset(
              { id, name: payload?.name || entry?.name || 'Mesh' },
              { x: point.x, y: 50, z: point.z },
            );
            return;
          }
          if (kind === 'prefab') {
            placePrefabAsset(
              { id, name: payload?.name || entry?.name || 'Prefab' },
              { x: point.x, y: 0, z: point.z },
            );
            return;
          }
          if (kind === 'material' && selectedActorIds.length > 0) {
            updateSelectedBrush({ materialId: id });
          }
        }}
      />
      <div className="bb-viewport-hint">
        {toolHint()}
        {selectedActorIds.length > 0 && mode === 'edit'
          ? ` · ${selectedActorIds.length} selected`
          : ''}
      </div>
    </div>
  );
}
