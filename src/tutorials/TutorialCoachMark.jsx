import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTutorials } from './TutorialProvider.jsx';
import { useEditor } from '../editor/EditorContext.jsx';
import { getTutorialAnchorRect, positionCoachMark } from './positionCoachMark.js';

/**
 * Independent floating step window parked next to the highlighted control,
 * with an arrow pointing at the feature. Completing the task auto-advances
 * (provider); Next / Skip move on manually.
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
    next,
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
      const cardHeight = cardRef.current?.offsetHeight || 240;

      if (!hit) {
        setLayout({
          left: Math.round(layerRect.width / 2 - 160),
          top: 80,
          width: 320,
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
        panelWidth: 320,
        panelHeight: cardHeight,
        layerWidth: layerRect.width,
        layerHeight: layerRect.height,
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
    // Reposition as dock layout / scroll changes
    const timer = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
      ro?.disconnect();
    };
  }, [activeLessonId, step, highlightIds, stepIndex, feedback, completed, explainOpen]);

  if (!activeLessonId || !lesson || !step) return null;

  const host = document.querySelector('.bb-stage-viewport') || document.body;

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
        } : { left: 24, top: 80, width: 320 }}
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
            {Math.min(stepIndex + 1, stepCount)} / {stepCount}
          </span>
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
              className="bb-btn bb-btn--ghost"
              onClick={() => setExplainOpen((v) => !v)}
            >
              {explainOpen ? 'Hide tip' : 'More explanation'}
            </button>
            {explainOpen && <p className="bb-tutorials-explain__body">{step.explain}</p>}
          </div>
        )}

        {feedback && (
          <p className="bb-tutorials-feedback" role="status">{feedback}</p>
        )}

        {completed && (
          <p className="bb-tutorials-complete" role="status">
            Done! Exit restores your project, or save this practice room under a new name.
          </p>
        )}

        <div className="bb-coach-card__actions">
          {step.verify?.type === 'manualConfirm' && !completed && (
            <button type="button" className="bb-btn bb-btn--primary" onClick={confirmStep}>
              {step.verify.label || 'Done'}
            </button>
          )}
          <button type="button" className="bb-btn" disabled={completed} onClick={next}>
            Next
          </button>
          <button type="button" className="bb-btn" disabled={completed} onClick={skip}>
            Skip
          </button>
          <button type="button" className="bb-btn" disabled={stepIndex <= 0} onClick={back}>
            Back
          </button>
          <button type="button" className="bb-btn" onClick={() => { void restartLesson(); }}>
            Restart
          </button>
          <button type="button" className="bb-btn" onClick={() => { void exitLesson(); }}>
            Exit
          </button>
          {isTutorialSession && (
            <button type="button" className="bb-btn" onClick={() => { void saveLevel(); }}>
              Save As…
            </button>
          )}
        </div>
      </div>
    </div>,
    host,
  );
}
