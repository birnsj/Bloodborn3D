# Batch 5 — Geometry acceptance

**Level:** `public/levels/acceptance-geometry.json`  
**Academy:** lesson 25 (`native-geometry`)  
**Date:** 2026-11-26  
**Baseline:** Batches 1–4 complete; 1,000+ unit tests green before implementation  
**Three.js:** r187 · **Rapier:** `@dimforge/rapier3d-compat`

## Demonstrated

| Feature | Notes |
| --- | --- |
| Native primitives | Box, Plane, Circle, Sphere, Capsule, Cylinder, Cone, Ring, Torus, TorusKnot, Tetra/Octa/Dodeca/Icosahedron, RoundedBox |
| Procedural | Shape, Extrude (+ bevel), Lathe, Tube (path), Convex hull, Text (local Helvetiker), Parametric (klein/mobius/plane) |
| Materials | Batch 1/2 + hall mats assigned per actor |
| Displacement density | Plane/Sphere `displacementSegments` (demo “Displacement Plane” @ 64²) |
| Collision | Auto + explicit box/sphere/capsule/cylinder/convex/trimesh |
| Editor | Creation → Geometry tools; Details scrub + undo; serialize/reload |

Architectural brush tools (Wall, Floor, Subtract, …) remain unchanged and are still listed above the primitive tools.

## Browser checklist

| Check | Result |
| --- | --- |
| Place each primitive / procedural type from Geometry toolbar | Pass (unit + level) |
| Edit type-specific params; one Undo per scrub gesture | Pass |
| Grid snap + editor units (100 eu = 1 m) | Pass |
| Material assignment on PrimitiveMesh | Pass |
| Dense plane/sphere for displacement maps | Pass (segments exposed; brush topology untouched) |
| Play-mode collision (auto primitives + convex fallback) | Pass (PhysicsWorld) |
| Duplicate / parent / prefab / dirty tracking | Pass (shared actor pipeline) |
| Save/reload + legacy levels without PrimitiveMesh | Pass |
| Multi-viewport (same SceneView sync) | Pass |
| Additive / subtractive brushes unchanged | Pass (primitives tagged `prop`, not brushes) |
| Geometry rebuild disposes prior GPU buffers | Pass (`bbPrimitiveDispose` + `disposeObject`) |
| Vertex budget reject over-limit allocations | Pass (`validatePrimitiveAllocation`) |

### Screenshots

`docs/acceptance-geometry/` (live editor 2026-11-26):

1. `01-primitive-lineup.png` — Acceptance — Geometry loaded; outliner shows PrimitiveMesh actors; Geometry toolbar includes Batch 5 tools  
2. `02-procedural-overview.png` — maximized viewport with primitive props visible  

**Live check:** Outliner lists box…parametric + Displacement Plane (25 actors). Creation → Geometry exposes Box Prim through Parametric.

## Performance notes

- Soft caps: `PRIMITIVE_MAX_SEGMENTS = 128`, `PRIMITIVE_MAX_VERTICES = 200_000`.  
- Plane @ 64×64 ≈ 4.2k verts; sphere @ 48×32 ≈ 1.6k; rounded box default ≈ 2.9k.  
- Editor acceptance pass with Fog+PP on; vsync-capped display ~60 FPS — use frame-time / `syncStats` for uncapped profiling.  
- Trimesh collision on high-density meshes is expensive; prefer `auto` / convex for props.

## Visual vs collision discrepancies

| Visual | Collision (auto) |
| --- | --- |
| Cone | Cylinder approximation |
| Polyhedra | Sphere approximation |
| Text | AABB box from text size |
| Torus / knot / tube / lathe / parametric | Convex hull of visual verts |
| Plane / shape / circle / ring | Thin / footprint box |

## Batch 2 displacement residual

**Resolved for props:** raise `displacementSegments` (or width/height segments) on Plane/Sphere PrimitiveMesh actors.  
**Accepted limitation:** architectural brush solids are **not** retessellated — changing brush topology for displacement would alter authored CSG. Use native planes/spheres where relief must be visible.

## Remaining limitations

- Profile/path/hull point editing is schema + defaults (JSON); no dedicated curve editor UI yet.  
- ParametricGeometry scaled by radius; not a full authoring surface.  
- Text requires local `public/assets/fonts/helvetiker_regular.typeface.json`.  
- Nested subtractive use of procedural meshes is intentionally unsupported.  
- Batch 6 static-mesh shadow/collision options remain separate.

## Dependencies for later batches

- Batch 6: richer StaticMesh collision / shadows (primitives already expose cast/receive).  
- Batch 7: BufferGeometryUtils / Simplify for heavy procedural meshes.
