export const materialsLesson = {
  id: 'materials',
  title: 'Materials and Textures',
  summary: 'Assign materials to brushes, override a face, and adjust UVs.',
  order: 4,
  starterPath: 'tutorials/openings.json',
  steps: [
    {
      id: 'intro',
      title: 'What is a material?',
      body: 'A material controls how a surface looks (color and texture). Brushes can use a shared material from the Content Browser.',
      terms: [
        { term: 'Material', def: 'A look definition (color/texture) you assign to surfaces.' },
        { term: 'UV', def: 'Controls how a texture is scaled, shifted, and rotated on a surface.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'select-wall',
      title: 'Select the wall',
      body: 'Select the wall brush.',
      verify: { type: 'actorSelected', nameIncludes: 'Wall', hasBrush: true, trackAs: 'wall' },
    },
    {
      id: 'assign-material',
      title: 'Assign Verify Wall',
      body: 'In Details → Material, choose “Verify Wall” (or drag it from Content Browser onto the selected wall).',
      highlight: ['details.material.id', 'panel.content'],
      verify: { type: 'materialAssigned', materialId: 'mat_verify_wall', trackAs: 'wall' },
      failHint: 'Assign the Verify Wall material to the selected brush.',
    },
    {
      id: 'uv-tweak',
      title: 'Adjust UVs',
      body: 'In Details, change UV Scale, Offset, or Rotation and watch the texture update on the wall.',
      highlight: ['details.material.uv'],
      verify: { type: 'uvChanged', trackAs: 'wall' },
    },
    {
      id: 'face-override',
      title: 'Override one face (optional)',
      body: 'Under Face Materials, assign a material to a single face (for example +Z). If you prefer to skip face overrides, use Skip.',
      highlight: ['details.material.id'],
      verify: { type: 'faceMaterialAssigned', trackAs: 'wall' },
      failHint: 'Set any face override in Details, or press Skip.',
    },
  ],
};
