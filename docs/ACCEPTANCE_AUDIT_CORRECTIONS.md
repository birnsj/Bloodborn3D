# Phase 2F.7H — Independent Audit Corrections

**Status:** Complete (2026-11-25)  
**Baseline:** `b0a39d2` — 627 tests, CI green  
**Tests after:** **640 / 640** (+13 in `phase2f7hAuditCorrections.test.js`)

No new features or architecture redesign. Each finding was confirmed with a regression test before the fix landed.

## Findings and fixes

### 1. Subtractive geometry invalidation (High)

**Defect:** `SceneView.syncIncremental()` set `carveDirty` only for live subtract edits. Deleting a subtract brush, flipping add↔subtract, or transforming a **parent** of a subtract cutter left additive / World Solid meshes stale under incremental sync (including undo/redo).

**Fix:**
- Mark removals with prior `carveRole` (`subtract` / `world-solid`) as carve-dirty.
- Detect operation flip via stamped `carveRole` vs current role.
- Detect ancestor transform changes for subtract brushes.
- `GameRuntime.refreshBrushCarveDependents` accepts `{ forceCarve }` when leaving the subtract role.

**Regression:** delete / flip+undo / parent transform / delete+undo → additive `visualEpoch` advances; `fullSyncs` stay 0.

### 2. Shared GLB texture ownership (High)

**Defect:** `markSharedSubtree` tagged materials/geometries but not map textures. Instance material clones kept those Texture references as owned → disposing one StaticMesh instance could free maps still used by the cache / other instances.

**Fix:**
- `markSharedMaterialTextures` + subtree tagging of maps.
- `cloneLoadedMesh` re-marks maps shared after cloning owned materials.

**Regression:** dispose owned clone A → shared map `dispose` not called; clone B still references the map.

### 3. Visual epochs (Medium)

**Defect:** Deleting an actor dropped its epoch; undo recreate restarted at 1, allowing stale async loads to attach.

**Fix:** `_actorEpochHighWater` Map survives remove / full clear; `_addActorVisual` assigns `max(live, highWater) + 1`.

**Regression:** rebuild → delete → undo recreate → epoch strictly greater than pre-delete.

### 4. Nested resource disposal (Medium)

**Defect:** `disposeObjectTree` could call `dispose()` twice when the same owned geometry/material appeared on multiple children.

**Fix:** Pass a `seen` Set through `disposeOwnedGeometry` / `disposeOwnedMaterial`.

**Regression:** two meshes sharing one owned geom+mat → each `dispose` once.

### 5. Level validation (Medium)

**Defect:** Transforms were not checked for finite numbers; malformed component entries could slip through.

**Fix:** `validateFiniteTransform` on position/rotation/(optional) scale; component entries require a string `type`; unknown types still load as generic `Component` (legacy/forward-compat); known types reject invalid `id`.

**Regression:** NaN/Infinity rejected; empty type rejected; `FutureWidget` still deserializes; shipped acceptance levels still validate.

### 6. Player spawn (Medium)

**Defect:** Play used local `transform.position` / `rotation.y`, ignoring parent cells/prefabs.

**Fix:** `resolvePlayerSpawnPose(world)` via `getWorldTransform`; used by `GameRuntime._beginPlaySession`.

**Regression:** parented spawn world position ≠ local; unparented still matches local.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **640 / 640** |
| Lint | exit 0 (warnings only) |
| Production build | Pass |
| Browser harness `phase2f7gAcceptance` | `ok: true` |
| 11 acceptance levels Play/Stop | All pass |
| Play/Stop×50 | Δgeometries 0, Δtextures 0 |
| Create/delete×100 | actors stable, Δgeometries 0 |
| Level switch×20 return | Δgeometries 0 (texture cache +40 retained — known M from 2F.7G) |

## Constraints honored

- Incremental sync preserved (carve fixes do not force full-world sync).
- Authored content / editor workflows unchanged aside from corrected behavior.
- No dependency changes.

Phase **2G** not started.
