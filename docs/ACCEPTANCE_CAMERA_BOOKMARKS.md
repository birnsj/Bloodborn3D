# Acceptance — Camera bookmarks

Numbered camera bookmarks for the active viewport pane, stored on the level.

## Behaviour

- **Ctrl+1–9** (or Cmd+1–9) stores the active pane’s camera mode, position, orbit target, and ortho frustum on `world.cameraBookmarks` (undoable; marks the level dirty).
- **1–9** restores that bookmark onto the active pane (also switches camera mode if needed).
- Empty slots status: `No camera bookmark N — Ctrl+N to set`.
- Serialized into the level JSON as optional `cameraBookmarks` (omitted when empty). No schema bump. Not used by the standalone player.
- Legacy `localStorage` bookmarks still recall until the level gains its own slots; storing a bookmark clears the legacy store.
- Ignored while focus is in inputs / contenteditable. Numpad 1–9 counts. Disabled in Play.

## Verify

- Automated: `cameraBookmarks.test.js` (normalize, serialize omit-when-empty, round-trip, undo command, legacy fallback); Help content `viewport.cameraBookmarks`; Keyboard Shortcuts Camera rows; Academy steps in Getting Started + Workspace & Viewports (also covered by Academy **Tour all**).
- Manual: fly somewhere → Ctrl+3 → Save → reload level → 3 returns to the stored view; Undo after Ctrl+3 removes the slot; Academy catalog shows the bookmark steps.
