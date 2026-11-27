import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTutorials } from './TutorialProvider.jsx';
import { useEditor } from '../editor/EditorContext.jsx';
import { getTutorialAnchorRect, positionCoachMark } from './positionCoachMark.js';

/**
 * Floating tip parked next to the highlighted control.
 * One clear primary action; Back / Skip / Exit stay quiet secondary links.
 */
export function TutorialCoachMark() {
  const {
    activeLessonId,
    lesson,
    step,
    stepIndex,
    stepCount,
    feedback,
    completed,
    highlightIds,
    confirmStep,
    back,
    skip,
    restartLesson,
    exitLesson,
    isTutorialSession,
  } = useTutorials();
  const { saveLevel } = useEditor();
  const [explainOpen, setExplainOpen] = useState(false);
  const [layout, setLayout] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    setExplainOpen(false);
  }, [step?.id]);

  useLayoutEffect(() => {
    if (!activeLessonId || !step) {
      setLayout(null);
      return undefined;
    }

    const update = () => {
      const hit = getTutorialAnchorRect(highlightIds);
      const layer = document.querySelector('.bb-stage-viewport') || document.body;
      const layerRect = layer.getBoundingClientRect();
      const cardHeight = cardRef.current?.offsetHeight || 280;

      if (!hit) {
        setLayout({
          left: Math.round(layerRect.width / 2 - 180),
          top: 88,
          width: 360,
          placement: 'below',
          arrow: null,
          anchor: null,
        });
        return;
      }

      const anchor = {
        left: hit.rect.left - layerRect.left,
        top: hit.rect.top - layerRect.top,
        width: hit.rect.width,
        height: hit.rect.height,
        right: hit.rect.right - layerRect.left,
        bottom: hit.rect.bottom - layerRect.top,
      };

      const pos = positionCoachMark({
        anchor,
        panelWidth: 360,
        panelHeight: cardHeight,
        layerWidth: layerRect.width,
        layerHeight: layerRect.height,
        preferBeside: Boolean(hit.viaTab),
      });

      setLayout({
        ...pos,
        anchor,
        targetId: hit.id,
      });
    };

    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    window.addEventListener('resize', update);
    const timer = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
      ro?.disconnect();
    };
  }, [activeLessonId, step, highlightIds, stepIndex, feedback, completed, explainOpen]);

  if (!activeLessonId || !lesson || !step) return null;

  const host = document.querySelector('.bb-stage-viewport') || document.body;
  const progress = stepCount > 0 ? ((stepIndex + (completed ? 1 : 0)) / stepCount) * 100 : 0;
  const isManual = step.verify?.type === 'manualConfirm';
  const primaryLabel = step.verify?.label || 'Continue';

  return createPortal(
    <div className="bb-coach-layer" aria-live="polite">
      {layout?.anchor && (
        <div
          className="bb-coach-spotlight"
          style={{
            left: layout.anchor.left - 4,
            top: layout.anchor.top - 4,
            width: layout.anchor.width + 8,
            height: layout.anchor.height + 8,
          }}
        />
      )}

      <div
        ref={cardRef}
        className={`bb-coach-card bb-coach-card--${layout?.placement || 'below'}`}
        style={layout ? {
          left: layout.left,
          top: layout.top,
          width: layout.width,
        } : { left: 24, top: 88, width: 360 }}
        role="dialog"
        aria-label={`Tutorial step: ${step.title}`}
      >
        {layout?.arrow && (
          <span
            className={`bb-coach-arrow bb-coach-arrow--${layout.placement}`}
            style={
              layout.placement === 'left' || layout.placement === 'right'
                ? { top: layout.arrow.offset }
                : { left: layout.arrow.offset }
            }
            aria-hidden
          />
        )}

        <div className="bb-coach-card__chrome">
          <span className="bb-coach-card__lesson">{lesson.title}</span>
          <span className="bb-coach-card__step">
            {Math.min(stepIndex + 1, stepCount)} of {stepCount}
          </span>
        </div>

        <div className="bb-coach-card__progress" aria-hidden>
          <div className="bb-coach-card__progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <h3 className="bb-coach-card__title">{step.title}</h3>
        <p className="bb-coach-card__body">{step.body}</p>

        {step.terms?.length > 0 && (
          <dl className="bb-tutorials-terms bb-tutorials-terms--compact">
            {step.terms.map((t) => (
              <div key={t.term} className="bb-tutorials-terms__row">
                <dt>{t.term}</dt>
                <dd>{t.def}</dd>
              </div>
            ))}
          </dl>
        )}

        {step.explain && (
          <div className="bb-tutorials-explain">
            <button
              type="button"
              className="bb-coach-link"
              onClick={() => setExplainOpen((v) => !v)}
            >
              {explainOpen ? 'Hide tip' : 'Why this matters'}
            </button>
            {explainOpen && <p className="bb-tutorials-explain__body">{step.explain}</p>}
          </div>
        )}

        {feedback && (
          <p className="bb-tutorials-feedback" role="status">{feedback}</p>
        )}

        {completed ? (
          <>
            <p className="bb-tutorials-complete" role="status">
              Lesson complete. Exit restores your project, or save this practice room under a new name.
            </p>
            <div className="bb-coach-card__primary">
              <button type="button" className="bb-btn bb-btn--primary bb-coach-primary" onClick={() => { void exitLesson(); }}>
                Exit to project
              </button>
            </div>
            <div className="bb-coach-card__secondary">
              {isTutorialSession && (
                <button type="button" className="bb-coach-link" onClick={() => { void saveLevel(); }}>
                  Save practice…
                </button>
              )}
              <button type="button" className="bb-coach-link" onClick={() => { void restartLesson(); }}>
                Restart lesson
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bb-coach-card__primary">
              {isManual ? (
                <button type="button" className="bb-btn bb-btn--primary bb-coach-primary" onClick={confirmStep}>
                  {primaryLabel}
                </button>
              ) : (
                <p className="bb-coach-card__waiting">
                  Do the step above — this tip advances when it detects your change.
                </p>
              )}
            </div>
            <div className="bb-coach-card__secondary">
              <button type="button" className="bb-coach-link" disabled={stepIndex <= 0} onClick={back}>
                Back
              </button>
              <button type="button" className="bb-coach-link" onClick={skip}>
                Skip
              </button>
              <button type="button" className="bb-coach-link bb-coach-link--muted" onClick={() => { void exitLesson(); }}>
                Exit
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    host,
  );
}
