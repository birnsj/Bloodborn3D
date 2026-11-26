export const environmentalObjectsLesson = {
  id: 'environmental-objects',
  title: 'Environmental objects',
  summary: 'Place water, mirrors, refractors, decals, billboards, and a Sky actor.',
  order: 24,
  starterPath: 'tutorials/environmental-objects.json',
  steps: [
    {
      id: 'open-env',
      title: 'Open the Environment toolbar',
      body: 'Use Creation → Environment for Water 2, Water, Mirror, Refractor, Decal, Billboard, and Sky.',
      highlight: 'creation.environment',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'water',
      title: 'Place flowing water',
      body: 'Drop Water 2 on a floor. Edit flow speed, reflectivity, and RT resolution in Details. Ortho panes show a proxy plane.',
      highlight: 'toolbar.water2',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'mirror',
      title: 'Add a mirror',
      body: 'Place a Mirror on a wall. Move the perspective camera and confirm the reflection updates. Nested mirror recursion is blocked.',
      highlight: 'toolbar.reflector',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'decal',
      title: 'Project a decal',
      body: 'Place a Decal, set Target actor to a brush or static mesh, assign a texture. Geometry regenerates when the target rebuilds.',
      highlight: 'toolbar.decal',
      verify: { type: 'manualConfirm' },
    },
    {
      id: 'billboard-sky',
      title: 'Billboard and placeable Sky',
      body: 'Billboards are authored Sprites (not editor helpers). A placeable Sky suppresses the World Settings sky mesh while present.',
      highlight: 'details.environment.sky',
      verify: { type: 'manualConfirm' },
    },
  ],
};
