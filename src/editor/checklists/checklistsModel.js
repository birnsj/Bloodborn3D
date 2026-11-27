/** Editor-only project + per-level checklists. Not level data. */

export const CHECKLISTS_SCHEMA_VERSION = 1;
export const CHECKLIST_WIDTH_DEFAULT = 280;
export const CHECKLIST_HEIGHT_DEFAULT = 360;
export const CHECKLIST_WIDTH_MIN = 200;
export const CHECKLIST_WIDTH_MAX = 640;
export const CHECKLIST_HEIGHT_MIN = 180;
export const CHECKLIST_HEIGHT_MAX = 720;

/** Legacy uniform scale → pixel size (old default width/height). */
const LEGACY_BASE_W = 268;
const LEGACY_BASE_H = 320;

export function clampChecklistWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CHECKLIST_WIDTH_DEFAULT;
  return Math.min(CHECKLIST_WIDTH_MAX, Math.max(CHECKLIST_WIDTH_MIN, Math.round(n)));
}

export function clampChecklistHeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CHECKLIST_HEIGHT_DEFAULT;
  return Math.min(CHECKLIST_HEIGHT_MAX, Math.max(CHECKLIST_HEIGHT_MIN, Math.round(n)));
}

function sizeFromLegacyScale(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    w: clampChecklistWidth(LEGACY_BASE_W * n),
    h: clampChecklistHeight(LEGACY_BASE_H * n),
  };
}

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

  const hasW = Number.isFinite(Number(src.w));
  const hasH = Number.isFinite(Number(src.h));
  const legacy = (!hasW || !hasH) ? sizeFromLegacyScale(src.scale) : null;

  return {
    schemaVersion: CHECKLISTS_SCHEMA_VERSION,
    /** When false, the floating checklist panel stays closed. */
    visible: src.visible === true,
    /** Panel size in CSS px; corner resize. Larger = more content visible. */
    w: clampChecklistWidth(hasW ? src.w : (legacy?.w ?? CHECKLIST_WIDTH_DEFAULT)),
    h: clampChecklistHeight(hasH ? src.h : (legacy?.h ?? CHECKLIST_HEIGHT_DEFAULT)),
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

export function checklistsSize(doc) {
  const n = normalizeChecklistsDoc(doc);
  return { w: n.w, h: n.h };
}

export function setChecklistsSize(doc, size = {}) {
  const next = normalizeChecklistsDoc(doc);
  if (size.w != null) next.w = clampChecklistWidth(size.w);
  if (size.h != null) next.h = clampChecklistHeight(size.h);
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
