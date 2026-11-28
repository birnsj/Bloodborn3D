import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEditor } from '../editor/EditorContext.jsx';
import { useLayout } from '../editor/layout/LayoutContext.jsx';
import { getLessonById, listLessons } from './lessons/index.js';
import {
  advanceIfComplete,
  confirmManual,
  createLessonRuntimeState,
  enterStep,
  evaluateCurrentStep,
  getStep,
  goBack,
  goNext,
  noteMode,
  noteUndo,
  skipStep,
} from './LessonRunner.js';
import {
  ACADEMY_TOUR_MODE_SETTLE_MS,
  ACADEMY_TOUR_READ_MS,
  ACADEMY_TOUR_SETTLE_MS,
  academyTourProgress,
  buildAcademyTourQueue,
  nextTourLessonId,
  normalizeTourSpeed,
  tourDelay,
} from './academyTour.js';
import {
  dismissTourDialogs,
  dismissTourDialogsUntilClear,
  dismissTourDropdowns,
  executeTourStepAsync,
  hideTourCursor,
} from './academyTourExecute.js';
import { setTourSpeedFactor } from './tourSpeed.js';
import {
  clampTutorialPrefs,
  loadTutorialPrefs,
  saveTutorialPrefs,
} from './tutorialPrefs.js';
import {
  dockIdForTutorialHighlight,
  findDockTabElement,
} from './positionCoachMark.js';

const TutorialContext = createContext(null);

export function TutorialProvider({ children }) {
  const editor = useEditor();
  const layout = useLayout();
  const [prefs, setPrefs] = useState(() => loadTutorialPrefs());
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [panelFocusToken, setPanelFocusToken] = useState(0);
  /** Timed walkthrough of every lesson/step (executes tips; does not mark Done). */
  const [tourQueue, setTourQueue] = useState(null);
  /** Bumps when Cam / layout changes so viewportCameraIs / viewportLayoutIs re-check. */
  const [viewportTick, setViewportTick] = useState(0);
  const prevCanUndo = useRef(editor.canUndo);
  const prevMode = useRef(editor.mode);
  const autoAdvanceLock = useRef(false);
  const tourAdvanceLock = useRef(false);
  const editorSnapshotRef = useRef(null);
  const editorRef = useRef(editor);
  const layoutRef = useRef(layout);
  const tourActive = Array.isArray(tourQueue) && tourQueue.length > 0;

  useEffect(() => {
    editorRef.current = editor;
    layoutRef.current = layout;
  }, [editor, layout]);

  useEffect(() => {
    const onVp = () => setViewportTick((n) => n + 1);
    window.addEventListener('bb:viewport-prefs', onVp);
    return () => window.removeEventListener('bb:viewport-prefs', onVp);
  }, []);

  const lesson = activeLessonId ? getLessonById(activeLessonId) : null;
  const step = lesson && runtime ? getStep(lesson, runtime.stepIndex) : null;

  const editorSnapshot = useMemo(() => {
    const vp = typeof window !== 'undefined'
      ? window.__bloodboundViewport?.getPrefs?.()
      : null;
    const activePane = vp?.panes?.find((p) => p.id === vp.activePaneId) || vp?.panes?.[0];
    return {
      world: editor.world,
      mode: editor.mode,
      tool: editor.tool,
      geometryMode: editor.geometryMode,
      geometrySelection: editor.geometrySelection,
      transformMode: editor.transformMode,
      clipSession: editor.clipSession,
      selectedActorIds: editor.selectedActorIds,
      selectedSurface: editor.selectedSurface,
      gridSize: editor.gridSize,
      canUndo: editor.canUndo,
      canRedo: editor.canRedo,
      viewportLayoutMode: vp?.layoutMode ?? null,
      viewportCameraMode: activePane?.cameraMode ?? null,
    };
  }, [
    editor.world,
    editor.mode,
    editor.tool,
    editor.geometryMode,
    editor.geometrySelection,
    editor.transformMode,
    editor.clipSession,
    editor.selectedActorIds,
    editor.selectedSurface,
    editor.gridSize,
    editor.canUndo,
    editor.canRedo,
    editor.revision,
    viewportTick,
  ]);
  editorSnapshotRef.current = editorSnapshot;

  const readLiveEditorSnapshot = useCallback(() => {
    const ed = editorRef.current;
    const vp = typeof window !== 'undefined'
      ? window.__bloodboundViewport?.getPrefs?.()
      : null;
    const activePane = vp?.panes?.find((p) => p.id === vp.activePaneId) || vp?.panes?.[0];
    return {
      world: ed.world,
      mode: ed.mode,
      tool: ed.tool,
      geometryMode: ed.geometryMode,
      geometrySelection: ed.geometrySelection,
      transformMode: ed.transformMode,
      clipSession: ed.clipSession,
      selectedActorIds: ed.selectedActorIds,
      selectedSurface: ed.selectedSurface,
      gridSize: ed.gridSize,
      canUndo: ed.canUndo,
      canRedo: ed.canRedo,
      viewportLayoutMode: vp?.layoutMode ?? editorSnapshotRef.current?.viewportLayoutMode ?? null,
      viewportCameraMode: activePane?.cameraMode
        ?? editorSnapshotRef.current?.viewportCameraMode
        ?? null,
    };
  }, []);

  const showTutorialsPanel = useCallback(() => {
    layout.ensurePanel?.('tutorials'); // floating Academy catalog
    setPanelFocusToken((n) => n + 1);
  }, [layout]);

  /** Hide Academy while a lesson/tour tip is on screen so it does not cover the view. */
  const hideTutorialsPanel = useCallback(() => {
    layout.patch?.({ tutorialsVisible: false });
  }, [layout]);

  const patchPrefs = useCallback((partial) => {
    setPrefs((prev) => saveTutorialPrefs(clampTutorialPrefs({ ...prev, ...partial })));
  }, []);

  // Keep cursor / orbit pacing in sync with the saved tour speed.
  useEffect(() => {
    setTourSpeedFactor(prefs.tourSpeed);
  }, [prefs.tourSpeed]);

  const setTourSpeed = useCallback((speed) => {
    patchPrefs({ tourSpeed: normalizeTourSpeed(speed) });
  }, [patchPrefs]);

  const applyTourViewportReadable = useCallback(() => {
    // Skipped build steps leave sparse starters; Lit+Fog reads as a black void.
    const api = typeof window !== 'undefined' ? window.__bloodboundViewport : null;
    const prefs = api?.getPrefs?.();
    if (!prefs?.panes?.length || !api?.setPrefs) return;
    api.setPrefs({
      panes: prefs.panes.map((pane) => ({
        ...pane,
        displayMode: 'unlit',
        showFog: false,
        showMist: false,
      })),
    });
  }, []);

  const startLesson = useCallback(async (lessonId, { keepTour = false } = {}) => {
    const nextLesson = getLessonById(lessonId);
    if (!nextLesson) return;
    try {
      if (!keepTour) setTourQueue(null);
      hideTutorialsPanel();
      // Tour chains many lessons: restart replaces the tutorial world without
      // stacking beginTutorialSession snapshots (one pop must restore the project).
      if (keepTour && editor.levelSession?.kind === 'tutorial') {
        await editor.restartTutorialSession({
          lessonId: nextLesson.id,
          starterPath: nextLesson.starterPath,
        });
      } else {
        await editor.beginTutorialSession({
          lessonId: nextLesson.id,
          starterPath: nextLesson.starterPath,
        });
      }
      setActiveLessonId(nextLesson.id);
      setRuntime(createLessonRuntimeState(nextLesson));
      patchPrefs({ lastLessonId: nextLesson.id, lastStepId: nextLesson.steps[0]?.id || null });
      if (keepTour) {
        queueMicrotask(() => applyTourViewportReadable());
      }
    } catch (err) {
      setTourQueue(null);
      editor.notify?.(`Could not start tutorial: ${err?.message || err}`);
    }
  }, [editor, patchPrefs, hideTutorialsPanel, applyTourViewportReadable]);

  // Baseline after world is applied for the active tutorial
  useEffect(() => {
    if (!lesson || !runtime || runtime.baseline) return;
    if (!editor.world) return;
    if (editor.levelSession?.lessonId !== lesson.id) return;
    setRuntime((prev) => enterStep(prev || createLessonRuntimeState(lesson), lesson, editorSnapshot));
  }, [lesson, runtime, editor.world, editor.levelSession, editorSnapshot]);

  const restoreProjectFromTutorials = useCallback(() => {
    if (typeof editor.endAllTutorialSessions === 'function') {
      editor.endAllTutorialSessions();
      return;
    }
    if (editor.levelSession?.kind === 'tutorial') {
      editor.endTutorialSession();
    }
  }, [editor]);

  const exitLesson = useCallback(() => {
    setTourQueue(null);
    tourAdvanceLock.current = false;
    setActiveLessonId(null);
    setRuntime(null);
    restoreProjectFromTutorials();
    showTutorialsPanel();
  }, [restoreProjectFromTutorials, showTutorialsPanel]);

  const stopAcademyTour = useCallback(() => {
    setTourQueue(null);
    tourAdvanceLock.current = false;
    setActiveLessonId(null);
    setRuntime(null);
    restoreProjectFromTutorials();
    // Return to Level Editor if the tour left Materials / AI Assets open.
    void layout.setWorkspace?.('level');
    hideTourCursor();
    queueMicrotask(() => { dismissTourDialogs(); });
    editor.setStatus?.('Academy tour stopped');
    showTutorialsPanel();
  }, [editor, layout, restoreProjectFromTutorials, showTutorialsPanel]);

  const startAcademyTour = useCallback(async (lessonId = null) => {
    let queue;
    if (lessonId) {
      const one = getLessonById(lessonId);
      if (!one?.id || !Array.isArray(one.steps) || one.steps.length === 0) {
        editor.setStatus?.('That Academy lesson has no steps to tour');
        return;
      }
      queue = [one.id];
    } else {
      queue = buildAcademyTourQueue(listLessons().map((row) => getLessonById(row.id)).filter(Boolean));
    }
    if (!queue.length) {
      editor.setStatus?.('No Academy lessons to tour');
      return;
    }
    tourAdvanceLock.current = false;
    // Clear any nested tutorial frames so Stop can restore the real project.
    restoreProjectFromTutorials();
    setTourQueue(queue);
    hideTutorialsPanel();
    editor.setStatus?.(
      queue.length === 1
        ? `Touring · ${getLessonById(queue[0])?.title || queue[0]} (Esc to stop)`
        : `Academy tour · ${queue.length} lessons (Esc to stop)`,
    );
    await startLesson(queue[0], { keepTour: true });
  }, [editor, startLesson, hideTutorialsPanel, restoreProjectFromTutorials]);

  const restartLesson = useCallback(async () => {
    if (!lesson) return;
    await editor.restartTutorialSession({
      lessonId: lesson.id,
      starterPath: lesson.starterPath,
    });
    setRuntime(createLessonRuntimeState(lesson));
  }, [editor, lesson]);

  useEffect(() => {
    if (!runtime) {
      prevMode.current = editor.mode;
      prevCanUndo.current = editor.canUndo;
      return;
    }
    if (editor.mode !== prevMode.current) {
      setRuntime((s) => (s ? noteMode(s, editor.mode) : s));
      prevMode.current = editor.mode;
    }
    if (prevCanUndo.current && !editor.canUndo) {
      setRuntime((s) => (s ? noteUndo(s) : s));
    }
    prevCanUndo.current = editor.canUndo;
  }, [editor.mode, editor.canUndo, runtime]);

  // After a normal lesson finishes, reopen Academy so the Done badge is visible.
  useEffect(() => {
    if (!runtime?.completed || tourActive) return;
    showTutorialsPanel();
  }, [runtime?.completed, tourActive, showTutorialsPanel]);

  useEffect(() => {
    if (!lesson || !runtime || runtime.completed || !runtime.baseline) return;
    if (tourActive) return; // tour advances via skip timer
    if (autoAdvanceLock.current) return;
    const current = getStep(lesson, runtime.stepIndex);
    if (!current) return;
    if (current.verify?.type === 'manualConfirm' && !runtime.manualConfirmed) return;

    const result = evaluateCurrentStep(runtime, lesson, editorSnapshot);
    if (!result.ok) return;

    autoAdvanceLock.current = true;
    const { state, completedLesson } = advanceIfComplete(runtime, lesson, editorSnapshot);
    setRuntime(state);
    const st = getStep(lesson, state.stepIndex);
    patchPrefs({
      lastLessonId: lesson.id,
      lastStepId: st?.id || null,
      ...(completedLesson
        ? { completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])] }
        : {}),
    });
    queueMicrotask(() => {
      autoAdvanceLock.current = false;
    });
  }, [
    lesson,
    runtime,
    editorSnapshot,
    editor.revision,
    patchPrefs,
    prefs.completedLessonIds,
    tourActive,
  ]);

  // Academy tour: show tip, execute the instruction, then advance (skip if stuck).
  useEffect(() => {
    if (!tourActive || !lesson || !runtime || !runtime.baseline || runtime.completed) return;
    let cancelled = false;
    const stepIndexAtStart = runtime.stepIndex;
    const step = getStep(lesson, stepIndexAtStart);
    const verifyType = step?.verify?.type || 'none';
    const needsModeSettle = verifyType === 'modeIs' || verifyType === 'modeSequence';

    const speed = prefs.tourSpeed;
    const run = async () => {
      await new Promise((r) => window.setTimeout(r, tourDelay(ACADEMY_TOUR_READ_MS, speed)));
      if (cancelled) return;

      await dismissTourDialogsUntilClear();
      const exec = await executeTourStepAsync({
        step,
        runtime,
        editor: editorRef.current,
        layout: layoutRef.current,
      });
      await dismissTourDialogsUntilClear();

      await new Promise((r) => window.setTimeout(
        r,
        tourDelay(
          needsModeSettle ? ACADEMY_TOUR_MODE_SETTLE_MS : ACADEMY_TOUR_SETTLE_MS,
          speed,
        ),
      ));
      if (cancelled) return;
      await dismissTourDialogsUntilClear();

      const snap = readLiveEditorSnapshot();
      setRuntime((prev) => {
        if (!prev || prev.completed || prev.stepIndex !== stepIndexAtStart) return prev;
        let state = prev;
        if (exec.confirmManual
          || verifyType === 'manualConfirm'
          || verifyType === 'always'
          || verifyType === 'none') {
          state = confirmManual(state);
        }
        const result = evaluateCurrentStep(state, lesson, snap);
        if (result.ok) {
          return advanceIfComplete(state, lesson, snap).state;
        }
        // Instruction could not be fully verified — keep the tour moving.
        return skipStep(state, lesson, snap).state;
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    tourActive,
    lesson,
    runtime?.stepIndex,
    runtime?.baseline,
    runtime?.completed,
    prefs.tourSpeed,
    readLiveEditorSnapshot,
  ]);

  // Academy tour: chain to the next lesson, or finish (single-lesson tours mark Done).
  useEffect(() => {
    if (!tourActive || !runtime?.completed || !lesson || !tourQueue) return;
    if (tourAdvanceLock.current) return;
    tourAdvanceLock.current = true;
    const nextId = nextTourLessonId(tourQueue, lesson.id);
    const finish = async () => {
      try {
        if (!nextId) {
          const singleLessonTour = tourQueue.length === 1;
          if (singleLessonTour) {
            // Keep the completed lesson open; reopen Academy and mark Done.
            setTourQueue(null);
            patchPrefs({
              lastLessonId: lesson.id,
              lastStepId: null,
              completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])],
            });
            void layout.setWorkspace?.('level');
            hideTourCursor();
            queueMicrotask(() => { dismissTourDialogs(); });
            editor.setStatus?.(`Tour finished · ${lesson.title} marked Done`);
            showTutorialsPanel();
            return;
          }
          setTourQueue(null);
          setActiveLessonId(null);
          setRuntime(null);
          if (typeof editor.endAllTutorialSessions === 'function') {
            editor.endAllTutorialSessions();
          } else if (editor.levelSession?.kind === 'tutorial') {
            editor.endTutorialSession();
          }
          void layout.setWorkspace?.('level');
          hideTourCursor();
          queueMicrotask(() => { dismissTourDialogs(); });
          editor.setStatus?.('Academy tour finished');
          showTutorialsPanel();
          return;
        }
        editor.setStatus?.(
          `Academy tour · ${tourQueue.indexOf(nextId) + 1}/${tourQueue.length}: ${getLessonById(nextId)?.title || nextId}`,
        );
        await startLesson(nextId, { keepTour: true });
      } finally {
        queueMicrotask(() => {
          tourAdvanceLock.current = false;
        });
      }
    };
    void finish();
  }, [
    tourActive,
    runtime?.completed,
    lesson,
    tourQueue,
    editor,
    layout,
    startLesson,
    showTutorialsPanel,
    patchPrefs,
    prefs.completedLessonIds,
  ]);

  useEffect(() => {
    if (!tourActive) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopAcademyTour();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourActive, stopAcademyTour]);

  // While touring, auto-OK / Cancel popups and close leftover dropdowns so tips stay clear.
  useEffect(() => {
    if (!tourActive) return undefined;
    let scheduled = null;
    const tick = () => {
      dismissTourDialogs();
      dismissTourDropdowns();
    };
    const schedule = () => {
      if (scheduled != null) return;
      scheduled = window.setTimeout(() => {
        scheduled = null;
        tick();
      }, 50);
    };
    tick();
    const interval = window.setInterval(tick, 300);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(schedule)
      : null;
    observer?.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearInterval(interval);
      if (scheduled != null) window.clearTimeout(scheduled);
      observer?.disconnect();
    };
  }, [tourActive]);

  const highlightIds = step?.highlight || [];

  useEffect(() => {
    document.body.classList.toggle('bb-tutorial-active', Boolean(activeLessonId));
    document.querySelectorAll('[data-bb-tutorial-lit="1"]').forEach((el) => {
      el.removeAttribute('data-bb-tutorial-lit');
    });
    const ids = Array.isArray(highlightIds)
      ? highlightIds
      : (highlightIds ? [highlightIds] : []);
    for (const id of ids) {
      const dockId = dockIdForTutorialHighlight(id);
      const tab = dockId ? findDockTabElement(dockId) : null;
      // Always pulse the dock tab for in-panel targets (tip points here).
      if (tab) tab.setAttribute('data-bb-tutorial-lit', '1');
      // Pulse the specific control inside (not the panel-fill wrapper).
      if (!String(id).startsWith('panel.')) {
        document.querySelectorAll(`[data-bb-tutorial="${id}"]`).forEach((el) => {
          el.setAttribute('data-bb-tutorial-lit', '1');
        });
      } else if (!tab) {
        document.querySelectorAll(`[data-bb-tutorial="${id}"]`).forEach((el) => {
          el.setAttribute('data-bb-tutorial-lit', '1');
        });
      }
    }
    return () => {
      document.body.classList.remove('bb-tutorial-active');
      document.querySelectorAll('[data-bb-tutorial-lit="1"]').forEach((el) => {
        el.removeAttribute('data-bb-tutorial-lit');
      });
    };
  }, [highlightIds, activeLessonId, panelFocusToken]);

  const confirmStep = useCallback(() => {
    setRuntime((s) => (s ? confirmManual(s) : s));
  }, []);

  const back = useCallback(() => {
    if (!lesson || !runtime) return;
    setRuntime((s) => goBack(s, lesson, editorSnapshot));
  }, [lesson, runtime, editorSnapshot]);

  const next = useCallback(() => {
    if (!lesson || !runtime) return;
    const { state, completedLesson } = goNext(runtime, lesson, editorSnapshot);
    setRuntime(state);
    if (completedLesson && !tourActive) {
      patchPrefs({
        completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])],
        lastLessonId: lesson.id,
        lastStepId: null,
      });
    }
  }, [lesson, runtime, editorSnapshot, patchPrefs, prefs.completedLessonIds, tourActive]);

  const skip = useCallback(() => {
    if (!lesson || !runtime) return;
    const { state, completedLesson } = skipStep(runtime, lesson, editorSnapshot);
    setRuntime(state);
    if (completedLesson && !tourActive) {
      patchPrefs({
        completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])],
      });
    }
  }, [lesson, runtime, editorSnapshot, patchPrefs, prefs.completedLessonIds, tourActive]);

  const tourProgress = tourActive
    ? academyTourProgress({
      queue: tourQueue,
      lessonId: lesson?.id || activeLessonId,
      stepIndex: runtime?.stepIndex ?? 0,
      stepCount: lesson?.steps?.length ?? 0,
      lessons: tourQueue.map((id) => getLessonById(id)).filter(Boolean),
    })
    : null;

  const value = {
    lessons: listLessons(),
    prefs,
    activeLessonId,
    lesson,
    step,
    runtime,
    stepIndex: runtime?.stepIndex ?? 0,
    stepCount: lesson?.steps?.length ?? 0,
    feedback: runtime?.feedback || null,
    completed: Boolean(runtime?.completed),
    highlightIds,
    panelFocusToken,
    tourActive,
    tourProgress,
    setTourSpeed,
    openTutorialsPanel: showTutorialsPanel,
    startLesson,
    startAcademyTour,
    stopAcademyTour,
    exitLesson,
    restartLesson,
    confirmStep,
    back,
    next,
    skip,
    isTutorialSession: editor.levelSession?.kind === 'tutorial',
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorials() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorials must be used within TutorialProvider');
  return ctx;
}
