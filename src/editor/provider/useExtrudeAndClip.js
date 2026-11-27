// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { snapToGrid } from '../../core/units.js';
import { localPlaneFromSelectedFace, localPointToWorld, planClip, planFaceExtrusion, planesByActorIdFromWorldPoints, previewClip, snapExtrudeDistance, worldPointsToLocalPlane } from '../geometryEditing/extrudeClip.js';
import { vertexMap } from '../../geometry/convexBrush.js';
import { convertBrushToConvexGeometry } from '../../geometry/convert.js';

export function useExtrudeAndClip({
  autoCapturePrefabOverrides,
  clipSessionRef,
  executeCommand,
  extrudePreviewRef,
  geometrySelectionRef,
  gridSize,
  gridSnap,
  isEditorActorLocked,
  mode,
  notify,
  selectedRef,
  setClipSessionState,
  setExtrudePreviewState,
  setStatus,
  setTool,
  world,
}) {
const clearExtrudePreview = useCallback(() => {
    setExtrudePreviewState(null);
    extrudePreviewRef.current = null;
  }, []);

  const previewExtrudeFace = useCallback((distance, {
    gridSize: gSize = gridSize,
    snapEnabled = gridSnap,
  } = {}) => {
    if (!world || mode === 'play') return { ok: false, code: 'NO_WORLD' };
    const sel = geometrySelectionRef.current;
    if (sel?.mode !== 'face' || !sel.primary) {
      return { ok: false, code: 'NO_FACE', message: 'Select a single face to extrude.' };
    }
    const d = snapExtrudeDistance(distance, { gridSize: gSize, snapEnabled });
    const planned = planFaceExtrusion(world, {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance: d,
      gridSize: gSize,
      snapEnabled: false, // already snapped
    });
    if (!planned.ok) {
      clearExtrudePreview();
      return planned;
    }
    const next = {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance: planned.distance,
      previewGeometry: planned.previewGeometry,
      newActorId: planned.newActorId,
    };
    setExtrudePreviewState(next);
    extrudePreviewRef.current = next;
    return { ok: true, ...next };
  }, [world, mode, gridSize, gridSnap, clearExtrudePreview]);

  const commitExtrudeFace = useCallback((distance, {
    gridSize: gSize = gridSize,
    snapEnabled = gridSnap,
    label = 'Extrude face',
  } = {}) => {
    if (!world || mode === 'play') return { ok: false, code: 'NO_WORLD' };
    const sel = geometrySelectionRef.current;
    if (sel?.mode !== 'face' || !sel.primary) {
      return { ok: false, code: 'NO_FACE', message: 'Select a single face to extrude.' };
    }
    if (isEditorActorLocked(world.getActor(sel.primary.actorId))) {
      setStatus('Cannot extrude: actor or authoring layer is locked.');
      return { ok: false, code: 'LOCKED' };
    }
    const planned = planFaceExtrusion(world, {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance,
      gridSize: gSize,
      snapEnabled,
    });
    clearExtrudePreview();
    if (!planned.ok) {
      notify(planned.message, { title: 'Extrude' });
      setStatus(planned.message);
      return planned;
    }
    planned.command.label = label;
    executeCommand(planned.command, { resync: true });
    autoCapturePrefabOverrides([sel.primary.actorId, planned.newActorId]);
    setStatus(`Extruded face by ${planned.distance} eu.`);
    return { ok: true, newActorId: planned.newActorId, distance: planned.distance };
  }, [
    world,
    mode,
    gridSize,
    gridSnap,
    executeCommand,
    notify,
    setStatus,
    autoCapturePrefabOverrides,
    clearExtrudePreview,
  ]);

  const beginClipSession = useCallback((clipMode = 'front') => {
    if (!world || mode === 'play') return false;
    const actorIds = selectedRef.current.length
      ? [...selectedRef.current]
      : (geometrySelectionRef.current?.items || []).map((i) => i.actorId);
    const unique = [...new Set(actorIds)];
    if (!unique.length) {
      notify('Select one or more brushes to clip.', { title: 'Clip' });
      return false;
    }
    const session = {
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : 'front',
      actorIds: unique,
      points: [],
      plane: null,
      source: 'points',
      preview: null,
    };
    setClipSessionState(session);
    clipSessionRef.current = session;
    setTool('geometry');
    setStatus('Clip: pick 3 grid-snapped points on brush surfaces (Enter=apply, Esc=cancel).');
    return true;
  }, [world, mode, notify, setStatus, setTool]);

  const cancelClipSession = useCallback(() => {
    if (!clipSessionRef.current) return;
    setClipSessionState(null);
    clipSessionRef.current = null;
    setStatus('Clip cancelled.');
  }, [setStatus]);

  const refreshClipPreview = useCallback((session) => {
    if (!world || !session?.actorIds?.length) {
      return { ok: false, code: 'NO_PLANE' };
    }
    // Always re-project the shared world plane into each actor's local space.
    // Never reuse one actor's local plane on siblings (wrong under parents / offsets).
    if (!(session.worldPoints?.length >= 3)) {
      return {
        ok: false,
        code: 'NO_PLANE',
        message: 'Clip needs three world-space plane points.',
      };
    }
    const built = planesByActorIdFromWorldPoints(
      world,
      session.actorIds,
      session.worldPoints,
    );
    if (!built.ok) return built;
    return previewClip(world, {
      actorIds: session.actorIds,
      mode: session.mode,
      planesByActorId: built.planesByActorId,
    });
  }, [world]);

  const setClipSessionMode = useCallback((clipMode) => {
    const cur = clipSessionRef.current;
    if (!cur) return;
    const next = {
      ...cur,
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : 'front',
    };
    if (next.plane || next.worldPoints?.length >= 3) {
      const preview = refreshClipPreview(next);
      next.preview = preview.ok ? preview : null;
    }
    setClipSessionState(next);
    clipSessionRef.current = next;
  }, [refreshClipPreview]);

  const addClipPoint = useCallback((worldPoint, { snap = true } = {}) => {
    if (!world || mode === 'play') return { ok: false };
    const cur = clipSessionRef.current;
    if (!cur) return { ok: false, code: 'NO_SESSION' };
    const g = Math.max(1, gridSize || 25);
    let pt = [
      Number(worldPoint?.[0]) || 0,
      Number(worldPoint?.[1]) || 0,
      Number(worldPoint?.[2]) || 0,
    ];
    if (snap && gridSnap) {
      pt = [snapToGrid(pt[0], g), snapToGrid(pt[1], g), snapToGrid(pt[2], g)];
    }
    const points = [...(cur.points || []), pt].slice(0, 3);
    let next = {
      ...cur,
      points,
      worldPoints: points,
      source: 'points',
      plane: null,
      preview: null,
    };
    if (points.length === 3) {
      // Validate plane against the primary actor; preview re-projects for all.
      const actor = world.getActor(cur.actorIds[0]);
      const local = actor ? worldPointsToLocalPlane(actor, points, world) : { ok: false };
      if (!local.ok) {
        notify(local.message || 'Degenerate clip plane.', { title: 'Clip' });
        setStatus(local.message || 'Degenerate clip plane.');
        next = { ...next, points: [], worldPoints: [], plane: null };
        setClipSessionState(next);
        clipSessionRef.current = next;
        return local;
      }
      next.plane = local.plane;
      const preview = refreshClipPreview(next);
      next.preview = preview.ok ? preview : null;
      if (!preview.ok) {
        notify(preview.message || 'Clip preview failed.', { title: 'Clip' });
      } else {
        setStatus('Clip plane ready — Enter to apply, Esc to cancel.');
      }
    } else {
      setStatus(`Clip: point ${points.length}/3`);
    }
    setClipSessionState(next);
    clipSessionRef.current = next;
    return { ok: true, points: next.points, ready: points.length === 3 };
  }, [world, mode, gridSize, gridSnap, notify, setStatus, refreshClipPreview]);

  const setClipPlaneFromFace = useCallback((actorId, faceId, clipMode) => {
    if (!world || mode === 'play') return { ok: false };
    const planeResult = localPlaneFromSelectedFace(world, actorId, faceId);
    if (!planeResult.ok) {
      notify(planeResult.message, { title: 'Clip' });
      return planeResult;
    }
    const actor = world.getActor(actorId);
    const geom = actor?.getComponent('ConvexBrush')?.geometry
      || (() => {
        const brush = actor?.getComponent('Brush');
        if (!brush) return null;
        const c = convertBrushToConvexGeometry(actor, brush, world);
        return c.ok ? c.geometry : null;
      })();
    const face = geom?.faces?.find((f) => f.id === faceId);
    const vmap = geom ? vertexMap(geom) : null;
    if (!face || !vmap || face.loop.length < 3) {
      const err = {
        ok: false,
        code: 'DEGENERATE_PLANE',
        message: 'Could not build world-space clip plane from face.',
      };
      notify(err.message, { title: 'Clip' });
      return err;
    }
    const worldPoints = [0, 1, 2].map((i) => {
      const lp = vmap.get(face.loop[i]);
      return localPointToWorld(actor, lp, world);
    });
    const actorIds = selectedRef.current.length
      ? [...new Set(selectedRef.current)]
      : [actorId];
    const session = {
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : (clipSessionRef.current?.mode || 'front'),
      actorIds,
      points: worldPoints,
      worldPoints,
      plane: planeResult.plane,
      source: 'face',
      faceActorId: actorId,
      faceId,
      preview: null,
    };
    const preview = refreshClipPreview(session);
    session.preview = preview.ok ? preview : null;
    setClipSessionState(session);
    clipSessionRef.current = session;
    if (!preview.ok) {
      notify(preview.message || 'Clip preview failed.', { title: 'Clip' });
    } else {
      setStatus('Clip by face plane ready — Enter to apply, Esc to cancel.');
    }
    setTool('geometry');
    return { ok: true, preview };
  }, [world, mode, notify, setStatus, setTool, refreshClipPreview]);

  const commitClipSession = useCallback((label) => {
    if (!world || mode === 'play') return { ok: false };
    const cur = clipSessionRef.current;
    if (!cur?.actorIds?.length || !(cur.worldPoints?.length >= 3)) {
      return {
        ok: false,
        code: 'NO_PLANE',
        message: 'Clip plane not defined (need three world points).',
      };
    }
    const built = planesByActorIdFromWorldPoints(world, cur.actorIds, cur.worldPoints);
    if (!built.ok) {
      notify(built.message, { title: 'Clip' });
      return built;
    }
    const planned = planClip(world, {
      actorIds: cur.actorIds,
      mode: cur.mode,
      planesByActorId: built.planesByActorId,
    });
    if (!planned.ok) {
      notify(planned.message, { title: 'Clip' });
      setStatus(planned.message);
      return planned;
    }
    if (label) planned.command.label = label;
    executeCommand(planned.command, { resync: true });
    const touched = [
      ...cur.actorIds,
      ...(planned.newActorIds || []),
    ];
    autoCapturePrefabOverrides(touched);
    setClipSessionState(null);
    clipSessionRef.current = null;
    setStatus(`Clip (${cur.mode}) applied.`);
    return { ok: true, newActorIds: planned.newActorIds || [] };
  }, [world, mode, executeCommand, notify, setStatus, autoCapturePrefabOverrides]);

  return {
    addClipPoint,
    beginClipSession,
    cancelClipSession,
    clearExtrudePreview,
    commitClipSession,
    commitExtrudeFace,
    previewExtrudeFace,
    setClipPlaneFromFace,
    setClipSessionMode,
  };
}
