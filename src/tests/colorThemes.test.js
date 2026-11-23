import { describe, expect, it } from 'vitest';
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  normalizeColorTheme,
} from '../ui/colorThemes.js';
import { clampLayout, DEFAULT_LAYOUT } from '../editor/layout/layoutPrefs.js';

describe('color themes', () => {
  it('exposes the four View → Theme options', () => {
    expect(COLOR_THEMES.map((t) => t.id)).toEqual([
      'bloodbound',
      'midnight',
      'forge',
      'contrast',
    ]);
    expect(DEFAULT_COLOR_THEME).toBe('bloodbound');
  });

  it('normalizes invalid theme ids', () => {
    expect(normalizeColorTheme('forge')).toBe('forge');
    expect(normalizeColorTheme('nope')).toBe('bloodbound');
    expect(normalizeColorTheme(null)).toBe('bloodbound');
  });

  it('persists colorTheme through layout clamp', () => {
    expect(clampLayout({ ...DEFAULT_LAYOUT, colorTheme: 'midnight' }).colorTheme).toBe('midnight');
    expect(clampLayout({ colorTheme: '???' }).colorTheme).toBe('bloodbound');
  });
});
