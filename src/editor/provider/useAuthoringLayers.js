// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { SetAuthoringLayersTreeCommand, SetActorsAuthoringLayerCommand, SetActiveAuthoringLayerCommand } from '../history/commands.js';
import { partitionEditableActorIds, lockedLayerFeedback } from '../authoringLayerGuards.js';
import { deleteAuthoringLayer, normalizeAuthoringLayersState, normalizeAuthoringLayer, createAuthoringLayerId, wouldCreateLayerCycle, getLayerDescendantIds, resolveAuthoringLayerId } from '../../core/authoringLayers.js';

export function useAuthoringLayers({
  bump,
  executeCommand,
  layerUiRef,
  mode,
  notify,
  selectActors,
  selectedRef,
  setLayerUi,
  setStatus,
  world,
}) {
const ensureAuthoringLayers = useCallback(() => {
    if (!world) return null;
    if (!world.authoringLayers?.layers?.length) {
      world.authoringLayers = normalizeAuthoringLayersState(world.authoringLayers, { seedIfEmpty: true });
    }
    return world.authoringLayers;
  }, [world]);

  const setActiveAuthoringLayer = useCallback((layerId) => {
    if (!world || mode === 'play') return;
    const state = ensureAuthoringLayers();
    if (!state || state.activeLayerId === layerId) return;
    executeCommand(
      new SetActiveAuthoringLayerCommand({
        world,
        beforeId: state.activeLayerId,
        afterId: layerId,
      }),
      { resync: false },
    );
    bump();
  }, [world, mode, ensureAuthoringLayers, executeCommand, bump]);

  const assignActorsToAuthoringLayer = useCallback((actorIds, layerId) => {
    if (!world || mode === 'play' || !actorIds?.length || !layerId) return;
    ensureAuthoringLayers();
    const { editable, blocked } = partitionEditableActorIds(
      actorIds,
      world,
      layerUiRef.current,
      { playMode: mode === 'play' },
    );
    const msg = lockedLayerFeedback(blocked.length, actorIds.length, 'assign layer');
    if (msg) setStatus(msg);
    if (!editable.length) return;
    executeCommand(
      new SetActorsAuthoringLayerCommand({
        world,
        assignments: editable.map((actorId) => ({ actorId, authoringLayerId: layerId })),
      }),
      { resync: true },
    );
  }, [world, mode, ensureAuthoringLayers, executeCommand, setStatus]);

  const assignSelectedToAuthoringLayer = useCallback((layerId) => {
    assignActorsToAuthoringLayer(selectedRef.current, layerId);
  }, [assignActorsToAuthoringLayer]);

  const createAuthoringLayer = useCallback(({ name, parentId = null, color } = {}) => {
    if (!world || mode === 'play') return null;
    const before = structuredClone(ensureAuthoringLayers());
    const siblings = before.layers.filter((l) => (l.parentId || null) === (parentId || null));
    const sortIndex = siblings.reduce((m, l) => Math.max(m, l.sortIndex), -1) + 1;
    const layer = normalizeAuthoringLayer({
      id: createAuthoringLayerId(),
      name: name || 'New Layer',
      parentId: parentId || null,
      color,
      sortIndex,
    });
    if (parentId && wouldCreateLayerCycle(before.layers, layer.id, parentId)) {
      notify('Cannot create layer: would form a cycle');
      return null;
    }
    const after = {
      ...before,
      layers: [...before.layers, layer],
    };
    executeCommand(
      new SetAuthoringLayersTreeCommand({
        world,
        before,
        after,
        label: 'Create authoring layer',
      }),
    );
    bump();
    return layer;
  }, [world, mode, ensureAuthoringLayers, executeCommand, bump, notify]);

  const updateAuthoringLayer = useCallback((layerId, partial) => {
    if (!world || mode === 'play' || !layerId) return;
    const before = structuredClone(ensureAuthoringLayers());
    const idx = before.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const nextParent = partial.parentId !== undefined ? (partial.parentId || null) : before.layers[idx].parentId;
    if (nextParent && wouldCreateLayerCycle(before.layers, layerId, nextParent)) {
      notify('Cannot reparent layer: would form a cycle');
      return;
    }
    const layers = before.layers.map((l) => {
      if (l.id !== layerId) return l;
      return normalizeAuthoringLayer({ ...l, ...partial, id: layerId, parentId: nextParent });
    });
    executeCommand(
      new SetAuthoringLayersTreeCommand({
        world,
        before,
        after: { ...before, layers },
        label: 'Edit authoring layer',
      }),
    );
    bump();
  }, [world, mode, ensureAuthoringLayers, executeCommand, bump, notify]);

  const reorderAuthoringLayers = useCallback((orderedIds, parentId = null) => {
    if (!world || mode === 'play' || !orderedIds?.length) return;
    const before = structuredClone(ensureAuthoringLayers());
    const pid = parentId || null;
    const order = new Map(orderedIds.map((id, i) => [id, i]));
    const layers = before.layers.map((l) => {
      if ((l.parentId || null) !== pid || !order.has(l.id)) return l;
      return { ...l, sortIndex: order.get(l.id) };
    });
    executeCommand(
      new SetAuthoringLayersTreeCommand({
        world,
        before,
        after: { ...before, layers },
        label: 'Reorder authoring layers',
      }),
    );
    bump();
  }, [world, mode, ensureAuthoringLayers, executeCommand, bump]);

  const deleteAuthoringLayerById = useCallback((layerId, reassignToLayerId = null) => {
    if (!world || mode === 'play' || !layerId) return false;
    const before = structuredClone(ensureAuthoringLayers());
    const actorIdsOnLayer = world.actors
      .filter((a) => a.authoringLayerId === layerId)
      .map((a) => a.id);
    const result = deleteAuthoringLayer(before, layerId, {
      reassignToLayerId,
      actorIdsOnLayer,
    });
    if (!result.ok) {
      notify(result.error || 'Delete layer failed');
      return false;
    }
    executeCommand(
      new SetAuthoringLayersTreeCommand({
        world,
        before,
        after: result.nextState,
        actorPatches: result.actorUpdates,
        label: 'Delete authoring layer',
      }),
      { resync: true },
    );
    setLayerUi((prev) => {
      const hidden = new Set(prev.hidden);
      const locked = new Set(prev.locked);
      hidden.delete(layerId);
      locked.delete(layerId);
      const solo = prev.solo?.activeLayerId === layerId
        ? { activeLayerId: null, previousHidden: null }
        : prev.solo;
      return { ...prev, hidden, locked, solo };
    });
    bump();
    return true;
  }, [world, mode, ensureAuthoringLayers, executeCommand, bump, notify]);

  const toggleAuthoringLayerHidden = useCallback((layerId) => {
    if (!layerId) return;
    setLayerUi((prev) => {
      const hidden = new Set(prev.hidden);
      if (hidden.has(layerId)) hidden.delete(layerId);
      else hidden.add(layerId);
      return { ...prev, hidden };
    });
  }, []);

  const toggleAuthoringLayerLocked = useCallback((layerId) => {
    if (!layerId) return;
    setLayerUi((prev) => {
      const locked = new Set(prev.locked);
      if (locked.has(layerId)) locked.delete(layerId);
      else locked.add(layerId);
      return { ...prev, locked };
    });
  }, []);

  const setAuthoringLayerSolo = useCallback((layerId) => {
    setLayerUi((prev) => {
      if (!layerId || prev.solo?.activeLayerId === layerId) {
        // Clear solo — restore previous hidden map if any.
        const restored = prev.solo?.previousHidden
          ? new Set(prev.solo.previousHidden)
          : prev.hidden;
        return {
          ...prev,
          hidden: restored,
          solo: { activeLayerId: null, previousHidden: null },
        };
      }
      return {
        ...prev,
        solo: {
          activeLayerId: layerId,
          previousHidden: [...prev.hidden],
        },
      };
    });
  }, []);

  const selectActorsInAuthoringLayer = useCallback((layerId, { includeDescendants = true } = {}) => {
    if (!world || !layerId) return;
    const state = ensureAuthoringLayers();
    const ids = new Set([layerId]);
    if (includeDescendants) {
      for (const id of getLayerDescendantIds(state.layers, layerId)) ids.add(id);
    }
    const actorIds = world.actors
      .filter((a) => ids.has(resolveAuthoringLayerId(state, a.authoringLayerId)))
      .map((a) => a.id);
    selectActors(actorIds);
  }, [world, ensureAuthoringLayers, selectActors]);

  return {
    assignActorsToAuthoringLayer,
    assignSelectedToAuthoringLayer,
    createAuthoringLayer,
    deleteAuthoringLayerById,
    reorderAuthoringLayers,
    selectActorsInAuthoringLayer,
    setActiveAuthoringLayer,
    setAuthoringLayerSolo,
    toggleAuthoringLayerHidden,
    toggleAuthoringLayerLocked,
    updateAuthoringLayer,
  };
}
