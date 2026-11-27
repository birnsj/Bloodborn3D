import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  checklistsSize,
  checklistsVisible,
  clampChecklistHeight,
  clampChecklistWidth,
  createChecklistItem,
  itemsForLevel,
  normalizeChecklistItems,
  normalizeChecklistsDoc,
  projectItems,
  setChecklistsSize,
  setChecklistsVisible,
  setItemsForLevel,
  setProjectItems,
} from '../editor/checklists/checklistsModel.js';
import {
  CHECKLISTS_STORAGE_KEY,
  loadChecklistsDocFromStorage,
  saveChecklistsDocToStorage,
} from '../editor/checklists/checklistsApi.js';

describe('checklists model', () => {
  it('creates and normalizes items', () => {
    const item = createChecklistItem({ text: 'Bake lights', done: true });
    expect(item.text).toBe('Bake lights');
    expect(item.done).toBe(true);
    expect(item.id).toBeTruthy();
    expect(normalizeChecklistItems([
      { id: 'a', text: '1' },
      { id: 'a', text: 'dup' },
      null,
    ])).toHaveLength(1);
  });

  it('keeps project and per-level lists separate', () => {
    let doc = normalizeChecklistsDoc({});
    doc = setProjectItems(doc, [
      createChecklistItem({ id: 'p1', text: 'Ship vertical slice' }),
    ]);
    doc = setItemsForLevel(doc, 'room-a.json', [
      createChecklistItem({ id: 'l1', text: 'Place spawn' }),
    ]);
    doc = setItemsForLevel(doc, 'room-b.json', [
      createChecklistItem({ id: 'l2', text: 'Add fog' }),
    ]);
    expect(projectItems(doc).map((i) => i.text)).toEqual(['Ship vertical slice']);
    expect(itemsForLevel(doc, 'room-a.json').map((i) => i.text)).toEqual(['Place spawn']);
    expect(itemsForLevel(doc, 'room-b.json').map((i) => i.text)).toEqual(['Add fog']);
    expect(doc.schemaVersion).toBe(1);
    expect(checklistsVisible(doc)).toBe(false);
    doc = setChecklistsVisible(doc, true);
    expect(checklistsVisible(doc)).toBe(true);
    expect(projectItems(doc)).toHaveLength(1);
    expect(checklistsSize(doc)).toEqual({ w: 280, h: 360 });
    doc = setChecklistsSize(doc, { w: 400, h: 500 });
    expect(checklistsSize(doc)).toEqual({ w: 400, h: 500 });
    expect(clampChecklistWidth(40)).toBe(200);
    expect(clampChecklistWidth(900)).toBe(640);
    expect(clampChecklistHeight(40)).toBe(180);
    expect(clampChecklistHeight(900)).toBe(720);
  });

  it('migrates legacy scale into width/height', () => {
    const doc = normalizeChecklistsDoc({ scale: 1.25, visible: true });
    expect(doc.w).toBe(Math.round(268 * 1.25));
    expect(doc.h).toBe(Math.round(320 * 1.25));
    expect(doc.scale).toBeUndefined();
  });
});

describe('checklists local cache', () => {
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

  it('round-trips the doc through localStorage fallback', () => {
    let doc = setProjectItems({}, [
      createChecklistItem({ id: 'p1', text: 'Project task', done: false }),
    ]);
    doc = setItemsForLevel(doc, 'test-room.json', [
      createChecklistItem({ id: 'l1', text: 'Level task', done: true }),
    ]);
    doc = setChecklistsVisible(doc, true);
    doc = setChecklistsSize(doc, { w: 320, h: 420 });
    saveChecklistsDocToStorage(doc);
    expect(mem.has(CHECKLISTS_STORAGE_KEY)).toBe(true);
    const loaded = loadChecklistsDocFromStorage();
    expect(checklistsVisible(loaded)).toBe(true);
    expect(checklistsSize(loaded)).toEqual({ w: 320, h: 420 });
    expect(projectItems(loaded)[0]).toMatchObject({ id: 'p1', text: 'Project task', done: false });
    expect(itemsForLevel(loaded, 'test-room.json')[0]).toMatchObject({
      id: 'l1',
      text: 'Level task',
      done: true,
    });
  });
});
