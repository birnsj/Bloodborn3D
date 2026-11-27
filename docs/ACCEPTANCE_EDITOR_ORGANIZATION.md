# Batch 9 — Editor Organization and Viewport Tools

**Ship baseline:** `a625593` (1,131 tests)  
**Closure commit:** `eb2f4f1`  
**Level:** `public/levels/acceptance-layers.json`  
**Harness:** `src/dev/layersAcceptanceClosure.js`  
**Academy:** lesson 30 (`editor-layers`)  
**Screenshots:** `docs/acceptance-layers/`  
**Regression tests:** `src/tests/batch9AuthoringLayers.test.js`, `src/tests/batch9AcceptanceClosure.test.js`

## Architecture

| Concern | Owner | Notes |
| --- | --- | --- |
| Layer tree + `activeLayerId` | `world.authoringLayers` | Serialized; seed defaults Architecture / Props / Lighting / Environment / Gameplay |
| Actor membership | `actor.authoringLayerId` | ID only; null resolves to Architecture (or first root) |
| Editor filters | `EditorContext.layerUi` | `hidden` / `locked` / `solo` — **session only**, never level JSON |
| Lock enforcement | `authoringLayerGuards.js` + EditorContext command paths | Not UI-disable-only |
| Viewport filter | `SceneView` edit mode | `group.visible` ∧ layer filter; Play ignores `layerUi` |
| Parenting / Cells / Prefabs | Unchanged | Layers do not replace hierarchy |
| `THREE.Layers` | Atmosphere bit 2 only | **No** mapping from authoring layers |

**TextureHelper:** **Deferred** — Texture Inspector covers 2D sampling diagnostics.

## Defects corrected (closure)

| Severity | Defect | Fix |
| --- | --- | --- |
| P1 | Duplication appeared to follow Active layer rather than source membership | `duplicateActors` explicitly copies `authoringLayerId`; create/place still stamp Active |
| P1 | Layer lock not enforced across shared edit paths | `authoringLayerGuards` + guards on create/delete/duplicate/transform/geometry/material/Details/prefab-related edits; blocked status feedback; no create into locked Active layer |

## Closure checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| Nested layers | **Passed** | Detail Props under Props; browser Layers panel |
| Solo restore | **Passed** | Unit + harness workflow |
| Layer hide non-destructive (no CSG rebuild) | **Passed** | Harness: `rebuildDelta: 0`; fingerprint excludes `actor.visible` |
| Duplication preserves source layer | **Passed** | Single / multi / hierarchy / cell / prefab instance + undo tests |
| New create / prefab place uses Active | **Passed** | Stamp / assign Active unchanged |
| Lock enforcement (command paths) | **Passed** | Guards + mixed selection partition tests; layer UI remains usable to unlock |
| Prevent create into locked Active | **Passed** | `rejectIfActiveLayerLocked` |
| Prefab strip + cross-level place | **Passed** | Strip on save; Active on place |
| Outliner chips / filter / Details assign | **Passed** | Browser + unit |
| Layers panel CRUD / nested / counts | **Passed** | Browser: Window → Layers; recolor menu |
| Multi-viewport ViewHelper | **Passed** | Perspective only; quad screenshot; helper map size 1 in mixed ortho/persp |
| Play ignores layer UI | **Passed** | `editMode` false → layer filter off |
| Backward compat | **Passed** | Missing `authoringLayers` seeds defaults |
| Hidden actors not pickable | **Passed** | `pickWorldHits` / marquee skip |
| Hidden lights stop contributing | **Passed** | Whole actor `group.visible = false` (Three light parent visibility) |
| Runtime / collision unaffected | **Passed** | Filters edit-mode only; Play ignores `layerUi` |
| Mansion single/quad FPS vs Batch 8 (~84 / ~18.7) | **Unverified** | Long CDP mansion measure aborted in closure session; layer ops confirmed non-rebuild (`toggle20x` ~0.1 ms on acceptance level). Re-run `phasePerf()` locally when convenient |
| TextureHelper | **Deferred** | Texture Inspector |
| THREE.Layers mapping | **Deferred / rejected** | Stay separate (documented) |
| VideoTexture / KTX2 encode / baked lighting / brush displacement / multi-viewport render debt / extended texture lifecycle | **Deferred** | Unchanged from prior batches |

## CSG / visibility limitations

- Layer hide is **visual + pick** only. Subtractive carve remains baked into additive / world-solid meshes; hiding a cutter does **not** un-carve.
- World-solid batch visibility is per World Solid **actor group**, not per solid fragment inside a batched mesh.
- Hierarchies spanning layers: each actor’s own membership drives filter; parent `actor.visible` hierarchy still applies via `isEffectivelyVisible`.

## Performance (method)

Same as Batch 8: `measureFrameTimes(seconds, { warmupFrames })` via `window.__bloodboundViewport`.

```js
import('/src/dev/layersAcceptanceClosure.js').then((m) => m.runAll()).then(console.log)
```

Verified in-session on acceptance-layers: layer hide/show does not increment `actorRebuilds`. Gothic mansion median FPS vs Batch 8 baseline left **Unverified** (see checklist).

## Screenshots

- `docs/acceptance-layers/01-layers-panel.png` — Layers dock + Outliner chips + ViewHelper corner
- `docs/acceptance-layers/02-quad-viewhelper.png` — Four-pane layout; perspective ViewHelper only

## Non-goals (explicit)

- Mapping authoring layers → `THREE.Layers` for GPU layer masks
- Replacing Outliner parent tree with a layer tree
- TextureHelper / advanced texture diagnostics beyond Texture Inspector
- Unrelated rendering optimization
