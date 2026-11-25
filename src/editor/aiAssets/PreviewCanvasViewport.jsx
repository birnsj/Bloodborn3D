import { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.12;
const WASD_SPEED = 420; // px/sec at zoom 1

function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Pan/zoom wrapper for Result Preview artwork (and empty frame).
 * Wheel zooms · middle-mouse drag pans · WASD pans when focused.
 */
export function PreviewCanvasViewport({ children, className = '' }) {
  const rootRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  const keysRef = useRef(new Set());
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const stopWasdLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    lastTsRef.current = 0;
  }, []);

  const tickWasd = useCallback((ts) => {
    const keys = keysRef.current;
    if (keys.size === 0) {
      stopWasdLoop();
      return;
    }
    const prev = lastTsRef.current || ts;
    lastTsRef.current = ts;
    const dt = Math.min(0.05, (ts - prev) / 1000);
    const zoom = viewRef.current.zoom || 1;
    const step = (WASD_SPEED * dt) / zoom;
    let dx = 0;
    let dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx += step;
    if (keys.has('d') || keys.has('arrowright')) dx -= step;
    if (keys.has('w') || keys.has('arrowup')) dy += step;
    if (keys.has('s') || keys.has('arrowdown')) dy -= step;
    if (dx || dy) {
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    rafRef.current = requestAnimationFrame(tickWasd);
  }, [stopWasdLoop]);

  const startWasdLoop = useCallback(() => {
    if (rafRef.current) return;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(tickWasd);
  }, [tickWasd]);

  useEffect(() => () => stopWasdLoop(), [stopWasdLoop]);

  // Native non-passive wheel so preventDefault actually stops page scroll.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = root.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = 1 + ZOOM_STEP * direction;
      setView((v) => {
        const nextZoom = clampZoom(v.zoom * factor);
        const ratio = nextZoom / v.zoom;
        return {
          zoom: nextZoom,
          x: cx - (cx - v.x) * ratio,
          y: cy - (cy - v.y) * ratio,
        };
      });
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 1) return; // middle only
    e.preventDefault();
    e.stopPropagation();
    rootRef.current?.focus?.({ preventScroll: true });
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('is-panning');
  }, []);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);

  const endPan = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag || (e.pointerId != null && drag.pointerId !== e.pointerId)) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    e.currentTarget.classList.remove('is-panning');
  }, []);

  const onKeyDown = useCallback((e) => {
    if (isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      return;
    }
    e.preventDefault();
    keysRef.current.add(key);
    startWasdLoop();
  }, [startWasdLoop]);

  const onKeyUp = useCallback((e) => {
    const key = e.key.toLowerCase();
    keysRef.current.delete(key);
    if (keysRef.current.size === 0) stopWasdLoop();
  }, [stopWasdLoop]);

  const onBlur = useCallback(() => {
    keysRef.current.clear();
    stopWasdLoop();
    dragRef.current = null;
  }, [stopWasdLoop]);

  const onAuxClick = useCallback((e) => {
    // Prevent middle-click default (autoscroll / open link).
    if (e.button === 1) e.preventDefault();
  }, []);

  const resetView = useCallback(() => {
    setView({ x: 0, y: 0, zoom: 1 });
  }, []);

  return (
    <div
      ref={rootRef}
      className={`bb-preview-canvas${className ? ` ${className}` : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Preview canvas. Scroll wheel zooms. Middle-mouse drag or WASD pans."
      title="Scroll to zoom · Middle-drag or WASD to pan · Double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
      onAuxClick={onAuxClick}
      onDoubleClick={resetView}
    >
      <div
        className="bb-preview-canvas__world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {children}
      </div>
      <div className="bb-preview-canvas__hint" aria-hidden>
        {Math.round(view.zoom * 100)}% · MMB / WASD
      </div>
    </div>
  );
}
