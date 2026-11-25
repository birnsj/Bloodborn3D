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
    expect(DEFAULT_COLOR_THEME).toBe('midnight');
  });

  it('normalizes invalid theme ids', () => {
    expect(normalizeColorTheme('forge')).toBe('forge');
    expect(normalizeColorTheme('nope')).toBe(DEFAULT_COLOR_THEME);
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME);
    expect(DEFAULT_COLOR_THEME).toBe('midnight');
  });

  it('persists colorTheme through layout clamp', () => {
    expect(clampLayout({ ...DEFAULT_LAYOUT, colorTheme: 'midnight' }).colorTheme).toBe('midnight');
    expect(clampLayout({ colorTheme: '???' }).colorTheme).toBe('midnight');
  });
});
