// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { snapToGrid } from '../../core/units.js';
import { getBrushSnapSize, snapCenterByEdges } from '../gridSnap.js';
import { AddActorsCommand, SetTransformsCommand, SetPivotCommand, SetBrushGeometryCommand, SetBrushOpeningsCommand, ReparentActorsCommand, SetActorFlagsCommand, SetConvexGeometryCommand, CompositeCommand } from '../history/commands.js';
import { stampAuthoringLayer } from '../authoringLayerStamp.js';
import { partitionEditableActorIds, lockedLayerFeedback } from '../authoringLayerGuards.js';
import { applyGeometryMove, captureGeometryMoveStart, snapWorldDelta } from '../geometryEditing/faceMove.js';
import { applyPivotPreset, actorSupportsPivotEdit } from '../../rules/pivotEdit.js';
import { applyActorLocalPivotDelta, normalizeContentOffset, snapshotPivotState } from '../../core/contentOffset.js';
import { createCellActor } from '../cellFactory.js';
import { getWorldTransform, reparentActor, setWorldTransform } from '../../core/hierarchy.js';
import { normalizeOpenings, validateOpenings } from '../../runtime/wallOpenings.js';
import { validateWorldSubtractComplexity } from '../../runtime/brushGeometry.js';

export function useTransformEditing({
  assetResolver,
  autoCapturePrefabOverrides,
  buildPrefabOverrideCommands,
  executeCommand,
  faceMovePreviewRef,
  geometrySelectionRef,
  gridRef,
  gridSnapRef,
  isEditorActorLocked,
  layerUiRef,
  mode,
  rejectIfActiveLayerLocked,
  rejectSubtractIfTooComplex,
  runtimeRef,
  selectedRef,
  setDirty,
  setStatus,
  syncGeometrySelectionVisual,
  world,
}) {
const commitTransforms = useCallback((changes, label = 'Move') => {
    if (!world || mode === 'play' || !changes?.length) return;
    const meaningful = changes.filter((c) =>
      JSON.stringify(c.before) !== JSON.stringify(c.after),
    );
    if (!meaningful.length) return;
    // Ensure proposed transforms are active (gizmo preview may already be there).
    for (const c of meaningful) {
      const actor = world.getActor(c.actorId);
      if (actor) actor.transform.copyFrom(c.after);
    }
    const complexity = validateWorldSubtractComplexity(world);
    if (rejectSubtractIfTooComplex(complexity)) {
      for (const c of meaningful) {
        const actor = world.getActor(c.actorId);
        if (actor) actor.transform.copyFrom(c.before);
      }
      runtimeRef.current?.resyncWorld();
      runtimeRef.current?.setSelection(selectedRef.current);
      return;
    }
    const transformCmd = new SetTransformsCommand({ world, changes: meaningful, label });
    const overrideCmds = buildPrefabOverrideCommands(meaningful.map((c) => c.actorId));
    executeCommand(
      overrideCmds.length
        ? new CompositeCommand({ commands: [transformCmd, ...overrideCmds], label })
        : transformCmd,
      { resync: false },
    );
    for (const c of meaningful) {
      const actor = world.getActor(c.actorId);
      if (actor) runtimeRef.current?.refreshBrushCarveDependents(actor);
    }
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode, executeCommand, buildPrefabOverrideCommands, rejectSubtractIfTooComplex]);

  const commitPivotChanges = useCallback((changes, label = 'Edit pivot') => {
    if (!world || mode === 'play' || !changes?.length) return;
    const meaningful = changes.filter((c) =>
      JSON.stringify(c.before) !== JSON.stringify(c.after),
    );
    if (!meaningful.length) return;
    for (const c of meaningful) {
      const actor = world.getActor(c.after.actorId);
      if (!actor) continue;
      actor.transform.copyFrom(c.after.transform);
      actor.contentOffset = { ...c.after.contentOffset };
      for (const row of c.after.children || []) {
        const child = world.getActor(row.actorId);
        if (child) child.transform.copyFrom(row.transform);
      }
    }
    const complexity = validateWorldSubtractComplexity(world);
    if (rejectSubtractIfTooComplex(complexity)) {
      for (const c of meaningful) {
        const actor = world.getActor(c.before.actorId);
        if (!actor) continue;
        actor.transform.copyFrom(c.before.transform);
        actor.contentOffset = { ...c.before.contentOffset };
        for (const row of c.before.children || []) {
          const child = world.getActor(row.actorId);
          if (child) child.transform.copyFrom(row.transform);
        }
      }
      runtimeRef.current?.resyncWorld();
      runtimeRef.current?.setSelection(selectedRef.current);
      return;
    }
    const pivotCmd = new SetPivotCommand({ world, changes: meaningful, label });
    const ids = meaningful.map((c) => c.after.actorId);
    const overrideCmds = buildPrefabOverrideCommands(ids);
    executeCommand(
      overrideCmds.length
        ? new CompositeCommand({ commands: [pivotCmd, ...overrideCmds], label })
        : pivotCmd,
      { resync: true },
    );
    setDirty(true);
  }, [world, mode, executeCommand, buildPrefabOverrideCommands, rejectSubtractIfTooComplex]);

  const commitBrushGeometry = useCallback((changes, label = 'Resize') => {
    if (!world || mode === 'play' || !changes?.length) return;
    const meaningful = changes.filter((c) =>
      JSON.stringify(c.before) !== JSON.stringify(c.after),
    );
    if (!meaningful.length) return;

    const applyGeom = (key) => {
      for (const c of meaningful) {
        const actor = world.getActor(c.actorId);
        const brush = actor?.getComponent('Brush');
        if (!brush) continue;
        const state = c[key];
        brush.size = { ...state.size };
        if (state.position) {
          actor.transform.position = { ...state.position };
        }
      }
    };

    // Ensure world is at proposed geometry (Details edits may still be at before).
    applyGeom('after');
    const complexity = validateWorldSubtractComplexity(world);
    if (rejectSubtractIfTooComplex(complexity)) {
      applyGeom('before');
      runtimeRef.current?.resyncWorld();
      runtimeRef.current?.setSelection(selectedRef.current);
      return;
    }

    const geomCmd = new SetBrushGeometryCommand({ world, changes: meaningful, label });
    const overrideCmds = buildPrefabOverrideCommands(meaningful.map((c) => c.actorId));
    executeCommand(
      overrideCmds.length
        ? new CompositeCommand({ commands: [geomCmd, ...overrideCmds], label })
        : geomCmd,
      { resync: true },
    );
    // Keep openings inside the new bounds after gizmo / numeric resize.
    for (const c of meaningful) {
      const actor = world.getActor(c.actorId);
      const brush = actor?.getComponent('Brush');
      if (!brush?.openings?.length) continue;
      const prevOpenings = normalizeOpenings(brush.openings);
      const { openings: nextOpenings } = validateOpenings(brush.size, prevOpenings, {
        snap: gridRef.current,
      });
      if (JSON.stringify(prevOpenings) !== JSON.stringify(nextOpenings)) {
        const openCmd = new SetBrushOpeningsCommand({
          world,
          actorId: c.actorId,
          before: prevOpenings,
          after: nextOpenings,
          label: 'Clamp openings',
        });
        openCmd.do();
        const openCheck = validateWorldSubtractComplexity(world);
        if (rejectSubtractIfTooComplex(openCheck)) {
          openCmd.undo();
          runtimeRef.current?.resyncWorld();
          continue;
        }
        openCmd.undo();
        executeCommand(openCmd, { resync: true });
      }
    }
  }, [world, mode, executeCommand, buildPrefabOverrideCommands, rejectSubtractIfTooComplex]);

  /**
   * Live world-position update during gizmo drag (no history until commit).
   * updates: [{ actorId, position }] where position is WORLD editor units.
   */
  const previewActorPositions = useCallback((updates) => {
    if (!world || mode === 'play') return;
    const restore = [];
    let touchedBrush = false;
    for (const u of updates) {
      const actor = world.getActor(u.actorId);
      if (!actor || isEditorActorLocked(actor)) continue;
      const pos = u.position;
      if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y) || !Number.isFinite(pos?.z)) {
        continue;
      }
      const current = getWorldTransform(actor, world);
      restore.push({
        actor,
        worldTransform: structuredClone(current),
      });
      setWorldTransform(actor, {
        ...current,
        position: { ...pos },
      }, world);
      if (actor.getComponent?.('Brush')) touchedBrush = true;
    }
    // Subtract complexity only changes when brushes move; skip for lights/props.
    if (touchedBrush && !validateWorldSubtractComplexity(world).ok) {
      for (const r of restore) {
        setWorldTransform(r.actor, r.worldTransform, world);
      }
    }
    for (const r of restore) {
      const brush = r.actor.getComponent?.('Brush');
      if (brush) {
        runtimeRef.current?.refreshBrushCarveDependents(r.actor);
      } else {
        // Lights / props: always push the Three.js group so markers & illumination follow.
        runtimeRef.current?.refreshActor(r.actor);
      }
    }
    // No React bump during drag — Details refreshes on commit.
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode]);

  /**
   * Live local rotation/scale preview during gizmo drag (no history until commit).
   * updates: [{ actorId, rotation?, scale? }]
   */
  const previewActorLocalTransforms = useCallback((updates) => {
    if (!world || mode === 'play') return;
    for (const u of updates) {
      const actor = world.getActor(u.actorId);
      if (!actor || isEditorActorLocked(actor)) continue;
      if (u.rotation) {
        actor.transform.rotation = {
          x: Number(u.rotation.x) || 0,
          y: Number(u.rotation.y) || 0,
          z: Number(u.rotation.z) || 0,
        };
      }
      if (u.scale) {
        actor.transform.scale = {
          x: Math.max(0.01, Number(u.scale.x) || 1),
          y: Math.max(0.01, Number(u.scale.y) || 1),
          z: Math.max(0.01, Number(u.scale.z) || 1),
        };
      }
      runtimeRef.current?.refreshBrushCarveDependents(actor);
    }
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode]);

  const previewBrushGeometry = useCallback((actorId, size, worldPosition) => {
    if (!world || mode === 'play') return;
    const actor = world.getActor(actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush || isEditorActorLocked(actor)) return;
    if (
      !Number.isFinite(worldPosition?.x)
      || !Number.isFinite(worldPosition?.y)
      || !Number.isFinite(worldPosition?.z)
      || !Number.isFinite(size?.x)
      || !Number.isFinite(size?.y)
      || !Number.isFinite(size?.z)
    ) {
      return;
    }
    const prevSize = { ...brush.size };
    const prevWorld = structuredClone(getWorldTransform(actor, world));
    const nextSize = {
      x: Math.max(1, Number(size.x)),
      y: Math.max(1, Number(size.y)),
      z: Math.max(1, Number(size.z)),
    };
    brush.size = nextSize;
    setWorldTransform(actor, {
      ...prevWorld,
      position: { ...worldPosition },
    }, world);
    if (!validateWorldSubtractComplexity(world).ok) {
      brush.size = prevSize;
      setWorldTransform(actor, prevWorld, world);
    }
    runtimeRef.current?.refreshBrushCarveDependents(actor);
    // No React bump during drag — avoids remount/churn while meshes rebuild.
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode]);

  /**
   * Live ConvexBrush geometry preview during face-move drag (no history until commit).
   * Mutates components in place; commitFaceMove wraps the same result in one undo step.
   */
  const previewFaceMove = useCallback((constraint, rawDeltaEditor, options = {}) => {
    if (!world || mode === 'play') return { ok: false, code: 'NO_WORLD' };
    const sel = geometrySelectionRef.current;
    const start = faceMovePreviewRef.current?.start;
    if (!start?.length || !sel?.items?.length) {
      return { ok: false, code: 'NO_DRAG' };
    }

    // Restore start geometry before evaluating the new sample.
    for (const s of start) {
      const actor = world.getActor(s.actorId);
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex) continue;
      convex.geometry = structuredClone(s.before.geometry);
      convex.faceMaterials = s.before.faceMaterials
        ? structuredClone(s.before.faceMaterials)
        : null;
      convex.faceUVs = s.before.faceUVs ? structuredClone(s.before.faceUVs) : null;
    }

    const worldDir = options.worldDir || null;
    const snap = snapWorldDelta(
      world,
      sel,
      constraint,
      rawDeltaEditor,
      worldDir,
      options.gridSize ?? gridRef.current,
      options.snapEnabled ?? gridSnapRef.current,
      options.hintLocal || null,
    );

    const result = applyGeometryMove(world, sel, snap.worldDelta);
    if (!result.ok) {
      // Keep last valid preview on the brushes; restore start if none yet.
      const last = faceMovePreviewRef.current?.lastValid;
      if (last?.length) {
        for (const c of last) {
          const actor = world.getActor(c.actorId);
          const convex = actor?.getComponent?.('ConvexBrush');
          if (!convex) continue;
          convex.geometry = structuredClone(c.after.geometry);
          convex.faceMaterials = c.after.faceMaterials
            ? structuredClone(c.after.faceMaterials)
            : null;
          convex.faceUVs = c.after.faceUVs ? structuredClone(c.after.faceUVs) : null;
        }
      }
      for (const s of start) {
        const actor = world.getActor(s.actorId);
        if (actor) runtimeRef.current?.sceneView?.updateBrushGeometry?.(actor);
      }
      syncGeometrySelectionVisual(sel);
      return { ok: false, code: result.code, message: result.message, snapped: snap };
    }

    for (const c of result.changes) {
      const actor = world.getActor(c.actorId);
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex) continue;
      convex.geometry = structuredClone(c.after.geometry);
      convex.faceMaterials = c.after.faceMaterials
        ? structuredClone(c.after.faceMaterials)
        : null;
      convex.faceUVs = c.after.faceUVs ? structuredClone(c.after.faceUVs) : null;
      runtimeRef.current?.sceneView?.updateBrushGeometry?.(actor);
    }
    faceMovePreviewRef.current = {
      ...faceMovePreviewRef.current,
      lastValid: result.changes,
      lastResult: result,
      snap,
    };
    syncGeometrySelectionVisual(sel);
    return { ok: true, changes: result.changes, snapped: snap };
  }, [world, mode, syncGeometrySelectionVisual]);

  const beginFaceMoveDrag = useCallback(() => {
    if (!world || mode === 'play') return false;
    const sel = geometrySelectionRef.current;
    const actorIds = [...new Set((sel?.items || []).map((it) => it.actorId))];
    const { editable, blocked } = partitionEditableActorIds(
      actorIds,
      world,
      layerUiRef.current,
      { playMode: false },
    );
    if (blocked.length) {
      setStatus(lockedLayerFeedback(blocked.length, actorIds.length, 'edit geometry'));
    }
    if (!editable.length) return false;
    const filteredSel = {
      ...sel,
      items: (sel?.items || []).filter((it) => editable.includes(it.actorId)),
    };
    const start = captureGeometryMoveStart(world, filteredSel);
    if (!start.length) return false;
    faceMovePreviewRef.current = { start, lastValid: null, lastResult: null };
    return true;
  }, [world, mode, setStatus]);

  /**
   * Commit the current face-move preview as one undo step, or restore start if invalid.
   */
  const commitFaceMove = useCallback((label = 'Move faces') => {
    if (!world || mode === 'play') return { ok: false };
    const preview = faceMovePreviewRef.current;
    faceMovePreviewRef.current = null;
    if (!preview?.start?.length) return { ok: false, code: 'NO_DRAG' };

    const last = preview.lastValid;
    if (!last?.length) {
      // Restore start geometry — no history entry.
      for (const s of preview.start) {
        const actor = world.getActor(s.actorId);
        const convex = actor?.getComponent?.('ConvexBrush');
        if (!convex) continue;
        convex.geometry = structuredClone(s.before.geometry);
        convex.faceMaterials = s.before.faceMaterials
          ? structuredClone(s.before.faceMaterials)
          : null;
        convex.faceUVs = s.before.faceUVs ? structuredClone(s.before.faceUVs) : null;
        runtimeRef.current?.sceneView?.updateBrushGeometry?.(actor);
      }
      syncGeometrySelectionVisual(geometrySelectionRef.current);
      setStatus(preview.lastResult?.message || 'Face move rejected.');
      return { ok: false, code: 'REJECTED' };
    }

    // Ensure live state matches last valid, then wrap as one command.
    // Command.do() re-applies `after` (already current) so undo restores `before`.
    const lineageByActor = {};
    for (const c of last) {
      if (c.lineage) lineageByActor[c.actorId] = c.lineage;
      const actor = world.getActor(c.actorId);
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex) continue;
      // before from drag start; after from last valid
      const start = preview.start.find((s) => s.actorId === c.actorId);
      if (start) c.before = start.before;
    }

    executeCommand(
      new SetConvexGeometryCommand({
        world,
        changes: last.map((c) => ({
          actorId: c.actorId,
          before: c.before,
          after: c.after,
        })),
        label,
      }),
      {
        resync: true,
        geometryLineageByActor: Object.keys(lineageByActor).length
          ? lineageByActor
          : null,
      },
    );
    return { ok: true };
  }, [world, mode, executeCommand, syncGeometrySelectionVisual, setStatus]);

  const cancelFaceMove = useCallback(() => {
    const preview = faceMovePreviewRef.current;
    faceMovePreviewRef.current = null;
    if (!preview?.start?.length || !world) return;
    for (const s of preview.start) {
      const actor = world.getActor(s.actorId);
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex) continue;
      convex.geometry = structuredClone(s.before.geometry);
      convex.faceMaterials = s.before.faceMaterials
        ? structuredClone(s.before.faceMaterials)
        : null;
      convex.faceUVs = s.before.faceUVs ? structuredClone(s.before.faceUVs) : null;
      runtimeRef.current?.sceneView?.updateBrushGeometry?.(actor);
    }
    syncGeometrySelectionVisual(geometrySelectionRef.current);
  }, [world, syncGeometrySelectionVisual]);

  const updateSelectedTransform = useCallback((partial, { snap = true } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (!actor || isEditorActorLocked(actor)) return;

    // Details edits local transform values (relative to parent).
    const before = actor.transform.toJSON();
    const after = structuredClone(before);
    if (partial.position) {
      after.position = { ...after.position, ...partial.position };
      if (snap) {
        const brushSize = getBrushSnapSize(actor);
        if (brushSize) {
          // Structural geo: keep AABB faces on grid lines.
          after.position = snapCenterByEdges(after.position, brushSize, gridRef.current);
        } else {
          // Props / lights: snap only axes the user edited (preserve light height, etc.).
          const g = gridRef.current;
          if (partial.position.x !== undefined) {
            after.position.x = snapToGrid(after.position.x, g);
          }
          if (partial.position.y !== undefined) {
            after.position.y = snapToGrid(after.position.y, g);
          }
          if (partial.position.z !== undefined) {
            after.position.z = snapToGrid(after.position.z, g);
          }
        }
      }
    }
    if (partial.rotation) {
      after.rotation = { ...after.rotation, ...partial.rotation };
    }
    if (partial.scale) {
      after.scale = { ...after.scale, ...partial.scale };
    }
    commitTransforms([{ actorId, before, after }], 'Edit transform');
  }, [world, mode, commitTransforms]);

  const applyPivotPresetToSelected = useCallback((preset) => {
    if (!world || mode === 'play' || !selectedRef.current.length) return;
    const resolver = {
      getMeshBoundsMeters: (assetId) => assetResolver?.getMeshBoundsMeters?.(assetId)
        || runtimeRef.current?.assetResolver?.getMeshBoundsMeters?.(assetId),
      getMeshBoundsCenterMeters: (assetId) => assetResolver?.getMeshBoundsCenterMeters?.(assetId)
        || runtimeRef.current?.assetResolver?.getMeshBoundsCenterMeters?.(assetId),
    };
    const changes = [];
    for (const actorId of selectedRef.current) {
      const actor = world.getActor(actorId);
      if (!actor || isEditorActorLocked(actor)) continue;
      if (!actorSupportsPivotEdit(actor)) continue;
      const { before, after } = applyPivotPreset(actor, world, preset, resolver);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      changes.push({ before, after });
    }
    if (changes.length) {
      // applyPivotPreset already mutated; restore before so command.do applies after.
      for (const c of changes) {
        const actor = world.getActor(c.before.actorId);
        if (!actor) continue;
        actor.transform.copyFrom(c.before.transform);
        actor.contentOffset = { ...c.before.contentOffset };
        for (const row of c.before.children || []) {
          const child = world.getActor(row.actorId);
          if (child) child.transform.copyFrom(row.transform);
        }
      }
      commitPivotChanges(changes, `Pivot: ${preset}`);
    }
  }, [world, mode, commitPivotChanges, assetResolver]);

  const updateSelectedContentOffset = useCallback((partial, { snap = false } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length !== 1) return;
    const actorId = selectedRef.current[0];
    const actor = world.getActor(actorId);
    if (!actor || isEditorActorLocked(actor)) return;
    if (!actorSupportsPivotEdit(actor)) return;
    const before = snapshotPivotState(actor, world);
    const next = {
      ...normalizeContentOffset(actor.contentOffset),
      ...partial,
    };
    if (snap) {
      const g = gridRef.current;
      if (partial.x !== undefined) next.x = snapToGrid(next.x, g);
      if (partial.y !== undefined) next.y = snapToGrid(next.y, g);
      if (partial.z !== undefined) next.z = snapToGrid(next.z, g);
    }
    // Changing contentOffset alone moves visuals — convert to pivot delta so
    // content stays put: newOffset = next ⇒ deltaLocal = oldOffset - next? 
    // User edits "Pivot offset" as contentOffset (content relative to pivot).
    // Setting contentOffset numerically without moving actor WOULD move content.
    // Spec: numeric XYZ offsets for pivot — treat as setting contentOffset while
    // compensating actor position so content world pose stays fixed.
    const old = normalizeContentOffset(actor.contentOffset);
    const deltaLocal = {
      x: old.x - next.x,
      y: old.y - next.y,
      z: old.z - next.z,
    };
    const { after } = applyActorLocalPivotDelta(actor, deltaLocal, world);
    // applyActorLocalPivotDelta moves pivot by deltaLocal and sets contentOffset = old - delta = next ✓
    actor.transform.copyFrom(before.transform);
    actor.contentOffset = { ...before.contentOffset };
    for (const row of before.children || []) {
      const child = world.getActor(row.actorId);
      if (child) child.transform.copyFrom(row.transform);
    }
    commitPivotChanges([{ before, after }], 'Edit pivot offset');
  }, [world, mode, commitPivotChanges]);

  const reparentSelected = useCallback((newParentId) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const changes = [];
    for (const actorId of selectedRef.current) {
      const actor = world.getActor(actorId);
      if (!actor || isEditorActorLocked(actor)) continue;
      const before = {
        parentId: actor.parentId,
        transform: actor.transform.toJSON(),
      };
      const result = reparentActor(actor, newParentId || null, world);
      if (!result.ok || !result.changed) continue;
      changes.push({
        actorId,
        before,
        after: {
          parentId: actor.parentId,
          transform: actor.transform.toJSON(),
        },
      });
      // Revert temporarily — command will apply
      actor.parentId = before.parentId;
      actor.transform.copyFrom(before.transform);
    }
    if (!changes.length) return;
    executeCommand(
      new ReparentActorsCommand({ world, changes, label: newParentId ? 'Parent' : 'Unparent' }),
      { resync: true },
    );
  }, [world, mode, executeCommand]);

  const createCell = useCallback((name = 'Cell', position) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('create')) return null;
    const snap = gridSnapRef.current;
    const g = snap ? gridRef.current : 1;
    const cell = createCellActor({
      name,
      position: position || { x: 0, y: 0, z: 0 },
      gridSize: g,
      snapY: snap,
    });
    stampAuthoringLayer(cell, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [cell.toJSON()],
        label: 'Create cell',
      }),
      { selectIds: [cell.id] },
    );
    return cell;
  }, [world, mode, executeCommand]);

  const assignSelectedToCell = useCallback((cellActorId) => {
    reparentSelected(cellActorId);
  }, [reparentSelected]);

  const setSelectedActorFlags = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (!actor || isEditorActorLocked(actor)) {
      if (actor) setStatus('Cannot edit flags: actor or authoring layer is locked.');
      return;
    }
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = actor[key];
      after[key] = partial[key];
    }
    executeCommand(
      new SetActorFlagsCommand({ world, actorId, before, after }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  return {
    applyPivotPresetToSelected,
    assignSelectedToCell,
    beginFaceMoveDrag,
    cancelFaceMove,
    commitBrushGeometry,
    commitFaceMove,
    commitPivotChanges,
    commitTransforms,
    createCell,
    previewActorLocalTransforms,
    previewActorPositions,
    previewBrushGeometry,
    previewFaceMove,
    reparentSelected,
    setSelectedActorFlags,
    updateSelectedContentOffset,
    updateSelectedTransform,
  };
}
