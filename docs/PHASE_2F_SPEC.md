# Phase 2F — Geometry Editing: Technical Specification

Status: **APPROVED** (designer sign-off 2026-11-24). All §13 defaults accepted; additions below.
**Implementation:** 2F.0–2F.4 **Done** (2026-11-24). 2F.5+ not started.
Source of truth for scope: the Phase 2F design request + approval additions. Source of truth for
current behavior: the repository as of Phase 2E complete (`b283a13` and successors).

**Approved additions (binding):**

1. Hull reconstruction must **not** silently remove unselected vertices or discard existing surface
   material / UV assignments. Ambiguous topology changes are **rejected** (`AMBIGUOUS_LINEAGE`,
   `INTERIOR_VERTEX`, `VERTEX_MERGE`, `UNSELECTED_VERTEX_LOST`).
2. Unsupported intersections between subtractive cutters and convex brushes are **prevented or
   explicitly reported**, including cutters placed **after** conversion.
3. Prefab assets containing ConvexBrush (including **nested** prefabs) must verify schema
   compatibility and round-trip fidelity.
4. Existing levels and parametric construction tools are **preserved** (Brush / Ramp / Stair /
   Column / Arch / CurvedWall unchanged; conversion is explicit and reversible via undo).
5. **Phase 2F.6** — Multiple Viewports and Orthographic Editing (appended; does not renumber
   2F.0–2F.5). See §7.7 and `docs/ROADMAP.md`.
6. **Phase 2G** is reserved for rule-based map generation (not started in 2F).

Terminology used throughout:

- **Existing** — verified by reading the current code (file cited).
- **Approved** — a design decision locked by the 2026-11-24 approval (defaults + additions).
- **eu** — editor units (100 eu = 1 m). All geometry data is authored in eu; conversion to meters
  happens only at the Three.js / Rapier boundary (`src/core/units.js`).

---

## 1. Objective and non-goals

### 1.1 Objective

TrenchBroom-style architectural brush editing inside the existing editor: select faces, edges and
vertices of a convex brush, move them on the grid, extrude faces, clip brushes, with collision that
matches what is rendered, and with stable face identities so materials and UV overrides survive.

### 1.2 Explicit non-goals (enforced, not just "deferred")

| Non-goal | Enforcement |
| --- | --- |
| General polygon / Blender-style modeling (loop cuts, bevel, knife, subdivision, sculpt) | No such operation exists in the geometry API. |
| Concave meshes | Every committed geometry passes the convexity validator (§6). A concave result is *rejected*, never stored. |
| Replacing the parametric brush system | `Brush`, `Ramp`, `Stair`, `Column`, `Arch`, `CurvedWall` are untouched. ConvexBrush is a **new component type** reached only by explicit conversion or by creating one from an operation (extrude / split). |
| Boolean CSG (convex cutters, convex-vs-convex carving) | Out of scope. See §9 compatibility ruling. |
| Cross-brush vertex welding / shared vertices | Each brush owns its vertices. |
| Rotate / scale of element selections | Move only in 2F (§7.4). |
| Map generation | Not started. Not designed here. |
| New npm dependencies | None. The hull builder is in-house; Three.js and Rapier already exist. |

---

## 2. Review findings that constrain the design

All verified in the repository.

1. **`BrushComponent` is an AABB by construction.** Its only geometry is `size {x,y,z}`
   (`src/components/BrushComponent.js`). Roughly 30 non-test call sites do
   `getComponent('Brush')` and read `.size`: `EditorContext`, `commands`, `Viewport`, `SceneView`,
   `PhysicsWorld`, `wallEndpoints`, `Inspector`, `DetailsPanel`, `brushBoolean`, `alignSurfaces`,
   `gridSnap`. Adding an optional "geometry" field to `Brush` would make every one of those sites
   silently wrong for non-box brushes. → **ConvexBrush must be a separate component type** so that
   code asking for `'Brush'` skips it by construction.
2. **Surface identity is semantic, keyed by string ID** (`faceMaterials[surfaceId]`,
   `faceUVs[surfaceId]`, `src/runtime/surfaces.js`). The six box IDs `px nx py ny pz nz` are
   fixed per component type through `ALLOWED_BY_TYPE`; normalization **drops unknown IDs**.
   Picking already supports a "grouped" scheme (`userData.surfaceIds` + geometry groups →
   `surfaceIdFromHit`), which is exactly what a convex mesh needs. → Face identity can reuse the
   existing surface pipeline, but the *allowed-ID set must become component-aware* instead of
   type-aware.
3. **Subtraction is AABB partition only** (`brushBoolean.js`). `cutterHoleInBrushLocal` rejects
   non-axis-aligned cutters; `applyWorldSubtraction` only ever sees `'Brush'` actors; limit
   `MAX_SUBTRACT_SOLIDS = 64`, `MIN_SOLID_SIZE = 0.5 eu`. There is no general CSG to build on.
4. **Openings are AABB partition** (`wallOpenings.js`) and are **ignored while miters exist**;
   miters (`miteredWallGeometry.js`) produce a *convex 8-vertex prism* and already collide through
   `RAPIER.ColliderDesc.convexHull` (`PhysicsWorld._addBrushColliders`). Mitered walls without
   openings are therefore directly convertible; walls with openings are concave and are not.
5. **Rendering is a full-world rebuild on most changes** (`SceneView.syncFromWorld`, audit M6).
   The only incremental path is `updateBrushGeometry(actor)`, and it **falls back to
   `syncFromWorld` for any actor without a `Brush` component**. A ConvexBrush must get its own
   per-actor rebuild path or every drag sample would rebuild the world.
6. **The transform gizmo is axis-string based** (`'x'|'y'|'z'`) and brush-size aware
   (`BrushGizmo.js`); drag samples report an editor-unit delta along one world axis; the viewport
   previews without history and commits one command on release (`previewBrushGeometry` /
   `commitBrushGeometry`). This is reusable for element moves; a face "normal" handle needs the
   axis concept generalized to a direction vector.
7. **Grid snapping** (`gridSnap.js`) snaps brush AABB *min faces* by edge and props by pivot, and
   assumes the AABB is centered on the actor pivot. A ConvexBrush's local bounds are not centered
   on its pivot, so snapping needs an offset-aware variant.
8. **History is snapshot-friendly.** `HistoryStack` (limit 100) executes `do()/undo()` commands
   that address actors by id and apply normalized state (`SetBrushMaterialCommand`,
   `applySurfaceFields`). A geometry command can follow the same shape.
9. **Serialization is generic.** `Actor.toJSON` → component `toJSON`; unknown component types
   load as base `Component` (`componentRegistry.js`), whose `toJSON` clones all fields. So an
   *older* build would round-trip a ConvexBrush's data but render nothing and give it no collision.
   `deserializeLevel` rejects `schemaVersion > LEVEL_SCHEMA_VERSION` outright (explicitly to
   avoid lossy copies). Dirty tracking uses `stableStringify(serializeLevel(world))` (sorted
   keys), so key order never causes false dirt but **numeric noise would**.
10. **Prefab overrides are shallow per component key**
    (`applyOverrideToActorJson`: `{...comp, ...override}`; `captureOverrideFromActor` diffs each
    top-level key with `JSON.stringify`). So `geometry` would override as one atomic unit, and
    serialization must be canonical (stable order, stable number formatting) or overrides will
    appear spuriously. `PrefabDefinition` does not validate a schema version on load, so prefab
    files need no version gate.
11. **Physics scale handling.** Colliders are built from `getWorldTransform` (decomposed
    position / rotation / scale); hull points are multiplied by world scale
    (`miteredWallPointsToMetersFlat`). Parent chains with non-uniform scale plus child rotation
    (shear) cannot be represented by this decomposition. This is an existing limitation shared by
    all brushes; ConvexBrush inherits it.
12. **Tool state.** `tool` is one of `select | surface | align | box | wall | floor | ceiling |
    subtract` (plus construction tools). Surface selection is gated on tool by
    `surfaceSelection.js` after the stale-selection defect. The same discipline must apply to
    geometry selection from day one.

---

## 3. Architecture overview

### 3.1 Layering (matches the project's separation rules)

```
src/geometry/               NEW  engine-neutral, no Three.js, no React, no DOM
  convexBrush.js            data model: create / normalize / toJSON / canonicalize / bounds / volume
  limits.js                 all epsilons and caps in one place
  validate.js               V1–V7 validators (§6)
  hull.js                   convex hull builder with coplanar merge
  lineage.js                face-ID / vertex-ID continuity after a rebuild (§5.4)
  edits.js                  moveVertices (pure; return {ok,...})
  extrude.js                extrudeFace (pure; new prism)
  clip.js                   clipByPlane / planeFromPoints / planeFromFace
  convert.js                Brush → convex geometry, mitered wall → convex geometry
  uvProjection.js           per-face planar projection → density UVs (§5.5)

src/components/ConvexBrushComponent.js   NEW  serializable component (data only)
src/runtime/convexBrushGeometry.js       NEW  Three adapter: geometry → BufferGeometry (+ groups)
src/runtime/SceneView.js                 EXTEND  visual build, per-actor rebuild, overlays, element picking
src/runtime/PhysicsWorld.js              EXTEND  _addConvexBrushCollider (convexHull)
src/runtime/surfaces.js                  EXTEND  component-aware allowed IDs
src/editor/geometryEditing/              NEW  selection model, mode state, pointer routing helpers
src/editor/history/commands.js           EXTEND  new commands (§8)
src/rules/convexBrushRules.js            NEW  "is this action allowed" (conversion eligibility, mode eligibility)
```

Rules for the layering:

- `src/geometry/*` is **pure functions over plain JSON-able data**. Inputs are never mutated; every
  edit returns `{ ok: true, geometry, lineage, warnings } | { ok: false, code, message }`.
- Three.js appears only in `runtime/convexBrushGeometry.js` and `SceneView`.
- React components ask `src/rules/convexBrushRules.js` whether an action is allowed and display the
  reason; they contain no geometry math.

### 3.2 Single editing primitive

All three element modes reduce to one primitive:

```
moveVertices(geometry, vertexIds[], deltaLocal) -> EditResult
```

- Face selection → the vertex IDs of its loop.
- Edge selection → its two vertex IDs.
- Vertex selection → itself.
- Multi-selection → the **union** of vertex IDs (shared vertices move once).

So 2F.1–2F.3 differ in picking, highlighting, anchor choice and selection UX — **not** in geometry
math. This is the main risk reducer in the plan: the hard part (validation, rehull, ID continuity)
is built and tested once, in 2F.0/2F.1, and reused.

### 3.3 Two-phase edit (deterministic, id-preserving)

1. **Fast path (topology-preserving).** Apply the delta to the selected vertices, keep the existing
   face loops, and run V2–V5. If valid, commit with every vertex ID and face ID unchanged.
2. **Rehull path.** If the loops are no longer planar/convex (e.g. moving one corner of a box),
   rebuild the hull from the new vertex positions with coplanar merging, then derive ID continuity
   via lineage (§5.4). Require that **every input vertex remains a hull vertex** — a vertex that
   would become interior or merge into another is rejected (`INTERIOR_VERTEX`, `VERTEX_MERGE`),
   because silently deleting a vertex the user is dragging is exactly the kind of corruption this
   phase must prevent. Additionally (approved):
   - An **unselected** vertex that would leave the hull is rejected (`UNSELECTED_VERTEX_LOST`).
   - If lineage cannot assign every surviving face a unique predecessor without discarding a
     material or UV override that still has a plausible face, reject (`AMBIGUOUS_LINEAGE`).
   - Never silently drop `faceMaterials` / `faceUVs` entries for faces that still exist.

Edits are always computed from the **drag-start geometry plus the total delta**, never
incrementally, so floating-point error cannot accumulate over a drag.

---

## 4. Modes and state

### 4.1 Interaction modes (Proposed)

| Mode | Value | Purpose | Reads | Writes |
| --- | --- | --- | --- | --- |
| Actor | `tool === 'select'` | existing | actor selection | actor transform |
| Surface | `tool === 'surface'` / `'align'` | existing | `selectedSurface` | materials / UV |
| Face | `tool === 'geometry'`, `geometryMode === 'face'` | **new** | `geometrySelection` | ConvexBrush geometry |
| Edge | `geometryMode === 'edge'` | **new** | `geometrySelection` | ConvexBrush geometry |
| Vertex | `geometryMode === 'vertex'` | **new** | `geometrySelection` | ConvexBrush geometry |

"Independent of Actor and Surface modes" is implemented as: **a separate state slot**
(`geometrySelection`), separate from `selectedActorIds` and `selectedSurface`, with an explicit
transition table. Face mode does not reuse `selectedSurface`.

### 4.2 Geometry selection model (UI state — never serialized)

```js
geometrySelection = {
  mode: 'face' | 'edge' | 'vertex',
  items: [
    { actorId: string, ids: string[] }   // face ids | "vA|vB" edge keys | vertex ids
  ],
  primary: { actorId, id } | null         // anchor for snapping and gizmo placement
}
```

Edge keys are **derived** (`"v3|v7"`, numerically sorted) — edges are not persisted entities, so no
edge ID can ever go stale in a saved file.

### 4.3 Transition table (the lesson from the stale-surface defect)

A new module `src/editor/geometryEditing/geometrySelection.js` mirrors `surfaceSelection.js` and is
unit-tested before any UI exists. Selection is **cleared or validated** on:

| Event | Result |
| --- | --- |
| Tool changes to anything other than `geometry` | cleared |
| `geometryMode` changes | cleared (ids differ in kind) |
| Actor selection changes / deselect | items for deselected actors dropped; empty → cleared |
| Actor deleted | its items dropped |
| Level load / new level / Play / Stop | cleared |
| Undo / redo / any geometry mutation | **re-validated** against current geometry: ids that no longer exist are dropped; split faces are expanded through lineage (§5.4) |
| Prefab sync touching the actor | re-validated |
| Actor converted away / component removed | dropped |

Acceptance test: no code path may apply a geometry edit to an id that is not in the current
geometry (mirrors `shouldApplyMaterialToSurface`).

### 4.4 Eligible targets

Geometry modes operate only on actors that have a `ConvexBrush` component. Selecting a plain
`Brush` in a geometry mode shows an inline **"Convert to Convex Brush"** affordance (or the
rejection reason, §9). Other actor types are ignored with a status message; nothing is silently
converted.

---

## 5. Data model

### 5.1 Component

```jsonc
{
  "id": "comp_…",
  "type": "ConvexBrush",
  "enabled": true,
  "color": "#8a9099",
  "collidable": true,
  "materialId": null,                  // actor-level fallback (same meaning as Brush)
  "uv": { "scale": {…}, "offset": {…}, "rotation": 0 },     // same shape as Brush.uv
  "faceMaterials": { "px": "mat_…", "f7": "mat_…" },        // keyed by FACE ID
  "faceUVs":       { "px": { "scale": {…}, "offset": {…}, "rotation": 0 } },
  "geometry": {
    "version": 1,
    "vertices": [ { "id": "v0", "p": [x, y, z] }, … ],      // eu, actor-local
    "faces":    [ { "id": "px", "loop": ["v1","v5","v7","v3"], "proj": "px" }, … ],
    "uvOrigin": [ox, oy, oz],                               // projection origin, eu, actor-local
    "nextVertex": 8,
    "nextFace": 1
  },
  "provenance": { "kind": "brush" | "miteredWall" | "extrude" | "split" | "clip" }  // informational only
}
```

Notes:

- **No `operation` field.** A ConvexBrush is additive only (§9).
- **No `size`.** Anything that needs bounds calls `geometryBounds(geometry)`.
- `loop` winding: **counter-clockwise when viewed from outside** (outward normal by right-hand rule).
  Stored explicitly so validators can check it; never inferred.
- Face loops are convex polygons (≥ 3 vertices), triangulated by fan at render time.
- `provenance` is non-authoritative debugging info; no logic may depend on it.
- Canonical serialization: fixed key order; coordinates rounded to 1e-4 eu; arrays in stable
  order (vertices by numeric id, faces by numeric/legacy order). Required for stable prefab
  override diffs and stable dirty fingerprints.

### 5.2 ID rules

- Vertex IDs: `v<n>`. Face IDs: `f<n>`, **except** a brush converted from a `Brush` keeps the six
  legacy IDs `px nx py ny pz nz` for its original faces.
- Counters `nextVertex` / `nextFace` are persisted and **monotonic — an ID is never reused within a
  brush**, even after the face or vertex is deleted. This is what lets a stale
  `faceMaterials` entry never accidentally attach to a different face.
- IDs are unique **per brush**, not globally. Duplication, prefab instancing and clipping-split
  therefore need **no ID regeneration**.
- Valid face-ID grammar: `^[a-z][a-z0-9_]{0,15}$` (legacy six included).

### 5.3 Why vertex/face loops rather than planes

A plane-set (half-space) representation guarantees convexity by construction but makes vertex and
edge dragging ill-defined for vertices of degree > 3. A vertex/loop (B-rep) representation matches
how the user manipulates geometry and what Rapier/Three need directly. The hull rebuild + validators
restore the guarantee the plane representation would have given. **Decision (Proposed):** B-rep is
authoritative; planes are always derived.

### 5.4 Face-ID lineage (stable identity across topology change)

Used only on the rehull path (§3.3) and by clip/extrude.

For each new face `N` and old face `O`:

- Score = shared-vertex-ID count, tie-broken by normal alignment (`dot ≥ 0.5` required), then by
  overlap area, then by lowest old face ID (determinism).
- `N` inherits `O`'s ID when it is the best match **and** `O` has not been claimed by a better `N`.
- If one old face is covered by several new faces (a quad split into two triangles), the
  **largest-area** piece keeps the ID; each other piece gets a **new** ID and receives a **copy** of
  that face's `faceMaterials` / `faceUVs` entries (same projection `proj`, same `uvOrigin`, so the
  split pieces are visually continuous).
- If several old faces merge into one new face (coplanar merge), the best-scoring old ID survives
  and the others' entries are removed.
- Faces with no counterpart get new IDs and no material entry (fall back to actor material).

`edits` return `lineage = { faces: { newId: oldId|null }, droppedFaces: [...] }` so the command can
write geometry **and** the corresponding `faceMaterials` / `faceUVs` in one atomic snapshot, and the
selection layer can expand/remap.

### 5.5 UV projection (Proposed)

Each face stores `proj ∈ { px nx py ny pz nz }` — the axis-aligned planar projection chosen when
the face was created. UVs are `density(localPos, proj, uvOrigin) / TEXTURE_TILE_EDITOR_UNITS`,
then the existing composition: actor `uv` → `faceUVs[faceId]` → material UV
(`composeGeometryUv`, `uvMapping.js`).

- **Conversion must be exact.** The six projections replicate the existing Brush face orientation
  (`BoxGeometry` face orientation as implemented in `applyBrushUvs`; `densityUvOnBrushFace` in
  `alignSurfaces.js` is the verification oracle). `uvOrigin` is derived from the source box at
  conversion time. Test: converted-brush UVs equal `createBrushBoxGeometry` UVs (≤ 1e-6) for every
  face, including actor UV and `faceUVs`.
- **UV lock by default.** Because projection is in actor-local coordinates with a fixed origin,
  moving geometry does **not** make the texture swim. (Designer decision Q9.)
- `proj` is reassigned only when a face is created, or when its normal drifts below
  `|dot(normal, projAxis)| < 0.5` (to prevent extreme stretch). A reassignment is reported as a
  `warning` in the edit result and is the one case where an existing material appearance may shift.
- New faces from clip/extrude choose `proj` = dominant axis of the normal.

---

## 6. Validation (the corruption firewall)

All in `src/geometry/validate.js`, pure, run on **every candidate** before it can become state, and
again on load. Constants live in `src/geometry/limits.js`.

| ID | Check | Rule |
| --- | --- | --- |
| V1 | **Topology** | ≥ 4 vertices; every face ≥ 3 distinct vertices; every undirected edge shared by exactly 2 faces, traversed in opposite directions (manifold, consistent winding); surface is connected; Euler `V − E + F = 2`; every vertex used by ≥ 3 faces; no duplicate / dangling IDs |
| V2 | **Planarity** | each face's vertices within `PLANAR_EPS = 0.01 eu` of its best-fit (Newell) plane |
| V3 | **Convexity** | for every face plane, every vertex lies on or behind it within `CONVEX_EPS = 0.01 eu`; adjacent faces must not be coplanar (they must have been merged) |
| V4 | **Winding / orientation** | signed volume > 0; every face normal points away from the brush centroid (`dot > 0`) |
| V5 | **Minimum size** | volume ≥ `MIN_VOLUME = 1 eu³`; every edge ≥ `MIN_EDGE = 0.5 eu` (reuses `MIN_SOLID_SIZE`); every face area ≥ `MIN_FACE_AREA = 0.25 eu²`; minimum width along every face normal ≥ `MIN_THICKNESS = 0.5 eu` (rejects slivers) |
| V6 | **Limits / sanity** | ≤ `MAX_VERTICES = 64`, ≤ `MAX_FACES = 64`; all coordinates finite; `|coord| ≤ 1e5 eu` |
| V7 | **Identity** | vertex and face IDs unique; face IDs match the grammar; counters greater than every used index; every `faceMaterials` / `faceUVs` key (after the edit) refers to an existing face |

Rejection result: `{ ok:false, code, message }` with codes
`TOPOLOGY | NON_PLANAR | NON_CONVEX | WINDING | MIN_VOLUME | MIN_EDGE | MIN_FACE_AREA |
MIN_THICKNESS | LIMIT | INTERIOR_VERTEX | VERTEX_MERGE | UNSELECTED_VERTEX_LOST |
AMBIGUOUS_LINEAGE | NO_CHANGE | UNSUPPORTED_SOURCE | CUTTER_OVERLAP`.

Failure policy:

- During a drag: invalid samples keep the **last valid preview** and show an "invalid" cue
  (red handle + reason in the status bar). Nothing is committed.
- On release: if the final sample is invalid, **no command is pushed** and the geometry is
  byte-identical to before the drag (tested).
- On load: a ConvexBrush whose geometry fails validation is loaded **disabled with a visible
  error** and its raw JSON preserved (so it can be repaired/inspected); it is never silently
  "fixed" or dropped.
- Limits mirror the existing `MAX_SUBTRACT_SOLIDS = 64` philosophy: refuse rather than degrade.

### Hull builder requirements (`hull.js`)

- Double precision, deterministic (no randomness, stable ordering by vertex ID).
- Merges coplanar faces within `COPLANAR_EPS` (normal angle ≈ 0.1°, distance 0.01 eu).
- Returns only points that are strict hull vertices plus a list of any input points that were
  interior/duplicate (so the caller can raise `INTERIOR_VERTEX` / `VERTEX_MERGE`).
- Property-tested against a brute-force half-space check on seeded random point sets.

---

## 7. Sub-phases

Each sub-phase is independently shippable, ends with the full suite + lint + build green, and does
not start until the previous one is accepted.

### 7.1 2F.0 — Editable convex brush architecture (no editing UI)

**Scope**

- `src/geometry/*` data model, canonicalization, validators V1–V7, hull builder, lineage, UV
  projection, `convert.js` (Brush → convex; mitered wall → convex).
- `ConvexBrushComponent` + `componentRegistry` entry + `toJSON/fromJSON` + load-time validation.
- `surfaces.js`: component-aware allowed-ID API (§10.1); add `'ConvexBrush'` to the structural set.
- `runtime/convexBrushGeometry.js` (one `BufferGeometry`, one group per face, flat normals,
  per-face UVs) and the SceneView visual path including per-actor rebuild.
- `PhysicsWorld._addConvexBrushCollider` via `ColliderDesc.convexHull`, honoring world
  position/rotation/scale like the mitered-wall path.
- `ConvertBrushToConvexCommand` and a Details-panel **"Convert to Convex Brush"** action showing
  the eligibility result and basic readout (V/E/F, valid/invalid).
- Schema policy (§10.5).

**Out of scope:** any move/extrude/clip; any new viewport mode.

**Acceptance:** §12.1.

### 7.2 2F.1 — Face editing

**Status: Done (2026-11-24).**

**Scope**

- Geometry mode state and `geometrySelection` with the transition table (§4) and unit tests first.
- Toolbar group `Face | Edge | Vertex` (only Face enabled in this sub-phase) beside Select/Surface/Align.
- Face picking by raycast (existing grouped `surfaceIdFromHit`), additive select (Shift/Ctrl),
  face highlight overlay (editor-only mesh, not emissive tinting).
- `moveVertices` with fast path + rehull + lineage (§3.3), `SetConvexGeometryCommand` (§8).
- Gizmo: existing Move handles placed at the selection centroid plus a **face-normal handle**
  (requires generalizing gizmo axis to a direction vector, §10.3). Rotate/Scale hidden.
- Grid snapping (§10.4); drag preview via the per-actor rebuild; commit on release.
- Multi-face selection, including faces on different selected ConvexBrush actors (atomic composite).

**Shipped:** `src/geometry/edits.js`, `src/editor/geometryEditing/*`, Face toolbar + Viewport/EditorContext
wiring, `phase2f1FaceEditing.test.js`, `public/levels/acceptance-face-editing.json`,
`public/dev/phase2f1Acceptance.js`, `docs/ACCEPTANCE_FACE_EDITING.md`.

**Acceptance:** §12.2.

### 7.3 2F.2 — Edge editing

**Status: Done (2026-11-24).**

- Edge picking: screen-space proximity to projected edges (threshold in px), nearest-first, with a
  depth check against the brush (toggle: x-ray picking through the brush).
- Edge highlight, derived edge keys, edge multi-select; moves via the **same** primitive.
- Added test focus: edge moves that force triangulation; edges shared by split faces; silhouette
  ambiguity.

**Shipped:** Edge toolbar mode; `pickGeometryEdge` + `Line2` overlays; edge-aware selection/
`applyGeometryMove`; `phase2f2EdgeEditing.test.js`; `public/levels/acceptance-edge-editing.json`;
`public/dev/phase2f2Acceptance.js`; `docs/ACCEPTANCE_EDGE_EDITING.md`.

**Acceptance:** §12.3.

### 7.4 2F.3 — Vertex editing

**Status: Done (2026-11-24).**

- Vertex picking (screen-space), handles, multi-select.
- Vertices of degree ≥ 4, moves that fold faces (rehull + lineage), moves that would make a vertex
  interior or coincident (rejected).
- Explicitly **no** vertex merge/weld, split, insert or delete in 2F (Q2).
- Rotate/scale for element selections: **not implemented** (Move only); the gizmo hides those modes
  in geometry modes with a status hint. (Q6.)

**Shipped:** Vertex toolbar mode; `pickGeometryVertex` + sphere handles; vertex-aware selection/
`applyGeometryMove`; `phase2f3VertexEditing.test.js`; `public/levels/acceptance-vertex-editing.json`;
`public/dev/phase2f3Acceptance.js`; `docs/ACCEPTANCE_VERTEX_EDITING.md`. Marquee remains 2F.6.

**Acceptance:** §12.4.

### 7.5 2F.4 — Extrusion and clipping

**Extrude face (Proposed interpretation — Q1):** creates a **new** convex prism brush swept from the
selected face along its outward normal by a grid-snapped distance `d > 0`. Source brush unchanged.
This is what TrenchBroom's face-extrude does, and it is always convex, so it is always valid.
(Pulling a face outward on the *same* brush is face move, §7.2.)

- New actor: sibling under the same parent, tags copied, name `"<name> Extrusion"`.
- Front cap inherits the source face's `faceMaterials` / `faceUVs` entry; side faces fall back to
  the actor material; back cap coincident with the source face.
- `d ≤ 0` is rejected (use clip / face move).

**Clip by plane:** plane from three grid-snapped points picked on brush surfaces (or from an
existing face plane). Modes: **keep front**, **keep back**, **split** (two brushes).

- Result = original ∩ half-space, always convex; validators still run (thin slivers rejected).
- Surviving original faces keep their IDs; the new **cap** face gets a new ID and **no** material
  entry (actor fallback) unless a source face is chosen (Q3).
- **Split** creates a second actor (same parent/tags, name `"<name> B"`): both halves keep the
  original face IDs for the portions they retain; each gets its own cap.
- Clip/extrude on a plain `Brush` auto-converts it **inside the same undo step** when eligible
  (Q11); otherwise rejected with the §9 reason.
- Multiple selected brushes are clipped by the same plane atomically (all or nothing).
- UI: preview of the plane polygon and kept volume, Enter = apply, Esc = cancel.

**Shipped:** `src/geometry/extrude.js`, `src/geometry/clip.js`, `src/editor/geometryEditing/extrudeClip.js`;
Details Extrude/Clip panel; clip session (3-point / face plane, Enter/Esc); `phase2f4ExtrusionClipping.test.js`;
`public/levels/acceptance-extrusion-clipping.json`; `public/dev/phase2f4Acceptance.js`;
`docs/ACCEPTANCE_EXTRUSION_CLIPPING.md`.

**Acceptance:** §12.5.

### 7.6 2F.5 — Integration and persistence verification

Mirrors 2E.5: audit the whole pipeline, add the acceptance level, run the browser acceptance pass,
fix **confirmed** defects only, update `ROADMAP.md` / `TECHNICAL_STATUS.md` / `README.md`.
Includes nested-prefab ConvexBrush schema round-trips and cutter-intersection reporting.
Does **not** mark all of Phase 2F complete — 2F.6 remains after 2F.5.

**Acceptance:** §12.6.

### 7.7 2F.6 — Multiple Viewports and Orthographic Editing

Appended by approval; does **not** renumber 2F.0–2F.5. Starts only after 2F.5 verification.

| Capability | Notes |
| --- | --- |
| Layouts | Single, dual, triple, and quad viewport layouts |
| Cameras | Perspective plus six orthographic directions |
| Display modes | Lit, unlit, textured, wireframe, solid-with-edges |
| Editing | Shared selection and geometry editing across viewports |
| Controls | Independent camera controls per viewport; viewport maximization |
| Selection | Marquee selection (promoted from Q13 “not in 2F” into 2F.6) |
| Preferences | Persistent viewport preferences |
| Resources | Shared scene resources — **not** duplicated geometry or physics per viewport |

**Out of scope for 2F.6:** rule-based map generation (reserved as **Phase 2G**).

---

## 8. Undo/redo (commands)

All in `src/editor/history/commands.js`, using the existing snapshot style.

| Command | Snapshot | Notes |
| --- | --- | --- |
| `ConvertBrushToConvexCommand` | full `Brush` component JSON ↔ full `ConvexBrush` component JSON (same component id) | Undo restores a **byte-identical** Brush JSON (tested). |
| `SetConvexGeometryCommand` | `{ geometry, faceMaterials, faceUVs }` before/after for one actor | Geometry + surface maps change atomically so lineage and materials can never disagree. One command per drag. |
| `CompositeCommand` (small, generic) | list of sub-commands | Multi-actor atomic edits; clip-and-split; convert-then-clip. |
| Extrude / split creation | reuse existing add-actors command inside a `CompositeCommand` | |

Rules: commands address actors **by id** and re-fetch on `do/undo` (the phase 2E.5 lesson about
stale actor references); commands store plain JSON snapshots, never live objects; geometry is
≤ 64 vertices / 64 faces so snapshots are small. Selection is re-validated after every
`do/undo` (§4.3).

---

## 9. Compatibility rulings (explicit, enforced)

| Feature | Ruling | Enforcement |
| --- | --- | --- |
| **Subtractive Brush as source** | **Not convertible.** | `convertEligibility` → `SUBTRACT_BRUSH`. |
| **ConvexBrush as a cutter** | **Not supported.** ConvexBrush has no `operation` field and is never additive-or-subtract ambiguous. | No UI path; component has no `operation`; `isSubtractBrush` is false for it. |
| **ConvexBrush carved by AABB cutters** | **Unsupported.** Cutters only iterate `'Brush'` actors, so a ConvexBrush is never carved. | **Prevent or report (approved):** (1) Conversion is **blocked** while any enabled cutter overlaps the brush. (2) After conversion, if a cutter is created/moved so its volume overlaps a ConvexBrush, the editor **explicitly reports** the unsupported intersection (Details + status / subtract validation), listing both actor ids. The geometry is left uncarved; the user is never left believing the cut applied. |
| **Wall openings** | **Not convertible** (concave). | `convertEligibility` → `HAS_OPENINGS` with count. No "bake" in 2F. |
| **Miters** | **Convertible when there are no openings**: the 8-vertex mitered prism becomes the initial geometry (identical render/collision today). Miters become baked geometry; the parametric miter fields and Join-Walls no longer apply. | Eligibility allows; conversion bakes; wall-join tool ignores ConvexBrush. Openings + miters together → `HAS_OPENINGS`. |
| **Ramp / Stair / Column / Arch / CurvedWall** | Not convertible in 2F (a ramp is a convex wedge but is out of scope). | `NOT_A_BRUSH`. |
| **Align to Neighbor** (`alignSurfaces`) | Not supported for ConvexBrush faces (Brush AABB only). | Align tool rejects with a clear message. |
| **Surface tool / materials / UV overrides** | **Supported** through the grouped-surface path. | §10.1. |
| **Duplicate** | Supported; no ID regeneration needed. | Test. |
| **Prefabs (create / instantiate / nested / sync)** | Supported. `geometry` overrides atomically; faceMaterials/faceUVs override per key; keys for faces that no longer exist are dropped by normalization. UI should mark "geometry overridden". | Tests §11. |
| **Play/Stop** | Supported. | Test. |
| **Actor scale** | Supported via transform scale like any actor; no "bake scale" command in 2F. Negative scale follows existing behavior and is tested. | |
| **Hierarchy shear** | Existing limitation (§2.11) — mesh/collider may diverge under shear. | Documented; not made worse. |

---

## 10. Integration details

### 10.1 Surface IDs and materials

- `ALLOWED_BY_TYPE` is type-keyed. Add `allowedSurfaceIdsForComponent(component)`; for a
  ConvexBrush it is the set of face IDs in its geometry, otherwise it delegates to the existing
  type lookup. Replace the type-only calls in `normalizeFaceMaterials`, `normalizeFaceUVs`,
  `patchFaceMaterial`, `patchFaceUv`, `listSurfaceIdsForComponent` and
  `commands.applySurfaceFields` with the component-aware call. **Behavior for all existing
  component types is unchanged** (regression-tested by the existing 2E suites).
- Add `'ConvexBrush'` to `getStructuralComponent` / structural set; `resolveSurfaceMaterialId` /
  `resolveSurfaceUv` keep the same layering: faceMaterials → actor `materialId` → fallback color.
- ConvexBrush meshes set `surfaceScheme = 'grouped'` and `surfaceIds = faceIds` aligned to the
  geometry's `materialIndex`, so `surfaceIdFromHit`, surface highlight and the Surface tool work
  without special cases.

### 10.2 Rendering

- One mesh per ConvexBrush: non-indexed, per-face vertices (flat normals, per-face UVs), one
  geometry group per face, `materialIndex` → `faceIds[i]`.
- Edit-mode overlays (all `editorOnly`, excluded from picking of actors): face polygon tint, edge
  lines (`LineSegments`; thick edges via three's bundled `Line2`, no new package), vertex points.
- `updateBrushGeometry(actor)` is generalized (or a sibling `updateConvexGeometry`) so a
  ConvexBrush never falls into the `syncFromWorld` fallback.
- The brush-selection `Box3Helper` continues to work (computed from the group).

### 10.3 Gizmo

- Reuse `BrushGizmo` Move handles. Generalize the drag `axis` from `'x'|'y'|'z'` to either an axis
  name or a unit direction vector (`dir`) so a **face-normal handle** can exist. Existing
  behavior for axis strings is unchanged (existing gizmo tests must pass untouched).
- In geometry modes the gizmo is placed at the selection centroid (world space) with Move only.
- World-space gizmo delta → actor-local delta via the inverse of the actor's world rotation/scale
  before calling `moveVertices`.

### 10.4 Grid snapping

- Snap is in **world editor units**, using the established grid increments `1/5/10/25/50/100`.
- The **anchor** is the primary element's vertex (face: the vertex nearest the pick point; edge:
  the nearer endpoint; vertex: itself). The anchor's world coordinate on each moved axis snaps to
  the grid and the rest of the selection follows by the same delta (shape-preserving).
- Face-normal drags snap the plane offset along the normal.
- ConvexBrush actor moves in **Actor mode** need an offset-aware edge snap (local bounds are not
  centered on the pivot). Add a bounds-aware variant of `snapCenterByEdges`; existing Brush
  behavior is unchanged.
- Grid off → free movement still passes validators and canonical rounding (1e-4 eu).

### 10.5 Serialization and schema policy (Proposed — Q5)

- Level `schemaVersion` bumps to **3**, but the **writer emits 3 only when the level contains at
  least one ConvexBrush**, otherwise it keeps emitting 2. Consequences: every existing level
  re-saves **byte-identically**; older builds reject levels that actually need ConvexBrush
  (`Unsupported level schemaVersion 3`) instead of loading a level with invisible, collision-less
  geometry. `MIN_SUPPORTED_LEVEL_SCHEMA_VERSION` stays 1; 1–2 remain readable.
- Prefab definition files (`PREFAB_SCHEMA_VERSION = 1`) are not version-gated on load; no change.
  Acceptance includes confirming an instantiated prefab containing ConvexBrush saves a level at
  version 3.
- Canonical form and load-time validation as in §5.1 / §6.
- `src/geometry` also exports `geometryFingerprint(geometry)` used by tests (not by runtime).

### 10.6 Physics

- `PhysicsWorld.buildFromWorld`: for each enabled, collidable `ConvexBrush`, one fixed body at the
  actor's world transform and **one** `ColliderDesc.convexHull(points)` where
  `points = vertices × world scale`, in meters (same pattern as `miteredWallPointsToMetersFlat`).
- If `convexHull` returns `null`, the body is removed and an error is surfaced (not a silent skip);
  load-time validation makes this effectively unreachable.
- Because every vertex is a strict hull vertex (§3.3/§6), Rapier's internally computed hull equals
  the rendered mesh within float32 tolerance (1e-3 eu).
- Friction matches the other hull colliders (`0.9`). No rounding/margin shapes.

---

## 11. Test requirements

All automated tests run in the existing Vitest setup; Rapier-based tests follow the existing
`editorLifecycle` / `GameRuntime` pattern (real Rapier WASM).

### 11.1 Geometry (pure) — `src/tests/convexBrush*.test.js`

- Validators V1–V7: positive fixtures (cube, wedge, pyramid, hex prism, clipped cube) and a
  negative fixture per code (non-planar quad, concave L, flipped winding, duplicate vertex,
  sliver, sub-min volume, >64 faces, NaN, dangling face id).
- Hull: seeded property tests (random convex point sets → every point on/inside every face plane;
  face count/vertex count consistent with Euler; determinism: same input → identical output).
- Lineage: split inherits material copy; merge drops the loser's entries; IDs never reused
  (move/undo/move sequences); counters monotonic; selection expansion through lineage.
- `moveVertices`: box face along normal == resize; shear; corner move forcing triangulation;
  interior-vertex and vertex-merge rejection; **round trip** (+Δ then −Δ restores equal geometry);
  input never mutated; drag-from-start == incremental result.
- Extrude: prism volume = area × d; cap material inheritance; `d ≤ 0` rejected.
- Clip: `volume(A) + volume(B) = volume(original)` (≤ 1e-6 relative); caps coplanar; cap gets new
  ID; surviving faces keep IDs; fully-outside / fully-inside plane rejected; sliver rejected.
- Convert: **UV oracle** — for random sizes/actor UV/faceUVs the converted brush's per-face UVs
  equal `createBrushBoxGeometry` (≤ 1e-6); mitered-wall conversion equals
  `createMiteredWallGeometry` positions and surface assignment; eligibility matrix (§9) with every
  rejection code.

### 11.2 Surfaces / materials

- Existing 2E suites pass **unchanged** (proves the component-aware ID change is non-regressive).
- ConvexBrush: faceMaterials/faceUVs normalization, drop-on-delete, resolution layering,
  `surfaceIdFromHit` on a clipped brush, Surface-tool assignment on a converted + edited brush.

### 11.3 Persistence

- Save/load round trip is structurally identical; canonical serialization is **byte-stable**
  (serialize → deserialize → serialize).
- **Golden test:** every file in `public/levels/*.json` (including
  `acceptance-gothic-mansion.json`) loads and re-serializes to the same JSON as before Phase 2F;
  writer emits `schemaVersion` 2 for them. A level containing a ConvexBrush emits 3. v1, v2 load.
  A hand-built v4 still rejects.
- Corrupt/invalid ConvexBrush JSON loads disabled with preserved raw data and a surfaced error.
- Dirty tracking: edit → dirty; undo → clean; save → clean; Play/Stop unchanged.

### 11.4 History

- Convert / edit / extrude / clip / split each: do → undo → redo byte-equality; one command per
  drag; multi-actor atomicity (injected failure on actor 2 leaves actor 1 untouched); history
  limit behavior unchanged.

### 11.5 Physics (Rapier)

- Collider hull AABB and volume equal geometry within tolerance for cube, wedge, clipped brush.
- Ray casts at every face centroid from outside along −normal: hit distance = analytic distance
  (≤ 1e-3 m); rays just outside an edge miss.
- Capsule/player: walks up a clipped ramp-like face; blocked by a vertical face; with actor
  rotation and non-uniform scale; negative scale mirrors consistently with the render mesh.
- `collidable:false` produces no collider.

### 11.6 Prefabs / duplication

- Create prefab from a ConvexBrush, instantiate twice, override `faceMaterials` on one instance,
  edit source geometry, sync: other instance follows, overridden instance keeps its override,
  faces removed by the edit drop their keys cleanly.
- Instance `geometry` override persists through sync and save/load.
- Nested prefab containing a ConvexBrush; unpack; duplicate (`duplicateActors`).

### 11.7 Editor integration (jsdom lifecycle style, as in `editorLifecycle.test.js`)

- `geometrySelection` transition table (§4.3) — one test per row, plus the explicit regression
  "no geometry edit is ever applied to a stale id".
- Mode switching clears selections and does not touch `selectedSurface` / `selectedActorIds`.
- Drag preview → commit pushes exactly one command; invalid release pushes none and leaves the
  geometry byte-identical.
- Convert + edit + Play/Stop + load preserves state.

### 11.8 Browser acceptance (manual-automation, like the mansion pass)

- New permanent level `public/levels/acceptance-convex-brushes.json` plus a harness under
  `public/dev/` and a report `docs/ACCEPTANCE_CONVEX_BRUSHES.md`: converted wall/floor/column-like
  brushes, face/edge/vertex edits, clipped wedge ramp, extruded buttress, split halves, materials
  and UV overrides per face, prefab with ConvexBrush, Play-mode walk and collision.
- The Gothic mansion level must be re-run **unmodified** as a regression check.

### 11.9 Performance budgets (measured and recorded in the acceptance report)

| Measurement | Budget |
| --- | --- |
| `moveVertices` + validate (64 v / 64 f) | ≤ 5 ms |
| Drag preview rebuild (single actor) | ≤ 16 ms (no `syncFromWorld`) |
| Commit (command + selection revalidate) | no full-scene rebuild |
| Convex brush count scaling | 100 ConvexBrush actors: edit-mode frame rate no worse than 100 equivalent Brushes by more than 10% |
| Bundle size delta | reported; target < 40 KB gzip |

---

## 12. Acceptance criteria

### 12.1 2F.0

- A `Brush` converts to a `ConvexBrush` and is **visually and physically indistinguishable**:
  per-face UVs match (≤ 1e-6), materials and UV overrides survive (legacy IDs preserved),
  collider hull matches.
- Mitered wall (no openings) converts with identical geometry. Every ineligible case (§9) is
  refused with a specific, user-readable reason and **no** state change.
- Undo restores a byte-identical `Brush`.
- Existing levels/prefabs/materials: golden round-trip unchanged; v1/v2 load.
- ConvexBrush saves/loads, duplicates, instantiates in prefabs, survives Play/Stop.
- Invalid geometry JSON loads disabled and preserved.
- Full suite, lint (no new warnings), build pass. No new dependencies.

### 12.2 2F.1

- Face mode selects single and multiple faces (same and different actors); highlight is correct;
  selection obeys the transition table.
- Faces move with the gizmo (axes + face-normal handle), snapped to every grid increment
  `1/5/10/25/50/100`; a face move along its normal on an axis-aligned brush equals a resize.
- Invalid moves (non-convex, sliver, over-limit) are previewed as invalid, rejected on release,
  and leave geometry byte-identical.
- Face IDs, `faceMaterials` and `faceUVs` survive moves; split faces copy their material.
- Collision updates and matches rendering after every committed edit (Play check).
- One undo step per drag; undo/redo exact; save/load/duplicate/prefab compatible.

### 12.3 2F.2

- Edge pick/select/multi-select work; edge moves reuse the same pipeline with the same guarantees.
- Triangulating moves keep materials continuous; rejections are non-destructive.
- All 2F.1 persistence/undo/collision criteria hold for edge edits.

### 12.4 2F.3

- Vertex pick/select/multi-select/move with snapping.
- Folding moves, degree ≥ 4 vertices, and rejected moves (interior, coincident) behave as specified.
- Move-only: rotate/scale hidden with an explanatory hint.
- All 2F.1 persistence/undo/collision criteria hold for vertex edits.

### 12.5 2F.4

- Face extrusion creates a valid, convex, grid-snapped prism brush as an undoable single step; cap
  material continuity as specified; invalid distances rejected.
- Clip keep-front / keep-back / split are exact (volume conservation), keep surviving face IDs and
  materials, give caps new IDs, and are atomic across multiple selected brushes.
- Auto-convert-and-clip is a single undo step, or is refused with a reason.
- Slivers and degenerate planes are rejected with no state change.

### 12.6 2F.5

- Full pipeline verified: convert → edit (all modes) → extrude/clip → material/UV edits → prefab
  create/override/sync → save/load → Play/Stop → undo/redo → duplicate.
- Acceptance level + harness + report committed; Gothic mansion regression passes unchanged.
- Performance budgets measured and recorded; remaining limitations and deferred debt listed.
- ROADMAP / TECHNICAL_STATUS / README updated; Phase 2F marked complete only after verification.

---

## 13. Approved decisions (2026-11-24)

All prior defaults are **accepted**. Hotkeys (Q4) remain TBD at 2F.1 kickoff. Marquee (Q13) moves
to **2F.6**. Additional approved constraints are listed at the top of this document.

| # | Decision | Approved choice |
| --- | --- | --- |
| Q1 | Extrusion semantics | New prism brush; same-brush pull is Face Move |
| Q2 | Vertex merge/weld | Reject (`VERTEX_MERGE`) |
| Q3 | Clip cap-face material | New face → actor material fallback |
| Q4 | Hotkeys | TBD at 2F.1 kickoff (avoid existing bindings) |
| Q5 | Schema policy | Writer emits 3 only when a ConvexBrush exists; otherwise 2 |
| Q6 | Rotate / scale of elements | Not in 2F.0–2F.5 (Move only) |
| Q7 | Revert ConvexBrush → Brush | Not in 2F (undo covers immediate convert) |
| Q8 | Convex CSG / subtractive ConvexBrush | Out of scope (later phase if approved) |
| Q9 | UV when face moves | UV-locked to brush-local space |
| Q10 | Limits | 64 vertices / 64 faces |
| Q11 | Clip/extrude on plain Brush | Auto-convert in same undo step when eligible |
| Q12 | Multi-actor element selection | Supported (atomic composite) |
| Q13 | Marquee selection | Deferred to **2F.6** (click + Shift/Ctrl in 2F.1–2F.5) |
| A1 | Ambiguous hull / lineage | Reject; never silently drop unselected verts or face maps |
| A2 | Cutter ∩ ConvexBrush | Prevent on convert; explicitly report after conversion |
| A3 | Prefab schema | Verify ConvexBrush + nested prefab compatibility |
| A4 | Parametric tools / levels | Preserved; no silent replacement |
| A5 | 2F.6 | Multiple viewports & orthographic editing (appended) |
| A6 | 2G | Reserved for rule-based map generation |

---

## 14. Risks

| # | Risk | Likelihood / impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Hull/validation numerical robustness (near-coplanar, near-degenerate) | High / High | Single `limits.js`; double precision; deterministic ordering; seeded property tests; reject-by-default on ambiguity; canonical rounding. |
| R2 | Face-ID lineage ambiguity on splits/merges (materials land on wrong face) | Med / High | Deterministic scoring (§5.4); materials copied/removed in the **same** snapshot as geometry; dedicated lineage tests including undo/redo sequences. |
| R3 | Texture swim / stretch from fixed projections | Med / Med | UV lock; `proj` reassignment only at creation or when stretch exceeds threshold, with a warning; exact-conversion oracle test. |
| R4 | Stale geometry selection (the 2E class of bug) | Med / High | Selection module + transition table built and tested **before** UI; re-validation after every mutation. |
| R5 | Gizmo generalization regresses existing move/resize/rotate | Med / Med | Axis strings keep working; existing gizmo/viewport tests untouched and required to pass. |
| R6 | Snapping on rotated/scaled actors puts local coordinates off-grid | Med / Low | World-space anchor snapping; documented; recommend 90° rotations; tests with rotation. |
| R7 | Prefab override granularity (atomic `geometry`) surprises users | Med / Med | Document; "geometry overridden" indicator; sync tests. |
| R8 | Schema/versioning mishandles older builds | Low / High | Writer emits 3 only when needed; golden tests for all existing levels; v4 still rejected. |
| R9 | Per-commit full resync (M6) causes hitches | Med / Med | Dedicated per-actor rebuild path; budget in §11.9; M6 itself stays deferred. |
| R10 | Mesh/collider mismatch under hierarchy shear | Low / Med | Existing limitation; documented; not worsened. |
| R11 | Scope creep toward general mesh modeling | Med / High | Closed operation list (move / extrude / clip); no vertex insert/delete/merge; every new request needs designer approval. |
| R12 | Users expect cutters to carve ConvexBrush | Med / Med | Block conversion under overlap; explicit warning on cutters; documented ruling. |
| R13 | JSON bloat / noisy diffs | Low / Low | Compact arrays, canonical rounding, ≤ 64/64 limits. |
| R14 | Rapier hull differs from rendered mesh by tolerance | Low / Med | Strict-hull-vertex invariant; ray/AABB/volume tests. |
| R15 | Edge/vertex picking ambiguity and occlusion | Med / Med | Screen-space thresholds, nearest-first with depth check, x-ray toggle; pick tests with fixed cameras. |
| R16 | Mitered-wall conversion is one-way in practice (Join Walls no longer applies) | Low / Med | Clear confirmation text in the Convert action; undo available. |
| R17 | Bundle / complexity growth | Low / Low | In-house hull; budget reported; no new dependencies. |

---

## 15. Implementation dependencies

```
2F.0  geometry lib ─┬─► ConvexBrushComponent ─► registry/serialization ─┬─► SceneView render
                    │                                                    ├─► PhysicsWorld collider
                    └─► surfaces.js component-aware IDs ────────────────┴─► Surface tool works
2F.1  needs: 2F.0 complete; geometrySelection module (tests first); gizmo direction generalization;
      moveVertices + lineage; SetConvexGeometryCommand; per-actor rebuild; snapping variant
2F.2  needs: 2F.1 (same primitive); edge picking/overlay
2F.3  needs: 2F.1 (same primitive); vertex picking/overlay; hull rebuild paths fully exercised
2F.4  needs: 2F.1 commands + CompositeCommand; clip/extrude pure ops; auto-convert path
2F.5  needs: all of the above
```

Cross-cutting prerequisites (all in 2F.0):

1. Component-aware surface IDs (changes `surfaces.js`, `commands.applySurfaceFields`).
2. Schema policy (`LevelSerializer.js`, `LevelDeserializer.js`).
3. A per-actor rebuild path in `SceneView` that never falls back to `syncFromWorld`.

---

## 16. Existing files expected to change (impact list)

| File | Change |
| --- | --- |
| `src/runtime/surfaces.js` | component-aware allowed IDs; structural set |
| `src/editor/history/commands.js` | new commands; `applySurfaceFields` uses component-aware IDs |
| `src/components/componentRegistry.js` | register `ConvexBrush` |
| `src/serialization/LevelSerializer.js` / `LevelDeserializer.js` | conditional schemaVersion; supported range |
| `src/runtime/SceneView.js` | visual build, per-actor rebuild, overlays, element picking, selection-helper compatibility |
| `src/runtime/PhysicsWorld.js` | `_addConvexBrushCollider` |
| `src/editor/BrushGizmo.js` | direction-vector drag; element placement; mode lock |
| `src/editor/Viewport.jsx` | pointer routing for geometry modes; keys |
| `src/editor/EditorContext.jsx` | geometry mode/selection state; convert action; transitions |
| `src/editor/layout/DetailsPanel.jsx`, toolbar | Convert action, readouts, mode buttons, warnings |
| `src/editor/gridSnap.js` | bounds-aware edge snap |
| `src/editor/surfaceSelection.js` | none (geometry has its own module); only extended if modes must coordinate |

No change expected to: `BrushComponent`, `brushBoolean`, `wallOpenings`, `miteredWallGeometry`,
`alignSurfaces`, prefab ops (exercised by tests, not modified), the six parametric structural
geometry modules.

---

## 17. What this document does not decide

- Final JSON schema stability: `geometry.version = 1` is provisional until 2F.5, consistent with the
  project rule not to finalize schemas prematurely.
- Anything beyond Phase 2F (map generation, convex CSG, element rotation/scale, weld/insert/delete).
