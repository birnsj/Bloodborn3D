/**
 * Artist-facing effect catalog for pmndrs postprocessing 6.39.x.
 * Parameter names/ranges follow the library's public constructors and accessors.
 */

export const EFFECT_ORDER = [
  'ssao',
  'bloom',
  'selectiveBloom',
  'godRays',
  'depthOfField',
  'realisticBokeh',
  'tiltShift',
  'brightnessContrast',
  'hueSaturation',
  'gammaCorrection',
  'colorAverage',
  'sepia',
  'colorDepth',
  'lut',
  'vignette',
  'chromaticAberration',
  'lensDistortion',
  'noise',
  'pixelation',
  'dotScreen',
  'scanlines',
  'grid',
  'glitch',
  'outline',
  'textureOverlay',
  'shockWave',
  'toneMapping',
  'fxaa',
  'smaa',
];

export const EFFECT_CATEGORIES = [
  {
    id: 'rendering',
    label: 'Rendering and Image Quality',
    effectIds: ['toneMapping', 'fxaa', 'smaa'],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    effectIds: ['bloom', 'selectiveBloom', 'ssao', 'godRays'],
  },
  {
    id: 'color',
    label: 'Color Grading',
    effectIds: [
      'brightnessContrast',
      'hueSaturation',
      'gammaCorrection',
      'colorAverage',
      'sepia',
      'colorDepth',
      'lut',
    ],
  },
  {
    id: 'camera',
    label: 'Camera and Lens',
    effectIds: [
      'depthOfField',
      'realisticBokeh',
      'vignette',
      'chromaticAberration',
      'lensDistortion',
      'tiltShift',
    ],
  },
  {
    id: 'image',
    label: 'Image Effects',
    effectIds: [
      'noise',
      'pixelation',
      'dotScreen',
      'scanlines',
      'grid',
      'glitch',
      'outline',
      'textureOverlay',
      'shockWave',
    ],
  },
];

const KERNEL_SIZE_OPTIONS = [
  { value: 'VERY_SMALL', label: 'Very Small' },
  { value: 'SMALL', label: 'Small' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'VERY_LARGE', label: 'Very Large' },
  { value: 'HUGE', label: 'Huge' },
];

const TONE_MAPPING_OPTIONS = [
  { value: 'LINEAR', label: 'Linear' },
  { value: 'REINHARD', label: 'Reinhard' },
  { value: 'REINHARD2', label: 'Reinhard2' },
  { value: 'REINHARD2_ADAPTIVE', label: 'Reinhard2 Adaptive' },
  { value: 'UNCHARTED2', label: 'Uncharted 2' },
  { value: 'OPTIMIZED_CINEON', label: 'Cineon' },
  { value: 'ACES_FILMIC', label: 'ACES Filmic' },
  { value: 'AGX', label: 'AgX' },
  { value: 'NEUTRAL', label: 'Neutral' },
];

const VIGNETTE_TECHNIQUE_OPTIONS = [
  { value: 'DEFAULT', label: 'Default' },
  { value: 'ESKIL', label: 'Eskil' },
];

const GLITCH_MODE_OPTIONS = [
  { value: 'DISABLED', label: 'Disabled' },
  { value: 'SPORADIC', label: 'Sporadic' },
  { value: 'CONSTANT_MILD', label: 'Constant Mild' },
  { value: 'CONSTANT_WILD', label: 'Constant Wild' },
];

/** @type {Record<string, object>} */
export const EFFECT_DEFINITIONS = {
  toneMapping: {
    id: 'toneMapping',
    label: 'Tone Mapping',
    category: 'rendering',
    libraryClass: 'ToneMappingEffect',
    defaults: {
      enabled: true,
      mode: 'ACES_FILMIC',
      resolution: 256,
      whitePoint: 4,
      middleGrey: 0.6,
      averageLuminance: 1,
      minLuminance: 0.01,
      adaptationRate: 1,
    },
    params: [
      { key: 'mode', label: 'Mode', type: 'enum', options: TONE_MAPPING_OPTIONS },
      { key: 'resolution', label: 'Luminance resolution', type: 'number', min: 16, max: 1024, step: 16 },
      { key: 'whitePoint', label: 'White point', type: 'number', min: 0.1, max: 32, step: 0.1 },
      { key: 'middleGrey', label: 'Middle grey', type: 'number', min: 0.01, max: 4, step: 0.01 },
      { key: 'averageLuminance', label: 'Average luminance', type: 'number', min: 0.01, max: 8, step: 0.01 },
      { key: 'minLuminance', label: 'Min luminance', type: 'number', min: 0.001, max: 1, step: 0.001 },
      { key: 'adaptationRate', label: 'Adaptation rate', type: 'number', min: 0.01, max: 10, step: 0.01 },
    ],
  },
  fxaa: {
    id: 'fxaa',
    label: 'FXAA',
    category: 'rendering',
    libraryClass: 'FXAAEffect',
    exclusiveWith: ['smaa'],
    defaults: {
      enabled: false,
      minEdgeThreshold: 0.0312,
      maxEdgeThreshold: 0.125,
      subpixelQuality: 0.75,
      samples: 12,
    },
    params: [
      { key: 'minEdgeThreshold', label: 'Min edge threshold', type: 'number', min: 0, max: 1, step: 0.001 },
      { key: 'maxEdgeThreshold', label: 'Max edge threshold', type: 'number', min: 0, max: 1, step: 0.001 },
      { key: 'subpixelQuality', label: 'Subpixel quality', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'samples', label: 'Samples', type: 'number', min: 0, max: 24, step: 1 },
    ],
  },
  smaa: {
    id: 'smaa',
    label: 'SMAA',
    category: 'rendering',
    libraryClass: 'SMAAEffect',
    exclusiveWith: ['fxaa'],
    defaults: { enabled: false },
    params: [],
  },
  bloom: {
    id: 'bloom',
    label: 'Bloom',
    category: 'lighting',
    libraryClass: 'BloomEffect',
    defaults: {
      enabled: false,
      intensity: 1,
      luminanceThreshold: 1,
      luminanceSmoothing: 0.03,
      kernelSize: 'LARGE',
      mipmapBlur: true,
      radius: 0.85,
    },
    params: [
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 10, step: 0.05 },
      { key: 'luminanceThreshold', label: 'Luminance threshold', type: 'number', min: 0, max: 4, step: 0.01 },
      { key: 'luminanceSmoothing', label: 'Luminance smoothing', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'kernelSize', label: 'Kernel size', type: 'enum', options: KERNEL_SIZE_OPTIONS },
      { key: 'mipmapBlur', label: 'Mipmap blur', type: 'boolean' },
      { key: 'radius', label: 'Radius', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  selectiveBloom: {
    id: 'selectiveBloom',
    label: 'Selective Bloom',
    category: 'lighting',
    libraryClass: 'SelectiveBloomEffect',
    requires: ['actorIds'],
    defaults: {
      enabled: false,
      intensity: 1,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.025,
      kernelSize: 'LARGE',
      inverted: false,
      ignoreBackground: false,
      actorIds: [],
    },
    params: [
      { key: 'actorIds', label: 'Bloom actors', type: 'actorIds' },
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 10, step: 0.05 },
      { key: 'luminanceThreshold', label: 'Luminance threshold', type: 'number', min: 0, max: 4, step: 0.01 },
      { key: 'luminanceSmoothing', label: 'Luminance smoothing', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'kernelSize', label: 'Kernel size', type: 'enum', options: KERNEL_SIZE_OPTIONS },
      { key: 'inverted', label: 'Inverted', type: 'boolean' },
      { key: 'ignoreBackground', label: 'Ignore background', type: 'boolean' },
    ],
  },
  ssao: {
    id: 'ssao',
    label: 'SSAO',
    category: 'lighting',
    libraryClass: 'SSAOEffect',
    defaults: {
      enabled: false,
      samples: 9,
      rings: 7,
      radius: 0.1825,
      intensity: 1,
      luminanceInfluence: 0.7,
      distanceScaling: true,
      depthAwareUpsampling: true,
      color: '#000000',
    },
    params: [
      { key: 'samples', label: 'Samples', type: 'number', min: 1, max: 32, step: 1 },
      { key: 'rings', label: 'Rings', type: 'number', min: 1, max: 16, step: 1 },
      { key: 'radius', label: 'Radius', type: 'number', min: 0.001, max: 2, step: 0.001 },
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 5, step: 0.05 },
      { key: 'luminanceInfluence', label: 'Luminance influence', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'distanceScaling', label: 'Distance scaling', type: 'boolean' },
      { key: 'depthAwareUpsampling', label: 'Depth-aware upsampling', type: 'boolean' },
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  godRays: {
    id: 'godRays',
    label: 'God Rays',
    category: 'lighting',
    libraryClass: 'GodRaysEffect',
    requires: ['lightActorId'],
    defaults: {
      enabled: false,
      lightActorId: null,
      density: 0.96,
      decay: 0.9,
      weight: 0.4,
      exposure: 0.6,
      clampMax: 1,
      samples: 60,
      blur: true,
      kernelSize: 'SMALL',
    },
    params: [
      { key: 'lightActorId', label: 'Light actor', type: 'lightActorId' },
      { key: 'density', label: 'Density', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'decay', label: 'Decay', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'weight', label: 'Weight', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'exposure', label: 'Exposure', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'clampMax', label: 'Clamp max', type: 'number', min: 0, max: 4, step: 0.05 },
      { key: 'samples', label: 'Samples', type: 'number', min: 1, max: 150, step: 1 },
      { key: 'blur', label: 'Blur', type: 'boolean' },
      { key: 'kernelSize', label: 'Kernel size', type: 'enum', options: KERNEL_SIZE_OPTIONS },
    ],
  },
  brightnessContrast: {
    id: 'brightnessContrast',
    label: 'Brightness / Contrast',
    category: 'color',
    libraryClass: 'BrightnessContrastEffect',
    defaults: { enabled: false, brightness: 0, contrast: 0 },
    params: [
      { key: 'brightness', label: 'Brightness', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'contrast', label: 'Contrast', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  hueSaturation: {
    id: 'hueSaturation',
    label: 'Hue / Saturation',
    category: 'color',
    libraryClass: 'HueSaturationEffect',
    defaults: { enabled: false, hue: 0, saturation: 0 },
    params: [
      { key: 'hue', label: 'Hue', type: 'number', min: -Math.PI, max: Math.PI, step: 0.01 },
      { key: 'saturation', label: 'Saturation', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  gammaCorrection: {
    id: 'gammaCorrection',
    label: 'Gamma Correction',
    category: 'color',
    libraryClass: 'GammaCorrectionEffect',
    note: 'Deprecated in the library — BloodBound already uses sRGB output. Keep off unless diagnosing.',
    defaults: { enabled: false, gamma: 2 },
    params: [
      { key: 'gamma', label: 'Gamma', type: 'number', min: 0.1, max: 4, step: 0.05 },
    ],
  },
  colorAverage: {
    id: 'colorAverage',
    label: 'Color Average',
    category: 'color',
    libraryClass: 'ColorAverageEffect',
    defaults: { enabled: false },
    params: [],
  },
  sepia: {
    id: 'sepia',
    label: 'Sepia',
    category: 'color',
    libraryClass: 'SepiaEffect',
    defaults: { enabled: false, intensity: 1 },
    params: [
      { key: 'intensity', label: 'Intensity', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  colorDepth: {
    id: 'colorDepth',
    label: 'Color Depth',
    category: 'color',
    libraryClass: 'ColorDepthEffect',
    defaults: { enabled: false, bitDepth: 16 },
    params: [
      { key: 'bitDepth', label: 'Bit depth', type: 'number', min: 1, max: 32, step: 1 },
    ],
  },
  lut: {
    id: 'lut',
    label: 'LUT Color Grading',
    category: 'color',
    libraryClass: 'LUT3DEffect',
    requires: ['textureAssetId'],
    defaults: { enabled: false, textureAssetId: null, tetrahedralInterpolation: false },
    params: [
      { key: 'textureAssetId', label: 'LUT texture', type: 'textureAssetId' },
      { key: 'tetrahedralInterpolation', label: 'Tetrahedral interpolation', type: 'boolean' },
    ],
  },
  depthOfField: {
    id: 'depthOfField',
    label: 'Depth of Field',
    category: 'camera',
    libraryClass: 'DepthOfFieldEffect',
    defaults: {
      enabled: false,
      focusDistance: 0.1,
      focalLength: 0.1,
      bokehScale: 1,
      resolutionScale: 0.5,
    },
    params: [
      { key: 'focusDistance', label: 'Focus distance', type: 'number', min: 0, max: 1, step: 0.001 },
      { key: 'focalLength', label: 'Focal length', type: 'number', min: 0, max: 1, step: 0.001 },
      { key: 'bokehScale', label: 'Bokeh scale', type: 'number', min: 0, max: 8, step: 0.05 },
      { key: 'resolutionScale', label: 'Resolution scale', type: 'number', min: 0.1, max: 1, step: 0.05 },
    ],
  },
  realisticBokeh: {
    id: 'realisticBokeh',
    label: 'Realistic Bokeh',
    category: 'camera',
    libraryClass: 'RealisticBokehEffect',
    note: 'Deprecated in the library — prefer Depth of Field.',
    defaults: {
      enabled: false,
      focus: 1,
      focalLength: 24,
      fStop: 0.9,
      luminanceThreshold: 0.5,
      luminanceGain: 2,
      bias: 0.5,
      fringe: 0.7,
      maxBlur: 1,
      rings: 3,
      samples: 2,
      showFocus: false,
      manualDoF: false,
      pentagon: false,
    },
    params: [
      { key: 'focus', label: 'Focus', type: 'number', min: 0, max: 10, step: 0.01 },
      { key: 'focalLength', label: 'Focal length', type: 'number', min: 1, max: 200, step: 1 },
      { key: 'fStop', label: 'F-stop', type: 'number', min: 0.1, max: 8, step: 0.05 },
      { key: 'luminanceThreshold', label: 'Luminance threshold', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'luminanceGain', label: 'Luminance gain', type: 'number', min: 0, max: 8, step: 0.05 },
      { key: 'bias', label: 'Bias', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'fringe', label: 'Fringe', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'maxBlur', label: 'Max blur', type: 'number', min: 0, max: 4, step: 0.05 },
      { key: 'rings', label: 'Rings', type: 'number', min: 1, max: 8, step: 1 },
      { key: 'samples', label: 'Samples', type: 'number', min: 1, max: 8, step: 1 },
      { key: 'showFocus', label: 'Show focus', type: 'boolean' },
      { key: 'manualDoF', label: 'Manual DoF', type: 'boolean' },
      { key: 'pentagon', label: 'Pentagon', type: 'boolean' },
    ],
  },
  vignette: {
    id: 'vignette',
    label: 'Vignette',
    category: 'camera',
    libraryClass: 'VignetteEffect',
    defaults: {
      enabled: false,
      technique: 'DEFAULT',
      offset: 0.5,
      darkness: 0.5,
    },
    params: [
      { key: 'technique', label: 'Technique', type: 'enum', options: VIGNETTE_TECHNIQUE_OPTIONS },
      { key: 'offset', label: 'Offset', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'darkness', label: 'Darkness', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  chromaticAberration: {
    id: 'chromaticAberration',
    label: 'Chromatic Aberration',
    category: 'camera',
    libraryClass: 'ChromaticAberrationEffect',
    defaults: {
      enabled: false,
      offsetX: 0.002,
      offsetY: 0.002,
      radialModulation: false,
      modulationOffset: 0.15,
    },
    params: [
      { key: 'offsetX', label: 'Offset X', type: 'number', min: -0.05, max: 0.05, step: 0.0005 },
      { key: 'offsetY', label: 'Offset Y', type: 'number', min: -0.05, max: 0.05, step: 0.0005 },
      { key: 'radialModulation', label: 'Radial modulation', type: 'boolean' },
      { key: 'modulationOffset', label: 'Modulation offset', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  lensDistortion: {
    id: 'lensDistortion',
    label: 'Lens Distortion',
    category: 'camera',
    libraryClass: 'LensDistortionEffect',
    defaults: {
      enabled: false,
      distortionX: 0,
      distortionY: 0,
      principalPointX: 0,
      principalPointY: 0,
      focalLengthX: 1,
      focalLengthY: 1,
      skew: 0,
    },
    params: [
      { key: 'distortionX', label: 'Distortion X', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'distortionY', label: 'Distortion Y', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'principalPointX', label: 'Principal X', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'principalPointY', label: 'Principal Y', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'focalLengthX', label: 'Focal length X', type: 'number', min: 0.1, max: 2, step: 0.01 },
      { key: 'focalLengthY', label: 'Focal length Y', type: 'number', min: 0.1, max: 2, step: 0.01 },
      { key: 'skew', label: 'Skew', type: 'number', min: -1, max: 1, step: 0.01 },
    ],
  },
  tiltShift: {
    id: 'tiltShift',
    label: 'Tilt Shift',
    category: 'camera',
    libraryClass: 'TiltShiftEffect',
    defaults: {
      enabled: false,
      offset: 0,
      rotation: 0,
      focusArea: 0.4,
      feather: 0.3,
      kernelSize: 'MEDIUM',
      resolutionScale: 0.5,
    },
    params: [
      { key: 'offset', label: 'Offset', type: 'number', min: -1, max: 1, step: 0.01 },
      { key: 'rotation', label: 'Rotation', type: 'number', min: -Math.PI, max: Math.PI, step: 0.01 },
      { key: 'focusArea', label: 'Focus area', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'feather', label: 'Feather', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'kernelSize', label: 'Kernel size', type: 'enum', options: KERNEL_SIZE_OPTIONS },
      { key: 'resolutionScale', label: 'Resolution scale', type: 'number', min: 0.1, max: 1, step: 0.05 },
    ],
  },
  noise: {
    id: 'noise',
    label: 'Noise / Film Grain',
    category: 'image',
    libraryClass: 'NoiseEffect',
    defaults: { enabled: false, premultiply: false, opacity: 0.2 },
    params: [
      { key: 'premultiply', label: 'Premultiply', type: 'boolean' },
      { key: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  pixelation: {
    id: 'pixelation',
    label: 'Pixelation',
    category: 'image',
    libraryClass: 'PixelationEffect',
    defaults: { enabled: false, granularity: 30 },
    params: [
      { key: 'granularity', label: 'Granularity', type: 'number', min: 1, max: 200, step: 1 },
    ],
  },
  dotScreen: {
    id: 'dotScreen',
    label: 'Dot Screen',
    category: 'image',
    libraryClass: 'DotScreenEffect',
    defaults: { enabled: false, angle: 1.57, scale: 1 },
    params: [
      { key: 'angle', label: 'Angle', type: 'number', min: 0, max: Math.PI, step: 0.01 },
      { key: 'scale', label: 'Scale', type: 'number', min: 0.1, max: 4, step: 0.05 },
    ],
  },
  scanlines: {
    id: 'scanlines',
    label: 'Scanlines',
    category: 'image',
    libraryClass: 'ScanlineEffect',
    defaults: { enabled: false, density: 1.25, scrollSpeed: 0 },
    params: [
      { key: 'density', label: 'Density', type: 'number', min: 0.1, max: 4, step: 0.05 },
      { key: 'scrollSpeed', label: 'Scroll speed', type: 'number', min: -2, max: 2, step: 0.01 },
    ],
  },
  grid: {
    id: 'grid',
    label: 'Grid',
    category: 'image',
    libraryClass: 'GridEffect',
    defaults: { enabled: false, scale: 1, lineWidth: 0 },
    params: [
      { key: 'scale', label: 'Scale', type: 'number', min: 0.1, max: 4, step: 0.05 },
      { key: 'lineWidth', label: 'Line width', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  glitch: {
    id: 'glitch',
    label: 'Glitch',
    category: 'image',
    libraryClass: 'GlitchEffect',
    defaults: {
      enabled: false,
      mode: 'SPORADIC',
      minDelay: 0.5,
      maxDelay: 1,
      minDuration: 0.05,
      maxDuration: 0.2,
      minStrength: 0.05,
      maxStrength: 0.2,
      columns: 0.05,
      ratio: 0.85,
    },
    params: [
      { key: 'mode', label: 'Mode', type: 'enum', options: GLITCH_MODE_OPTIONS },
      { key: 'minDelay', label: 'Min delay', type: 'number', min: 0, max: 5, step: 0.05 },
      { key: 'maxDelay', label: 'Max delay', type: 'number', min: 0, max: 5, step: 0.05 },
      { key: 'minDuration', label: 'Min duration', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'maxDuration', label: 'Max duration', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'minStrength', label: 'Min strength', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'maxStrength', label: 'Max strength', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'columns', label: 'Columns', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'ratio', label: 'Ratio', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
  },
  outline: {
    id: 'outline',
    label: 'Outline',
    category: 'image',
    libraryClass: 'OutlineEffect',
    requires: ['actorIds'],
    defaults: {
      enabled: false,
      actorIds: [],
      edgeStrength: 3,
      visibleEdgeColor: '#ffffff',
      hiddenEdgeColor: '#22090a',
      pulseSpeed: 0,
      xRay: true,
      blur: false,
      kernelSize: 'VERY_SMALL',
      multisampling: 0,
      resolutionScale: 0.5,
    },
    params: [
      { key: 'actorIds', label: 'Outline actors', type: 'actorIds' },
      { key: 'edgeStrength', label: 'Edge strength', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'visibleEdgeColor', label: 'Visible edge', type: 'color' },
      { key: 'hiddenEdgeColor', label: 'Hidden edge', type: 'color' },
      { key: 'pulseSpeed', label: 'Pulse speed', type: 'number', min: 0, max: 5, step: 0.05 },
      { key: 'xRay', label: 'X-ray', type: 'boolean' },
      { key: 'blur', label: 'Blur', type: 'boolean' },
      { key: 'kernelSize', label: 'Kernel size', type: 'enum', options: KERNEL_SIZE_OPTIONS },
      { key: 'multisampling', label: 'Multisampling', type: 'number', min: 0, max: 8, step: 1 },
      { key: 'resolutionScale', label: 'Resolution scale', type: 'number', min: 0.1, max: 1, step: 0.05 },
    ],
  },
  textureOverlay: {
    id: 'textureOverlay',
    label: 'Texture Overlay',
    category: 'image',
    libraryClass: 'TextureEffect',
    requires: ['textureAssetId'],
    defaults: {
      enabled: false,
      textureAssetId: null,
      aspectCorrection: false,
    },
    params: [
      { key: 'textureAssetId', label: 'Texture', type: 'textureAssetId' },
      { key: 'aspectCorrection', label: 'Aspect correction', type: 'boolean' },
    ],
  },
  shockWave: {
    id: 'shockWave',
    label: 'Shock Wave',
    category: 'image',
    libraryClass: 'ShockWaveEffect',
    requires: ['epicenter'],
    defaults: {
      enabled: false,
      epicenter: { x: 0, y: 100, z: 0 },
      speed: 2,
      maxRadius: 1,
      waveSize: 0.2,
      amplitude: 0.05,
    },
    params: [
      { key: 'epicenter', label: 'Epicenter (editor units)', type: 'vec3' },
      { key: 'speed', label: 'Speed', type: 'number', min: 0, max: 10, step: 0.05 },
      { key: 'maxRadius', label: 'Max radius', type: 'number', min: 0, max: 5, step: 0.05 },
      { key: 'waveSize', label: 'Wave size', type: 'number', min: 0, max: 2, step: 0.01 },
      { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0, max: 1, step: 0.005 },
    ],
  },
};

export function getEffectDefinition(id) {
  return EFFECT_DEFINITIONS[id] || null;
}

export function createDefaultEffectState(id) {
  const def = EFFECT_DEFINITIONS[id];
  if (!def) return null;
  return structuredClone(def.defaults);
}

/**
 * Whether an enabled effect has all required inputs to run.
 * @param {string} id
 * @param {object} effectState
 */
export function effectInputsReady(id, effectState) {
  const def = EFFECT_DEFINITIONS[id];
  if (!def?.requires?.length) return true;
  const state = effectState || {};
  for (const req of def.requires) {
    if (req === 'actorIds') {
      if (!Array.isArray(state.actorIds) || state.actorIds.length === 0) return false;
    } else if (req === 'lightActorId') {
      if (!state.lightActorId) return false;
    } else if (req === 'textureAssetId') {
      if (!state.textureAssetId) return false;
    } else if (req === 'epicenter') {
      const e = state.epicenter;
      if (!e || ![e.x, e.y, e.z].every((n) => Number.isFinite(Number(n)))) return false;
    }
  }
  return true;
}
