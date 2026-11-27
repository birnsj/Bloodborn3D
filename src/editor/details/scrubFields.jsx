import { useRef } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { ScrubAxisLabel, ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useWorldNumericGesture } from './useWorldNumericGesture.js';
import { lightAuthorableSnapshot } from '../../components/LightComponent.js';

export function WorldScrubNumber({
  kind = 'scene',
  patch,
  label = 'Edit world setting',
  value,
  disabled,
  step,
  min,
  max,
  className = 'bb-input',
}) {
  const gesture = useWorldNumericGesture(kind);
  return (
    <ScrubNumberInput
      className={className}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={value}
      onGestureStart={gesture.begin}
      onChange={(v) => gesture.live(typeof patch === 'function' ? patch(v) : { [patch]: v })}
      onCommit={() => gesture.commit(label)}
      onCancel={gesture.cancel}
    />
  );
}

export function LightScrubNumber({
  light,
  field,
  map,
  label = 'Edit light',
  value,
  disabled,
  step,
  min,
  max,
}) {
  const { updateSelectedLight, commitLightGesture } = useEditor();
  const beforeRef = useRef(null);

  return (
    <ScrubNumberInput
      className="bb-input"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={Number.isFinite(value) ? value : 0}
      onGestureStart={() => {
        if (!light || beforeRef.current) return;
        beforeRef.current = lightAuthorableSnapshot(light);
      }}
      onChange={(v) => {
        const partial = typeof map === 'function' ? map(v) : { [field]: v };
        updateSelectedLight(partial, { undoable: false });
      }}
      onCommit={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (before) commitLightGesture?.(before, label);
      }}
      onCancel={() => {
        const before = beforeRef.current;
        beforeRef.current = null;
        if (!before) return;
        updateSelectedLight(before, { undoable: false });
      }}
    />
  );
}

export function AxisInputs({ values, onChange, disabled, step, helpId }) {
  return (
    <div className="bb-axis-row" {...(helpId ? helpProps(helpId) : {})}>
      {['x', 'y', 'z'].map((axis) => (
        <FragmentAxis
          key={axis}
          axis={axis}
          value={values[axis]}
          disabled={disabled}
          step={step}
          onChange={(v) => onChange({ [axis]: v })}
        />
      ))}
    </div>
  );
}

export function FragmentAxis({ axis, value, onChange, disabled, step }) {
  return (
    <>
      <ScrubAxisLabel
        axis={axis}
        value={value}
        disabled={disabled}
        step={step}
        onChange={onChange}
      />
      <ScrubNumberInput
        value={value}
        disabled={disabled}
        step={step}
        onChange={onChange}
      />
    </>
  );
}
