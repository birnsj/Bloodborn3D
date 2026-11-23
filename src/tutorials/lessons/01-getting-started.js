export const gettingStartedLesson = {
  id: 'getting-started',
  title: 'Getting Started',
  summary: 'Look around, select objects, find the main panels, and learn how saving works.',
  order: 1,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to the Level Editor',
      body: 'You are in a safe practice room. Your real project level is paused in the background and will come back when you Exit.',
      terms: [
        { term: 'Level', def: 'A room or space you are building — saved as a .json file.' },
        { term: 'Viewport', def: 'The 3D window in the center where you see and click objects.' },
      ],
      highlight: ['panel.tutorials'],
      verify: { type: 'manualConfirm', label: 'I am ready' },
    },
    {
      id: 'orbit',
      title: 'Look around',
      body: 'In the Viewport: hold right mouse and drag to orbit. Press WASD to free-fly (Q/E up/down, Shift faster); while flying, RMB freelooks instead of orbiting. Middle-mouse pans; scroll zooms.',
      explain: 'This only moves the camera, not objects. Left-click selects things later. In Play mode, click the viewport first, then WASD walks with physics.',
      highlight: [],
      verify: { type: 'manualConfirm', label: 'I looked around' },
      failHint: 'Orbit with right mouse, then try WASD to free-fly, then confirm.',
    },
    {
      id: 'select-wall',
      title: 'Select the Practice Wall',
      body: 'Left-click the tall wall in the Viewport, or click “Practice Wall” in the Scene Outliner on the left.',
      terms: [
        { term: 'Actor', def: 'Any object in the level (walls, lights, furniture, etc.).' },
      ],
      highlight: ['panel.outliner'],
      verify: { type: 'actorSelected', nameIncludes: 'Wall', hasBrush: true, trackAs: 'wall' },
      failHint: 'Click the Practice Wall until it highlights.',
    },
    {
      id: 'open-details',
      title: 'Read Details',
      body: 'With the wall selected, look at the Details panel on the right. You will see Position, Size, and other properties.',
      terms: [
        { term: 'Details', def: 'The inspector panel showing properties of the selected object.' },
      ],
      highlight: ['panel.details'],
      verify: { type: 'manualConfirm', label: 'I found Details' },
    },
    {
      id: 'save-note',
      title: 'Saving during tutorials',
      body: 'If you press Save now, the editor will ask for a NEW filename. It will not overwrite your project level. You can also Exit to restore your previous level unchanged.',
      highlight: ['toolbar.save'],
      verify: { type: 'manualConfirm', label: 'Got it' },
      explain: 'When you finish a tutorial, use Exit — or Save and choose a name like my-practice-room.json to keep your work.',
    },
  ],
};
