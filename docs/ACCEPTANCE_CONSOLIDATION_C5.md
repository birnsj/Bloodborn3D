# Consolidation C5 — GPU Resource Lifecycle and Rendering Performance

**Status:** Complete (2026-11-26)  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) (F3 measurement integrity, F8)  
**Baseline:** C4 `480c398` · 1171 tests · 176 first-party lint warnings  
**Closure:** Full browser soak `ok: true` · ≥50 cycles all families · stall-hardened `measureFrameTimes` · 1193 tests · lint warnings-only · production build OK  
**Constraints:** No Phase 2G map generator. Do not claim FPS wins across unequal workloads. Preserve shared-cache semantics for interactive editing.

## 1. Performance measurement integrity

### Historical report reconciliation

| Report | Level | Actors | Median FPS (single / quad) | Conditions |
| --- | --- | ---: | --- | --- |
| Batch 8 textures | `acceptance-integrated-editor.json` | **101** | **84.0 / 18.7** | Chromium automation · DPR 1.5 · ~671×507 · correct `measureFrameTimes(s,{warmupFrames})` |
| Pre-Batch 8 stabilization | same integrated | **101** | **~77.5–78.1 / ~17.5–19.6** | Same protocol after shadow/env/ortho fixes |
| C4 quick acceptance | `acceptance-gothic-mansion.json` | **35** | **~175 / ~170** | `phase2f7gAcceptance({ quick: true })` Gothic profile |

**Verdict:** The ~84 / 18.7 and ~175 / 170 figures are **different levels**, not competing measurements of one scene.

- Integrated mansion is a furnished duplicate (static meshes, LODs, denser materials) — quad cost tracks N independent scissor draws.
- Gothic mansion is lighter; near-parity single/quad FPS is consistent with a cheap frame that still finishes four panes quickly on the measurement machine.
- **Do not** treat C4 gothic numbers as a performance improvement over Batch 8 integrated numbers.

Harness: `src/dev/c5GpuLifecycleAcceptance.js`  
CDP: `import('/src/dev/c5GpuLifecycleAcceptance.js').then((m) => m.runC5GpuLifecycleAcceptance())`

### Protocol (required fields)

Each C5 level profile records:

- Hardware / browser (`userAgent`, `hardwareConcurrency`, `deviceMemoryGB`)
- Viewport CSS / buffer size, DPR, shell size
- Active pane count, layout mode, display modes
- Shadow map + post-processing preview flags
- Actor count + visible mesh count
- Warmup frames + sample duration
- Median / p95 / min / max frame ms (+ median FPS)
- Draw calls + triangles via **`renderer.info.reset()` then one render** (`measureGpuSnapshot`)
- Ownership inventory (shared / owned / untagged) and cache sizes
- Stall discard counts (`discardedStalls`) after C5 sampler hardening

### `renderer.info` reset

| Path | Behavior |
| --- | --- |
| `__bloodboundViewport.measureGpuSnapshot` | **Correct** — `info.reset()` + one `renderViewports` / `render` |
| C5 harness | Uses `measureGpuSnapshot` only for draw/tri |
| `phase2f7gAcceptance` (pre-C5) | Memory counts OK; drawCalls could accumulate without reset |
| `phase2f7gAcceptance` (C5) | `gpuSnapshot` now awaits `measureGpuSnapshot`; omits drawCalls if reset unavailable |

### Sampler hardening (C5 defect fix)

Automation tabs inject ~500–1000 ms rAF gaps. An earlier soak collapsed gothic-quad / integrated-single to **1 sample @ ~1 FPS**.

**Prototype fix:** `measureFrameTimes` now:

- Settles until N consecutive frames are under `stallMs` (default 120)
- Discards stall frames during the sample window
- Enforces `minSamples` with a hard deadline so throttled tabs cannot hang the harness
- Reports `discardedStalls`

C5 gates reject profiles with `<16` samples or median FPS `<5`.

## 2. GPU resource lifecycle — F8

### Ownership model

| Resource | Ownership | Dispose path |
| --- | --- | --- |
| MaterialFactory texture cache | **Shared** (`bbShared`) | `clearTextureCache` / `invalidateTextureCacheMatching` |
| Material map clones on instances | **Owned** | `disposeOwnedMaterial` |
| GLB geometries in mesh cache | **Shared** | `clearMeshCache({ dispose: true })` → `disposeSharedSubtree` |
| GLB instance materials | **Owned** (maps stay shared) | `disposeObjectTree` |
| Stair step materials (C4 F18) | Intra-actor **shared instances** (not cache-tagged) | `disposeObjectTree` + `seen` set disposes once |
| Shared cutter materials | SceneView-owned shared | `SceneView.dispose` |
| Env equirect cache | **Shared** | `clearEnvironmentMapCache({ dispose: true })` |
| Authored PMREM RT | Controller-owned | `disposePmremTarget` |
| Water / mirror / refraction RTs | Env `bbEnvDispose` | `disposeObject` → `bbEnvDispose` |
| Post-processing buffers | Controller-owned | `postProcessingController.dispose` |
| ViewHelper / overlays | SceneView / gizmo | `SceneView.dispose` / gizmo dispose |
| Asset Viewer / MeshPreview | Preview-local | `disposeObjectTree` on close |

### F8 disposition

Level-switch **texture retention** after return-to-same-level remains **shared cache retention**, not a confirmed owned leak. Interactive editing keeps process-lifetime caches on purpose.

C5 adds:

- `inventoryGpuOwnership(root)` — separate shared / owned / untagged counts
- `disposeSharedSubtree` — explicit free when abandoning a cache root
- `clearMeshCache({ dispose })` — dispose shared GLTF roots on clear (default on)
- `clearEnvironmentMapCache({ dispose })` — dispose equirects on clear
- `releaseSharedAssetCaches()` — soak / test reset only (never ordinary level switch)

### Owned-leak fixes (seven — unit-verified)

| # | Bug | Fix | Unit proof |
| --- | --- | --- | --- |
| 1 | Water.js reflection `WebGLRenderTarget` never freed | Capture RT on first draw; dispose in env teardown | `c5GpuLifecycle.test.js` Water dispose exactly once |
| 2 | StaticMesh material override orphaned `createThreeMaterial` + clone | Use createMaterial result directly; mark owned | static mesh override ownership |
| 3 | `_ppTextureCache` survived level switches | Clear + generation bump in `clearWorldMeshes` | PP generation race tests |
| 4 | Dual `bbEnvDispose` on holder + root | Register once on holder | holder-only source contract |
| 5 | `disposeObjectTree(root, { geometries: false })` ignored options | Options honored | disposeObjectTree options |
| 6 | PMREM cube texture wrongly `bbShared` | Removed; RT remains caller-owned | PMREM not marked shared |
| 7 | InstancedMesh material clone maps | `markSharedMaterialTextures` after clone | shared textures survive consumers |

### Shared textures / PP race / Water once (acceptance checks)

| Check | Result |
| --- | --- |
| Shared maps stay alive when one consumer is disposed | **Pass** (unit) |
| Async PP loads after `_clearPpTextureCache` cannot repopulate | **Pass** (unit — generation guard disposes late tex) |
| Water / mirror RT dispose idempotent (exactly once) | **Pass** (unit) |

## 3. Extended lifecycle stress

`runC5GpuLifecycleAcceptance()` (full mode) runs **≥50 iterations** each of:

- Play / Stop
- Level switching (gothic ↔ integrated ↔ subtractive ↔ convex ↔ test-room; end on start level)
- Actor create / undo-delete
- Material assign + undo/redo
- Single ↔ quad layout switching
- Asset Viewer / Meshes tab open-close

Interval snapshots every ~10 level switches classify **bounded cache growth** vs **progressive leaks**.

Gates: Play/Stop and create/delete geometry deltas bounded; stress `ok`; both levels measured with reset protocol; FPS sample integrity.

Quick mode (`{ quick: true }`) uses reduced cycle counts for smoke.

## 4. Public API

| Symbol | Module |
| --- | --- |
| `inventoryGpuOwnership` | `runtime/gpuResources.js` |
| `disposeSharedSubtree` | `runtime/gpuResources.js` |
| `clearMeshCache({ dispose })` / `getMeshCacheSize` | `runtime/meshLoader.js` |
| `clearEnvironmentMapCache({ dispose })` | `runtime/environmentMapCache.js` |
| `releaseSharedAssetCaches` | `runtime/releaseSharedAssetCaches.js` |
| `runC5GpuLifecycleAcceptance` / `reconcileHistoricalFpsReports` | `dev/c5GpuLifecycleAcceptance.js` |

## 5. Verification — measured results

### Conditions (closure soak)

- Cursor/Electron Chromium · DPR **1.5** · canvas CSS **~458×317** (buf ~687×475) · shell 458×317
- `hardwareConcurrency` 20 · `deviceMemoryGB` 32
- `measureFrameTimes(0.7s, { warmupFrames: 18, stallMs: 120, minSamples: 24 })`
- Post-processing preview **on** · shadow map enabled
- Note: canvas smaller than Batch 8 (~671×507); integrated quad FPS is therefore not directly comparable as a regression/improvement claim

### Median FPS (stall-hardened)

| Level | Actors | Single median FPS | Quad median FPS | Samples (s/q) | Discarded stalls |
| --- | ---: | ---: | ---: | --- | ---: |
| Gothic mansion | 35 | **95.2** | **128.2** | 66 / 82 | 0 / 0 |
| Integrated editor | 101 | **87.7** | **24.3** | 60 / 24 | 0 / 0 |

**Interpretation**

- Integrated single **87.7** aligns with Batch 8 **84.0** under the same level (smaller canvas → slightly higher FPS expected).
- Integrated quad **24.3** vs Batch 8 **18.7**: same heavier workload pattern; absolute gap dominated by smaller automation viewport, not a claimed win.
- Gothic near-parity / quad-faster-than-single at this tiny canvas matches a fill-rate-light scene (C4 also saw ~175/170). **Do not** compare gothic FPS to integrated FPS.

### GPU snapshot (`info.reset()` + one render)

| Level | Layout | Draw calls | Triangles | Geometries | Textures (renderer.info) |
| --- | --- | ---: | ---: | ---: | ---: |
| Gothic | single | 9 | 72 | 180 | 48 |
| Gothic | quad | 578 | 3148 | 185 | 48 |
| Integrated | single | 9 | 72 | 262 | 61 |
| Integrated | quad | 1735 | 38406 | 262 | 61 |

**Unverified / caveat:** single-pane draw/tri counts (9 / 72) look like an incomplete lit pass (helpers / empty frustum) under this automation camera; quad counts are the trustworthy relative cost signal. FPS timings remain rAF-based and sample-valid.

### Stress (≥50 each) — closure soak

| Stress | Cycles | Geometry Δ | Texture Δ (renderer.info) | JS cache |
| --- | ---: | ---: | ---: | --- |
| Play/Stop | 50 | **0** | +300 (pre-settle harness) | — |
| Level switch | 50 | **0** | +164 | flat 18 tex / 8 mesh |
| Create/delete | 50 | **0** | 0 | — |
| Materials + undo/redo | 50+50 | **0** | 0 | — |
| Layout switch | 50 | **0** | — | — |
| Asset preview | 50 | — | — | — |

#### Level-switch intervals (geometry bounded; JS caches flat)

| i | geometries | renderer textures | caches (tex/mesh/env) |
| ---: | ---: | ---: | --- |
| 0 | 35 | 370 | 18 / 8 / 0 |
| 10 | 36 | 398 | 18 / 8 / 0 |
| 20 | 36 | 438 | 18 / 8 / 0 |
| 30 | 36 | 478 | 18 / 8 / 0 |
| 40 | 36 | 516 | 18 / 8 / 0 |
| 50 | 36 | 516 | 18 / 8 / 0 |
| return | 35 | 534 | 18 / 8 / 0 |

`geometryClimbBounded: true`. Ownership inventory before/after return-to-test-room **unchanged** (shared/owned/untagged counts identical).

#### Follow-up disposition on texture climb

| Observation | Disposition |
| --- | --- |
| JS texture/mesh/env caches flat across 50 level switches | **F8 shared retention — not a leak** |
| Geometry Δ = 0 on Play/Stop, level switch, create/delete | **Pass — no geometry leak** |
| Play/Stop `renderer.info.textures` +300 in harness | **Not reproduced** as steady-state: 20× Play/Stop @ 30 ms + 1 s settle on `test-room` → **Δtex = 0**. Harness now sleeps 400 ms before after-snap so in-flight async material abort/dispose can finish. |
| Level-switch renderer textures 370→516 then plateau | **Residual risk (open):** progressive `info.memory.textures` with flat JS caches and flat scene ownership inventory. Saturates (40→50 flat). Not classified as unbounded owned scene-graph leak; not fully root-caused. Documented — do not block C5 on F8 shared-cache semantics. |

### Automated

| Check | Result |
| --- | --- |
| `src/tests/c5GpuLifecycle.test.js` | **Pass** — 7 fixes + shared/PP/Water + reconciliation |
| `npm test` | **1193 / 1193** pass |
| `npm run lint` | Exit 0 (existing EditorContext exhaustive-deps warnings only) |
| `npm run build` | **Pass** (~1 s) |

### Browser gates (closure)

| Gate | Result |
| --- | --- |
| `bothLevelsMeasured` | true |
| `resetProtocolUsed` | true |
| `stressOk` | true |
| `stressMinCycles` (≥50) | true |
| `fpsSamplesOk` | true |
| `fpsNotStallOnly` | true |
| `integratedHeavierThanGothic` (single) | true (87.7 ≤ 95.2 + 5) |
| Overall `ok` | **true** |

## 6. Audit dispositions

| ID | Disposition |
| --- | --- |
| **F3** | Measurement integrity closed for unequal-workload confusion; stall-hardened sampler landed; **quad ≥30 FPS on integrated** remains architectural debt (24.3 @ 458×317 — still under target at Batch 8 canvas size historically) |
| **F8** | Owned vs shared instrumented; seven owned-leak fixes verified; shared retention documented; explicit soak release added; no ordinary-path cache purge; residual `info.memory.textures` climb under rapid level-switch **documented open**, not F8 shared-cache failure |

## 7. Remaining unverified conditions

1. Single-pane `measureGpuSnapshot` draw/tri (9/72) under automation camera — needs a focused lit-pass sanity check with a known framing.
2. Root cause of saturating `renderer.info.memory.textures` climb during multi-level switch soak while JS caches + ownership inventory stay flat.
3. Equivalent FPS at Batch 8 canvas (~671×507) — not re-run at that size in this closure (automation shell was ~458×317).
4. `releaseSharedAssetCaches()` soak path not exercised in the closure run (`releaseCaches: false` default — still unsafe if a live level references shared assets).

**C5 acceptance complete. Do not begin C6 or Phase 2G without explicit approval.**
