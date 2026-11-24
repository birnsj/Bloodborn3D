# Gothic Mansion — Production-readiness acceptance (post–Phase 2E)

**Level:** `public/levels/acceptance-gothic-mansion.json`  
**Harness:** `public/dev/gothicMansionAcceptance.js` (staged browser driver; EditorContext APIs)  
**Date:** 2026-11-24  

Built and exercised through the live editor (create / assign / align / prefab / save / play), not by hand-authoring JSON alone.

## Subsystem results

| Subsystem | Result | Notes |
| --- | --- | --- |
| Construction / placement | **PASS** | 35 actors: multi-floor cells, corridors, openings, subtract, arch, columns, curved wall, straight/curved/spiral stairs, ramp, lights, meshes, spawn |
| Selection / snapping | **PASS** | Grid 25 + snap; actor select after settle |
| Materials / surfaces / Align | **PASS** | Per-surface UV + material; Align A→B `pz` wrote target `faceUVs` |
| Materials workspace | **PASS** | Workspace open/return; `Mansion Accent` material asset present |
| Prefabs | **PASS** | Create from column, place instance, record override, source update/sync |
| Undo / dirty / save / load | **PASS** | Undo/redo surface fields; clean↔dirty; reload fingerprint match |
| Play / Stop restore | **PASS** | Physics active; authored surfaces restored |
| Navigation / collision | **PASS**\* | Spawn + collidable floor/stairs verified. \*Full pointer-lock walk **NOT VERIFIED** (automation limit) |
| Performance | **PASS** | Measurements below |
| Geometry coverage | **PASS** | Brush, subtract, ramp, column, arch, curved wall, straight/curved/spiral stair, StaticMesh, Light, Cell, PlayerSpawn |
| Miter join in this layout | **NOT VERIFIED** | `joinSelectedWallToNearest` returned false for the acceptance corner pair (endpoint proximity/layout); tool not disproven |

## Performance (Chromium automation tab)

| Actors | Avg FPS | Avg frame ms | Resync ms | JS heap used (MB) |
| --- | ---: | ---: | ---: | ---: |
| 35 (mansion) | 178.3 | 5.61 | 365 | 86.5 |
| 55 (+20 boxes) | 173.9 | 5.75 | 341 | 90.6 |
| 95 (+60 boxes) | 173.9 | 5.75 | 361 | 153.2 |

Add-batch wall times: ~463 ms / 20 actors, ~594 ms / 40 actors (includes command + sync). Editor remained interactive; no crash. Resync stays ~340–365 ms in this range (full rebuild — known M6 debt).

## Confirmed defects (no fix applied — needs approval)

1. **`applySelectedMaterialToBrush` + leftover `selectedSurface`**  
   When `selectedSurface` is non-null, actor material apply is redirected to surface assignment. Deselect / `applyLevelData` does not always clear `selectedSurface`, so rapid actor material assigns can leave `materialId` unset.  
   **Workaround used for the mansion:** clear `selectedSurface`, then `updateSelectedBrush` / typed updaters.

## Existing limitations (not new defects)

- Align: coplanar Brush faces only  
- Full FPS locomotion / collision “feel” not automatable without pointer-lock  
- Placeholder workspaces (non-Materials)  
- Full scene rebuild on sync (audit M6); ~6 MB single bundle  

## Phase 3 readiness

**Conditional yes.** Phase 2E materials/surfaces pipeline holds under an integrated mansion load. No blocking crash or persistence failure found. Address or schedule the `selectedSurface` redirect defect before relying on Content-Browser drag-assign in complex flows; treat pointer-lock play QA as a manual checklist item.
