import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  checklistsVisible,
  createChecklistItem,
  itemsForLevel,
  normalizeChecklistItems,
  normalizeChecklistsDoc,
  projectItems,
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
    saveChecklistsDocToStorage(doc);
    expect(mem.has(CHECKLISTS_STORAGE_KEY)).toBe(true);
    const loaded = loadChecklistsDocFromStorage();
    expect(checklistsVisible(loaded)).toBe(true);
    expect(projectItems(loaded)[0]).toMatchObject({ id: 'p1', text: 'Project task', done: false });
    expect(itemsForLevel(loaded, 'test-room.json')[0]).toMatchObject({
      id: 'l1',
      text: 'Level task',
      done: true,
    });
  });
});
