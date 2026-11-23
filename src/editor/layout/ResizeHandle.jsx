import { useEffect, useRef, useState } from 'react';
import { useLayout } from './LayoutContext.jsx';
import { viewScaleFactor } from './viewScale.js';

/**
 * 1-axis resize handle. Pointer deltas are converted from screen px into
 * layout px so Ctrl+scroll UI scale does not break panel sizing.
 */
export function ResizeHandle({ axis = 'x', invert = false, onDelta, onDragEnd }) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);
  const { layout } = useLayout();
  const scale = viewScaleFactor(layout.uiScale);

  useEffect(() => {
    if (!dragging) return undefined;

    const onMove = (e) => {
      const pos = axis === 'x' ? e.clientX : e.clientY;
      const raw = pos - last.current;
      last.current = pos;
      const screenDelta = invert ? -raw : raw;
      const layoutDelta = screenDelta / scale;
      if (layoutDelta !== 0) onDelta?.(layoutDelta);
    };
    const onUp = () => {
      setDragging(false);
      onDragEnd?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, axis, invert, onDelta, onDragEnd, scale]);

  return (
    <div
      className={`${axis === 'x' ? 'bb-resize-v' : 'bb-resize-h'}${dragging ? ' is-dragging' : ''}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        last.current = axis === 'x' ? e.clientX : e.clientY;
        setDragging(true);
      }}
    />
  );
}
