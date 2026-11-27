/**
 * Structured keyboard shortcut catalog for Help → Keyboard Shortcuts.
 * Keep in sync with Viewport.jsx keydown / fly / play handlers.
 */

/** @typedef {{ keys: string[], action: string, note?: string }} ShortcutRow */
/** @typedef {{ id: string, title: string, rows: ShortcutRow[] }} ShortcutSection */

/** @type {ShortcutSection[]} */
export const KEYBOARD_SHORTCUT_SECTIONS = [
  {
    id: 'edit',
    title: 'Edit',
    rows: [
      { keys: ['Ctrl', 'S'], action: 'Save level' },
      { keys: ['Ctrl', 'Shift', 'S'], action: 'Save All', note: 'level + dirty materials' },
      { keys: ['Ctrl', 'Z'], action: 'Undo' },
      { keys: ['Ctrl', 'Y'], action: 'Redo', note: 'or Ctrl+Shift+Z' },
      { keys: ['Ctrl', 'A'], action: 'Select all' },
      { keys: ['Ctrl', 'D'], action: 'Duplicate' },
      { keys: ['Delete'], action: 'Delete', note: 'or Backspace' },
      {
        keys: ['Esc'],
        action: 'Cancel / deselect',
        note: 'clip → place → face-move → leave Align/Surface/Geometry → clear selection',
      },
      { keys: ['Ctrl', 'LMB'], action: 'Multi-select toggle', note: 'also Shift+LMB' },
      { keys: ['LMB drag'], action: 'Marquee select', note: 'empty viewport space' },
    ],
  },
  {
    id: 'transform',
    title: 'Transform',
    rows: [
      { keys: ['W'], action: 'Move', note: 'also starts free-fly when held with A/S/D' },
      { keys: ['E'], action: 'Rotate', note: 'fly-up only while already free-flying (WASD)' },
      { keys: ['R'], action: 'Scale', note: 'again toggles face-resize ↔ Unreal axis gizmo' },
      { keys: ['F'], action: 'Focus selection', note: 'frames selection · pane Reset = home zoom' },
      { keys: ['Alt', 'LMB'], action: 'Duplicate + drag', note: 'Move / Rotate / Scale · stays on grid snap' },
      { keys: ['Alt'], action: 'While dragging', note: 'fine move / free rotate·scale (not during Alt-duplicate)' },
    ],
  },
  {
    id: 'geometry',
    title: 'Geometry / Clip',
    rows: [
      { keys: ['Alt'], action: 'X-ray pick', note: 'Edge / Vertex through occluders' },
      { keys: ['Shift', 'LMB'], action: 'Add to geo selection', note: 'or Ctrl+LMB' },
      { keys: ['Enter'], action: 'Commit clip', note: 'when a clip plane is ready' },
      { keys: ['Esc'], action: 'Cancel clip / leave Geometry' },
    ],
  },
  {
    id: 'grid',
    title: 'Grid',
    rows: [
      { keys: ['['], action: 'Smaller grid' },
      { keys: [']'], action: 'Larger grid' },
      { keys: ['G'], action: 'Game View', note: 'hide light icons, grid, gizmos (Unreal-style)' },
      { keys: ['Shift', 'G'], action: 'Toggle snap' },
      { keys: ['Alt'], action: 'Fine snap while dragging', note: '1 editor unit on gizmo' },
    ],
  },
  {
    id: 'placement',
    title: 'Placement',
    rows: [
      { keys: ['Esc'], action: 'Cancel place / close tool rollout' },
      { keys: ['Tab'], action: 'Cycle target surface', note: 'while dragging a place preview' },
    ],
  },
  {
    id: 'camera',
    title: 'Camera',
    rows: [
      { keys: ['WASD'], action: 'Free-fly', note: 'perspective · mouse looks while held · W also selects Move' },
      { keys: ['Q', 'E'], action: 'Fly down / up', note: 'only while free-flying · tap E alone = Rotate' },
      { keys: ['Shift'], action: 'Fly boost' },
      { keys: ['RMB'], action: 'Look (perspective)', note: 'drag while held' },
      { keys: ['Ctrl'], action: 'Orbit (perspective)', note: 'hold + move mouse · no button · ortho: RMB' },
      { keys: ['MMB'], action: 'Pan', note: 'speed in Edit → Settings' },
      { keys: ['Wheel'], action: 'Zoom', note: 'ortho zooms frustum' },
      { keys: ['Space'], action: 'Maximize active pane', note: 'toggle · multi-view only · Play uses Space to jump' },
      { keys: ['Ctrl', '1–9'], action: 'Store camera bookmark', note: 'active pane · saved with the level · undoable' },
      { keys: ['1–9'], action: 'Go to camera bookmark', note: 'restores stored pose + camera mode' },
    ],
  },
  {
    id: 'play',
    title: 'Play',
    rows: [
      { keys: ['WASD'], action: 'Move' },
      { keys: ['Mouse'], action: 'Look', note: 'click viewport to capture' },
      { keys: ['Space'], action: 'Jump' },
      { keys: ['Esc'], action: 'Stop Play' },
    ],
  },
  {
    id: 'contentBrowser',
    title: 'Content Browser',
    rows: [
      {
        keys: ['Shift', 'LMB'],
        action: 'Range-select folders',
        note: 'from last anchor · Ctrl/Cmd toggles · Alt removes',
      },
      {
        keys: ['RMB'],
        action: 'Folder / category menu',
        note: 'New Subfolder · Category · Icon Color · Duplicate · Rename · Delete · Move',
      },
      {
        keys: ['RMB'],
        action: 'Empty-space menu',
        note: 'New Folder · Add Category',
      },
      {
        keys: ['Drag'],
        action: 'Nest or reorder',
        note: 'middle = nest into · top/bottom insert line = place beside',
      },
      {
        keys: ['RMB'],
        action: 'Asset → Move To Folder',
        note: 'in Asset Viewer · registry path only, files stay put',
      },
    ],
  },
  {
    id: 'outliner',
    title: 'Scene Outliner',
    rows: [
      {
        keys: ['Drag'],
        action: 'Reparent / reorder',
        note: 'middle = parent under · top/bottom = beside · drop on Category to section',
      },
      {
        keys: ['RMB'],
        action: 'Actor / category menu',
        note: 'Icon Color · rename category · delete category header only',
      },
    ],
  },
  {
    id: 'editorHelpers',
    title: 'Editor helpers',
    rows: [
      {
        keys: ['Note'],
        action: 'Add sticky note',
        note: 'Level toolbar · drag header · Show toggles visibility · .editor-local',
      },
      {
        keys: ['Checklist'],
        action: 'Project / level to-dos',
        note: 'Level toolbar · Project + Level tabs · notepad panel · .editor-local',
      },
    ],
  },
  {
    id: 'projectArt',
    title: 'Project Art Library',
    rows: [
      {
        keys: ['Ctrl', 'A'],
        action: 'Select all visible files',
        note: 'gallery focused · not folders',
      },
      {
        keys: ['Ctrl', 'LMB'],
        action: 'Toggle file in selection',
        note: 'also Cmd on macOS',
      },
      {
        keys: ['Shift', 'LMB'],
        action: 'Range-select files',
        note: 'from last anchor',
      },
      {
        keys: ['Esc'],
        action: 'Clear gallery selection',
        note: 'when focus is not in an input',
      },
    ],
  },
];

/** Plain-text fallback (hover help / tests). */
export function formatKeyboardShortcutsText(sections = KEYBOARD_SHORTCUT_SECTIONS) {
  return sections.map((section) => {
    const lines = section.rows.map((row) => {
      const keys = row.keys.join('+');
      const pad = keys.padEnd(16, ' ');
      const note = row.note ? ` (${row.note})` : '';
      return `  ${pad}${row.action}${note}`;
    });
    return `${section.title}\n${lines.join('\n')}`;
  }).join('\n\n');
}

export const KEYBOARD_SHORTCUTS_TEXT = formatKeyboardShortcutsText();
