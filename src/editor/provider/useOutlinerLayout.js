// Part of EditorProvider — Scene Outliner category section headers.
import { useCallback } from 'react';
import { SetOutlinerLayoutCommand } from '../history/commands.js';
import {
  actorIdsMatchingOutlinerRoots,
  deleteOutlinerCategory,
  emptyOutlinerLayout,
  insertOutlinerCategory,
  normalizeOutlinerLayout,
  placeInOutlinerRootOrder,
  renameOutlinerCategory,
  setOutlinerCategoryIconColor,
} from '../../core/outlinerLayout.js';

export function useOutlinerLayout({
  bump,
  executeCommand,
  mode,
  world,
}) {
  const ensureOutliner = useCallback(() => {
    if (!world) return emptyOutlinerLayout();
    world.outliner = normalizeOutlinerLayout(world.outliner, world);
    return world.outliner;
  }, [world]);

  const applyOutlinerLayout = useCallback((after, label) => {
    if (!world || mode === 'play') return;
    const before = structuredClone(ensureOutliner());
    const normalized = normalizeOutlinerLayout(after, world);
    const beforeActorIds = world.actors.map((a) => a.id);
    const afterActorIds = actorIdsMatchingOutlinerRoots(world, normalized);
    const orderChanged = afterActorIds.some((id, i) => id !== beforeActorIds[i]);
    executeCommand(
      new SetOutlinerLayoutCommand({
        world,
        before,
        after: normalized,
        beforeActorIds: orderChanged ? beforeActorIds : null,
        afterActorIds: orderChanged ? afterActorIds : null,
        label,
      }),
      { resync: false },
    );
    bump();
  }, [world, mode, ensureOutliner, executeCommand, bump]);

  const createOutlinerCategory = useCallback((name = 'New Category') => {
    if (!world || mode === 'play') return null;
    const before = ensureOutliner();
    const { layout, id } = insertOutlinerCategory(before, { name });
    applyOutlinerLayout(layout, 'Add outliner category');
    return id;
  }, [world, mode, ensureOutliner, applyOutlinerLayout]);

  const renameOutlinerCategoryById = useCallback((categoryId, name) => {
    if (!world || mode === 'play' || !categoryId) return;
    const next = renameOutlinerCategory(ensureOutliner(), categoryId, name);
    applyOutlinerLayout(next, 'Rename outliner category');
  }, [world, mode, ensureOutliner, applyOutlinerLayout]);

  const deleteOutlinerCategoryById = useCallback((categoryId) => {
    if (!world || mode === 'play' || !categoryId) return;
    const next = deleteOutlinerCategory(ensureOutliner(), categoryId);
    applyOutlinerLayout(next, 'Delete outliner category');
  }, [world, mode, ensureOutliner, applyOutlinerLayout]);

  const setOutlinerCategoryIconColorById = useCallback((categoryId, iconColor) => {
    if (!world || mode === 'play' || !categoryId) return;
    const next = setOutlinerCategoryIconColor(ensureOutliner(), categoryId, iconColor);
    applyOutlinerLayout(next, 'Outliner category icon color');
  }, [world, mode, ensureOutliner, applyOutlinerLayout]);

  const placeOutlinerRoots = useCallback((movingIds, { targetId, edge } = {}) => {
    if (!world || mode === 'play' || !movingIds?.length || !targetId) return;
    const next = placeInOutlinerRootOrder(ensureOutliner(), movingIds, { targetId, edge });
    applyOutlinerLayout(next, 'Reorder outliner');
  }, [world, mode, ensureOutliner, applyOutlinerLayout]);

  return {
    createOutlinerCategory,
    renameOutlinerCategoryById,
    deleteOutlinerCategoryById,
    setOutlinerCategoryIconColorById,
    placeOutlinerRoots,
    ensureOutliner,
  };
}
