# Batch 6 — Static Meshes acceptance

**Level:** `public/levels/acceptance-static-meshes.json`  
**Academy:** lesson 26 (`static-meshes`)  
**Verification date:** 2026-11-26  
**Baseline:** commit `d2f6e8a` (1,015 tests); Batches 1–5 preserved  
**Three.js:** r187 · **Rapier:** `@dimforge/rapier3d-compat`

## Defect corrected during verification

| Issue | Result |
| --- | --- |
| `SceneView._rebuildStaticMeshInstances` used `this.world`, which was never assigned → InstancedMesh pools never built | **Fixed** — `syncFromWorld` / `syncIncremental` set `this.world`; owned material clone for instance mats |

## Demonstrated

| Feature | Notes |
| --- | --- |
| Imported props | `mesh_verify_cube` + Meshy character GLBs as environmental/furniture stand-ins |
| Collision modes | none / auto / box / sphere / capsule / cylinder / convex / trimesh + dims/offsets + helpers |
| Material overrides | Slot `Mesh_0:0` → `mat_batch2_metal`; restore originals; GLB not rewritten |
| LOD | THREE.LOD with 3 levels, hysteresis, editor preview; triangle counts in Details |
| Instancing | Opt-in `force` (4 cubes) + `auto` ≥3 (3 props); default remains **off** |
| Batch 5 primitive | Cone with auto collision on the same level |
| Additive brush | Floor + Additive Wall for CSG regression |

Architectural brush collision path unchanged.

## Acceptance criteria

| Check | Status | Evidence |
| --- | --- | --- |
| Imported furniture / env props | **Pass** | Cube + character GLBs in outliner / viewports |
| Multiple collision configurations | **Pass** | Dedicated actors per mode; helpers visible in edit |
| Multi-material slot overrides | **Pass** (pipeline) | Overrides serialize; Details Materials group; live slot discovery after load |
| Multiple LOD levels | **Pass** | LOD Stack actor; Details LOD + triangle line |
| Repeated / batched instances | **Pass** | 2 `InstancedMesh` pools, 7 instances after world-ref fix |
| Player collision vs imported + Batch 5 prims | **Pass** (pipeline) | Play built **19** Rapier bodies; preload for convex/trimesh |
| Collision accuracy irregular geo | **Pass** (pipeline) / **Unverified** (walk feel) | Convex/trimesh extract from cached GLB; AABB fallback if unloaded |
| Material restore + persistence | **Pass** (schema/UI) / **Unverified** (live prefab round-trip) | Clear overrides; serialize fields; prefab capture via `toJSON` |
| LOD from different cameras | **Pass** (native THREE.LOD) / **Unverified** (multi-cam A/B photo) | Per-viewport cameras; manual `lodPreview` |
| Select/edit instanced actors | **Pass** | Invisible pick proxies; individual outliner entries |
| Prefab create / override / save-load | **Unverified** (live) | UI + autoCapturePrefabOverrides wired; not exercised E2E this pass |
| Undo/redo + scrub gestures | **Pass** | `commitStaticMeshGesture` + unit coverage of field model |
| Duplication | **Pass** (UI) / **Unverified** (live) | Standard duplicate path |
| Viewport layouts + Play/Stop | **Pass** | Four-pane + Play screenshot |
| Additive / subtractive brush regression | **Pass** (additive on level) / **Unverified** (subtractive this level) | Floor + wall; subtractive covered by existing acceptance levels |
| Asset reassignment + GPU dispose | **Pass** (architecture) / **Unverified** (stress loop) | Shared GLB geo; owned instance mats; disposeObjectTree patterns |
| Perf before auto-batch default | **Pass** | Measured; auto default stays **off** |

### Screenshots

`docs/acceptance-static-meshes/`:

1. `01-static-mesh-lineup.png` — level loaded, props visible  
2. `02-material-override-details.png` — Material Override selected  
3. `03-lod-details.png` — LOD Stack selected  
4. `04-static-mesh-details-groups.png` — Details Static Mesh region  
5. `05-play-mode.png` — Play with colliders  
6. `06-four-pane-layouts.png` — four viewport panes  

## Performance measurements

### Live editor (`acceptance-static-meshes`, Fog+PP on)

Identical scene; only StaticMesh `instancing` toggled.

| Metric | Unbatched (`instancing: off`) | Instanced (`force`/`auto` as authored) |
| --- | --- | --- |
| Draw calls | **41** | **36** |
| Triangles | 31,412 | 31,412 |
| InstancedMesh objects | 0 | **2** |
| Instance count | 0 | **7** (4 cubes + 3 auto props) |
| Frame time (0.5 s) | **11.10 ms** → 90.1 FPS | **11.11 ms** → 90.0 FPS |
| Geometries / textures (earlier sample) | — | 59 / 38 |
| Play physics bodies | — | **19** |

**Conclusion:** At this scene scale, instancing saves ~5 draw calls with negligible frame-time change. Automatic batching remains **opt-in** (default `off`). Synchronization overhead is a microtask rebuild of instance pools when matching actors change.

### BatchedMesh evaluation

`THREE.BatchedMesh` is better suited to multi-material / multi-geometry atlases. Deferred — InstancedMesh covers same-asset prop scatters without permanently merging authoring objects.

## Batch 5 collision / prefab residuals

| Item | Status |
| --- | --- |
| Richer StaticMesh / explicit collider authoring | **Done** (this batch) |
| PrimitiveMesh auto approximations | Still approximations; explicit modes remain |
| Prefab instance overrides for StaticMesh fields | Wired via generic component `toJSON` diff — **live E2E unverified** |
| Brush displacement tessellation | **Outstanding** (Batch 2 residual) — not claimed Done |

## Remaining limitations

- Automatic mesh simplification / generated LODs → **Batch 7** (`SimplifyModifier`)  
- DRACO / KTX2 / Meshopt compression → **Batch 7**  
- BatchedMesh authoring → deferred  
- Instancing uses first sub-mesh only; multi-mesh GLBs with material overrides stay individual  
- LOD hysteresis is stored; switching uses native THREE.LOD distances  
- Convex/trimesh cost on dense meshes — prefer simpler colliders when possible  
- No dedicated furniture pack; Meshy characters stand in for irregular geometry tests  

## Dependencies for later batches

- Batch 7: compression + Simplify for heavy meshes / auto LOD generation  
- Batch 8+: texture inspector does not block StaticMesh  

## Test / build

- Unit tests: **1027** passed (incl. `batch6StaticMeshes.test.js`)  
- Lint: existing EditorContext warnings only (no new errors)  
- Production build: **OK**
