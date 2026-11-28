/**
 * Imperative fake-cursor driver for Academy Tour.
 * React overlay (AcademyTourCursor) subscribes and renders the pointer.
 */

import { tourMs } from './tourSpeed.js';

const listeners = new Set();

let state = {
  visible: false,
  x: 0,
  y: 0,
  pressing: false,
  button: 'left', // left | right
};

function emit() {
  const snap = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(snap);
    } catch {
      // ignore subscriber errors
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function getTourCursorState() {
  return { ...state };
}

export function subscribeTourCursor(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function showTourCursor(x, y, { button = 'left' } = {}) {
  state = {
    ...state,
    visible: true,
    x: Number(x) || 0,
    y: Number(y) || 0,
    pressing: false,
    button,
  };
  emit();
}

export function hideTourCursor() {
  if (!state.visible && !state.pressing) return;
  state = { ...state, visible: false, pressing: false };
  emit();
}

export function setTourCursorPosition(x, y) {
  state = { ...state, visible: true, x: Number(x) || 0, y: Number(y) || 0 };
  emit();
}

/** Ease cursor to a client-pixel point. */
export async function moveTourCursorTo(x, y, { ms = 380, button = null } = {}) {
  if (typeof window === 'undefined') return;
  const startX = state.visible ? state.x : x;
  const startY = state.visible ? state.y : y;
  if (!state.visible) {
    showTourCursor(startX, startY, { button: button || state.button });
  } else if (button) {
    state = { ...state, button };
    emit();
  }

  const dx = x - startX;
  const dy = y - startY;
  if (Math.hypot(dx, dy) < 2) {
    setTourCursorPosition(x, y);
    return;
  }

  const duration = Math.max(50, tourMs(Number(ms) || 380));
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      // ease-out cubic
      const e = 1 - ((1 - t) ** 3);
      setTourCursorPosition(startX + dx * e, startY + dy * e);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/** Brief press animation (left or right mouse). */
export async function tourCursorClick({ button = 'left', holdMs = 120 } = {}) {
  state = { ...state, visible: true, pressing: true, button };
  emit();
  await sleep(tourMs(holdMs));
  state = { ...state, pressing: false };
  emit();
  await sleep(tourMs(40));
}

/** Client point at the center of an element (or null). */
export function clientPointForElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return null;
  return {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  };
}

/** Active viewport canvas client rect. */
export function getViewportCanvasRect() {
  if (typeof document === 'undefined') return null;
  const canvas = document.querySelector('.bb-viewport canvas')
    || document.querySelector('.bb-viewport-shell canvas')
    || document.querySelector('canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return rect;
}

/** Convert NDC (−1…1, y up) to client pixels over the viewport canvas. */
export function ndcToClient(nx, ny) {
  const rect = getViewportCanvasRect();
  if (!rect) return null;
  return {
    x: rect.left + ((Number(nx) + 1) * 0.5) * rect.width,
    y: rect.top + ((1 - Number(ny)) * 0.5) * rect.height,
  };
}

/** Move fake cursor to a highlight control and click it. */
export async function tourCursorClickHighlight(highlightId) {
  if (!highlightId || typeof document === 'undefined') return false;
  const escape = (typeof CSS !== 'undefined' && CSS.escape)
    ? CSS.escape(String(highlightId))
    : String(highlightId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = document.querySelector(`[data-bb-tutorial="${escape}"]`);
  if (!el) return false;
  const clickable = el.matches('button, a, select, input, [role="button"], [role="tab"]')
    ? el
    : (el.querySelector('button, a, select, input, [role="button"], [role="tab"]') || el);
  const point = clientPointForElement(clickable);
  if (!point) return false;
  await moveTourCursorTo(point.x, point.y, { ms: 420 });
  await tourCursorClick({ button: 'left' });
  if (typeof clickable.click === 'function') clickable.click();
  return true;
}

/**
 * Drag with right button across the viewport while orbiting (visual only + orbit API).
 */
export async function tourCursorOrbitDrag({
  azimuth = 0.85,
  polar = 0.12,
  steps = 14,
  stepMs = 35,
  orbitCamera = null,
} = {}) {
  const rect = getViewportCanvasRect();
  if (!rect) {
    if (orbitCamera) {
      const dA = azimuth / steps;
      const dP = polar / steps;
      for (let i = 0; i < steps; i += 1) {
        orbitCamera({ azimuth: dA, polar: dP });
        await sleep(stepMs);
      }
    }
    return false;
  }

  const cx = rect.left + rect.width * 0.55;
  const cy = rect.top + rect.height * 0.45;
  const radius = Math.min(rect.width, rect.height) * 0.18;
  await moveTourCursorTo(cx - radius, cy, { ms: 280, button: 'right' });
  state = { ...state, pressing: true, button: 'right' };
  emit();

  const dA = azimuth / steps;
  const dP = polar / steps;
  const pacedStepMs = tourMs(stepMs);
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 1) / steps;
    const ang = t * Math.PI * 0.85;
    setTourCursorPosition(
      cx - radius * Math.cos(ang),
      cy - radius * Math.sin(ang) * 0.65,
    );
    orbitCamera?.({ azimuth: dA, polar: dP });
    await sleep(pacedStepMs);
  }

  state = { ...state, pressing: false };
  emit();
  await sleep(tourMs(50));
  return true;
}
