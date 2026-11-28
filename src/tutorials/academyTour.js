/**
 * Academy Tour — timed walkthrough of lesson steps (one lesson or the full catalog).
 * Executes each tip’s task when possible. Full-catalog tour does not mark Done;
 * a single-lesson tour marks that lesson Done when it finishes.
 */

/** How long to leave the tip visible before performing the step (ms) at 1×. */
export const ACADEMY_TOUR_READ_MS = 1400;

/** Wait after execution for editor React/world state to settle (ms) at 1×. */
export const ACADEMY_TOUR_SETTLE_MS = 350;

/** Extra wait after Play / Stop before verifying mode (ms) at 1×. */
export const ACADEMY_TOUR_MODE_SETTLE_MS = 900;

/** @deprecated use ACADEMY_TOUR_READ_MS — kept for older imports/tests */
export const ACADEMY_TOUR_STEP_MS = ACADEMY_TOUR_READ_MS;

/** Allowed tour playback speeds (higher = shorter waits / faster cursor). */
export const ACADEMY_TOUR_SPEEDS = [
  { id: '0.5', label: '0.5×', factor: 0.5 },
  { id: '1', label: '1×', factor: 1 },
  { id: '1.5', label: '1.5×', factor: 1.5 },
  { id: '2', label: '2×', factor: 2 },
  { id: '3', label: '3×', factor: 3 },
];

export function normalizeTourSpeed(value) {
  const n = Number(value);
  if (ACADEMY_TOUR_SPEEDS.some((row) => row.factor === n)) return n;
  return 1;
}

/** Scale a base delay by tour speed (2× → half the wait). */
export function tourDelay(baseMs, speed = 1) {
  const factor = normalizeTourSpeed(speed);
  return Math.max(40, Math.round(Number(baseMs) / factor));
}

/**
 * Build ordered lesson ids for a full catalog tour.
 * Accepts full lesson objects (with `steps`) or catalog rows from `listLessons`
 * (no steps — those are included as long as they have an id).
 */
export function buildAcademyTourQueue(lessons = []) {
  return [...lessons]
    .filter((lesson) => {
      if (!lesson?.id) return false;
      if (Array.isArray(lesson.steps)) return lesson.steps.length > 0;
      return true; // catalog summary rows omit steps
    })
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((lesson) => lesson.id);
}

export function academyTourProgress({
  queue = [],
  lessonId = null,
  stepIndex = 0,
  stepCount = 0,
  lessons = [],
} = {}) {
  const lessonPos = Math.max(0, queue.indexOf(lessonId));
  let stepsBefore = 0;
  let totalSteps = 0;
  for (let i = 0; i < queue.length; i += 1) {
    const lesson = lessons.find((item) => item.id === queue[i]);
    const n = lesson?.steps?.length || 0;
    totalSteps += n;
    if (i < lessonPos) stepsBefore += n;
  }
  const within = Math.min(Math.max(0, stepIndex), Math.max(0, stepCount - 1));
  const currentStepOrdinal = stepsBefore + within + 1;
  return {
    lessonIndex: lessonPos,
    lessonCount: queue.length,
    stepOrdinal: totalSteps ? Math.min(currentStepOrdinal, totalSteps) : 0,
    totalSteps,
  };
}

export function nextTourLessonId(queue, currentLessonId) {
  if (!queue?.length) return null;
  const idx = queue.indexOf(currentLessonId);
  if (idx < 0) return queue[0] || null;
  return queue[idx + 1] || null;
}
