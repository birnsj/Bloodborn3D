# Phase 2G — Subtractive Rendering Optimization (experiment report)

Baseline commit: `134f63f` (eval + tooling). Solid cap unchanged at **64**. No integration performed.
Everything below is behind two **default-OFF** globals (`src/runtime/renderExperiments.js`):

| Flag | Effect |
| --- | --- |
| `globalThis.__BLOODBOUND_BATCH_WORLD_SOLID = true` | World Solid exposed faces → **one mesh, ≤6 materials** (grouped by face key) instead of one mesh + 6 materials per carved solid |
| `globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS = true` | Edit-mode subtract-cutter wireframes share one fill + one line material |

Collision decomposition, serialization, the subtraction algorithm and the cap are untouched.

## What changed (all reversible)

- `createBatchedWorldSolidGeometry` (`brushGeometry.js`): merges the existing per-solid `createExposedWorldSolidGeometry` output (same clipping, winding, UVs), triangles grouped by `px…nz`; `surfaceIds = FACE_KEYS`, scheme `grouped`.
- `SceneView._addBatchedWorldSolidMesh`: one mesh, then the normal `_applySurfaceMaterials` path (per-face `faceMaterials`, `materialId`, per-face `faceUVs`, picking and surface highlight work as on any grouped mesh).
- `SceneView._getSharedCutterMaterials`: shared materials marked shared; freed in `SceneView.dispose()`.
- 17 new tests (`phase2gRenderBatching.test.js`). Suite: **718 pass** (701 original + 17). Lint: 0 errors. Build OK.

## Measured results (browser, real WebGL; `scripts/phase2g-subtractive-rendering/results/browser-render-bench.json`)

"Created" = materials allocated during a full sync. "Live" = unique materials alive afterwards.
Mode A = baseline, B = World Solid batched, C = B + shared cutter materials.

| World (actors) | Materials created A → B → C | Live materials A → B → C | Draw calls A → B | Quad frame ms A → B | Single frame ms A → B | Edit (nudge+sync+render) ms A → B |
| --- | --- | --- | --- | --- | --- | --- |
| flush-25 (61) | 1249 → 142 → 44 (−88.6% / −96.5%) | 689 → 136 → 40 | 939 → 153 (−84%) | 9.2 → 2.9 | 1.8 → 0.7 | 22.2 → 12.3 |
| flush-50 (130) | 2430 → 287 → 65 (−88.2% / −97.3%) | 1352 → 281 → 61 | 1155 → 219 (−81%) | 14.3 → 4.2 | 3.3 → 1.1 | 31.1 → 15.4 |
| flush-100 (227) | 4047 → 490 → 92 (−87.9% / −97.7%) | 2262 → 484 → 88 | 1405 → 301 (−79%) | 20.3 → 5.6 | 5.4 → 1.7 | 40.9 → 20.8 |
| flush-200 (478) | 7968 → 1023 → 185 (−87.2% / −97.7%) | 4489 → 1017 → 181 | 1908 → 468 (−75%) | 32.6 → 8.6 | 10.3 → 3.2 | 76.4 → 39.6 |
| rep-25 (99) | 3983 → 888 → 726 (−77.7% / −81.8%) | 2349 → 802 → 642 | 2278 → 928 (−59%) | 37.6 → 9.8 | 6.7 → 2.3 | 31.9 → 9.7 |
| rep-50 (208) | 6838 → 1783 → 1427 (−73.9% / −79.1%) | 4144 → 1617 → 1263 | 2477 → 929 (−62%) | 45.1 → 12.5 | 9.9 → 3.5 | 50.2 → 17.3 |
| rep-100 (364) | 11555 → 3042 → 2406 (−73.7% / −79.2%) | 7020 → 2764 → 2130 | 3147 → 1275 (−59%) | 61.3 → 21.0 | 15.5 → 6.1 | 78.5 → 33.0 |
| rep-200 (760) | 24478 → 6277 → 4947 (−74.4% / −79.8%) | 14811 → 5711 → 4383 | 4729 → 1909 (−60%) | 105.1 → 35.3 | 30.3 → 12.1 | 187.5 → 95.2 |

"flush" = flush mazes (rooms + corridors). "rep" = representative worlds (upper floors, windows, shafts) **plus stair actors** added by the benchmark.

### Correctness / regressions

| Check | Result |
| --- | --- |
| Collision | Play-mode collider count identical in all 8 worlds (98 … 1912); decomposition unchanged |
| Incremental sync | `fullSyncs = 0` in every edit loop; World Solid rebuilds as one actor rebuild, as before |
| Game-view pixels vs baseline (3 camera poses) | ≤ 0.0053 % of pixels differ by > 8/255 (max channel delta ≤ 18; a few edge pixels) — effectively identical |
| Edit-view pixels vs baseline | 0 – 16 % of pixels differ in some poses. Cause traced: coplanar **editor cutter overlay fills** z-fight against exposed faces and resolve differently at different vertex precision. With overlays hidden, the difference drops to 0.5 %; with `editMode=false` it is ≈ 0. Not a World Solid geometry/material difference, but the **edit view is not bit-identical** |
| Surface picking (`pickSurface` vs hit-normal face) | batched **100 %** correct; baseline **16 – 29 %** (see pre-existing defect 1) |
| Per-face materials, UV overrides, highlight | covered by unit tests (batched path) |

### Cost / trade-offs

- **Triangles submitted rise ~1.6 – 2.9×** (e.g. rep-200 25.7k → 74.8k per single pane): the single merged mesh loses per-solid frustum culling. Frame time still drops 2.5 – 3×, so draw-call/material state dominates, but this scales with map size and would eventually want spatial chunking.
- World Solid rebuild per edit: slightly faster (rep-200 Node bench 88 → 66 ms); geometry allocations ≈ unchanged.
- `heapMB` in the harness is noisy (GC timing); not used as evidence.

## Success criteria

| Criterion | Result |
| --- | --- |
| ≥ 80 % material reduction on representative maps | **Met for the World Solid (99.9 %) and for flush mazes (87 – 89 % B, 96.5 – 97.7 % C).** **Not met on the benchmark "rep" worlds**: 74 – 78 % (B), 79 – 82 % (C created), 70 – 73 % live (C). The remainder is **stair actors** (3675 of the 3684 live materials left in rep-200 after C): untouched by this experiment and not a subtractive surface |
| Significant draw-call reduction | 75 – 84 % flush, 59 – 62 % rep |
| No visual / collision regressions | Collision identical; game-view identical; edit-view overlay z-fight noted above |
| No editing degradation | Edit latency improves 1.7 – 3.3× |
| All 701 tests | Pass (718 with the 17 new) |

## Pre-existing defects found (not fixed; unchanged on the default path)

1. **'box' scheme picking/UV indexing on exposed World Solid geometry.** `surfaceIdFromHit` ('box') uses `faceIndex / 2`, and `applyFaceUvsToGeometry` ('box') uses `face*4+i`. Both assume exactly 2 triangles / 4 vertices per face. Exposed World Solid geometry has a variable quad count per face, so in the default path picks resolve to the wrong face id (16 – 29 % correct, measured) and per-face UV overrides would land on the wrong vertices. Shipped World Solids have `faceUVs = null`, so only picking is visibly affected today.
2. `applyFaceUvsToGeometry` ('grouped') walks index entries, so vertices shared by two triangles of an indexed quad are transformed twice. Only relevant to indexed geometry.

The batched path avoids both (grouped scheme, per-vertex single application).

## Decision points for the designer

1. **Integrate World Solid batching** (flag → default ON)? It resolves defect 1 for World Solids as a side effect (a behaviour change in surface picking; arguably a fix).
2. **Batch stairs** (6+ materials per step mesh) to reach ≥ 80 % on maps that contain stairs? Not a subtractive surface, so out of scope until you say so.
3. **Spatial chunking** of the batched mesh to restore frustum culling, if triangle count matters for larger maps.
4. Raising the product cap remains a separate decision; with batching on, the earlier recommendation of 512 now has headroom in rendering, but the per-actor rebuild cost on edit (≈ 76 ms at ~1.4 k solids) is the next limiter.
