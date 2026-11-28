const STORAGE_KEY = 'bloodbound.tutorial.progress.v1';

import { normalizeTourSpeed } from './academyTour.js';

export const DEFAULT_TUTORIAL_PREFS = {
  completedLessonIds: [],
  lastLessonId: null,
  lastStepId: null,
  /** Academy Tour playback speed (0.5 … 3). */
  tourSpeed: 1,
};

export function clampTutorialPrefs(partial = {}) {
  const next = {
    ...DEFAULT_TUTORIAL_PREFS,
    ...partial,
  };
  next.completedLessonIds = Array.isArray(next.completedLessonIds)
    ? [...new Set(next.completedLessonIds.filter((id) => typeof id === 'string' && id))]
    : [];
  next.lastLessonId = typeof next.lastLessonId === 'string' ? next.lastLessonId : null;
  next.lastStepId = typeof next.lastStepId === 'string' ? next.lastStepId : null;
  next.tourSpeed = normalizeTourSpeed(next.tourSpeed);
  return next;
}

export function loadTutorialPrefs(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return { ...DEFAULT_TUTORIAL_PREFS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TUTORIAL_PREFS };
    return clampTutorialPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TUTORIAL_PREFS };
  }
}

export function saveTutorialPrefs(prefs, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return clampTutorialPrefs(prefs);
  const next = clampTutorialPrefs(prefs);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export { STORAGE_KEY as TUTORIAL_PREFS_KEY };
