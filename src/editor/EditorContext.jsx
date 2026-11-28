import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SavedStateTracker } from './dirtyTracking.js';
import { DEFAULT_GRID_EDITOR_UNITS, GRID_INCREMENTS } from '../core/units.js';
import { loadEditorSettings } from './editorSettingsPrefs.js';
import { GameRuntime } from '../runtime/GameRuntime.js';
import { HistoryStack } from './history/HistoryStack.js';
import { RenameActorCommand } from './history/commands.js';
import { isEditorActorLocked as checkEditorActorLocked, isActiveAuthoringLayerLocked, partitionEditableActorIds, lockedLayerFeedback } from './authoringLayerGuards.js';
import { emptyGeometrySelection, nextGeometrySelectionAfterActorChange, normalizeGeometrySelection, remappedGeometrySelection } from './geometryEditing/geometrySelection.js';
import { geometrySelectionWorldCenter, primaryFaceNormalWorld } from './geometryEditing/faceMove.js';
import { cutterConvexConflictMessage } from '../rules/convexBrushRules.js';
import { resizeBrushFace } from './brushFactory.js';
import { useAssetBrowser } from './assets/AssetBrowserContext.jsx';
import { getWorldTransform } from '../core/hierarchy.js';
import { nextSelectedSurfaceAfterActorChange } from './surfaceSelection.js';
import { useEditorDialogs } from '../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../ui/dialogs/reportEditorMessage.js';
import { useLevelLifecycle } from './provider/useLevelLifecycle.js';
import { useSelectionAndCreation } from './provider/useSelectionAndCreation.js';
import { useTransformEditing } from './provider/useTransformEditing.js';
import { useAuthoringLayers } from './provider/useAuthoringLayers.js';
import { useOutlinerLayout } from './provider/useOutlinerLayout.js';
import { useBrushEditing } from './provider/useBrushEditing.js';
import { useComponentAndWorldEditing } from './provider/useComponentAndWorldEditing.js';
import { useParametricShapeEditing } from './provider/useParametricShapeEditing.js';
import { usePlacementAndPrefabs } from './provider/usePlacementAndPrefabs.js';
import { useSurfaceAndGeometryModes } from './provider/useSurfaceAndGeometryModes.js';
import { useExtrudeAndClip } from './provider/useExtrudeAndClip.js';
import { useSurfaceMaterials } from './provider/useSurfaceMaterials.js';

const EditorContext = createContext(null);

/** Level opened automatically when the editor starts. */
const STARTUP_LEVEL = 'test-room.json';
/** How long edits must settle before the dirty indicator is recomputed. */
const DIRTY_RECHECK_MS = 200;

export function EditorProvider({ children }) {
  const {
    assetResolver,
    revision: assetRevision,
    registry: assetRegistry,
    savePrefabDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  } = useAssetBrowser();
  const dialogs = useEditorDialogs();
  const runtimeRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [selectedActorIds, setSelectedActorIds] = useState([]);
  const [mode, setMode] = useState('edit');
  const [tool, setTool] = useState('select'); // select | surface | align | geometry | box | …
  /** @type {[{ actorId: string, surfaceId: string } | null]} */
  const [selectedSurface, setSelectedSurfaceState] = useState(null);
  /** Align-to-Neighbor reference surface (Phase 2E.3). */
  const [alignReferenceSurface, setAlignReferenceSurfaceState] = useState(null);
  /** Geometry Face/Edge/Vertex mode (Phase 2F.1). UI state only. */
  const [geometryMode, setGeometryModeState] = useState('face');
  const [geometrySelection, setGeometrySelectionState] = useState(() => emptyGeometrySelection('face'));
  const geometrySelectionRef = useRef(geometrySelection);
  geometrySelectionRef.current = geometrySelection;
  /** Clip session: interactive three-point plane + keep mode. */
  const [clipSession, setClipSessionState] = useState(null);
  const clipSessionRef = useRef(clipSession);
  clipSessionRef.current = clipSession;
  const [extrudePreview, setExtrudePreviewState] = useState(null);
  const extrudePreviewRef = useRef(extrudePreview);
  extrudePreviewRef.current = extrudePreview;
  /** Last valid preview during a face-move drag (restored on invalid release). */
  const faceMovePreviewRef = useRef(null);
  /** Gizmo mode: move (W) | rotate (E) | scale (R). */
  const [transformMode, setTransformModeState] = useState('move');
  /** Batch 7.1 — pivot edit mode (uses translation gizmo on the actor origin). */
  const [pivotEditMode, setPivotEditModeState] = useState(false);
  /** Gizmo axis space: world (default) | local. */
  const [gizmoSpace, setGizmoSpaceState] = useState('world');
  /**
   * Scale sub-mode (R toggles while already in scale):
   * face = brush face resize · gizmo = Unreal-style axis scale.
   */
  const [scaleHandleStyle, setScaleHandleStyleState] = useState('face');
  const setTransformMode = useCallback((mode) => {
    const next = mode === 'rotate' || mode === 'scale' ? mode : 'move';
    setTransformModeState(next);
    if (next !== 'move') setPivotEditModeState(false);
    runtimeRef.current?.sceneView?.setTransformMode?.(next);
  }, []);
  const setPivotEditMode = useCallback((enabled) => {
    const on = Boolean(enabled);
    setPivotEditModeState(on);
    if (on) {
      setTransformModeState('move');
      runtimeRef.current?.sceneView?.setTransformMode?.('move');
    }
    runtimeRef.current?.sceneView?.setPivotEditMode?.(on);
  }, []);
  const setGizmoSpace = useCallback((space) => {
    const next = space === 'local' ? 'local' : 'world';
    setGizmoSpaceState(next);
    runtimeRef.current?.sceneView?.setGizmoSpace?.(next);
  }, []);
  const setScaleHandleStyle = useCallback((style) => {
    const next = style === 'gizmo' ? 'gizmo' : 'face';
    setScaleHandleStyleState(next);
    runtimeRef.current?.sceneView?.setScaleHandleStyle?.(next);
  }, []);
  /** Enter scale, or if already scaling toggle face ↔ Unreal gizmo. */
  const cycleScaleTransform = useCallback(() => {
    if (transformMode !== 'scale') {
      setTransformMode('scale');
      runtimeRef.current?.sceneView?.setScaleHandleStyle?.(scaleHandleStyle);
      return scaleHandleStyle;
    }
    const next = scaleHandleStyle === 'face' ? 'gizmo' : 'face';
    setScaleHandleStyle(next);
    return next;
  }, [transformMode, scaleHandleStyle, setTransformMode, setScaleHandleStyle]);
  const [levelName, setLevelName] = useState('test-room.json');
  const [levels, setLevels] = useState([]);
  const [status, setStatusState] = useState('Ready');
  const [gridSize, setGridSizeState] = useState(() => {
    const s = loadEditorSettings();
    return GRID_INCREMENTS.includes(s.gridSize) ? s.gridSize : DEFAULT_GRID_EDITOR_UNITS;
  });
  /** When false, placement/gizmo snaps are freeform (surface contact preserved). */
  const [gridSnap, setGridSnapState] = useState(() => loadEditorSettings().gridSnap !== false);
  const [revision, setRevision] = useState(0);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  /** @type {[{ kind: 'project'|'tutorial', readOnlyDisk: boolean, lessonId: string|null, displayName: string }]} */
  const [levelSession, setLevelSession] = useState({
    kind: 'project',
    readOnlyDisk: false,
    lessonId: null,
    displayName: null,
  });
  const sessionStackRef = useRef([]);
  /** Last loaded/saved content; see dirtyTracking.js. UI shows `dirty`. */
  const savedStateRef = useRef(null);
  if (!savedStateRef.current) savedStateRef.current = new SavedStateTracker();
  const [dirty, setDirty] = useState(false);

  /**
   * Batch 9 — editor-only layer UI (hidden/locked/solo). Not written to level JSON.
   * Solo.previousHidden restores visibility when solo clears.
   */
  const [layerUi, setLayerUi] = useState(() => ({
    hidden: new Set(),
    locked: new Set(),
    solo: { activeLayerId: null, previousHidden: null },
  }));
  const layerUiRef = useRef(layerUi);
  layerUiRef.current = layerUi;

  // Push session layer UI into SceneView so visibility/pick stay in sync without rebuild.
  useEffect(() => {
    runtimeRef.current?.sceneView?.setLayerUi?.(layerUi);
  }, [layerUi]);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  /** Toolbar status only (high-frequency edits / undo). */
  const setStatus = useCallback((message) => {
    setStatusState(String(message ?? ''));
  }, []);

  /** Status bar + editor dialog (user-facing notices, errors, confirmations). */
  const notify = useCallback((message, options = {}) => {
    reportEditorMessage(setStatusState, dialogs, message, { ...options, dialog: true });
  }, [dialogs]);

  /** Reject edits that would exceed carve complexity. Does not touch history. */
  const rejectSubtractIfTooComplex = useCallback((check) => {
    if (!check || check.ok) return false;
    notify(check.message, { title: 'Subtraction Too Complex' });
    return true;
  }, [notify]);

  /** Report unsupported cutter ∩ ConvexBrush intersections (non-blocking). */
  const reportCutterConvexConflicts = useCallback(() => {
    const message = cutterConvexConflictMessage(worldRef.current);
    if (message) {
      notify(message, { title: 'ConvexBrush / Cutter' });
      return true;
    }
    return false;
  }, [notify]);

  const worldRef = useRef(null);
  worldRef.current = world;
  const levelNameRef = useRef(levelName);
  levelNameRef.current = levelName;
  const selectedRef = useRef(selectedActorIds);
  selectedRef.current = selectedActorIds;
  const gridRef = useRef(gridSize);
  gridRef.current = gridSize;
  const gridSnapRef = useRef(gridSnap);
  gridSnapRef.current = gridSnap;

  /** Actor lock including editor-only authoring-layer lock (edit mode only). */
  const isEditorActorLocked = useCallback((actor) => (
    checkEditorActorLocked(actor, worldRef.current, layerUiRef.current, {
      playMode: mode === 'play',
    })
  ), [mode]);

  const rejectIfActiveLayerLocked = useCallback((action = 'create') => {
    if (!isActiveAuthoringLayerLocked(worldRef.current, layerUiRef.current, {
      playMode: mode === 'play',
    })) {
      return false;
    }
    setStatus(`Cannot ${action}: the Active authoring layer is locked. Unlock it in the Layers panel.`);
    return true;
  }, [mode, setStatus]);

  /** Editable subset of selection; status feedback when anything is blocked. */
  const takeEditableSelection = useCallback((action = 'edit') => {
    const ids = selectedRef.current;
    const { editable, blocked } = partitionEditableActorIds(
      ids,
      worldRef.current,
      layerUiRef.current,
      { playMode: mode === 'play' },
    );
    const msg = lockedLayerFeedback(blocked.length, ids.length, action);
    if (msg) setStatus(msg);
    return editable;
  }, [mode, setStatus]);

  const historyRef = useRef(null);
  if (!historyRef.current) {
    historyRef.current = new HistoryStack({
      onChange: (h) => setHistoryFlags({ canUndo: h.canUndo, canRedo: h.canRedo }),
    });
  }

  const syncSelectionVisual = useCallback((ids) => {
    runtimeRef.current?.setSelection(ids);
  }, []);

  const clearSelectedSurfaceState = useCallback(() => {
    setSelectedSurfaceState(null);
    runtimeRef.current?.sceneView?.setSurfaceSelection?.(null);
  }, []);

  const syncGeometrySelectionVisual = useCallback((sel) => {
    const normalized = normalizeGeometrySelection(sel);
    const empty = !normalized.items.length;
    const sceneView = runtimeRef.current?.sceneView;
    if (!sceneView) return;
    if (empty) {
      sceneView.setGeometrySelection?.(null, worldRef.current);
      return;
    }
    const faceNormalWorld = normalized.mode === 'face'
      ? primaryFaceNormalWorld(worldRef.current, normalized)
      : null;
    const center = geometrySelectionWorldCenter(worldRef.current, normalized);
    sceneView.setGeometrySelection?.(normalized, worldRef.current, {
      faceNormalWorld,
      gizmoCenter: center,
    });
  }, []);

  const clearGeometrySelectionState = useCallback(() => {
    const empty = emptyGeometrySelection(geometrySelectionRef.current?.mode || 'face');
    setGeometrySelectionState(empty);
    geometrySelectionRef.current = empty;
    runtimeRef.current?.sceneView?.setGeometrySelection?.(null, worldRef.current);
  }, []);

  const afterWorldMutation = useCallback((options = {}) => {
    // Phase 2F.7C: default to incremental sync. Pass fullSync/resync:'full' for
    // complete reconstruction (load recovery, asset library refresh, etc.).
    const {
      resync = true,
      fullSync = false,
      selectIds,
      geometryLineageByActor = null,
    } = options;
    if (resync) {
      if (fullSync || resync === 'full') {
        runtimeRef.current?.resyncWorld();
      } else {
        runtimeRef.current?.syncIncremental?.();
      }
    }
    const nextIds = selectIds !== undefined ? selectIds : selectedRef.current;
    if (selectIds !== undefined) {
      setSelectedActorIds(selectIds);
      syncSelectionVisual(selectIds);
    } else {
      syncSelectionVisual(selectedRef.current);
    }
    // Drop surface picks whose actor was deselected or deleted.
    setSelectedSurfaceState((prev) => {
      const next = nextSelectedSurfaceAfterActorChange(prev, nextIds, worldRef.current);
      if (next !== prev && !next) {
        runtimeRef.current?.sceneView?.setSurfaceSelection?.(null);
      }
      return next;
    });
    // Re-validate geometry element selection against live ConvexBrush faces.
    setGeometrySelectionState((prev) => {
      let next = nextGeometrySelectionAfterActorChange(prev, nextIds, worldRef.current);
      if (geometryLineageByActor) {
        next = remappedGeometrySelection(next, worldRef.current, geometryLineageByActor);
      } else if (prev?.items?.length) {
        next = remappedGeometrySelection(next, worldRef.current, null);
      }
      geometrySelectionRef.current = next;
      syncGeometrySelectionVisual(next);
      return next;
    });
    bump();
  }, [bump, syncSelectionVisual, syncGeometrySelectionVisual]);

  const executeCommand = useCallback((command, options) => {
    historyRef.current.execute(command);
    afterWorldMutation(options);
    setStatus(command.label || 'Edited');
  }, [afterWorldMutation]);

  /** Record an already-applied command (scrub live preview → one undo entry). */
  const recordCommand = useCallback((command, options = {}) => {
    historyRef.current.record(command);
    afterWorldMutation({ resync: false, ...options });
    setStatus(command.label || 'Edited');
  }, [afterWorldMutation]);

  const assetResolverRef = useRef(assetResolver);
  assetResolverRef.current = assetResolver;

  const attachCanvas = useCallback((canvas) => {
    if (!canvas) return null;
    if (runtimeRef.current) {
      runtimeRef.current.dispose();
    }
    const runtime = new GameRuntime({
      canvas,
      onModeChange: (m) => setMode(m),
    });
    runtimeRef.current = runtime;
    runtime.setGridSize(gridRef.current);
    runtime.setAssetResolver(assetResolverRef.current);
    if (worldRef.current) {
      runtime.setWorld(worldRef.current);
      runtime.setSelection(selectedRef.current);
    }
    runtime.startEditLoop();
    return runtime;
  }, []);

  useEffect(() => {
    if (!runtimeRef.current) return;
    runtimeRef.current.setAssetResolver(assetResolver);
    // Refresh placed material instances when asset definitions change (Phase 2E.4).
    // Does not mark the level dirty — material assets are separate from level undo.
    if (assetRevision > 0 && worldRef.current) {
      runtimeRef.current.resyncWorld();
    }
  }, [assetResolver, assetRevision]);

  const {
    applyLevelData,
    beginTutorialSession,
    confirmDiscardChanges,
    createNewMap,
    endAllTutorialSessions,
    endTutorialSession,
    loadLevel,
    loadLevelUnchecked,
    refreshLevels,
    restartTutorialSession,
    saveAll,
    saveLevel,
    saveLevelAs,
    saveTutorialWorkAs,
    setGridSize,
    setGridSnap,
  } = useLevelLifecycle({
    bump,
    dialogs,
    geometrySelectionRef,
    gridRef,
    gridSnapRef,
    historyRef,
    levelName,
    levelNameRef,
    levelSession,
    notify,
    runtimeRef,
    savedStateRef,
    sessionStackRef,
    setAlignReferenceSurfaceState,
    setDirty,
    setGeometryModeState,
    setGeometrySelectionState,
    setGridSizeState,
    setGridSnapState,
    setLevelName,
    setLevelSession,
    setLevels,
    setMode,
    setSelectedActorIds,
    setSelectedSurfaceState,
    setStatus,
    setTool,
    setWorld,
    world,
    worldRef,
  });

  // Startup load. Runs exactly once: it reads the latest callbacks through a
  // ref so a changing callback identity can never reload (and so replace) the
  // authored world.
  const startupRef = useRef({ started: false });
  startupRef.current.refreshLevels = refreshLevels;
  startupRef.current.loadLevel = loadLevelUnchecked;
  startupRef.current.notify = notify;
  useEffect(() => {
    if (startupRef.current.started) return;
    startupRef.current.started = true;
    const run = startupRef.current;
    run.refreshLevels()
      .then(() => run.loadLevel(STARTUP_LEVEL))
      .catch((err) => {
        run.notify(`Init failed: ${err.message}`);
      });
  }, []);

  // Recompute the dirty indicator after edits settle (serializing the world
  // is too heavy to do on every drag frame).
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDirty(savedStateRef.current.isDirty(worldRef.current));
    }, DIRTY_RECHECK_MS);
    return () => window.clearTimeout(id);
  }, [revision, historyFlags, world]);

  // Browser-level guard against closing the tab with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!savedStateRef.current.isDirty(worldRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

    const {
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
  } = useSelectionAndCreation({
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
  });

    const {
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
    reorderSelectedBeside,
    setSelectedActorFlags,
    updateSelectedContentOffset,
    updateSelectedTransform,
  } = useTransformEditing({
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
  });

    const {
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
  } = useAuthoringLayers({
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
  });

  const {
    createOutlinerCategory,
    renameOutlinerCategoryById,
    deleteOutlinerCategoryById,
    setOutlinerCategoryIconColorById,
    placeOutlinerRoots,
  } = useOutlinerLayout({
    bump,
    executeCommand,
    mode,
    world,
  });

    const {
    addBrushOpening,
    removeBrushOpening,
    setSelectedBrushOpenings,
    updateBrushOpening,
    updateSelectedBrush,
  } = useBrushEditing({
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
  });

    const {
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
  } = useComponentAndWorldEditing({
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
  });

    const {
    commitStaticMeshGesture,
    joinSelectedWallToNearest,
    updateSelectedArch,
    updateSelectedColumn,
    updateSelectedCurvedWall,
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedStaticMesh,
  } = useParametricShapeEditing({
    autoCapturePrefabOverrides,
    bump,
    executeCommand,
    gridRef,
    isEditorActorLocked,
    mode,
    rebuildSelectedActorVisual,
    recordCommand,
    selectedRef,
    setStatus,
    world,
  });

    const {
    applyPrefabSourceUpdate,
    createPrefabFromSelection,
    placeEnvironment,
    placeLight,
    placeMeshAsset,
    placePlayerSpawn,
    placePrefabAsset,
    placePrimitiveMesh,
    recordSelectedPrefabOverride,
    revertSelectedPrefabOverride,
    unpackSelectedPrefab,
    updatePrefabAssetFromSelection,
  } = usePlacementAndPrefabs({
    assetRegistry,
    bump,
    executeCommand,
    getPrefabDefinition,
    getPrefabDefinitionSync,
    gridRef,
    gridSnapRef,
    mode,
    notify,
    rejectIfActiveLayerLocked,
    savePrefabDefinition,
    selectedRef,
    world,
  });

    const {
    alignSurfaceToReference,
    convertActorToConvexBrush,
    convertSelectedToConvexBrush,
    setAlignReferenceSurface,
    setGeometryMode,
    setGeometrySelection,
    setSelectedSurface,
    updateSelectedConvexBrush,
  } = useSurfaceAndGeometryModes({
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
  });

    const {
    addClipPoint,
    beginClipSession,
    cancelClipSession,
    clearExtrudePreview,
    commitClipSession,
    commitExtrudeFace,
    previewExtrudeFace,
    setClipPlaneFromFace,
    setClipSessionMode,
  } = useExtrudeAndClip({
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
  });

    const {
    applySelectedMaterialToBrush,
    assignSelectedSurfaceMaterial,
    assignSelectedSurfaceUv,
    canFitSelectedSurfaceUv,
    fitSelectedSurfaceUv,
    getSelectedSurfaceMaterialId,
    resetSelectedSurfaceUv,
  } = useSurfaceMaterials({
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
  });

  const renameSelected = useCallback((name) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (isEditorActorLocked(actor)) {
      setStatus('Cannot rename: actor or authoring layer is locked.');
      return;
    }
    if (!actor || actor.name === name) return;
    executeCommand(
      new RenameActorCommand({
        world,
        actorId,
        before: actor.name,
        after: name,
      }),
      { resync: false },
    );
    autoCapturePrefabOverrides([actorId]);
    bump();
  }, [world, mode, executeCommand, bump, autoCapturePrefabOverrides]);

  const undo = useCallback(() => {
    if (mode === 'play') return;
    const cmd = historyRef.current.undo();
    if (!cmd) return;
    afterWorldMutation({ selectIds: selectedRef.current.filter((id) => worldRef.current?.getActor(id)) });
    setStatus(`Undo: ${cmd.label || 'edit'}`);
  }, [mode, afterWorldMutation, setStatus]);

  const redo = useCallback(() => {
    if (mode === 'play') return;
    const cmd = historyRef.current.redo();
    if (!cmd) return;
    afterWorldMutation({});
    setStatus(`Redo: ${cmd.label || 'edit'}`);
  }, [mode, afterWorldMutation, setStatus]);

  const play = useCallback(async () => {
    const runtime = runtimeRef.current;
    // A second click while Rapier is still initializing must not start another session.
    if (!runtime || runtime.isPlayActive) return;
    setTool('select');
    setStatus('Play mode — click viewport to capture mouse');
    try {
      // History is kept: commands address actors by id and Stop restores the
      // same ids, so Undo/Redo remain valid across a Play session.
      await runtime.play();
    } catch (err) {
      notify(`Play failed: ${err.message}`);
    }
  }, [notify, setStatus, setTool]);

  const stop = useCallback(() => {
    if (!runtimeRef.current) return;
    runtimeRef.current.stop();
    setWorld(runtimeRef.current.world);
    setSelectedActorIds([]);
    clearGeometrySelectionState();
    clearSelectedSurfaceState();
    setStatus('Edit mode restored');
    bump();
  }, [bump, clearGeometrySelectionState, clearSelectedSurfaceState, setStatus]);

  const selectedActor = useMemo(() => {
    if (!world || selectedActorIds.length === 0) return null;
    const id = selectedActorIds[selectedActorIds.length - 1];
    return world.getActor(id);
  }, [world, selectedActorIds, revision]);

  const value = {
    runtimeRef,
    world,
    selectedActorIds,
    selectedActorId: selectedActorIds[selectedActorIds.length - 1] || null,
    selectedActor,
    mode,
    tool,
    setTool,
    selectedSurface,
    setSelectedSurface,
    alignReferenceSurface,
    setAlignReferenceSurface,
    alignSurfaceToReference,
    assignSelectedSurfaceMaterial,
    assignSelectedSurfaceUv,
    resetSelectedSurfaceUv,
    fitSelectedSurfaceUv,
    canFitSelectedSurfaceUv,
    getSelectedSurfaceMaterialId,
    geometryMode,
    setGeometryMode,
    geometrySelection,
    setGeometrySelection,
    beginFaceMoveDrag,
    previewFaceMove,
    commitFaceMove,
    cancelFaceMove,
    transformMode,
    setTransformMode,
    pivotEditMode,
    setPivotEditMode,
    gizmoSpace,
    setGizmoSpace,
    scaleHandleStyle,
    setScaleHandleStyle,
    cycleScaleTransform,
    commitPivotChanges,
    applyPivotPresetToSelected,
    updateSelectedContentOffset,
    levelName,
    setLevelName,
    levels,
    status,
    setStatus,
    notify,
    gridSize,
    setGridSize,
    gridSnap,
    setGridSnap,
    gridIncrements: GRID_INCREMENTS,
    revision,
    canUndo: historyFlags.canUndo,
    canRedo: historyFlags.canRedo,
    attachCanvas,
    loadLevel,
    saveLevel,
    saveLevelAs,
    saveAll,
    createNewMap,
    isDirty: dirty,
    confirmDiscardChanges,
    applyLevelData,
    levelSession,
    beginTutorialSession,
    endTutorialSession,
    endAllTutorialSessions,
    restartTutorialSession,
    saveTutorialWorkAs,
    refreshLevels,
    selectActor,
    selectActors,
    selectAllActors,
    deselectAllActors,
    cycleGridSize,
    toggleGridSnap,
    createBrushAtBounds,
    deleteSelected,
    duplicateSelected,
    commitTransforms,
    commitBrushGeometry,
    previewActorPositions,
    previewActorLocalTransforms,
    previewBrushGeometry,
    updateSelectedTransform,
    updateSelectedBrush,
    updateSelectedConvexBrush,
    convertSelectedToConvexBrush,
    convertActorToConvexBrush,
    reportCutterConvexConflicts,
    clipSession,
    extrudePreview,
    previewExtrudeFace,
    commitExtrudeFace,
    clearExtrudePreview,
    beginClipSession,
    setClipSessionMode,
    cancelClipSession,
    addClipPoint,
    setClipPlaneFromFace,
    commitClipSession,
    setSelectedBrushOpenings,
    addBrushOpening,
    updateBrushOpening,
    removeBrushOpening,
    updateSelectedLight,
    commitLightGesture,
    updateSelectedEnvironment,
    commitEnvironmentGesture,
    updateSelectedPrimitiveMesh,
    commitPrimitiveMeshGesture,
    updateWorldAmbient,
    commitWorldAmbientGesture,
    updateWorldScene,
    commitWorldSceneGesture,
    updateWorldRenderer,
    commitWorldRendererGesture,
    updateWorldPostProcessing,
    resetWorldPostProcessingEffect,
    resetWorldPostProcessingAll,
    updateSelectedStaticMesh,
    commitStaticMeshGesture,
    getStaticMeshSlots: (actorId) => (
      runtimeRef.current?.sceneView?.getStaticMeshSlots?.(actorId) || []
    ),
    getStaticMeshTriangleCounts: (actorId) => (
      runtimeRef.current?.sceneView?.getStaticMeshTriangleCounts?.(actorId) || []
    ),
    updateSelectedRamp,
    updateSelectedStair,
    updateSelectedColumn,
    updateSelectedArch,
    updateSelectedCurvedWall,
    joinSelectedWallToNearest,
    placeMeshAsset,
    placeLight,
    placeEnvironment,
    placePrimitiveMesh,
    placePlayerSpawn,
    placePrefabAsset,
    createPrefabFromSelection,
    updatePrefabAssetFromSelection,
    applyPrefabSourceUpdate,
    unpackSelectedPrefab,
    recordSelectedPrefabOverride,
    revertSelectedPrefabOverride,
    applySelectedMaterialToBrush,
    reparentSelected,
    reorderSelectedBeside,
    createCell,
    assignSelectedToCell,
    setSelectedActorFlags,
    layerUi,
    isEditorActorLocked,
    setActiveAuthoringLayer,
    assignActorsToAuthoringLayer,
    assignSelectedToAuthoringLayer,
    createAuthoringLayer,
    updateAuthoringLayer,
    reorderAuthoringLayers,
    deleteAuthoringLayerById,
    toggleAuthoringLayerHidden,
    toggleAuthoringLayerLocked,
    setAuthoringLayerSolo,
    selectActorsInAuthoringLayer,
    createOutlinerCategory,
    renameOutlinerCategoryById,
    deleteOutlinerCategoryById,
    setOutlinerCategoryIconColorById,
    placeOutlinerRoots,
    getWorldTransform: (actor) => (world && actor ? getWorldTransform(actor, world) : null),
    renameSelected,
    resizeBrushFace,
    undo,
    redo,
    play,
    stop,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
