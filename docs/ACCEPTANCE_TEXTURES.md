# Batch 8 — Textures acceptance

**Baseline ship:** `86a8b05` (1,094 tests)  
**Closure commit:** `1780af3`  
**UV regression closure:** `dc5f925`  
**Level:** `public/levels/acceptance-textures.json`  
**Harness:** `src/dev/textureAcceptanceClosure.js` (phased CDP)  
**Academy:** lesson 29 (`textures`)  
**Screenshots:** `docs/acceptance-textures/`  
**Regression tests:** `src/tests/batch8UvRegression.test.js`

## Architecture (layers)

| Layer | Owner | Role |
| --- | --- | --- |
| Asset `meta.sampler` / `meta.transform` | Texture asset | Wrap, filter, mipmaps, anisotropy, colorSpace, repeat/offset/rotation/center/flipY |
| Material `uvScale` / `uvOffset` / `uvRotation` | Material definition | Layer 2 — multiplies once on top of asset transform |
| Material `mapChannels` | Material definition | Per-slot `Texture.channel` (UV0–UV3); **defaults UV0** (set AO/lightMap explicitly for uv1/uv2) |
| Surface / face UV | Brush / surface edit | Layer 1 — unchanged by Batch 8 |
| Geometry UVs | Mesh / brush / GLB | Layer 0 — preserved |

Sampling remains **asset-id scoped** (no per-material sampler overrides). Independent filtering requires separate texture assets that may share one image path (`tex_batch8_wood_nearest` / `tex_batch8_wood_linear`).

**Transform origin:** Asset transform `center` defaults to **`(0, 0)`**, matching `THREE.Texture` and brush density UVs. Explicit custom centers remain supported.

## Defects corrected

| Severity | Defect | Fix |
| --- | --- | --- |
| P1 | Texture Apply called `clearTextureCache()` and wiped **all** GPU texture cache entries | `invalidateTextureCacheMatching(path)` + dispose matched entries only |
| P1 | Missing UV channel warnings existed as helpers but were not attached at material bind | `createThreeMaterial({ availableUvChannels })` → `userData.bbUvWarnings`; SceneView / StaticMesh bind paths pass geometry inspect |
| P2 | Prior FPS “unverified” used wrong `measureFrameTimes` arg shape (object as seconds → 0 samples) | Documented + harness uses `(seconds, { warmupFrames })` |
| P1 | Texture transform default `center` was **0.5** (Three uses **0,0**) — shifted repeat/rotation/material UV off origin | Default center **0,0**; registry Batch 8 transforms corrected |
| P1 | Default AO/lightMap channels were **UV1** — broke single-UV brush mapping when those maps were assigned | Defaults **UV0**; explicit `mapChannels` still override |

### UV regression root causes

1. **Transform origin:** `DEFAULT_TEXTURE_TRANSFORM.centerU/V = 0.5` made Three’s UV matrix scale/rotate around texture center. With non-unit repeat or material Layer-2 scale, brush density UVs appeared shifted (“mapping coordinates off”). Identity repeat hid the bug; tiled/rotated materials exposed it.
2. **Channel defaults:** `DEFAULT_MAP_CHANNELS.ao` / `lightMap` were `1`, so AO/lightMap sampled `uv1` on single-UV brushes/primitives that only author `uv` (channel 0).

No authored level UV values were rewritten to compensate — implementation defaults were corrected.

## Closure checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| Nearest vs linear filtering | **Passed** | Distinct assets sharing PNG |
| Mipmap / anisotropy / wrap / transform | **Passed** | Inspector + factory; center default 0,0 |
| Color space color vs data | **Passed** | `auto` role mapping |
| Independent settings on shared source image | **Passed** | nearest vs linear assets; material UV independent |
| Material UV does not mutate shared cache | **Passed** | owned clones + compose Layer 2 once |
| Apply updates materials without unrelated reload | **Passed** | selective invalidate; wipedUnrelated = 0 |
| Cancel / draft without Apply | **Passed** | Inspector writes only on Apply |
| Multi-UV geometry UV0–UV2 | **Passed** | `mesh_batch8_multi_uv.glb` fixture |
| UV channel selection visual bind | **Passed** | Explicit UV0/UV1/UV2 on acceptance mats |
| Missing UV channel warnings | **Passed** | UV3 request → `bbUvWarnings` |
| Imported UV data unchanged | **Passed** | uv/uv1/uv2 still present after bind |
| Default channels UV0 | **Passed** | normalize / createThreeMaterial / legacy defs |
| Transform center (0,0) | **Passed** | defaults + registry; custom center still works |
| KTX2 Content Browser import | **Passed** | `.ktx2` import path |
| KTX2 inspect / assign / render | **Passed** | Asset Viewer + `actor_b8_ktx2` |
| Prefab / undo / reload / Play | **Passed** | prior closure + UV fix re-check |
| Additive/subtractive brush | **Passed** | door cut + UV regression tests |
| World-aligned / adjacent align / face UV | **Passed** | `batch8UvRegression` + existing align tests |
| Gothic Mansion visual | **Passed** | editor + Play screenshots |
| Integrated mansion visual | **Passed** | editor + Play screenshots |
| VideoTexture | **Deferred** | |
| KTX2 encode | **Deferred** | |
| Baked lighting | **Deferred** | channel UI only |
| UV generation | **Deferred** | fixture only |
| Brush displacement tessellation | **Deferred** | separately tracked |
| Multi-viewport ≥30 FPS | **Deferred** | architectural debt unchanged |

## Performance (prior closure run)

Conditions: Chromium automation tab · DPR 1.5 · canvas ~671×507 · correct `measureFrameTimes(seconds, {warmupFrames})`.

| Level | Layout | Median FPS |
| --- | --- | ---: |
| Textures acceptance | Single / Quad | **181.8** / **178.6** |
| Integrated mansion | Single / Quad | **84.0** / **18.7** |

No Batch 8 performance regression vs pre-Batch 8 stabilization. Quad mansion remains below 30 FPS (architectural).

## Screenshots

| File | Content |
| --- | --- |
| `01-level-overview.png` | Initial acceptance level |
| `02-texture-inspector-nearest.png` | Nearest sampling inspector |
| `03-ktx2-inspector.png` | KTX2 fixture (ship) |
| `04-multi-uv-channel-compare.png` | Multi-UV actors in level |
| `05-ktx2-inspector-closure.png` | KTX2 inspector during closure |
| `06-gothic-mansion-uv-fix-editor.png` | Gothic Mansion after UV fix (editor) |
| `07-gothic-mansion-uv-fix-play.png` | Gothic Mansion Play parity |
| `08-integrated-mansion-uv-fix-editor.png` | Integrated mansion after UV fix |
| `09-integrated-mansion-uv-fix-play.png` | Integrated mansion Play |

## Automated gates

- `src/tests/batch8UvRegression.test.js` — transform origin, material compose, brush align, channel defaults, multi-UV GLB, serialization.
- Full Vitest suite, lint, production build on UV regression closure commit.
- Academy lesson 29 + Help updated for center `(0,0)` and UV0 defaults.
- Capability inventory: Batch 8 Complete; **do not start Batch 9**.
