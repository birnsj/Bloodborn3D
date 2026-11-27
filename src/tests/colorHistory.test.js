import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COLOR_HISTORY_STORAGE_KEY,
  getMostUsedColors,
  loadColorHistory,
  recordColorUse,
} from '../ui/colorHistory.js';

function installMemoryStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  localStorage.removeItem(COLOR_HISTORY_STORAGE_KEY);
});

describe('colorHistory', () => {
  it('records uses and ranks by frequency', () => {
    recordColorUse('#4A8FD4');
    recordColorUse('#ff8800');
    recordColorUse('#4a8fd4');
    recordColorUse('#4a8fd4');
    const history = loadColorHistory();
    expect(history[0].color).toBe('#4a8fd4');
    expect(history[0].count).toBe(3);
    expect(getMostUsedColors(1)).toEqual(['#4a8fd4']);
  });

  it('ignores invalid colors', () => {
    recordColorUse('red');
    recordColorUse('#fff');
    expect(loadColorHistory()).toEqual([]);
  });
});
