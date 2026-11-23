export const workspaceLesson = {
  id: 'workspace',
  title: 'Workspace',
  summary: 'Dock panels, layouts, hover help, and session recording.',
  order: 10,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'intro',
      title: 'Your workspace',
      body: 'Panels can be docked, floated, or hidden. Layouts remember arrangements. Hover Help explains buttons when you pause the cursor.',
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'hover-help',
      title: 'Hover Help',
      body: 'Ensure Help → Show Hover Help is checked. Hover a toolbar button briefly to see its tip.',
      highlight: ['toolbar.select'],
      verify: { type: 'manualConfirm', label: 'I saw a tip' },
    },
    {
      id: 'layouts',
      title: 'Layouts',
      body: 'Open Window → Layouts. You can Save Layout or reset to Default. Try floating a panel tab if you like (right-click the tab → Float).',
      verify: { type: 'manualConfirm', label: 'I explored layouts' },
    },
    {
      id: 'recording',
      title: 'Session recording (optional)',
      body: 'The Record button captures a video of your session (browser permission required). If Record is unavailable in your browser, Skip this step.',
      highlight: ['toolbar.record'],
      verify: { type: 'manualConfirm', label: 'I understand recording' },
    },
  ],
};
