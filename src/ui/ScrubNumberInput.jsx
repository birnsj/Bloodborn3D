import { useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 5;
const PX_PER_STEP = 8;

function clampScrubValue(n, min, max) {
  let next = n;
  if (min != null && min !== '' && Number.isFinite(Number(min))) {
    next = Math.max(Number(min), next);
  }
  if (max != null && max !== '' && Number.isFinite(Number(max))) {
    next = Math.min(Number(max), next);
  }
  return next;
}

/** Axis / label scrub — always drag-to-nudge (no text caret). */
function useHorizontalScrub({ value, step, disabled, onChange, onCommit, onGestureStart, min, max }) {
  const scrubRef = useRef(null);
  const didScrubRef = useRef(false);

  const onPointerDown = (e) => {
    if (disabled || e.button !== 0) return;
    didScrubRef.current = false;
    scrubRef.current = {
      startX: e.clientX,
      startValue: Number.isFinite(value) ? value : 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const scrub = scrubRef.current;
    if (!scrub) return;
    const dx = e.clientX - scrub.startX;
    if (!scrub.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      scrub.moved = true;
      didScrubRef.current = true;
      document.body.classList.add('bb-is-scrubbing');
      onGestureStart?.();
    }
    const steps = Math.round(dx / PX_PER_STEP);
    onChange(clampScrubValue(
      scrub.startValue + steps * (Number(step) || 1),
      min,
      max,
    ));
  };

  const endScrub = (e) => {
    if (!scrubRef.current) return;
    const didScrub = scrubRef.current.moved;
    scrubRef.current = null;
    document.body.classList.remove('bb-is-scrubbing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (didScrub) onCommit?.();
  };

  return {
    scrubHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endScrub,
      onPointerCancel: endScrub,
    },
    didScrubRef,
  };
}

/** Axis letter that drags horizontally to nudge a numeric value. */
export function ScrubAxisLabel({
  axis,
  value,
  onChange,
  onCommit,
  onGestureStart,
  disabled,
  step,
}) {
  const { scrubHandlers } = useHorizontalScrub({
    value,
    step,
    disabled,
    onChange,
    onCommit,
    onGestureStart,
  });

  return (
    <span
      className={`bb-axis bb-axis--${axis} bb-axis--scrub`}
      {...scrubHandlers}
    >
      {axis.toUpperCase()}
    </span>
  );
}

/**
 * Number field: drag horizontally to scrub when unfocused;
 * click (no drag) focuses for typing. While focused, behaves as a normal input.
 *
 * Undo-friendly optional hooks:
 * - onGestureStart: scrub drag began or field focused for typing
 * - onChange: every intermediate value (live preview)
 * - onCommit: scrub ended or field blurred after an edit
 * - onCancel: Escape while typing — parent should restore the gesture-start value
 */
export function ScrubNumberInput({
  value,
  onChange,
  onCommit,
  onGestureStart,
  onCancel,
  disabled = false,
  step = 1,
  className = 'bb-input',
  min,
  max,
  ...rest
}) {
  const inputRef = useRef(null);
  const scrubRef = useRef(null);
  const gestureActiveRef = useRef(false);
  const [draft, setDraft] = useState(null);
  const [focused, setFocused] = useState(false);

  const emitChange = (n) => {
    if (!Number.isFinite(n)) return;
    onChange(clampScrubValue(n, min, max));
  };

  const beginGesture = () => {
    if (gestureActiveRef.current) return;
    gestureActiveRef.current = true;
    onGestureStart?.();
  };

  const endGestureCommit = () => {
    if (!gestureActiveRef.current) return;
    gestureActiveRef.current = false;
    onCommit?.();
  };

  const endGestureCancel = () => {
    if (!gestureActiveRef.current) {
      onCancel?.();
      return;
    }
    gestureActiveRef.current = false;
    onCancel?.();
  };

  // Only clear the typing draft when the field is not focused (external value sync).
  useEffect(() => {
    if (!focused) setDraft(null);
  }, [value, focused]);

  const finishPointer = (e) => {
    const scrub = scrubRef.current;
    if (!scrub || scrub.pointerId !== e.pointerId) return;
    const didScrub = scrub.moved;
    scrubRef.current = null;
    document.body.classList.remove('bb-is-scrubbing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (didScrub) {
      endGestureCommit();
      return;
    }
    // Clean click (no drag): enter text-edit mode and select for quick retype.
    if (!disabled) {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  const display = draft !== null ? draft : (Number.isFinite(value) ? value : 0);

  return (
    <input
      {...rest}
      ref={inputRef}
      className={`${className} bb-input--scrub`.trim()}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={display}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (Number.isFinite(n)) emitChange(n);
      }}
      onFocus={() => {
        setFocused(true);
        beginGesture();
      }}
      onBlur={() => {
        setFocused(false);
        setDraft(null);
        endGestureCommit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          endGestureCancel();
          setDraft(null);
          e.currentTarget.blur();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        // Already editing — allow normal caret / text selection, no scrub.
        if (document.activeElement === e.currentTarget) {
          scrubRef.current = null;
          return;
        }
        scrubRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startValue: Number.isFinite(value) ? value : 0,
          moved: false,
        };
        // Defer focus until pointerup so a drag never flashes a caret.
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.pointerId !== e.pointerId) return;
        const dx = e.clientX - scrub.startX;
        if (!scrub.moved) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          scrub.moved = true;
          document.body.classList.add('bb-is-scrubbing');
          beginGesture();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        const steps = Math.round(dx / PX_PER_STEP);
        emitChange(scrub.startValue + steps * (Number(step) || 1));
      }}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    />
  );
}
