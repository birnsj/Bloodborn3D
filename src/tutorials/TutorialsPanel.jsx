import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../editor/EditorContext.jsx';
import { useLayout } from '../editor/layout/LayoutContext.jsx';
import { ACADEMY_TOUR_SPEEDS } from './academyTour.js';
import { useTutorials } from './TutorialProvider.jsx';
import { LESSONS } from './lessons/index.js';
import { helpProps } from '../ui/hoverHelp/helpProps.js';
import { IconAcademy } from '../ui/icons.jsx';

const SECTIONS = [
  {
    id: 'start',
    title: 'Start here',
    ids: ['getting-started', 'first-room', 'doors-windows'],
  },
  {
    id: 'build',
    title: 'Build & dress the space',
    ids: [
      'subtractive-geometry',
      'materials',
      'lighting',
      'lighting-advanced',
      'furnishing',
      'organizing',
      'prefabs',
      'ceilings-multilevel',
      'ramps-stairs',
      'columns-arches-curves',
      'environmental-objects',
      'native-geometry',
      'static-meshes',
    ],
  },
  {
    id: 'sculpt',
    title: 'Edit geometry',
    ids: ['geometry-editing', 'surface-align', 'pivot-editing'],
  },
  {
    id: 'editor',
    title: 'Editor & play',
    ids: ['testing', 'workspace', 'editor-layers', 'editor-helpers', 'asset-tools'],
  },
  {
    id: 'art',
    title: 'Art & generation',
    ids: [
      'project-art-library',
      'asset-generation',
      'post-processing',
      'world-fog-atmosphere',
      'world-environment',
      'materials-shading',
      'textures',
    ],
  },
];

const ACADEMY_W_MIN = 280;
const ACADEMY_W_MAX = 560;
const ACADEMY_H_MIN = 320;
const ACADEMY_H_MAX = 720;
const ACADEMY_W_DEFAULT = 360;
const ACADEMY_H_DEFAULT = 480;

function readUiScale(el) {
  const app = el?.closest?.('.bb-app');
  const scaleRaw = app
    ? Number(getComputedStyle(app).getPropertyValue('--bb-ui-scale'))
    : 1;
  return Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
}

function clampSize(w, h) {
  return {
    w: Math.min(ACADEMY_W_MAX, Math.max(ACADEMY_W_MIN, Math.round(w))),
    h: Math.min(ACADEMY_H_MAX, Math.max(ACADEMY_H_MIN, Math.round(h))),
  };
}

/**
 * Floating Academy catalog (not a dock tab). Like Checklist — drag + resize chrome.
 * Visibility: layout.tutorialsVisible. Hidden in Play.
 */
export function TutorialsPanel() {
  const { mode } = useEditor();
  const { layout, patch } = useLayout();
  const {
    lessons,
    prefs,
    activeLessonId,
    lesson,
    stepIndex,
    stepCount,
    completed,
    startLesson,
    startAcademyTour,
    stopAcademyTour,
    setTourSpeed,
    exitLesson,
    tourActive,
    tourProgress,
    panelFocusToken,
  } = useTutorials();

  const rootRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const [pos, setPos] = useState({ x: null, y: 56 });
  const [size, setSize] = useState({ w: ACADEMY_W_DEFAULT, h: ACADEMY_H_DEFAULT });

  const visible = Boolean(layout.tutorialsVisible);

  const byId = useMemo(() => {
    const map = new Map();
    for (const item of lessons) map.set(item.id, item);
    return map;
  }, [lessons]);

  const sections = useMemo(() => (
    SECTIONS.map((section) => ({
      ...section,
      items: section.ids.map((id) => byId.get(id)).filter(Boolean),
    })).filter((section) => section.items.length > 0)
  ), [byId]);

  const tourStepTotal = useMemo(
    () => LESSONS.reduce((n, item) => n + (item.steps?.length || 0), 0),
    [],
  );
  const tourSpeed = prefs.tourSpeed ?? 1;
  const tourMinutesHint = Math.max(
    1,
    Math.round((tourStepTotal * 1.1 / tourSpeed) / 60),
  );

  useEffect(() => {
    if (panelFocusToken > 0 && visible) {
      rootRef.current?.querySelector?.('.bb-tutorials-catalog')?.focus?.();
    }
  }, [panelFocusToken, visible]);

  const closePanel = useCallback(() => {
    patch({ tutorialsVisible: false });
  }, [patch]);

  const onDragHandleDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const panel = e.currentTarget.closest('.bb-academy-panel');
    const host = e.currentTarget.closest('.bb-dock-host');
    if (!panel || !host) return;
    const scale = readUiScale(host);
    const hostRect = host.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const grabX = e.clientX - panelRect.left;
    const grabY = e.clientY - panelRect.top;
    const maxX = Math.max(8, host.clientWidth - panel.offsetWidth - 8);
    const maxY = Math.max(8, host.clientHeight - panel.offsetHeight - 8);
    dragRef.current = { grabX, grabY, hostRect, scale, maxX, maxY };

    const localPos = (clientX, clientY) => {
      const d = dragRef.current;
      if (!d) return { x: 8, y: 8 };
      const x = (clientX - d.hostRect.left - d.grabX) / d.scale;
      const y = (clientY - d.hostRect.top - d.grabY) / d.scale;
      return {
        x: Math.max(8, Math.min(d.maxX, x)),
        y: Math.max(8, Math.min(d.maxY, y)),
      };
    };

    setPos(localPos(e.clientX, e.clientY));

    const onMove = (ev) => setPos(localPos(ev.clientX, ev.clientY));
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onResizeCornerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const uiScale = readUiScale(e.currentTarget);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
      uiScale,
    };
    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = (ev.clientX - r.startX) / r.uiScale;
      const dy = (ev.clientY - r.startY) / r.uiScale;
      setSize(clampSize(r.startW + dx, r.startH + dy));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (mode === 'play' || !visible) return null;

  const style = {
    ...(pos.x == null
      ? { top: `${pos.y}px`, right: '28px' }
      : { top: `${pos.y}px`, left: `${pos.x}px` }),
    width: `${size.w}px`,
    height: `${size.h}px`,
  };

  return (
    <div className="bb-academy-layer" aria-label="BloodBound Academy">
      <aside
        className="bb-academy-panel"
        style={style}
        ref={rootRef}
        data-bb-tutorial="panel.tutorials"
        {...helpProps('panel.tutorials')}
      >
        <header
          className="bb-academy-panel__bar"
          onPointerDown={onDragHandleDown}
        >
          <span className="bb-academy-panel__grip" aria-hidden>⋮⋮</span>
          <span className="bb-academy-panel__mark" aria-hidden>
            <IconAcademy width={18} height={18} />
          </span>
          <span className="bb-academy-panel__title">Academy</span>
          <button
            type="button"
            className="bb-academy-panel__close"
            title="Close Academy"
            aria-label="Close Academy"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={closePanel}
          >
            ×
          </button>
        </header>

        <div className="bb-tutorials bb-tutorials--floating">
          <header className="bb-tutorials__header">
            <p className="bb-tutorials__eyebrow">Educational · not part of your level</p>
            <h2 className="bb-tutorials__title">
              <span className="bb-tutorials__mark" aria-hidden>
                <IconAcademy width={28} height={28} />
              </span>
              BloodBound Academy
            </h2>
            <p className="bb-tutorials__lead">
              Choose a lesson. A tip appears next to each control; finish the task to advance.
              Academy hides while a tip is up, then returns when the lesson is Done.
              Use <strong>Tour</strong> on a lesson to auto-walk it, or <strong>Tour all lessons</strong>
              (~{tourMinutesHint} min, {tourStepTotal} tips).
            </p>
            {!activeLessonId && (
              <div className="bb-tutorials-tour">
                <div className="bb-tutorials-tour__row">
                  <button
                    type="button"
                    className="bb-btn bb-btn--primary"
                    onClick={() => { void startAcademyTour(); }}
                    {...helpProps('panel.tutorials.tour')}
                  >
                    Tour all lessons
                  </button>
                  <label className="bb-tutorials-tour__speed" {...helpProps('panel.tutorials.tourSpeed')}>
                    <span>Speed</span>
                    <select
                      value={String(tourSpeed)}
                      aria-label="Academy tour speed"
                      onChange={(e) => { setTourSpeed(Number(e.target.value)); }}
                    >
                      {ACADEMY_TOUR_SPEEDS.map((row) => (
                        <option key={row.id} value={row.factor}>{row.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="bb-tutorials-tour__hint">
                  Per-lesson Tour marks that lesson Done when finished.
                  Tour all walks every tip and does not mark Done. Esc or Stop cancels.
                </p>
              </div>
            )}
          </header>

          {activeLessonId ? (
            <div className={`bb-tutorials-running${completed && !tourActive ? ' bb-tutorials-running--complete' : ''}`}>
              <div className="bb-tutorials-running__copy">
                <p className="bb-tutorials-running__label">
                  {tourActive ? 'Academy tour' : (completed ? 'Lesson complete' : 'In progress')}
                </p>
                <p className="bb-tutorials-running__title">
                  {lesson?.title}
                  {completed && !tourActive ? (
                    <span className="bb-tutorials-badge">Done</span>
                  ) : null}
                </p>
                <p className="bb-tutorials-running__meta">
                  {tourActive && tourProgress
                    ? `Lesson ${tourProgress.lessonIndex + 1}/${tourProgress.lessonCount} · tip ${tourProgress.stepOrdinal}/${tourProgress.totalSteps}`
                    : completed
                      ? 'Marked Done in the catalog below. Exit restores your project, or pick another lesson.'
                      : `Step ${stepIndex + 1} of ${stepCount} — follow the floating tip.`}
                </p>
              </div>
              {tourActive ? (
                <button type="button" className="bb-btn" onClick={() => { stopAcademyTour(); }}>
                  Stop tour
                </button>
              ) : (
                <button type="button" className="bb-btn bb-btn--primary" onClick={() => { void exitLesson(); }}>
                  {completed ? 'Exit to project' : 'Exit lesson'}
                </button>
              )}
            </div>
          ) : null}

          <div className="bb-tutorials-catalog" tabIndex={-1}>
            {sections.map((section) => (
              <section key={section.id} className="bb-tutorials-section">
                <h3 className="bb-tutorials-section__title">{section.title}</h3>
                <ul className="bb-tutorials-list">
                  {section.items.map((item) => {
                    const done = prefs.completedLessonIds?.includes(item.id);
                    return (
                      <li key={item.id} className="bb-tutorials-list__row">
                        <button
                          type="button"
                          className="bb-tutorials-list__item"
                          onClick={() => { void startLesson(item.id); }}
                          title="Practice this lesson yourself"
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
                        {!activeLessonId ? (
                          <button
                            type="button"
                            className="bb-btn bb-tutorials-list__tour"
                            title={`Tour “${item.title}” automatically`}
                            aria-label={`Tour ${item.title}`}
                            onClick={() => { void startAcademyTour(item.id); }}
                            {...helpProps('panel.tutorials.tourLesson')}
                          >
                            Tour
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div
          className="bb-academy-panel__resize"
          role="separator"
          aria-orientation="both"
          aria-label="Resize Academy"
          title="Drag to resize"
          onPointerDown={onResizeCornerDown}
        />
      </aside>
    </div>
  );
}
