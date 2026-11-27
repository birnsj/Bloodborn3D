import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { normalizeIconColor } from '../../core/iconColor.js';
import {
  DEFAULT_COLOR_PRESETS,
  getMostUsedColors,
  recordColorUse,
} from '../colorHistory.js';

const EditorDialogContext = createContext(null);

/**
 * In-app alert / confirm / prompt / color-picker dialogs.
 * Requests queue so overlapping messages still show in order.
 */
export function EditorDialogProvider({ children }) {
  const [active, setActive] = useState(null);
  const [colorDraft, setColorDraft] = useState('#8490a4');
  const [colorHexText, setColorHexText] = useState('#8490a4');
  const [mostUsed, setMostUsed] = useState(() => getMostUsedColors());
  const queueRef = useRef([]);
  const inputRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = active;

  const dismiss = useCallback((result) => {
    setActive((current) => {
      if (!current) return null;
      current.resolve(result);
      return queueRef.current.shift() || null;
    });
  }, []);

  const enqueue = useCallback((spec) => new Promise((resolve) => {
    const item = { ...spec, resolve };
    setActive((current) => {
      if (current) {
        queueRef.current.push(item);
        return current;
      }
      return item;
    });
  }), []);

  useEffect(() => {
    if (!active || active.kind !== 'prompt') return undefined;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [active]);

  useEffect(() => {
    if (!active || active.kind !== 'color') return;
    const initial = normalizeIconColor(active.initialValue) || '#8490a4';
    setColorDraft(initial);
    setColorHexText(initial);
    setMostUsed(getMostUsedColors());
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const current = activeRef.current;
      if (!current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss(
          current.kind === 'confirm'
            || current.kind === 'prompt'
            || current.kind === 'color'
            ? null
            : undefined,
        );
      } else if (e.key === 'Enter' && current.kind !== 'prompt' && current.kind !== 'color') {
        e.preventDefault();
        if (current.kind === 'confirm') dismiss(true);
        else dismiss(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, dismiss]);

  const alert = useCallback((message, options = {}) => enqueue({
    kind: 'alert',
    title: options.title || titleForMessage(message, 'Notice'),
    message: String(message ?? ''),
    confirmLabel: options.confirmLabel || 'OK',
    tone: options.tone || toneForMessage(message),
    wide: Boolean(options.wide),
  }), [enqueue]);

  const confirm = useCallback((message, options = {}) => enqueue({
    kind: 'confirm',
    title: options.title || 'Confirm',
    message: String(message ?? ''),
    confirmLabel: options.confirmLabel || 'OK',
    cancelLabel: options.cancelLabel || 'Cancel',
    tone: options.tone || 'default',
  }).then((v) => v === true), [enqueue]);

  const prompt = useCallback((message, options = {}) => enqueue({
    kind: 'prompt',
    title: options.title || 'Input',
    message: String(message ?? ''),
    initialValue: options.initialValue ?? '',
    confirmLabel: options.confirmLabel || 'OK',
    cancelLabel: options.cancelLabel || 'Cancel',
    tone: options.tone || 'default',
  }).then((v) => (v == null ? null : String(v))), [enqueue]);

  /**
   * Color picker with most-used history.
   * @returns {Promise<string|null>} `#rrggbb`, `''` when cleared, or null if cancelled.
   */
  const pickColor = useCallback((message, options = {}) => enqueue({
    kind: 'color',
    title: options.title || 'Color',
    message: String(message ?? 'Choose a color'),
    initialValue: options.initialValue ?? '#8490a4',
    allowClear: Boolean(options.allowClear),
    confirmLabel: options.confirmLabel || 'OK',
    cancelLabel: options.cancelLabel || 'Cancel',
    clearLabel: options.clearLabel || 'Clear',
    tone: options.tone || 'default',
  }).then((v) => {
    if (v == null) return null;
    if (v === '') return '';
    const hex = normalizeIconColor(v);
    if (!hex) return null;
    recordColorUse(hex);
    return hex;
  }), [enqueue]);

  // Must stay referentially stable while dialogs open and close: consumers list
  // it (or callbacks built on it) as effect dependencies, and a changing value
  // re-ran the editor's level-load effect, replacing the authored world.
  const value = useMemo(() => ({
    alert,
    confirm,
    prompt,
    pickColor,
  }), [alert, confirm, prompt, pickColor]);

  const applyColorDraft = (raw) => {
    const hex = normalizeIconColor(raw);
    if (!hex) return;
    setColorDraft(hex);
    setColorHexText(hex);
  };

  const confirmColor = () => {
    const fromText = normalizeIconColor(colorHexText);
    const hex = fromText || normalizeIconColor(colorDraft);
    if (!hex) return;
    dismiss(hex);
  };

  const dialogTree = active ? (
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Dismiss dialog"
        onClick={() => dismiss(active.kind === 'alert' ? undefined : null)}
      />
      <div
        className={`bb-dialog bb-dialog--${active.tone || 'default'}${active.wide ? ' bb-dialog--wide' : ''}${active.kind === 'color' ? ' bb-dialog--color' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bb-dialog-title"
        aria-describedby="bb-dialog-body"
      >
        <div className="bb-dialog__header">
          <h2 id="bb-dialog-title" className="bb-dialog__title">{active.title}</h2>
        </div>
        <div id="bb-dialog-body" className="bb-dialog__body">
          <p className="bb-dialog__message">{active.message}</p>
          {active.kind === 'prompt' && (
            <input
              ref={inputRef}
              className="bb-input bb-dialog__input"
              type="text"
              defaultValue={active.initialValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  dismiss(e.currentTarget.value);
                }
              }}
            />
          )}
          {active.kind === 'color' && (
            <div className="bb-color-picker">
              <div className="bb-color-picker__row">
                <input
                  className="bb-color-picker__native"
                  type="color"
                  value={colorDraft}
                  aria-label="Color"
                  onChange={(e) => applyColorDraft(e.target.value)}
                />
                <input
                  className="bb-input bb-color-picker__hex"
                  type="text"
                  spellCheck={false}
                  value={colorHexText}
                  aria-label="Hex color"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setColorHexText(raw);
                    const hex = normalizeIconColor(raw);
                    if (hex) setColorDraft(hex);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmColor();
                    }
                  }}
                />
                <span
                  className="bb-color-picker__preview"
                  style={{ background: normalizeIconColor(colorHexText) || colorDraft }}
                  title={normalizeIconColor(colorHexText) || colorDraft}
                />
              </div>
              {mostUsed.length > 0 && (
                <div className="bb-color-picker__section">
                  <div className="bb-color-picker__label">Most used</div>
                  <div className="bb-color-picker__swatches">
                    {mostUsed.map((swatch) => (
                      <button
                        key={`used-${swatch}`}
                        type="button"
                        className={`bb-color-picker__swatch${swatch === colorDraft ? ' is-active' : ''}`}
                        style={{ background: swatch }}
                        title={swatch}
                        aria-label={swatch}
                        onClick={() => applyColorDraft(swatch)}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="bb-color-picker__section">
                <div className="bb-color-picker__label">
                  {mostUsed.length ? 'Presets' : 'Colors'}
                </div>
                <div className="bb-color-picker__swatches">
                  {DEFAULT_COLOR_PRESETS.map((swatch) => (
                    <button
                      key={`preset-${swatch}`}
                      type="button"
                      className={`bb-color-picker__swatch${swatch === colorDraft ? ' is-active' : ''}`}
                      style={{ background: swatch }}
                      title={swatch}
                      aria-label={swatch}
                      onClick={() => applyColorDraft(swatch)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="bb-dialog__footer">
          {(active.kind === 'confirm' || active.kind === 'prompt' || active.kind === 'color') && (
            <button
              type="button"
              className="bb-btn"
              onClick={() => dismiss(null)}
            >
              {active.cancelLabel || 'Cancel'}
            </button>
          )}
          {active.kind === 'color' && active.allowClear && (
            <button
              type="button"
              className="bb-btn"
              onClick={() => dismiss('')}
            >
              {active.clearLabel || 'Clear'}
            </button>
          )}
          <button
            type="button"
            className="bb-btn bb-btn--active"
            autoFocus={active.kind !== 'prompt' && active.kind !== 'color'}
            onClick={() => {
              if (active.kind === 'prompt') {
                dismiss(inputRef.current?.value ?? '');
              } else if (active.kind === 'color') {
                confirmColor();
              } else if (active.kind === 'confirm') {
                dismiss(true);
              } else {
                dismiss(undefined);
              }
            }}
          >
            {active.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <EditorDialogContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && dialogTree
        ? createPortal(dialogTree, document.body)
        : null}
    </EditorDialogContext.Provider>
  );
}

export function useEditorDialogs() {
  const ctx = useContext(EditorDialogContext);
  if (!ctx) {
    throw new Error('useEditorDialogs must be used within EditorDialogProvider');
  }
  return ctx;
}

/** Optional access when a provider may be absent (tests). */
export function useEditorDialogsOptional() {
  return useContext(EditorDialogContext);
}

export function isQuietStatusMessage(message) {
  const msg = String(message || '');
  if (!msg) return true;
  return /^(Ready|Edited|Undo:|Redo:|Loading |Importing |Creating |Created |Play mode|Edit mode restored|Moved |Renamed |Deleted |Copied |Duplicated )/i.test(msg);
}

export function toneForMessage(message) {
  const msg = String(message || '');
  if (/fail|error|denied|unsupported|not found|cannot|can't|invalid/i.test(msg)) {
    return 'danger';
  }
  if (/stop |select |before /i.test(msg)) return 'warning';
  return 'default';
}

function titleForMessage(message, fallback) {
  const tone = toneForMessage(message);
  if (tone === 'danger') return 'Error';
  if (tone === 'warning') return 'Notice';
  return fallback;
}
