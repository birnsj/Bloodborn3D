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
  clampTutorialPrefs,
  loadTutorialPrefs,
  saveTutorialPrefs,
} from './tutorialPrefs.js';

const TutorialContext = createContext(null);

export function TutorialProvider({ children }) {
  const editor = useEditor();
  const layout = useLayout();
  const [prefs, setPrefs] = useState(() => loadTutorialPrefs());
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [panelFocusToken, setPanelFocusToken] = useState(0);
  /** Bumps when Cam / layout changes so viewportCameraIs / viewportLayoutIs re-check. */
  const [viewportTick, setViewportTick] = useState(0);
  const prevCanUndo = useRef(editor.canUndo);
  const prevMode = useRef(editor.mode);
  const autoAdvanceLock = useRef(false);

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

  const showTutorialsPanel = useCallback(() => {
    layout.ensurePanel?.('tutorials');
    setPanelFocusToken((n) => n + 1);
  }, [layout]);

  const patchPrefs = useCallback((partial) => {
    setPrefs((prev) => saveTutorialPrefs(clampTutorialPrefs({ ...prev, ...partial })));
  }, []);

  const startLesson = useCallback(async (lessonId) => {
    const nextLesson = getLessonById(lessonId);
    if (!nextLesson) return;
    try {
      showTutorialsPanel();
      await editor.beginTutorialSession({
        lessonId: nextLesson.id,
        starterPath: nextLesson.starterPath,
      });
      setActiveLessonId(nextLesson.id);
      setRuntime(createLessonRuntimeState(nextLesson));
      patchPrefs({ lastLessonId: nextLesson.id, lastStepId: nextLesson.steps[0]?.id || null });
    } catch (err) {
      editor.notify?.(`Could not start tutorial: ${err?.message || err}`);
    }
  }, [editor, patchPrefs, showTutorialsPanel]);

  // Baseline after world is applied for the active tutorial
  useEffect(() => {
    if (!lesson || !runtime || runtime.baseline) return;
    if (!editor.world) return;
    if (editor.levelSession?.lessonId !== lesson.id) return;
    setRuntime((prev) => enterStep(prev || createLessonRuntimeState(lesson), lesson, editorSnapshot));
  }, [lesson, runtime, editor.world, editor.levelSession, editorSnapshot]);

  const exitLesson = useCallback(() => {
    setActiveLessonId(null);
    setRuntime(null);
    if (editor.levelSession?.kind === 'tutorial') {
      editor.endTutorialSession();
    }
  }, [editor]);

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

  useEffect(() => {
    if (!lesson || !runtime || runtime.completed || !runtime.baseline) return;
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
  ]);

  const highlightIds = step?.highlight || [];

  useEffect(() => {
    document.body.classList.toggle('bb-tutorial-active', Boolean(activeLessonId));
    document.querySelectorAll('[data-bb-tutorial-lit="1"]').forEach((el) => {
      el.removeAttribute('data-bb-tutorial-lit');
    });
    for (const id of highlightIds) {
      document.querySelectorAll(`[data-bb-tutorial="${id}"]`).forEach((el) => {
        el.setAttribute('data-bb-tutorial-lit', '1');
      });
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
    if (completedLesson) {
      patchPrefs({
        completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])],
        lastLessonId: lesson.id,
        lastStepId: null,
      });
    }
  }, [lesson, runtime, editorSnapshot, patchPrefs, prefs.completedLessonIds]);

  const skip = useCallback(() => {
    if (!lesson || !runtime) return;
    const { state, completedLesson } = skipStep(runtime, lesson, editorSnapshot);
    setRuntime(state);
    if (completedLesson) {
      patchPrefs({
        completedLessonIds: [...new Set([...(prefs.completedLessonIds || []), lesson.id])],
      });
    }
  }, [lesson, runtime, editorSnapshot, patchPrefs, prefs.completedLessonIds]);

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
    openTutorialsPanel: showTutorialsPanel,
    startLesson,
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
