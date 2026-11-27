/** Editor-only project + per-level checklists. Not level data. */

export const CHECKLISTS_SCHEMA_VERSION = 1;

export function createChecklistItem(partial = {}) {
  return {
    id: partial.id || `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    text: typeof partial.text === 'string' ? partial.text : '',
    done: Boolean(partial.done),
  };
}

export function normalizeChecklistItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  return createChecklistItem({ ...raw, id });
}

export function normalizeChecklistItems(list = []) {
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const item = normalizeChecklistItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function normalizeChecklistsDoc(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const byLevel = {};
  const incoming = src.byLevel && typeof src.byLevel === 'object' ? src.byLevel : {};
  for (const [level, items] of Object.entries(incoming)) {
    if (typeof level !== 'string' || !level) continue;
    byLevel[level] = normalizeChecklistItems(items);
  }
  return {
    schemaVersion: CHECKLISTS_SCHEMA_VERSION,
    /** When false, the floating checklist panel stays closed. */
    visible: src.visible === true,
    project: normalizeChecklistItems(src.project),
    byLevel,
  };
}

export function checklistsVisible(doc) {
  return normalizeChecklistsDoc(doc).visible === true;
}

export function setChecklistsVisible(doc, visible) {
  const next = normalizeChecklistsDoc(doc);
  next.visible = Boolean(visible);
  return next;
}

export function projectItems(doc) {
  return normalizeChecklistsDoc(doc).project;
}

export function setProjectItems(doc, items) {
  const next = normalizeChecklistsDoc(doc);
  next.project = normalizeChecklistItems(items);
  return next;
}

export function itemsForLevel(doc, levelName) {
  const key = String(levelName || 'untitled.json');
  const normalized = normalizeChecklistsDoc(doc);
  return normalized.byLevel[key] || [];
}

export function setItemsForLevel(doc, levelName, items) {
  const key = String(levelName || 'untitled.json');
  const next = normalizeChecklistsDoc(doc);
  next.byLevel[key] = normalizeChecklistItems(items);
  return next;
}

export function patchChecklistItem(items, id, partial) {
  return normalizeChecklistItems(
    (items || []).map((item) => (item.id === id ? { ...item, ...partial, id } : item)),
  );
}

export function removeChecklistItem(items, id) {
  return normalizeChecklistItems((items || []).filter((item) => item.id !== id));
}
