export const lightingAdvancedLesson = {
  id: 'lighting-advanced',
  title: 'Advanced Lighting',
  summary: 'Hemisphere and Rect Area lights, shadow bias/camera, spot targets and gobos, and lens flares.',
  order: 23,
  starterPath: 'tutorials/materials-shading.json',
  steps: [
    {
      id: 'intro',
      title: 'More light types',
      body: 'Batch 3 adds Hemisphere (sky/ground), Rect Area (soft panel, no shadows), and Ambient to the Lights toolbar. Point, Spot, and Directional keep their previous look by default.',
      terms: [
        { term: 'HemisphereLight', def: 'Sky and ground colors blend by surface normal — soft outdoor fill.' },
        { term: 'RectAreaLight', def: 'Rectangular area light. Needs MeshStandard/Physical; does not cast shadows.' },
      ],
      highlight: ['creation.lights', 'toolbar.hemiLight'],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'shadows',
      title: 'Shadow controls',
      body: 'Select a Point, Spot, or Directional light. Details → Shadows exposes bias, normal bias, radius (PCF/VSM), camera near/far, and directional ortho size. Scrubbing records one Undo entry per finished adjustment.',
      highlight: ['details.light.shadowBias', 'panel.details'],
      verify: { type: 'manualConfirm', label: 'I saw shadow controls' },
    },
    {
      id: 'spot-target',
      title: 'Spot aim and gobo',
      body: 'Spot lights can Aim at Actor and use a Projection Map (cookie/gobo). Open acceptance-lighting.json for a gobo example aimed at the metal pillar.',
      highlight: ['details.light.target', 'details.light.spotMap'],
      verify: { type: 'manualConfirm', label: 'Understood' },
    },
    {
      id: 'lensflare',
      title: 'Lensflare',
      body: 'Enable Lensflare on a Point or Spot and pick a Soft/Bright preset. Flares use local CC0 textures and hide in orthographic panes. Verify with Fog/PP on and multi-pane layouts.',
      highlight: ['details.light.lensflare'],
      verify: { type: 'manualConfirm', label: 'Finish' },
    },
  ],
};
