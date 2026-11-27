/**
 * Client for sticky-note reminders.
 * Prefers `.editor-local/sticky-notes.json` via localhost API; falls back to localStorage.
 */
import { normalizeStickyNotesDoc } from './stickyNotesModel.js';

export const STICKY_NOTES_STORAGE_KEY = 'bloodbound.editor.stickyNotes.v1';
export const STICKY_NOTES_CHANGED_EVENT = 'bb:sticky-notes-changed';
export const STICKY_NOTES_ADD_EVENT = 'bb:sticky-notes-add';

/** Ask the sticky-notes layer to create a note (Level toolbar). */
export function requestAddStickyNote() {
  try {
    window.dispatchEvent(new CustomEvent(STICKY_NOTES_ADD_EVENT));
  } catch {
    /* non-browser */
  }
}

export function getStickyNotesVisibleSync() {
  return loadStickyNotesDocFromStorage().visible !== false;
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadStickyNotesDocFromStorage() {
  try {
    const raw = storage()?.getItem(STICKY_NOTES_STORAGE_KEY);
    if (!raw) return normalizeStickyNotesDoc({});
    return normalizeStickyNotesDoc(JSON.parse(raw));
  } catch {
    return normalizeStickyNotesDoc({});
  }
}

export function saveStickyNotesDocToStorage(doc) {
  const next = normalizeStickyNotesDoc(doc);
  try {
    storage()?.setItem(STICKY_NOTES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export async function fetchStickyNotesDoc() {
  try {
    const res = await fetch('/api/sticky-notes', { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.ok && payload.doc) {
      const doc = normalizeStickyNotesDoc(payload.doc);
      saveStickyNotesDocToStorage(doc);
      return doc;
    }
  } catch {
    /* API unavailable — use local cache */
  }
  return loadStickyNotesDocFromStorage();
}

export async function persistStickyNotesDoc(doc) {
  const next = normalizeStickyNotesDoc(doc);
  saveStickyNotesDocToStorage(next);
  try {
    window.dispatchEvent(new CustomEvent(STICKY_NOTES_CHANGED_EVENT, { detail: next }));
  } catch {
    /* non-browser */
  }
  try {
    const res = await fetch('/api/sticky-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.doc) return normalizeStickyNotesDoc(payload.doc);
    }
  } catch {
    /* keep localStorage copy */
  }
  return next;
}
