export const doorsWindowsLesson = {
  id: 'doors-windows',
  title: 'Doors and Windows',
  summary: 'Cut parametric openings into walls without rebuilding geometry by hand.',
  order: 3,
  starterPath: 'tutorials/openings.json',
  steps: [
    {
      id: 'intro',
      title: 'Openings',
      body: 'An opening is a door or window cut into a wall. The wall stays one object; the hole is a parameter you can edit.',
      terms: [
        { term: 'Opening', def: 'A door or window hole defined by size and position on a wall.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'select-wall',
      title: 'Select the wall',
      body: 'Select “Wall With Opening Space” in the Viewport or Outliner.',
      verify: { type: 'actorSelected', nameIncludes: 'Wall', hasBrush: true, trackAs: 'wall' },
    },
    {
      id: 'add-door',
      title: 'Add a door',
      body: 'In Details, find Openings and click Add Door. A doorway appears in the wall.',
      highlight: ['details.openings'],
      verify: { type: 'openingAdded', trackAs: 'wall', openingType: 'door' },
      failHint: 'With the wall selected, click Add Door in Details → Openings.',
    },
    {
      id: 'add-window',
      title: 'Add a window',
      body: 'Still in Openings, click Add Window. You can edit Width, Height, and Offset for each opening.',
      highlight: ['details.openings'],
      verify: { type: 'openingAdded', trackAs: 'wall', openingType: 'window' },
      failHint: 'Add a Window opening on the same wall.',
    },
  ],
};
