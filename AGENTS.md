# AGENTS.md — BloodBound3D

This is **BloodBound3D**, a browser-based game-production suite (Three.js + Rapier + React).
Ignore any global rules about other projects (e.g. a Star Trek character creator); they do not apply here.
Read `docs/MISSION.md` first. It defines what we are building and what we are not.

## Authority

The designer decides scope, sequence and design. Do not start a new phase or workspace (Phase 2G, World Map,
Characters, Animation, Visual Scripting, Dialogue, UI Editor) without explicit approval. If something is
undefined, say so and ask instead of choosing.

## Layer rules

`src/tests/architectureBoundaries.test.js` enforces only: core must not import runtime/editor, and runtime must
not import editor. The rest below holds in the code today but is **not** test-enforced; keep it that way.

- `src/core`, `src/components`, `src/serialization`, `src/rules`, `src/geometry`: no Three.js, no React, no Rapier.
- `src/runtime`: Three.js/Rapier adapters. Must not import from `src/editor`.
- `src/editor`, `src/ui`, `src/tutorials`: React UI. May import runtime and core.
- Levels are engine-neutral JSON. Map to Three.js only inside runtime adapters.
- The target engine is undecided, so saved data must stay engine-neutral. Describe what a thing *is*, not how
  Three.js draws it. New workspaces (Characters, Animation, Dialogue, Visual Scripting, UI) must save plain data
  such as skeletons, clips, state machines, conversation graphs and event graphs, never Three.js objects or
  Three.js class names. Existing Three.js-flavored fields (tone mapping, shadow type, Matcap/Toon shading,
  Water/Reflector/Refractor, post-processing) are known exceptions: do not add more without approval.
- Units: 100 editor units = 1 meter. Convert only at the engine boundary (`src/core/units.js`).

## Standalone player

`player.html` + `src/player/` run a finished level with the shared runtime and no editor (`/player.html?level=<name>`).
It is the proof that the game can ship without the editor. Anything the game needs at play time must work there.
`src/player` must not import `src/editor`, `src/ui`, `src/tutorials` or React (test-enforced). New runtime features
(Characters, Animation, Visual Scripting, Dialogue, UI) must be playable in the player, not only in editor Play.
Check a changed level or runtime feature in the player as well as in the editor.

## Adding a feature (follow the existing pattern, do not invent a new one)

1. Component class + registration in `componentRegistry.js` (schema fields, `fromJSON`/`toJSON`).
2. Validation on load (`serialization`/`rules`); bump `schemaVersion` only when unavoidable.
3. Factory in `src/editor` for creation.
4. Three.js adapter in `src/runtime` with disposal of GPU resources.
5. Details panel UI section.
6. Every edit is an undoable command through `HistoryStack`.
7. Tests, plus an acceptance note in `docs/` and a line in `TECHNICAL_STATUS.md`.

## Safety

- Dev file APIs in `vite-plugins/` are localhost-only. Never expose keys, tokens or paid-generation calls
  without the existing estimate/approve gate. Never trigger paid generation without explicit approval.
- Do not add npm dependencies without approval.
- Do not grow `EditorContext.jsx`, `DetailsPanel.jsx`, `SceneView.js` or `Viewport.jsx` beyond what a change needs;
  prefer extracting into new modules. Do not refactor them as a drive-by.

## Before finishing any change

Run `npm test`, `npm run lint` (do not increase the warning count) and `npm run build`.
Report what was verified automatically versus what needs manual browser verification.
New tests should be named by feature, not by phase, and added to `docs/TEST_MAP.md`.
Keep docs in sync: update `TECHNICAL_STATUS.md` and `ROADMAP.md` when status changes.
