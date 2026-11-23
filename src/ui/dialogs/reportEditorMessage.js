import { isQuietStatusMessage } from './EditorDialogContext.jsx';

/**
 * Update the toolbar/status string and, for non-quiet messages, show an editor dialog.
 * Pass `{ dialog: false }` to status-bar only, or `{ dialog: true }` to force a dialog.
 */
export function reportEditorMessage(setStatus, dialogs, message, options = {}) {
  const msg = String(message ?? '');
  setStatus(msg);
  if (!msg || !dialogs?.alert) return;
  if (options.dialog === false) return;
  if (options.dialog === true || !isQuietStatusMessage(msg)) {
    void dialogs.alert(msg, {
      title: options.title,
      tone: options.tone,
    });
  }
}
