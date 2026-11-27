// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback, useEffect } from 'react';
import { ConvertBrushToConvexCommand, SetConvexBrushPropertiesCommand } from '../history/commands.js';
import { emptyGeometrySelection, normalizeGeometrySelection, toolKeepsGeometrySelection } from '../geometryEditing/geometrySelection.js';
import { convertBrushToConvexGeometry } from '../../geometry/convert.js';
import { ConvexBrushComponent } from '../../components/ConvexBrushComponent.js';
import { canConvertActorToConvex } from '../../rules/convexBrushRules.js';
import { computeAlignFaceUv } from '../../rules/alignSurfaces.js';
import { toolKeepsSurfaceSelection } from '../surfaceSelection.js';

export function useSurfaceAndGeometryModes({
  alignReferenceSurface,
  autoCapturePrefabOverrides,
  clearGeometrySelectionState,
  clearSelectedSurfaceState,
  executeCommand,
  geometryMode,
  geometrySelectionRef,
  isEditorActorLocked,
  mode,
  notify,
  runtimeRef,
  selectedRef,
  setAlignReferenceSurfaceState,
  setGeometryModeState,
  setGeometrySelectionState,
  setSelectedActorIds,
  setSelectedSurfaceState,
  setStatus,
  syncGeometrySelectionVisual,
  syncSelectionVisual,
  tool,
  updateSelectedBrush,
  world,
}) {
const setSelectedSurface = useCallback((next) => {
    const normalized = next?.actorId && next?.surfaceId
      ? { actorId: next.actorId, surfaceId: next.surfaceId }
      : null;
    setSelectedSurfaceState(normalized);
    runtimeRef.current?.sceneView?.setSurfaceSelection?.(normalized);
  }, []);

  const setAlignReferenceSurface = useCallback((next) => {
    const normalized = next?.actorId && next?.surfaceId
      ? { actorId: next.actorId, surfaceId: next.surfaceId }
      : null;
    setAlignReferenceSurfaceState(normalized);
    runtimeRef.current?.sceneView?.setAlignReferenceSurface?.(normalized);
  }, []);

  useEffect(() => {
    if (tool !== 'align') {
      setAlignReferenceSurface(null);
    }
  }, [tool, setAlignReferenceSurface]);

  // Leaving Surface / Align drops the surface pick so Select-mode material
  // assigns never hit a leftover face override.
  useEffect(() => {
    if (toolKeepsSurfaceSelection(tool)) return;
    clearSelectedSurfaceState();
  }, [tool, clearSelectedSurfaceState]);

  // Leaving Geometry tool clears element selection.
  useEffect(() => {
    if (toolKeepsGeometrySelection(tool)) return;
    clearGeometrySelectionState();
  }, [tool, clearGeometrySelectionState]);

  const setGeometryMode = useCallback((mode) => {
    const next = mode === 'edge' || mode === 'vertex' ? mode : 'face';
    setGeometryModeState(next);
    // Mode change clears ids (different kind) per transition table.
    const empty = emptyGeometrySelection(next);
    setGeometrySelectionState(empty);
    geometrySelectionRef.current = empty;
    syncGeometrySelectionVisual(empty);
  }, [syncGeometrySelectionVisual]);

  const setGeometrySelection = useCallback((next) => {
    const normalized = normalizeGeometrySelection(
      next,
      geometrySelectionRef.current?.mode || geometryMode,
    );
    setGeometrySelectionState(normalized);
    geometrySelectionRef.current = normalized;
    // Ensure actors for selected faces stay in the actor selection set.
    if (normalized.items.length) {
      const ids = normalized.items.map((it) => it.actorId);
      const set = new Set(selectedRef.current);
      let changed = false;
      for (const id of ids) {
        if (!set.has(id)) {
          set.add(id);
          changed = true;
        }
      }
      if (changed) {
        const nextIds = [...set];
        setSelectedActorIds(nextIds);
        syncSelectionVisual(nextIds);
      }
    }
    syncGeometrySelectionVisual(normalized);
  }, [geometryMode, syncGeometrySelectionVisual, syncSelectionVisual]);

  /**
   * Align target surface UV to the current Align reference.
   * Only mutates target faceUVs. Returns { ok, reason }.
   */
  const alignSurfaceToReference = useCallback((target) => {
    if (!world || mode === 'play' || !alignReferenceSurface || !target) {
      return { ok: false, reason: 'Select a reference surface first.' };
    }
    const result = computeAlignFaceUv(world, alignReferenceSurface, target);
    if (!result.ok) {
      setStatus(result.reason || 'Align failed.');
      return result;
    }
    const actor = world.getActor(target.actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush) {
      return { ok: false, reason: 'Target is not a Brush surface.' };
    }
    // Select target so updateSelectedBrush addresses the right actor.
    selectedRef.current = [target.actorId];
    setSelectedActorIds([target.actorId]);
    updateSelectedBrush({ faceUVs: result.faceUVs });
    setSelectedSurface({ actorId: target.actorId, surfaceId: target.surfaceId });
    setStatus(`Aligned ${target.surfaceId} to ${alignReferenceSurface.surfaceId}.`);
    return { ok: true };
  }, [
    world,
    mode,
    alignReferenceSurface,
    updateSelectedBrush,
    setSelectedSurface,
  ]);

  const updateSelectedConvexBrush = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (isEditorActorLocked(actor)) {
      setStatus('Cannot edit convex brush: actor or authoring layer is locked.');
      return;
    }
    const convex = actor?.getComponent('ConvexBrush');
    if (!convex) return;
    const before = {
      materialId: convex.materialId,
      faceMaterials: convex.faceMaterials ? { ...convex.faceMaterials } : null,
      faceUVs: convex.faceUVs ? structuredClone(convex.faceUVs) : null,
      uv: structuredClone(convex.uv),
      color: convex.color,
      collidable: convex.collidable,
    };
    const after = { ...before, ...partial };
    if (partial.uv) {
      after.uv = {
        scale: { ...before.uv.scale, ...(partial.uv.scale || {}) },
        offset: { ...before.uv.offset, ...(partial.uv.offset || {}) },
        rotation: partial.uv.rotation ?? before.uv.rotation,
      };
    }
    executeCommand(
      new SetConvexBrushPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: 'Edit ConvexBrush',
      }),
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  /**
   * Convert a specific Brush actor to ConvexBrush (undoable).
   * Used by Details and by Geometry Face/Edge/Vertex auto-convert-on-edit.
   */
  const convertActorToConvexBrush = useCallback((actorId, {
    notifyOnFail = true,
  } = {}) => {
    if (!world || mode === 'play' || !actorId) return { ok: false, code: 'NO_ACTOR' };
    const actor = world.getActor(actorId);
    const eligibility = canConvertActorToConvex(actor, world);
    if (!eligibility.ok) {
      if (notifyOnFail) {
        notify(eligibility.message, { title: 'Convert to Convex Brush' });
      }
      return { ok: false, code: eligibility.code, message: eligibility.message };
    }
    const brush = actor.getComponent('Brush');
    const converted = convertBrushToConvexGeometry(actor, brush, world);
    if (!converted.ok) {
      if (notifyOnFail) {
        notify(converted.message, { title: 'Convert to Convex Brush' });
      }
      return { ok: false, code: converted.code, message: converted.message };
    }
    const convex = new ConvexBrushComponent({
      id: brush.id,
      color: brush.color,
      collidable: brush.collidable !== false,
      materialId: brush.materialId,
      faceMaterials: converted.faceMaterials,
      faceUVs: converted.faceUVs,
      uv: brush.uv,
      geometry: converted.geometry,
      provenance: converted.provenance,
    });
    if (!convex.isValid) {
      const message = convex.geometryError?.message || 'Converted geometry is invalid.';
      if (notifyOnFail) {
        notify(message, { title: 'Convert to Convex Brush' });
      }
      return { ok: false, code: 'INVALID', message };
    }
    executeCommand(
      new ConvertBrushToConvexCommand({
        world,
        actorId,
        brushJson: brush.toJSON(),
        convexJson: convex.toJSON(),
      }),
    );
    autoCapturePrefabOverrides([actorId]);
    return { ok: true, actorId };
  }, [world, mode, executeCommand, notify, autoCapturePrefabOverrides]);

  const convertSelectedToConvexBrush = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return false;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    return Boolean(convertActorToConvexBrush(actorId).ok);
  }, [world, mode, convertActorToConvexBrush]);

  return {
    alignSurfaceToReference,
    convertActorToConvexBrush,
    convertSelectedToConvexBrush,
    setAlignReferenceSurface,
    setGeometryMode,
    setGeometrySelection,
    setSelectedSurface,
    updateSelectedConvexBrush,
  };
}
