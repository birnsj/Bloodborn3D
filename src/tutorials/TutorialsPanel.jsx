import { useEffect, useMemo, useRef } from 'react';
import { useTutorials } from './TutorialProvider.jsx';
import { helpProps } from '../ui/hoverHelp/helpProps.js';

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
      'furnishing',
      'organizing',
      'prefabs',
      'ceilings-multilevel',
      'ramps-stairs',
      'columns-arches-curves',
    ],
  },
  {
    id: 'sculpt',
    title: 'Edit geometry',
    ids: ['geometry-editing', 'surface-align'],
  },
  {
    id: 'editor',
    title: 'Editor & play',
    ids: ['testing', 'workspace', 'editor-layers'],
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
      'textures',
    ],
  },
];

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
          BloodBound Academy — choose a lesson. A tip appears next to each control; finish the task to advance.
          Art &amp; generation covers Project Art, Asset Generation, Post Processing, Fog, and World Environment.
        </p>
      </header>

      {activeLessonId ? (
        <div className="bb-tutorials-running">
          <div className="bb-tutorials-running__copy">
            <p className="bb-tutorials-running__label">In progress</p>
            <p className="bb-tutorials-running__title">{lesson?.title}</p>
            <p className="bb-tutorials-running__meta">
              Step {stepIndex + 1} of {stepCount} — follow the floating tip.
            </p>
          </div>
          <button type="button" className="bb-btn" onClick={() => { void exitLesson(); }}>
            Exit lesson
          </button>
        </div>
      ) : (
        <div className="bb-tutorials-catalog" tabIndex={-1}>
          {sections.map((section) => (
            <section key={section.id} className="bb-tutorials-section">
              <h3 className="bb-tutorials-section__title">{section.title}</h3>
              <ul className="bb-tutorials-list">
                {section.items.map((item) => {
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
