# Project clean-up and organisation — November 2026

Written for the designer. It records what was improved in the clean-up pass, how each piece was checked, and
what is still open. No game features were added in this pass, and nothing changed in how the editor behaves.

## Why this was done

The project had grown fast and the guidance given to different AI assistants was inconsistent. The aim was a clear
picture of what exists, written rules so every assistant works the same way, and confidence that the structure is
sound enough to keep adding features.

## What was improved

### 1. Mission and rules written down

| Item | File | What it does |
|---|---|---|
| Mission and scope | `docs/MISSION.md` | What BloodBound3D is and is not, the workspaces, decided and open questions, measured performance. |
| Agent rules | `AGENTS.md` | Rules every AI assistant must follow: the designer decides scope, layer rules, engine-neutral saved data, the pattern for adding a feature, safety limits, and the checks to run before finishing. |
| Test map | `docs/TEST_MAP.md` | Lists each feature, the tests that cover it, and which parts still need a manual check in the browser. |

### 2. The game can run without the editor

`player.html` and `src/player/` run a finished level using the shared game code and no editor
(`/player.html?level=<name>`). Tests load every shipped level through it and check its assets, and a boundary test
stops the player from importing editor code. This is the proof the game could ship without the editor.

### 3. Saved data stays engine-neutral

The target engine is not chosen. `AGENTS.md` now says saved data must describe what a thing is, not how Three.js
draws it. Existing Three.js-flavoured fields are listed as known exceptions, and no more are to be added without
approval.

### 4. Dead code removed

`ConceptLibraryPanel.jsx` (959 lines, unused) was deleted.

### 5. Performance measured and recorded

Frame rate, CPU time and GPU time were measured on two machines and recorded in `docs/MISSION.md`, with the refined
target. The lower numbers seen on the laptop are recorded as unexplained, not guessed at.

### 6. The three giant files were split

These files had grown too large to read or change safely. The code was moved, not rewritten, so behaviour is unchanged.

| File | Before | After | Where the code went |
|---|---|---|---|
| `src/editor/layout/DetailsPanel.jsx` | 4,454 lines | 1,863 | Sections in `src/editor/details/` (nine files). |
| `src/runtime/SceneView.js` | 4,429 lines | 220 | Method groups in `src/runtime/sceneView/` (nine files plus shared helpers). |
| `src/editor/EditorContext.jsx` | 4,609 lines | 999 | Eleven hooks in `src/editor/provider/`. |

A new test, `src/tests/fileSizeBudget.test.js`, fails if any new file goes over 1,500 lines or if one of the
remaining large files grows past its limit. When a file is split further, its limit should be lowered or removed.

## How it was checked

Each split was checked three ways before it was committed.

- **Automated:** all tests pass (1,256 tests in 133 files), the production build works (editor and player pages),
  and a check for undefined or unused names was run on the moved code.
- **In the real editor:** the integrated test level was loaded and one actor of each type was selected. Every
  Details section rendered with no errors. After the `EditorContext` split, real edits (duplicate, rename, delete,
  place light, undo, redo, and switching transform and geometry modes) were run and behaved correctly. The scene
  was confirmed to draw in all four panes after the `SceneView` split.
- **Bugs caught on the way:** the scripts that moved the code dropped some references in early runs. The tests and
  the stricter name check caught them, and they were fixed before anything was committed.

## Things to know

- **Lint exception.** `react/exhaustive-deps` is turned off for `src/editor/provider/` in `.oxlintrc.json`. The
  linter cannot see that the refs and state setters passed into those hooks are stable, so it demanded them in
  every dependency array. The code there is unchanged, but that rule no longer checks it, including about 31
  older warnings that are now hidden instead of counted. Total lint warnings are 147, down from 177.
- **Stricter lint command.** `oxlint` does not report undefined names by default. After moving code, also run
  `npx oxlint -D no-undef <files>`.
- **Tests that read source text.** A few tests read source files as text (for example `c5GpuLifecycle` and
  `architectureBoundaries`). They were pointed at the new file locations, and the boundary test now covers the
  new folders too.

## Not verified automatically

These need a manual check in the browser.

- Play mode and the standalone player after the splits. The player build compiles, but it was not run by hand.
- The specialised tools: extrude, clip and face-move drag. They run through the moved code but were not exercised.
- The Convex brush Details section. No level used in the check contained one.
- The visuals in general. There are still no automated tests of how things look.

## Still open

- Large files still over the 1,500-line limit: `src/editor/Viewport.jsx` (2,787), `src/editor/projectArt/ProjectArtLibraryPanel.jsx`
  (2,429), `src/editor/layout/DetailsPanel.jsx` (1,863) and `src/ui/hoverHelp/helpContent.js` (about 1,600).
- Workspace order after Materials and AI Assets, and whether the refined performance target is confirmed.
- The target engine.
- The unexplained laptop frame-rate gap. Check Windows Graphics settings (High performance), AC power and
  `chrome://gpu`, then re-measure.
- A measurement on a modest machine.

## Commits in this pass

`96c1fd3` mission and `AGENTS.md`; `642ca73` dead code removed and test map; `5e63193` standalone player;
`9e27c01`, `db4a060`, `4b12018`, `9c0bc1f` performance and machine notes; `922be83` `DetailsPanel` split and size
test; `ed88743` `SceneView` split; `0015a1f` `EditorContext` split.
