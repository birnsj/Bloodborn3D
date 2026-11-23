export const ceilingsMultilevelLesson = {
  id: 'ceilings-multilevel',
  title: 'Ceilings and Upper Floors',
  summary: 'Cap rooms with ceilings and stack another floor for multistory spaces.',
  order: 11.5,
  starterPath: 'tutorials/multilevel.json',
  steps: [
    {
      id: 'intro',
      title: 'Going vertical',
      body: 'Floors and ceilings are both thin structural slabs. Ceilings sit at wall-module height by default. Move any slab on Y to build additional stories.',
      terms: [
        { term: 'Ceiling', def: 'A floor-like brush placed at room height to cap a space.' },
        { term: 'Upper floor', def: 'Another floor slab raised above the ground story.' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'place-ceiling',
      title: 'Place a ceiling',
      body: 'Click Ceiling in the toolbar and drag over the ground floor. The slab appears at standard wall height.',
      highlight: ['toolbar.ceiling'],
      verify: { type: 'brushCreated', kind: 'ceiling', trackAs: 'ceiling1' },
      failHint: 'Use the Ceiling tool and drag a footprint in the viewport.',
    },
    {
      id: 'upper-floor',
      title: 'Add an upper floor',
      body: 'Create another Floor, then raise it with the Y move gizmo (or Details position) so it sits above the ceiling.',
      highlight: ['toolbar.floor'],
      verify: { type: 'brushCreated', kind: 'floor', trackAs: 'upperFloor' },
      failHint: 'Create a new Floor brush (in addition to the starter ground floor).',
    },
  ],
};
