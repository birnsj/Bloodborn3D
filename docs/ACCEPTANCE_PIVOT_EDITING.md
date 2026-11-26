# Batch 7.1 — Pivot Editing acceptance

**Baseline (actor pivot):** `d43be56` (1,075 tests)  
**Closure (Asset Viewer gizmo):** `e92e22f` (1,078 tests)  
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
| Asset Viewer gizmo | Reuses `BrushGizmo` move handles on `MeshPreviewCanvas`; draft until Apply |

## Supported actor types

| Type | Status | Notes |
| --- | --- | --- |
| StaticMesh | **Supported** | All LOD levels share ContentRoot; collision includes offset |
| PrimitiveMesh | **Supported** | |
| Brush (add/subtract) | **Supported** | CSG uses content world matrix |
| ConvexBrush / Ramp / Stair / Column / Arch / CurvedWall | **Supported** | ContentRoot parenting |
| Lights / Environment / PlayerSpawn | **N/A** | Remain at pivot (not content-offset) |

## Asset Viewer interactive pivot

| Check | Status | Evidence |
| --- | --- | --- |
| Translation gizmo on all axes | **Pass** | Pivot Edit mode + BrushGizmo move handles |
| Numeric XYZ + presets sync | **Pass** | Shared `pivotDraft` between canvas and MeshAssetTools |
| Grid snap (25 eu) + axis constraints | **Pass** | `applyAssetPivotDragDelta` + gizmo axis handles |
| Geometry stationary while editing | **Pass** | Mesh fixed at anchor; pivot = −contentOffset |
| Rot / scale preview around pivot | **Pass** | Preview Rot Y° / Scale controls |
| Apply / Cancel / Escape / Reset | **Pass** | Apply writes meta; Cancel/Escape restore draft; Reset → original |
| Meta persistence / reopen | **Pass** | `updateMeshMeta` → `defaultContentOffset` |
| New placements inherit; existing unchanged | **Pass** | `createStaticMeshActor` + meta-only save |
| Gizmo dispose on close | **Pass** | Unit: BrushGizmo dispose removes scene child |
| Actor pivot editing unchanged | **Pass** | Existing Batch 7.1 actor tests |

## Actor acceptance checks

| Check | Status | Evidence |
| --- | --- | --- |
| Door rotates around hinge | **Pass** | Face −X preset; `02-door-pivot-edit.png` |
| Furniture bottom-center | **Pass** | Table Y offset = half height; `03-table-bottom-pivot-details.png` |
| Custom pivot does not move geometry | **Pass** | Unit: `getContentWorldPosition` stable across delta |
| Collision stays aligned | **Pass** | Physics folds contentOffset / content world frame |
| Parented actors keep world pose | **Pass** | Child compensation unit test |
| Prefab overrides | **Pass** | `commitPivotChanges` records prefab override cmds |
| LOD / InstancedMesh | **Pass** | Shared ContentRoot; instance matrices use content frame |
| Local / world gizmo | **Pass** | Toolbar Local/World + BrushGizmo space |
| Undo / Escape cancel | **Pass** | `SetPivotCommand` + Escape restores snapshot |
| Editor / runtime Play | **Pass** | `04-play-mode.png` |

## Screenshots

| File | Captures |
| --- | --- |
| `01-pivot-level-overview.png` | Acceptance level lineup |
| `02-door-pivot-edit.png` | Actor Pivot mode + hinge gizmo |
| `03-table-bottom-pivot-details.png` | Bottom-center gizmo + Details presets |
| `04-play-mode.png` | Play/runtime parity |
| `05-asset-viewer-pivot-edit.png` | Asset Viewer interactive pivot gizmo |
| `06-asset-pivot-after-apply-placement.png` | Placement inherits saved default pivot |

## Limitations

| Item | Status |
| --- | --- |
| Compression encode | **Deferred** (Batch 7) |
| Brush displacement tessellation | **Outstanding** |
| USDZ AR viewer photo | Unverified (Batch 7) |
| Batch 8 features | **Not started** |

## Defects corrected during Asset Viewer gizmo closure

| Issue | Result |
| --- | --- |
| Asset Viewer lacked interactive pivot gizmo (numeric/presets only) | BrushGizmo on MeshPreviewCanvas + Apply/Cancel draft |
| Dialog Escape always closed preview during pivot edit | Escape cancels drag, then draft, then dialog |

## Completion

| Gate | Result |
| --- | --- |
| Unit tests | **1,078 passed** |
| Lint | Pass (warnings only; pre-existing) |
| Production build | Pass |
| Commit | `e92e22f` |
