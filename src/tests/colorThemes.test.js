import { describe, expect, it } from 'vitest';
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  normalizeColorTheme,
} from '../ui/colorThemes.js';
import { clampLayout, DEFAULT_LAYOUT } from '../editor/layout/layoutPrefs.js';

describe('color themes', () => {
  it('keeps only Midnight', () => {
    expect(COLOR_THEMES.map((t) => t.id)).toEqual(['midnight']);
    expect(DEFAULT_COLOR_THEME).toBe('midnight');
  });

  it('normalizes any theme id to Midnight', () => {
    expect(normalizeColorTheme('forge')).toBe('midnight');
    expect(normalizeColorTheme('bloodbound')).toBe('midnight');
    expect(normalizeColorTheme('nope')).toBe(DEFAULT_COLOR_THEME);
    expect(normalizeColorTheme(null)).toBe(DEFAULT_COLOR_THEME);
  });

  it('persists colorTheme through layout clamp as Midnight', () => {
    expect(clampLayout({ ...DEFAULT_LAYOUT, colorTheme: 'contrast' }).colorTheme).toBe('midnight');
    expect(clampLayout({ colorTheme: '???' }).colorTheme).toBe('midnight');
  });
});
