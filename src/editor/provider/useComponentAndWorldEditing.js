// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { SetLightPropertiesCommand, SetEnvironmentPropertiesCommand, SetPrimitiveMeshPropertiesCommand, SetWorldPostProcessingCommand, SetWorldSceneCommand, SetWorldAmbientCommand, SetWorldRendererCommand } from '../history/commands.js';
import { normalizePrimitiveMeshFields, validatePrimitiveAllocation } from '../../components/PrimitiveMeshComponent.js';
import { migrateLegacyWorldAmbient, normalizeWorldAmbient, normalizeWorldScene, normalizeWorldFog, normalizeWorldRenderer } from '../../core/World.js';
import { mergePostProcessing, normalizePostProcessing, resetAllPostProcessing, resetEffectInPostProcessing } from '../../runtime/postprocessing/postProcessingState.js';
import { commitSelectedComponentGesture, commitWorldFieldGesture, updateSelectedComponentProperties, updateWorldField } from '../propertyEditing.js';

export function useComponentAndWorldEditing({
  autoCapturePrefabOverrides,
  bump,
  executeCommand,
  isEditorActorLocked,
  mode,
  recordCommand,
  runtimeRef,
  selectedRef,
  setStatus,
  world,
  worldRef,
}) {
const rebuildSelectedActorVisual = useCallback((actor, currentWorld) => {
    runtimeRef.current?.sceneView?.rebuildActorVisual?.(actor, currentWorld);
  }, []);

  const updateSelectedLight = useCallback((partial, options = {}) => {
    updateSelectedComponentProperties({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'Light',
      partial,
      options: { ...options, label: options.label || 'Edit light' },
      CommandClass: SetLightPropertiesCommand,
      isEditorActorLocked,
      setStatus,
      lockedMessage: 'Cannot edit light: actor or authoring layer is locked.',
      executeCommand,
      autoCapturePrefabOverrides,
      rebuildActorVisual: rebuildSelectedActorVisual,
      bump,
    });
  }, [world, mode, isEditorActorLocked, setStatus, executeCommand, autoCapturePrefabOverrides, rebuildSelectedActorVisual, bump]);

  /**
   * After a live (non-undoable) light scrub, record one undo entry from
   * `beforeSnapshot` → current light fields without re-applying.
   */
  const commitLightGesture = useCallback((beforeSnapshot, label = 'Edit light') => {
    commitSelectedComponentGesture({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'Light',
      beforeSnapshot,
      label,
      CommandClass: SetLightPropertiesCommand,
      recordCommand,
      autoCapturePrefabOverrides,
    });
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedEnvironment = useCallback((partial, options = {}) => {
    updateSelectedComponentProperties({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'Environment',
      partial,
      options: { ...options, label: options.label || 'Edit environment' },
      CommandClass: SetEnvironmentPropertiesCommand,
      isEditorActorLocked,
      setStatus,
      lockedMessage: 'Cannot edit environment: actor or authoring layer is locked.',
      executeCommand,
      autoCapturePrefabOverrides,
      rebuildActorVisual: rebuildSelectedActorVisual,
      bump,
    });
  }, [world, mode, isEditorActorLocked, setStatus, executeCommand, autoCapturePrefabOverrides, rebuildSelectedActorVisual, bump]);

  const commitEnvironmentGesture = useCallback((beforeSnapshot, label = 'Edit environment') => {
    commitSelectedComponentGesture({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'Environment',
      beforeSnapshot,
      label,
      CommandClass: SetEnvironmentPropertiesCommand,
      recordCommand,
      autoCapturePrefabOverrides,
    });
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedPrimitiveMesh = useCallback((partial, options = {}) => {
    updateSelectedComponentProperties({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'PrimitiveMesh',
      partial,
      options: { ...options, label: options.label || 'Edit primitive' },
      CommandClass: SetPrimitiveMeshPropertiesCommand,
      isEditorActorLocked,
      setStatus,
      lockedMessage: 'Cannot edit primitive: actor or authoring layer is locked.',
      executeCommand,
      autoCapturePrefabOverrides,
      rebuildActorVisual: rebuildSelectedActorVisual,
      bump,
      validate: (comp, nextPartial) => validatePrimitiveAllocation(
        normalizePrimitiveMeshFields({ ...comp, ...nextPartial }),
      ),
    });
  }, [world, mode, isEditorActorLocked, setStatus, executeCommand, autoCapturePrefabOverrides, rebuildSelectedActorVisual, bump]);

  const commitPrimitiveMeshGesture = useCallback((beforeSnapshot, label = 'Edit primitive') => {
    commitSelectedComponentGesture({
      world,
      mode,
      selectedIds: selectedRef.current,
      componentType: 'PrimitiveMesh',
      beforeSnapshot,
      label,
      CommandClass: SetPrimitiveMeshPropertiesCommand,
      recordCommand,
      autoCapturePrefabOverrides,
      validate: (comp) => validatePrimitiveAllocation(normalizePrimitiveMeshFields({ ...comp })),
    });
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  /**
   * Level-authored scene fill (World Settings). Not an actor light.
   * @param {object} partial
   * @param {{ undoable?: boolean, replace?: boolean, label?: string }} [options]
   *   undoable defaults true; set false while scrubbing, then commitWorldAmbientGesture.
   */
  const updateWorldAmbient = useCallback((partial, options = {}) => {
    const current = worldRef.current;
    if (!current || mode === 'play') return;
    const {
      undoable = true,
      replace = false,
      label = 'Edit world ambient',
    } = options;
    // Promote legacy AmbientLight-scale defaults once, then apply the edit.
    const base = migrateLegacyWorldAmbient(current.ambient);
    const after = replace
      ? normalizeWorldAmbient(partial)
      : normalizeWorldAmbient({
        ...base,
        ...partial,
      });
    const onApply = (ambient) => {
      runtimeRef.current?.sceneView?.applyWorldAmbient?.(ambient);
    };
    updateWorldField({
      world: current,
      mode,
      field: 'ambient',
      before: normalizeWorldAmbient(base),
      after,
      options: { undoable, label },
      CommandClass: SetWorldAmbientCommand,
      executeCommand,
      onApply,
      bump,
    });
  }, [mode, bump, executeCommand]);

  /**
   * After a live (non-undoable) ambient scrub/type session, record one undo step
   * from `beforeSnapshot` → current ambient without re-applying.
   */
  const commitWorldAmbientGesture = useCallback((beforeSnapshot, label = 'Edit world ambient') => {
    const current = worldRef.current;
    commitWorldFieldGesture({
      world: current,
      mode,
      before: beforeSnapshot,
      after: current?.ambient,
      label,
      CommandClass: SetWorldAmbientCommand,
      recordCommand,
      onApply: (ambient) => {
        runtimeRef.current?.sceneView?.applyWorldAmbient?.(ambient);
      },
      normalize: normalizeWorldAmbient,
    });
  }, [mode, recordCommand]);

  /** Level-authored Three.js Scene look (background + fog + environment). */
  const updateWorldScene = useCallback((partial, options = {}) => {
    const current = worldRef.current;
    if (!current || mode === 'play') return;
    const {
      undoable = true,
      replace = false,
      label = 'Edit world scene',
    } = options;
    const base = normalizeWorldScene(current.scene);
    const after = replace
      ? normalizeWorldScene(partial)
      : normalizeWorldScene({
        ...base,
        ...partial,
        fog: normalizeWorldFog({
          ...base.fog,
          ...(partial?.fog && typeof partial.fog === 'object' ? partial.fog : {}),
        }),
        sky: {
          ...base.sky,
          ...(partial?.sky && typeof partial.sky === 'object' ? partial.sky : {}),
        },
        groundedSkybox: {
          ...base.groundedSkybox,
          ...(partial?.groundedSkybox && typeof partial.groundedSkybox === 'object'
            ? partial.groundedSkybox
            : {}),
        },
        backgroundRotation: {
          ...base.backgroundRotation,
          ...(partial?.backgroundRotation && typeof partial.backgroundRotation === 'object'
            ? partial.backgroundRotation
            : {}),
        },
        environmentRotation: {
          ...base.environmentRotation,
          ...(partial?.environmentRotation && typeof partial.environmentRotation === 'object'
            ? partial.environmentRotation
            : {}),
        },
      });

    const onApply = (scene) => {
      runtimeRef.current?.sceneView?.applyWorldScene?.(scene);
    };

    updateWorldField({
      world: current,
      mode,
      field: 'scene',
      before: base,
      after,
      options: { undoable, label },
      CommandClass: SetWorldSceneCommand,
      executeCommand,
      onApply,
      bump,
    });
  }, [mode, bump, executeCommand]);

  /**
   * After a live (non-undoable) scrub/type session, record one undo step from
   * `beforeSnapshot` → current scene without re-applying.
   */
  const commitWorldSceneGesture = useCallback((beforeSnapshot, label = 'Edit world scene') => {
    const current = worldRef.current;
    commitWorldFieldGesture({
      world: current,
      mode,
      before: beforeSnapshot,
      after: current?.scene,
      label,
      CommandClass: SetWorldSceneCommand,
      recordCommand,
      onApply: (scene) => {
        runtimeRef.current?.sceneView?.applyWorldScene?.(scene);
      },
      normalize: normalizeWorldScene,
    });
  }, [mode, recordCommand]);

  /** Level-authored WebGLRenderer look (tone mapping + shadows). */
  const updateWorldRenderer = useCallback((partial, options = {}) => {
    const current = worldRef.current;
    if (!current || mode === 'play') return;
    const {
      undoable = true,
      replace = false,
      label = 'Edit world renderer',
    } = options;
    const before = normalizeWorldRenderer(current.renderer);
    const after = replace
      ? normalizeWorldRenderer(partial)
      : normalizeWorldRenderer({
        ...before,
        ...partial,
      });
    const onApply = (renderer) => {
      runtimeRef.current?.sceneView?.applyWorldRenderer?.(renderer);
    };
    updateWorldField({
      world: current,
      mode,
      field: 'renderer',
      before,
      after,
      options: { undoable, label },
      CommandClass: SetWorldRendererCommand,
      executeCommand,
      onApply,
      bump,
    });
  }, [mode, bump, executeCommand]);

  const commitWorldRendererGesture = useCallback((beforeSnapshot, label = 'Edit world renderer') => {
    const current = worldRef.current;
    commitWorldFieldGesture({
      world: current,
      mode,
      before: beforeSnapshot,
      after: current?.renderer,
      label,
      CommandClass: SetWorldRendererCommand,
      recordCommand,
      onApply: (renderer) => {
        runtimeRef.current?.sceneView?.applyWorldRenderer?.(renderer);
      },
      normalize: normalizeWorldRenderer,
    });
  }, [mode, recordCommand]);

  const applyPostProcessingToView = useCallback((settings) => {
    runtimeRef.current?.sceneView?.applyPostProcessing?.(settings);
  }, []);

  /**
   * Map-authored post-processing.
   * @param {object} partial merge patch (or full replace when replace=true)
   * @param {{ undoable?: boolean, replace?: boolean, label?: string }} [options]
   *   undoable defaults true; set false while scrubbing, then commit with undoable true.
   */
  const updateWorldPostProcessing = useCallback((partial, options = {}) => {
    const current = worldRef.current;
    if (!current || mode === 'play') return;
    const {
      undoable = true,
      replace = false,
      label = 'Edit post-processing',
    } = options;
    const before = normalizePostProcessing(current.postProcessing);
    const after = replace
      ? normalizePostProcessing(partial)
      : mergePostProcessing(before, partial);

    if (undoable) {
      executeCommand(
        new SetWorldPostProcessingCommand({
          world: current,
          before,
          after,
          label,
          onApply: applyPostProcessingToView,
        }),
      );
      bump();
      return;
    }

    current.postProcessing = after;
    applyPostProcessingToView(after);
    bump();
  }, [mode, executeCommand, applyPostProcessingToView, bump]);

  const resetWorldPostProcessingEffect = useCallback((effectId) => {
    const current = worldRef.current;
    if (!current || mode === 'play') return;
    updateWorldPostProcessing(
      resetEffectInPostProcessing(current.postProcessing, effectId),
      { replace: true, label: `Reset ${effectId}` },
    );
  }, [mode, updateWorldPostProcessing]);

  const resetWorldPostProcessingAll = useCallback(() => {
    if (!worldRef.current || mode === 'play') return;
    updateWorldPostProcessing(resetAllPostProcessing(), {
      replace: true,
      label: 'Reset post-processing',
    });
  }, [mode, updateWorldPostProcessing]);

  return {
    commitEnvironmentGesture,
    commitLightGesture,
    commitPrimitiveMeshGesture,
    commitWorldAmbientGesture,
    commitWorldRendererGesture,
    commitWorldSceneGesture,
    rebuildSelectedActorVisual,
    resetWorldPostProcessingAll,
    resetWorldPostProcessingEffect,
    updateSelectedEnvironment,
    updateSelectedLight,
    updateSelectedPrimitiveMesh,
    updateWorldAmbient,
    updateWorldPostProcessing,
    updateWorldRenderer,
    updateWorldScene,
  };
}
