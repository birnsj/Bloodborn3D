import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTutorials } from './TutorialProvider.jsx';
import { hideTourCursor, subscribeTourCursor } from './tourCursor.js';

/**
 * Visible fake pointer while Academy Tour runs — follows the tour’s
 * orbit / pick / UI clicks so the demo looks like a real cursor.
 */
export function AcademyTourCursor() {
  const { tourActive } = useTutorials();
  const [cursor, setCursor] = useState(() => ({
    visible: false,
    x: 0,
    y: 0,
    pressing: false,
    button: 'left',
  }));

  useEffect(() => subscribeTourCursor(setCursor), []);

  useEffect(() => {
    if (!tourActive) hideTourCursor();
  }, [tourActive]);

  if (!tourActive || !cursor.visible || typeof document === 'undefined') return null;

  const host = document.body;
  const label = cursor.button === 'right' ? 'RMB' : 'LMB';

  return createPortal(
    <div
      className={`bb-tour-cursor${cursor.pressing ? ' bb-tour-cursor--press' : ''}${cursor.button === 'right' ? ' bb-tour-cursor--right' : ''}`}
      style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}
      aria-hidden="true"
    >
      <svg className="bb-tour-cursor__arrow" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 3.5 L4 18.5 L9.2 13.8 L12.8 21.2 L15.2 20 L11.5 12.5 L18.5 12.5 Z"
          fill="currentColor"
          stroke="#1a1a18"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      {cursor.pressing ? (
        <span className="bb-tour-cursor__ripple" data-button={label} />
      ) : null}
    </div>,
    host,
  );
}
