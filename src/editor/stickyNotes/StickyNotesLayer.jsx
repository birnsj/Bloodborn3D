import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  fetchStickyNotesDoc,
  persistStickyNotesDoc,
  STICKY_NOTES_ADD_EVENT,
  STICKY_NOTES_CHANGED_EVENT,
} from './stickyNotesApi.js';
import {
  createStickyNote,
  notesForLevel,
  setNotesForLevel,
  setStickyNotesVisible,
  stickyNotesVisible,
  STICKY_NOTE_COLORS,
} from './stickyNotesModel.js';

/**
 * Editor-only 2D sticky reminders over the Level dock workspace
 * (Viewport + side panels). Stored in `.editor-local/sticky-notes.json`
 * (not level JSON). Hidden in Play.
 */
export function StickyNotesLayer() {
  const { mode, levelName } = useEditor();
  const [doc, setDoc] = useState(() => setNotesForLevel({}, levelName, []));
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const notes = notesForLevel(doc, levelName);
  const levelNameRef = useRef(levelName);
  useEffect(() => {
    levelNameRef.current = levelName;
  }, [levelName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await fetchStickyNotesDoc();
      if (cancelled) return;
      setDoc(loaded);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitDoc = useCallback((mutator) => {
    setDoc((prev) => {
      const next = mutator(prev);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistStickyNotesDoc(next);
      }, 200);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const addNote = useCallback(() => {
    commitDoc((prev) => {
      const current = notesForLevel(prev, levelNameRef.current);
      const note = createStickyNote({
        text: '',
        x: 12 + (current.length % 5) * 4,
        y: 14 + (current.length % 4) * 5,
        color: STICKY_NOTE_COLORS[current.length % STICKY_NOTE_COLORS.length],
      });
      // Adding a note while hidden re-shows the strip.
      const withNote = setNotesForLevel(prev, levelNameRef.current, [...current, note]);
      return setStickyNotesVisible(withNote, true);
    });
  }, [commitDoc]);

  useEffect(() => {
    const onAdd = () => addNote();
    const onChanged = (e) => {
      if (e?.detail) setDoc(e.detail);
    };
    window.addEventListener(STICKY_NOTES_ADD_EVENT, onAdd);
    window.addEventListener(STICKY_NOTES_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(STICKY_NOTES_ADD_EVENT, onAdd);
      window.removeEventListener(STICKY_NOTES_CHANGED_EVENT, onChanged);
    };
  }, [addNote]);

  const patchNote = useCallback((id, partial) => {
    commitDoc((prev) => {
      const current = notesForLevel(prev, levelNameRef.current);
      return setNotesForLevel(
        prev,
        levelNameRef.current,
        current.map((n) => (n.id === id ? { ...n, ...partial } : n)),
      );
    });
  }, [commitDoc]);

  const removeNote = useCallback((id) => {
    commitDoc((prev) => {
      const current = notesForLevel(prev, levelNameRef.current);
      return setNotesForLevel(
        prev,
        levelNameRef.current,
        current.filter((n) => n.id !== id),
      );
    });
  }, [commitDoc]);

  const onDragHandleDown = (e, note) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = e.currentTarget.closest('.bb-sticky-notes');
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const grabX = e.clientX - rect.left - (note.x / 100) * rect.width;
    const grabY = e.clientY - rect.top - (note.y / 100) * rect.height;
    dragRef.current = { id: note.id, grabX, grabY, rect };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const x = ((ev.clientX - d.rect.left - d.grabX) / d.rect.width) * 100;
      const y = ((ev.clientY - d.rect.top - d.grabY) / d.rect.height) * 100;
      patchNote(d.id, {
        x: Math.min(92, Math.max(0, x)),
        y: Math.min(92, Math.max(0, y)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onResizeCornerDown = (e, note) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const app = e.currentTarget.closest('.bb-app');
    const scaleRaw = app
      ? Number(getComputedStyle(app).getPropertyValue('--bb-ui-scale'))
      : 1;
    const uiScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;
    resizeRef.current = {
      id: note.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: note.w,
      startH: note.h,
      uiScale,
    };

    const onMove = (ev) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = (ev.clientX - r.startX) / r.uiScale;
      const dy = (ev.clientY - r.startY) / r.uiScale;
      patchNote(r.id, {
        w: Math.round(r.startW + dx),
        h: Math.round(r.startH + dy),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (mode === 'play' || !ready || !stickyNotesVisible(doc)) return null;

  return (
    <div className="bb-sticky-notes" aria-label="Sticky notes">
      {notes.map((note) => (
        <article
          key={note.id}
          className={`bb-sticky-note bb-sticky-note--${note.color}`}
          style={{
            left: `${note.x}%`,
            top: `${note.y}%`,
            width: `${note.w}px`,
            height: `${note.h}px`,
          }}
        >
          <header
            className="bb-sticky-note__bar"
            onPointerDown={(e) => onDragHandleDown(e, note)}
          >
            <span className="bb-sticky-note__grip" aria-hidden>⋮⋮</span>
            <div className="bb-sticky-note__swatches" role="group" aria-label="Note color">
              {STICKY_NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`bb-sticky-note__swatch bb-sticky-note__swatch--${c}${note.color === c ? ' is-active' : ''}`}
                  title={c}
                  aria-label={c}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    patchNote(note.id, { color: c });
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="bb-sticky-note__delete"
              title="Delete note"
              aria-label="Delete note"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                removeNote(note.id);
              }}
            >
              ×
            </button>
          </header>
          <textarea
            className="bb-sticky-note__text"
            value={note.text}
            placeholder="Reminder…"
            rows={4}
            onChange={(e) => patchNote(note.id, { text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div
            className="bb-sticky-note__resize"
            role="separator"
            aria-orientation="both"
            aria-label="Resize note"
            title="Drag to resize"
            onPointerDown={(e) => onResizeCornerDown(e, note)}
          />
        </article>
      ))}
    </div>
  );
}
