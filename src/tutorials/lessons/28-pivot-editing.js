export const pivotEditingLesson = {
  id: 'pivot-editing',
  title: 'Pivot Editing',
  summary: 'Move an actor’s transformation origin without moving geometry, collision, or children.',
  order: 28,
  starterPath: 'tutorials/28-pivot-editing.json',
  steps: [
    {
      id: 'enter-pivot',
      title: 'Enter Pivot Edit',
      body: 'Select a mesh, primitive, or brush. Press P or click Pivot on the level toolbar. The translation gizmo now moves the actor origin (pivot), not the whole object.',
      highlight: 'toolbar.pivotEdit',
      verify: { type: 'always' },
    },
    {
      id: 'hinge-door',
      title: 'Hinge a door',
      body: 'Select Door (hinge pivot). Use Details → Pivot presets (−X) or drag the gizmo. Rotate with E — the door swings around the hinge while geometry stays put.',
      highlight: 'details.pivot',
      verify: { type: 'always' },
    },
    {
      id: 'furniture-bottom',
      title: 'Furniture bottom center',
      body: 'Select Table (bottom pivot). Presets → Bottom. Scale and rotate around the floor contact point.',
      highlight: 'details.pivot',
      verify: { type: 'always' },
    },
    {
      id: 'space-snap',
      title: 'Local / World and snap',
      body: 'Toggle Local vs World on the toolbar for gizmo axes. Grid snap and axis constraints still apply. Escape cancels an in-progress pivot drag.',
      highlight: 'toolbar.gizmoSpace',
      verify: { type: 'always' },
    },
    {
      id: 'asset-default',
      title: 'Asset default pivot',
      body: 'In Asset Viewer → Mesh Tools, set a default placement pivot (Bottom / Center / numeric). New placements use it; existing actors do not jump. Source files stay intact.',
      highlight: 'assetViewer.pivot',
      verify: { type: 'always' },
    },
  ],
};
