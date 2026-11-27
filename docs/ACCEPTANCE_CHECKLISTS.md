# Acceptance — Editor project + level checklists

Editor-only to-do lists (not level JSON, not player).

## Behaviour

- Level toolbar **Checklist** toggles a floating panel (next to Note / Show).
- Tabs: **Project** (whole workspace) and **Level** (keyed by open level filename).
- Add / check / edit / delete items. Drag the panel header to move.
- Persisted in `.editor-local/checklists.json` via localhost `/api/checklists` (localStorage fallback). The file is **tracked in git** with the project.
- Hidden in Play. Not present in the standalone player.
- Today there is one project (this workspace); File lists levels inside it. Multi-project can namespace later.

## Verify

- Automated: `checklists.test.js`; hoverHelp coverage for `checklists.*` ids.
- Manual: Checklist → add project + level tasks → switch level (level list swaps, project stays) → Play hides panel → Stop restores → refresh keeps data.
