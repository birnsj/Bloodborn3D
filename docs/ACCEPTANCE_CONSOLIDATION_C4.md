# Consolidation C4 — Geometry, Collision and Spatial Scalability

**Status:** Complete  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) (F4, F11 remainder, F14, F16–F19, F24)  
**Baseline:** C3 `489f91f` · 1166 tests · 176 first-party lint warnings  
**Constraints:** Preserve AABB carve, 512 solid cap, World Solid render≠collision, shared brush solids, incremental sync, engine-neutral serialization. No CSG/BSP/new geometry engine. No solid-limit raise. No map generator.

## Measurement first

### Subtractive scale (F4) — Node re-run

Harness: `node scripts/phase2g-subtractive-scale/runNodeBench.mjs`  
Raw: `scripts/phase2g-subtractive-scale/results/node-bench.json` (permanentLimit now reads product `MAX_SUBTRACT_SOLIDS = 512`).

| World | Cutters (approx) | Solids | Carve ms | Mesh ms | Phys ms | Fits 512 |
| --- | ---: | ---: | ---: | ---: | ---: | :---: |
| flush-100 | ~199 | **278** | ~1–2 | ~6 | ~2 | yes |
| flush-200 | ~419 | **522** | ~3–4 | ~17 | ~4 | **no** |
| rep-100 | ~318 | **646** | ~3 | ~20 | ~5 | **no** |
| rep-200 | ~700+ | **1387** | ~10 | ~71 | ~16 | **no** |

Prior browser EVAL (`EVAL_SUBTRACTIVE_SCALE` / `EVAL_SUBTRACTIVE_RENDERING`) remains authoritative for draw calls / frame time: World Solid batching still **2.5–3×** faster despite **1.6–2.9×** triangle submit; stair actors dominated leftover live materials after batching + cutter sharing.

### Carve broadphase (F4) — decision: **not implemented**

- Carve dirty already invalidates on cutter add/remove/resize/pose, World Solid content change, operation flip, and additive/World Solid pose under cutters (`SceneView.syncIncremental`).
- World Solid is a **single** carved actor — any overlapping cutter change requires a full re-carve of that substrate. Broadphase cannot skip it.
- Typical subtractive maps have few additive brushes relative to cutters; additive-only AABB broadphase would not move the measured bottleneck (World Solid rebuild + mesh/material path).
- Preserving deterministic AABB partition semantics + 512 enforcement without a measured win → **defer**.

### World Solid spatial chunking (F19) — decision: **not implemented**

- Batched World Solid remains a net frame-time win at representative sizes in EVAL.
- Triangle-submit growth is real debt for much larger maps, but no measured threshold in C4 justified chunking complexity or culling divergence risk.
- Keep current batching (default ON). Revisit only with larger authored/generated maps and designer approval.

## Implementations

| ID | Change |
| --- | --- |
| **F11** | `World.clear` is O(n): detach `actor.world`, replace `actors=[]`, `_byId.clear()` — no per-actor `removeActor` filter. |
| **F18** | Stairs resolve surface materials once, then share material **instances** across step meshes (`_applySharedStairMaterials`). Per-surface material IDs, UVs on geometry, picking, collision solids, params, undo, serialization unchanged. Edit-mode edge overlays stay per-step. |
| **F14** | `syncGeneratedWorld(sceneView, world)` in `generatorIntegration.js` asserts via `assertWorldGeometry` before `syncFromWorld` (optional incremental). Checklist updated. Load/save/Play paths already validated. |

## Preserved architecture (verified, not “fixed”)

| ID | Disposition |
| --- | --- |
| **F16** | AABB subtractive partition only — no general CSG. Generators must emit axis-aligned cutters. |
| **F17** | World Solid collision = full carved AABB volumes; render = exposed-face / batched mesh. Intentional. |
| **F24** | Brushes/openings still share `getBrushRenderSolids` for render + collision. Coherent. |
| **F4 cap** | `MAX_SUBTRACT_SOLIDS = 512` unchanged. Prefer fewer large AABB cutters. |

## Geometry correctness

No confirmed defects found that required product fixes beyond F18 sharing. Intentional render≠collision (F17) and shared solids (F24) preserved. Stair material sharing was verified with unique-instance counts ≪ step count while surface ID arrays remain per mesh.

## Public API

- **Added:** `syncGeneratedWorld` (+ checklist line) on the generator integration surface.
- **Unchanged:** SceneView sync methods (still do not auto-validate — call the helper or assert explicitly).
- **Behavior:** `World.clear` semantics identical (empty world, detached actors); complexity only.

## Verification

### Automated

| Check | Result |
| --- | --- |
| `npm test` | **1171 / 1171** (128 files; +5 C4 tests) |
| `npm run lint` | exit 0 · **176** first-party warnings · 0 vendor |
| `npm run build` | pass |
| Node scale bench | re-run; capacity table above; `permanentLimit: 512` |

### Browser

`window.__phase2f7gAcceptance({ quick: true })` on Level Editor @ `http://localhost:5175/`:

| Item | Result |
| --- | --- |
| Overall | **`ok: true`** |
| Gothic Mansion profile | load OK; single median ~175 FPS; quad median ~170 FPS; transform incremental `fullSyncs: 0` |
| 11 acceptance levels Play | all `playOk: true`, return to `edit` |
| Stress | playStop / levelSwitch / createDelete / materials / assetPreview OK |
| Geometry deltas | Play/Stop & create/delete **0**; level-switch textures retain shared-cache growth (known F8) |

## Audit dispositions

| ID | Disposition |
| --- | --- |
| **F4** | **Measured / deferred broadphase** — scale reconfirmed; 512 preserved; no broadphase without measured benefit |
| **F11** | **Closed** — hooks removed in C1; `World.clear` O(n) in C4 |
| **F14** | **Closed** — `syncGeneratedWorld` + checklist; sync alone still opt-in by design |
| **F16** | **Confirmed ceiling** — preserved |
| **F17** | **Confirmed intentional** — preserved |
| **F18** | **Closed** — intra-stair material instance sharing |
| **F19** | **Measured / deferred chunking** — batching retained; no spatial chunks |
| **F24** | **Confirmed coherent** — preserved |

**Stop after C4.** Await approval before further consolidation or Phase 2G generation work.
