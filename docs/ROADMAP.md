# BloodBound3D Roadmap

Approved product/technical roadmap. Implementation status is recorded here as phases complete; see also [`TECHNICAL_STATUS.md`](./TECHNICAL_STATUS.md) for audit findings and debt.

## Baseline

Stabilized repository at Phase 2D completion (`91bc115` and successors). Actor/component model, editor units (100 = 1 m), and engine-neutral level serialization (`schemaVersion` 1–2) are frozen constraints.

---

## Phase 2E — Materials & Surfaces

### Approved design decisions

| Decision | Choice |
| --- | --- |
| Texture density | Retain **local** mapping at **100 editor units** per default texture repeat (`TEXTURE_TILE_EDITOR_UNITS`). |
| Materials workspace | Build a dedicated Materials workspace by **reusing** the existing material editor, asset registry, and preview components. |
| Per-surface UV | Support per-surface **offset, scale, and rotation**. |
| Material asset edits | Explicit **Save / Cancel**, separate from level command history. |
| Cross-surface alignment | Explicit **Align to Neighbor** (not automatic world-space projection). |
| Surface identity | Stable **semantic surface IDs**, not transient triangle indices. |
| Compatibility | Preserve existing materials, levels, and prefabs (additive schema; identity defaults must not change authored look). |

### UV composition contract (Phase 2E.0 / 2E.2)

Layers compose; none replaces another:

1. **Geometry / actor / surface UV** — Structural generators tile by surface size ÷ 100, then apply the actor component’s `uv` (`scale` → `rotation` → `offset`), then optional `faceUVs[surfaceId]` with the same transform order.
2. **Material UV** — `MaterialDefinition.uvScale` / `uvOffset` / `uvRotation` apply on the Three.js texture (`repeat` / `offset` / `rotation`) when the material is built.

Identity defaults on every layer (`scale` 1, `offset` 0, `rotation` 0) leave existing authored materials and levels visually unchanged. Missing `faceUVs` entries inherit actor UV only.

### Sub-phases

| Phase | Goal | Status |
| --- | --- | --- |
| **2E.0** | Correct texture density and UV inconsistencies across structural geometry; document/implement the composition contract. | **Done** |
| **2E.1** | Individual surface selection and material assignment (semantic surface IDs; viewport pick; start with brush faces). | **Done** |
| **2E.2** | Per-surface UV offset / scale / rotation bound to selection; undoable actor state. | **Done** |
| **2E.3** | Explicit Align to Neighbor for adjoining architectural surfaces. | **Done** |
| **2E.4** | Materials workspace (reuse existing editor/registry/preview); Save/Cancel for asset edits. | **Done** |
| **2E.5** | Persistence audit: save/load, prefabs, undo/redo for surface + material actor fields. | **Done** |

**Phase 2E is complete.** Do not begin the next development phase until directed.

### Phase 2E.1 notes

- Tool: **Surface** (toolbar) — separate from Select; Esc returns to Select.
- Semantic IDs live in `src/runtime/surfaces.js`; stored as `component.faceMaterials[surfaceId]`.
- Actor `materialId` remains the fallback when a surface has no override.
- Supported: brush faces (incl. openings/cut solids), mitered walls, ramps, straight/curved stairs, columns, arches, curved walls.
- Acceptance level: `public/levels/acceptance-surfaces.json`.

### Phase 2E.2 notes

- Stored as `component.faceUVs[surfaceId]` → `{ scale, offset, rotation }` (identity entries omitted).
- Details → Selected Surface exposes Scale U/V, Offset U/V, Rotation, and **Reset Surface UV**.
- Actor-level and material-level UV controls remain unchanged.
- Same geometry coverage as 2E.1; acceptance level demonstrates independent surface UV transforms.

### Phase 2E.3 notes

- Tool: **Align** — click reference surface, then target; only target `faceUVs` is written (undoable).
- Rules in `src/rules/alignSurfaces.js`: coplanar adjoining **Brush** AABB faces; matches composed UV at the shared contact (accounts for actor transforms / UV layers).
- Rejects without mutation: non-coplanar/corners, gaps, mitered prisms, curved/column/arch/stair/ramp, opposite faces.
- Preserves local density mapping — no world-space projection or triplanar.
- Limitations: corners, curved surfaces, and non-coplanar geometry are out of scope for this tool.
- Acceptance: `Align Wall A` / `Align Wall B` in `acceptance-surfaces.json` show seamless `pz` continuity across different wall sizes.

### Phase 2E.4 notes

- Workspace: **Materials** — searchable library with thumbnails; New / Duplicate; draft editor; 3D preview (sphere / cube / plane).
- Reuses `MaterialDefinition`, asset registry / Content Browser APIs, `MaterialDefinitionForm`, and `MaterialPreviewCanvas`.
- Explicit **Save / Cancel**; drafts do not write the persistent asset until Save. Leave / switch warns when dirty.
- Material asset edits are separate from level undo/redo and level dirty tracking.
- After Save, placed instances refresh via asset revision + `resyncWorld` (no level reload).
- Details panel material fields also use Save/Cancel (with a Materials… shortcut).
- Out of scope: shader graphs, procedural textures, AI integration.

### Phase 2E.5 notes

- Persistence audit for the full 2E materials/surfaces pipeline (no new features).
- Verified: level save/load (`acceptance-surfaces.json`, schema 1→2), brush resize retention, prefab create/instantiate/override/sync for `faceMaterials`/`faceUVs`, undo/redo (assign, UV, Align), Play/Stop snapshot restore, material asset Save/Cancel drafts, shared-asset draft contract.
- History apply paths normalize `faceMaterials` / `faceUVs`; editor surface assign/UV uses `patchFaceMaterial` / `patchFaceUv`.
- Regression suite: `phase2e5Persistence.test.js` (plus prior 2E.0–2E.4 tests).
- Known 2E limitations remain: Align is coplanar Brush faces only; no world-space / triplanar projection; Materials workspace is the only non-level workspace completed in 2E.

### Dependencies

```
2E.0 → 2E.1 → 2E.2 → 2E.3
2E.0 → 2E.4 (can parallel after 2E.0)
2E.1–2E.4 → 2E.5
```

### Out of scope for 2E

- Automatic world-space UV projection
- Incremental scene sync (audit M6)
- Runtime/editor dependency split (M8)
- Static-mesh collider redesign (M10)

---

## Phase 2F — Geometry Editing

Approved design: [`PHASE_2F_SPEC.md`](./PHASE_2F_SPEC.md). TrenchBroom-style convex brush editing
inside the existing editor. Parametric construction tools and all existing levels are preserved;
editable geometry is a separate `ConvexBrush` component reached by explicit conversion.

### Approved design decisions

| Decision | Choice |
| --- | --- |
| Brush representation | New **`ConvexBrush`** component (vertex/face B-rep); do **not** overload `Brush.size` |
| Conversion | Explicit, undoable **Convert to Convex Brush**; parametric Brush/Ramp/Stair/Column/Arch/CurvedWall unchanged |
| Element modes | Face / Edge / Vertex (independent of Actor and Surface); Move only in 2F.0–2F.5 |
| Validation | Reject invalid/ambiguous edits; never silently drop unselected vertices or face material/UV maps |
| Subtract / openings / miters | Subtract + openings not convertible; mitered walls (no openings) convertible; cutter∩ConvexBrush prevented or explicitly reported |
| Collision | Rapier `convexHull` matching rendered vertices |
| Schema | Level `schemaVersion` **3** only when a ConvexBrush is present; otherwise continue emitting **2** |
| Prefabs | ConvexBrush (including nested) must round-trip; geometry overrides are atomic |
| Extrude | New prism brush from face (Face Move covers same-brush pull) |
| Marquee selection | Deferred to **2F.6** |
| Map generation | **Not** in 2F — reserved as **Phase 2G** |

### Sub-phases

| Phase | Goal | Status |
| --- | --- | --- |
| **2F.0** | Editable convex brush architecture (data model, convert, render, collision, persistence) | **Done** |
| **2F.1** | Face editing | **Done** |
| **2F.2** | Edge editing | **Done** |
| **2F.3** | Vertex editing | **Done** |
| **2F.4** | Extrusion and clipping | **Done** |
| **2F.5** | Integration and persistence verification | **Done** |
| **2F.6** | Multiple viewports and orthographic editing | Not started (appended; does not renumber 2F.0–2F.5) |

### Phase 2F.0 notes

- New `ConvexBrush` component + `src/geometry/*` (validate, hull, convert, UV projection, cutter intersection).
- Details → **Convert to Convex Brush** (undoable). Blocked for subtractive brushes, openings, and overlapping cutters.
- Rapier `convexHull` collider; SceneView grouped surface mesh; Surface tool works via component-aware face IDs.
- Level writer emits `schemaVersion` 3 only when a ConvexBrush is present; otherwise remains 2.
- Cutter ∩ ConvexBrush intersections are reported (create subtract after convert).
- Regression: `phase2f0ConvexBrush.test.js`; browser harness `public/dev/phase2f0Acceptance.js`.
- Face / edge / vertex editing, extrude, clip, and multi-viewport (2F.6) are **not** in 2F.0.

### Phase 2F.1 notes

- Toolbar **Face** mode (`tool === 'geometry'`, `geometryMode === 'face'`); Edge/Vertex disabled until 2F.2/2F.3.
- `geometrySelection` UI state with transition table; face pick/highlight overlays; Move gizmo + face-normal handle.
- `moveVertices` (fast path + rehull + lineage) via `SetConvexGeometryCommand`; invalid edits leave authored geometry unchanged.
- Grid-snapped world-space anchor moves; multi-actor atomic face moves; one drag = one undo step.
- Acceptance: `public/levels/acceptance-face-editing.json`; harness `public/dev/phase2f1Acceptance.js`; `phase2f1FaceEditing.test.js`.
- Edge / vertex / extrude / clip / multi-viewport are **not** in 2F.1.

### Phase 2F.2 notes

- Toolbar **Edge** mode (`geometryMode === 'edge'`); derived edge keys `vA|vB`; screen-space pick with depth check + Alt x-ray.
- Edge highlight via Three.js `Line2`; moves reuse `moveVertices` / `SetConvexGeometryCommand` / geometry drag pipeline.
- Acceptance: `public/levels/acceptance-edge-editing.json`; harness `public/dev/phase2f2Acceptance.js`; `phase2f2EdgeEditing.test.js`.
- Vertex / extrude / clip / multi-viewport are **not** in 2F.2.

### Phase 2F.3 notes

- Toolbar **Vertex** mode (`geometryMode === 'vertex'`); screen-space pick + Alt x-ray; sphere handles; Move only.
- Rejects interior / coincident (VERTEX_MERGE) / invalid topology without mutating authored geometry.
- Degree ≥ 4 apex moves covered (pyramid acceptance actor); marquee deferred to 2F.6.
- Acceptance: `public/levels/acceptance-vertex-editing.json`; harness `public/dev/phase2f3Acceptance.js`; `phase2f3VertexEditing.test.js`.
- Extrude / clip / multi-viewport are **not** in 2F.3.

### Phase 2F.4 notes

- Face extrude creates a new convex prism sibling (`"<name> Extrusion"`); source brush unchanged; front cap inherits face material/UV.
- Clip by three grid-snapped points or selected face plane; modes keep-front / keep-back / split; preview before Enter; Esc cancels.
- Surviving face IDs/materials preserved; new caps get new IDs and actor material fallback (Q3).
- Eligible plain Brush auto-converts inside the same undo step (Q11); multi-brush clips are atomic.
- Acceptance: `public/levels/acceptance-extrusion-clipping.json`; harness `public/dev/phase2f4Acceptance.js`; `phase2f4ExtrusionClipping.test.js`.
- Integration verification / multi-viewport are **not** in 2F.4.

### Phase 2F.5 notes

- Integrated acceptance level `public/levels/acceptance-convex-brushes.json` covers convert, face/edge/vertex, extrude/clip, hierarchy, transformed actors, cutter conflicts, and parametric preservation.
- Harness `public/dev/phase2f5Acceptance.js`; report `docs/ACCEPTANCE_CONVEX_BRUSHES.md`; unit suite `phase2f5Integration.test.js`.
- Gothic mansion regression re-verified unmodified (no ConvexBrush injected).
- Prefab create/override/sync/nested, schema 1–3, Play/Stop, and undo/redo covered by unit + browser passes.
- Phase 2F is **complete** after **2F.6**.

### Phase 2F.6 — Multiple Viewports and Orthographic Editing

**Done** (2026-11-24). Shared SceneView scissor multi-pane; default quad Perspective/Top/Front/Right;
ortho cameras + grid plane; per-pane display modes; marquee; maximize/restore; prefs persistence;
single vs quad frame timing in harness.

- Acceptance: `docs/ACCEPTANCE_MULTI_VIEWPORT.md`; harness `public/dev/phase2f6Acceptance.js`
- Units: `viewportPrefs.test.js`, `viewportCameras.test.js`, `marqueeSelection.test.js`, `phase2f6MultiViewport.test.js`

### Dependencies

```
2F.0 → 2F.1 → 2F.2
2F.0 → 2F.1 → 2F.3
2F.0 → 2F.1 → 2F.4
2F.1–2F.4 → 2F.5 → 2F.6
```

### Out of scope for 2F

- Rule-based map generation (**Phase 2G**)
- General polygon / Blender-style modeling; concave meshes; true CSG
- Replacing parametric construction tools
- New npm dependencies for hull building

---

## Phase 2G — Rule-Based Map Generation (reserved)

Reserved. Not started. Do not begin until Phase 2F (including 2F.6) is complete and the designer
directs work to start. See Phase 2F non-goals and `PHASE_2F_SPEC.md`.
