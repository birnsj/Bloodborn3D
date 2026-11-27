/** Academy lesson 31 — sticky notes + project/level checklists. */
export const editorHelpersLesson = {
  id: 'editor-helpers',
  title: 'Sticky Notes & Checklists',
  summary: 'Editor-only sticky reminders and a notepad Checklist (project + per-level), stored under .editor-local and hidden in Play.',
  order: 31,
  starterPath: 'tutorials/getting-started.json',
  steps: [
    {
      id: 'intro',
      title: 'Authoring helpers',
      body: 'Sticky notes and the Checklist are for you while building — they are not part of the level JSON and do not appear in Play or the standalone player. Both live under `.editor-local/` and are tracked with the project in git.',
      terms: [
        { term: 'Sticky note', def: 'A colored 2D reminder you can park over the Viewport or side panels.' },
        { term: 'Checklist', def: 'A notepad with Project tasks (whole workspace) and Level tasks (current level file).' },
      ],
      verify: { type: 'manualConfirm', label: 'Continue' },
    },
    {
      id: 'sticky-note',
      title: 'Add a sticky note',
      body: 'On the Level toolbar, click Note (next to Reset Views). Drag the note’s header to move it — it can sit over Outliner, Content Browser, or Details. Drag the bottom-right corner to resize. Use the color swatches or × to delete. The Show checkbox hides all notes without deleting them.',
      highlight: ['stickyNotes.add', 'stickyNotes.visible'],
      verify: { type: 'manualConfirm', label: 'I added a note' },
      failHint: 'Click Note on the Level toolbar (unavailable during Play).',
    },
    {
      id: 'checklist',
      title: 'Open the Checklist',
      body: 'Click Checklist on the Level toolbar. The white notepad has Project and Level tabs. Add a project task and a level task, then switch levels later to see the Level list change while Project stays put. Drag the notepad header to move it; drag the bottom-right corner to resize (bigger shows more); close with × or toggle Checklist again.',
      highlight: ['checklists.toggle', 'checklists.panel', 'checklists.add', 'checklists.scale'],
      verify: { type: 'manualConfirm', label: 'I used the Checklist' },
      explain: 'Play hides both helpers. Stop Play to see them again if they were open.',
    },
  ],
};
