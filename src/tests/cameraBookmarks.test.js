import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  cameraBookmarksForSerialize,
  getCameraBookmark,
  normalizeCameraBookmark,
  normalizeCameraBookmarksDoc,
  setCameraBookmark,
} from '../core/cameraBookmarks.js';
import {
  CAMERA_BOOKMARKS_STORAGE_KEY,
  cameraBookmarkSlotFromEvent,
  clearLegacyCameraBookmarks,
  loadLegacyCameraBookmarks,
  resolveCameraBookmark,
} from '../editor/viewport/cameraBookmarks.js';
import { SetCameraBookmarksCommand } from '../editor/history/commands.js';
import { World } from '../core/World.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';

describe('camera bookmarks', () => {
  const mem = new Map();
  beforeEach(() => {
    mem.clear();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
    };
  });
  afterEach(() => {
    mem.clear();
    delete globalThis.localStorage;
  });

  it('normalizes and rejects bad bookmarks', () => {
    expect(normalizeCameraBookmark(null)).toBe(null);
    expect(normalizeCameraBookmark({ position: [1, 2], target: [0, 0, 0] })).toBe(null);
    const ok = normalizeCameraBookmark({
      position: [6, 5, 8],
      target: [0, 1.5, 0],
      cameraMode: 'perspective',
    });
    expect(ok.position).toEqual([6, 5, 8]);
    expect(ok.target).toEqual([0, 1.5, 0]);
  });

  it('round-trips through level JSON when slots are set', () => {
    const world = new World({ name: 'Bookmarks', schemaVersion: 2 });
    world.cameraBookmarks = setCameraBookmark({}, '3', {
      position: [1, 2, 3],
      target: [0, 1, 0],
      cameraMode: 'top',
      frustumSize: 12,
    });
    const json = serializeLevel(world);
    expect(json.cameraBookmarks.slots['3']).toMatchObject({
      position: [1, 2, 3],
      target: [0, 1, 0],
      cameraMode: 'top',
      frustumSize: 12,
    });
    const restored = deserializeLevel(json);
    expect(getCameraBookmark(restored.cameraBookmarks, '3')).toMatchObject({
      position: [1, 2, 3],
      cameraMode: 'top',
    });
    expect(getCameraBookmark(restored.cameraBookmarks, '1')).toBe(null);
  });

  it('omits empty cameraBookmarks from serialized levels', () => {
    const world = new World({ name: 'Empty', schemaVersion: 2 });
    const json = serializeLevel(world);
    expect(json.cameraBookmarks).toBeUndefined();
    expect(cameraBookmarksForSerialize(null)).toBe(null);
  });

  it('SetCameraBookmarksCommand undoes', () => {
    const world = new World({ name: 'Undo', schemaVersion: 2 });
    const before = normalizeCameraBookmarksDoc(world.cameraBookmarks);
    const after = setCameraBookmark(before, '2', {
      position: [4, 5, 6],
      target: [0, 0, 0],
      cameraMode: 'perspective',
    });
    const cmd = new SetCameraBookmarksCommand({ world, before, after });
    cmd.do();
    expect(getCameraBookmark(world.cameraBookmarks, '2').position).toEqual([4, 5, 6]);
    cmd.undo();
    expect(getCameraBookmark(world.cameraBookmarks, '2')).toBe(null);
  });

  it('falls back to legacy localStorage when the level has no slots', () => {
    mem.set(CAMERA_BOOKMARKS_STORAGE_KEY, JSON.stringify({
      slots: {
        5: { position: [9, 8, 7], target: [1, 1, 1], cameraMode: 'perspective' },
      },
    }));
    expect(resolveCameraBookmark(normalizeCameraBookmarksDoc({}), '5')).toMatchObject({
      position: [9, 8, 7],
    });
    expect(loadLegacyCameraBookmarks().slots['5']).toBeTruthy();
    clearLegacyCameraBookmarks();
    expect(mem.has(CAMERA_BOOKMARKS_STORAGE_KEY)).toBe(false);
  });

  it('reads bookmark slots from keyboard codes', () => {
    expect(cameraBookmarkSlotFromEvent({ code: 'Digit5' })).toBe('5');
    expect(cameraBookmarkSlotFromEvent({ code: 'Numpad2' })).toBe('2');
    expect(cameraBookmarkSlotFromEvent({ code: 'Digit0' })).toBe(null);
    expect(cameraBookmarkSlotFromEvent({ code: 'KeyA' })).toBe(null);
  });
});
