import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KEYBOARD_SHORTCUT_SECTIONS } from './keyboardShortcuts.js';

/**
 * Formatted keyboard shortcuts overlay (Help → Keyboard Shortcuts…).
 * Portaled to document.body so UI-scale transform / dock chrome stay behind it.
 */
export function KeyboardShortcutsDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Close shortcuts"
        onClick={() => onClose?.()}
      />
      <div
        className="bb-dialog bb-dialog--shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-shortcuts-title"
      >
        <div className="bb-dialog__header">
          <h2 id="bb-shortcuts-title" className="bb-dialog__title">Keyboard Shortcuts</h2>
        </div>
        <div className="bb-dialog__body bb-shortcuts">
          <div className="bb-shortcuts__columns">
            {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
              <section key={section.id} className="bb-shortcuts__card">
                <h3 className="bb-shortcuts__heading">{section.title}</h3>
                <ul className="bb-shortcuts__list">
                  {section.rows.map((row) => (
                    <li
                      key={`${section.id}-${row.keys.join('-')}-${row.action}`}
                      className="bb-shortcuts__row"
                    >
                      <span className="bb-shortcuts__keys" aria-label={row.keys.join(' + ')}>
                        {row.keys.map((key, i) => (
                          <span key={`${key}-${i}`} className="bb-shortcuts__key-wrap">
                            {i > 0 ? <span className="bb-shortcuts__plus">+</span> : null}
                            <kbd className="bb-shortcuts__kbd">{key}</kbd>
                          </span>
                        ))}
                      </span>
                      <span className="bb-shortcuts__action">
                        <span className="bb-shortcuts__label">{row.action}</span>
                        {row.note ? (
                          <span className="bb-shortcuts__note">{row.note}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <div className="bb-dialog__footer">
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
