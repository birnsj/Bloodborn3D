import { ACADEMY_TOUR_SPEEDS } from './academyTour.js';
import { useTutorials } from './TutorialProvider.jsx';

/**
 * Fixed chrome while Academy Tour runs — Academy panel is hidden, so this is the
 * always-visible “it is running” signal (plus the floating coach tip).
 */
export function AcademyTourBanner() {
  const {
    tourActive,
    tourProgress,
    lesson,
    step,
    prefs,
    setTourSpeed,
    stopAcademyTour,
  } = useTutorials();
  if (!tourActive || !tourProgress) return null;

  return (
    <div className="bb-academy-tour-banner" role="status" aria-live="polite">
      <div className="bb-academy-tour-banner__copy">
        <strong className="bb-academy-tour-banner__label">Academy Tour</strong>
        <span className="bb-academy-tour-banner__meta">
          Lesson {tourProgress.lessonIndex + 1}/{tourProgress.lessonCount}
          {lesson?.title ? ` · ${lesson.title}` : ''}
          {' · '}
          tip {tourProgress.stepOrdinal}/{tourProgress.totalSteps}
          {step?.title ? ` — ${step.title}` : ''}
        </span>
      </div>
      <label className="bb-academy-tour-banner__speed">
        <span className="bb-academy-tour-banner__speed-label">Speed</span>
        <select
          className="bb-academy-tour-banner__speed-select"
          value={String(prefs.tourSpeed ?? 1)}
          aria-label="Academy tour speed"
          onChange={(e) => { setTourSpeed(Number(e.target.value)); }}
        >
          {ACADEMY_TOUR_SPEEDS.map((row) => (
            <option key={row.id} value={row.factor}>{row.label}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="bb-btn bb-academy-tour-banner__stop"
        onClick={() => { stopAcademyTour(); }}
      >
        Stop tour
      </button>
    </div>
  );
}
