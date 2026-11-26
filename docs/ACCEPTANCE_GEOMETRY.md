# Batch 5 — Geometry acceptance

**Level:** `public/levels/acceptance-geometry.json`  
**Academy:** lesson 25 (`native-geometry`)  
**Verification date:** 2026-11-26  
**Gap-closure verification:** 2026-11-26 (player collision + prefab)  
**Implementation commit:** `7592490`  
**Acceptance correction commit:** `d2f6e8a`  
**Baseline:** Batches 1–4 complete; Batch 4 acceptance docs on `main` at `d67345a`  
**Three.js:** r187 · **Rapier:** `@dimforge/rapier3d-compat`

## Defect corrected during verification

| Issue | Result |
| --- | --- |
| `SceneView._finishPrimitiveMeshVisual` referenced `normalizePrimitiveMeshFields` without importing it → unhandled rejection after every PrimitiveMesh build | **Fixed** — import added in `src/runtime/SceneView.js` |
| Gap-closure player/prefab pass | **No new defects** |

## Demonstrated

| Feature | Notes |
| --- | --- |
| Native primitives | Box, Plane, Circle, Sphere, Capsule, Cylinder, Cone, Ring, Torus, TorusKnot, Tetra/Octa/Dodeca/Icosahedron, RoundedBox |
| Procedural | Shape, Extrude (+ bevel), Lathe, Tube (path), Convex hull, Text (local Helvetiker), Parametric |
| Materials | Batch 1/2 + hall mats assigned; live Details showed torusKnot → Batch2 Glass |
| Displacement density | Plane/Sphere `displacementSegments` (demo “Displacement Plane” @ 64²); brush solids not retessellated |
| Collision | Auto + explicit box/sphere/capsule/cylinder/convex/trimesh; Play built **24** Rapier bodies |
| Editor | Creation → Geometry tools; Details type-specific params; serialize/reload |

Architectural brush tools remain above primitive tools and are unchanged.

## Acceptance criteria

| Check | Status | Evidence |
| --- | --- | --- |
| Visual render of every implemented type | **Pass** | 23 PrimitiveMesh types in outliner + scene (box…parametric + Displacement Plane); lit viewport + Top wireframe show ring/torus/polyhedra |
| Parameter editing (type-specific Details) | **Pass** | torusKnot Details: radius/tube, radial segments (~833 verts), material, collision/shadows |
| Profile / path editing | **Pass** (schema) / **Unverified** (dedicated UI) | Profile/path/hull points editable via component fields + JSON; no curve-editor UI (deferred) |
| Material assignment + UV workflows | **Pass** | Material dropdown on PrimitiveMesh; shared UV L1 path; assigned Batch mats in level JSON |
| Visible displacement relief | **Pass** (density path) / **Unverified** (pixel relief) | Segments/displacementSegments exposed and dense plane present; brush tessellation still outstanding — visual bump depends on material displacement maps |
| Grid snap + transforms | **Pass** | Snap on, Grid 25; transform gizmo on selected knot; local transform fields |
| Play-mode collision accuracy | **Pass** | Play **24** bodies; kinematic push against 12 PrimitiveMesh samples (box…octahedron) all blocked; brush colliders present |
| Undo/redo + one history entry per scrub | **Pass** | Unit + shared `SetPrimitiveMeshPropertiesCommand` / gesture API |
| Duplication / parenting / prefab | **Pass** | Prefab round-trip with PrimitiveMesh (cone) + StaticMesh companions verified in Batch 6 gap closure (`batch6AcceptanceCorrections.test.js` + live editor) |
| Save/reload + backward compat | **Pass** | Level loads on schema v2; legacy levels without PrimitiveMesh still load (registry optional) |
| All viewport layouts | **Pass** | Four-pane (Persp / Top / Front / Right) screenshot |
| Additive / subtractive brushes | **Pass** (additive on level) / **Unverified** (subtractive on this level) | Floor brush present; primitives tagged `prop` not CSG; subtractive covered by existing `acceptance-subtractive` + brush code path |
| Geometry rebuild disposes GPU resources | **Pass** | 10× sphere segment rebuild: `renderer.info.memory.geometries` stayed **22** (delta 0) |
| Vertex budget / invalid params | **Pass** | Soft caps + `validatePrimitiveAllocation`; box 128³ estimate rejected in unit tests |

### Screenshots

`docs/acceptance-geometry/` (live editor 2026-11-26):

1. `01-primitive-lineup.png` — Acceptance — Geometry loaded  
2. `02-procedural-overview.png` — earlier overview capture  
3. `03-torusknot-details.png` — selected torusKnot + Primitive Mesh Details (material, segments, collision)  
4. `04-four-pane-layouts.png` — four viewport panes with primitives visible in ortho wireframe  
5. `05-play-mode.png` — Play mode entered (PLAY badge; physics world active)
6. `06-player-collision-probe.png` — gap-closure session after per-primitive push probes

## Player collision probe notes (gap closure)

Method matches Batch 6: Play → teleport near each PrimitiveMesh → push toward center for 70 steps → require `endDist > 0.35` m when a collider exists. Samples: box, plane, circle, sphere, capsule, cylinder, cone, ring, torus, torusKnot, tetrahedron, octahedron — **0 failures**. Floor brush colliders remain.

## Performance measurements

### Live editor (`acceptance-geometry`, Fog+PP on)

| Metric | Value |
| --- | --- |
| PrimitiveMesh actors / holders | 23 types / 23 holders |
| Scene meshes / position verts | 44 meshes / **41,626** verts |
| GPU geometries / textures | **22** / 18 |
| Draw calls / triangles (post `info.reset`) | **44** / **39,806** |
| Frame time (0.5 s sample, uncapped) | **5.55 ms** avg → **180.3 FPS** (`measureFrameTimes`) |
| Rebuild disposal | geometries **22 → 22** after 10 sphere regenerations |
| Play physics bodies | **24** |

Do not treat display-capped ~60 FPS as the performance signal; use frame ms / `measureFrameTimes`.

### CPU geometry generation (Node, 20-loop avg, defaults)

| Primitive | Verts | ms/build |
| --- | --- | --- |
| box | 24 | 0.03 |
| plane (default dens.) | 1089 | 0.21 |
| sphere | 1089 | 0.20 |
| roundedBox | 2916 | 0.76 |
| tube | 1225 | 0.43 |
| parametric | 1089 | 0.41 |
| torusKnot | 833 | 0.20 |

### Segment density sweep (plane / sphere)

| Segs | Plane verts | Plane ms | Sphere verts | Sphere ms |
| --- | --- | --- | --- | --- |
| 8 | 81 | 0.02 | 81 | 0.04 |
| 32 | 1089 | 0.13 | 1089 | 0.22 |
| 64 | 4225 | 0.44 | 4225 | 0.39 |
| 128 | 16641 | 1.87 | 16641 | 2.41 |

Soft caps: `PRIMITIVE_MAX_SEGMENTS = 128`, `PRIMITIVE_MAX_VERTICES = 200_000`.

## Visual vs collision discrepancies

| Visual | Collision (auto) |
| --- | --- |
| Cone | Cylinder approximation |
| Polyhedra | Sphere approximation |
| Text | AABB box from text size |
| Torus / knot / tube / lathe / parametric | Convex hull of visual verts |
| Plane / shape / circle / ring | Thin / footprint box |

Improved StaticMesh / richer collision authoring was a **Batch 6** dependency — **delivered** in Batch 6 (`docs/ACCEPTANCE_STATIC_MESHES.md`). PrimitiveMesh auto approximations remain documented above; explicit collider types are available on both PrimitiveMesh and StaticMesh.

## Batch 2 displacement residual

| Scope | Status |
| --- | --- |
| Prop Plane/Sphere segment density (`displacementSegments`) | **Done** (Batch 5) |
| Architectural **brush** displacement tessellation | **Outstanding** — brushes are not retessellated; do **not** mark the Batch 2 residual fully resolved |

## Remaining limitations

- Full curve / path editor UI — **Deferred**  
- Procedural meshes as subtractive brushes — **Accepted architectural restriction**  
- Approximate auto collision shapes — explicit overrides available (Batch 5/6); auto heuristics remain approximations  
- Brush displacement tessellation — **Outstanding** (Batch 2 residual)  
- Text requires local `public/assets/fonts/helvetiker_regular.typeface.json`  
- ParametricGeometry is scaled radius authoring, not a full surface tool  
- Pointer-lock FPS locomotion “feel” not automatable; Rapier capsule push probes cover collider presence/blocking  

## Dependencies for later batches

- Batch 6: **Done** — see `ACCEPTANCE_STATIC_MESHES.md` (incl. gap-closure collision + prefab)  
- Batch 7: BufferGeometryUtils / Simplify for heavy procedural meshes / automatic LOD generation  
