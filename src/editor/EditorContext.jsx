import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { loadLevelFile, saveLevelFile, listLevels } from '../io/levelFileApi.js';
import { SavedStateTracker, levelFingerprint } from './dirtyTracking.js';
import { runSaveAll } from './saveAllRegistry.js';
import {
  createNewMapLevelData,
  normalizeLevelFileName as normalizeNewMapFileName,
  STRUCTURAL_BRUSH_KINDS,
  structuralBrushesAreSubtractive,
} from './newMapFactory.js';
import {
  snapToGrid,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_INCREMENTS,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import {
  getBrushSnapSize,
  snapCenterByEdges,
} from './gridSnap.js';
import { loadEditorSettings } from './editorSettingsPrefs.js';
import { GameRuntime } from '../runtime/GameRuntime.js';
import { HistoryStack } from './history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetTransformsCommand,
  SetPivotCommand,
  SetBrushGeometryCommand,
  RenameActorCommand,
  SetBrushColorCommand,
  SetBrushMaterialCommand,
  SetBrushOpeningsCommand,
  SetLightPropertiesCommand,
  SetEnvironmentPropertiesCommand,
  SetPrimitiveMeshPropertiesCommand,
  SetWorldPostProcessingCommand,
  SetWorldSceneCommand,
  SetWorldAmbientCommand,
  SetWorldRendererCommand,
  SetStaticMeshPropertiesCommand,
  SetRampPropertiesCommand,
  SetStairPropertiesCommand,
  SetColumnPropertiesCommand,
  SetArchPropertiesCommand,
  SetCurvedWallPropertiesCommand,
  JoinWallEndpointsCommand,
  ReparentActorsCommand,
  SetActorFlagsCommand,
  ReplaceActorsCommand,
  SetPrefabOverridesCommand,
  ConvertBrushToConvexCommand,
  SetConvexBrushPropertiesCommand,
  SetConvexGeometryCommand,
  CompositeCommand,
  SetAuthoringLayersTreeCommand,
  SetActorsAuthoringLayerCommand,
  SetActiveAuthoringLayerCommand,
} from './history/commands.js';
import {
  stampAuthoringLayer,
  assignAuthoringLayer,
  getActiveAuthoringLayerId,
} from './authoringLayerStamp.js';
import {
  deleteAuthoringLayer,
  normalizeAuthoringLayersState,
  normalizeAuthoringLayer,
  createAuthoringLayerId,
  wouldCreateLayerCycle,
  getDefaultAuthoringLayerId,
  getLayerDescendantIds,
  resolveAuthoringLayerId,
  isActorAuthoringLayerLocked,
} from '../core/authoringLayers.js';
import {
  emptyGeometrySelection,
  nextGeometrySelectionAfterActorChange,
  normalizeGeometrySelection,
  remappedGeometrySelection,
  toolKeepsGeometrySelection,
} from './geometryEditing/geometrySelection.js';
import {
  applyGeometryMove,
  captureGeometryMoveStart,
  geometrySelectionWorldCenter,
  primaryFaceNormalWorld,
  snapWorldDelta,
} from './geometryEditing/faceMove.js';
import {
  localPlaneFromSelectedFace,
  localPointToWorld,
  planClip,
  planFaceExtrusion,
  planesByActorIdFromWorldPoints,
  previewClip,
  snapExtrudeDistance,
  worldPointsToLocalPlane,
} from './geometryEditing/extrudeClip.js';
import { vertexMap } from '../geometry/convexBrush.js';
import { convertBrushToConvexGeometry } from '../geometry/convert.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import {
  canConvertActorToConvex,
  cutterConvexConflictMessage,
} from '../rules/convexBrushRules.js';
import {
  createBrushFromBounds,
  duplicateActors,
  resizeBrushFace,
} from './brushFactory.js';
import { createRampFromBounds } from './rampFactory.js';
import { createStairFromBounds } from './stairFactory.js';
import { createColumnFromBounds } from './columnFactory.js';
import { createArchFromBounds } from './archFactory.js';
import { createCurvedWallFromBounds } from './curvedWallFactory.js';
import { DEFAULT_RAMP_RISE, RAMP_DIRECTIONS } from '../components/RampComponent.js';
import { defaultsForStairType, STAIR_TYPES } from '../components/StairComponent.js';
import { COLUMN_SHAPES, DEFAULT_COLUMN_HEIGHT } from '../components/ColumnComponent.js';
import { ARCH_TYPES, DEFAULT_ARCH_OPENING_HEIGHT, DEFAULT_ARCH_RISE } from '../components/ArchComponent.js';
import { DEFAULT_CURVED_WALL_SWEEP } from '../components/CurvedWallComponent.js';
import {
  findNearestWallEndpoint,
  getWallEndpoints,
  planWallEndpointJoin,
  WALL_ENDPOINT_SNAP_DIST,
} from '../runtime/wallEndpoints.js';
import { createStaticMeshActor } from './meshFactory.js';
import {
  applyPivotPreset,
  actorSupportsPivotEdit,
} from '../rules/pivotEdit.js';
import {
  applyActorLocalPivotDelta,
  normalizeContentOffset,
  snapshotPivotState,
} from '../core/contentOffset.js';
import { createLightActor } from './lightFactory.js';
import { createEnvironmentActor } from './environmentFactory.js';
import { createPrimitiveMeshActor } from './primitiveMeshFactory.js';
import {
  normalizePrimitiveMeshFields,
  validatePrimitiveAllocation,
} from '../components/PrimitiveMeshComponent.js';
import { normalizeStaticMeshFields } from '../components/StaticMeshComponent.js';
import { createCellActor } from './cellFactory.js';
import { createPlayerSpawnActor } from './spawnFactory.js';
import { useAssetBrowser } from './assets/AssetBrowserContext.jsx';
import { findAsset } from '../assets/AssetRegistry.js';
import {
  getWorldTransform,
  reparentActor,
  setWorldTransform,
  isEffectivelyLocked,
} from '../core/hierarchy.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
  syncPrefabInstances,
  unpackPrefabInstance,
  getInstanceActors,
  findInstanceRoot,
  clearOverride,
  recordPrefabOverridesForActors,
  recordActorPrefabOverride,
  getOverrides as getPrefabOverrides,
} from '../prefabs/prefabOps.js';
import { Actor } from '../core/Actor.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import {
  createDefaultOpening,
  isWallBrush,
  normalizeOpenings,
  validateOpenings,
} from '../runtime/wallOpenings.js';
import { validateWorldSubtractComplexity } from '../runtime/brushGeometry.js';
import {
  migrateLegacyWorldAmbient,
  normalizeWorldAmbient,
  normalizeWorldScene,
  normalizeWorldFog,
  normalizeWorldRenderer,
} from '../core/World.js';
import {
  mergePostProcessing,
  normalizePostProcessing,
  resetAllPostProcessing,
  resetEffectInPostProcessing,
} from '../runtime/postprocessing/postProcessingState.js';
import { computeAlignFaceUv } from '../rules/alignSurfaces.js';
import {
  computeFitSurfaceUv,
  structuralFaceSizeEditorUnits,
} from '../rules/faceUvFit.js';
import {
  getStructuralComponent,
  patchFaceMaterial,
  patchFaceUv,
  resolveSurfaceMaterialId,
} from '../runtime/surfaces.js';
import {
  nextSelectedSurfaceAfterActorChange,
  shouldApplyMaterialToSurface,
  toolKeepsSurfaceSelection,
} from './surfaceSelection.js';
import { useEditorDialogs } from '../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../ui/dialogs/reportEditorMessage.js';

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

  /** Actor lock including editor-only authoring-layer lock (edit mode only). */
  const isEditorActorLocked = useCallback((actor) => {
    if (!actor || !worldRef.current) return false;
    if (isEffectivelyLocked(actor, worldRef.current)) return true;
    if (mode === 'play') return false;
    return isActorAuthoringLayerLocked(actor, worldRef.current, layerUiRef.current);
  }, [mode]);

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

  const persistGridPrefs = useCallback((partial) => {
    // Keep Editor Settings in sync when grid is changed from the toolbar / View menu.
    window.dispatchEvent(new CustomEvent('bb:editor-settings-patch', { detail: partial }));
  }, []);

  const setGridSize = useCallback((value) => {
    const next = Number(value);
    const size = GRID_INCREMENTS.includes(next) ? next : (next || DEFAULT_GRID_EDITOR_UNITS);
    setGridSizeState(size);
    runtimeRef.current?.setGridSize(size);
    persistGridPrefs({ gridSize: size });
  }, [persistGridPrefs]);

  const setGridSnap = useCallback((value) => {
    const next = typeof value === 'function' ? value(gridSnapRef.current) : Boolean(value);
    setGridSnapState(next);
    persistGridPrefs({ gridSnap: next });
  }, [persistGridPrefs]);

  /**
   * Replace the authored world. `savedFingerprint` overrides the clean baseline
   * (used when restoring a world that still has unsaved edits).
   */
  const applyLevelData = useCallback((data, {
    fileName = null,
    session = null,
    statusMessage = null,
    savedFingerprint,
  } = {}) => {
    const resolved = (data && typeof data.addActor === 'function')
      ? data
      : deserializeLevel(data);

    historyRef.current.clear();
    const currentFingerprint = levelFingerprint(resolved);
    const baseline = savedFingerprint !== undefined ? savedFingerprint : currentFingerprint;
    savedStateRef.current.markSaved(baseline);
    setDirty(baseline !== currentFingerprint);
    setWorld(resolved);
    if (fileName != null) setLevelName(fileName);
    setSelectedActorIds([]);
    setTool('select');
    // Level load must not keep a stale surface/align/geometry pick from the prior world.
    setSelectedSurfaceState(null);
    setAlignReferenceSurfaceState(null);
    {
      const empty = emptyGeometrySelection('face');
      setGeometryModeState('face');
      setGeometrySelectionState(empty);
      geometrySelectionRef.current = empty;
    }
    if (session) setLevelSession(session);
    if (runtimeRef.current) {
      if (runtimeRef.current.mode === 'play') {
        runtimeRef.current.stop();
      }
      runtimeRef.current.setWorld(resolved);
      runtimeRef.current.setSelection([]);
      runtimeRef.current.sceneView?.setSurfaceSelection?.(null);
      runtimeRef.current.sceneView?.setAlignReferenceSurface?.(null);
      runtimeRef.current.sceneView?.setGeometrySelection?.(null, resolved);
    }
    if (statusMessage) setStatus(statusMessage);
    bump();
    return resolved;
  }, [bump, setStatus]);

  const refreshLevels = useCallback(async () => {
    try {
      const list = await listLevels();
      setLevels(list);
    } catch (err) {
      notify(`Level list failed: ${err.message}`);
    }
  }, [notify]);

  /** Load without any unsaved-changes check. Throws on failure. */
  const loadLevelUnchecked = useCallback(async (name) => {
    setStatus(`Loading ${name}…`);
    const data = await loadLevelFile(name);
    return applyLevelData(data, {
      fileName: name,
      session: {
        kind: 'project',
        readOnlyDisk: false,
        lessonId: null,
        displayName: name,
      },
      statusMessage: `Loaded ${name}`,
    });
  }, [applyLevelData, setStatus]);

  /** True when the current world differs from its last loaded/saved state. */
  const isDirtyNow = useCallback(
    () => savedStateRef.current.isDirty(worldRef.current),
    [],
  );

  /** Resolves true when it is safe to replace the world (clean, or user agreed). */
  const confirmDiscardChanges = useCallback(async (actionLabel = 'Continue') => {
    if (!isDirtyNow()) return true;
    return dialogs.confirm(
      `“${levelNameRef.current}” has unsaved changes. ${actionLabel} and discard them?`,
      { title: 'Unsaved Changes', confirmLabel: 'Discard Changes', tone: 'warning' },
    );
  }, [dialogs, isDirtyNow]);

  /** User-facing load (menus): confirms before discarding edits, reports errors. */
  const loadLevel = useCallback(async (name) => {
    if (!(await confirmDiscardChanges(`Load ${name}`))) return null;
    try {
      return await loadLevelUnchecked(name);
    } catch (err) {
      notify(`Load failed: ${err.message}`);
      return null;
    }
  }, [confirmDiscardChanges, loadLevelUnchecked, notify]);

  const beginTutorialSession = useCallback(async ({ lessonId, levelData, starterPath }) => {
    if (!lessonId) throw new Error('beginTutorialSession requires lessonId');
    if (runtimeRef.current?.mode === 'play') {
      runtimeRef.current.stop();
      setMode('edit');
    }
    const currentWorld = worldRef.current;
    if (currentWorld) {
      sessionStackRef.current.push({
        snapshot: serializeLevel(currentWorld),
        levelName,
        session: { ...levelSession },
        // Keep the clean baseline so unsaved edits are still "dirty" after restore.
        savedFingerprint: savedStateRef.current.savedFingerprint,
      });
    }
    let data = levelData;
    if (!data && starterPath) {
      // Static public path (supports tutorials/ subfolder); not the basename-only file API.
      const res = await fetch(`/levels/${starterPath}`);
      if (!res.ok) throw new Error(`Failed to load tutorial starter: ${starterPath}`);
      data = await res.json();
    }
    if (!data) throw new Error('Tutorial starter level data missing');
    return applyLevelData(data, {
      fileName: levelName, // keep project filename for restore; disk writes blocked
      session: {
        kind: 'tutorial',
        readOnlyDisk: true,
        lessonId,
        displayName: starterPath || lessonId,
      },
      statusMessage: `Tutorial: ${lessonId}`,
    });
  }, [applyLevelData, levelName, levelSession]);

  const endTutorialSession = useCallback(() => {
    const prev = sessionStackRef.current.pop();
    if (!prev) {
      setLevelSession({
        kind: 'project',
        readOnlyDisk: false,
        lessonId: null,
        displayName: null,
      });
      return null;
    }
    return applyLevelData(prev.snapshot, {
      fileName: prev.levelName,
      session: prev.session || {
        kind: 'project',
        readOnlyDisk: false,
        lessonId: null,
        displayName: prev.levelName,
      },
      statusMessage: `Restored ${prev.levelName}`,
      savedFingerprint: prev.savedFingerprint,
    });
  }, [applyLevelData]);

  const restartTutorialSession = useCallback(async ({ lessonId, levelData, starterPath }) => {
    // Replace current tutorial world without popping the project stack entry.
    if (levelSession.kind !== 'tutorial') {
      return beginTutorialSession({ lessonId, levelData, starterPath });
    }
    let data = levelData;
    if (!data && starterPath) {
      const res = await fetch(`/levels/${starterPath}`);
      if (!res.ok) throw new Error(`Failed to load tutorial starter: ${starterPath}`);
      data = await res.json();
    }
    return applyLevelData(data, {
      fileName: levelName,
      session: {
        kind: 'tutorial',
        readOnlyDisk: true,
        lessonId: lessonId || levelSession.lessonId,
        displayName: starterPath || levelSession.displayName,
      },
      statusMessage: 'Tutorial restarted',
    });
  }, [applyLevelData, beginTutorialSession, levelName, levelSession]);

  const saveTutorialWorkAs = useCallback(async (fileName) => {
    if (!world) return null;
    if (runtimeRef.current?.mode === 'play') {
      notify('Stop Play before saving');
      return null;
    }
    let name = String(fileName || '').trim();
    if (!name) return null;
    if (!name.endsWith('.json')) name = `${name}.json`;
    // Basename only — matches level file API safety rules.
    name = name.split(/[/\\]/).pop();
    const data = serializeLevel(world);
    data.name = data.name || name.replace(/\.json$/i, '');
    // Fingerprint what is being written, so edits made during the request stay dirty.
    const writtenFingerprint = levelFingerprint(world);
    try {
      await saveLevelFile(name, data);
    } catch (err) {
      // A failed write must not clear dirty state or end the tutorial session.
      notify(`Save failed: ${err.message}`);
      return null;
    }
    savedStateRef.current.markSaved(writtenFingerprint);
    setDirty(savedStateRef.current.isDirty(worldRef.current));
    // Exit tutorial into a normal project session targeting the new file.
    sessionStackRef.current = [];
    setLevelSession({
      kind: 'project',
      readOnlyDisk: false,
      lessonId: null,
      displayName: name,
    });
    setLevelName(name);
    notify(`Saved tutorial work as ${name}`);
    await refreshLevels();
    return name;
  }, [world, notify, refreshLevels]);

  const normalizeLevelFileName = useCallback((fileName) => {
    let name = String(fileName || '').trim();
    if (!name) return null;
    if (!name.endsWith('.json')) name = `${name}.json`;
    // Basename only — matches level file API safety rules.
    return name.split(/[/\\]/).pop() || null;
  }, []);

  const writeLevelFile = useCallback(async (fileName) => {
    if (!world) return null;
    const name = normalizeLevelFileName(fileName);
    if (!name) return null;
    const data = serializeLevel(world);
    data.name = data.name || name.replace(/\.json$/i, '');
    const writtenFingerprint = levelFingerprint(world);
    try {
      await saveLevelFile(name, data);
    } catch (err) {
      notify(`Save failed: ${err.message}`);
      return null;
    }
    savedStateRef.current.markSaved(writtenFingerprint);
    setDirty(savedStateRef.current.isDirty(worldRef.current));
    setLevelName(name);
    notify(`Saved ${name}`);
    await refreshLevels();
    return name;
  }, [world, normalizeLevelFileName, notify, refreshLevels]);

  const saveLevel = useCallback(async () => {
    if (!world) return;
    if (runtimeRef.current?.mode === 'play') {
      notify('Stop Play before saving');
      return;
    }
    if (levelSession.readOnlyDisk || levelSession.kind === 'tutorial') {
      const name = await dialogs.prompt(
        'Tutorial levels are not saved over your project. Enter a new level filename to keep this work:',
        {
          title: 'Save tutorial work as…',
          initialValue: 'my-tutorial-room.json',
        },
      );
      if (!name) return;
      await saveTutorialWorkAs(name);
      return;
    }
    await writeLevelFile(levelName);
  }, [world, levelName, notify, levelSession, dialogs, saveTutorialWorkAs, writeLevelFile]);

  /** Unreal-style Save All: dirty content modules only (level + registered assets). Not layout. */
  const saveAll = useCallback(async () => {
    if (runtimeRef.current?.mode === 'play') {
      notify('Stop Play before saving');
      return { saved: [], skipped: [], errors: [] };
    }
    const levelMod = {
      id: 'level',
      label: levelName || 'Level',
      isDirty: () => savedStateRef.current.isDirty(worldRef.current),
      save: async () => {
        await saveLevel();
      },
    };
    const result = await runSaveAll([levelMod]);
    if (result.errors.length) {
      notify(`Save All: ${result.errors.map((e) => `${e.label} (${e.error})`).join('; ')}`);
    } else if (result.saved.length) {
      notify(`Saved ${result.saved.join(', ')}`);
    } else {
      notify('Nothing to save');
    }
    return result;
  }, [levelName, notify, saveLevel]);

  const saveLevelAs = useCallback(async () => {
    if (!world) return;
    if (runtimeRef.current?.mode === 'play') {
      notify('Stop Play before saving');
      return;
    }
    if (levelSession.readOnlyDisk || levelSession.kind === 'tutorial') {
      const name = await dialogs.prompt(
        'Tutorial levels are not saved over your project. Enter a new level filename to keep this work:',
        {
          title: 'Save tutorial work as…',
          initialValue: 'my-tutorial-room.json',
        },
      );
      if (!name) return;
      await saveTutorialWorkAs(name);
      return;
    }
    const name = await dialogs.prompt('Save level as:', {
      title: 'Save Level As',
      initialValue: levelName || 'untitled.json',
    });
    if (!name?.trim()) return;
    await writeLevelFile(name);
  }, [world, levelName, notify, levelSession, dialogs, saveTutorialWorkAs, writeLevelFile]);

  /**
   * File → New Map… — create additive (empty) or subtractive (World Solid) level,
   * write to disk, and load it into the editor.
   */
  const createNewMap = useCallback(async ({ fileName, mapMode = 'additive' } = {}) => {
    if (runtimeRef.current?.mode === 'play') {
      notify('Stop Play before creating a new map');
      return null;
    }
    if (!(await confirmDiscardChanges('Create a new map'))) return null;

    const name = normalizeNewMapFileName(fileName)
      || normalizeLevelFileName(fileName);
    if (!name) {
      notify('Enter a level filename.');
      return null;
    }

    const displayName = name.replace(/\.json$/i, '') || 'Untitled Level';
    const data = createNewMapLevelData({
      name: displayName,
      mapMode,
      gridSize: gridRef.current,
    });

    try {
      await saveLevelFile(name, data);
    } catch (err) {
      notify(`Create map failed: ${err.message}`);
      return null;
    }

    sessionStackRef.current = [];
    applyLevelData(data, {
      fileName: name,
      session: {
        kind: 'project',
        readOnlyDisk: false,
        lessonId: null,
        displayName: name,
      },
      statusMessage: `Created ${name} (${mapMode === 'subtractive' ? 'subtractive' : 'additive'})`,
    });
    await refreshLevels();
    notify(`New ${mapMode === 'subtractive' ? 'subtractive' : 'additive'} map: ${name}`);
    return name;
  }, [
    confirmDiscardChanges,
    normalizeLevelFileName,
    applyLevelData,
    refreshLevels,
    notify,
  ]);

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
  }, [world, mode, executeCommand, rejectSubtractIfTooComplex, reportCutterConvexConflicts]);

  const deleteSelected = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const ids = selectedRef.current.filter((id) => {
      const actor = world.getActor(id);
      return actor && !isEditorActorLocked(actor);
    });
    if (!ids.length) {
      setStatus('Selection is locked');
      return;
    }
    executeCommand(
      new RemoveActorsCommand({ world, actorIds: ids, label: 'Delete' }),
      { selectIds: [] },
    );
  }, [world, mode, executeCommand, isEditorActorLocked, setStatus]);

  const duplicateSelected = useCallback(({ offset = null, label = 'Duplicate' } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return [];
    const actors = selectedRef.current
      .map((id) => world.getActor(id))
      .filter(Boolean);
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
  }, [world, mode, executeCommand, rejectSubtractIfTooComplex]);

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
    const start = captureGeometryMoveStart(world, sel);
    if (!start.length) return false;
    faceMovePreviewRef.current = { start, lastValid: null, lastResult: null };
    return true;
  }, [world, mode]);

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
    if (!actor) return;
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
    executeCommand(
      new SetActorsAuthoringLayerCommand({
        world,
        assignments: actorIds.map((actorId) => ({ actorId, authoringLayerId: layerId })),
      }),
      { resync: true },
    );
  }, [world, mode, ensureAuthoringLayers, executeCommand]);

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

  const updateSelectedBrush = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush) return;

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

  const updateSelectedLight = useCallback((partial, options = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const { undoable = true, label = 'Edit light' } = options;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const light = world.getActor(actorId)?.getComponent('Light');
    if (!light) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = structuredClone(light[key]);
      after[key] = structuredClone(partial[key]);
    }
    if (!undoable) {
      for (const key of Object.keys(after)) {
        light[key] = after[key];
      }
      const actor = world.getActor(actorId);
      if (actor) runtimeRef.current?.sceneView?.rebuildActorVisual?.(actor, world);
      bump();
      return;
    }
    executeCommand(
      new SetLightPropertiesCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides, bump]);

  /**
   * After a live (non-undoable) light scrub, record one undo entry from
   * `beforeSnapshot` → current light fields without re-applying.
   */
  const commitLightGesture = useCallback((beforeSnapshot, label = 'Edit light') => {
    if (!world || mode === 'play' || !beforeSnapshot || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const light = world.getActor(actorId)?.getComponent('Light');
    if (!light) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(beforeSnapshot)) {
      before[key] = structuredClone(beforeSnapshot[key]);
      after[key] = structuredClone(light[key]);
    }
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    recordCommand(
      new SetLightPropertiesCommand({ world, actorId, before, after, label }),
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedEnvironment = useCallback((partial, options = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const { undoable = true, label = 'Edit environment' } = options;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const env = world.getActor(actorId)?.getComponent('Environment');
    if (!env) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = structuredClone(env[key]);
      after[key] = structuredClone(partial[key]);
    }
    if (!undoable) {
      for (const key of Object.keys(after)) {
        env[key] = after[key];
      }
      const actor = world.getActor(actorId);
      if (actor) runtimeRef.current?.sceneView?.rebuildActorVisual?.(actor, world);
      bump();
      return;
    }
    executeCommand(
      new SetEnvironmentPropertiesCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides, bump]);

  const commitEnvironmentGesture = useCallback((beforeSnapshot, label = 'Edit environment') => {
    if (!world || mode === 'play' || !beforeSnapshot || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const env = world.getActor(actorId)?.getComponent('Environment');
    if (!env) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(beforeSnapshot)) {
      before[key] = structuredClone(beforeSnapshot[key]);
      after[key] = structuredClone(env[key]);
    }
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    recordCommand(
      new SetEnvironmentPropertiesCommand({ world, actorId, before, after, label }),
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedPrimitiveMesh = useCallback((partial, options = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const { undoable = true, label = 'Edit primitive' } = options;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const comp = world.getActor(actorId)?.getComponent('PrimitiveMesh');
    if (!comp) return;
    const merged = normalizePrimitiveMeshFields({ ...comp, ...partial });
    const check = validatePrimitiveAllocation(merged);
    if (!check.ok) {
      console.warn('[BloodBound]', check.message);
      return;
    }
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = structuredClone(comp[key]);
      after[key] = structuredClone(partial[key]);
    }
    if (!undoable) {
      for (const key of Object.keys(after)) {
        comp[key] = after[key];
      }
      const actor = world.getActor(actorId);
      if (actor) runtimeRef.current?.sceneView?.rebuildActorVisual?.(actor, world);
      bump();
      return;
    }
    executeCommand(
      new SetPrimitiveMeshPropertiesCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides, bump]);

  const commitPrimitiveMeshGesture = useCallback((beforeSnapshot, label = 'Edit primitive') => {
    if (!world || mode === 'play' || !beforeSnapshot || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const comp = world.getActor(actorId)?.getComponent('PrimitiveMesh');
    if (!comp) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(beforeSnapshot)) {
      before[key] = structuredClone(beforeSnapshot[key]);
      after[key] = structuredClone(comp[key]);
    }
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const check = validatePrimitiveAllocation(normalizePrimitiveMeshFields({ ...comp }));
    if (!check.ok) return;
    recordCommand(
      new SetPrimitiveMeshPropertiesCommand({ world, actorId, before, after, label }),
    );
    autoCapturePrefabOverrides([actorId]);
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
    if (undoable) {
      executeCommand(
        new SetWorldAmbientCommand({
          world: current,
          before: normalizeWorldAmbient(base),
          after,
          label,
          onApply,
        }),
      );
      bump();
      return;
    }
    current.ambient = after;
    onApply(after);
    bump();
  }, [mode, bump, executeCommand]);

  /**
   * After a live (non-undoable) ambient scrub/type session, record one undo step
   * from `beforeSnapshot` → current ambient without re-applying.
   */
  const commitWorldAmbientGesture = useCallback((beforeSnapshot, label = 'Edit world ambient') => {
    const current = worldRef.current;
    if (!current || mode === 'play' || !beforeSnapshot) return;
    const before = normalizeWorldAmbient(beforeSnapshot);
    const after = normalizeWorldAmbient(current.ambient);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const onApply = (ambient) => {
      runtimeRef.current?.sceneView?.applyWorldAmbient?.(ambient);
    };
    recordCommand(
      new SetWorldAmbientCommand({
        world: current,
        before,
        after,
        label,
        onApply,
      }),
    );
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

    if (undoable) {
      executeCommand(
        new SetWorldSceneCommand({
          world: current,
          before: base,
          after,
          label,
          onApply,
        }),
      );
      bump();
      return;
    }

    current.scene = after;
    onApply(after);
    bump();
  }, [mode, bump, executeCommand]);

  /**
   * After a live (non-undoable) scrub/type session, record one undo step from
   * `beforeSnapshot` → current scene without re-applying.
   */
  const commitWorldSceneGesture = useCallback((beforeSnapshot, label = 'Edit world scene') => {
    const current = worldRef.current;
    if (!current || mode === 'play' || !beforeSnapshot) return;
    const before = normalizeWorldScene(beforeSnapshot);
    const after = normalizeWorldScene(current.scene);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const onApply = (scene) => {
      runtimeRef.current?.sceneView?.applyWorldScene?.(scene);
    };
    recordCommand(
      new SetWorldSceneCommand({
        world: current,
        before,
        after,
        label,
        onApply,
      }),
    );
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
    if (undoable) {
      executeCommand(
        new SetWorldRendererCommand({
          world: current,
          before,
          after,
          label,
          onApply,
        }),
      );
      bump();
      return;
    }
    current.renderer = after;
    onApply(after);
    bump();
  }, [mode, bump, executeCommand]);

  const commitWorldRendererGesture = useCallback((beforeSnapshot, label = 'Edit world renderer') => {
    const current = worldRef.current;
    if (!current || mode === 'play' || !beforeSnapshot) return;
    const before = normalizeWorldRenderer(beforeSnapshot);
    const after = normalizeWorldRenderer(current.renderer);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const onApply = (renderer) => {
      runtimeRef.current?.sceneView?.applyWorldRenderer?.(renderer);
    };
    recordCommand(
      new SetWorldRendererCommand({
        world: current,
        before,
        after,
        label,
        onApply,
      }),
    );
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

  const updateSelectedStaticMesh = useCallback((partial, options = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const mesh = world.getActor(actorId)?.getComponent('StaticMesh');
    if (!mesh) return;
    const { undoable = true, label = 'Edit static mesh' } = options;
    const normalized = normalizeStaticMeshFields({ ...mesh, ...partial });
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = structuredClone(mesh[key]);
      after[key] = structuredClone(normalized[key]);
    }
    if ('collidable' in partial || 'collisionType' in partial) {
      before.collidable = structuredClone(mesh.collidable);
      before.collisionType = structuredClone(mesh.collisionType);
      after.collidable = normalized.collidable;
      after.collisionType = normalized.collisionType;
    }
    if (!undoable) {
      for (const key of Object.keys(after)) {
        mesh[key] = after[key];
      }
      const actor = world.getActor(actorId);
      if (actor) runtimeRef.current?.sceneView?.rebuildActorVisual?.(actor, world);
      bump();
      return;
    }
    executeCommand(
      new SetStaticMeshPropertiesCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides, bump]);

  const commitStaticMeshGesture = useCallback((beforeSnapshot, label = 'Edit static mesh') => {
    if (!world || mode === 'play' || !beforeSnapshot || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const mesh = world.getActor(actorId)?.getComponent('StaticMesh');
    if (!mesh) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(beforeSnapshot)) {
      before[key] = structuredClone(beforeSnapshot[key]);
      after[key] = structuredClone(mesh[key]);
    }
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    recordCommand(
      new SetStaticMeshPropertiesCommand({ world, actorId, before, after, label }),
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, recordCommand, autoCapturePrefabOverrides]);

  const updateSelectedRamp = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const ramp = world.getActor(actorId)?.getComponent('Ramp');
    if (!ramp) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['width', 'length', 'rise', 'thickness'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = ramp[key];
        after[key] = Math.max(gridRef.current, snapToGrid(raw, gridRef.current));
      } else if (key === 'direction') {
        if (!RAMP_DIRECTIONS.includes(partial.direction)) continue;
        before.direction = ramp.direction;
        after.direction = partial.direction;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...ramp.uv.scale },
          offset: { ...ramp.uv.offset },
          rotation: ramp.uv.rotation,
        };
        after.uv = partial.uv;
      } else {
        before[key] = ramp[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetRampPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign ramp material' : 'Edit ramp',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedStair = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const stair = world.getActor(actorId)?.getComponent('Stair');
    if (!stair) return;
    const before = {};
    const after = {};

    if (partial.stairType != null && STAIR_TYPES.includes(partial.stairType)) {
      const nextType = partial.stairType;
      if (nextType !== stair.stairType) {
        const defaults = defaultsForStairType(nextType, stair);
        for (const key of Object.keys(defaults)) {
          before[key] = stair[key];
          after[key] = defaults[key];
        }
      }
    }

    for (const key of Object.keys(partial)) {
      if (key === 'stairType') continue;
      if (['width', 'stepHeight', 'treadDepth', 'innerRadius'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = stair[key];
        after[key] = Math.max(key === 'innerRadius' ? 0 : 1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'stepCount') {
        before.stepCount = stair.stepCount;
        after.stepCount = Math.max(1, Math.round(Number(partial.stepCount) || 1));
      } else if (key === 'sweepAngle') {
        const raw = Math.abs(Number(partial.sweepAngle));
        if (!Number.isFinite(raw)) continue;
        before.sweepAngle = stair.sweepAngle;
        after.sweepAngle = Math.max(1, Math.min(720, raw));
      } else if (key === 'startAngle') {
        const raw = Number(partial.startAngle);
        if (!Number.isFinite(raw)) continue;
        before.startAngle = stair.startAngle;
        after.startAngle = raw;
      } else if (key === 'clockwise') {
        before.clockwise = stair.clockwise;
        after.clockwise = Boolean(partial.clockwise);
      } else if (key === 'totalRise') {
        const rise = Math.max(gridRef.current, snapToGrid(Number(partial.totalRise), gridRef.current));
        before.stepHeight = stair.stepHeight;
        after.stepHeight = rise / Math.max(1, stair.stepCount);
      } else if (key === 'direction') {
        if (!RAMP_DIRECTIONS.includes(partial.direction)) continue;
        before.direction = stair.direction;
        after.direction = partial.direction;
      } else {
        before[key] = stair[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetStairPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.stairType !== undefined
          ? `Set ${partial.stairType} stairs`
          : partial.materialId !== undefined
            ? 'Assign stair material'
            : 'Edit stairs',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedColumn = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const column = world.getActor(actorId)?.getComponent('Column');
    if (!column) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['height', 'radius', 'baseHeight', 'baseRadius', 'capitalHeight', 'capitalRadius'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = column[key];
        after[key] = Math.max(key.includes('Height') && key !== 'height' ? 0 : 1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'sides') {
        before.sides = column.sides;
        after.sides = Math.max(3, Math.min(64, Math.round(Number(partial.sides) || 3)));
      } else if (key === 'shape') {
        if (!COLUMN_SHAPES.includes(partial.shape)) continue;
        before.shape = column.shape;
        after.shape = partial.shape;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...column.uv.scale },
          offset: { ...column.uv.offset },
          rotation: column.uv.rotation,
        };
        after.uv = partial.uv;
      } else if (key === 'baseEnabled' || key === 'capitalEnabled' || key === 'collidable') {
        before[key] = column[key];
        after[key] = Boolean(partial[key]);
      } else {
        before[key] = column[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetColumnPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign column material' : 'Edit column',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedCurvedWall = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const wall = world.getActor(actorId)?.getComponent('CurvedWall');
    if (!wall) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['radius', 'height', 'thickness'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = wall[key];
        after[key] = Math.max(1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'sweepAngle') {
        const raw = Number(partial.sweepAngle);
        if (!Number.isFinite(raw)) continue;
        before.sweepAngle = wall.sweepAngle;
        after.sweepAngle = Math.max(1, Math.min(360, raw));
      } else if (key === 'startAngle' || key === 'miterStart' || key === 'miterEnd') {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = wall[key];
        after[key] = raw;
      } else if (key === 'curveResolution') {
        before.curveResolution = wall.curveResolution;
        after.curveResolution = Math.max(4, Math.min(128, Math.round(Number(partial.curveResolution) || 4)));
      } else if (key === 'clockwise' || key === 'collidable') {
        before[key] = wall[key];
        after[key] = Boolean(partial[key]);
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...wall.uv.scale },
          offset: { ...wall.uv.offset },
          rotation: wall.uv.rotation,
        };
        after.uv = partial.uv;
      } else {
        before[key] = wall[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetCurvedWallPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign curved wall material' : 'Edit curved wall',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  /**
   * Snap selected wall endpoint to nearest neighboring wall endpoint and apply miters.
   */
  const joinSelectedWallToNearest = useCallback(({
    movingEndId = 'end',
    orient = false,
    maxDist = WALL_ENDPOINT_SNAP_DIST,
  } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return false;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (!actor) return false;
    const eps = getWallEndpoints(actor, world);
    if (!eps) return false;
    const movingEnd = eps[movingEndId] || eps.end;
    const hit = findNearestWallEndpoint(world, movingEnd.position, {
      excludeActorId: actorId,
      maxDist,
    });
    if (!hit) return false;

    const plan = planWallEndpointJoin({
      movingActor: actor,
      movingEndId: movingEnd.id,
      targetActor: hit.actor,
      targetEndId: hit.end.id,
      world,
      orient,
      applyMiter: true,
    });
    if (!plan?.position) return false;

    const patches = [];
    const beforeXform = {
      position: { ...actor.transform.position },
      rotation: { ...actor.transform.rotation },
    };
    const afterXform = {
      position: { ...plan.position },
      rotation: plan.rotation
        ? { ...plan.rotation }
        : { ...actor.transform.rotation },
    };
    const movingPatch = {
      actorId,
      transform: { before: beforeXform, after: afterXform },
    };

    const brush = actor.getComponent('Brush');
    const curved = actor.getComponent('CurvedWall');
    if (brush) {
      movingPatch.brushMiters = {
        before: { miterStart: brush.miterStart, miterEnd: brush.miterEnd },
        after: {
          miterStart: movingEndId === 'start' ? plan.miterMoving : brush.miterStart,
          miterEnd: movingEndId === 'end' ? plan.miterMoving : brush.miterEnd,
        },
      };
    }
    if (curved) {
      movingPatch.curvedMiters = {
        before: { miterStart: curved.miterStart, miterEnd: curved.miterEnd },
        after: {
          miterStart: movingEndId === 'start' ? plan.miterMoving : curved.miterStart,
          miterEnd: movingEndId === 'end' ? plan.miterMoving : curved.miterEnd,
        },
      };
    }
    patches.push(movingPatch);

    const targetBrush = hit.actor.getComponent('Brush');
    const targetCurved = hit.actor.getComponent('CurvedWall');
    if (targetBrush) {
      patches.push({
        actorId: hit.actor.id,
        brushMiters: {
          before: { miterStart: targetBrush.miterStart, miterEnd: targetBrush.miterEnd },
          after: {
            miterStart: hit.end.id === 'start' ? plan.miterTarget : targetBrush.miterStart,
            miterEnd: hit.end.id === 'end' ? plan.miterTarget : targetBrush.miterEnd,
          },
        },
      });
    }
    if (targetCurved) {
      patches.push({
        actorId: hit.actor.id,
        curvedMiters: {
          before: { miterStart: targetCurved.miterStart, miterEnd: targetCurved.miterEnd },
          after: {
            miterStart: hit.end.id === 'start' ? plan.miterTarget : targetCurved.miterStart,
            miterEnd: hit.end.id === 'end' ? plan.miterTarget : targetCurved.miterEnd,
          },
        },
      });
    }

    executeCommand(
      new JoinWallEndpointsCommand({
        world,
        patches,
        label: orient ? 'Join wall (orient)' : 'Join walls',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId, hit.actor.id]);
    return true;
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedArch = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const arch = world.getActor(actorId)?.getComponent('Arch');
    if (!arch) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      if (['openingWidth', 'openingHeight', 'archRise', 'thickness', 'depth'].includes(key)) {
        const raw = Number(partial[key]);
        if (!Number.isFinite(raw)) continue;
        before[key] = arch[key];
        after[key] = Math.max(1, snapToGrid(raw, gridRef.current) || raw);
      } else if (key === 'curveResolution') {
        before.curveResolution = arch.curveResolution;
        after.curveResolution = Math.max(4, Math.min(64, Math.round(Number(partial.curveResolution) || 4)));
      } else if (key === 'archType') {
        if (!ARCH_TYPES.includes(partial.archType)) continue;
        before.archType = arch.archType;
        after.archType = partial.archType;
      } else if (key === 'uv') {
        before.uv = {
          scale: { ...arch.uv.scale },
          offset: { ...arch.uv.offset },
          rotation: arch.uv.rotation,
        };
        after.uv = partial.uv;
      } else if (key === 'collidable') {
        before.collidable = arch.collidable;
        after.collidable = Boolean(partial.collidable);
      } else {
        before[key] = arch[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetArchPropertiesCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign arch material' : 'Edit arch',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const placeMeshAsset = useCallback((asset, position, options = {}) => {
    if (!world || mode === 'play' || !asset?.id) return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    // Prefer live registry meta so Asset Viewer pivot Apply is inherited even if
    // the caller still holds a stale asset object from before the meta patch.
    const live = findAsset(assetRegistry, asset.id);
    const metaOffset = live?.meta?.defaultContentOffset ?? asset?.meta?.defaultContentOffset;
    const actor = createStaticMeshActor({
      assetId: asset.id,
      name: asset.name || live?.name || 'Static Mesh',
      position: position || { x: 0, y: 50, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? false,
      collidable: options.collidable,
      collisionType: options.collisionType,
      contentOffset: options.contentOffset ?? metaOffset ?? null,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: 'Place mesh',
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand, assetRegistry]);

  const placeLight = useCallback((lightType = 'point', position, options = {}) => {
    if (!world || mode === 'play') return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createLightActor({
      lightType,
      position: position || { x: 0, y: 200, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? snap,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${lightType} light`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placeEnvironment = useCallback((envType = 'water2', position, options = {}) => {
    if (!world || mode === 'play') return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createEnvironmentActor({
      envType,
      position: position || { x: 0, y: 0, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? snap,
      targetActorId: options.targetActorId,
      mapId: options.mapId,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${envType}`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placePrimitiveMesh = useCallback((primitive = 'box', position, options = {}) => {
    if (!world || mode === 'play') return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    let actor;
    try {
      actor = createPrimitiveMeshActor({
        primitive,
        position: position || { x: 0, y: 0, z: 0 },
        rotation: options.rotation,
        gridSize: g,
        snapY: options.snapY ?? snap,
        materialId: options.materialId,
      });
    } catch (err) {
      console.warn('[BloodBound] place primitive failed', err);
      return null;
    }
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Place ${primitive}`,
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placePlayerSpawn = useCallback((position, options = {}) => {
    if (!world || mode === 'play') return null;
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const actor = createPlayerSpawnActor({
      position: position || { x: 0, y: 0, z: 0 },
      rotation: options.rotation,
      gridSize: g,
      snapY: options.snapY ?? false,
    });
    stampAuthoringLayer(actor, world);
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: 'Place player spawn',
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const createPrefabFromSelection = useCallback(async (name = 'Prefab') => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) {
      notify('Select actors or a cell to create a prefab');
      return null;
    }
    const result = createPrefabFromActors(world, selectedRef.current, {
      name,
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    if (!result.ok) {
      notify(result.error || 'Prefab create failed');
      return null;
    }
    try {
      const saved = await savePrefabDefinition(result.definition);
      notify(`Created prefab ${saved.asset.name}`);
      return saved;
    } catch (err) {
      notify(err.message);
      return null;
    }
  }, [world, mode, savePrefabDefinition, getPrefabDefinitionSync, notify]);

  const placePrefabAsset = useCallback(async (assetOrId, position, options = {}) => {
    if (!world || mode === 'play') return null;
    const id = typeof assetOrId === 'string' ? assetOrId : assetOrId?.id;
    if (!id) return null;
    let definition = getPrefabDefinitionSync(id);
    if (!definition) {
      definition = await getPrefabDefinition(id);
    }
    if (!definition) {
      notify(`Prefab not found: ${id}`);
      return null;
    }
    const snap = options.gridSnap ?? gridSnapRef.current;
    const g = snap ? (options.gridSize ?? gridRef.current) : 1;
    const raw = {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      z: position?.z ?? 0,
    };
    const pos = {
      x: snap ? snapToGrid(raw.x, g) : raw.x,
      // Preserve surface elevation unless caller asks to snap Y.
      y: (options.snapY && snap) ? snapToGrid(raw.y, g) : raw.y,
      z: snap ? snapToGrid(raw.z, g) : raw.z,
    };
    const placed = instantiatePrefab(definition, world, { position: pos });
    // Prefabs must not depend on map-specific layer IDs — assign active layer on place.
    const activeLayer = getActiveAuthoringLayerId(world);
    assignAuthoringLayer(placed.actors, activeLayer);
    // instantiate already added actors — capture JSON then remove so command owns add
    const actorsJson = placed.actors.map((a) => a.toJSON());
    for (const a of placed.actors) {
      world.removeActor(a.id);
    }
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson,
        label: `Place prefab ${definition.name}`,
      }),
      { selectIds: placed.rootActorIds },
    );
    return placed;
  }, [world, mode, executeCommand, getPrefabDefinition, getPrefabDefinitionSync, notify]);

  const applyPrefabSourceUpdate = useCallback(async (prefabId) => {
    if (!world || mode === 'play' || !prefabId) return;
    let definition = getPrefabDefinitionSync(prefabId);
    if (!definition) definition = await getPrefabDefinition(prefabId);
    if (!definition) {
      notify(`Prefab not found: ${prefabId}`);
      return;
    }
    // Ensure nested sources are loaded so parent sync can re-apply nested updates.
    for (const nestedId of definition.nestedPrefabIds || []) {
      if (!getPrefabDefinitionSync(nestedId)) {
        await getPrefabDefinition(nestedId);
      }
    }
    const beforeJson = world.actors.map((a) => a.toJSON());
    syncPrefabInstances(world, definition, {
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    const afterJson = world.actors.map((a) => a.toJSON());
    // Revert to before so history command owns the mutation
    world.clear();
    for (const data of beforeJson) {
      world.addActor(Actor.fromJSON(data, createComponentFromJSON));
    }
    executeCommand(
      new ReplaceActorsCommand({
        world,
        beforeJson,
        afterJson,
        label: `Sync prefab ${definition.name}`,
      }),
      { resync: true },
    );
  }, [world, mode, executeCommand, getPrefabDefinition, getPrefabDefinitionSync, notify]);

  const updatePrefabAssetFromSelection = useCallback(async () => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return null;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const prefabId = actor?.prefab?.prefabId || actor?.prefab?.ownerPrefabId;
    if (!prefabId) {
      notify('Selection is not a prefab instance');
      return null;
    }
    const root = findInstanceRoot(world, actor.prefab.instanceId)
      || findInstanceRoot(world, actor.prefab.ownerInstanceId);
    const instanceId = root?.prefab?.instanceId || actor.prefab.instanceId;
    const members = getInstanceActors(world, instanceId);
    const ids = members.length ? members.map((m) => m.id) : selectedRef.current;
    const existing = getPrefabDefinitionSync(prefabId);
    const result = createPrefabFromActors(world, ids, {
      id: prefabId,
      name: existing?.name || actor.name || 'Prefab',
      getDefinition: (id) => getPrefabDefinitionSync(id),
    });
    if (!result.ok) {
      notify(result.error || 'Update prefab failed');
      return null;
    }
    try {
      const saved = await savePrefabDefinition(result.definition);
      // Propagate to other instances
      await applyPrefabSourceUpdate(prefabId);
      notify(`Updated prefab ${saved.asset.name}`);
      return saved;
    } catch (err) {
      notify(err.message);
      return null;
    }
  }, [
    world,
    mode,
    savePrefabDefinition,
    getPrefabDefinitionSync,
    applyPrefabSourceUpdate,
    notify,
  ]);

  const unpackSelectedPrefab = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    const instanceId = actor?.prefab?.instanceId;
    if (!instanceId) {
      notify('Selection is not a prefab instance');
      return;
    }
    const beforeJson = getInstanceActors(world, instanceId).map((a) => a.toJSON());
    unpackPrefabInstance(world, instanceId);
    const afterJson = beforeJson.map((a) => {
      const live = world.getActor(a.id);
      return live ? live.toJSON() : a;
    });
    // Revert prefab fields for command
    for (const data of beforeJson) {
      const live = world.getActor(data.id);
      if (live) live.prefab = data.prefab ? structuredClone(data.prefab) : null;
    }
    executeCommand(
      new ReplaceActorsCommand({
        world,
        beforeJson,
        afterJson,
        label: 'Unpack prefab',
      }),
      { resync: true },
    );
  }, [world, mode, executeCommand, notify]);

  const recordSelectedPrefabOverride = useCallback(async () => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    if (!actor?.prefab?.templateId || !actor.prefab.instanceId) return;
    const root = findInstanceRoot(world, actor.prefab.instanceId);
    if (!root) return;
    const before = getPrefabOverrides(root);
    const result = await recordActorPrefabOverride(world, actor, null, {
      getDefinitionSync: getPrefabDefinitionSync,
      getDefinition: getPrefabDefinition,
    });
    if (!result?.ok) {
      notify(result?.error || 'Prefab source not available');
      return;
    }
    const after = getPrefabOverrides(root);
    root.prefab.overrides = before;
    executeCommand(
      new SetPrefabOverridesCommand({
        world,
        actorId: root.id,
        before,
        after,
        label: 'Record prefab override',
      }),
      { resync: false },
    );
    bump();
  }, [world, mode, executeCommand, getPrefabDefinitionSync, getPrefabDefinition, bump, notify]);

  const revertSelectedPrefabOverride = useCallback(async (path = null) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actor = world.getActor(selectedRef.current[selectedRef.current.length - 1]);
    if (!actor?.prefab) return;
    const root = findInstanceRoot(world, actor.prefab.instanceId);
    if (!root) return;
    const before = getPrefabOverrides(root);
    clearOverride(root, actor.prefab.templateId, path);
    const after = getPrefabOverrides(root);
    root.prefab.overrides = before;
    executeCommand(
      new SetPrefabOverridesCommand({
        world,
        actorId: root.id,
        before,
        after,
        label: 'Revert prefab override',
      }),
      { resync: false },
    );
    // Re-apply source for this actor property by syncing instance
    const prefabId = actor.prefab.prefabId;
    await applyPrefabSourceUpdate(prefabId);
  }, [world, mode, executeCommand, applyPrefabSourceUpdate]);

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

  const clearExtrudePreview = useCallback(() => {
    setExtrudePreviewState(null);
    extrudePreviewRef.current = null;
  }, []);

  const previewExtrudeFace = useCallback((distance, {
    gridSize: gSize = gridSize,
    snapEnabled = gridSnap,
  } = {}) => {
    if (!world || mode === 'play') return { ok: false, code: 'NO_WORLD' };
    const sel = geometrySelectionRef.current;
    if (sel?.mode !== 'face' || !sel.primary) {
      return { ok: false, code: 'NO_FACE', message: 'Select a single face to extrude.' };
    }
    const d = snapExtrudeDistance(distance, { gridSize: gSize, snapEnabled });
    const planned = planFaceExtrusion(world, {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance: d,
      gridSize: gSize,
      snapEnabled: false, // already snapped
    });
    if (!planned.ok) {
      clearExtrudePreview();
      return planned;
    }
    const next = {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance: planned.distance,
      previewGeometry: planned.previewGeometry,
      newActorId: planned.newActorId,
    };
    setExtrudePreviewState(next);
    extrudePreviewRef.current = next;
    return { ok: true, ...next };
  }, [world, mode, gridSize, gridSnap, clearExtrudePreview]);

  const commitExtrudeFace = useCallback((distance, {
    gridSize: gSize = gridSize,
    snapEnabled = gridSnap,
    label = 'Extrude face',
  } = {}) => {
    if (!world || mode === 'play') return { ok: false, code: 'NO_WORLD' };
    const sel = geometrySelectionRef.current;
    if (sel?.mode !== 'face' || !sel.primary) {
      return { ok: false, code: 'NO_FACE', message: 'Select a single face to extrude.' };
    }
    const planned = planFaceExtrusion(world, {
      actorId: sel.primary.actorId,
      faceId: sel.primary.id,
      distance,
      gridSize: gSize,
      snapEnabled,
    });
    clearExtrudePreview();
    if (!planned.ok) {
      notify(planned.message, { title: 'Extrude' });
      setStatus(planned.message);
      return planned;
    }
    planned.command.label = label;
    executeCommand(planned.command, { resync: true });
    autoCapturePrefabOverrides([sel.primary.actorId, planned.newActorId]);
    setStatus(`Extruded face by ${planned.distance} eu.`);
    return { ok: true, newActorId: planned.newActorId, distance: planned.distance };
  }, [
    world,
    mode,
    gridSize,
    gridSnap,
    executeCommand,
    notify,
    setStatus,
    autoCapturePrefabOverrides,
    clearExtrudePreview,
  ]);

  const beginClipSession = useCallback((clipMode = 'front') => {
    if (!world || mode === 'play') return false;
    const actorIds = selectedRef.current.length
      ? [...selectedRef.current]
      : (geometrySelectionRef.current?.items || []).map((i) => i.actorId);
    const unique = [...new Set(actorIds)];
    if (!unique.length) {
      notify('Select one or more brushes to clip.', { title: 'Clip' });
      return false;
    }
    const session = {
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : 'front',
      actorIds: unique,
      points: [],
      plane: null,
      source: 'points',
      preview: null,
    };
    setClipSessionState(session);
    clipSessionRef.current = session;
    setTool('geometry');
    setStatus('Clip: pick 3 grid-snapped points on brush surfaces (Enter=apply, Esc=cancel).');
    return true;
  }, [world, mode, notify, setStatus, setTool]);

  const cancelClipSession = useCallback(() => {
    if (!clipSessionRef.current) return;
    setClipSessionState(null);
    clipSessionRef.current = null;
    setStatus('Clip cancelled.');
  }, [setStatus]);

  const refreshClipPreview = useCallback((session) => {
    if (!world || !session?.actorIds?.length) {
      return { ok: false, code: 'NO_PLANE' };
    }
    // Always re-project the shared world plane into each actor's local space.
    // Never reuse one actor's local plane on siblings (wrong under parents / offsets).
    if (!(session.worldPoints?.length >= 3)) {
      return {
        ok: false,
        code: 'NO_PLANE',
        message: 'Clip needs three world-space plane points.',
      };
    }
    const built = planesByActorIdFromWorldPoints(
      world,
      session.actorIds,
      session.worldPoints,
    );
    if (!built.ok) return built;
    return previewClip(world, {
      actorIds: session.actorIds,
      mode: session.mode,
      planesByActorId: built.planesByActorId,
    });
  }, [world]);

  const setClipSessionMode = useCallback((clipMode) => {
    const cur = clipSessionRef.current;
    if (!cur) return;
    const next = {
      ...cur,
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : 'front',
    };
    if (next.plane || next.worldPoints?.length >= 3) {
      const preview = refreshClipPreview(next);
      next.preview = preview.ok ? preview : null;
    }
    setClipSessionState(next);
    clipSessionRef.current = next;
  }, [refreshClipPreview]);

  const addClipPoint = useCallback((worldPoint, { snap = true } = {}) => {
    if (!world || mode === 'play') return { ok: false };
    const cur = clipSessionRef.current;
    if (!cur) return { ok: false, code: 'NO_SESSION' };
    const g = Math.max(1, gridSize || 25);
    let pt = [
      Number(worldPoint?.[0]) || 0,
      Number(worldPoint?.[1]) || 0,
      Number(worldPoint?.[2]) || 0,
    ];
    if (snap && gridSnap) {
      pt = [snapToGrid(pt[0], g), snapToGrid(pt[1], g), snapToGrid(pt[2], g)];
    }
    const points = [...(cur.points || []), pt].slice(0, 3);
    let next = {
      ...cur,
      points,
      worldPoints: points,
      source: 'points',
      plane: null,
      preview: null,
    };
    if (points.length === 3) {
      // Validate plane against the primary actor; preview re-projects for all.
      const actor = world.getActor(cur.actorIds[0]);
      const local = actor ? worldPointsToLocalPlane(actor, points, world) : { ok: false };
      if (!local.ok) {
        notify(local.message || 'Degenerate clip plane.', { title: 'Clip' });
        setStatus(local.message || 'Degenerate clip plane.');
        next = { ...next, points: [], worldPoints: [], plane: null };
        setClipSessionState(next);
        clipSessionRef.current = next;
        return local;
      }
      next.plane = local.plane;
      const preview = refreshClipPreview(next);
      next.preview = preview.ok ? preview : null;
      if (!preview.ok) {
        notify(preview.message || 'Clip preview failed.', { title: 'Clip' });
      } else {
        setStatus('Clip plane ready — Enter to apply, Esc to cancel.');
      }
    } else {
      setStatus(`Clip: point ${points.length}/3`);
    }
    setClipSessionState(next);
    clipSessionRef.current = next;
    return { ok: true, points: next.points, ready: points.length === 3 };
  }, [world, mode, gridSize, gridSnap, notify, setStatus, refreshClipPreview]);

  const setClipPlaneFromFace = useCallback((actorId, faceId, clipMode) => {
    if (!world || mode === 'play') return { ok: false };
    const planeResult = localPlaneFromSelectedFace(world, actorId, faceId);
    if (!planeResult.ok) {
      notify(planeResult.message, { title: 'Clip' });
      return planeResult;
    }
    const actor = world.getActor(actorId);
    const geom = actor?.getComponent('ConvexBrush')?.geometry
      || (() => {
        const brush = actor?.getComponent('Brush');
        if (!brush) return null;
        const c = convertBrushToConvexGeometry(actor, brush, world);
        return c.ok ? c.geometry : null;
      })();
    const face = geom?.faces?.find((f) => f.id === faceId);
    const vmap = geom ? vertexMap(geom) : null;
    if (!face || !vmap || face.loop.length < 3) {
      const err = {
        ok: false,
        code: 'DEGENERATE_PLANE',
        message: 'Could not build world-space clip plane from face.',
      };
      notify(err.message, { title: 'Clip' });
      return err;
    }
    const worldPoints = [0, 1, 2].map((i) => {
      const lp = vmap.get(face.loop[i]);
      return localPointToWorld(actor, lp, world);
    });
    const actorIds = selectedRef.current.length
      ? [...new Set(selectedRef.current)]
      : [actorId];
    const session = {
      mode: clipMode === 'back' || clipMode === 'split' ? clipMode : (clipSessionRef.current?.mode || 'front'),
      actorIds,
      points: worldPoints,
      worldPoints,
      plane: planeResult.plane,
      source: 'face',
      faceActorId: actorId,
      faceId,
      preview: null,
    };
    const preview = refreshClipPreview(session);
    session.preview = preview.ok ? preview : null;
    setClipSessionState(session);
    clipSessionRef.current = session;
    if (!preview.ok) {
      notify(preview.message || 'Clip preview failed.', { title: 'Clip' });
    } else {
      setStatus('Clip by face plane ready — Enter to apply, Esc to cancel.');
    }
    setTool('geometry');
    return { ok: true, preview };
  }, [world, mode, notify, setStatus, setTool, refreshClipPreview]);

  const commitClipSession = useCallback((label) => {
    if (!world || mode === 'play') return { ok: false };
    const cur = clipSessionRef.current;
    if (!cur?.actorIds?.length || !(cur.worldPoints?.length >= 3)) {
      return {
        ok: false,
        code: 'NO_PLANE',
        message: 'Clip plane not defined (need three world points).',
      };
    }
    const built = planesByActorIdFromWorldPoints(world, cur.actorIds, cur.worldPoints);
    if (!built.ok) {
      notify(built.message, { title: 'Clip' });
      return built;
    }
    const planned = planClip(world, {
      actorIds: cur.actorIds,
      mode: cur.mode,
      planesByActorId: built.planesByActorId,
    });
    if (!planned.ok) {
      notify(planned.message, { title: 'Clip' });
      setStatus(planned.message);
      return planned;
    }
    if (label) planned.command.label = label;
    executeCommand(planned.command, { resync: true });
    const touched = [
      ...cur.actorIds,
      ...(planned.newActorIds || []),
    ];
    autoCapturePrefabOverrides(touched);
    setClipSessionState(null);
    clipSessionRef.current = null;
    setStatus(`Clip (${cur.mode}) applied.`);
    return { ok: true, newActorIds: planned.newActorIds || [] };
  }, [world, mode, executeCommand, notify, setStatus, autoCapturePrefabOverrides]);

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

  const renameSelected = useCallback((name) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
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
  }, [mode, afterWorldMutation]);

  const redo = useCallback(() => {
    if (mode === 'play') return;
    const cmd = historyRef.current.redo();
    if (!cmd) return;
    afterWorldMutation({});
    setStatus(`Redo: ${cmd.label || 'edit'}`);
  }, [mode, afterWorldMutation]);

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
  }, [notify, setStatus]);

  const stop = useCallback(() => {
    if (!runtimeRef.current) return;
    runtimeRef.current.stop();
    setWorld(runtimeRef.current.world);
    setSelectedActorIds([]);
    clearGeometrySelectionState();
    clearSelectedSurfaceState();
    setStatus('Edit mode restored');
    bump();
  }, [bump, clearGeometrySelectionState, clearSelectedSurfaceState]);

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
    createCell,
    assignSelectedToCell,
    setSelectedActorFlags,
    layerUi,
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
