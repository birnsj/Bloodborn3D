import { useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 3;
const PX_PER_STEP = 8;

function useHorizontalScrub({ value, step, disabled, onChange }) {
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
      if (typeof e.currentTarget.blur === 'function') e.currentTarget.blur();
    }
    const steps = Math.round(dx / PX_PER_STEP);
    onChange(scrub.startValue + steps * (Number(step) || 1));
  };

  const endScrub = (e) => {
    if (!scrubRef.current) return;
    scrubRef.current = null;
    document.body.classList.remove('bb-is-scrubbing');
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
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
export function ScrubAxisLabel({ axis, value, onChange, disabled, step }) {
  const { scrubHandlers } = useHorizontalScrub({ value, step, disabled, onChange });

  return (
    <span
      className={`bb-axis bb-axis--${axis} bb-axis--scrub`}
      {...scrubHandlers}
    >
      {axis.toUpperCase()}
    </span>
  );
}

/** Number field: type to edit, or drag horizontally to scrub (no spinner arrows). */
export function ScrubNumberInput({
  value,
  onChange,
  disabled = false,
  step = 1,
  className = 'bb-input',
  ...rest
}) {
  const [draft, setDraft] = useState(null);
  const { scrubHandlers, didScrubRef } = useHorizontalScrub({
    value,
    step,
    disabled,
    onChange,
  });

  useEffect(() => {
    setDraft(null);
  }, [value]);

  const display = draft !== null ? draft : (Number.isFinite(value) ? value : 0);

  return (
    <input
      {...rest}
      className={`${className} bb-input--scrub`.trim()}
      type="number"
      inputMode="decimal"
      step={step}
      value={display}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onPointerDown={scrubHandlers.onPointerDown}
      onPointerMove={scrubHandlers.onPointerMove}
      onPointerUp={scrubHandlers.onPointerUp}
      onPointerCancel={scrubHandlers.onPointerCancel}
      onClick={(e) => {
        // After a scrub gesture, suppress the click that would re-focus the field.
        if (didScrubRef.current) {
          didScrubRef.current = false;
          e.preventDefault();
        }
      }}
    />
  );
}
