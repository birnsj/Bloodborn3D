import { useCallback, useRef } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  normalizeWorldScene,
  normalizeWorldRenderer,
  normalizeWorldAmbient,
} from '../../core/World.js';

/**
 * Live-preview scrub with one undo entry per completed gesture.
 * @param {'scene'|'renderer'|'ambient'} kind
 */
export function useWorldNumericGesture(kind) {
  const {
    world,
    updateWorldScene,
    commitWorldSceneGesture,
    updateWorldRenderer,
    commitWorldRendererGesture,
    updateWorldAmbient,
    commitWorldAmbientGesture,
  } = useEditor();
  const beforeRef = useRef(null);

  const begin = useCallback(() => {
    if (!world || beforeRef.current) return;
    if (kind === 'renderer') {
      beforeRef.current = structuredClone(normalizeWorldRenderer(world.renderer));
    } else if (kind === 'ambient') {
      beforeRef.current = structuredClone(normalizeWorldAmbient(world.ambient));
    } else {
      beforeRef.current = structuredClone(normalizeWorldScene(world.scene));
    }
  }, [world, kind]);

  const live = useCallback((partial) => {
    if (kind === 'renderer') updateWorldRenderer?.(partial, { undoable: false });
    else if (kind === 'ambient') updateWorldAmbient?.(partial, { undoable: false });
    else updateWorldScene?.(partial, { undoable: false });
  }, [kind, updateWorldScene, updateWorldRenderer, updateWorldAmbient]);

  const commit = useCallback((label) => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    if (kind === 'renderer') commitWorldRendererGesture?.(before, label);
    else if (kind === 'ambient') commitWorldAmbientGesture?.(before, label);
    else commitWorldSceneGesture?.(before, label);
  }, [kind, commitWorldSceneGesture, commitWorldRendererGesture, commitWorldAmbientGesture]);

  const cancel = useCallback(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    if (kind === 'renderer') {
      updateWorldRenderer?.(before, { undoable: false, replace: true });
    } else if (kind === 'ambient') {
      updateWorldAmbient?.(before, { undoable: false, replace: true });
    } else {
      updateWorldScene?.(before, { undoable: false, replace: true });
    }
  }, [kind, updateWorldScene, updateWorldRenderer, updateWorldAmbient]);

  return { begin, live, commit, cancel };
}
