import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditorSettings } from './EditorSettingsContext.jsx';
import { DEFAULT_EDITOR_SETTINGS } from './editorSettingsPrefs.js';
import { useLayout } from './layout/LayoutContext.jsx';
import { DEFAULT_COLOR_THEME } from '../ui/colorThemes.js';
import { useHoverHelp } from '../ui/hoverHelp/HoverHelpContext.jsx';
import { DEFAULT_HOVER_HELP_PREFS } from '../ui/hoverHelp/hoverHelpPrefs.js';

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

/**
 * Editor preferences (Edit → Settings…).
 * Portaled to document.body so UI-scale / dock chrome stay behind it.
 */
export function EditorSettingsDialog({ open, onClose }) {
  const { settings, patchSettings, resetSettings } = useEditorSettings();
  const { layout, setColorTheme, colorThemes } = useLayout();
  const { delayMs, setDelayMs } = useHoverHelp();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onResetAll = () => {
    resetSettings();
    setColorTheme(DEFAULT_COLOR_THEME);
    setDelayMs(DEFAULT_HOVER_HELP_PREFS.delayMs);
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
        <div className="bb-dialog__header">
          <h2 id="bb-settings-title" className="bb-dialog__title">Editor Settings</h2>
        </div>
        <div className="bb-dialog__body bb-settings">
          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">Appearance</h3>
            <label className="bb-settings__row">
              <span className="bb-settings__label">
                Theme
                <span className="bb-settings__hint">Same as View → Theme. Applies to editor chrome.</span>
              </span>
              <span className="bb-settings__control bb-settings__control--select">
                <select
                  className="bb-input bb-settings__select"
                  value={layout.colorTheme}
                  onChange={(e) => setColorTheme(e.target.value)}
                >
                  {colorThemes.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.label}</option>
                  ))}
                </select>
              </span>
            </label>
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">Viewport Colors</h3>
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
            <h3 className="bb-settings__heading">Camera</h3>
            <RangeRow
              label="Orbit floatiness"
              hint="How much the camera coasts after rotating with RMB. 0 is snappy; higher is floatier."
              min={0}
              max={100}
              step={1}
              value={settings.cameraOrbitFloatiness}
              onChange={(v) => patchSettings({ cameraOrbitFloatiness: v })}
            />
            <RangeRow
              label="Orbit speed"
              hint="How fast RMB orbit turns."
              min={0.25}
              max={3}
              step={0.05}
              value={settings.cameraOrbitSpeed}
              display={settings.cameraOrbitSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitSpeed: v })}
            />
            <RangeRow
              label="Zoom speed"
              hint="Mouse-wheel zoom rate."
              min={0.25}
              max={3}
              step={0.05}
              value={settings.cameraOrbitZoomSpeed}
              display={settings.cameraOrbitZoomSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitZoomSpeed: v })}
            />
            <RangeRow
              label="Pan speed"
              hint="Middle-mouse pan rate."
              min={0.25}
              max={3}
              step={0.05}
              value={settings.cameraOrbitPanSpeed}
              display={settings.cameraOrbitPanSpeed.toFixed(2)}
              onChange={(v) => patchSettings({ cameraOrbitPanSpeed: v })}
            />
            <RangeRow
              label="Free-fly look sensitivity"
              hint="RMB look while flying with WASD / QE."
              min={0.25}
              max={3}
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
              max={3}
              step={0.05}
              value={settings.playLookSensitivity}
              display={settings.playLookSensitivity.toFixed(2)}
              onChange={(v) => patchSettings({ playLookSensitivity: v })}
            />
          </section>

          <section className="bb-settings__section">
            <h3 className="bb-settings__heading">General</h3>
            <RangeRow
              label="Hover Help delay"
              hint="Milliseconds before a hover tip appears. Toggle tips under Help → Show Hover Help."
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
            onClick={onResetAll}
            title={`Restore defaults (floatiness ${DEFAULT_EDITOR_SETTINGS.cameraOrbitFloatiness})`}
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
