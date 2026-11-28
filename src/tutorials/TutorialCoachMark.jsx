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
    tourActive,
    tourProgress,
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
      const cardHeight = cardRef.current?.offsetHeight || (tourActive ? 160 : 280);
      const panelWidth = tourActive ? 300 : 360;

      if (!hit) {
        setLayout({
          left: tourActive ? 16 : Math.round(layerRect.width / 2 - panelWidth / 2),
          top: tourActive ? Math.max(56, layerRect.height - cardHeight - 16) : 88,
          width: panelWidth,
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

      // Never cover the highlighted button (or the lit in-panel control).
      const avoidRects = [{
        ...anchor,
        right: anchor.right,
        bottom: anchor.bottom,
      }];
      const litRect = hit.litEl && hit.litEl !== hit.el
        ? hit.litEl.getBoundingClientRect?.()
        : null;
      if (litRect && litRect.width >= 2 && litRect.height >= 2) {
        avoidRects.push({
          left: litRect.left - layerRect.left,
          top: litRect.top - layerRect.top,
          width: litRect.width,
          height: litRect.height,
          right: litRect.right - layerRect.left,
          bottom: litRect.bottom - layerRect.top,
        });
      }
      if (tourActive) {
        const canvas = document.querySelector('.bb-viewport canvas, .bb-viewport-shell canvas');
        if (canvas) {
          const cr = canvas.getBoundingClientRect();
          // Avoid the center of the viewport (where orbit / pick happens).
          const insetX = cr.width * 0.12;
          const insetY = cr.height * 0.12;
          avoidRects.push({
            left: cr.left - layerRect.left + insetX,
            top: cr.top - layerRect.top + insetY,
            width: cr.width - insetX * 2,
            height: cr.height - insetY * 2,
            right: cr.right - layerRect.left - insetX,
            bottom: cr.bottom - layerRect.top - insetY,
          });
        }
        // Tour banner strip.
        avoidRects.push({
          left: layerRect.width * 0.2,
          top: 0,
          width: layerRect.width * 0.6,
          height: 56,
          right: layerRect.width * 0.8,
          bottom: 56,
        });
      }

      const pos = positionCoachMark({
        anchor,
        panelWidth,
        panelHeight: cardHeight,
        layerWidth: layerRect.width,
        layerHeight: layerRect.height,
        preferBeside: Boolean(hit.viaTab),
        avoidRects,
        clearOfAction: tourActive,
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
    const timer = window.setInterval(update, tourActive ? 250 : 500);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
      ro?.disconnect();
    };
  }, [activeLessonId, step, highlightIds, stepIndex, feedback, completed, explainOpen, tourActive]);

  if (!activeLessonId || !lesson || !step) return null;

  const host = document.querySelector('.bb-stage-viewport') || document.body;
  const progress = stepCount > 0 ? ((stepIndex + (completed ? 1 : 0)) / stepCount) * 100 : 0;
  const isManual = step.verify?.type === 'manualConfirm';
  const primaryLabel = step.verify?.label || 'Continue';

  return createPortal(
    <div className={`bb-coach-layer${tourActive ? ' bb-coach-layer--tour' : ''}`} aria-live="polite">
      {layout?.anchor && (
        <div
          className={`bb-coach-spotlight${tourActive ? ' bb-coach-spotlight--tour' : ''}`}
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
        className={[
          'bb-coach-card',
          `bb-coach-card--${layout?.placement || 'below'}`,
          tourActive ? 'bb-coach-card--tour' : '',
        ].filter(Boolean).join(' ')}
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
          <span className="bb-coach-card__lesson">
            {tourActive ? `Tour · ${lesson.title}` : lesson.title}
          </span>
          <span className="bb-coach-card__step">
            {tourActive && tourProgress
              ? `${tourProgress.stepOrdinal}/${tourProgress.totalSteps}`
              : `${Math.min(stepIndex + 1, stepCount)} of ${stepCount}`}
          </span>
        </div>

        <div className="bb-coach-card__progress" aria-hidden>
          <div className="bb-coach-card__progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <h3 className="bb-coach-card__title">{step.title}</h3>
        <p className="bb-coach-card__body">{step.body}</p>

        {!tourActive && step.terms?.length > 0 && (
          <dl className="bb-tutorials-terms bb-tutorials-terms--compact">
            {step.terms.map((t) => (
              <div key={t.term} className="bb-tutorials-terms__row">
                <dt>{t.term}</dt>
                <dd>{t.def}</dd>
              </div>
            ))}
          </dl>
        )}

        {!tourActive && step.explain && (
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

        {tourActive && !completed ? (
          <p className="bb-coach-card__waiting" role="status">
            Performing tip… Esc or banner Stop cancels.
          </p>
        ) : completed ? (
          <>
            <p className="bb-tutorials-complete" role="status">
              {tourActive
                ? 'Loading next lesson…'
                : 'Lesson complete. Exit restores your project, or save this practice room under a new name.'}
            </p>
            {!tourActive && (
              <>
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
            )}
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
