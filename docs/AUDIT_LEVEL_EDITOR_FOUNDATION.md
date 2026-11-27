# Level Editor foundation consolidation — technical audit

**Status:** Audit-only (no product code modified in the audit pass)  
**Baseline commit:** `33ba9b9` (`main`, clean, `origin/main`)  
**Verified:** 2026-11-26 local  

## Verdict for Phase 2G

Foundation is functionally strong (1151 tests green; validation APIs ready; Batches 1–9 closed), but not yet clean for generator integration.

Hard ceilings: AABB-only carve (F16), 512-solid fragmentation (F4), render≠collision volumes (F17), plus EditorContext / M8 / quad viewport (F1–F3). Prefer fewer large AABB cutters; always call `validateWorldGeometry` before sync. Do not start 2G from stale `TECHNICAL_STATUS` numbers.

| Metric | Value |
|--------|-------|
| High findings | 6 |
| Medium findings | 12 |
| Tests | 1151 / 1151 (124 files) |

---

## 1. Current baseline

Verification was re-run for this audit (not copied from prior acceptance reports).

| Check | Result |
|-------|--------|
| Branch / tree | `main` · clean · `origin/main @ 33ba9b9` |
| `npm test` | 1151 / 1151 (124 files) |
| `npm run lint` | exit 0 · ~209 src warnings · ~1067 `public/vendor` noise |
| `npm run build` | pass · index ~8.0 MB JS (gzip ~2.7 MB) |
| CI workflow | `.github/workflows/ci.yml` — `npm ci` → test → lint → build |
| Source inventory | ~126k LOC · 435 src/vite/scripts modules (excl. public assets) |

### Installed runtime / tooling

| Package | Resolved |
|---------|----------|
| three | 0.187.0 |
| react / react-dom | 19.3.1 |
| @dimforge/rapier3d-compat | 0.21.0 |
| postprocessing | 6.39.6 |
| dockview-react | 8.9.1 |
| uuid | 14.0.3 |
| vite | 8.3.8 (dev) |
| vitest | 5.1.1 (dev) |
| oxlint | 1.94.0 (dev) |

### Largest modules (LOC)

| File | LOC | Note |
|------|-----|------|
| `src/styles/editor.css` | 6083 | All editor chrome; large but CSS-only |
| `src/editor/EditorContext.jsx` | 4681 | God-object risk — commands, tools, play, layers |
| `src/editor/layout/DetailsPanel.jsx` | 4543 | All component inspectors in one file |
| `src/runtime/SceneView.js` | 4321 | Render, sync, pick, env, LOD, ViewHelper |
| `src/editor/Viewport.jsx` | 2746 | Input, placement, Esc cascade, multi-pane |
| `src/editor/projectArt/ProjectArtLibraryPanel.jsx` | 2429 | AI Assets surface — outside Level Editor core |
| `src/ui/hoverHelp/helpContent.js` | 1444 | Data table; not logic debt |
| `src/editor/history/commands.js` | 1213 | Command classes — coherent |
| `src/runtime/PhysicsWorld.js` | 995 | Collider build + step |
| `vite-plugins/assetFileApi.js` | 1023 | Dev asset API |

---

## 2–7. Ranked findings

Severity reflects risk to maintainability, correctness, or Phase 2G readiness. “Mere size OK” means a large module is still coherent.

### High

#### F1 — EditorContext is a multi-responsibility hub
**Area:** Architecture

**Evidence:** ~4474–4681 LOC; public value exposes ~170 keys (unmemoized). Owns level I/O, selection/geometry/surface, ~35 command types, Play/Stop via GameRuntime, tools/gizmo/pivot, placement, prefabs, cells, layers, world settings. Copy-pasted update/scrub/commit gesture pipelines across light/env/prim/static/brush (~2377–3220). ~79 hooks warnings concentrate here.

**Impact:** API surface — not LOC alone — is the risk. Phase 2G commands will collide with unrelated churn. Collapse shared gesture helpers and partition by domain before generator integration.

#### F2 — Runtime → editor import residual (audit M8)
**Area:** Architecture

**Evidence:** `SceneView.js` imports `BrushGizmo`, six `create*FromBounds` factories, and `viewportDisplay` / Cameras / Prefs / `paneScissor` from `src/editor/`. No reverse EditorContext↔SceneView circular import today — debt is one-way (`EditorContext` → `GameRuntime` → `SceneView` → editor).

**Impact:** Architectural boundary failure, not a cycle break. Runtime cannot stand alone; finish extracting preview/factory/gizmo/prefs to a neutral package before treating runtime as generator-safe.

#### F3 — Quad multi-viewport below interactive 30 FPS target
**Area:** Rendering

**Evidence:** `ACCEPTANCE_PERFORMANCE_STABILIZATION`: single ~77–78 FPS; quad median ~17.5–19.6 FPS after shadow/env/ortho fixes. Batch 8 mansion ~84 / 18.7. Batch 9 mansion re-measure Unverified. Shadows/env once per frame; remaining cost = N cameras.

**Impact:** Architectural ceiling, not sync/leak. Generator acceptance should default single-pane profiling.

#### F16 — Carve is AABB partition only — no general CSG
**Area:** Geometry / 2G

**Evidence:** `brushBoolean.js` header: no general CSG. Convert to ConvexBrush blocked for subtract / openings / cutter overlap. ROADMAP: true CSG out of scope for 2F/2G start.

**Impact:** Generators must emit axis-aligned brushes; openings/concave shapes cannot become ConvexBrush. Hard design constraint for rule-based maps.

#### F4 — 512 solid cap vs fragmentation budget
**Area:** Geometry / 2G

**Evidence:** `MAX_SUBTRACT_SOLIDS = 512`. `EVAL_SUBTRACTIVE_SCALE`: flush-100 ≈ 278 solids (fits); flush-200 ≈ 522 (reject); enriched rep-100 ≈ 646; rep-200 ≈ 1387. Multi-height + windows ≈ 2–3× flush solids. Carve broadphase deferred — cutter dirty rebuilds all additives + World Solid. Layer hide does not un-carve.

**Impact:** Prefer fewer large AABB cutters. Enriched ~100-room maps can exceed budget. Over-cap → structured reject on load/save/edit/Play.

#### F17 — World Solid render ≠ collision (intentional split)
**Area:** Geometry / Physics

**Evidence:** Collision = full carved AABB solids; render = exposed-face clips / batched mesh (`ACCEPTANCE_PHYSICS`, face-clip). Batching does not change colliders. Maze example: 60 collision solids vs clipped face sets.

**Impact:** Generated walkables collide as volumes, not thin shells. Map gen and gameplay must account for volume collision, not visual walls alone.

### Medium

#### F5 — TECHNICAL_STATUS and several acceptance docs are stale
**Area:** Docs

**Evidence:** `TECHNICAL_STATUS` claims 783 tests (now 1151); manual test #8 still says schemaVersion 3 is unsupported (`LEVEL_SCHEMA_VERSION` is 3 for ConvexBrush). `ACCEPTANCE_PREREQUISITES` “Known limits” still says World Solid capped at 64 pieces after the 512 raise.

**Impact:** Operators and future audits will mis-verify. Refresh status docs before treating them as gate authority for 2G.

#### F6 — DetailsPanel monolith + duplicated scrub wrappers
**Area:** Architecture

**Evidence:** ~4454–4543 LOC; near-identical Collapsibles for parametric brushes; World/Light/Static/Prim/Env ScrubNumber wrappers are thin rebinds of the same gesture pattern.

**Impact:** Genuine maintainability cost. Easy win: one shared scrub wrapper + section modules. Less urgent for 2G unless new component types appear.

#### F18 — Stairs stay unbatched — erase World Solid batching wins
**Area:** Geometry / 2G

**Evidence:** `EVAL`/`ACCEPTANCE_SUBTRACTIVE_RENDERING`: ~6 materials/step; rep-200 leftover live materials ≈ 3675/3684 = stairs. Flush draw-call −75–84%; enriched layouts only −59–62%.

**Impact:** Stair-heavy generated maps need a material/batching strategy or stay under draw budgets.

#### F19 — Batched World Solid loses per-solid frustum culling
**Area:** Rendering / 2G

**Evidence:** No spatial chunking. EVAL: tris submit +1.6–2.9× (e.g. rep-200 25.7k → 74.8k) while frames still 2.5–3× faster.

**Impact:** Debt for larger generated maps; next limiter after carve rebuild (~76 ms @ ~1.4k solids in eval).

#### F20 — core/World imports runtime postprocessing
**Area:** Architecture

**Evidence:** `World.js` header claims engine-neutral / no Three/React, but imports `runtime/postprocessing/postProcessingState.js`. Mixes entity World with ambient/scene/fog/renderer normalize (~490 LOC).

**Impact:** Breaks “engine-neutral core” claim. Move PP normalize into core or schema package so World stops importing runtime.

#### F21 — commands.js Set*Properties template explosion
**Area:** Architecture

**Evidence:** Ten near-identical `Set*PropertiesCommand` classes; four world `Set*` clones; surface-aware stair/ramp/column/arch/curved duplicate UV/`applySurfaceFields`. `onApply` keeps SceneView out of history tests — keep that shape.

**Impact:** N×component class tax invites drift. Collapse with typed helpers alongside EditorContext gesture consolidation.

#### F22 — Viewport owns all edit input in one component
**Area:** Editor UX

**Evidence:** ~2612–2746 LOC: camera/fly/orbit, hotkeys, create-drag, gizmo, pivot, face-move, marquee, geometry modes, placement, context menu. Helpers extracted (`viewportRuntimeBridge`, marqueeSelection) but pointer routers remain monolithic. Parallel selection states (actors/surface/align/geometry/clip) scattered across context + viewport.

**Impact:** Interaction regressions cluster here. Generator tools need an explicit selection/tool model before adding more modes.

#### F7 — Lint scans vendor bundles and understates product warnings
**Area:** Tooling

**Evidence:** oxlint with empty ignore: ~1067 warnings from `public/vendor/draco*`, ~209 from src (~79 hooks). `.oxlintrc.json` has no ignorePatterns. Docs still say “~80+ warnings”.

**Impact:** CI stays green (warnings ≠ errors) but signal-to-noise is poor. Ignore `public/vendor` and re-baseline src warning budget before a hooks pass.

#### F8 — Shared texture cache retention across level switches
**Area:** GPU / Assets

**Evidence:** Documented since 2F.7G/2G prereq harness: level-switch Δtextures can stay positive vs return-to-same-level baseline; geometries stable. Extended texture lifecycle still Deferred in Batch 8/9 inventories.

**Impact:** Not a confirmed leak of owned resources; shared `materialFactory` cache retention. Generator soak tests should use reset protocol (`renderer.info.reset`) and track owned vs shared separately.

#### F9 — Single ~8 MB production chunk + ineffective dynamic imports
**Area:** Build

**Evidence:** vite build warns `index-*.js` ~7996 kB; gltfCompression, meshInspect, meshy/openart handoff modules imported both statically and dynamically.

**Impact:** Cold load weight for editor. Low risk for correctness; optional code-split before shipping heavier generator UI/assets.

#### F14 — In-memory worlds are not auto-validated on sync
**Area:** Data / 2G

**Evidence:** `validateLevelGeometry` / `validateWorldGeometry` / `assert*` APIs exist and are tested (`phase2gPrerequisites`). Load/save/Play enforce solid cap; sync of a hand-built world does not. Level writes atomic (temp + rename) in `vite-plugins/levelFileApi.js`. Play snapshots/restores authored level; undo history cleared across Play by design.

**Impact:** Phase 2G pipelines must call `validateWorldGeometry` before sync/Play. Skipping until Play is a documented footgun. Persistence path itself looks sound (atomic + schema normalize).

### Low

#### F10 — Duplicate folderForKind helpers
**Area:** Architecture

**Evidence:** Exported from `AssetRegistry.js` and a private twin in `assetCatalog.js` with the same kind→folder map.

**Impact:** Drift risk for Content Browser defaults; trivial consolidation.

#### F11 — Dead Component lifecycle hooks and O(n²) World.clear
**Area:** Core

**Evidence:** `Component.onStart`/`onUpdate`/`onStop` never called (only `onAttach`/`onDetach`). `World.clear` loops `removeActor` over a copy — each remove filters arrays. Known Low from prior audit.

**Impact:** Clear cost matters for Play/Stop and generator apply-world. Lifecycle stubs invite false assumptions.

#### F12 — Esc / tool cascade is coherent; Content Browser folders are new surface
**Area:** Editor UX

**Evidence:** `Viewport.jsx` Escape order: clip → place → pivot drag → faceMove → pivot mode → Align → Surface → Geometry → deselect. Folder RMB create/rename/delete/move shipped in `33ba9b9`; Academy/shortcuts updated same day.

**Impact:** No correctness defect found in cascade. Generator tools must plug into the same Esc contract. Folder paths are virtual registry metadata — generator asset placement should use kind defaults unless authored otherwise.

#### F23 — Instancing and LOD are mutually exclusive; pick proxy is fixed 0.5 box
**Area:** Rendering

**Evidence:** SceneView skips instancing when `lodLevels` present. Instanced pick/gizmo uses `BoxGeometry(0.5)`. Collision stays per-actor (LOD-independent — coherent).

**Impact:** Prop scatters: choose instancing or LOD. Fix pick-proxy if selection accuracy matters for large/small props.

### Info

#### F13 — SceneView size is largely coherent domain weight *(Mere size OK)*
**Area:** SceneView

**Evidence:** ~4321 LOC with incremental sync, visualEpoch, subtractive batching, LOD/instancing, PP/fog chips, ViewHelper. Prior audit marked “do not split without need.”

**Impact:** Mere size ≠ problem. Prefer extracting placement-preview factories (helps F2) over random file chops.

#### F15 — Dependency set remains lean
**Area:** Deps

**Evidence:** Production: three, react, rapier, dockview, postprocessing, uuid only. No Redux/cloud/auth stack.

**Impact:** Keep generator free of new heavy frameworks unless designer-approved.

#### F24 — Brush render/collision share getBrushRenderSolids
**Area:** Architecture

**Evidence:** SceneView + PhysicsWorld both use `getBrushRenderSolids` for brushes/openings. Incremental sync keeps ordinary edits at `fullSyncs=0`; GPU shared vs owned tagging intentional.

**Impact:** Not a problem — coherent shared solid pipeline. Do not “fix” render≠collision for World Solid (F17); that split is intentional.

---

## Documentation freshness

### Outdated / incomplete

| Doc | Issue |
|-----|-------|
| `docs/TECHNICAL_STATUS.md` | Verification table stuck at 783 tests; schema-3 manual test outdated; lint “80+” understates vendor noise |
| `docs/ACCEPTANCE_PREREQUISITES.md` | Known limits still say World Solid capped at 64 after 512 raise |
| `docs/ACCEPTANCE_EDITOR_ORGANIZATION.md` | Mansion FPS vs Batch 8 Unverified — still open measurement |
| Multiple Batch 1–9 reports | Valid as historical gates; do not treat Unverified/Deferred rows as freshly re-proven |

### Previously resolved (do not re-open without new evidence)

- C1 dialog reload, H1 delete hierarchy, H2 dirty tracking
- M1–M5, M7, M9, M11 lifecycle / assets / schema (early audit)
- M6 incremental sync (2F.7C); M10 mesh collider centers (2F.7F)
- 2F.7H audit corrections; 2G prereq D1–D3
- Batches 1–9 Three.js capability expansion (see inventory)

### Still open from prior audits

- M8 runtime→editor imports (partial; directional, not circular)
- `core/World` → runtime postprocessing import
- AABB-only carve / no general CSG (2G design ceiling)
- Level-switch shared texture retention (monitor)
- `World.clear` O(n²); Component dead hooks
- Quad ≥30 FPS architectural debt
- Carve broadphase + World Solid spatial chunking deferred
- Extended texture lifecycle / VideoTexture / KTX2 encode / brush displacement / TextureHelper deferred

---

## Phase 2G readiness (map generator)

### Ready

Schema 1–3; `validateLevelGeometry` / `validateWorldGeometry`; 512-solid enforcement on load/save/Play; shared brush solid pipeline; incremental carve invalidation (D1); subtractive batching; atomic level writes; Play snapshot/restore; large unit suite. Brush render/collision coherence (F24).

### Not ready / constrain design

AABB-only carve — no general CSG (F16); solid fragmentation vs 512 (F4); collision volumes ≠ thin shells (F17); stairs unbatched (F18); no carve broadphase / spatial WS chunks (F4/F19); EditorContext + M8 + World→runtime PP (F1/F2/F20); quad ~20 FPS (F3); opt-in in-memory validation (F14); stale docs (F5). Map generation remains reserved until designer directs start — ROADMAP Phase 2G.

---

## Recommended consolidation order

Audit recommendations only — not implemented in the audit pass.

| # | Action | Why |
|---|--------|-----|
| 1 | Refresh `TECHNICAL_STATUS` + fix stale 64-solid / AABB-only-mesh notes | Restore trustworthy gate docs |
| 2 | Ignore `public/vendor` in oxlint; record src warning baseline | Make lint actionable |
| 3 | Extract preview/factory/gizmo/viewport-pref out of `editor/` (finish M8) | Remove runtime→editor breach before generator apply-world |
| 4 | Collapse `Set*Properties` + EditorContext gesture pairs; partition context APIs | Safe insertion point for generator commands |
| 5 | Move PP normalize out of runtime import in `World.js` | Restore engine-neutral core claim |
| 6 | Re-measure mansion single/quad FPS post-Batch 9 with reset protocol | Close Unverified perf row |
| 7 | Optional: DetailsPanel sections + one scrub wrapper; Viewport camera vs tool split | Maintainability, not 2G blocker |

---

## Scope notes

Covered: baseline, architecture, geometry/spatial, rendering/GPU, data/persistence, editor workflow, docs.

Deep-dives folded in for architecture and geometry/GPU. Persistence conclusions (F14) re-verified from `levelFileApi` + Play/validation paths. Product source was not modified for the audit itself; this document records the audit findings in-repo.
