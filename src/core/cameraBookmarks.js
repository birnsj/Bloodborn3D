/**
 * Level-authored camera bookmarks (editor Ctrl+1–9 / 1–9).
 * Engine-neutral poses: position, target, cameraMode, optional ortho frustumSize.
 * Omitted from level JSON when empty so older levels stay fingerprint-identical.
 */

export const CAMERA_BOOKMARK_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function emptyCameraBookmarks() {
  return { schemaVersion: 1, slots: {} };
}

export function isCameraBookmarkSlot(value) {
  return CAMERA_BOOKMARK_SLOTS.includes(String(value));
}

export function normalizeCameraBookmark(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const position = Array.isArray(raw.position) ? raw.position.map(Number) : null;
  const target = Array.isArray(raw.target) ? raw.target.map(Number) : null;
  if (!position || position.length < 3 || position.some((n) => !Number.isFinite(n))) return null;
  if (!target || target.length < 3 || target.some((n) => !Number.isFinite(n))) return null;
  const frustumN = Number(raw.frustumSize);
  const bookmark = {
    position: [position[0], position[1], position[2]],
    target: [target[0], target[1], target[2]],
    cameraMode: typeof raw.cameraMode === 'string' && raw.cameraMode
      ? raw.cameraMode
      : 'perspective',
  };
  if (Number.isFinite(frustumN) && frustumN > 0) bookmark.frustumSize = frustumN;
  return bookmark;
}

export function normalizeCameraBookmarksDoc(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const slots = {};
  for (const key of CAMERA_BOOKMARK_SLOTS) {
    const bm = normalizeCameraBookmark(src.slots?.[key] ?? src[key]);
    if (bm) slots[key] = bm;
  }
  return { schemaVersion: 1, slots };
}

export function cameraBookmarksHasSlots(doc) {
  return Object.keys(normalizeCameraBookmarksDoc(doc).slots).length > 0;
}

export function getCameraBookmark(doc, slot) {
  const key = String(slot);
  if (!isCameraBookmarkSlot(key)) return null;
  return normalizeCameraBookmarksDoc(doc).slots[key] || null;
}

export function setCameraBookmark(doc, slot, bookmark) {
  const key = String(slot);
  if (!isCameraBookmarkSlot(key)) return normalizeCameraBookmarksDoc(doc);
  const next = normalizeCameraBookmarksDoc(doc);
  const bm = normalizeCameraBookmark(bookmark);
  if (!bm) {
    delete next.slots[key];
    return next;
  }
  next.slots[key] = bm;
  return next;
}

/** Serialize field: omit when empty so untouched levels stay clean. */
export function cameraBookmarksForSerialize(doc) {
  const next = normalizeCameraBookmarksDoc(doc);
  return cameraBookmarksHasSlots(next) ? next : null;
}
