import { useEffect, useRef } from 'react';
import { useTutorials } from './TutorialProvider.jsx';
import { helpProps } from '../ui/hoverHelp/helpProps.js';

/**
 * Lesson catalog only. Active steps render as floating coach marks near controls.
 */
export function TutorialsPanel({ docked = false }) {
  const {
    lessons,
    prefs,
    activeLessonId,
    lesson,
    stepIndex,
    stepCount,
    startLesson,
    exitLesson,
    panelFocusToken,
  } = useTutorials();
  const rootRef = useRef(null);

  useEffect(() => {
    if (panelFocusToken > 0) {
      rootRef.current?.querySelector?.('.bb-tutorials-catalog')?.focus?.();
    }
  }, [panelFocusToken]);

  return (
    <div
      className={`bb-tutorials ${docked ? 'bb-tutorials--docked' : ''}`}
      ref={rootRef}
      data-bb-tutorial="panel.tutorials"
      {...helpProps('panel.tutorials')}
    >
      <header className="bb-tutorials__header">
        <h2 className="bb-tutorials__title">Tutorials</h2>
        <p className="bb-tutorials__lead">
          Pick a lesson. Guidance appears in a floating window next to each control — finish the
          step (or Next / Skip) and the next tip moves to the next feature.
        </p>
      </header>

      {activeLessonId && (
        <div className="bb-tutorials-running">
          <p>
            Running: <strong>{lesson?.title}</strong>
            {' '}
            (step {stepIndex + 1}/{stepCount}). Follow the floating tip on the screen.
          </p>
          <button type="button" className="bb-btn" onClick={() => { void exitLesson(); }}>
            Exit lesson
          </button>
        </div>
      )}

      {!activeLessonId && (
        <div className="bb-tutorials-catalog" tabIndex={-1}>
          <ul className="bb-tutorials-list">
            {lessons.map((item) => {
              const done = prefs.completedLessonIds?.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="bb-tutorials-list__item"
                    onClick={() => { void startLesson(item.id); }}
                  >
                    <span className="bb-tutorials-list__order">{item.order}</span>
                    <span className="bb-tutorials-list__body">
                      <span className="bb-tutorials-list__name">
                        {item.title}
                        {done ? <span className="bb-tutorials-badge">Done</span> : null}
                      </span>
                      <span className="bb-tutorials-list__summary">{item.summary}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
