# Phase 2G — Subtractive Rendering Integration

**Baseline:** `7a7326d` (experiment, flags default OFF).  
**Integration:** World Solid batching and shared cutter materials are product defaults. Solid cap unchanged in this commit (raised separately).

## Implementation

| Change | Detail |
| --- | --- |
| Defaults ON | `isWorldSolidBatchingEnabled()` / `isCutterMaterialSharingEnabled()` return true unless the global is explicitly `false` |
| World Solid picking | Exposed geometry stamps `surfaceScheme: 'grouped'` + one surface id per clipped quad (`pz#0`, …); SceneView per-solid legacy path uses the same; BoxGeometry additives keep `'box'` + classic face keys |
| Clipped face UVs | `createExposedWorldSolidGeometry` applies `faceUVs` via grouped scheme (variable quads per face) |
| Indexed UV once | `applyFaceUvsToGeometry` grouped branch visits each indexed vertex once |
| Cutter z-fight | Subtract fill materials use `polygonOffset` (−1/−1), `depthWrite: false`, elevated `renderOrder`; editor visibility preserved |

Collision, serialization, carve algorithm, stairs, and spatial chunking are unchanged.

## Gate results

| Check | Result |
| --- | --- |
| Unit tests | **725 / 725** (718 baseline + 7 integration regressions) |
| Lint | exit 0 (pre-existing EditorContext warnings only) |
| Production build | Pass |
| Browser acceptance (`phase2f7gAcceptance`, full) | `ok: true` — 11/11 levels Play OK |
| Play/Stop ×50 | geometry Δ 0, texture Δ 0 |
| Level switch ×20 | geometry Δ 0; texture Δ +40 (known shared-cache retention from 2F.7G) |
| Create/delete ×100 | actors 8→8, geometry Δ 0 |
| Surface picking (acceptance-subtractive) | **100%** of World Solid hits match hit-normal face |
| Per-face UV edit | `py` override rebuilds UVs; other faces unchanged |
| Batching active on shipped subtractive levels | one substrate mesh with `batchedWorldSolid` |
| Shared cutter materials | one fill + one line; polygonOffset present |

## Measured reductions (accepted from experiment)

See `docs/EVAL_SUBTRACTIVE_RENDERING.md`. World Solid materials −99.9%; flush draw calls −75–84%; rep draw calls −59–62%; frames 2.5–3× faster. Stairs remain unbatched by design.

## Remaining limitations

- Stair meshes still allocate 6 materials per step (out of scope).
- Batched World Solid loses per-solid frustum culling (triangle submit rises; frames still faster at current scales).
- No spatial chunking.
- Product solid cap raised in the follow-up commit (`ACCEPTANCE_SOLID_LIMIT_512.md`).
