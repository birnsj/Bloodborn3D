# Pre-Batch 8 — Performance Profiling and Stabilization

**Baseline commit:** `8b4ded6` (integrated editor acceptance, 1,081 tests)  
**Level:** `public/levels/acceptance-integrated-editor.json` (101 actors)  
**Harness:** `src/dev/performanceStabilization.js`  
**CDP:** `import('/src/dev/performanceStabilization.js').then(m => m.runPerformanceStabilization())`  
**Screenshots:** `docs/acceptance-performance-stabilization/`  
**Original gothic mansion:** preserved (`acceptance-gothic-mansion.json`)

## 1. Measurement validity

| Topic | Finding |
| --- | --- |
| `renderer.info` | Accumulates across shadow maps, atmosphere depth prepasses, post-processing, and prior frames. Baseline drawCalls **4,186** matched a **single-viewport** snapshot without `info.reset()` — not a true quad cost. |
| Correct protocol | `measureGpuSnapshot` calls `renderer.info.reset()` then one `renderViewports` / `render`. |
| FPS | rAF-coupled; includes compositor. Automation tabs may throttle. Prefer **median / p95** with warm-up frames. |
| Conditions (this run) | DPR 1.5 · canvas ~671×507 CSS · shell same · 20 logical cores · Chromium automation tab |

`__bloodboundViewport.measureFrameTimes` now returns median, p95, min/max after warm-up.

## 2. Verified root causes

1. **Per-pane shadow map regeneration** — each scissor `renderer.render` rebuilt shadows for shared lights.
2. **Per-pane `tickEnvironmentVisuals`** — full scene traverse every pane.
3. **Per-pane env/lensflare visibility traverses** even when consecutive panes shared the same perspective/ortho flag.
4. **`applyDisplayMode('lit')` full material traverse** — no-op work on the default lit layout.
5. **Atmosphere `captureDepth` also triggered shadow updates** before the main draw.
6. **Water / reflector / refractor RT passes** ran under orthographic cameras (proxies already cover ortho).
7. **`_ensureActorEdgesOverlays` every multi-pane frame** even when all panes were lit.
8. **Baseline heap +39.9 MB** included intentional LOD/prefab asset registration during integrated acceptance — not a pure leak signal.

Ordinary edits already use **incremental sync** (0 full syncs in sync profile). M6 full rebuild remains for load/`setWorld`/asset-revision paths.

## 3. Corrections (scoped)

| Change | Location |
| --- | --- |
| Shadow maps once per multi-pane frame; reuse for remaining scissors | `SceneView.renderViewports` / `_drawScene` |
| Disable shadow autoUpdate during atmosphere depth prepass | `SceneView._drawScene` |
| `tickEnvironmentVisuals` once per frame | `renderViewports` |
| Cache perspective visibility toggles across panes | `renderViewports` |
| Lit display mode short-circuit (no traverse) | `viewportDisplay.js` |
| Skip water/reflector/refractor RT work for ortho cameras | `createThreeEnvironment.js` |
| Edges overlay ensure only when a pane needs wireframe/solid-edges | `renderViewports` |
| Profiling APIs: warm-up, median/p95, `info.reset` GPU snapshot | `Viewport.jsx` |

Visual quality, PP/fog per-pane isolation, actor identity, LOD, instancing, pivots, and serialization preserved. No dependency upgrades. No parallel scene graph.

## 4. Before / after (same level, automation tab)

| Metric | Baseline (`8b4ded6` doc) | After (median / reset protocol) |
| --- | ---: | ---: |
| Single avg FPS / frame ms | 70.1 / 14.3 | **77.4–78.1 / ~12.9** (median FPS **77.5–78.1**) |
| Quad avg FPS / frame ms | 14.5 / 68.8 | **16.8–19.5 / ~51–59** (median FPS **17.5–19.6**) |
| Single drawCalls / tris (reset) | (was cumulative 4186 / 123k) | **4186 / 123,325** |
| Quad drawCalls / tris (reset) | (misread as 4186) | **1797 / 38,574** |
| Dual median FPS | — | **44.6** |
| Quad CPU submit (one frame) | — | ~50–56 ms |

### Provisional targets

| Target | Result |
| --- | --- |
| Single: maintain or improve | **PASS** |
| Quad: ≥30 FPS median | **NOT MET** (best median **~19.6 FPS**) |
| Reduce redundant passes | **PASS** (shadows, env ticks, lit traverse, ortho RT, edges) |
| Eliminate confirmed unbounded leaks | **PASS** (no unbounded growth in controlled cycles) |
| Responsive interactive editing | **PASS** (single + dual interactive; sync ops <200 ms) |

Remaining quad cost is inherent **N independent scissor scene draws** (shared geometry, separate cameras/fill). Hitting 30 FPS without lowering quality or pane count requires larger architecture (e.g. ortho deferred/half-res, temporal inactive-pane refresh) — documented as debt, not implemented.

## 5. Per-pass A/B (quad, profiling-only disables)

| Label | cpuSubmitMs | drawCalls | triangles |
| --- | ---: | ---: | ---: |
| baseline_quad | ~58 | 1797 | 38574 |
| shadows_off | hitch-dominated* | 1797 | 38574 |
| pp_preview_off | ~57 | 1797 | 38574 |
| atmosphere_stubbed | ~57 | 1797 | 38574 |
| overlays_hidden | ~52 | 1795 | 38574 |
| baseline_single | ~14 | 4195 | 123451 |

\*One shadows_off sample spiked on CPU submit (automation hitch); draw/tri counts unchanged. Features restored after each probe.

## 6. Scene sync profile

| Operation | ms (incl. settle) |
| --- | ---: |
| Select brush | 52 |
| Transform nudge | 174 |
| Material assign | 194 |
| Pivot preset | 63 |
| Light intensity | 71 |
| Place/delete | 69 |
| Undo/redo | 52 |

**Sync stats delta:** fullSyncs **0** · incrementalSyncs **7** · actorRebuilds **4** · transformUpdates **1**

## 7. Memory cycles

| Checkpoint | Heap MB | Geometries | Textures |
| --- | ---: | ---: | ---: |
| start | 606.2 | 444 | 56 |
| after place/delete ×20 | 613.3 | 444 | 56 |
| after layout switch | 613.4 | 494 | 56 |
| after Play/Stop | 628.2 | 252 | 62 |
| after undo/redo | 622.0 | 396 | 62 |

**Δ ≈ +15.8 MB** under controlled cycles (no LOD re-generation). Geometry counts fluctuate with sync/Play rebuilds; not a monotonic leak. Prior +39.9 MB included derived LOD assets + prefabs written during integrated acceptance.

## 8. Regression acceptance

| Area | Status |
| --- | --- |
| Multi-viewport isolation (fog/PP/ortho) | **PASS** (unit + smoke) |
| Save/reload integrated level | **PASS** (101 actors) |
| Play/Stop restore | **PASS** |
| Incremental edit sync | **PASS** (0 full syncs) |
| Shadows / PP / fog / atmosphere | **PASS** (not permanently disabled) |
| Water ortho RT skip | **PASS** (perspective unchanged) |
| Lit/wireframe display modes | **PASS** (unit) |
| Gothic original + integrated level preserved | **PASS** |
| Content Browser DnD / pointer-lock walk | **NOT VERIFIED** (manual) |
| Quad ≥30 FPS | **FAIL** (target) / documented debt |

## 9. Screenshots

| File | Captures |
| --- | --- |
| `01-quad-after-stabilization.png` | Quad layout after fixes |
| `02-single-after-stabilization.png` | Single viewport |
| `03-play-after-stabilization.png` | Play mode |

## 10. Architectural debt (separate work)

- Quad 30 FPS at full quality with 4 live independent cameras.
- Optional half-resolution or every-other-frame refresh for inactive ortho panes.
- Shadow atlas / cascaded reuse beyond `autoUpdate` gating.
- M6: further reduce incremental rebuild breadth for material/light-only edits.
- Compression encode (deferred Batch 7) · brush displacement tessellation (outstanding).

## 11. Completion

| Gate | Result |
| --- | --- |
| Profiling harness | `ok: true` |
| Unit tests | **1,085 passed** |
| Lint / build | Pass (warnings only; pre-existing) |
| Commit | pending |
| Batch 8 | **Not started** |
