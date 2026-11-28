// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { snapToGrid } from '../../core/units.js';
import { SetBrushColorCommand, SetBrushMaterialCommand, SetBrushOpeningsCommand } from '../history/commands.js';
import { createDefaultOpening, isWallBrush, normalizeOpenings, validateOpenings } from '../../runtime/wallOpenings.js';
import { validateWorldSubtractComplexity } from '../../runtime/brushGeometry.js';

export function useBrushEditing({
  autoCapturePrefabOverrides,
  commitBrushGeometry,
  executeCommand,
  gridRef,
  isEditorActorLocked,
  mode,
  rejectSubtractIfTooComplex,
  runtimeRef,
  selectedRef,
  setStatus,
  world,
}) {
const updateSelectedBrush = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush) return;
    if (isEditorActorLocked(actor)) {
      // Lock freezes transform / carve shape. Surface dress (materials + UVs +
      // color) stays allowed so locked World Solid can be painted like additive walls.
      const dressOnly = Object.keys(partial).length > 0
        && Object.keys(partial).every((key) => (
          key === 'materialId'
          || key === 'faceMaterials'
          || key === 'faceUVs'
          || key === 'uv'
          || key === 'color'
        ));
      if (!dressOnly) {
        setStatus('Cannot edit brush: actor or authoring layer is locked.');
        return;
      }
    }

    if (partial.size) {
      const before = {
        size: { ...brush.size },
        position: { ...actor.transform.position },
      };
      const afterSize = { ...brush.size, ...partial.size };
      for (const key of ['x', 'y', 'z']) {
        if (afterSize[key] != null) {
          afterSize[key] = Math.max(gridRef.current, snapToGrid(afterSize[key], gridRef.current));
        }
      }
      const after = {
        size: afterSize,
        position: { ...actor.transform.position },
      };
      commitBrushGeometry([{ actorId, before, after }], 'Edit size');
      if (brush.openings?.length) {
        const prevOpenings = normalizeOpenings(brush.openings);
        const { openings: nextOpenings } = validateOpenings(afterSize, prevOpenings, {
          snap: gridRef.current,
        });
        if (JSON.stringify(prevOpenings) !== JSON.stringify(nextOpenings)) {
          executeCommand(
            new SetBrushOpeningsCommand({
              world,
              actorId,
              before: prevOpenings,
              after: nextOpenings,
              label: 'Clamp openings',
            }),
            { resync: true },
          );
          autoCapturePrefabOverrides([actorId]);
        }
      }
      return;
    }

    if (partial.color != null && Object.keys(partial).length === 1) {
      executeCommand(
        new SetBrushColorCommand({
          world,
          actorId,
          before: brush.color,
          after: partial.color,
        }),
        { resync: true },
      );
      autoCapturePrefabOverrides([actorId]);
      return;
    }

    if (partial.operation != null && Object.keys(partial).length === 1) {
      const nextOp = partial.operation === 'subtract' ? 'subtract' : 'add';
      if (brush.operation === nextOp) return;
      const before = {
        operation: brush.operation === 'subtract' ? 'subtract' : 'add',
        collidable: brush.collidable,
        color: brush.color,
      };
      const after = {
        operation: nextOp,
        collidable: nextOp === 'subtract' ? false : brush.collidable !== false,
        color: nextOp === 'subtract' && brush.color === '#8a9099' ? '#c23b4a' : brush.color,
      };
      const cmd = new SetBrushMaterialCommand({
        world,
        actorId,
        before,
        after,
        label: nextOp === 'subtract' ? 'Set subtractive' : 'Set additive',
      });
      cmd.do();
      if (rejectSubtractIfTooComplex(validateWorldSubtractComplexity(world))) {
        cmd.undo();
        runtimeRef.current?.resyncWorld();
        return;
      }
      cmd.undo();
      executeCommand(cmd, { resync: true });
      autoCapturePrefabOverrides([actorId]);
      return;
    }

    const before = {};
    const after = {};
    for (const key of ['materialId', 'faceMaterials', 'faceUVs', 'uv', 'color', 'collidable', 'operation', 'miterStart', 'miterEnd']) {
      if (key in partial) {
        before[key] = key === 'uv'
          ? {
            scale: { ...brush.uv.scale },
            offset: { ...brush.uv.offset },
            rotation: brush.uv.rotation,
          }
          : key === 'faceMaterials'
            ? (brush.faceMaterials ? { ...brush.faceMaterials } : null)
            : key === 'faceUVs'
              ? (brush.faceUVs ? structuredClone(brush.faceUVs) : null)
              : brush[key];
        after[key] = key === 'operation'
          ? (partial.operation === 'subtract' ? 'subtract' : 'add')
          : partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    if ('operation' in after && after.operation === 'subtract') {
      after.collidable = false;
      before.collidable = brush.collidable;
    }
    const matCmd = new SetBrushMaterialCommand({
      world,
      actorId,
      before,
      after,
      label: partial.materialId !== undefined
        ? 'Assign material'
        : partial.faceUVs !== undefined
          ? 'Edit surface UV'
          : partial.operation !== undefined
            ? (after.operation === 'subtract' ? 'Set subtractive' : 'Set additive')
            : 'Edit brush material',
    });
    matCmd.do();
    if (rejectSubtractIfTooComplex(validateWorldSubtractComplexity(world))) {
      matCmd.undo();
      runtimeRef.current?.resyncWorld();
      return;
    }
    matCmd.undo();
    executeCommand(matCmd, { resync: true });
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, commitBrushGeometry, executeCommand, autoCapturePrefabOverrides, rejectSubtractIfTooComplex]);

  const setSelectedBrushOpenings = useCallback((nextOpenings, label = 'Edit openings') => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush || !isWallBrush(actor)) return;
    const before = normalizeOpenings(brush.openings);
    const { openings: after } = validateOpenings(brush.size, nextOpenings, {
      snap: gridRef.current,
    });
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const openCmd = new SetBrushOpeningsCommand({ world, actorId, before, after, label });
    openCmd.do();
    if (rejectSubtractIfTooComplex(validateWorldSubtractComplexity(world))) {
      openCmd.undo();
      runtimeRef.current?.resyncWorld();
      return;
    }
    openCmd.undo();
    executeCommand(openCmd, { resync: true });
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides, rejectSubtractIfTooComplex]);

  const addBrushOpening = useCallback((type = 'door') => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const brush = actor?.getComponent('Brush');
    if (!brush || !isWallBrush(actor)) return;
    const opening = createDefaultOpening(type);
    setSelectedBrushOpenings([...(brush.openings || []), opening], `Add ${type}`);
  }, [world, mode, setSelectedBrushOpenings]);

  const updateBrushOpening = useCallback((openingId, partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const brush = actor?.getComponent('Brush');
    if (!brush) return;
    const next = normalizeOpenings(brush.openings).map((o) => (
      o.id === openingId ? { ...o, ...partial, id: o.id } : o
    ));
    setSelectedBrushOpenings(next, 'Edit opening');
  }, [world, mode, setSelectedBrushOpenings]);

  const removeBrushOpening = useCallback((openingId) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const brush = actor?.getComponent('Brush');
    if (!brush) return;
    setSelectedBrushOpenings(
      normalizeOpenings(brush.openings).filter((o) => o.id !== openingId),
      'Remove opening',
    );
  }, [world, mode, setSelectedBrushOpenings]);

  return {
    addBrushOpening,
    removeBrushOpening,
    setSelectedBrushOpenings,
    updateBrushOpening,
    updateSelectedBrush,
  };
}
