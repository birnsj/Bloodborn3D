import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_SCALE,
  normalizeViewScale,
  stepViewScale,
  viewScaleFactor,
  VIEW_SCALES,
} from '../editor/layout/viewScale.js';
import { clampLayout, DEFAULT_LAYOUT } from '../editor/layout/layoutPrefs.js';

describe('UI view scale', () => {
  it('exposes STA-like discrete scale steps', () => {
    expect(VIEW_SCALES.map((e) => e.id)).toEqual([85, 100, 115, 125, 150]);
    expect(DEFAULT_VIEW_SCALE).toBe(100);
    expect(viewScaleFactor(125)).toBe(1.25);
  });

  it('normalizes invalid values to default', () => {
    expect(normalizeViewScale(999)).toBe(100);
    expect(normalizeViewScale('nope')).toBe(100);
    expect(normalizeViewScale(115)).toBe(115);
  });

  it('steps up and down without leaving the allowed set', () => {
    expect(stepViewScale(100, 1)).toBe(115);
    expect(stepViewScale(100, -1)).toBe(85);
    expect(stepViewScale(85, -1)).toBe(85);
    expect(stepViewScale(150, 1)).toBe(150);
  });

  it('persists uiScale through layout clamp', () => {
    const next = clampLayout({ ...DEFAULT_LAYOUT, uiScale: 150 });
    expect(next.uiScale).toBe(150);
    expect(clampLayout({ uiScale: 12 }).uiScale).toBe(100);
  });
});
