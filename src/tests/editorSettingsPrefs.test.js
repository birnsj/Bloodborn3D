import { describe, expect, it } from 'vitest';
import {
  clampEditorSettings,
  DEFAULT_EDITOR_SETTINGS,
  hexToColorInt,
  normalizeHexColor,
  orbitDampingFromFloatiness,
  viewportColorsFromSettings,
} from '../editor/editorSettingsPrefs.js';

describe('editorSettingsPrefs', () => {
  it('clamps floatiness and speeds to valid ranges', () => {
    const next = clampEditorSettings({
      cameraOrbitFloatiness: 250,
      cameraOrbitSpeed: 0.01,
      cameraFlyLookSensitivity: 9,
      cameraOrbitZoomSpeed: 0,
      cameraFlySpeed: 10,
      playLookSensitivity: 99,
    });
    expect(next.cameraOrbitFloatiness).toBe(100);
    expect(next.cameraOrbitSpeed).toBe(0.25);
    expect(next.cameraFlyLookSensitivity).toBe(4);
    expect(next.cameraOrbitZoomSpeed).toBe(0.25);
    expect(next.cameraFlySpeed).toBe(100);
    expect(next.playLookSensitivity).toBe(4);
  });

  it('normalizes hex colors', () => {
    expect(normalizeHexColor('#ABC', '#000000')).toBe('#aabbcc');
    expect(normalizeHexColor('nope', '#0e1218')).toBe('#0e1218');
    expect(hexToColorInt('#ffcc33')).toBe(0xffcc33);
  });

  it('maps floatiness 0 to no damping', () => {
    expect(orbitDampingFromFloatiness(0).enableDamping).toBe(false);
  });

  it('uses snappy cameras by default (no orbit float)', () => {
    expect(DEFAULT_EDITOR_SETTINGS.cameraOrbitFloatiness).toBe(0);
    expect(orbitDampingFromFloatiness(DEFAULT_EDITOR_SETTINGS.cameraOrbitFloatiness).enableDamping)
      .toBe(false);
  });

  it('defaults middle-mouse pan to fast and fly look above 1', () => {
    expect(DEFAULT_EDITOR_SETTINGS.cameraOrbitPanSpeed).toBe(2);
    expect(DEFAULT_EDITOR_SETTINGS.cameraFlyLookSensitivity).toBeGreaterThan(1);
  });

  it('includes grid and display-mode defaults', () => {
    expect(DEFAULT_EDITOR_SETTINGS.gridSize).toBe(25);
    expect(DEFAULT_EDITOR_SETTINGS.gridSnap).toBe(true);
    expect(DEFAULT_EDITOR_SETTINGS.defaultDisplayMode).toBe('lit');
    const next = clampEditorSettings({ gridSize: 7, defaultDisplayMode: 'nope' });
    expect(next.gridSize).toBe(25);
    expect(next.defaultDisplayMode).toBe('lit');
  });

  it('maps mid floatiness near legacy dampingFactor 0.08', () => {
    const { enableDamping, dampingFactor } = orbitDampingFromFloatiness(68);
    expect(enableDamping).toBe(true);
    expect(dampingFactor).toBeGreaterThan(0.07);
    expect(dampingFactor).toBeLessThan(0.09);
  });

  it('increases coast as floatiness rises', () => {
    const low = orbitDampingFromFloatiness(20).dampingFactor;
    const high = orbitDampingFromFloatiness(90).dampingFactor;
    expect(high).toBeLessThan(low);
  });

  it('builds viewport color ints from settings', () => {
    const colors = viewportColorsFromSettings({
      viewportBackground: '#112233',
      viewportSelection: '#ffcc33',
    });
    expect(colors.background).toBe(0x112233);
    expect(colors.selection).toBe(0xffcc33);
    expect(colors.gridMajor).toBe(hexToColorInt(DEFAULT_EDITOR_SETTINGS.viewportGridMajor));
  });

  it('defaults and clamps subtract fill display prefs', () => {
    expect(DEFAULT_EDITOR_SETTINGS.showSubtractVolumes).toBe(true);
    expect(DEFAULT_EDITOR_SETTINGS.subtractVolumeOpacity).toBe(0.14);
    const next = clampEditorSettings({
      showSubtractVolumes: false,
      subtractVolumeOpacity: 2.5,
    });
    expect(next.showSubtractVolumes).toBe(false);
    expect(next.subtractVolumeOpacity).toBe(1);
    const low = clampEditorSettings({ subtractVolumeOpacity: -1 });
    expect(low.subtractVolumeOpacity).toBe(0);
  });

  it('defaults show light helpers on', () => {
    expect(DEFAULT_EDITOR_SETTINGS.showLightHelpers).toBe(true);
    expect(clampEditorSettings({ showLightHelpers: false }).showLightHelpers).toBe(false);
  });
});
