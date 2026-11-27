# BloodBound3D — Mission and Scope

**Status: DRAFT for designer review.** Derived from the designer's workspace list and the nine workspaces
already defined in `src/editor/layout/layoutPrefs.js`. Items marked **[CONFIRM]** are open decisions —
do not treat them as approved.

## Mission

BloodBound3D is an integrated, browser-based game-production suite for building a first-person
action-adventure. One tool, one project, one shared data model: levels, characters, animation, logic,
dialogue and UI are authored in dedicated workspaces and play back in the same runtime (Three.js render,
Rapier physics). Content is stored as engine-neutral JSON so it can move to another engine later.

## Governing rule

A capability is built **because the game needs it**, not because Three.js offers it. The Three.js
capability catalog (`THREEJS_CAPABILITY_INVENTORY.md`) is a reference, not a backlog.
New work starts from a workspace goal below and needs designer approval before implementation.

## Workspaces (the product)

| # | Workspace | Goal | Status |
|---|-----------|------|--------|
| 1 | Level Editor | Final manual acceptance and targeted performance fixes | Foundation done (C1–C6); manual acceptance + perf fixes remain |
| 2 | Procedural Map Generation (Phase 2G) | Rule-based level generation | Not started; `generatorIntegration.js` ready |
| 3 | World Map | Locations, connections and transitions | Placeholder |
| 4 | Characters | Character definitions, models, skeletons and rigging | Placeholder |
| 5 | Animation | Animation library, preview, retargeting and state machines | Placeholder |
| 6 | Materials | PBR extraction and remaining material capabilities | Substantial; extraction/remaining items open |
| 7 | Visual Scripting | Gameplay logic, events, triggers and interactions | Placeholder |
| 8 | Dialogue | Conversation trees, conditions and branching | Placeholder |
| 9 | UI Editor | HUD, menus and interface authoring | Placeholder |
| 10 | AI Assets | Expanded Meshy capabilities and integrated asset production | Substantial; Meshy expansion open |

The list order is the designer's listing, **not a confirmed priority order** **[CONFIRM sequence]**.

## Shared foundations every workspace must reuse

- Actor / Component model and the component registry
- Engine-neutral JSON with `schemaVersion` and strict validation on load
- Undoable commands (`HistoryStack`) for every authored edit
- Asset registry and Content Browser for all referenced assets
- Dirty tracking, save/load, Play/Stop snapshot-restore
- Editor units: 100 editor units = 1 meter

A new workspace must not create a parallel save format, asset store or undo system.

## Not building (until the designer says otherwise)

- WebGPU / TSL, replacing Three.js, a custom engine
- A backend, accounts or cloud hosting (dev-only localhost APIs for files and AI providers are the exception)
- Gameplay content, story or game design decided by the implementer
- Features justified only by "Three.js can do this"

## Open decisions **[CONFIRM]**

1. ~~Product vs toolchain~~ **DECIDED (designer):** both. BloodBound is built entirely inside this tool, and the
   tool may be released later. Implication: the runtime must be able to run a finished game from tool-authored
   data, without the editor.
2. Priority order of the workspaces above. **Partly decided (designer):** after Level Editor final acceptance and
   performance fixes, finish the already-started Materials and AI Assets first. Order of the remaining workspaces
   is not yet stated. **Designer answer "dcb", interpreted (unconfirmed) as:**
   (1) finish the already-started Materials and AI Assets, (2) content: Procedural Map Generation and World Map,
   (3) gameplay: Characters, Animation, Visual Scripting. Dialogue and UI Editor position not stated.
3. ~~Another engine as export target~~ **DECIDED (designer):** yes, design data for export to another engine, but
   the target engine is **not yet chosen**. Implication: keep all authored JSON engine-neutral and avoid
   Three.js-specific concepts in saved data; do not tailor schemas to any one engine (e.g. Unreal) until chosen.
4. ~~AI providers in scope~~ **DECIDED (designer):** keep all three: OpenArt, Meshy and the Google Drive library.
5. ~~Performance target~~ **DECIDED (designer):** 60 FPS in the single perspective view on the integrated test
   level; the four-pane view only needs to be usable. Proposed refinement **[CONFIRM]:** 60 FPS in the standalone
   player and editor Play, 30 FPS floor for the four-pane view, judged by frame time (budget 16.7 ms) on a modest
   machine, not on the fastest one. Frame rate is limited by the display's refresh rate (vsync), not by the app.
   Earlier docs (C6, DPR 1.5, 671×507, editor): 29.8 FPS single, 9.0 quad.
   Measured 2026-11-27 in the standalone player on the integrated level, 2439×1899 canvas: CPU render cost
   2.6 ms per frame (2,839 draw calls, 101,810 triangles). Shadows are about 70% of it (3 shadow lights, 174
   casters = 2,652 of the draw calls); shadows off = 0.8 ms. GPU time on that machine (strong GPU): 0.3–0.6 ms
   per frame, so it does not show weak-GPU behavior.
   Measured the same day in the real editor with the C6 harness (`runC6FoundationAcceptance`, 671×507, DPR 1.5):
   integrated level **59.9 FPS single (vsync-limited), 37.2 FPS four-pane**; Gothic 59.9 / 60.2. Four-pane is
   CPU-bound (~26.7 ms submit, 1,692 draw calls). These differ greatly from the earlier 29.8 / 9.0, so the earlier
   numbers came from slower hardware or load; re-measure on a modest machine before treating the target as met.

## Related documents

- [`ROADMAP.md`](./ROADMAP.md) — phase history and approved decisions
- [`TECHNICAL_STATUS.md`](./TECHNICAL_STATUS.md) — verification and known debt
- [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) — foundation audit
