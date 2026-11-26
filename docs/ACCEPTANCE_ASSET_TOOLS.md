# Batch 7 — Asset Tools acceptance

**Academy:** lesson 27 (`asset-tools`)  
**Implementation:** commit `8d5af2e`  
**Verification (this pass):** 2026-11-26 — gap closure on outstanding pipeline items  
**Baseline before Batch 7:** `75e82a7` (1,034 tests)  
**Three.js:** r187 · vendor decoders under `public/vendor/{draco,basis,meshopt}`

## Defects corrected during verification

| Issue | Result |
| --- | --- |
| `lodHysteresis` stored in `userData` but never applied to `THREE.LOD.addLevel` hysteresis | **Fixed** — convert eu→meters→fraction of level distance |
| Manual `lodPreview` left `LOD.autoUpdate === true`, so the renderer overwrote forced visibility | **Fixed** — `autoUpdate = false` when preview ≥ 0 |
| Binary STL export returned `DataView`; reimport/`Blob` consumers expected `ArrayBuffer` | **Fixed** — normalize to `ArrayBuffer` in `exportMeshRoot` |

## Demonstrated

| Feature | Notes |
| --- | --- |
| Multi-format import | GLB/GLTF, FBX, OBJ, STL, PLY, Collada, USDZ → GLB normalize; source originals stored |
| Multi-format export | GLB/GLTF, OBJ, STL, PLY, USDZ; limitations reported (not silent) |
| Mesh inspection | Tris/verts/materials/bounds/relationships in Asset Viewer |
| SimplifyModifier | Non-destructive derived assets; measured on Meshy character GLB |
| Auto LOD | Ratios 100/50/25%; distances 0/400/900 eu; Details Generate auto LOD |
| Compression decode | Meshopt fixture decode **Pass**; DRACO/KTX2 wiring + local `/vendor` **Pass**; encode **Deferred** |
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
| Export USDZ viewer photo | **Unverified** | API wired; no AR viewer capture |
| Simplify 25/50/75% on production mesh | **Pass** | `mesh_b18711df23cd.glb` (8.2 MB, 5092 tris) — see measurements |
| Source unchanged after simplify | **Pass** | Source tris remain 5092 across all ratios |
| Auto LOD generation | **Pass** | L0 5092 / L1 2546 / L2 1273 in 6.4 ms |
| Multi-camera LOD selection | **Pass** | Unit: near→L0, mid→L1, far→L2; screenshots `03`/`04` |
| Manual lodPreview + hysteresis | **Pass** | autoUpdate false; hyst 0.0625 @ 4 m |
| Collision independent of LOD | **Pass** | Collider count 1 before/after `lodPreview=2` |
| Meshopt decode (local) | **Pass** | `fixtures/meshopt_triangle.glb` → 3 verts / 1 tri in 1.0 ms |
| DRACO sample decode | **Unverified** | No Draco sample asset (encode deferred); decoder WASM local **Pass** |
| KTX2 sample decode | **Unverified** | No KTX2 sample asset (encode deferred); transcoder WASM local **Pass** |
| Vendor without CDN | **Pass** | `/vendor/...` from `localhost:5174`; no CDN URLs in support descriptor |
| Compression encode | **Deferred** | Honest UI + inventory |
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

### Compression decode

| Asset | Bytes | Decode | Result |
| --- | --- | --- | --- |
| `fixtures/meshopt_triangle.glb` | 1,888 | 1.0 ms | 3 verts / 1 tri |
| Draco decoder WASM | 192,420 | — | Local `/vendor/draco/gltf/` |
| Basis transcoder WASM | 527,333 | — | Local `/vendor/basis/` |
| Meshopt decoder JS | 29,256 | — | Local `/vendor/meshopt/` |

GPU memory savings for compressed textures: **Unverified** (no KTX2 sample). Encode authoring: **Deferred**.

## Format-specific limitations (not BloodBound defects)

| Format | Limitation |
| --- | --- |
| OBJ | Sidecar MTL/textures not auto-linked from single-file drop |
| STL | No materials/UVs/hierarchy |
| PLY | Limited material slots |
| FBX / Collada / USDZ | Per Three.js loader subset (animations/lights may drop) |
| All export | No Draco/Meshopt/KTX2 encode |

## Remaining / deferred

| Item | Status |
| --- | --- |
| Compression encode authoring | **Deferred** |
| BufferGeometryUtils / pivot UI | **Deferred** |
| DRACO / KTX2 sample asset decode timing | **Unverified** until sample assets exist |
| Brush displacement tessellation | **Outstanding** |
| Batch 8 Textures | **Not started** |

## Completion

| Gate | Result |
| --- | --- |
| Unit tests | **Pass** — full suite after verification |
| Lint | **Pass** (warnings only) |
| Production build | **Pass** |
| Commit | Recorded after push |
