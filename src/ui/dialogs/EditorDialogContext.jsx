import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const EditorDialogContext = createContext(null);

/**
 * In-app alert / confirm / prompt dialogs (replaces window.alert/confirm/prompt).
 * Requests queue so overlapping messages still show in order.
 */
export function EditorDialogProvider({ children }) {
  const [active, setActive] = useState(null);
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
    if (!active) return undefined;
    const onKey = (e) => {
      const current = activeRef.current;
      if (!current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss(current.kind === 'confirm' || current.kind === 'prompt' ? null : undefined);
      } else if (e.key === 'Enter' && current.kind !== 'prompt') {
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

  const value = useMemo(() => ({
    alert,
    confirm,
    prompt,
    isOpen: Boolean(active),
  }), [alert, confirm, prompt, active]);

  return (
    <EditorDialogContext.Provider value={value}>
      {children}
      {active && (
        <div className="bb-dialog-root" role="presentation">
          <button
            type="button"
            className="bb-dialog-backdrop"
            aria-label="Dismiss dialog"
            onClick={() => dismiss(active.kind === 'alert' ? undefined : null)}
          />
          <div
            className={`bb-dialog bb-dialog--${active.tone || 'default'}`}
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
            </div>
            <div className="bb-dialog__footer">
              {(active.kind === 'confirm' || active.kind === 'prompt') && (
                <button
                  type="button"
                  className="bb-btn"
                  onClick={() => dismiss(null)}
                >
                  {active.cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                className="bb-btn bb-btn--active"
                autoFocus={active.kind !== 'prompt'}
                onClick={() => {
                  if (active.kind === 'prompt') {
                    dismiss(inputRef.current?.value ?? '');
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
      )}
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
  return /^(Ready|Edited|Undo:|Redo:|Loading |Importing |Creating |Play mode|Edit mode restored)/i.test(msg);
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
