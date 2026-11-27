import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createStickyNote,
  normalizeStickyNotes,
  normalizeStickyNotesDoc,
  notesForLevel,
  setNotesForLevel,
  setStickyNotesVisible,
  stickyNotesVisible,
  STICKY_NOTE_COLORS,
} from '../editor/stickyNotes/stickyNotesModel.js';
import {
  loadStickyNotesDocFromStorage,
  saveStickyNotesDocToStorage,
  STICKY_NOTES_STORAGE_KEY,
} from '../editor/stickyNotes/stickyNotesApi.js';

describe('sticky notes model', () => {
  it('creates and normalizes notes with clamped layout', () => {
    const note = createStickyNote({ text: 'fix', x: 150, y: -4, color: 'blue' });
    expect(note.color).toBe('blue');
    expect(note.x).toBe(92);
    expect(note.y).toBe(0);
    expect(note.text).toBe('fix');
    expect(createStickyNote({ w: 40 }).w).toBe(120);
    expect(createStickyNote({ w: 900 }).w).toBe(420);
    expect(STICKY_NOTE_COLORS).toContain('yellow');
    expect(normalizeStickyNotes([{ id: 'a', text: '1' }, { id: 'a', text: 'dup' }, null]))
      .toHaveLength(1);
  });

  it('keeps notes per level in a separate doc', () => {
    let doc = normalizeStickyNotesDoc({});
    doc = setNotesForLevel(doc, 'room-a.json', [
      createStickyNote({ id: 'n1', text: 'A' }),
    ]);
    doc = setNotesForLevel(doc, 'room-b.json', [
      createStickyNote({ id: 'n2', text: 'B' }),
    ]);
    expect(notesForLevel(doc, 'room-a.json').map((n) => n.text)).toEqual(['A']);
    expect(notesForLevel(doc, 'room-b.json').map((n) => n.text)).toEqual(['B']);
    expect(doc.schemaVersion).toBe(1);
    expect(stickyNotesVisible(doc)).toBe(true);
    doc = setStickyNotesVisible(doc, false);
    expect(stickyNotesVisible(doc)).toBe(false);
    expect(notesForLevel(doc, 'room-a.json')).toHaveLength(1);
  });
});

describe('sticky notes local cache', () => {
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
    const doc = setNotesForLevel({}, 'test-room.json', [
      createStickyNote({ id: 'n1', text: 'Check spawn', color: 'pink' }),
    ]);
    saveStickyNotesDocToStorage(doc);
    expect(mem.has(STICKY_NOTES_STORAGE_KEY)).toBe(true);
    const loaded = loadStickyNotesDocFromStorage();
    expect(notesForLevel(loaded, 'test-room.json')[0]).toMatchObject({
      id: 'n1',
      text: 'Check spawn',
      color: 'pink',
    });
  });
});
