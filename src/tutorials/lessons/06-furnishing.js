export const furnishingLesson = {
  id: 'furnishing',
  title: 'Furnishing',
  summary: 'Place a mesh from the Content Browser and set collision.',
  order: 6,
  starterPath: 'tutorials/openings.json',
  steps: [
    {
      id: 'intro',
      title: 'Meshes',
      body: 'A mesh is a 3D model (furniture, props). BloodBound ships with a practice asset called Verify Cube.',
      terms: [
        { term: 'Mesh', def: 'A 3D model placed in the level (not a brush).' },
        { term: 'Collision', def: 'The invisible shape used for physics so you can bump into objects in Play.' },
      ],
      highlight: ['panel.content'],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'place-cube',
      title: 'Place Verify Cube',
      body: 'Open Content Browser → Meshes. Drag “Verify Cube” into the Viewport.',
      highlight: ['panel.content'],
      verify: { type: 'meshPlaced', meshId: 'mesh_verify_cube', trackAs: 'prop1' },
      failHint: 'Drag Verify Cube from Content Browser into the Viewport.',
    },
    {
      id: 'collision',
      title: 'Set collision to Box',
      body: 'Select the cube. In Details → Static Mesh, set Collision to Box.',
      highlight: ['panel.details'],
      verify: { type: 'meshCollision', trackAs: 'prop1', collision: 'box' },
      failHint: 'Select the mesh and set Collision to box.',
    },
    {
      id: 'import-note',
      title: 'Importing your own models',
      body: 'In this prototype, Import Mesh works while running the editor with npm run dev. You can skip this step if you are not importing files.',
      verify: { type: 'manualConfirm', label: 'Understood' },
    },
  ],
};
