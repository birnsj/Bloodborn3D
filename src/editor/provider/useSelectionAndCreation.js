// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { STRUCTURAL_BRUSH_KINDS, structuralBrushesAreSubtractive } from '../newMapFactory.js';
import { DEFAULT_GRID_EDITOR_UNITS, GRID_INCREMENTS, WALL_MODULE_SIZE } from '../../core/units.js';
import { AddActorsCommand, RemoveActorsCommand, SetPrefabOverridesCommand } from '../history/commands.js';
import { stampAuthoringLayer } from '../authoringLayerStamp.js';
import { nextGeometrySelectionAfterActorChange } from '../geometryEditing/geometrySelection.js';
import { createBrushFromBounds, duplicateActors } from '../brushFactory.js';
import { createRampFromBounds } from '../rampFactory.js';
import { createStairFromBounds } from '../stairFactory.js';
import { createColumnFromBounds } from '../columnFactory.js';
import { createArchFromBounds } from '../archFactory.js';
import { createCurvedWallFromBounds } from '../curvedWallFactory.js';
import { DEFAULT_RAMP_RISE } from '../../components/RampComponent.js';
import { DEFAULT_COLUMN_HEIGHT } from '../../components/ColumnComponent.js';
import { DEFAULT_ARCH_OPENING_HEIGHT, DEFAULT_ARCH_RISE } from '../../components/ArchComponent.js';
import { DEFAULT_CURVED_WALL_SWEEP } from '../../components/CurvedWallComponent.js';
import { findInstanceRoot, recordPrefabOverridesForActors, recordActorPrefabOverride, getOverrides as getPrefabOverrides } from '../../prefabs/prefabOps.js';
import { validateWorldSubtractComplexity } from '../../runtime/brushGeometry.js';
import { nextSelectedSurfaceAfterActorChange } from '../surfaceSelection.js';

export function useSelectionAndCreation({
  executeCommand,
  geometrySelectionRef,
  getPrefabDefinition,
  getPrefabDefinitionSync,
  gridRef,
  mode,
  rejectIfActiveLayerLocked,
  rejectSubtractIfTooComplex,
  reportCutterConvexConflicts,
  runtimeRef,
  selectedRef,
  setGeometrySelectionState,
  setGridSize,
  setGridSnap,
  setSelectedActorIds,
  setSelectedSurfaceState,
  setTool,
  syncGeometrySelectionVisual,
  syncSelectionVisual,
  takeEditableSelection,
  world,
  worldRef,
}) {
const selectActors = useCallback((ids, { additive = false } = {}) => {
    let next;
    if (additive) {
      const set = new Set(selectedRef.current);
      for (const id of ids) {
        if (set.has(id)) set.delete(id);
        else set.add(id);
      }
      next = [...set];
    } else {
      next = ids.filter(Boolean);
    }
    // Keep selectedRef in sync immediately so follow-up APIs
    // (apply material, transform, pivot, delete) see the new selection
    // before the next React render.
    selectedRef.current = next;
    setSelectedActorIds(next);
    syncSelectionVisual(next);
    // Actor selection clears surface pick unless the surface actor stays selected.
    setSelectedSurfaceState((prev) => {
      const kept = nextSelectedSurfaceAfterActorChange(prev, next, worldRef.current);
      if (prev && !kept) {
        runtimeRef.current?.sceneView?.setSurfaceSelection?.(null);
      }
      return kept;
    });
    setGeometrySelectionState((prev) => {
      const kept = nextGeometrySelectionAfterActorChange(prev, next, worldRef.current);
      geometrySelectionRef.current = kept;
      syncGeometrySelectionVisual(kept);
      return kept;
    });
  }, [syncSelectionVisual, syncGeometrySelectionVisual]);

  const selectActor = useCallback((id, options) => {
    if (!id) {
      selectActors([]);
      return;
    }
    if (options?.additive) {
      selectActors([id], { additive: true });
    } else {
      selectActors([id]);
    }
  }, [selectActors]);

  const selectAllActors = useCallback(() => {
    if (!world || mode === 'play') return;
    selectActors(world.actors.map((a) => a.id));
  }, [world, mode, selectActors]);

  const deselectAllActors = useCallback(() => {
    if (mode === 'play') return;
    selectActors([]);
  }, [mode, selectActors]);

  const cycleGridSize = useCallback((direction = 1) => {
    if (mode === 'play') return;
    const list = GRID_INCREMENTS;
    const idx = list.indexOf(gridRef.current);
    const from = idx >= 0 ? idx : list.indexOf(DEFAULT_GRID_EDITOR_UNITS);
    const next = list[(from + direction + list.length) % list.length];
    setGridSize(next);
  }, [mode, setGridSize]);

  const toggleGridSnap = useCallback(() => {
    if (mode === 'play') return;
    setGridSnap((v) => !v);
  }, [mode]);

  const createBrushAtBounds = useCallback((kind, min, max) => {
    if (!world || mode === 'play') return null;
    if (rejectIfActiveLayerLocked('create')) return null;

    if (kind === 'ramp') {
      const actor = createRampFromBounds({
        min,
        max,
        gridSize: gridRef.current,
        rise: DEFAULT_RAMP_RISE,
      });
      stampAuthoringLayer(actor, world);
      executeCommand(
        new AddActorsCommand({
          world,
          actorsJson: [actor.toJSON()],
          label: 'Create ramp',
        }),
        { selectIds: [actor.id] },
      );
      setTool('select');
      return actor;
    }

    if (kind === 'stair') {
      const actor = createStairFromBounds({
        min,
        max,
        gridSize: gridRef.current,
        totalRise: WALL_MODULE_SIZE,
      });
      stampAuthoringLayer(actor, world);
      executeCommand(
        new AddActorsCommand({
          world,
          actorsJson: [actor.toJSON()],
          label: 'Create stairs',
        }),
        { selectIds: [actor.id] },
      );
      setTool('select');
      return actor;
    }

    if (kind === 'column') {
      const actor = createColumnFromBounds({
        min,
        max,
        gridSize: gridRef.current,
        height: DEFAULT_COLUMN_HEIGHT,
      });
      stampAuthoringLayer(actor, world);
      executeCommand(
        new AddActorsCommand({
          world,
          actorsJson: [actor.toJSON()],
          label: 'Create column',
        }),
        { selectIds: [actor.id] },
      );
      setTool('select');
      return actor;
    }

    if (kind === 'arch' || kind === 'archRoman' || kind === 'archGothic') {
      const archType = kind === 'archGothic' ? 'gothic' : 'roman';
      const actor = createArchFromBounds({
        min,
        max,
        gridSize: gridRef.current,
        archType,
        openingHeight: DEFAULT_ARCH_OPENING_HEIGHT,
        archRise: DEFAULT_ARCH_RISE,
      });
      stampAuthoringLayer(actor, world);
      executeCommand(
        new AddActorsCommand({
          world,
          actorsJson: [actor.toJSON()],
          label: archType === 'gothic' ? 'Create gothic arch' : 'Create roman arch',
        }),
        { selectIds: [actor.id] },
      );
      setTool('select');
      return actor;
    }

    if (kind === 'curvedWall') {
      const actor = createCurvedWallFromBounds({
        min,
        max,
        gridSize: gridRef.current,
        sweepAngle: DEFAULT_CURVED_WALL_SWEEP,
      });
      stampAuthoringLayer(actor, world);
      executeCommand(
        new AddActorsCommand({
          world,
          actorsJson: [actor.toJSON()],
          label: 'Create curved wall',
        }),
        { selectIds: [actor.id] },
      );
      setTool('select');
      return actor;
    }

    // Subtractive maps: structural solids carve the World Solid by default.
    const forceSubtract = kind === 'subtract'
      || (structuralBrushesAreSubtractive(world) && STRUCTURAL_BRUSH_KINDS.has(kind));
    const isSubtract = forceSubtract;
    const actor = createBrushFromBounds({
      kind: isSubtract && kind === 'subtract' ? 'box' : kind,
      min,
      max,
      gridSize: gridRef.current,
      operation: isSubtract ? 'subtract' : 'add',
    });
    stampAuthoringLayer(actor, world);
    // Tentative insert — reject without history if carve complexity overflows.
    world.addActor(actor);
    const complexity = validateWorldSubtractComplexity(world);
    if (rejectSubtractIfTooComplex(complexity)) {
      world.removeActor(actor.id);
      runtimeRef.current?.resyncWorld();
      setTool('select');
      return null;
    }
    world.removeActor(actor.id);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: isSubtract ? 'Create subtract box' : `Create ${kind}`,
      }),
      { selectIds: [actor.id] },
    );
    if (isSubtract) reportCutterConvexConflicts();
    setTool('select');
    return actor;
  }, [world, mode, executeCommand, rejectSubtractIfTooComplex, reportCutterConvexConflicts, rejectIfActiveLayerLocked]);

  const deleteSelected = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const ids = takeEditableSelection('delete');
    if (!ids.length) return;
    executeCommand(
      new RemoveActorsCommand({ world, actorIds: ids, label: 'Delete' }),
      { selectIds: [] },
    );
  }, [world, mode, executeCommand, takeEditableSelection]);

  const duplicateSelected = useCallback(({ offset = null, label = 'Duplicate' } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return [];
    // Duplication preserves each source actor's authoringLayerId (never Active stamp).
    // Locked actors (actor flag or authoring layer) are skipped.
    const editableIds = takeEditableSelection('duplicate');
    const actors = editableIds.map((id) => world.getActor(id)).filter(Boolean);
    if (actors.length === 0) return [];
    const copies = duplicateActors(actors, {
      // Alt+gizmo drag uses zero offset — the drag places the copies.
      offset: offset || { x: gridRef.current, y: 0, z: 0 },
      gridSize: gridRef.current,
    });
    for (const copy of copies) world.addActor(copy);
    const complexity = validateWorldSubtractComplexity(world);
    if (rejectSubtractIfTooComplex(complexity)) {
      for (const copy of copies) world.removeActor(copy.id);
      runtimeRef.current?.resyncWorld();
      return [];
    }
    for (const copy of copies) world.removeActor(copy.id);
    const ids = copies.map((a) => a.id);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: copies.map((a) => a.toJSON()),
        label,
      }),
      { selectIds: ids },
    );
    return ids;
  }, [world, mode, executeCommand, rejectSubtractIfTooComplex, takeEditableSelection]);

  /**
   * Sync-only: record prefab overrides for edited actors and return undo commands.
   * Mutates roots temporarily then restores `before` so callers can execute via history.
   */
  const buildPrefabOverrideCommands = useCallback((actorIds) => {
    if (!world || !actorIds?.length) return [];
    const roots = new Map();
    for (const id of actorIds) {
      const actor = world.getActor(id);
      if (!actor?.prefab?.instanceId) continue;
      const root = findInstanceRoot(world, actor.prefab.instanceId);
      if (!root || roots.has(root.id)) continue;
      roots.set(root.id, { root, before: getPrefabOverrides(root) });
    }
    if (!roots.size) return [];

    for (const id of actorIds) {
      const actor = world.getActor(id);
      if (!actor?.prefab?.prefabId) continue;
      const def = getPrefabDefinitionSync?.(actor.prefab.prefabId);
      if (!def) continue;
      recordActorPrefabOverride(world, actor, def);
    }

    const cmds = [];
    for (const [rootId, { root, before }] of roots) {
      const after = getPrefabOverrides(root);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      root.prefab.overrides = structuredClone(before);
      cmds.push(new SetPrefabOverridesCommand({
        world,
        actorId: rootId,
        before,
        after,
        label: 'Prefab override',
      }));
    }
    return cmds;
  }, [world, getPrefabDefinitionSync]);

  const autoCapturePrefabOverrides = useCallback(async (actorIds) => {
    if (!world || !actorIds?.length) return;
    // Prefer sync capture into history when definitions are cached.
    const syncCmds = buildPrefabOverrideCommands(actorIds);
    if (syncCmds.length) {
      for (const cmd of syncCmds) executeCommand(cmd, { resync: false });
      return;
    }
    // Async fallback: still wrap mutation in SetPrefabOverridesCommand.
    const roots = new Map();
    for (const id of actorIds) {
      const actor = world.getActor(id);
      if (!actor?.prefab?.instanceId) continue;
      const root = findInstanceRoot(world, actor.prefab.instanceId);
      if (!root || roots.has(root.id)) continue;
      roots.set(root.id, { root, before: getPrefabOverrides(root) });
    }
    if (!roots.size) return;
    await recordPrefabOverridesForActors(world, actorIds, {
      getDefinitionSync: getPrefabDefinitionSync,
      getDefinition: getPrefabDefinition,
    });
    for (const [rootId, { root, before }] of roots) {
      const after = getPrefabOverrides(root);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      root.prefab.overrides = structuredClone(before);
      executeCommand(
        new SetPrefabOverridesCommand({
          world,
          actorId: rootId,
          before,
          after,
          label: 'Prefab override',
        }),
        { resync: false },
      );
    }
  }, [
    world,
    buildPrefabOverrideCommands,
    executeCommand,
    getPrefabDefinitionSync,
    getPrefabDefinition,
  ]);

  return {
    autoCapturePrefabOverrides,
    buildPrefabOverrideCommands,
    createBrushAtBounds,
    cycleGridSize,
    deleteSelected,
    deselectAllActors,
    duplicateSelected,
    selectActor,
    selectActors,
    selectAllActors,
    toggleGridSnap,
  };
}
