# Batch 6 — Static Meshes acceptance

**Level:** `public/levels/acceptance-static-meshes.json`  
**Academy:** lesson 26 (`static-meshes`)  
**Verification date:** 2026-11-26  
**Gap-closure verification:** 2026-11-26 (player collision + prefab round-trip)  
**Baseline:** commit `d2f6e8a` (1,015 tests); Batches 1–5 preserved  
**Implementation commit:** `86d1e61`  
**Three.js:** r187 · **Rapier:** `@dimforge/rapier3d-compat`

## Defect corrected during verification

| Issue | Result |
| --- | --- |
| `SceneView._rebuildStaticMeshInstances` used `this.world`, which was never assigned → InstancedMesh pools never built | **Fixed** (in `86d1e61`) — `syncFromWorld` / `syncIncremental` set `this.world`; owned material clone for instance mats |
| Gap-closure pass (collision walk + prefab E2E) | **No new defects** — probes and prefab round-trip passed without code changes |

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
| Player collision vs imported + Batch 5 prims | **Pass** | Play **19** bodies; kinematic push into each collidable StaticMesh/Primitive blocked (`endDist` > 0.35 m) |
| Collision dimensions / offsets | **Pass** | Box `collisionSize` 120 eu → half-extents 0.6 m; unit test offset 100 eu → local translation 1 m |
| No-collision traversal | **Pass** | `Prop — No Collision` body count **0**; point query at center does not hit that actor |
| Irregular mesh (convex/trimesh) | **Pass** | Convex/trimesh actors blocked player push; bodies present after GLB preload |
| Collision independent of LOD | **Pass** | LOD Stack collider count **1** before/after `lodPreview = 2` |
| Unintended blocking / penetration | **Pass** | No collidable actor allowed center penetration in push probes; brushes Floor + Additive Wall retain bodies |
| Brush collision unchanged | **Pass** | Floor half-extents 8×0.1×6 m; Additive Wall body present |
| Material restore + persistence | **Pass** | Slot overrides + restore UI; prefab serialize preserves `materialOverrides` |
| LOD from different cameras | **Pass** | Closed in Batch 7 verification: unit near/mid/far cameras + two-pane screenshots (`docs/acceptance-asset-tools/03-*.png`, `04-*.png`); hysteresis + manual preview autoUpdate fixed |
| Select/edit instanced actors | **Pass** | Invisible pick proxies; individual outliner entries; unique instance actor IDs |
| Prefab create / override / save-load | **Pass** | Live create from Box+Cone+LOD+Material Override; 2 instances; sphere/mat override on A only; serialize/deserialize round-trip |
| Undo/redo + scrub gestures | **Pass** | `commitStaticMeshGesture` + `SetStaticMeshPropertiesCommand` undo/redo unit |
| Duplication / independent identity | **Pass** | Two prefab instances → 4 unique actor IDs; unpack preserves edited collision |
| Viewport layouts + Play/Stop | **Pass** | Four-pane + Play screenshot |
| Additive / subtractive brush regression | **Pass** | Additive on this level; subtractive re-validated via `acceptance-subtractive.json` in Batch 7 verification |
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
7. `07-collision-prefab-verification.png` — gap-closure session (geometry level after static-mesh probes)

## Player collision probe notes (gap closure)

Method: Play mode → teleport kinematic capsule near each actor → apply velocity toward center for 70 Rapier steps → require `endDist > 0.35` m for collidable props. No-collision verified by `getColliderCount === 0` and `intersectionsWithPoint` not owning that actor.

| Actor | Type | Result |
| --- | --- | --- |
| Prop — No Collision | none | Pass (0 bodies) |
| Auto / Box / Sphere / Capsule / Cylinder | primitives | Pass (blocked) |
| Convex / Trimesh | mesh extract | Pass (blocked) |
| LOD Stack | box | Pass; LOD preview does not drop body |
| Instanced cubes / Auto-Instance props | box/auto | Pass (per-actor bodies) |
| Batch5 Cone | PrimitiveMesh auto | Pass |
| Floor / Additive Wall | Brush | Pass |

Pointer-lock FPS “feel” remains outside automated coverage; probes exercise the same Rapier bodies the player uses.

## Prefab round-trip notes (gap closure)

| Step | Result |
| --- | --- |
| Create prefab from StaticMesh (box, LOD, material override) + PrimitiveMesh (cone) | Pass — 3 StaticMesh + 1 PrimitiveMesh templates |
| Two instances at distinct poses | Pass — unique actor IDs |
| Override instance A collision → sphere + wood material | Pass — B retains box / original override |
| `serializeLevel` / `deserializeLevel` | Pass — overrides, LOD levels (3), cone primitive preserved |
| Unpack / undo StaticMesh edit (unit) | Pass |

Covered by `src/tests/batch6AcceptanceCorrections.test.js` + live editor world exercise.

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
| Richer StaticMesh / explicit collider authoring | **Done** (Batch 6) |
| PrimitiveMesh player collision (per-shape push) | **Done** — gap closure on `acceptance-geometry` (12 samples blocked; 24 bodies) |
| Prefab instance overrides for StaticMesh / PrimitiveMesh | **Done** — live + unit round-trip |
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
