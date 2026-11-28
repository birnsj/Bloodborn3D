// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { computeFitSurfaceUv, structuralFaceSizeEditorUnits } from '../../rules/faceUvFit.js';
import { getStructuralComponent, patchFaceMaterial, patchFaceUv, resolveSurfaceMaterialId } from '../../runtime/surfaces.js';
import { shouldApplyMaterialToSurface } from '../surfaceSelection.js';

export function useSurfaceMaterials({
  mode,
  selectedRef,
  selectedSurface,
  setSelectedActorIds,
  syncSelectionVisual,
  tool,
  updateSelectedArch,
  updateSelectedBrush,
  updateSelectedColumn,
  updateSelectedConvexBrush,
  updateSelectedCurvedWall,
  updateSelectedRamp,
  updateSelectedStair,
  world,
}) {
/**
   * Assign a material to a surface face. Pass `surface` to target a pick directly
   * (e.g. material drag-drop onto a poly) without waiting on React state.
   */
  const assignSelectedSurfaceMaterial = useCallback((materialId, surface = null) => {
    const target = surface?.actorId && surface?.surfaceId ? surface : selectedSurface;
    if (!world || mode === 'play' || !target) return;
    // updateSelected* reads selectedRef — keep it aligned with the target actor.
    if (!selectedRef.current.includes(target.actorId)) {
      selectedRef.current = [target.actorId];
      setSelectedActorIds([target.actorId]);
      syncSelectionVisual([target.actorId]);
    }
    const actor = world.getActor(target.actorId);
    if (!actor) return;
    // Actor lock blocks transforms, not per-face materials (subtractive World Solid
    // is locked by design but must still accept material drag / Face Texture).
    const brush = actor.getComponent('Brush');
    const convex = actor.getComponent('ConvexBrush');
    const ramp = actor.getComponent('Ramp');
    const stair = actor.getComponent('Stair');
    const column = actor.getComponent('Column');
    const arch = actor.getComponent('Arch');
    const curved = actor.getComponent('CurvedWall');
    // Scratch patch via surfaces helpers so history snapshots stay normalized.
    const patchFace = (comp, updateFn) => {
      const scratch = {
        type: comp.type,
        geometry: comp.geometry,
        faceMaterials: comp.faceMaterials ? { ...comp.faceMaterials } : null,
      };
      const result = patchFaceMaterial(scratch, target.surfaceId, materialId || null);
      if (!result) return;
      updateFn({ faceMaterials: result.after });
    };
    if (brush) patchFace(brush, updateSelectedBrush);
    else if (convex) patchFace(convex, updateSelectedConvexBrush);
    else if (ramp) patchFace(ramp, updateSelectedRamp);
    else if (stair) patchFace(stair, updateSelectedStair);
    else if (column) patchFace(column, updateSelectedColumn);
    else if (arch) patchFace(arch, updateSelectedArch);
    else if (curved) patchFace(curved, updateSelectedCurvedWall);
  }, [
    world,
    mode,
    selectedSurface,
    syncSelectionVisual,
    updateSelectedBrush,
    updateSelectedConvexBrush,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
  ]);

  const resolveSurfaceTarget = useCallback((surfaceTarget = null) => {
    const target = surfaceTarget?.actorId && surfaceTarget?.surfaceId
      ? surfaceTarget
      : selectedSurface;
    if (!target?.actorId || !target?.surfaceId) return null;
    return target;
  }, [selectedSurface]);

  const assignSelectedSurfaceUv = useCallback((uvPartial, surfaceTarget = null) => {
    if (!world || mode === 'play') return;
    const target = resolveSurfaceTarget(surfaceTarget);
    if (!target) return;
    const actor = world.getActor(target.actorId);
    if (!actor) return;
    const brush = actor.getComponent('Brush');
    const convex = actor.getComponent('ConvexBrush');
    const ramp = actor.getComponent('Ramp');
    const stair = actor.getComponent('Stair');
    const column = actor.getComponent('Column');
    const arch = actor.getComponent('Arch');
    const curved = actor.getComponent('CurvedWall');
    const patchUv = (comp, updateFn) => {
      const sid = target.surfaceId;
      const current = comp.faceUVs?.[sid] || {
        scale: { x: 1, y: 1 },
        offset: { x: 0, y: 0 },
        rotation: 0,
      };
      const nextUv = {
        scale: {
          x: uvPartial?.scale?.x ?? current.scale.x,
          y: uvPartial?.scale?.y ?? current.scale.y,
        },
        offset: {
          x: uvPartial?.offset?.x ?? current.offset.x,
          y: uvPartial?.offset?.y ?? current.offset.y,
        },
        rotation: uvPartial?.rotation ?? current.rotation,
      };
      const scratch = {
        type: comp.type,
        geometry: comp.geometry,
        faceUVs: comp.faceUVs ? structuredClone(comp.faceUVs) : null,
      };
      const result = patchFaceUv(scratch, sid, nextUv);
      if (!result) return;
      // update*Brush helpers read selectedRef — pin the face's actor for this write.
      const prevSel = selectedRef.current;
      selectedRef.current = [target.actorId];
      try {
        updateFn({ faceUVs: result.after });
      } finally {
        selectedRef.current = prevSel;
      }
    };
    if (brush) patchUv(brush, updateSelectedBrush);
    else if (convex) patchUv(convex, updateSelectedConvexBrush);
    else if (ramp) patchUv(ramp, updateSelectedRamp);
    else if (stair) patchUv(stair, updateSelectedStair);
    else if (column) patchUv(column, updateSelectedColumn);
    else if (arch) patchUv(arch, updateSelectedArch);
    else if (curved) patchUv(curved, updateSelectedCurvedWall);
  }, [
    world,
    mode,
    resolveSurfaceTarget,
    updateSelectedBrush,
    updateSelectedConvexBrush,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
  ]);

  const resetSelectedSurfaceUv = useCallback((surfaceTarget = null) => {
    if (!world || mode === 'play') return;
    const target = resolveSurfaceTarget(surfaceTarget);
    if (!target) return;
    const actor = world.getActor(target.actorId);
    if (!actor) return;
    const brush = actor.getComponent('Brush');
    const convex = actor.getComponent('ConvexBrush');
    const ramp = actor.getComponent('Ramp');
    const stair = actor.getComponent('Stair');
    const column = actor.getComponent('Column');
    const arch = actor.getComponent('Arch');
    const curved = actor.getComponent('CurvedWall');
    const clearUv = (comp, updateFn) => {
      if (!comp.faceUVs?.[target.surfaceId]) return;
      const next = { ...(comp.faceUVs || {}) };
      delete next[target.surfaceId];
      const prevSel = selectedRef.current;
      selectedRef.current = [target.actorId];
      try {
        updateFn({
          faceUVs: Object.keys(next).length ? structuredClone(next) : null,
        });
      } finally {
        selectedRef.current = prevSel;
      }
    };
    if (brush) clearUv(brush, updateSelectedBrush);
    else if (convex) clearUv(convex, updateSelectedConvexBrush);
    else if (ramp) clearUv(ramp, updateSelectedRamp);
    else if (stair) clearUv(stair, updateSelectedStair);
    else if (column) clearUv(column, updateSelectedColumn);
    else if (arch) clearUv(arch, updateSelectedArch);
    else if (curved) clearUv(curved, updateSelectedCurvedWall);
  }, [
    world,
    mode,
    resolveSurfaceTarget,
    updateSelectedBrush,
    updateSelectedConvexBrush,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
  ]);

  /**
   * Fit face UV so one material texture spans U, V, or both.
   * @param {{ axis?: 'u'|'v'|'both', materialUvScale?: {x:number,y:number}, surfaceTarget?: {actorId:string,surfaceId:string} }} [opts]
   * @returns {boolean}
   */
  const fitSelectedSurfaceUv = useCallback((opts = {}) => {
    if (!world || mode === 'play') return false;
    const target = resolveSurfaceTarget(opts.surfaceTarget);
    if (!target) return false;
    const actor = world.getActor(target.actorId);
    if (!actor) return false;
    const comp = getStructuralComponent(actor);
    if (!comp) return false;
    const faceSizeEu = structuralFaceSizeEditorUnits(comp, target.surfaceId);
    if (!faceSizeEu) return false;
    const fitted = computeFitSurfaceUv({
      faceSizeEu,
      actorUv: comp.uv,
      materialUvScale: opts.materialUvScale,
      axis: opts.axis || 'both',
      currentSurfaceUv: comp.faceUVs?.[target.surfaceId],
    });
    if (!fitted) return false;
    assignSelectedSurfaceUv(fitted, target);
    return true;
  }, [world, mode, resolveSurfaceTarget, assignSelectedSurfaceUv]);

  /** True when Fit Horizontal / Vertical can measure the selected face. */
  const canFitSelectedSurfaceUv = useCallback((surfaceTarget = null) => {
    if (!world) return false;
    const target = resolveSurfaceTarget(surfaceTarget);
    if (!target) return false;
    const actor = world.getActor(target.actorId);
    const comp = getStructuralComponent(actor);
    return Boolean(structuralFaceSizeEditorUnits(comp, target.surfaceId));
  }, [world, resolveSurfaceTarget]);

  /** Resolve material asset id for the selected surface (face override or actor). */
  const getSelectedSurfaceMaterialId = useCallback((surfaceTarget = null) => {
    if (!world) return null;
    const target = resolveSurfaceTarget(surfaceTarget);
    if (!target) return null;
    const actor = world.getActor(target.actorId);
    const comp = getStructuralComponent(actor);
    if (!comp) return null;
    return resolveSurfaceMaterialId(comp, target.surfaceId);
  }, [world, resolveSurfaceTarget]);

  const applySelectedMaterialToBrush = useCallback((materialId) => {
    if (!materialId) return;
    // Surface redirect only while Surface tool is active with a live pick.
    // Stale selectedSurface (e.g. after load / leave Surface) must not steal actor assigns.
    if (shouldApplyMaterialToSurface({
      tool,
      selectedSurface,
      selectedActorIds: selectedRef.current,
      world,
    })) {
      assignSelectedSurfaceMaterial(materialId);
      return;
    }
    if (!world || selectedRef.current.length === 0) {
      updateSelectedBrush({ materialId });
      return;
    }
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    if (actor?.getComponent('ConvexBrush')) {
      updateSelectedConvexBrush({ materialId });
      return;
    }
    if (actor?.getComponent('Ramp')) {
      updateSelectedRamp({ materialId });
      return;
    }
    if (actor?.getComponent('Stair')) {
      updateSelectedStair({ materialId });
      return;
    }
    if (actor?.getComponent('Column')) {
      updateSelectedColumn({ materialId });
      return;
    }
    if (actor?.getComponent('Arch')) {
      updateSelectedArch({ materialId });
      return;
    }
    if (actor?.getComponent('CurvedWall')) {
      updateSelectedCurvedWall({ materialId });
      return;
    }
    updateSelectedBrush({ materialId });
  }, [
    world,
    tool,
    selectedSurface,
    assignSelectedSurfaceMaterial,
    updateSelectedBrush,
    updateSelectedConvexBrush,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
  ]);

  return {
    applySelectedMaterialToBrush,
    assignSelectedSurfaceMaterial,
    assignSelectedSurfaceUv,
    canFitSelectedSurfaceUv,
    fitSelectedSurfaceUv,
    getSelectedSurfaceMaterialId,
    resetSelectedSurfaceUv,
  };
}
