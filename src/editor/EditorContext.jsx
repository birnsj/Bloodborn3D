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
import {
  snapToGrid,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_INCREMENTS,
} from '../core/units.js';
import { GameRuntime } from '../runtime/GameRuntime.js';
import { HistoryStack } from './history/HistoryStack.js';
import {
  AddActorsCommand,
  RemoveActorsCommand,
  SetTransformsCommand,
  SetBrushGeometryCommand,
  RenameActorCommand,
  SetBrushColorCommand,
  SetBrushMaterialCommand,
  SetBrushOpeningsCommand,
  SetLightPropertiesCommand,
  SetStaticMeshPropertiesCommand,
  ReparentActorsCommand,
  SetActorFlagsCommand,
  ReplaceActorsCommand,
  SetPrefabOverridesCommand,
} from './history/commands.js';
import {
  createBrushFromBounds,
  duplicateActors,
  resizeBrushFace,
} from './brushFactory.js';
import { createStaticMeshActor } from './meshFactory.js';
import { createLightActor } from './lightFactory.js';
import { createCellActor } from './cellFactory.js';
import { useAssetBrowser } from './assets/AssetBrowserContext.jsx';
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
import { useEditorDialogs } from '../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../ui/dialogs/reportEditorMessage.js';

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const {
    assetResolver,
    revision: assetRevision,
    savePrefabDefinition,
    getPrefabDefinition,
    getPrefabDefinitionSync,
  } = useAssetBrowser();
  const dialogs = useEditorDialogs();
  const runtimeRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [selectedActorIds, setSelectedActorIds] = useState([]);
  const [mode, setMode] = useState('edit');
  const [tool, setTool] = useState('select'); // select | box | wall | floor
  const [levelName, setLevelName] = useState('test-room.json');
  const [levels, setLevels] = useState([]);
  const [status, setStatusState] = useState('Ready');
  const [gridSize, setGridSizeState] = useState(DEFAULT_GRID_EDITOR_UNITS);
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

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  /** Toolbar status only (high-frequency edits / undo). */
  const setStatus = useCallback((message) => {
    setStatusState(String(message ?? ''));
  }, []);

  /** Status bar + editor dialog (user-facing notices, errors, confirmations). */
  const notify = useCallback((message, options = {}) => {
    reportEditorMessage(setStatusState, dialogs, message, { ...options, dialog: true });
  }, [dialogs]);

  const worldRef = useRef(null);
  worldRef.current = world;
  const selectedRef = useRef(selectedActorIds);
  selectedRef.current = selectedActorIds;
  const gridRef = useRef(gridSize);
  gridRef.current = gridSize;

  const historyRef = useRef(null);
  if (!historyRef.current) {
    historyRef.current = new HistoryStack({
      onChange: (h) => setHistoryFlags({ canUndo: h.canUndo, canRedo: h.canRedo }),
    });
  }

  const syncSelectionVisual = useCallback((ids) => {
    runtimeRef.current?.setSelection(ids);
  }, []);

  const afterWorldMutation = useCallback((options = {}) => {
    const { resync = true, selectIds } = options;
    if (resync) {
      runtimeRef.current?.resyncWorld();
    }
    if (selectIds !== undefined) {
      setSelectedActorIds(selectIds);
      syncSelectionVisual(selectIds);
    } else {
      syncSelectionVisual(selectedRef.current);
    }
    bump();
  }, [bump, syncSelectionVisual]);

  const executeCommand = useCallback((command, options) => {
    historyRef.current.execute(command);
    afterWorldMutation(options);
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
  }, [assetResolver, assetRevision]);

  const setGridSize = useCallback((value) => {
    const next = Number(value);
    const size = GRID_INCREMENTS.includes(next) ? next : (next || DEFAULT_GRID_EDITOR_UNITS);
    setGridSizeState(size);
    runtimeRef.current?.setGridSize(size);
  }, []);

  const applyLevelData = useCallback((data, {
    fileName = null,
    session = null,
    statusMessage = null,
  } = {}) => {
    const resolved = (data && typeof data.addActor === 'function')
      ? data
      : deserializeLevel(data);

    historyRef.current.clear();
    setWorld(resolved);
    if (fileName != null) setLevelName(fileName);
    setSelectedActorIds([]);
    setTool('select');
    if (session) setLevelSession(session);
    if (runtimeRef.current) {
      if (runtimeRef.current.mode === 'play') {
        runtimeRef.current.stop();
      }
      runtimeRef.current.setWorld(resolved);
      runtimeRef.current.setSelection([]);
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

  const loadLevel = useCallback(async (name) => {
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
    await saveLevelFile(name, data);
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
    const data = serializeLevel(world);
    await saveLevelFile(levelName, data);
    notify(`Saved ${levelName}`);
  }, [world, levelName, notify, levelSession, dialogs, saveTutorialWorkAs]);

  useEffect(() => {
    refreshLevels().then(() => loadLevel('test-room.json')).catch((err) => {
      notify(`Init failed: ${err.message}`);
    });
  }, [loadLevel, refreshLevels, notify]);

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
    setSelectedActorIds(next);
    syncSelectionVisual(next);
  }, [syncSelectionVisual]);

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

  const createBrushAtBounds = useCallback((kind, min, max) => {
    if (!world || mode === 'play') return null;
    const actor = createBrushFromBounds({
      kind,
      min,
      max,
      gridSize: gridRef.current,
    });
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: `Create ${kind}`,
      }),
      { selectIds: [actor.id] },
    );
    setTool('select');
    return actor;
  }, [world, mode, executeCommand]);

  const deleteSelected = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const ids = [...selectedRef.current];
    executeCommand(
      new RemoveActorsCommand({ world, actorIds: ids, label: 'Delete' }),
      { selectIds: [] },
    );
  }, [world, mode, executeCommand]);

  const duplicateSelected = useCallback(() => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actors = selectedRef.current
      .map((id) => world.getActor(id))
      .filter(Boolean);
    if (actors.length === 0) return;
    const copies = duplicateActors(actors, {
      offset: { x: gridRef.current, y: 0, z: 0 },
      gridSize: gridRef.current,
    });
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: copies.map((a) => a.toJSON()),
        label: 'Duplicate',
      }),
      { selectIds: copies.map((a) => a.id) },
    );
  }, [world, mode, executeCommand]);

  const autoCapturePrefabOverrides = useCallback(async (actorIds) => {
    if (!world || !actorIds?.length) return;
    await recordPrefabOverridesForActors(world, actorIds, {
      getDefinitionSync: getPrefabDefinitionSync,
      getDefinition: getPrefabDefinition,
    });
  }, [world, getPrefabDefinitionSync, getPrefabDefinition]);

  const commitTransforms = useCallback((changes, label = 'Move') => {
    if (!world || mode === 'play' || !changes?.length) return;
    const meaningful = changes.filter((c) =>
      JSON.stringify(c.before) !== JSON.stringify(c.after),
    );
    if (!meaningful.length) return;
    executeCommand(
      new SetTransformsCommand({ world, changes: meaningful, label }),
      { resync: false },
    );
    for (const c of meaningful) {
      const actor = world.getActor(c.actorId);
      if (actor) runtimeRef.current?.refreshActor(actor);
    }
    autoCapturePrefabOverrides(meaningful.map((c) => c.actorId));
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const commitBrushGeometry = useCallback((changes, label = 'Resize') => {
    if (!world || mode === 'play' || !changes?.length) return;
    const meaningful = changes.filter((c) =>
      JSON.stringify(c.before) !== JSON.stringify(c.after),
    );
    if (!meaningful.length) return;
    executeCommand(
      new SetBrushGeometryCommand({ world, changes: meaningful, label }),
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
        executeCommand(
          new SetBrushOpeningsCommand({
            world,
            actorId: c.actorId,
            before: prevOpenings,
            after: nextOpenings,
            label: 'Clamp openings',
          }),
          { resync: true },
        );
      }
    }
    autoCapturePrefabOverrides(meaningful.map((c) => c.actorId));
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  /**
   * Live world-position update during gizmo drag (no history until commit).
   * updates: [{ actorId, position }] where position is WORLD editor units.
   */
  const previewActorPositions = useCallback((updates) => {
    if (!world || mode === 'play') return;
    for (const u of updates) {
      const actor = world.getActor(u.actorId);
      if (!actor || isEffectivelyLocked(actor, world)) continue;
      const pos = u.position;
      if (!Number.isFinite(pos?.x) || !Number.isFinite(pos?.y) || !Number.isFinite(pos?.z)) {
        continue;
      }
      const current = getWorldTransform(actor, world);
      setWorldTransform(actor, {
        ...current,
        position: { ...pos },
      }, world);
      runtimeRef.current?.refreshActor(actor);
      // Nested children move with parent Three group — refresh selection box.
    }
    // No React bump during drag — Details refreshes on commit.
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode]);

  const previewBrushGeometry = useCallback((actorId, size, worldPosition) => {
    if (!world || mode === 'play') return;
    const actor = world.getActor(actorId);
    const brush = actor?.getComponent('Brush');
    if (!brush || isEffectivelyLocked(actor, world)) return;
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
    const nextSize = {
      x: Math.max(1, Number(size.x)),
      y: Math.max(1, Number(size.y)),
      z: Math.max(1, Number(size.z)),
    };
    brush.size = nextSize;
    const current = getWorldTransform(actor, world);
    setWorldTransform(actor, {
      ...current,
      position: { ...worldPosition },
    }, world);
    runtimeRef.current?.refreshBrush(actor);
    // No React bump during drag — avoids remount/churn while meshes rebuild.
    runtimeRef.current?.setSelection(selectedRef.current);
  }, [world, mode]);

  const updateSelectedTransform = useCallback((partial, { snap = true } = {}) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const actor = world.getActor(actorId);
    if (!actor || isEffectivelyLocked(actor, world)) return;

    // Details edits local transform values (relative to parent).
    const before = actor.transform.toJSON();
    const after = structuredClone(before);
    if (partial.position) {
      after.position = { ...after.position, ...partial.position };
      if (snap) {
        after.position.x = snapToGrid(after.position.x, gridRef.current);
        after.position.y = snapToGrid(after.position.y, gridRef.current);
        after.position.z = snapToGrid(after.position.z, gridRef.current);
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

  const reparentSelected = useCallback((newParentId) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const changes = [];
    for (const actorId of selectedRef.current) {
      const actor = world.getActor(actorId);
      if (!actor || isEffectivelyLocked(actor, world)) continue;
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

  const createCell = useCallback((name = 'Cell') => {
    if (!world || mode === 'play') return null;
    const cell = createCellActor({
      name,
      position: { x: 0, y: 0, z: 0 },
      gridSize: gridRef.current,
    });
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

    const before = {};
    const after = {};
    for (const key of ['materialId', 'faceMaterials', 'uv', 'color', 'collidable']) {
      if (key in partial) {
        before[key] = key === 'uv'
          ? {
            scale: { ...brush.uv.scale },
            offset: { ...brush.uv.offset },
            rotation: brush.uv.rotation,
          }
          : key === 'faceMaterials'
            ? (brush.faceMaterials ? { ...brush.faceMaterials } : null)
            : brush[key];
        after[key] = partial[key];
      }
    }
    if (Object.keys(after).length === 0) return;
    executeCommand(
      new SetBrushMaterialCommand({
        world,
        actorId,
        before,
        after,
        label: partial.materialId !== undefined ? 'Assign material' : 'Edit brush material',
      }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, commitBrushGeometry, executeCommand, autoCapturePrefabOverrides]);

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
    executeCommand(
      new SetBrushOpeningsCommand({ world, actorId, before, after, label }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

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

  const updateSelectedLight = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const light = world.getActor(actorId)?.getComponent('Light');
    if (!light) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = light[key];
      after[key] = partial[key];
    }
    executeCommand(
      new SetLightPropertiesCommand({ world, actorId, before, after }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const updateSelectedStaticMesh = useCallback((partial) => {
    if (!world || mode === 'play' || selectedRef.current.length === 0) return;
    const actorId = selectedRef.current[selectedRef.current.length - 1];
    const mesh = world.getActor(actorId)?.getComponent('StaticMesh');
    if (!mesh) return;
    const before = {};
    const after = {};
    for (const key of Object.keys(partial)) {
      before[key] = mesh[key];
      after[key] = partial[key];
    }
    executeCommand(
      new SetStaticMeshPropertiesCommand({ world, actorId, before, after }),
      { resync: true },
    );
    autoCapturePrefabOverrides([actorId]);
  }, [world, mode, executeCommand, autoCapturePrefabOverrides]);

  const placeMeshAsset = useCallback((asset, position) => {
    if (!world || mode === 'play' || !asset?.id) return null;
    const actor = createStaticMeshActor({
      assetId: asset.id,
      name: asset.name || 'Static Mesh',
      position: position || { x: 0, y: 50, z: 0 },
      gridSize: gridRef.current,
    });
    executeCommand(
      new AddActorsCommand({
        world,
        actorsJson: [actor.toJSON()],
        label: 'Place mesh',
      }),
      { selectIds: [actor.id] },
    );
    return actor;
  }, [world, mode, executeCommand]);

  const placeLight = useCallback((lightType = 'point', position) => {
    if (!world || mode === 'play') return null;
    const actor = createLightActor({
      lightType,
      position: position || { x: 0, y: 200, z: 0 },
      gridSize: gridRef.current,
    });
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

  const placePrefabAsset = useCallback(async (assetOrId, position) => {
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
    const pos = {
      x: snapToGrid(position?.x ?? 0, gridRef.current),
      y: snapToGrid(position?.y ?? 0, gridRef.current),
      z: snapToGrid(position?.z ?? 0, gridRef.current),
    };
    const placed = instantiatePrefab(definition, world, { position: pos });
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

  const applySelectedMaterialToBrush = useCallback((materialId) => {
    if (!materialId) return;
    updateSelectedBrush({ materialId });
  }, [updateSelectedBrush]);

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
    if (!runtimeRef.current) return;
    setTool('select');
    // Play snapshots authored state; drop edit history so Undo cannot fight Stop restore.
    historyRef.current.clear();
    setStatus('Play mode — click viewport to capture mouse');
    await runtimeRef.current.play();
  }, []);

  const stop = useCallback(() => {
    if (!runtimeRef.current) return;
    runtimeRef.current.stop();
    historyRef.current.clear();
    setWorld(runtimeRef.current.world);
    setSelectedActorIds([]);
    setStatus('Edit mode restored');
    bump();
  }, [bump]);

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
    levelName,
    setLevelName,
    levels,
    status,
    setStatus,
    notify,
    gridSize,
    setGridSize,
    gridIncrements: GRID_INCREMENTS,
    revision,
    canUndo: historyFlags.canUndo,
    canRedo: historyFlags.canRedo,
    attachCanvas,
    loadLevel,
    saveLevel,
    applyLevelData,
    levelSession,
    beginTutorialSession,
    endTutorialSession,
    restartTutorialSession,
    saveTutorialWorkAs,
    refreshLevels,
    selectActor,
    selectActors,
    createBrushAtBounds,
    deleteSelected,
    duplicateSelected,
    commitTransforms,
    commitBrushGeometry,
    previewActorPositions,
    previewBrushGeometry,
    updateSelectedTransform,
    updateSelectedBrush,
    setSelectedBrushOpenings,
    addBrushOpening,
    updateBrushOpening,
    removeBrushOpening,
    updateSelectedLight,
    updateSelectedStaticMesh,
    placeMeshAsset,
    placeLight,
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
