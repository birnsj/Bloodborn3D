import { captureBaseline, evaluateVerify } from './verifiers.js';

/**
 * Pure step-machine helpers for tutorials (easy to unit test).
 */

export function clampStepIndex(lesson, index) {
  if (!lesson?.steps?.length) return 0;
  return Math.max(0, Math.min(Number(index) || 0, lesson.steps.length - 1));
}

export function getStep(lesson, index) {
  if (!lesson?.steps?.length) return null;
  return lesson.steps[clampStepIndex(lesson, index)] || null;
}

export function isLastStep(lesson, index) {
  if (!lesson?.steps?.length) return true;
  return clampStepIndex(lesson, index) >= lesson.steps.length - 1;
}

export function createLessonRuntimeState(lesson) {
  return {
    lessonId: lesson?.id || null,
    stepIndex: 0,
    tracked: {},
    baseline: null,
    feedback: null,
    manualConfirmed: false,
    modeHistory: ['edit'],
    undoObserved: false,
    completed: false,
  };
}

export function enterStep(state, lesson, editorSnapshot) {
  const stepIndex = clampStepIndex(lesson, state.stepIndex);
  getStep(lesson, stepIndex); // validate step exists for this index
  const baseline = captureBaseline(editorSnapshot.world, editorSnapshot.selectedActorIds);
  return {
    ...state,
    stepIndex,
    baseline,
    feedback: null,
    manualConfirmed: false,
    undoObserved: false,
  };
}

export function applyVerifyResult(state, result) {
  if (!result?.ok) {
    return {
      ...state,
      feedback: result?.hint || state.feedback,
    };
  }
  const tracked = { ...state.tracked, ...(result.track || {}) };
  return {
    ...state,
    tracked,
    feedback: null,
  };
}

export function evaluateCurrentStep(state, lesson, editorSnapshot) {
  const step = getStep(lesson, state.stepIndex);
  if (!step) return { ok: true };
  return evaluateVerify(step.verify || { type: 'none' }, {
    world: editorSnapshot.world,
    mode: editorSnapshot.mode,
    tool: editorSnapshot.tool,
    geometryMode: editorSnapshot.geometryMode,
    geometrySelection: editorSnapshot.geometrySelection,
    transformMode: editorSnapshot.transformMode,
    clipSession: editorSnapshot.clipSession,
    selectedActorIds: editorSnapshot.selectedActorIds,
    selectedSurface: editorSnapshot.selectedSurface,
    baseline: state.baseline,
    tracked: state.tracked,
    modeHistory: state.modeHistory,
    gridSize: editorSnapshot.gridSize,
    canUndo: editorSnapshot.canUndo,
    canRedo: editorSnapshot.canRedo,
    viewportLayoutMode: editorSnapshot.viewportLayoutMode,
    viewportCameraMode: editorSnapshot.viewportCameraMode,
    manualConfirmed: state.manualConfirmed,
    undoObserved: state.undoObserved,
  });
}

export function advanceIfComplete(state, lesson, editorSnapshot) {
  const result = evaluateCurrentStep(state, lesson, editorSnapshot);
  if (!result.ok) {
    return { state: applyVerifyResult(state, result), advanced: false, completedLesson: false };
  }
  let next = applyVerifyResult(state, result);
  if (isLastStep(lesson, next.stepIndex)) {
    next = { ...next, completed: true };
    return { state: next, advanced: false, completedLesson: true };
  }
  next = {
    ...next,
    stepIndex: next.stepIndex + 1,
  };
  next = enterStep(next, lesson, editorSnapshot);
  return { state: next, advanced: true, completedLesson: false };
}

export function goBack(state, lesson, editorSnapshot) {
  const stepIndex = Math.max(0, state.stepIndex - 1);
  return enterStep({ ...state, stepIndex, completed: false }, lesson, editorSnapshot);
}

export function goNext(state, lesson, editorSnapshot) {
  // Manual next: only if current verify passes (or is none / already manual)
  const step = getStep(lesson, state.stepIndex);
  if (step?.verify?.type === 'manualConfirm' && !state.manualConfirmed) {
    return {
      state: {
        ...state,
        feedback: 'Confirm this step when you are ready, or use Skip.',
      },
      advanced: false,
      completedLesson: false,
    };
  }
  return advanceIfComplete(state, lesson, editorSnapshot);
}

export function skipStep(state, lesson, editorSnapshot) {
  if (isLastStep(lesson, state.stepIndex)) {
    return { state: { ...state, completed: true }, advanced: false, completedLesson: true };
  }
  const next = enterStep({
    ...state,
    stepIndex: state.stepIndex + 1,
    completed: false,
  }, lesson, editorSnapshot);
  return { state: next, advanced: true, completedLesson: false };
}

export function confirmManual(state) {
  return { ...state, manualConfirmed: true, feedback: null };
}

export function noteMode(state, mode) {
  if (!mode) return state;
  const last = state.modeHistory[state.modeHistory.length - 1];
  if (last === mode) return state;
  return {
    ...state,
    modeHistory: [...state.modeHistory, mode].slice(-12),
  };
}

export function noteUndo(state) {
  return { ...state, undoObserved: true };
}
