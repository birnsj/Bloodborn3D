# Consolidation C5 — GPU Resource Lifecycle and Rendering Performance

**Status:** Complete (2026-11-26)  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) (F3 measurement integrity, F8)  
**Baseline:** C4 `480c398` · 1171 tests · 176 first-party lint warnings  
**Closure:** Full browser soak `ok: true` · ≥50 cycles all families · stall-hardened `measureFrameTimes` · **1195** tests · **176** lint warnings · production build OK  
**Constraints:** No Phase 2G map generator. Do not claim FPS wins across unequal workloads. Preserve shared-cache semantics for interactive editing.

Raw soak capture: [`c5-soak-stress-capture.json`](./c5-soak-stress-capture.json)

## 1. Performance measurement integrity

### Historical report reconciliation

| Report | Level | Actors | Median FPS (single / quad) | Conditions |
| --- | --- | ---: | --- | --- |
| Batch 8 textures | `acceptance-integrated-editor.json` | **101** | **84.0 / 18.7** | Chromium automation · DPR 1.5 · ~671×507 · correct `measureFrameTimes(s,{warmupFrames})` |
| Pre-Batch 8 stabilization | same integrated | **101** | **~77.5–78.1 / ~17.5–19.6** | Same protocol after shadow/env/ortho fixes |
| C4 quick acceptance | `acceptance-gothic-mansion.json` | **35** | **~175 / ~170** | `phase2f7gAcceptance({ quick: true })` Gothic profile |
| **C5 full soak (post shadow-map fix)** | gothic / integrated | **35 / 101** | see measured table | Cursor Chromium · DPR 1.5 · canvas CSS ~458×382 · stall-hardened sampler |

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
| Water / mirror / refraction RTs | Env `bbEnvDispose` | `disposeObject` → `bbEnvDispose` (exactly-once) |
| Post-processing buffers | Controller-owned | `postProcessingController.dispose` |
| PP texture cache (`_ppTextureCache`) | SceneView-owned | `_clearPpTextureCache` + generation bump on level switch |
| Light shadow maps / spot maps | Light holder `bbLightDispose` | `disposeObject` → `bbLightDispose` → `light.shadow.dispose()` |
| ViewHelper / overlays | SceneView / gizmo | `SceneView.dispose` / gizmo dispose |
| Asset Viewer / MeshPreview | Preview-local | `disposeObjectTree` on close |

### F8 disposition

Shared material/mesh/env **JS caches** remain process-lifetime by design for interactive editing. C5 soak confirms those caches stay flat across 50 level switches.

A progressive `renderer.info.memory.textures` climb during Play/Stop and level-switch was **root-caused and fixed** (not F8 shared-cache retention): point-light cube shadow maps (color + depth = 2 textures each) were reallocated on every `syncFromWorld` without calling `bbLightDispose` / `light.shadow.dispose()`. After the fix, Play/Stop ×50 and level-switch ×50 report **Δtextures = 0**.

C5 adds:

- `inventoryGpuOwnership(root)` — separate shared / owned / untagged counts
- `disposeSharedSubtree` — explicit free when abandoning a cache root
- `clearMeshCache({ dispose })` — dispose shared GLTF roots on clear (default on)
- `clearEnvironmentMapCache({ dispose })` — dispose equirects on clear
- `releaseSharedAssetCaches()` — soak / test reset only (never ordinary level switch)

### Owned-leak fixes (seven original + shadow-map)

| # | Bug | Fix | Proof |
| --- | --- | --- | --- |
| 1 | Water.js reflection `WebGLRenderTarget` never freed | Capture RT on first draw; dispose in env teardown | Unit: Water dispose ×3 idempotent |
| 2 | StaticMesh material override orphaned `createThreeMaterial` + clone | Use createMaterial result directly; mark owned | Unit: override ownership |
| 3 | `_ppTextureCache` survived level switches / late async loads | Clear + generation bump; late loads disposed | Unit: PP generation race |
| 4 | Dual `bbEnvDispose` on holder + root | Register once on holder | Unit + source contract |
| 5 | `disposeObjectTree(root, { geometries: false })` ignored options | Options honored | Unit |
| 6 | PMREM cube texture wrongly `bbShared` | Removed; RT remains caller-owned | Unit + source contract |
| 7 | InstancedMesh material clone maps | `markSharedMaterialTextures` after clone | Unit: shared maps survive consumer dispose |
| 8 | Point-light shadow maps leaked on Play/Stop / sync (+6 tex/sync = 3 lights × cube color + cube depth) | `createThreeLight` dispose frees `shadow.map`/`mapPass`; `disposeObject` invokes `bbLightDispose` | Unit + browser: Play/Stop ×50 Δtex **0**; level-switch ×50 Δtex **0** |

### Shared textures / PP race / Water once (acceptance checks)

| Check | Result |
| --- | --- |
| Shared maps stay alive when one consumer is disposed | **Pass** (unit) |
| Async PP loads after `_clearPpTextureCache` cannot repopulate | **Pass** (unit — generation guard disposes late tex) |
| Water / mirror RT dispose idempotent (exactly once) | **Pass** (unit) |

## 3. Extended lifecycle stress

`runC5GpuLifecycleAcceptance()` (full mode) ran **50 iterations** each of:

- Play / Stop
- Level switching (gothic ↔ integrated ↔ subtractive ↔ convex ↔ test-room; end on start level)
- Actor create / undo-delete
- Material assign + undo/redo
- Single ↔ quad layout switching
- Asset Viewer / Meshes tab open-close

Interval snapshots every ~10 level switches classify **bounded cache growth** vs **progressive leaks**.

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

### Conditions (closure soak, post shadow-map fix)

- Cursor/Electron Chromium · DPR **1.5** · canvas CSS **~458×382** (buf ~687×573) · shell 458×382
- `hardwareConcurrency` 20 · `deviceMemoryGB` 32
- `measureFrameTimes(0.7s, { warmupFrames: 18, stallMs: 120, minSamples: 24 })`
- Post-processing preview **on** · shadow map enabled
- Note: canvas smaller than Batch 8 (~671×507); absolute FPS not claimed as wins/losses vs Batch 8

### Median FPS (stall-hardened)

| Level | Actors | Single median FPS | Quad median FPS | Samples (s/q) | Discarded stalls |
| --- | ---: | ---: | ---: | --- | ---: |
| Gothic mansion | 35 | **181.8** | **129.9** | 121 / 85 | 0 / 0 |
| Integrated editor | 101 | **95.2** | **23.9** | 66 / 24 | 0 / 0 |

**Interpretation**

- Integrated single **95.2** ≪ gothic single **181.8** under the same protocol → unequal workloads confirmed.
- Integrated quad **23.9** remains below the aspirational **≥30 FPS** target (architectural debt; unchanged).
- Gothic near-parity / high quad FPS at this canvas matches a fill-rate-light scene. **Do not** compare gothic FPS to integrated FPS.

### GPU snapshot (`info.reset()` + one render)

| Level | Layout | Draw calls | Triangles | Geometries | Textures (renderer.info) |
| --- | --- | ---: | ---: | ---: | ---: |
| Gothic | single | 9 | 72 | 167 | 36 |
| Gothic | quad | 542 | 3088 | 179 | 36 |
| Integrated | single | 9 | 72 | 256 | 43 |
| Integrated | quad | 1664 | 38286 | 256 | 43 |

**Unverified / caveat:** single-pane draw/tri counts (9 / 72) look like an incomplete lit pass (helpers / empty frustum) under this automation camera; quad counts are the trustworthy relative cost signal. FPS timings remain rAF-based and sample-valid.

### Stress (≥50 each) — post shadow-map fix

| Stress | Cycles | Geometry Δ | Texture Δ (renderer.info) | JS cache |
| --- | ---: | ---: | ---: | --- |
| Play/Stop | 50 | **0** | **0** | — |
| Level switch | 50 | **0** | **0** | flat 18 tex / 8 mesh |
| Create/delete | 50 | **0** | — | — |
| Materials + undo/redo | 50+50 | **0** | **0** | — |
| Layout switch | 50 | **0** | — | — |
| Asset preview | 50 | — | — | — |

#### Level-switch intervals (geometry bounded; JS caches flat; no progressive tex climb)

| i | geometries | renderer textures | caches (tex/mesh/env) |
| ---: | ---: | ---: | --- |
| 0 | 35 | 40 | 18 / 8 / 0 |
| 10…50 | 36 | 22 | 18 / 8 / 0 |
| return | 35 | 40 | 18 / 8 / 0 |

`geometryClimbBounded: true`. Ownership inventory before/after return-to-test-room **unchanged**. Texture count tracks which level is resident (lighter mid-cycle levels), not a leak.

#### Defect disposition (texture climb)

| Observation | Disposition |
| --- | --- |
| Pre-fix Play/Stop climbed +6 textures/cycle (3 point lights × cube color + cube depth) | **Fixed** — `bbLightDispose` + `light.shadow.dispose()` |
| Pre-fix level-switch climbed ~+4 textures/switch with flat JS caches | **Fixed** by the same shadow-map dispose path |
| Post-fix Play/Stop ×50 and level-switch ×50 | **Δgeo = 0, Δtex = 0** |
| JS texture/mesh/env caches flat across 50 level switches | **F8 shared retention by design — not a leak** |

### Automated

| Check | Result |
| --- | --- |
| `src/tests/c5GpuLifecycle.test.js` | **Pass** — 7 original fixes + shadow dispose + shared/PP/Water + reconciliation |
| `npm test` | **1195 / 1195** pass |
| `npm run lint` | Exit 0 · **176** warnings (C4 baseline parity) |
| `npm run build` | **Pass** |

### Browser gates (closure)

| Gate | Result |
| --- | --- |
| `bothLevelsMeasured` | true |
| `resetProtocolUsed` | true |
| `stressOk` | true |
| `stressMinCycles` (≥50) | true |
| `fpsSamplesOk` | true |
| `fpsNotStallOnly` | true |
| `integratedHeavierThanGothic` (single) | true (95.2 ≤ 181.8 + 5) |
| Overall `ok` | **true** |

## 6. Audit dispositions

| ID | Disposition |
| --- | --- |
| **F3** | Measurement integrity closed for unequal-workload confusion; stall-hardened sampler landed; **quad ≥30 FPS on integrated** remains architectural debt (23.9 @ ~458×382; Batch 8 historically 18.7 @ ~671×507) |
| **F8** | Owned vs shared instrumented; seven owned-leak fixes + shadow-map leak verified; shared retention documented; explicit soak release added; no ordinary-path cache purge; progressive `info.memory.textures` climb **closed** |

## 7. Remaining unverified conditions

1. Single-pane `measureGpuSnapshot` draw/tri (9/72) under automation camera — needs a focused lit-pass sanity check with a known framing.
2. Equivalent FPS at Batch 8 canvas (~671×507) — not re-run at that size in this closure (automation shell was ~458×382).
3. `releaseSharedAssetCaches()` soak path not exercised in the closure run (`releaseCaches: false` default — still unsafe if a live level references shared assets).

**C5 acceptance complete. Do not begin C6 or Phase 2G without explicit approval.**
