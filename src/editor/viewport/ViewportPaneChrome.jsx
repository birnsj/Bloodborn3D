import { CAMERA_MODES, DISPLAY_MODES } from './viewportPrefs.js';

const CAMERA_LABELS = {
  perspective: 'Perspective',
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
};

const DISPLAY_LABELS = {
  lit: 'Lit',
  unlit: 'Unlit',
  textured: 'Textured',
  wireframe: 'Wireframe',
  'solid-edges': 'Solid+Edges',
};

export function ViewportPaneChrome({
  pane,
  active,
  maximized,
  onCameraMode,
  onDisplayMode,
  onFocusSelected,
  onToggleMaximize,
}) {
  return (
    <div className={`bb-viewport-pane-chrome${active ? ' is-active' : ''}`}>
      <label className="bb-viewport-pane-field" title="Camera">
        <span className="bb-viewport-pane-field-label">Cam</span>
        <select
          value={pane.cameraMode}
          onChange={(e) => onCameraMode(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {CAMERA_MODES.map((mode) => (
            <option key={mode} value={mode}>{CAMERA_LABELS[mode] || mode}</option>
          ))}
        </select>
      </label>
      <label className="bb-viewport-pane-field" title="Display mode">
        <span className="bb-viewport-pane-field-label">View</span>
        <select
          value={pane.displayMode}
          onChange={(e) => onDisplayMode(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>{DISPLAY_LABELS[mode] || mode}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="bb-btn bb-btn--tiny"
        title="Focus selected"
        onClick={(e) => {
          e.stopPropagation();
          onFocusSelected?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        Focus
      </button>
      <button
        type="button"
        className="bb-btn bb-btn--tiny"
        title={maximized ? 'Restore layout' : 'Maximize viewport'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMaximize?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {maximized ? 'Restore' : 'Max'}
      </button>
    </div>
  );
}
