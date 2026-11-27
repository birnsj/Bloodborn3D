/**
 * Client for editor project + per-level checklists.
 * Prefers `.editor-local/checklists.json` via localhost API; falls back to localStorage.
 */
import { normalizeChecklistsDoc } from './checklistsModel.js';

export const CHECKLISTS_STORAGE_KEY = 'bloodbound.editor.checklists.v1';
export const CHECKLISTS_CHANGED_EVENT = 'bb:checklists-changed';

export function getChecklistsVisibleSync() {
  return loadChecklistsDocFromStorage().visible === true;
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadChecklistsDocFromStorage() {
  try {
    const raw = storage()?.getItem(CHECKLISTS_STORAGE_KEY);
    if (!raw) return normalizeChecklistsDoc({});
    return normalizeChecklistsDoc(JSON.parse(raw));
  } catch {
    return normalizeChecklistsDoc({});
  }
}

export function saveChecklistsDocToStorage(doc) {
  const next = normalizeChecklistsDoc(doc);
  try {
    storage()?.setItem(CHECKLISTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export async function fetchChecklistsDoc() {
  try {
    const res = await fetch('/api/checklists', { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.ok && payload.doc) {
      const doc = normalizeChecklistsDoc(payload.doc);
      saveChecklistsDocToStorage(doc);
      return doc;
    }
  } catch {
    /* API unavailable — use local cache */
  }
  return loadChecklistsDocFromStorage();
}

export async function persistChecklistsDoc(doc) {
  const next = normalizeChecklistsDoc(doc);
  saveChecklistsDocToStorage(next);
  try {
    window.dispatchEvent(new CustomEvent(CHECKLISTS_CHANGED_EVENT, { detail: next }));
  } catch {
    /* non-browser */
  }
  try {
    const res = await fetch('/api/checklists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.doc) return normalizeChecklistsDoc(payload.doc);
    }
  } catch {
    /* keep localStorage copy */
  }
  return next;
}
