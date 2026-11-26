# Batch 7 — Asset Tools acceptance

**Academy:** lesson 27 (`asset-tools`)  
**Implementation:** commit `8d5af2e`  
**Verification (gap closure):** commit `1897cfd` (1,060 tests)  
**Final acceptance closure:** 2026-11-26 — DRACO/KTX2 fixtures + decode, multi-format import, GLTF/USDZ export/reimport, render evidence  
**Baseline before this closure:** `1897cfd`  
**Three.js:** r187 · vendor decoders under `public/vendor/{draco,basis,meshopt}`

## Defects corrected

| Issue | Result |
| --- | --- |
| `lodHysteresis` stored in `userData` but never applied to `THREE.LOD.addLevel` hysteresis | **Fixed** (gap closure) — convert eu→meters→fraction of level distance |
| Manual `lodPreview` left `LOD.autoUpdate === true`, so the renderer overwrote forced visibility | **Fixed** (gap closure) — `autoUpdate = false` when preview ≥ 0 |
| Binary STL export returned `DataView`; reimport/`Blob` consumers expected `ArrayBuffer` | **Fixed** (gap closure) — normalize to `ArrayBuffer` in `exportMeshRoot` |
| USDZ export called `USDZExporter.parse()` (callback-only in r187); returned `undefined` data | **Fixed** (final closure) — use `parseAsync`; assert `ArrayBuffer` |
| Import used deprecated `USDZLoader` (r179+) | **Fixed** (final closure) — use `USDLoader` |

## Demonstrated

| Feature | Notes |
| --- | --- |
| Multi-format import | GLB/GLTF, FBX, OBJ, STL, PLY, Collada, USDZ → GLB normalize; source originals stored |
| Multi-format export | GLB/GLTF, OBJ, STL, PLY, USDZ; limitations reported (not silent) |
| Mesh inspection | Tris/verts/materials/bounds/relationships in Asset Viewer |
| SimplifyModifier | Non-destructive derived assets; measured on Meshy character GLB |
| Auto LOD | Ratios 100/50/25%; distances 0/400/900 eu; Details Generate auto LOD |
| Compression decode | Meshopt + **DRACO** + **KTX2** sample decode **Pass**; local `/vendor` **Pass**; encode **Deferred** |
| Multi-camera LOD | Unit near/mid/far cameras + two-pane editor screenshot; Batch 6 residual **closed** |
| Brush regression | Additive on static-meshes level; subtractive acceptance level validates |

## Acceptance criteria

| Check | Status | Evidence |
| --- | --- | --- |
| Import/export OBJ ↔ OBJ, STL ↔ STL | **Pass** | Furniture stand-in (2 meshes, 3 mats, 288 tris): OBJ/STL reimport 288 tris; STL hierarchy collapse = format limit |
| PLY round-trip | **Pass** | 48 → 48 tris |
| GLB cube scale/pivot | **Pass** | 1×1×1 m bounds, 12 tris, 1852 B |
| Foreign format warnings | **Pass** | OBJ MTL, STL materials/UVs reported |
| Source originals preserved | **Pass** | `meshes/originals/` + API |
| Export USDZ viewer photo | **Unverified** | API wired; no AR Quick Look / Reality Viewer capture (device-dependent) |
| Simplify 25/50/75% on production mesh | **Pass** | `mesh_b18711df23cd.glb` (8.2 MB, 5092 tris) — see measurements |
| Source unchanged after simplify | **Pass** | Source tris remain 5092 across all ratios |
| Auto LOD generation | **Pass** | L0 5092 / L1 2546 / L2 1273 in 6.4 ms |
| Multi-camera LOD selection | **Pass** | Unit: near→L0, mid→L1, far→L2; screenshots `03`/`04` |
| Manual lodPreview + hysteresis | **Pass** | autoUpdate false; hyst 0.0625 @ 4 m |
| Collision independent of LOD | **Pass** | Collider count 1 before/after `lodPreview=2` |
| Meshopt decode (local) | **Pass** | `fixtures/meshopt_triangle.glb` → 3 verts / 1 tri in 1.0 ms |
| DRACO sample decode | **Pass** | Khronos Box + Duck via local `/vendor/draco` — see Final closure measurements |
| KTX2 sample decode | **Pass** | three.js `2d_uastc` / `2d_etc1s` + `ktx2_quad.gltf` via `/vendor/basis` |
| Vendor without CDN | **Pass** | All decoder fetches `localhost:5174/vendor/...`; `cdnHits: []` |
| Compression encode | **Deferred** | Honest UI + inventory |
| FBX import | **Pass** | `fixtures/fbx/vCube.fbx` → 12 tris / 1 mesh (cm-scale bounds ~200 — Three.js FBXLoader units) |
| Collada import | **Pass** | `fixtures/collada/polygons.dae` → 2 tris / 1 mesh |
| GLTF import | **Pass** | Khronos plain Box → 12 tris / ~1 m bounds |
| GLTF export/reimport | **Pass** | 48→48 tris; 1×1×1 m bounds preserved |
| USDZ export/reimport | **Pass** | 352→352 tris; 1×1×1 m bounds; `parseAsync` binary |
| Geometry / materials / UVs / transforms | **Pass** | DRACO Duck texture map present; GLTF/USDZ bounds match; FBX scale noted as loader units |
| Asset Viewer / editor / Play render | **Pass** | Screenshots `05`–`08` (DRACO Duck + KTX2 quad) |
| Repeat simplify lifecycle | **Pass** | 5× simplify/dispose; source tris stable |
| Meshy/OpenArt/GLB workflows | **Pass** | Character GLB used for simplify; static-meshes level intact |
| Prefab / material overrides | **Pass** | Static-meshes level: 1 override actor; prior Batch 6 prefab tests |
| Additive brush regression | **Pass** | Floor + Additive Wall on static-meshes |
| Subtractive brush regression | **Pass** | `acceptance-subtractive.json` validates (15 actors) |
| Unit tests / lint / build | **Pass** | See completion |
| Brush displacement tessellation | **Outstanding** | Preserved |

### Screenshots

`docs/acceptance-asset-tools/`:

1. `01-static-meshes-level.png` — Batch 6 level (four-pane)  
2. `02-lod-details-auto.png` — LOD Stack selected  
3. `03-multi-cam-lod-level.png` — LOD Stack + multi-viewport session  
4. `04-two-pane-lod-selected.png` — two-pane layout; LOD Stack selected for independent cameras  
5. `05-asset-viewer-draco-duck.png` — DRACO Duck decode + Asset Viewer stand-in render  
6. `06-editor-draco-duck.png` — editor viewport framing of same decoded Duck  
7. `07-play-draco-duck.png` — Play-mode framing of same decoded Duck  
8. `08-asset-viewer-ktx2.png` — KTX2/`KHR_texture_basisu` quad (BASIS UASTC visible)

## Performance / measurements

### Simplification — `mesh_b18711df23cd.glb` (Meshy character, 8,243,336 B)

| Keep ratio | Target reduction | Before tris | After tris | Before verts | After verts | Achieved | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 75% | 25% | 5092 | 3819 | 4028 | 3207 | 25.0% | 10.1 ms |
| 50% | 50% | 5092 | 2546 | 4028 | 2327 | 50.0% | 6.0 ms |
| 25% | 75% | 5092 | 1273 | 4028 | 1373 | 75.0% | 5.3 ms |

Degradation warnings: none at these ratios. Silhouette/UV/normal seam penalties are handled by SimplifyModifier’s Meshopt attribute weights; no unacceptable results observed at measured ratios. Extreme (&gt;95%) reduction still emits a preview warning (unit-covered).

### Auto LOD (same character)

| Level | Ratio | Tris | Distance (eu) | Time (all 3) |
| --- | --- | --- | --- | --- |
| L0 | 100% | 5092 | 0 | |
| L1 | 50% | 2546 | 400 | 6.4 ms |
| L2 | 25% | 1273 | 900 | |

### Export (character root)

| Format | Bytes | Time | Limitation |
| --- | --- | --- | --- |
| OBJ | 890,870 | ~10 ms | Materials/textures incomplete |
| STL | 254,684 | ~3 ms | Drops materials, UVs, hierarchy |

### Furniture stand-in round-trip (multi-material box + leg)

| | Tris | Meshes | Materials | Notes |
| --- | --- | --- | --- | --- |
| Source | 288 | 2 | 3 | Textured wood + metal slots |
| OBJ reimport | 288 | — | — | MTL sidecar not auto-linked (format/workflow limit) |
| STL reimport | 288 | 1 | — | Hierarchy collapse = STL format limit |

### Compression decode (final closure — browser CDP @ `localhost:5174`)

Raw: `docs/acceptance-asset-tools/measurements-final.json`

| Asset | Bytes / notes | Decode | Result |
| --- | --- | --- | --- |
| `fixtures/meshopt_triangle.glb` | 1,888 | 1.0 ms | 3 verts / 1 tri |
| `fixtures/draco/Box.gltf` | Khronos CC-BY 4.0 | **30.1 ms** | 12 tris / 24 verts; `KHR_draco_mesh_compression` |
| `fixtures/draco/Duck.gltf` | SCEA Shared Source | **23.0 ms** | 4212 tris / 2399 verts; texture map **yes** |
| `fixtures/ktx2/2d_uastc.ktx2` | three.js MIT | **48.8 ms** | 40×40 compressed texture |
| `fixtures/ktx2/2d_etc1s.ktx2` | three.js MIT | **47.1 ms** | 40×40 compressed texture |
| `fixtures/ktx2/ktx2_quad.gltf` | wrapper + UASTC | **49.1 ms** | 2 tris; map compressed; `KHR_texture_basisu` |
| Draco decoder WASM | 192,420 | — | Local `/vendor/draco/gltf/` |
| Basis transcoder WASM | 527,333 | — | Local `/vendor/basis/` |
| Meshopt decoder JS | 29,256 | — | Local `/vendor/meshopt/` |

Vendor fetches observed (no CDN):

- `/vendor/draco/gltf/draco_wasm_wrapper.js`
- `/vendor/draco/gltf/draco_decoder.wasm`
- `/vendor/basis/basis_transcoder.js`
- `/vendor/basis/basis_transcoder.wasm`

GPU: KTX2 samples load as `CompressedTexture` (GPU-compressed formats). Exact VRAM delta vs RGBA is platform-dependent; presence of compressed maps after transcode is verified.

Encode authoring: **Deferred**.

### Multi-format import / export (final closure)

| Op | Time | Geometry | Scale / notes |
| --- | --- | --- | --- |
| FBX `vCube.fbx` | 7.5 ms | 12 tris / 36 verts | Bounds ~200 (FBX cm units via Three.js loader — format behavior) |
| Collada `polygons.dae` | 4.5 ms | 2 tris / 6 verts | Mesh present |
| GLTF Khronos Box | 5.8 ms | 12 tris / 24 verts | ~1×1×1 m |
| GLTF export→reimport | — | 48→48 tris | Bounds 1×1×1 preserved |
| USDZ export→reimport | 7.7 ms | 352→352 tris | Bounds 1×1×1; 29,884 B |

## Format-specific limitations (not BloodBound defects)

| Format | Limitation |
| --- | --- |
| OBJ | Sidecar MTL/textures not auto-linked from single-file drop |
| STL | No materials/UVs/hierarchy |
| PLY | Limited material slots |
| FBX | Unit scale often centimeters; animations/blend shapes may not map 1:1 |
| Collada / USDZ | Per Three.js loader subset (animations/lights may drop) |
| All export | No Draco/Meshopt/KTX2 encode |

## Remaining / deferred

| Item | Status |
| --- | --- |
| Compression encode authoring | **Deferred** |
| BufferGeometryUtils / pivot UI | **Deferred** |
| USDZ AR viewer photo (Quick Look / Reality) | **Unverified** — device/OS dependent; export/reimport **Pass** |
| Brush displacement tessellation | **Outstanding** |
| Batch 8 Textures | **Not started** |

## Fixtures

See `public/assets/fixtures/README.md` and `licenses/`. Sources: Khronos glTF-Sample-Assets, three.js r187 examples. No encoders implemented.

## Completion

| Gate | Result |
| --- | --- |
| Unit tests | **Pass** — 1,063 tests |
| Lint | **Pass** (warnings only) |
| Production build | **Pass** |
| Commit | Recorded after push |

**Batch 7 final acceptance:** implemented import/export/decode/render paths verified with fixtures, measurements, and screenshots. Deferred encode + outstanding brush tessellation preserved. Batch 8 not started.
