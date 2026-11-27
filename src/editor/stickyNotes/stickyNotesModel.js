/** Editor-only 2D viewport sticky notes (reminders). Not level data. */

export const STICKY_NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'];
export const STICKY_NOTES_SCHEMA_VERSION = 1;

export function createStickyNote(partial = {}) {
  const color = STICKY_NOTE_COLORS.includes(partial.color)
    ? partial.color
    : 'yellow';
  return {
    id: partial.id || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: typeof partial.text === 'string' ? partial.text : '',
    x: clampPercent(partial.x, 8),
    y: clampPercent(partial.y, 12),
    w: clampSize(partial.w, 180),
    h: clampSize(partial.h, 120),
    color,
  };
}

export function normalizeStickyNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  return createStickyNote({ ...raw, id });
}

export function normalizeStickyNotes(list = []) {
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const note = normalizeStickyNote(entry);
    if (!note || seen.has(note.id)) continue;
    seen.add(note.id);
    out.push(note);
  }
  return out;
}

export function normalizeStickyNotesDoc(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const byLevel = {};
  const incoming = src.byLevel && typeof src.byLevel === 'object' ? src.byLevel : {};
  for (const [level, notes] of Object.entries(incoming)) {
    if (typeof level !== 'string' || !level) continue;
    byLevel[level] = normalizeStickyNotes(notes);
  }
  return {
    schemaVersion: STICKY_NOTES_SCHEMA_VERSION,
    /** When false, notes stay saved but are hidden in the Viewport. */
    visible: src.visible !== false,
    byLevel,
  };
}

export function notesForLevel(doc, levelName) {
  const key = String(levelName || 'untitled.json');
  const normalized = normalizeStickyNotesDoc(doc);
  return normalized.byLevel[key] || [];
}

export function stickyNotesVisible(doc) {
  return normalizeStickyNotesDoc(doc).visible !== false;
}

export function setStickyNotesVisible(doc, visible) {
  const next = normalizeStickyNotesDoc(doc);
  next.visible = Boolean(visible);
  return next;
}

export function setNotesForLevel(doc, levelName, notes) {
  const key = String(levelName || 'untitled.json');
  const next = normalizeStickyNotesDoc(doc);
  next.byLevel[key] = normalizeStickyNotes(notes);
  return next;
}

function clampPercent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(92, Math.max(0, n));
}

function clampSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(420, Math.max(120, Math.round(n)));
}
