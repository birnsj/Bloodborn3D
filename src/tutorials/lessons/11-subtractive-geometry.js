export const subtractiveGeometryLesson = {
  id: 'subtractive-geometry',
  title: 'Subtractive Geometry',
  summary: 'Carve openings through walls with editable subtractive brushes — without destroying the original solids.',
  order: 3.5,
  starterPath: 'tutorials/subtract.json',
  steps: [
    {
      id: 'intro',
      title: 'Add vs Subtract',
      body:
        'Additive brushes build solid structure (floors, walls, boxes). Subtractive brushes are cutters: where they overlap additive brushes, that volume is removed. The original brush actors stay editable — this is non-destructive carving.',
      terms: [
        {
          term: 'Additive brush',
          def: 'A solid structural brush (operation Add). It contributes geometry and collision.',
        },
        {
          term: 'Subtractive brush',
          def: 'A cutter brush (operation Subtract). It removes overlapping additive volume and never creates its own colliders.',
        },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'select-wall',
      title: 'Find the wall',
      body: 'Select “Wall To Carve” in the Viewport or Outliner. This is an additive brush you will cut through.',
      verify: {
        type: 'actorSelected',
        nameIncludes: 'Wall',
        hasBrush: true,
        trackAs: 'wall',
      },
    },
    {
      id: 'place-cutter',
      title: 'Place a Subtract Box',
      body:
        'Click Subtract on the toolbar, then drag on the grid so the crimson box crosses the wall. After placing, you can move or resize it with the gizmo — the opening updates live.',
      highlight: ['toolbar.subtract'],
      verify: {
        type: 'brushCreated',
        operation: 'subtract',
        trackAs: 'cutter',
      },
      failHint: 'Use the Subtract toolbar tool and drag a box that overlaps the wall.',
    },
    {
      id: 'verify-carve',
      title: 'Confirm the opening',
      body:
        'Make sure the subtractive brush intersects the wall. You should see a hole in the wall mesh. Adjust the cutter with Move/Resize if needed until the opening is visible.',
      verify: {
        type: 'brushCarved',
        trackAs: 'wall',
        byCutter: 'cutter',
      },
      failHint: 'Move or resize the Subtract Box so it overlaps Wall To Carve.',
    },
  ],
};
