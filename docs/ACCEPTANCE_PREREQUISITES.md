# Phase 2G — Prerequisite Corrections

**Status:** Complete (2026-11-25)  
**Baseline:** `1636042` — 640 tests  
**Tests after:** **701 / 701** (+61 in `phase2gPrerequisites.test.js`)

Scope: audit defects **D1, D2, D3 only**. No map generation, no other audit recommendations
(carve broadphase, draw-call reduction, floor seams, damping, lint, UI tests, dev-API hardening
remain open). The solid limit (now 512), additive/subtractive workflows, level schema and resource
ownership are unchanged.

## D1 — Additive brush carve invalidation

**Defect:** a brush's carve depends on its *world* pose relative to every cutter. Incremental sync
only re-carved when a cutter changed, so a transform-only change to an additive brush (undo/redo,
parent move, re-parenting) left stale holes until a full resync.

**Fix**
- `actorVisualFingerprint.collectWorldPoseChangedIds(world, entries)` — ids whose own transform,
  parent, or any ancestor's transform/parent differs from the last-built visual. Computed before
  `syncOne` refreshes stored fingerprints.
- `SceneView.syncIncremental`: while a cutter exists, an additive brush / World Solid in that set is
  rebuilt (only that actor). A cutter in the set (own move, ancestor move, re-parent) marks carve
  dirty as before, so all additive brushes re-carve. This replaces the old ancestor-only loop,
  which missed re-parenting.
- No cutters → a move is still a transform update only (`actorRebuilds` stays 0).
- Editor-direct path: `GameRuntime.refreshActor` / `refreshBrushCarveDependents` now re-carve
  additive descendants of a moved parent (`_refreshCarvedDescendants`), and run the full
  cutter refresh when a descendant is a cutter. Previously a moved non-brush parent refreshed only
  itself.

**Regression:** direct move, rotation, undo/redo, parent and grandparent move, re-parent (and undo)
of an additive brush and of a cutter, cutter ancestor move, no-cutter transform-only, unchanged
world no-op, and the GameRuntime descendant refresh. All assert `fullSyncs === 0`.

## D2 — Subtractive complexity validation

**Defect:** the solid cap was enforced only at edit time. Loaded or generated data over the cap was
rendered and collided with later cutters silently dropped.

**Fix** (`src/serialization/levelGeometryValidation.js`)
- `validateWorldSubtractLimits(world)` reports **every** over-cap additive brush with
  `SUBTRACT_COMPLEXITY_EXCEEDED`, solid count, limit, and the cutter where carving stops.
- Enforced at: **load** (`deserializeLevel`, default on), **save** (level file API validates and
  answers HTTP 422 with `diagnostics`, writing nothing), **Play start** (`GameRuntime.play`,
  before physics init).
- Opt-out `deserializeLevel(data, { validateGeometry: false })` is used only for the Play/Stop
  restore snapshot, which was validated at Play start.
- Generator-facing API (same checks): `validateLevelGeometry(data)` / `assertLevelGeometry(data)`
  in `LevelDeserializer.js`; `validateWorldGeometry(world)` / `assertWorldGeometry(world)` in
  `levelGeometryValidation.js`. Errors are `LevelGeometryValidationError` with `.diagnostics`.
- Edit-time rejection (`validateWorldSubtractComplexity`) is unchanged.

## D3 — Geometry payload validation

**Defect:** component payloads were not validated (`Brush.size` with a missing axis, zero,
negative, string or `1e12` loaded and reached geometry/colliders).

**Fix** (`src/rules/geometryPayloadRules.js`, pure)
- Checked before any Actor/component is constructed on load, on save, and on live components at Play.
- Brush: `size` (finite x/y/z, `0 < v <= 100000`), `operation` (`add` | `subtract`), miters
  (finite, `|v| < 90`), openings (array of objects with finite numeric fields).
- Ramp, Stair, Column, Arch, CurvedWall: numeric fields finite and in range; enums
  (`direction`, `stairType`, `shape`, `archType`) supported; StaticMesh `collisionType` supported.
- Legacy preserved: an **absent or null** field is legal and takes the documented component
  default. Only *present* invalid values are rejected. ConvexBrush keeps its own validator.
- Diagnostics codes: `GEOMETRY_NOT_FINITE`, `GEOMETRY_OUT_OF_RANGE`, `GEOMETRY_INVALID_SIZE`,
  `GEOMETRY_INVALID_OPENINGS`, `GEOMETRY_UNSUPPORTED_VALUE`.

**Limits chosen (adaptation decisions, flag if different from intent):** max dimension 100000 eu
(matches the ConvexBrush coordinate limit), max step count 2000, miter < 90 degrees, angle
magnitude <= 36000. Shipped levels are far inside these (largest brush axis 2800 eu).

## Verification

| Check | Result |
|---|---|
| `npm test` | **701 / 701** |
| New tests against the pre-fix source | 45 of 61 fail (the remainder cover unchanged behavior) |
| 17 shipped levels | all load and pass geometry validation (test + load check) |
| `npm run lint` | 0 errors, 89 warnings (unchanged) |
| `npm run build` | passes (single chunk, unchanged) |
| Live dev server save API | invalid brush payload → HTTP 422, no file written |
| Browser harness `phase2f7gAcceptance` (quick) | `ok: true`; Play/Stop, level switches, create/delete all OK; geometry/texture deltas 0; 11 acceptance levels Play OK |
| Browser harness (full: 50 Play/Stop, 20 switches, 100 create/delete, 40 material cycles) | `ok: true`. Play/Stop Δgeometries 0, Δtextures 0; create/delete Δgeometries 0 (actors 8→8); level switches Δgeometries 0, Δtextures +6 (known shared-cache retention, M debt from 2F.7G, not a regression); all 11 acceptance levels Play OK and return to `edit` |
| CI | workflow unchanged (`npm ci`, test, lint, build); same commands pass locally |

## Known limits after this phase

- Validation does not make over-cap maps *possible*: a subtractive World Solid is still capped at
  64 pieces (about 13–23 cutters in current maps). Map generation must pick a representation that
  fits (see audit). Validation only guarantees the failure is loud and early.
- An in-memory world built by a generator and synced to the viewport without calling
  `validateWorldGeometry` is not checked until Play or save.
- Re-carve on additive moves rebuilds the moved brush even if no cutter overlaps it (correct,
  not minimal); a carve broadphase is deferred.
