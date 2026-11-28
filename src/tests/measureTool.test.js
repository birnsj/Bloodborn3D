import { describe, expect, it } from 'vitest';
import {
  convertEditorDistance,
  DEFAULT_MEASURE_DISPLAY_UNIT,
  distanceEditorUnits,
  formatMeasureDistance,
  normalizeMeasureDisplayUnit,
} from '../editor/viewport/measureTool.js';
import { clampEditorSettings, DEFAULT_EDITOR_SETTINGS } from '../editor/editorSettingsPrefs.js';

describe('measureTool', () => {
  it('defaults measure display unit to meters', () => {
    expect(DEFAULT_MEASURE_DISPLAY_UNIT).toBe('meters');
    expect(DEFAULT_EDITOR_SETTINGS.measureDisplayUnit).toBe('meters');
    expect(normalizeMeasureDisplayUnit('nope')).toBe('meters');
    expect(clampEditorSettings({ measureDisplayUnit: 'feet' }).measureDisplayUnit).toBe('feet');
  });

  it('converts 100 editor units to one meter and related units', () => {
    expect(convertEditorDistance(100, 'meters')).toBeCloseTo(1, 6);
    expect(convertEditorDistance(100, 'centimeters')).toBeCloseTo(100, 6);
    expect(convertEditorDistance(100, 'millimeters')).toBeCloseTo(1000, 6);
    expect(convertEditorDistance(100, 'editor')).toBe(100);
    expect(convertEditorDistance(100, 'feet')).toBeCloseTo(1 / 0.3048, 5);
    expect(convertEditorDistance(100, 'inches')).toBeCloseTo(1 / 0.0254, 5);
  });

  it('formats distances with unit suffixes', () => {
    expect(formatMeasureDistance(100, 'meters')).toBe('1 m');
    expect(formatMeasureDistance(250, 'editor')).toBe('250 eu');
    expect(formatMeasureDistance(0, 'meters')).toBe('0 m');
  });

  it('measures 3D distance in editor units', () => {
    expect(distanceEditorUnits({ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 400 })).toBe(500);
  });
});
