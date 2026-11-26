# Batch 7.1 — Pivot Editing acceptance

**Baseline:** `2c029c4` (1,063 tests)  
**Academy:** lesson 28 (`pivot-editing`)  
**Level:** `public/levels/acceptance-pivot-editing.json`  
**Screenshots:** `docs/acceptance-pivot-editing/`  
**Three.js:** r187 — single `Actor.transform` + `contentOffset` (no parallel TRS)

## Architecture

| Concept | Implementation |
| --- | --- |
| Pivot | `Actor.transform` origin (local to parent) |
| Content frame | `Actor.contentOffset` (editor units) under a Three.js `ContentRoot` |
| Pivot edit | Move transform; compensate `contentOffset` + direct children so world pose stays |
| History | `SetPivotCommand` (one undo entry per completed edit) |
| Asset default | `meta.defaultContentOffset` — future placements only; source GLB untouched |

## Supported actor types

| Type | Status | Notes |
| --- | --- | --- |
| StaticMesh | **Supported** | All LOD levels share ContentRoot; collision includes offset |
| PrimitiveMesh | **Supported** | |
| Brush (add/subtract) | **Supported** | CSG uses content world matrix |
| ConvexBrush / Ramp / Stair / Column / Arch / CurvedWall | **Supported** | ContentRoot parenting |
| Lights / Environment / PlayerSpawn | **N/A** | Remain at pivot (not content-offset) |

## Acceptance checks

| Check | Status | Evidence |
| --- | --- | --- |
| Door rotates around hinge | **Pass** | Face −X preset; `02-door-pivot-edit.png` |
| Furniture bottom-center | **Pass** | Table Y offset = half height; `03-table-bottom-pivot-details.png` |
| Custom pivot does not move geometry | **Pass** | Unit: `getContentWorldPosition` stable across delta |
| Collision stays aligned | **Pass** | Physics folds contentOffset / content world frame |
| Parented actors keep world pose | **Pass** | Child compensation unit test |
| Prefab overrides | **Pass** | `commitPivotChanges` records prefab override cmds |
| Asset pivot ≠ move existing actors | **Pass** | Meta-only `defaultContentOffset` |
| LOD / InstancedMesh | **Pass** | Shared ContentRoot; instance matrices use content frame |
| Non-uniform scale / rotation | **Pass** | Scale unit test |
| Local / world gizmo | **Pass** | Toolbar Local/World + BrushGizmo space |
| Grid snap / numeric Details | **Pass** | Pivot drag snap + Details content offset |
| Undo / Escape cancel | **Pass** | `SetPivotCommand` + Escape restores snapshot |
| Additive / subtractive brush | **Pass** | Wall + opening in acceptance level |
| Save / reload | **Pass** | `contentOffset` omitted when identity (compat) |
| Editor / runtime Play | **Pass** | `04-play-mode.png` (spawn + light) |
| Unit tests / lint / build | **Pass** | 1,075 tests; lint warnings only; production build OK |

## Screenshots

| File | Captures |
| --- | --- |
| `01-pivot-level-overview.png` | Acceptance level lineup |
| `02-door-pivot-edit.png` | Pivot mode + hinge gizmo on door |
| `03-table-bottom-pivot-details.png` | Bottom-center gizmo + Details presets |
| `04-play-mode.png` | Play/runtime parity |

## Limitations

| Item | Status |
| --- | --- |
| Compression encode | **Deferred** (Batch 7) |
| Brush displacement tessellation | **Outstanding** |
| Interactive Asset Viewer 3D pivot gizmo | Numeric + presets; placement preview uses meta |
| USDZ AR viewer photo | Unverified (Batch 7) |
| Batch 8 features | **Not started** |

## Defects corrected during Batch 7.1

| Issue | Result |
| --- | --- |
| Rebuild reused disposed `ContentRoot` via stale `userData` → orphaned meshes (carve / World Solid batching) | `_syncContentRoot` requires `root.parent === group`; rebuild clears handle |
| `LevelToolBar` duplicate `setStatus` binding | Removed redeclaration (build blocker) |
| Acceptance level missing spawn/light for Play | Added PlayerSpawn + point light |

## Completion

| Gate | Result |
| --- | --- |
| Unit tests | **1,075 passed** |
| Lint | Pass (warnings only; pre-existing) |
| Production build | Pass |
| Commit | Recorded after push |
