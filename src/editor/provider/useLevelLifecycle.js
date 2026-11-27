// Part of EditorProvider, grouped by concern. Called once from EditorContext.jsx.
import { useCallback } from 'react';
import { deserializeLevel } from '../../serialization/LevelDeserializer.js';
import { serializeLevel } from '../../serialization/LevelSerializer.js';
import { loadLevelFile, saveLevelFile, listLevels } from '../../io/levelFileApi.js';
import { levelFingerprint } from '../dirtyTracking.js';
import { runSaveAll } from '../saveAllRegistry.js';
import { createNewMapLevelData, normalizeLevelFileName as normalizeNewMapFileName } from '../newMapFactory.js';
import { DEFAULT_GRID_EDITOR_UNITS, GRID_INCREMENTS } from '../../core/units.js';
import { emptyGeometrySelection } from '../geometryEditing/geometrySelection.js';

export function useLevelLifecycle({
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
}) {
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

  return {
    applyLevelData,
    beginTutorialSession,
    confirmDiscardChanges,
    createNewMap,
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
  };
}
