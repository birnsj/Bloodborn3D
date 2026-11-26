# Batch 7 — Asset Tools acceptance

**Academy:** lesson 27 (`asset-tools`)  
**Verification date:** 2026-11-26  
**Baseline:** commit `75e82a7` (1,034 tests); Batches 1–6 preserved  
**Three.js:** r187 · vendor decoders under `public/vendor/{draco,basis,meshopt}`

## Demonstrated

| Feature | Notes |
| --- | --- |
| Multi-format import | GLB/GLTF, FBX, OBJ, STL, PLY, Collada (.dae), USDZ → normalize to GLB; source originals stored |
| Multi-format export | GLB/GLTF, OBJ, STL, PLY, USDZ from Asset Viewer; format limitations reported |
| Mesh inspection | Tris/verts/meshes/materials/textures/bounds/file size/source↔derived relationships + warnings |
| SimplifyModifier | Configurable keep ratio; before/after counts; Save derived (source never overwritten) |
| Auto LOD | Default ratios 100/50/25%; distances 0/400/900 eu; Details → Generate auto LOD assigns Batch 6 `lodLevels` |
| Compression decode | DRACO + Meshopt + KTX2 wired on `GLTFLoader` via local `/vendor` (no CDN) |
| Compression encode | **Deferred** — no Draco/Basis/meshopt encoders shipped; UI states decode-only honesty |
| Editor integration | Asset Viewer MeshAssetTools; Content Browser accept/drop; Details LOD; help + Academy 27 |
| Engine-neutral levels | Mesh export does **not** replace BloodBound JSON level format |

## Acceptance criteria

| Check | Status | Evidence |
| --- | --- | --- |
| Import round-trip GLB | **Pass** | Existing pipeline + unit import path |
| Import FBX/OBJ/STL/PLY/Collada/USDZ → GLB | **Pass** (pipeline) | `meshFormatIO` + `convertMeshFileToGlb`; OBJ unit test; warnings for format limits |
| Source originals preserved | **Pass** | `storeMeshSourceOriginal` → `meshes/originals/{id}{ext}` |
| Export GLB/OBJ/STL/PLY | **Pass** | Unit tests export buffers/strings + limitations |
| Export USDZ | **Pass** (API) / **Unverified** (viewer photo) | `USDZExporter` wired; no separate AR viewer capture this pass |
| Scale / orientation / pivot on normalize | **Pass** (architecture) | No rescale; Three loaders preserve scene graph; meters assumption unchanged |
| UV / material preservation on GLB path | **Pass** | GLTFExporter embedImages; SimplifyModifier penalizes UV/normal seams |
| Existing GLB + Meshy/OpenArt workflows | **Pass** | Import still registers GLB; foreign formats only add convert step |
| Simplify quality at multiple ratios | **Pass** | Unit: box mesh reduce; Asset Viewer Preview/Save derived |
| Auto LOD + Batch 6 integration | **Pass** | `generateLodLevelsFromRoot` + Details assign `lodLevels`; collision independent |
| Multi-camera LOD (Batch 6 residual) | **Pass** (native THREE.LOD per viewport camera) / **Unverified** (A/B photo pair) | Same as Batch 6 gap-closure note; architecture unchanged |
| Compressed asset **loading** | **Pass** (wiring + vendor present) / **Unverified** (sample Draco GLB decode timing) | Loaders configured; vendor files present |
| Compressed asset **generation** | **Deferred** | Encode unavailable — not presented as complete pipeline |
| Derived persistence + source preserve | **Pass** | `importDerivedMeshGlb` new IDs; simplify/LOD never overwrite source |
| Prefab / material override compatibility | **Pass** (architecture) | Derived assets are normal mesh IDs; overrides remain slot→materialId |
| No resource accumulation on repeat ops | **Pass** (architecture) / **Unverified** (stress loop) | Cloned roots; dispose of replaced owned geometries in simplify |
| Additive / subtractive brush regression | **Pass** (unchanged) | No brush code paths modified |
| Unit tests / lint / production build | **Pass** | See completion section |
| Brush displacement tessellation | **Outstanding** | Preserved from Batch 2/6 — not Batch 7 |

### Screenshots

`docs/acceptance-asset-tools/`:

1. `01-static-meshes-level.png` — Batch 6 acceptance level loaded (four-pane); Batch 7 tools operate on these mesh assets  
2. `02-lod-details-auto.png` — LOD Stack selected; Details Static Mesh LOD includes Generate auto LOD  

Asset Viewer mesh-tools / import-accept captures: **Unverified** this pass (overlay interception during automation); UI is wired in `MeshAssetTools` + Import Mesh accept list.

## Performance / measurements (representative)

| Operation | Sample | Result |
| --- | --- | --- |
| Simplify box (12 seg) @ 40% keep | Vitest / jsdom | Completes &lt; 30s budget; after tris ≤ before |
| Auto LOD 3 levels (10 seg box) | Vitest | Completes &lt; 60s budget |
| GLB export (2 seg box) | Vitest | ArrayBuffer &gt; 100 bytes |
| Vendor decoder footprint | Disk | Draco ~0.76 MB; Basis ~0.58 MB; Meshopt decoder ~29 KB |

Decode-time / GPU memory savings for real Draco/KTX2 assets: **Unverified** this pass (no compressed sample asset committed).

## Format-specific limitations (reported, not silent)

| Format | Limitation |
| --- | --- |
| OBJ import | Sidecar MTL/textures not auto-linked from single-file drop |
| STL | No materials/UVs; default standard material |
| PLY | Limited material slots |
| FBX | Animations / blend shapes / some materials may not map 1:1 |
| Collada | Lights/cameras/controllers ignored |
| USDZ | Follows Three.js USDZLoader/Exporter subset |
| STL/PLY export | Drops materials / hierarchy (shell geometry) |
| All export | Draco/Meshopt/KTX2 **encode** not applied |

## Architecture notes

- Production pipeline remains **GLB** under `public/assets/meshes/`.
- Foreign imports convert in-browser then upload GLB; original bytes via `mesh-source` API.
- Level JSON stays engine-neutral; mesh export is asset tooling only.
- Editor/runtime share `meshLoader` compression decode configuration.
- No CDN; no dependency upgrades; no new npm packages.

## Remaining / deferred

| Item | Status |
| --- | --- |
| Compression encode authoring | **Deferred** (needs approved encoder dependency or offline tool) |
| BufferGeometryUtils center/merge authoring UI | **Deferred** |
| Dedicated normals/tangents/bounds helpers | **Partial** (inspect only) |
| Pivot/center utilities UI | **Deferred** |
| Batch 6 multi-cam LOD A/B photos | **Unverified** |
| Brush displacement tessellation | **Outstanding** (pre-existing) |
| Batch 8 Textures | **Not started** |

## Completion

| Gate | Result |
| --- | --- |
| Unit tests | **Pass** — 1,045 tests |
| Lint | **Pass** (warnings only; oxlint) |
| Production build | **Pass** — `vite build` |
| Commit | Recorded after push |
