import { useState } from 'react';
import { ScrubNumberInput } from '../../ui/ScrubNumberInput.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';

export function ExtrudeClipControls({
  disabled,
  gridSize,
  geometryMode,
  geometrySelection,
  clipSession,
  selectedActor,
  commitExtrudeFace,
  previewExtrudeFace,
  beginClipSession,
  setClipSessionMode,
  cancelClipSession,
  setClipPlaneFromFace,
  commitClipSession,
}) {
  const [distance, setDistance] = useState(gridSize || 25);
  const [clipModeDraft, setClipModeDraft] = useState('front');
  const primaryFace = geometryMode === 'face' ? geometrySelection?.primary : null;
  const canExtrude = Boolean(primaryFace) && !disabled;
  const clipMode = clipSession?.mode || clipModeDraft;
  const clipReady = Boolean(clipSession?.plane);

  return (
    <div className="bb-details-actions">
      <p className="bb-muted">
        Extrude creates a new prism brush from the selected face. Clip cuts by a plane
        (three picks or the selected face plane).
      </p>
      <label className="bb-field">
        <span className="bb-field__label">Extrude depth (eu)</span>
        <ScrubNumberInput
          value={distance}
          disabled={disabled}
          step={gridSize || 25}
          onChange={(v) => {
            setDistance(v);
            if (canExtrude) previewExtrudeFace?.(v);
          }}
        />
      </label>
      <button
        type="button"
        className="bb-btn"
        disabled={!canExtrude}
        title={canExtrude ? 'Extrude selected face' : 'Select a face in Face mode'}
        onClick={() => commitExtrudeFace?.(distance)}
        {...helpProps('details.extrude', canExtrude ? null : 'Select a face in Face mode.')}
      >
        Extrude Face
      </button>

      <div className="bb-field" style={{ marginTop: '0.75rem' }}>
        <span className="bb-field__label">Clip mode</span>
        <select
          className="bb-select"
          disabled={disabled}
          value={clipMode}
          onChange={(e) => {
            const m = e.target.value;
            setClipModeDraft(m);
            if (clipSession) setClipSessionMode?.(m);
          }}
        >
          <option value="front">Keep front</option>
          <option value="back">Keep back</option>
          <option value="split">Split (both)</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled}
          onClick={() => beginClipSession?.(clipMode)}
          {...helpProps('details.clipPick', disabled ? 'Unavailable during Play mode.' : null)}
        >
          Pick 3 Points
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !primaryFace}
          title={primaryFace ? 'Use selected face as clip plane' : 'Select a face first'}
          onClick={() => {
            if (!primaryFace) return;
            setClipPlaneFromFace?.(primaryFace.actorId, primaryFace.id, clipMode);
          }}
          {...helpProps('details.clipByFace', primaryFace ? null : 'Select a face first.')}
        >
          Clip by Face
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !clipReady}
          onClick={() => commitClipSession?.()}
          title="Apply clip (Enter)"
          {...helpProps('details.extrudeClip', !clipReady ? 'Pick a clip plane first.' : null)}
        >
          Apply Clip
        </button>
        <button
          type="button"
          className="bb-btn"
          disabled={disabled || !clipSession}
          onClick={() => cancelClipSession?.()}
          title="Cancel clip (Esc)"
          {...helpProps('details.clipCancel', clipSession ? null : 'No active clip session.')}
        >
          Cancel
        </button>
      </div>
      {clipSession && (
        <p className="bb-muted">
          Clip session: {clipSession.points?.length || 0}/3 points
          {clipReady ? ' · plane ready (Enter)' : ''}
          {clipSession.preview?.ok === false ? ` · ${clipSession.preview.message}` : ''}
          {clipSession.preview?.ok ? ' · preview ok' : ''}
          {' · Esc cancels'}
        </p>
      )}
      {!selectedActor && (
        <p className="bb-muted">Select a brush to extrude or clip.</p>
      )}
    </div>
  );
}
