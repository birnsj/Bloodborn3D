/**
 * Structured keyboard shortcut catalog for Help → Keyboard Shortcuts.
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
      { keys: ['Ctrl', 'Z'], action: 'Undo' },
      { keys: ['Ctrl', 'Y'], action: 'Redo', note: 'or Ctrl+Shift+Z' },
      { keys: ['Ctrl', 'A'], action: 'Select all' },
      { keys: ['Esc'], action: 'Deselect', note: 'cancels placement if active' },
      { keys: ['Ctrl', 'D'], action: 'Duplicate' },
      { keys: ['Delete'], action: 'Delete', note: 'or Backspace' },
      { keys: ['Ctrl', 'LMB'], action: 'Multi-select toggle' },
    ],
  },
  {
    id: 'transform',
    title: 'Transform',
    rows: [
      { keys: ['W'], action: 'Move' },
      { keys: ['E'], action: 'Rotate' },
      { keys: ['R'], action: 'Scale', note: 'brush faces · or actor scale' },
      { keys: ['F'], action: 'Focus selection' },
    ],
  },
  {
    id: 'grid',
    title: 'Grid',
    rows: [
      { keys: ['['], action: 'Smaller grid' },
      { keys: [']'], action: 'Larger grid' },
      { keys: ['Shift', 'G'], action: 'Toggle snap' },
      { keys: ['Alt'], action: 'Fine snap while dragging' },
    ],
  },
  {
    id: 'placement',
    title: 'Placement',
    rows: [
      { keys: ['Esc'], action: 'Cancel place / close tools' },
      { keys: ['Tab'], action: 'Cycle target surface' },
    ],
  },
  {
    id: 'camera',
    title: 'Camera',
    rows: [
      { keys: ['WASD'], action: 'Fly', note: 'W also selects Move' },
      { keys: ['Q', 'E'], action: 'Down / up', note: 'E also selects Rotate' },
      { keys: ['Shift'], action: 'Fly boost' },
      { keys: ['RMB'], action: 'Orbit / freelook' },
      { keys: ['MMB'], action: 'Pan' },
      { keys: ['Wheel'], action: 'Zoom' },
    ],
  },
  {
    id: 'play',
    title: 'Play',
    rows: [
      { keys: ['WASD'], action: 'Move' },
      { keys: ['Mouse'], action: 'Look', note: 'click viewport to capture' },
      { keys: ['Space'], action: 'Jump' },
      { keys: ['Esc'], action: 'Release mouse' },
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
