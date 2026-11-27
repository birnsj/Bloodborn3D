import { useEffect, useRef, useState } from 'react';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  CAMERA_MODES,
  DISPLAY_MODES,
  LAYOUT_MODE_OPTIONS,
} from './viewportPrefs.js';

const CAMERA_OPTIONS = CAMERA_MODES.map((id) => ({
  id,
  label: ({
    perspective: 'Perspective',
    isometric: 'Isometric',
    top: 'Top',
    bottom: 'Bottom',
    front: 'Front',
    back: 'Back',
    left: 'Left',
    right: 'Right',
  })[id] || id,
}));

const DISPLAY_OPTIONS = DISPLAY_MODES.map((id) => ({
  id,
  label: ({
    lit: 'Lit',
    unlit: 'Unlit',
    textured: 'Textured',
    wireframe: 'Wireframe',
    'solid-edges': 'Solid+Edges',
  })[id] || id,
}));

/** Mini layout glyphs — filled boxes matching each pane arrangement. */
function LayoutGlyph({ mode }) {
  return (
    <svg className="bb-viewport-layout-glyph" viewBox="0 0 14 10" aria-hidden="true">
      {mode === 'single' && (
        <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="0.6" />
      )}
      {mode === 'dual-h' && (
        <>
          <rect x="0.75" y="0.75" width="5.75" height="8.5" rx="0.5" />
          <rect x="7.5" y="0.75" width="5.75" height="8.5" rx="0.5" />
        </>
      )}
      {mode === 'dual-v' && (
        <>
          <rect x="0.75" y="0.75" width="12.5" height="3.75" rx="0.5" />
          <rect x="0.75" y="5.5" width="12.5" height="3.75" rx="0.5" />
        </>
      )}
      {mode === 'triple' && (
        <>
          <rect x="0.75" y="0.75" width="5.75" height="8.5" rx="0.5" />
          <rect x="7.5" y="0.75" width="5.75" height="3.75" rx="0.5" />
          <rect x="7.5" y="5.5" width="5.75" height="3.75" rx="0.5" />
        </>
      )}
      {mode === 'quad' && (
        <>
          <rect x="0.75" y="0.75" width="5.75" height="3.75" rx="0.5" />
          <rect x="7.5" y="0.75" width="5.75" height="3.75" rx="0.5" />
          <rect x="0.75" y="5.5" width="5.75" height="3.75" rx="0.5" />
          <rect x="7.5" y="5.5" width="5.75" height="3.75" rx="0.5" />
        </>
      )}
    </svg>
  );
}

function PaneChromeMenu({
  label,
  title,
  value,
  options,
  disabled = false,
  helpId = null,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.id === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={`bb-viewport-pane-menu${open ? ' is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="bb-viewport-pane-chip"
        title={title}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...(helpId ? helpProps(helpId) : {})}
      >
        {label ? <span className="bb-viewport-pane-chip__label">{label}</span> : null}
        <span className="bb-viewport-pane-chip__value">{current?.label || value}</span>
        <span className="bb-viewport-pane-chip__caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="bb-viewport-pane-menu__list" role="menu">
          {options.map((opt) => {
            const checked = value === opt.id;
            return (
              <li key={opt.id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  className={`bb-viewport-pane-menu__item${checked ? ' is-checked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange?.(opt.id);
                    setOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {checked ? `✓ ${opt.label}` : opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LayoutModeButtons({ layoutMode, maximized, disabled, onLayoutMode }) {
  return (
    <div
      className="bb-viewport-layout-seg"
      title="Viewport layout"
      role="group"
      aria-label="Viewport layout"
      {...helpProps('viewport.layout')}
    >
      {LAYOUT_MODE_OPTIONS.map((m) => {
        const active = layoutMode === m.id && !maximized;
        return (
          <button
            key={m.id}
            type="button"
            className={`bb-viewport-layout-btn${active ? ' is-active' : ''}`}
            title={m.label}
            aria-pressed={active}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onLayoutMode?.(m.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <LayoutGlyph mode={m.id} />
          </button>
        );
      })}
    </div>
  );
}

export function ViewportPaneChrome({
  pane,
  active,
  maximized,
  layoutMode,
  onCameraMode,
  onDisplayMode,
  onToggleShowFog,
  onToggleShowMist,
  onToggleShowPostProcessing,
  onLayoutMode,
  onResetCamera,
  onToggleMaximize,
}) {
  const fogOn = pane.showFog !== false;
  const mistOn = pane.showMist === true;
  const ppOn = pane.showPostProcessing !== false;
  return (
    <div
      className={`bb-viewport-pane-chrome${active ? ' is-active' : ''}`}
      data-bb-tutorial="viewport.chrome"
    >
      <PaneChromeMenu
        label="Cam"
        title="Camera"
        value={pane.cameraMode}
        options={CAMERA_OPTIONS}
        helpId="viewport.camera"
        onChange={onCameraMode}
      />
      <PaneChromeMenu
        label="View"
        title="Display mode"
        value={pane.displayMode}
        options={DISPLAY_OPTIONS}
        helpId="viewport.display"
        onChange={onDisplayMode}
      />
      <button
        type="button"
        className={`bb-viewport-pane-chip bb-viewport-pane-chip--action${fogOn ? ' is-active' : ''}`}
        title={fogOn ? 'Hide fog in this viewport' : 'Show fog in this viewport'}
        aria-pressed={fogOn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleShowFog?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...helpProps('viewport.showFog')}
      >
        Fog
      </button>
      <button
        type="button"
        className={`bb-viewport-pane-chip bb-viewport-pane-chip--action${mistOn ? ' is-active' : ''}`}
        title={mistOn ? 'Hide mist particles in this viewport' : 'Show mist particles in this viewport'}
        aria-pressed={mistOn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleShowMist?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...helpProps('viewport.showMist')}
      >
        Mist
      </button>
      <button
        type="button"
        className={`bb-viewport-pane-chip bb-viewport-pane-chip--action${ppOn ? ' is-active' : ''}`}
        title={ppOn ? 'Hide post-processing preview in this viewport' : 'Show post-processing preview in this viewport'}
        aria-pressed={ppOn}
        onClick={(e) => {
          e.stopPropagation();
          onToggleShowPostProcessing?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...helpProps('viewport.showPostProcessing')}
      >
        PP
      </button>
      <div data-bb-tutorial="viewport.layout">
        <LayoutModeButtons
          layoutMode={layoutMode}
          maximized={maximized}
          disabled={Boolean(maximized)}
          onLayoutMode={onLayoutMode}
        />
      </div>
      <button
        type="button"
        className="bb-viewport-pane-chip bb-viewport-pane-chip--action"
        title="Reset camera home and zoom"
        onClick={(e) => {
          e.stopPropagation();
          onResetCamera?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...helpProps('viewport.reset')}
      >
        Reset
      </button>
      <button
        type="button"
        className="bb-viewport-pane-chip bb-viewport-pane-chip--action"
        title={maximized ? 'Restore layout' : 'Maximize this viewport'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMaximize?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        {...helpProps('viewport.maximize')}
      >
        {maximized ? 'Restore' : 'Max'}
      </button>
    </div>
  );
}
