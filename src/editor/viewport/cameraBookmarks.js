/**
 * Editor helpers for camera bookmarks.
 * Canonical data lives on the level (`world.cameraBookmarks`); localStorage is a
 * one-shot fallback for bookmarks stored before map persistence shipped.
 */

export {
  CAMERA_BOOKMARK_SLOTS,
  cameraBookmarksForSerialize,
  cameraBookmarksHasSlots,
  emptyCameraBookmarks,
  getCameraBookmark,
  isCameraBookmarkSlot,
  normalizeCameraBookmark,
  normalizeCameraBookmarksDoc,
  setCameraBookmark,
} from '../../core/cameraBookmarks.js';

import {
  cameraBookmarksHasSlots,
  getCameraBookmark,
  normalizeCameraBookmarksDoc,
} from '../../core/cameraBookmarks.js';

/** Legacy browser-only store (pre map persistence). */
export const CAMERA_BOOKMARKS_STORAGE_KEY = 'bb.cameraBookmarks.v1';

export function loadLegacyCameraBookmarks(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(CAMERA_BOOKMARKS_STORAGE_KEY);
    if (!raw) return normalizeCameraBookmarksDoc({});
    return normalizeCameraBookmarksDoc(JSON.parse(raw));
  } catch {
    return normalizeCameraBookmarksDoc({});
  }
}

export function clearLegacyCameraBookmarks(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(CAMERA_BOOKMARKS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Level bookmark, else leftover localStorage slot (until the level is saved). */
export function resolveCameraBookmark(worldDoc, slot, storage = globalThis.localStorage) {
  const fromWorld = getCameraBookmark(worldDoc, slot);
  if (fromWorld) return fromWorld;
  if (cameraBookmarksHasSlots(worldDoc)) return null;
  return getCameraBookmark(loadLegacyCameraBookmarks(storage), slot);
}

/** Digit from KeyboardEvent (Digit1–Digit9 / Numpad1–Numpad9). */
export function cameraBookmarkSlotFromEvent(e) {
  const code = String(e?.code || '');
  const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digitMatch) return digitMatch[1];
  return null;
}
