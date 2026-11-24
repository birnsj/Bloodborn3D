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
| **2E.3** | Explicit Align to Neighbor for adjoining architectural surfaces. | Planned |
| **2E.4** | Materials workspace (reuse existing editor/registry/preview); Save/Cancel for asset edits. | Planned |
| **2E.5** | Persistence audit: save/load, prefabs, undo/redo for surface + material actor fields. | Planned |

**Do not start 2E.3 until 2E.2 is accepted.**

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
