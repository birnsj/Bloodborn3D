# Consolidation C3 — EditorContext Consolidation

**Status:** Complete  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) (F1, F21)  
**Baseline:** C2 `67544cc` · 1160 tests · 186 first-party lint warnings  
**Constraints:** Public EditorContext API preserved; no DetailsPanel/Viewport rewrite; no generator; C2 boundaries kept.

## Before / after responsibility map

| Domain | Before | After (C3) |
| --- | --- | --- |
| Set*Properties scaffolding | N near-identical classes in `commands.js` | Shared factories in `componentPropertyCommands.js`; component-specific apply patches retained |
| World field commands | 4 cloned SetWorld* classes | `createWorldFieldCommandClass` |
| Light / Environment / Primitive / StaticMesh scrub+commit | Copy-pasted blocks in EditorContext | `propertyEditing.js` helpers; EditorContext wires locks/history/SceneView |
| World ambient / scene / renderer gestures | Duplicated live/undo paths | `updateWorldField` / `commitWorldFieldGesture` |
| Generator integration surface | Implicit across factories + validation | Documented re-exports in `generatorIntegration.js` |
| EditorContext | Coordination + all duplicated gesture code | Still the composition layer; gesture duplication reduced |

**Not extracted (intentionally deferred):** full Prefab/Cell/layer CRUD modules, geometry/extrude sessions, level I/O — higher coupling; await C4 approval.

## Module sizes

| File | Before (approx LOC) | After |
| --- | ---: | ---: |
| `EditorContext.jsx` | 4473 | **4403** |
| `history/commands.js` | 1077 | **748** |
| `history/componentPropertyCommands.js` | — | **new** (~130) |
| `propertyEditing.js` | — | **new** (~190) |
| `generatorIntegration.js` | — | **new** (~45) |

Success measured by reduced duplication/coupling, not LOC alone.

## Public API changes

**None.** Same `useEditor()` keys and command class names (`SetLightPropertiesCommand`, …). Editor import paths for commands unchanged.

## Duplicate implementations eliminated

- Plain component Set*Properties (Light, Environment, PrimitiveMesh, StaticMesh)
- UV/surface-aware Set*Properties scaffolding (Stair, Ramp, Column, Arch, CurvedWall) with per-key handlers preserved
- World scene/ambient/renderer/PP command scaffolding
- Light/Environment/Primitive update+commit gesture loops
- World ambient/scene/renderer live scrub + commit loops

**Preserved specialized behavior:** Primitive allocation validation; StaticMesh collision co-normalization; ConvexBrush whitelist apply; parametric brush snap/clamp in EditorContext update paths.

## Command consolidation (F21)

- `createComponentPropertiesCommandClass` / `createWorldFieldCommandClass`
- Shared `applyPlainComponentPatch`, `applyUvSurfaceComponentPatch`, `applySurfaceFields`, `applyActorUvPatch`
- Existing contracts, undo snapshots, `onApply` for world fields, CompositeCommand atomicity unchanged

## React warnings

| Metric | C2 baseline | After C3 |
| --- | ---: | ---: |
| Total first-party warnings | 186 | **176** |
| `react-hooks(exhaustive-deps)` | 79 | **72** |
| `EditorContext.jsx` warnings | ~65 | **58** |

Confirmed safe dep additions: `setStatus` / `setTool` on undo/redo/play/stop; `isEditorActorLocked` / `setStatus` on static-mesh update path via helper wiring. No mass memoization; no warning suppression.

## Defects discovered and corrected

- None beyond intentional stale-deps on play/stop/undo/redo/static-mesh (fixed with stable callbacks).

## Verification

### Automated

| Check | Result |
| --- | --- |
| `npm test` | **1166 / 1166** (127 files; +6 command/gesture tests) |
| `npm run lint` | exit 0 · **176** warnings · 0 vendor |
| `npm run build` | pass |
| Architecture boundaries | still green (`architectureBoundaries.test.js`) |

### Browser (C2 outstanding + C3)

`window.__phase2f7gAcceptance({ quick: true })` on Level Editor @ `http://localhost:5175/`:

| Item | Result |
| --- | --- |
| Overall | **`ok: true`** |
| Gothic Mansion profile | load OK; single median ~182 FPS; transform incremental `fullSyncs: 0` |
| 11 acceptance levels Play | all `playOk: true`, return to `edit` |
| Stress | playStop / levelSwitch / createDelete / materials / assetPreview OK |
| Geometry deltas | Play/Stop & create/delete **0**; level-switch textures retain shared-cache growth (known F8) |

## Generator integration readiness

`src/editor/generatorIntegration.js` re-exports:

- `AddActorsCommand` / `RemoveActorsCommand` / `CompositeCommand`
- Architectural `create*FromBounds` factories
- `createCellActor`, authoring-layer stamp helpers
- `validateWorldGeometry` / `validateLevelGeometry` / payload validators
- `GENERATOR_INTEGRATION_CHECKLIST`

Future 2G should: build actors → validate → apply via history commands (atomic undo) → sync. **Generator not implemented.**

## Remaining architectural debt

- EditorContext still large (F1 residual): prefab/cell/layer/geometry sessions still inline
- DetailsPanel scrub wrapper duplication (F6) — out of C3
- Viewport input monolith (F22)
- Parametric brush update paths still hand-rolled (snap/clamp) — candidates for a later specialized helper
- C4+ only with approval

## Audit dispositions

| ID | Disposition |
| --- | --- |
| **F21** | **Closed** — shared command factories; class names preserved |
| **F1** | **Partial** — gesture/command duplication reduced; EditorContext remains coordinator; further domain extraction deferred |

**Stop after C3.** Await approval before C4.
