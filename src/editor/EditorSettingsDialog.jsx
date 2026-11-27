import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from './EditorContext.jsx';
import { useEditorSettings } from './EditorSettingsContext.jsx';
import { useLayout } from './layout/LayoutContext.jsx';
import { DEFAULT_VIEW_SCALE } from './layout/viewScale.js';
import { useHoverHelp } from '../ui/hoverHelp/HoverHelpContext.jsx';
import { DEFAULT_HOVER_HELP_PREFS } from '../ui/hoverHelp/hoverHelpPrefs.js';
import { helpProps } from '../ui/hoverHelp/helpProps.js';
import { DISPLAY_MODES } from './viewport/viewportPrefs.js';
import {
  ROTATION_SNAP_INCREMENTS,
  SCALE_SNAP_INCREMENTS,
} from './editorSettingsPrefs.js';
import {
  CREATION_TOOLBAR_SCALE_MAX,
  CREATION_TOOLBAR_SCALE_MIN,
  CREATION_TOOLBAR_SCALE_STEP,
  DEFAULT_CREATION_TOOLBAR_PREFS,
  loadCreationToolbarPrefs,
  patchCreationToolbarPrefs,
} from './creation/creationToolbarPrefs.js';

const DISPLAY_MODE_LABELS = {
  lit: 'Lit',
  unlit: 'Unlit',
  textured: 'Textured',
  wireframe: 'Wireframe',
  'solid-edges': 'Solid + Edges',
};

function RangeRow({ label, hint, value, min, max, step, display, onChange }) {
  return (
    <label className="bb-settings__row">
      <span className="bb-settings__label">
        {label}
        {hint ? <span className="bb-settings__hint">{hint}</span> : null}
      </span>
      <span className="bb-settings__control">
        <input
          type="range"
          className="bb-settings__range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="bb-settings__value">{display ?? value}</span>
      </span>
    </label>
  );
}

function ColorRow({ label, hint, value, onChange }) {
  return (
    <label className="bb-settings__row bb-settings__row--color">
      <span className="bb-settings__label">
        {label}
        {hint ? <span className="bb-settings__hint">{hint}</span> : null}
      </span>
      <span className="bb-settings__control bb-settings__control--color">
        <input
          type="color"
          className="bb-settings__color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="bb-settings__value">{value}</span>
      </span>
    </label>
  );
}

function CheckRow({ label, hint, checked, onChange }) {
  return (
    <label className="bb-settings__row bb-settings__row--check">
      <span className="bb-settings__label">
        {label}
        {hint ? <span className="bb-settings__hint">{hint}</span> : null}
      </span>
      <span className="bb-settings__control bb-settings__control--check">
        <input
          type="checkbox"
          className="bb-settings__check"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
    </label>
  );
}

function SelectRow({ label, hint, value, options, onChange }) {
  return (
    <label className="bb-settings__row">
      <span className="bb-settings__label">
        {label}
        {hint ? <span className="bb-settings__hint">{hint}</span> : null}
      </span>
      <span className="bb-settings__control bb-settings__control--select">
        <select
          className="bb-input bb-settings__select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </span>
    </label>
  );
}

/**
 * Editor preferences (Edit → Settings…).
 * Portaled to document.body so UI-scale / dock chrome stay behind it.
 */
export function EditorSettingsDialog({ open, onClose }) {
  const {
    settings,
    patchSettings,
    resetSettings,
    saveSettingsAsDefault,
  } = useEditorSettings();
  const {
    gridSize,
    setGridSize,
    gridSnap,
    setGridSnap,
    gridIncrements,
  } = useEditor();
  const {
    layout,
    patch,
    setUiScale,
    viewScales,
  } = useLayout();
  const {
    showHoverHelp,
    setShowHoverHelp,
    delayMs,
    setDelayMs,
  } = useHoverHelp();
  const [toolboxPrefs, setToolboxPrefs] = useState(() => loadCreationToolbarPrefs());

  useEffect(() => {
    if (!open) return undefined;
    setToolboxPrefs(loadCreationToolbarPrefs());
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const patchToolbox = (partial) => {
    const next = patchCreationToolbarPrefs(partial);
    setToolboxPrefs(next);
  };

  const onResetAll = () => {
    const next = resetSettings();
    setUiScale(DEFAULT_VIEW_SCALE);
    patch({ contentViewMode: 'grid' });
    setShowHoverHelp(DEFAULT_HOVER_HELP_PREFS.showHoverHelp);
    setDelayMs(DEFAULT_HOVER_HELP_PREFS.delayMs);
    setToolboxPrefs(patchCreationToolbarPrefs({
      dock: DEFAULT_CREATION_TOOLBAR_PREFS.dock,
      scale: DEFAULT_CREATION_TOOLBAR_PREFS.scale,
      offset: DEFAULT_CREATION_TOOLBAR_PREFS.offset,
    }));
    if (next) {
      setGridSize(next.gridSize);
      setGridSnap(next.gridSnap);
      window.dispatchEvent(new CustomEvent('bb:set-all-display-modes', {
        detail: next.defaultDisplayMode,
      }));
    }
  };

  const onDisplayMode = (mode) => {
    patchSettings({ defaultDisplayMode: mode });
    window.dispatchEvent(new CustomEvent('bb:set-all-display-modes', { detail: mode }));
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Close settings"
        onClick={() => onClose?.()}
      />
      <div
        className="bb-dialog bb-dialog--settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-settings-title"
      >
        <div className="bb-dialog__header" {...helpProps('settings.dialog')}>
          <h2 id="bb-settings-title" className="bb-dialog__title">Editor Settings</h2>
        </div>
        <div className="bb-dialog__body bb-settings">
          <section className="bb-settings__section" {...helpProps('settings.appearance')}>
            <h3 className="bb-settings__heading">Appearance</h3>
            <SelectRow
              label="UI scale"
              hint="Same as View → UI Scale. Scales editor chrome (not browser zoom)."
              value={String(layout.uiScale)}
              options={viewScales.map((entry) => ({
                value: String(entry.id),
                label: entry.label,
              }))}
              onChange={(v) => setUiScale(Number(v))}
            />
            <SelectRow
              label="Asset browser view"
              hint="Grid or list layout in the Asset Viewer."
              value={layout.contentViewMode || 'grid'}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'list', label: 'List' },
              ]}
              onChange={(v) => patch({ contentViewMode: v })}
            />
          </section>

          <section className="bb-settings__section" {...helpProps('settings.creationToolbar')}>
            <h3 className="bb-settings__heading">Creation toolbox</h3>
            <SelectRow
              label="Dock"
              hint="Flush edge strip (top / left / right / bottom) or Floating. Drag the handle into the viewport to undock, or to an edge to dock. Close Settings to see it."
              value={toolboxPrefs.dock}
              options={[
                { value: 'left', label: 'Left side (default)' },
                { value: 'right', label: 'Right side' },
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'float', label: 'Floating' },
              ]}
              onChange={(v) => patchToolbox({ dock: v })}
            />
            <RangeRow
              label="Toolbox scale"
              hint="Scales category and tool button size (strip thickness follows)."
              min={CREATION_TOOLBAR_SCALE_MIN}
              max={CREATION_TOOLBAR_SCALE_MAX}
              step={CREATION_TOOLBAR_SCALE_STEP}
              value={toolboxPrefs.scale}
              display={`${Math.round(toolboxPrefs.scale * 100)}%`}
              onChange={(v) => patchToolbox({ scale: v })}
            />
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">Viewport</h3>
            <SelectRow
              label="Display mode"
              hint="Shading for all viewport panes (also on each pane’s chrome)."
              value={settings.defaultDisplayMode}
              options={DISPLAY_MODES.map((id) => ({
                value: id,
                label: DISPLAY_MODE_LABELS[id] || id,
              }))}
              onChange={onDisplayMode}
            />
            <ColorRow
              label="Background"
              hint="3D viewport clear color."
              value={settings.viewportBackground}
              onChange={(v) => patchSettings({ viewportBackground: v })}
            />
            <ColorRow
              label="Grid major"
              hint="Primary construction-grid lines."
              value={settings.viewportGridMajor}
              onChange={(v) => patchSettings({ viewportGridMajor: v })}
            />
            <ColorRow
              label="Grid minor"
              hint="Secondary construction-grid lines."
              value={settings.viewportGridMinor}
              onChange={(v) => patchSettings({ viewportGridMinor: v })}
            />
            <ColorRow
              label="Selection"
              hint="Selection box outline in the viewport."
              value={settings.viewportSelection}
              onChange={(v) => patchSettings({ viewportSelection: v })}
            />
            <ColorRow
              label="Subtract / cutter"
              hint="Translucent subtractive brush volume."
              value={settings.viewportSubtract}
              onChange={(v) => patchSettings({ viewportSubtract: v })}
            />
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">Grid</h3>
            <SelectRow
              label="Grid size"
              hint="Construction grid step in editor units. Same as the Level toolbar."
              value={String(gridSize)}
              options={gridIncrements.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
              onChange={(v) => setGridSize(Number(v))}
            />
            <CheckRow
              label="Grid snap"
              hint="Snap placement and gizmo move / rotate / scale. Same as the Level toolbar."
              checked={gridSnap}
              onChange={(v) => setGridSnap(v)}
            />
            <SelectRow
              label="Rotation snap"
              hint="Gizmo rotate step in degrees when snap is on. Alt+drag duplicates (free rotate while Alt held)."
              value={String(settings.rotationSnapDegrees)}
              options={ROTATION_SNAP_INCREMENTS.map((n) => ({
                value: String(n),
                label: `${n}°`,
              }))}
              onChange={(v) => patchSettings({ rotationSnapDegrees: Number(v) })}
            />
            <SelectRow
              label="Scale snap"
              hint="Gizmo scale step when snap is on. Alt+drag duplicates (free scale while Alt held)."
              value={String(settings.scaleSnapIncrement)}
              options={SCALE_SNAP_INCREMENTS.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
              onChange={(v) => patchSettings({ scaleSnapIncrement: Number(v) })}
            />
          </section>

          <section className="bb-settings__section" {...helpProps('settings.camera')}>
            <h3 className="bb-settings__heading">Camera</h3>
            <RangeRow
              label="Orbit speed"
              hint="How fast RMB orbit turns. Orbit stops when you release — no after-drift."
              min={0.25}
              max={4}
              step={0.05}
              value={settings.cameraOrbitSpeed}
              display={settings.cameraOrbitSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitSpeed: v })}
            />
            <RangeRow
              label="Zoom speed"
              hint="Mouse-wheel zoom rate."
              min={0.25}
              max={4}
              step={0.05}
              value={settings.cameraOrbitZoomSpeed}
              display={settings.cameraOrbitZoomSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitZoomSpeed: v })}
            />
            <RangeRow
              label="Middle-mouse pan"
              hint="How fast middle-mouse pans the view. Default is fast (2.0)."
              min={0.25}
              max={4}
              step={0.05}
              value={settings.cameraOrbitPanSpeed}
              display={settings.cameraOrbitPanSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitPanSpeed: v })}
            />
            <RangeRow
              label="Free-fly look sensitivity"
              hint="Mouse look while RMB is held, or while flying with WASD / QE."
              min={0.25}
              max={4}
              step={0.05}
              value={settings.cameraFlyLookSensitivity}
              display={settings.cameraFlyLookSensitivity.toFixed(2)}
              onChange={(v) => patchSettings({ cameraFlyLookSensitivity: v })}
            />
            <RangeRow
              label="Free-fly speed"
              hint="WASD / QE move speed in editor units per second."
              min={100}
              max={1200}
              step={10}
              value={settings.cameraFlySpeed}
              onChange={(v) => patchSettings({ cameraFlySpeed: v })}
            />
            <RangeRow
              label="Free-fly boost"
              hint="Shift multiplier while free-flying."
              min={1}
              max={5}
              step={0.05}
              value={settings.cameraFlyBoost}
              display={settings.cameraFlyBoost.toFixed(2)}
              onChange={(v) => patchSettings({ cameraFlyBoost: v })}
            />
            <CheckRow
              label="Invert Y"
              hint="Flips vertical look for orbit, free-fly, and Play."
              checked={settings.cameraInvertY}
              onChange={(v) => patchSettings({ cameraInvertY: v })}
            />
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">Play</h3>
            <RangeRow
              label="Look sensitivity"
              hint="Mouse-look speed in Play mode (pointer lock)."
              min={0.25}
              max={4}
              step={0.05}
              value={settings.playLookSensitivity}
              display={settings.playLookSensitivity.toFixed(2)}
              onChange={(v) => patchSettings({ playLookSensitivity: v })}
            />
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">General</h3>
            <CheckRow
              label="Show Hover Help"
              hint="Same as Help → Show Hover Help."
              checked={showHoverHelp}
              onChange={(v) => setShowHoverHelp(v)}
            />
            <RangeRow
              label="Hover Help delay"
              hint="Milliseconds before a hover tip appears."
              min={100}
              max={2000}
              step={50}
              value={delayMs}
              display={`${delayMs} ms`}
              onChange={(v) => setDelayMs(v)}
            />
          </section>
        </div>
        <div className="bb-dialog__footer">
          <button
            type="button"
            className="bb-btn"
            onClick={() => saveSettingsAsDefault({ gridSize, gridSnap })}
            title="Store the current settings as your personal defaults for Reset"
            {...helpProps('settings.saveAsDefault')}
          >
            Save as Default
          </button>
          <button
            type="button"
            className="bb-btn"
            onClick={onResetAll}
            title="Restore your saved defaults (or factory defaults if none saved)"
            {...helpProps('settings.resetDefaults')}
          >
            Reset Defaults
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--active"
            autoFocus
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
