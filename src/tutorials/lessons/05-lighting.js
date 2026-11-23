export const lightingLesson = {
  id: 'lighting',
  title: 'Lighting',
  summary: 'Place lights and edit their properties.',
  order: 5,
  starterPath: 'tutorials/openings.json',
  steps: [
    {
      id: 'intro',
      title: 'Lights',
      body: 'Lights illuminate your room in the editor preview. You can place Point, Spot, or Directional lights from the toolbar.',
      terms: [
        { term: 'Point light', def: 'Glows outward in all directions from a point.' },
        { term: 'Spot light', def: 'A cone of light, like a flashlight.' },
        { term: 'Directional light', def: 'Parallel rays, like sunlight.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'place-point',
      title: 'Place a point light',
      body: 'Click Point Light in the toolbar. A light appears in the level — select it if needed.',
      highlight: ['toolbar.pointLight'],
      verify: { type: 'lightPlaced', lightType: 'point', trackAs: 'light1' },
      failHint: 'Click Point Light on the toolbar.',
    },
    {
      id: 'edit-light',
      title: 'Edit the light',
      body: 'With the light selected, change Intensity or Color in Details.',
      highlight: ['panel.details'],
      verify: { type: 'lightEdited', trackAs: 'light1' },
      failHint: 'Select your new light and change Intensity or Color.',
    },
  ],
};
