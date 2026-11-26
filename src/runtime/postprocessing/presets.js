/**
 * Built-in post-processing starting configurations (not fixed styles).
 */

import { mergePostProcessing, normalizePostProcessing } from './postProcessingState.js';

function preset(id, label, partial) {
  return Object.freeze({
    id,
    label,
    builtin: true,
    settings: normalizePostProcessing(partial),
  });
}

export const BUILTIN_POST_PROCESSING_PRESETS = Object.freeze([
  preset('default-disabled', 'Default / Disabled', { enabled: false }),

  preset('gothic-interior', 'Gothic Interior', {
    enabled: true,
    exposure: 0.85,
    effects: {
      toneMapping: { enabled: true, mode: 'ACES_FILMIC' },
      bloom: {
        enabled: true,
        intensity: 0.55,
        luminanceThreshold: 0.75,
        luminanceSmoothing: 0.04,
        mipmapBlur: true,
      },
      ssao: {
        enabled: true,
        intensity: 1.1,
        radius: 0.22,
        luminanceInfluence: 0.55,
      },
      vignette: { enabled: true, offset: 0.35, darkness: 0.65 },
      brightnessContrast: { enabled: true, brightness: -0.04, contrast: 0.08 },
      hueSaturation: { enabled: true, hue: 0.02, saturation: -0.12 },
      noise: { enabled: true, opacity: 0.08, premultiply: true },
      smaa: { enabled: true },
    },
  }),

  preset('dark-horror', 'Dark Horror', {
    enabled: true,
    exposure: 0.7,
    effects: {
      toneMapping: { enabled: true, mode: 'ACES_FILMIC' },
      bloom: {
        enabled: true,
        intensity: 0.9,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.05,
      },
      vignette: { enabled: true, offset: 0.25, darkness: 0.85 },
      chromaticAberration: {
        enabled: true,
        offsetX: 0.0015,
        offsetY: 0.0015,
        radialModulation: true,
      },
      brightnessContrast: { enabled: true, brightness: -0.08, contrast: 0.15 },
      hueSaturation: { enabled: true, saturation: -0.25 },
      noise: { enabled: true, opacity: 0.18, premultiply: true },
      scanlines: { enabled: true, density: 1.4, scrollSpeed: 0 },
      smaa: { enabled: true },
    },
  }),

  preset('cinematic', 'Cinematic', {
    enabled: true,
    exposure: 0.95,
    effects: {
      toneMapping: { enabled: true, mode: 'ACES_FILMIC' },
      bloom: {
        enabled: true,
        intensity: 0.4,
        luminanceThreshold: 0.9,
        mipmapBlur: true,
      },
      depthOfField: {
        enabled: true,
        focusDistance: 0.12,
        focalLength: 0.08,
        bokehScale: 1.4,
      },
      vignette: { enabled: true, offset: 0.45, darkness: 0.4 },
      brightnessContrast: { enabled: true, brightness: 0.02, contrast: 0.06 },
      hueSaturation: { enabled: true, saturation: 0.05 },
      smaa: { enabled: true },
    },
  }),

  preset('retro-horror', 'Retro Horror', {
    enabled: true,
    exposure: 0.8,
    effects: {
      toneMapping: { enabled: true, mode: 'ACES_FILMIC' },
      colorDepth: { enabled: true, bitDepth: 6 },
      pixelation: { enabled: true, granularity: 8 },
      scanlines: { enabled: true, density: 1.8 },
      chromaticAberration: { enabled: true, offsetX: 0.003, offsetY: 0.002 },
      vignette: { enabled: true, offset: 0.3, darkness: 0.7 },
      noise: { enabled: true, opacity: 0.25, premultiply: true },
      glitch: {
        enabled: true,
        mode: 'SPORADIC',
        minStrength: 0.08,
        maxStrength: 0.25,
      },
      sepia: { enabled: true, intensity: 0.35 },
    },
  }),
]);

export function getBuiltinPreset(id) {
  return BUILTIN_POST_PROCESSING_PRESETS.find((p) => p.id === id) || null;
}

export function applyPresetToSettings(presetSettings) {
  return mergePostProcessing(null, presetSettings);
}
