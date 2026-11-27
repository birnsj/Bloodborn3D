import { describe, expect, it } from 'vitest';
import { isQuietStatusMessage, toneForMessage } from '../ui/dialogs/EditorDialogContext.jsx';
import { reportEditorMessage } from '../ui/dialogs/reportEditorMessage.js';

describe('editor dialog helpers', () => {
  it('treats high-frequency status as quiet', () => {
    expect(isQuietStatusMessage('Ready')).toBe(true);
    expect(isQuietStatusMessage('Edited')).toBe(true);
    expect(isQuietStatusMessage('Undo: Edit size')).toBe(true);
    expect(isQuietStatusMessage('Loading test-room.json…')).toBe(true);
    expect(isQuietStatusMessage('Moved Custom before Textures')).toBe(true);
    expect(isQuietStatusMessage('Created folder Props')).toBe(true);
    expect(isQuietStatusMessage('Saved test-room.json')).toBe(false);
    expect(isQuietStatusMessage('Prefab create failed')).toBe(false);
  });

  it('picks tone from message text', () => {
    expect(toneForMessage('Prefab create failed')).toBe('danger');
    expect(toneForMessage('Stop Play before saving')).toBe('warning');
    expect(toneForMessage('Saved level')).toBe('default');
  });

  it('reportEditorMessage updates status and can open a dialog', async () => {
    const statuses = [];
    const alerts = [];
    reportEditorMessage(
      (m) => statuses.push(m),
      { alert: async (m, opts) => { alerts.push({ m, opts }); } },
      'Saved level.json',
      { dialog: true },
    );
    expect(statuses).toEqual(['Saved level.json']);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].m).toBe('Saved level.json');
  });

  it('reportEditorMessage can stay status-only', () => {
    const statuses = [];
    const alerts = [];
    reportEditorMessage(
      (m) => statuses.push(m),
      { alert: async (m) => { alerts.push(m); } },
      'Edited',
      { dialog: false },
    );
    expect(statuses).toEqual(['Edited']);
    expect(alerts).toHaveLength(0);
  });
});
