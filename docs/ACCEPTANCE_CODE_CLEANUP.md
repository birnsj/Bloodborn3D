# Phase 2F.7D — Code Cleanup and Maintainability

## Baseline

- Merged `phase-2f7c-incremental-sync` → `main` (`0bf3b38`).
- Confirmed **581 / 581** tests before cleanup.

## Removed

| Item | Reason |
| --- | --- |
| `src/editor/Toolbar.jsx` | Dead legacy UI (superseded by `layout/LevelToolBar.jsx` / AppMenuBar) |
| `src/editor/Hierarchy.jsx` | Dead legacy UI (superseded by `SceneOutliner.jsx`) |
| `src/editor/Inspector.jsx` | Dead legacy UI (superseded by `DetailsPanel.jsx`) |
| `src/editor/worldSolidFit.js` | Moved to runtime (see below) |
| Unused `writePng` in `scripts/generateHallTextures.mjs` | Superseded by `writePngBuffer` |
| Unused imports / locals across tests, tutorials, Viewport, LayoutContext, archGeometry, wallEndpoints, etc. | Lint-correct cleanup; no behavior change |

## Extracted / relocated responsibilities

| Change | Why |
| --- | --- |
| `src/runtime/worldSolidFit.js` | World Solid auto-fit is used by `SceneView` and `GameRuntime`; lived under `editor/` and forced runtime→editor imports. Canonical `WORLD_SOLID_SHELL` now lives here; `newMapFactory` re-exports it for editor callers. |

Public factory surface preserved: `WORLD_SOLID_SHELL` still importable from `editor/newMapFactory.js`.

## Lint

| Metric | Before (approx.) | After |
| --- | ---: | ---: |
| `no-unused-*` warnings | 25 | **0** |
| Total oxlint warnings | 112 | **87** |

Remaining warnings are mostly React hooks/`refs-during-render` / `only-export-components` in large UI modules. Those need intentional API/structure work (not silent suppression) and are deferred to avoid behavioral risk in this pass.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **581 / 581** |
| Lint | exit 0 |
| Production build | Pass |
| Browser: Gothic Mansion | Load OK; incremental transform OK |
| Browser: `acceptance-subtractive.json` | Load OK; World Solid present; runtime `worldSolidFit` OK |
| Browser: `acceptance-convex-brushes.json` | Load OK; 6 ConvexBrush; incremental OK |

## Intentionally not done (remaining debt)

- Splitting `EditorContext.jsx` / `SceneView.js` / `DetailsPanel.jsx` / `Viewport.jsx` by line count alone.
- Moving brush/ramp/stair factory imports out of `SceneView` (placement preview still editor-coupled — M8).
- Fixing all React hooks exhaustive-deps / refs-during-render warnings (risk of render loops without dedicated pass).
- Consolidating duplicated test `FakeSceneView` / `makeCanvas` helpers (low leverage).
- Phase **2F.7E** not started.
