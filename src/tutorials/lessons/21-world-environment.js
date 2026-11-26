export const worldEnvironmentLesson = {
  id: 'world-environment',
  title: 'World Environment',
  summary: 'Assign HDR/EXR IBL, background modes, procedural sky, grounded skybox, and light probes.',
  order: 21,
  starterPath: 'tutorials/world-environment.json',
  steps: [
    {
      id: 'intro',
      title: 'Environment lighting',
      body: 'World Settings → Scene controls background mode, HDRI/EXR environment maps (PMREM), procedural sky, grounded skybox, and optional light probes. Empty Environment map keeps the RoomEnvironment studio fallback so old levels look the same.',
      terms: [
        { term: 'Environment map', def: 'HDR/EXR asset that lights PBR materials via scene.environment.' },
        { term: 'PMREM', def: 'Prefiltered mipmapped radiance environment map — Three.js converts equirect HDR for IBL.' },
        { term: 'RoomEnvironment', def: 'Built-in soft studio IBL used when no HDR is assigned.' },
      ],
      highlight: ['world.scene.environment'],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'background-modes',
      title: 'Background modes',
      body: 'Try Background mode: Solid color, Environment, and Procedural sky. Blurriness and background rotation apply when the backdrop is the environment texture. Ortho panes stay on the dark editor clear.',
      highlight: ['world.scene.backgroundType', 'world.scene'],
      verify: { type: 'manualConfirm', label: 'I tried the modes' },
    },
    {
      id: 'hdri',
      title: 'HDRI assignment',
      body: 'This acceptance starter already references Poly Haven Studio Small 09 (CC0 HDRI). Change Environment intensity and rotation. Import another .hdr/.exr from Asset Viewer or the Scene file picker if you have one.',
      highlight: ['world.scene.environment', 'world.scene.environmentIntensity'],
      verify: { type: 'manualConfirm', label: 'I adjusted IBL' },
    },
    {
      id: 'sky-grounded',
      title: 'Sky and grounded skybox',
      body: 'Set Background mode to Procedural sky and nudge sun elevation. Optionally enable Grounded skybox (needs an env map) to project the HDR onto a ground-aware dome.',
      highlight: ['world.scene.sky', 'world.scene.groundedSkybox'],
      verify: { type: 'manualConfirm', label: 'I saw sky / grounded' },
    },
    {
      id: 'probe-renderer',
      title: 'Light probe and renderer',
      body: 'With an env map assigned, enable Light probe. In Renderer, confirm Output color space and that Shadow type lists Basic / PCF / VSM (PCF Soft is migrated to PCF). Scrub numeric World Settings — Undo/Redo restores one completed adjustment (live preview while dragging does not spam the history stack).',
      highlight: ['world.scene.lightProbe', 'world.renderer.outputColorSpace'],
      verify: { type: 'manualConfirm', label: 'Finish' },
    },
  ],
};
