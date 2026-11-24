export const subtractiveGeometryLesson = {
  id: 'subtractive-geometry',
  title: 'Subtractive Geometry',
  summary:
    'World Solid is invisible substrate; subtract boxes carve rooms (the room is the inside of the cutter). Also cut openings through additive walls.',
  order: 3.5,
  starterPath: 'tutorials/subtract.json',
  steps: [
    {
      id: 'intro',
      title: 'Solid substrate + cutters',
      body:
        'Think Unreal subtractive: space starts solid. A Subtract box removes volume — the inside of that box is the room (air). Walls, floor, and ceiling are the cut faces of the solid around it. Textures live on the solid, not on the crimson cutter.',
      terms: [
        {
          term: 'World Solid',
          def: 'On a Subtractive map (File → New Map…), a locked invisible additive brush fills the level. Outer hull stays hidden; you see faces opened by cuts.',
        },
        {
          term: 'Subtract box',
          def: 'A crimson cutter (Edit only). Its interior is empty space. It is not a wall mesh and has no collision of its own.',
        },
        {
          term: 'Additive brush',
          def: 'Solid structural geometry (operation Add). World Solid is one; walls and boxes you place are others.',
        },
      ],
      verify: { type: 'manualConfirm', label: 'Got it' },
    },
    {
      id: 'map-modes',
      title: 'Additive vs Subtractive maps',
      body:
        'File → New Map… chooses map mode. Additive starts empty — you add brushes to build. Subtractive seeds World Solid so structural tools carve rooms. Mode shows in Details → Level and the status bar.',
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'select-wall',
      title: 'Find the wall',
      body:
        'This practice level uses an additive wall (same carve rules as World Solid). Select “Wall To Carve” in the Viewport or Outliner — you will cut a hole through it.',
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
        'Click Subtract on the toolbar, then drag so the crimson box crosses the wall. The cutter’s volume is the opening (air). Move or resize with the gizmo — the hole updates live.',
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
        'Overlap the wall with the cutter until you see a hole in the wall mesh. The crimson box is the void; the textured mesh around it is leftover solid.',
      verify: {
        type: 'brushCarved',
        trackAs: 'wall',
        byCutter: 'cutter',
      },
      failHint: 'Move or resize the Subtract Box so it overlaps Wall To Carve.',
    },
  ],
};
