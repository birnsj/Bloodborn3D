import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  filterEncyclopediaTerms,
  getEncyclopediaTerm,
  groupEncyclopediaByCategory,
  listEncyclopediaTerms,
} from './encyclopedia.js';

/**
 * Searchable concept glossary (Help → Encyclopedia…).
 * Portaled to document.body like Keyboard Shortcuts.
 * Remount (via key) when opening so search/selection start fresh.
 */
export function EncyclopediaDialog({ open, onClose }) {
  const allTerms = useMemo(() => listEncyclopediaTerms(), []);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(allTerms[0]?.id || null);

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

  const filtered = useMemo(
    () => filterEncyclopediaTerms(query, allTerms),
    [query, allTerms],
  );
  const groups = useMemo(
    () => groupEncyclopediaByCategory(filtered),
    [filtered],
  );

  const activeId = filtered.some((e) => e.id === selectedId)
    ? selectedId
    : (filtered[0]?.id || null);
  const selected = activeId ? getEncyclopediaTerm(activeId) : null;

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="bb-dialog-root" role="presentation">
      <button
        type="button"
        className="bb-dialog-backdrop"
        aria-label="Close encyclopedia"
        onClick={() => onClose?.()}
      />
      <div
        className="bb-dialog bb-dialog--encyclopedia"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-encyclopedia-title"
      >
        <div className="bb-dialog__header">
          <h2 id="bb-encyclopedia-title" className="bb-dialog__title">Encyclopedia</h2>
        </div>
        <div className="bb-dialog__body bb-encyclopedia">
          <div className="bb-encyclopedia__nav">
            <label className="bb-encyclopedia__search">
              <span className="bb-encyclopedia__search-label">Search</span>
              <input
                className="bb-input"
                type="search"
                value={query}
                autoFocus
                placeholder="Filter terms…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="bb-encyclopedia__list" role="listbox" aria-label="Terms">
              {groups.length === 0 ? (
                <p className="bb-muted bb-encyclopedia__empty">No terms match.</p>
              ) : groups.map((group) => (
                <div key={group.category} className="bb-encyclopedia__group">
                  <h3 className="bb-encyclopedia__heading">{group.category}</h3>
                  <ul className="bb-encyclopedia__terms">
                    {group.terms.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={entry.id === activeId}
                          className={`bb-encyclopedia__term${entry.id === activeId ? ' is-active' : ''}`}
                          onClick={() => setSelectedId(entry.id)}
                        >
                          {entry.term}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="bb-encyclopedia__detail">
            {selected ? (
              <>
                <h3 className="bb-encyclopedia__detail-title">{selected.term}</h3>
                <p className="bb-encyclopedia__category">{selected.category}</p>
                <p className="bb-encyclopedia__body">{selected.body}</p>
                {selected.seeAlso?.length ? (
                  <div className="bb-encyclopedia__see-also">
                    <span className="bb-encyclopedia__see-also-label">See also</span>
                    <ul className="bb-encyclopedia__see-also-list">
                      {selected.seeAlso.map((id) => {
                        const other = getEncyclopediaTerm(id);
                        if (!other) return null;
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className="bb-encyclopedia__link"
                              onClick={() => {
                                setQuery('');
                                setSelectedId(id);
                              }}
                            >
                              {other.term}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="bb-muted">Select a term.</p>
            )}
          </div>
        </div>
        <div className="bb-dialog__footer">
          <button
            type="button"
            className="bb-btn bb-btn--active"
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
