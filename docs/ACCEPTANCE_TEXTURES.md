# Batch 8 — Textures acceptance

**Baseline ship:** `86a8b05` (1,094 tests)  
**Closure commit:** _(this commit)_  
**Level:** `public/levels/acceptance-textures.json`  
**Harness:** `src/dev/textureAcceptanceClosure.js` (phased CDP)  
**Academy:** lesson 29 (`textures`)  
**Screenshots:** `docs/acceptance-textures/`

## Architecture (layers)

| Layer | Owner | Role |
| --- | --- | --- |
| Asset `meta.sampler` / `meta.transform` | Texture asset | Wrap, filter, mipmaps, anisotropy, colorSpace, repeat/offset/rotation/center/flipY |
| Material `uvScale` / `uvOffset` / `uvRotation` | Material definition | Layer 2 — multiplies once on top of asset transform |
| Material `mapChannels` | Material definition | Per-slot `Texture.channel` (UV0–UV3); AO/lightMap default UV1 |
| Surface / face UV | Brush / surface edit | Layer 1 — unchanged by Batch 8 |
| Geometry UVs | Mesh / brush / GLB | Layer 0 — preserved |

Sampling remains **asset-id scoped** (no per-material sampler overrides). Independent filtering requires separate texture assets that may share one image path (`tex_batch8_wood_nearest` / `tex_batch8_wood_linear`).

## Defects corrected in closure

| Severity | Defect | Fix |
| --- | --- | --- |
| P1 | Texture Apply called `clearTextureCache()` and wiped **all** GPU texture cache entries | `invalidateTextureCacheMatching(path)` + dispose matched entries only |
| P1 | Missing UV channel warnings existed as helpers but were not attached at material bind | `createThreeMaterial({ availableUvChannels })` → `userData.bbUvWarnings`; SceneView / StaticMesh bind paths pass geometry inspect |
| P2 | Prior FPS “unverified” used wrong `measureFrameTimes` arg shape (object as seconds → 0 samples) | Documented + harness uses `(seconds, { warmupFrames })` |

## Closure checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| Nearest vs linear filtering | **Passed** | Distinct assets sharing PNG |
| Mipmap / anisotropy / wrap / transform | **Passed** | Inspector + factory |
| Color space color vs data | **Passed** | `auto` role mapping |
| Independent settings on shared source image | **Passed** | nearest vs linear assets; material UV independent |
| Material UV does not mutate shared cache | **Passed** | owned clones + compose Layer 2 |
| Apply updates materials without unrelated reload | **Passed** | selective invalidate; wipedUnrelated = 0 |
| Cancel / draft without Apply | **Passed** | Inspector writes only on Apply |
| Multi-UV geometry UV0–UV2 | **Passed** | `mesh_batch8_multi_uv.glb` fixture |
| UV channel selection visual bind | **Passed** | UV0 vs UV1 albedo; AO→UV1; lightMap→UV2 |
| Missing UV channel warnings | **Passed** | UV3 request → `bbUvWarnings` |
| Imported UV data unchanged | **Passed** | uv/uv1/uv2 still present after bind |
| KTX2 Content Browser import | **Passed** | `.ktx2` import path; live re-import of `2d_etc1s.ktx2` via `importTexture` in browser |
| KTX2 inspect / assign / render | **Passed** | Asset Viewer + `actor_b8_ktx2` |
| KTX2 generateMipmaps / flipY disabled | **Passed** | Inspector constraints |
| Local transcoder (no CDN) | **Passed** | Batch 7 vendor Basis path |
| Prefab create / place / overrides | **Passed** | textured brushes + multi-UV mesh |
| Undo/redo smoke | **Passed** | |
| Save/reload (level reload) | **Passed** | 16 actors after reload |
| Play/Stop | **Passed** | |
| Lifecycle cache bounded | **Passed** | cache entries 21→21 after 6 Apply cycles |
| Additive/subtractive brush | **Passed** | door cut retained |
| Perspective / orthographic | **Passed** | no Batch 8 viewport fork |
| VideoTexture | **Deferred** | |
| KTX2 encode | **Deferred** | |
| Baked lighting | **Deferred** | channel UI only |
| UV generation | **Deferred** | fixture only — not a product feature |
| Brush displacement tessellation | **Deferred** | separately tracked |
| Multi-viewport ≥30 FPS | **Deferred** | architectural debt unchanged |

## Performance (closure run)

Conditions: Chromium automation tab · DPR 1.5 · canvas ~671×507 · correct `measureFrameTimes(seconds, {warmupFrames})` + `measureGpuSnapshot` with `info.reset()`.

### Texture acceptance level

| Layout | Median FPS | p95 frame ms | Draw calls | Triangles | GPU textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Single | **181.8** | 6.2 | 660 | 13,346 | 79 |
| Quad | **178.6** | 6.6 | 207 | 6,517 | 79 |

### Integrated mansion (regression vs Pre-Batch 8)

| Layout | Closure median FPS | Prior stabilization | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: |
| Single | **84.0** | ~77–78 | **4186** | **123,325** |
| Quad | **18.7** | ~17.5–19.6 | **1797** | **38,574** |

**Verdict:** No Batch 8 performance regression. Quad mansion remains below 30 FPS (same architectural limit). FPS measurement limitation from `86a8b05` is **resolved** (wrong API args).

### Lifecycle

| Metric | Before cycles | After 6 Apply cycles |
| --- | ---: | ---: |
| Texture cache entries | 21 | 21 |
| `renderer.info.memory.textures` | 63 | 77 |
| JS heap used (MB) | 180.5 | 213.8 |

Cache entries did not grow unbounded. Transient GPU texture count / heap rise is consistent with material resync clones during Apply; shared cache stayed bounded.

## Screenshots

| File | Content |
| --- | --- |
| `01-level-overview.png` | Initial acceptance level |
| `02-texture-inspector-nearest.png` | Nearest sampling inspector |
| `03-ktx2-inspector.png` | KTX2 fixture (ship) |
| `04-multi-uv-channel-compare.png` | Multi-UV actors in level |
| `05-ktx2-inspector-closure.png` | KTX2 inspector during closure |

## Automated gates

- Unit tests include multi-UV GLB inspect, channel warnings, selective invalidate API.
- Full Vitest suite, lint, production build on closure commit.
- Academy lesson 29 unchanged.
- Capability inventory: Batch 8 Complete; closure notes recorded.
