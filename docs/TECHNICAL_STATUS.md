# BloodBound3D — Technical Status

Records what is implemented, which audit findings were fixed, and what remains. Product roadmap lives in [`ROADMAP.md`](./ROADMAP.md). Authoritative Level Editor foundation audit: [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md). Consolidation C1: [`ACCEPTANCE_CONSOLIDATION_C1.md`](./ACCEPTANCE_CONSOLIDATION_C1.md).

- **Basis:** read-only technical audit of commit `42c37d0`, followed by stabilization (`91bc115`), Phase **2E complete**, Phase **2F.0–2F.7** complete (final gate **2F.7G**), Three.js capability Batches **1–9** + pivot editing (**7.1**) complete, foundation audit at `33ba9b9` / documented at `764a430`.
- **Finding IDs** (C1, H1, …) are the early stabilization audit's own unless prefixed as foundation **F#**.

## 1. Verification (current)

| Check | Result |
| --- | --- |
| `npm test` | **1171 / 1171 pass** (128 files; was 1166 at C3 `489f91f`, 1151 at audit `33ba9b9`) |
| `npm run lint` | exit 0 · **176** first-party warnings · **0** vendor (`public/vendor/**` ignored as of C1); see C1–C4 acceptance |
| `npm run build` | succeeds; single ~**8.0 MB** JS chunk (gzip ~2.7 MB) |
| CI | `.github/workflows/ci.yml` — test + lint + build on `main` / PRs |
| Dependencies (prod) | `three@0.187.0`, `react@19.3.1`, `@dimforge/rapier3d-compat@0.21.0`, `postprocessing@6.39.6`, `dockview-react@8.9.1`, `uuid@14.0.3` |
| Level schemas | Read **1–3**; write **2** (no ConvexBrush) or **3** (ConvexBrush present) |
| Subtractive solid cap | `MAX_SUBTRACT_SOLIDS = **512**` (supersedes historical **64** measurements — annotate, do not erase) |
| Phase 2E | Complete (2E.0–2E.5); see prior rows / mansion acceptance |
| Phase 2F.0 | ConvexBrush architecture; convert / render / hull collision / schema 3; `phase2f0ConvexBrush.test.js` |
| Phase 2F.1 | Face mode; `phase2f1FaceEditing.test.js`; `acceptance-face-editing.json`; browser PASS (`34af8bd`) |
| Phase 2F.2 | Edge mode; `phase2f2EdgeEditing.test.js`; `acceptance-edge-editing.json`; browser PASS (`e4d33d7`) |
| Phase 2F.3 | Vertex mode; `phase2f3VertexEditing.test.js`; `acceptance-vertex-editing.json`; browser PASS |
| Phase 2F.4 | Extrude + clip; `phase2f4ExtrusionClipping.test.js`; `acceptance-extrusion-clipping.json`; browser PASS |
| Phase 2F.5 | Integrated pipeline; `phase2f5Integration.test.js`; `acceptance-convex-brushes.json`; browser PASS; mansion regression |
| Phase 2F.6 | Multi-viewport + ortho + marquee; scissor shared SceneView; browser harness PASS |
| Phase 2F.7A | Subtractive map mode; empty-adjacent face culling; World Solid auto-fit; `acceptance-subtractive.json` |
| Phase 2F.7B | Asset lifecycle / GPU ownership; actor visualEpoch; shared vs owned dispose; see `ACCEPTANCE_ASSET_LIFECYCLE.md` |
| Phase 2F.7C | Incremental scene sync; see `ACCEPTANCE_INCREMENTAL_SYNC.md` |
| Phase 2F.7D | Code cleanup; see `ACCEPTANCE_CODE_CLEANUP.md` |
| Phase 2F.7E | Persistence / data integrity; see `ACCEPTANCE_DATA_INTEGRITY.md` |
| Phase 2F.7F | Physics / collision + player grounding/jump/mesh centers; see `ACCEPTANCE_PHYSICS.md` |
| Phase 2F.7G | Final regression / profiling / stress; CI; see `ACCEPTANCE_STABILIZATION.md` |
| Phase 2F.7H | Independent audit corrections (carve invalidation, GLB textures, epochs, dispose, validate, spawn); see `ACCEPTANCE_AUDIT_CORRECTIONS.md` |
| **Phase 2F.7** | **Complete** (incl. 2F.7H corrections) |
| Phase 2G prerequisites | Audit defects D1–D3; see `ACCEPTANCE_PREREQUISITES.md`. Map generation **not** started. |
| Phase 2G scale eval | Historical eval at caps 64–1024; product limit raised to **512**. See `EVAL_SUBTRACTIVE_SCALE.md`. *(Earlier notes that “solid limit still 64” are superseded.)* |
| Phase 2G rendering integration | World Solid batching + shared cutter materials **default ON**; picking / clipped UV / indexed UV / cutter z-fight corrected. See `ACCEPTANCE_SUBTRACTIVE_RENDERING.md`. |
| Phase 2G solid limit | `MAX_SUBTRACT_SOLIDS = 512`. Load / save / edit / Play reject over-cap with structured diagnostics. See `ACCEPTANCE_SOLID_LIMIT_512.md`. |
| Three.js Batches 1–9 | **Complete** — env/materials/lights/water-mirrors/primitives/static meshes/asset tools + pivot (7.1)/textures/layers. See `THREEJS_CAPABILITY_INVENTORY.md`. |
| Pivot editing (Batch 7.1) | **Complete** — actor + asset `contentOffset`; see `ACCEPTANCE_PIVOT_EDITING.md`. |
| Phase 2H.1A–1E | OpenArt PoC → editor → AI Assets workspace → Concept Library → Project Art Library. See respective `ACCEPTANCE_*.md`. |
| Meshy Content Browser import | Import Model also imports PBR maps into `Textures/<name>`; optional Staging files peek + Import maps button. Asset Generation result column is preview-first (PBR maps collapsed compact grid; tighter settings/providers). |
| Pipeline hardening (post-`08e15fd`) | OpenArt spend reservation / ambiguous failure / job recovery; atomic asset registry + mutex; concept-library request serialization; upload limits + magic bytes; localhost-only OpenArt API; transform coerceFiniteNumber. See `ACCEPTANCE_PIPELINE_HARDENING.md`. |
| Foundation audit | `docs/AUDIT_LEVEL_EDITOR_FOUNDATION.md` (baseline `33ba9b9`) |
| Consolidation C1 | Docs + lint hygiene + `folderForKind` + dead Component hooks — see `ACCEPTANCE_CONSOLIDATION_C1.md` |
| Consolidation C2 | Architectural boundaries M8/F2 + F20 — see `ACCEPTANCE_CONSOLIDATION_C2.md` |
| Consolidation C3 | EditorContext gestures + Set*Properties consolidation (F1 partial, F21) — see `ACCEPTANCE_CONSOLIDATION_C3.md` |
| Consolidation C4 | Geometry/collision/scalability (F4 measured, F11 clear, F14 sync helper, F18 stair share, F16/F17/F19/F24 confirmed) — see `ACCEPTANCE_CONSOLIDATION_C4.md` |
| Consolidation C5 | GPU lifecycle + FPS measurement integrity (F3/F8) — **done** — see `ACCEPTANCE_CONSOLIDATION_C5.md` |
| Standalone player | `player.html` + `src/player/`: runs a level with the shared `GameRuntime` and static assets, no editor/React. Built as a second Vite page. Verified in browser on the Gothic mansion; `standalonePlayer.test.js` + boundary test. See `TEST_MAP.md`. Tests now **1256 / 133 files**. |
| Large-file split | `DetailsPanel` (4,454 → 1,864 lines, sections in `src/editor/details/`), `SceneView` (4,429 → ~220, methods in `src/runtime/sceneView/`), `EditorContext` (4,609 → ~1,000, hooks in `src/editor/provider/`). Behaviour unchanged; verified by tests plus real-editor checks. `fileSizeBudget.test.js` blocks regrowth (no new file over 1,500 lines). `react/exhaustive-deps` is switched off for `src/editor/provider/**` in `.oxlintrc.json` because the linter cannot see that refs and setters passed in are stable. Still over limit: `Viewport.jsx`, `ProjectArtLibraryPanel.jsx`, `DetailsPanel.jsx`, `helpContent.js`. |
| Consolidation C6 | Final foundation acceptance (persistence/API safety, C5 gaps, 2G readiness) — **done** — see `ACCEPTANCE_CONSOLIDATION_C6.md` |

## 2. Implemented systems

Status is what the code does today, not an intent.

| System | State | Notes |
| --- | --- | --- |
| Core model (`World`, `Actor`, `Component`, `Transform`, hierarchy helpers) | Implemented | Engine-neutral core; PP normalize lives in `core/postprocessing` (**F20 closed** in C2). Transforms are local to `parentId`. |
| Component types | Implemented | Brush, **ConvexBrush**, Ramp, Stair, Column, Arch, CurvedWall, Light, StaticMesh, PlayerSpawn, Cell, via `componentRegistry`. |
| Serialization | Implemented | Writes `schemaVersion` **2** when no ConvexBrush is present, **3** when one exists; reads **1–3**; rejects other versions (see M9). |
| Rendering (`SceneView`) | Implemented | Incremental sync for ordinary edits (2F.7C); full sync for load / Play restore / recovery. ConvexBrush grouped per-face mesh. |
| Physics (`PhysicsWorld`) | Implemented | Rapier colliders per brush / **convex hull** / ramp / stair / column / arch / curved wall / mitered wall; **fixed 60 Hz** step; StaticMesh box uses asset bounds + center (2F.7F). |
| ConvexBrush (2F.0) | Implemented | Engine-neutral geometry; Convert from Brush (blocked for subtract/openings/cutter overlap); cutter∩ConvexBrush reported. |
| Geometry Face editing (2F.1) | Implemented | Toolbar Face mode; `geometrySelection`; face overlays; gizmo + normal handle; grid snap; reject invalid; multi-actor atomic undo. |
| Geometry Edge editing (2F.2) | Implemented | Toolbar Edge mode; derived edge keys; screen-space pick + Alt x-ray; `Line2` highlight; same moveVertices pipeline. |
| Geometry Vertex editing (2F.3) | Implemented | Toolbar Vertex mode; screen-space pick + Alt x-ray; sphere handles; Move only; reject merge/interior. |
| Extrusion / clipping (2F.4) | Implemented | Face extrude → new prism sibling; clip keep-front/back/split with preview; auto-convert Brush (Q11); Details + Enter/Esc. |
| Geometry integration (2F.5) | Verified | Full pipeline + prefab/schema/Play-Stop/mansion regression; see `ACCEPTANCE_CONVEX_BRUSHES.md`. |
| Multi-viewport (2F.6) | Verified | Shared SceneView scissor panes; ortho + display modes + marquee; see `ACCEPTANCE_MULTI_VIEWPORT.md`. |
| Subtractive map mode (2F.7A) | Verified | New Map → Subtractive; World Solid empty-adjacent faces only; auto-fit shell; additive pipeline unchanged; see `ACCEPTANCE_SUBTRACTIVE.md`. Locked World Solid still accepts material drag / Face Texture (surface dress); transform stays locked. World Solid panels use per-quad surface ids (`pz#n`) so face select / materials stay on the clicked wall. |
| Asset / GPU lifecycle (2F.7B) | Verified | Per-actor visual epochs; shared cache vs owned clones; preview abandonment; see `ACCEPTANCE_ASSET_LIFECYCLE.md`. |
| Data integrity (2F.7E) | Verified | Strict deserialize; atomic level writes; Play/Stop world fields; undo failure integrity; prefab instance duplicate fix; see `ACCEPTANCE_DATA_INTEGRITY.md`. |
| Physics stabilization (2F.7F) | Verified | Grounded jump edge; stair-assist probe; off-center mesh colliders; FPS-stable fixed step; see `ACCEPTANCE_PHYSICS.md`. |
| Final stabilization (2F.7G) | Verified | Full regression, profiling, lifecycle stress, CI; see `ACCEPTANCE_STABILIZATION.md`. |
| Audit corrections (2F.7H) | Verified | Carve delete/flip/parent; shared GLB maps; epoch high-water; dispose-once; finite transforms; world-space spawn; see `ACCEPTANCE_AUDIT_CORRECTIONS.md`. |
| Geometry validation (2G prereq) | Verified | Payload rules before construction; **512-solid** cap enforced on load / save (HTTP 422) / Play with structured diagnostics; additive carve re-built on pose / parent / ancestor / undo; generator API `validateLevelGeometry` / `validateWorldGeometry`; see `ACCEPTANCE_PREREQUISITES.md` / `ACCEPTANCE_SOLID_LIMIT_512.md`. |
| Level construction | Implemented | Add/subtract brushes, openings, wall joins, ramps, straight and curved stairs, columns, arches, curved walls. Covered by geometry unit tests. |
| Grid snapping | Implemented | Structural geometry snaps by edges/faces; props, lights and meshes by pivot. |
| Cells and prefabs | Implemented | Hierarchy, nested prefabs, overrides, source sync; covered by `prefab*.test.js`, `phase2*.test.js`. |
| Editor commands / undo | Implemented | `HistoryStack` (limit 100); every edit is a command addressed by actor id. |
| Play / Stop | Implemented | Snapshot on Play, restore on Stop; see section 3. |
| Editor shell | Implemented | Dock layout with named layouts, Midnight theme, UI scale, Edit → Settings, hover help, Keyboard Shortcuts (incl. Outliner / sticky notes / Checklist / camera bookmarks Ctrl+1–9 / 1–9 saved on the level / perspective LMB+RMB move (strafe/up-down, freelook paused) / MMB measure with Settings units / Shift+MMB pan), Help → Encyclopedia… (curated searchable glossary), Meshy Auto-rig (AI Assets) + Characters v0 library, Academy catalog. Creation toolbox docks flush to Viewport top/left/right/bottom or floats (drag handle to undock/re-dock; scale in Settings via `creationToolbarPrefs`). Flush docks inset Cam/View/Fog chrome via `--bb-creation-inset-*`. Toolbox scale sizes category/tool buttons (`--bb-creation-btn`). Creation tools use distinct SVG icons (brushes, Batch 5 primitives, lights, environment). Prefabs / Assets shows the last 8 placed mesh/prefab assets with Content Browser thumbnails (`recentCreationAssets`). Editor sticky notes: 2D reminders over the Level dock workspace (can drag over side panels), per-level, stored in `.editor-local/sticky-notes.json` (not level JSON; git-tracked; hidden in Play/player). Editor checklists: floating Project + per-level to-do panel (Level toolbar **Checklist**; drag header to move, bottom-right corner to resize w/h so larger shows more), stored in `.editor-local/checklists.json` (not level JSON; git-tracked; hidden in Play/player).

 Content Browser + Scene Outliner **Category** section headers (list-order chrome, not hierarchy/path parents; level `outliner` + Content `folderMeta`). Default Content Browser top category **Project Content**; categories use a section icon (`IconCategory`), not a folder. **Collapse All** in Content Browser and Scene Outliner collapses every expandable category/folder/parent. Details panel header **Collapse All** / **Expand All** folds every actor Details section (including nested light subsections) via `CollapsibleGroup`. Right-click **Icon Color…** opens a shared color picker (`pickColor` + `colorHistory` most-used swatches) for Content Browser folders/categories and Outliner actors/categories (`folderMeta.iconColor` / `actor.iconColor` / outliner category `iconColor`); Layers **Recolor…** uses the same picker. Shift/Ctrl/Alt multi-select in Content Browser (`listMultiSelect.js`). Shared list drop-lines (`listDropEdge.js`) for Content Browser / Outliner / Layers. |
| Tutorials / Academy | Implemented (content redesign pending) | Floating **Academy** overlay like Checklist (drag/resize; not a dock tab). Help / Window → Academy. 31 lessons / ~187 tips (feature-catalog style). Per-lesson **Tour** / **Tour all** / **Speed** 0.5×–3×; tips clear of action; fake cursor; viewport config switching. **Pending designer approval:** rewrite Tour as continuous **Practice Homestead** expert demo (main + steps + annex) — see `docs/ACADEMY_PRACTICE_COTTAGE.md`. Starters under `public/levels/tutorials/`. |
| Session recorder | Implemented | Record button in the toolbar. |
| Workspaces (nav order) | Partial | 1 Level Editor · 2 World Map · 3 Characters · 4 Animation · 5 Materials · 6 Visual Scripting · 7 Dialogue · 8 UI Editor · 9 AI Assets. **Materials**, **AI Assets**, and **Characters v0** (library + bind-pose preview; Meshy Auto-rig handoff) are live; Animation and other modules remain placeholders except Level Editor. |
| Structural UV (2E.0) | Implemented | Local tiling at 100 eu; actor UV + material UV composition; stairs/ramps density-corrected. |
| Surface selection (2E.1) | Implemented | Toolbar **Surface** mode; semantic `faceMaterials` IDs; emissive highlight; actor material fallback. Brush/miter/openings/ramp/stair/column/arch/curved wall. |
| Per-surface UV (2E.2) | Implemented | `faceUVs[surfaceId]` after actor UV; Details Scale/Offset/Rotation + Reset; identity preserves authored look; undo/save/prefab via component JSON. |
| Align to Neighbor (2E.3) | Implemented | Toolbar **Align**; coplanar Brush faces; target-only `faceUVs`; rejects incompatible pairs; no world projection. |
| Materials workspace (2E.4) | Implemented | Library + draft editor + preview (sphere/cube/plane); Save/Cancel; leave warning; refresh placed instances on save; separate from level dirty/undo. |
| Surface/material persistence (2E.5) | Verified | Save/load, resize, prefabs/overrides, undo/redo, Play/Stop, schema 1–2 compatibility; history + editor normalize face maps. |
| Stale surface selection | Fixed | Actor material apply no longer redirects on leftover `selectedSurface`; cleared on deselect/load/delete/leave Surface; `surfaceSelection.js` + lifecycle tests. |

## 3. Audit findings addressed in this pass

| ID | Finding | Resolution | Main files | Tests |
| --- | --- | --- | --- | --- |
| C1 | Opening a dialog reloaded `test-room.json`, discarding unsaved work. The dialog context value changed with `active`, which re-ran the startup effect. | Dialog context value is stable (`isOpen`, which no one used, removed). The startup load now runs exactly once and reads the latest callbacks through a ref, so no callback identity change can reload the world. | `ui/dialogs/EditorDialogContext.jsx`, `editor/EditorContext.jsx` | `editorLifecycle.test.js` (alert / confirm / prompt / queue / notify / Escape / non-default level) |
| H1 | Deleting a parent orphaned its children. | `RemoveActorsCommand` removes the full subtree. It records each actor's JSON and original index, so Undo restores IDs, local transforms, `parentId`, visible/locked, prefab metadata and order. `World.addActor` takes an optional index for this. | `editor/history/commands.js`, `core/World.js` | `deleteHierarchy.test.js` |
| H2 | No unsaved-change tracking. | Content-fingerprint comparison against the last loaded/saved state (`editor/dirtyTracking.js`, key-order independent). Undo/redo to the saved state reads clean; edits during an in-flight save stay dirty; a failed save (level or tutorial) reports the error and leaves the state dirty. Loading/reloading a dirty level asks first; `beforeunload` guards tab close; a `•` marks the file name in the menu bar. Tutorial sessions keep the project's baseline across begin/end. | `editor/dirtyTracking.js`, `editor/EditorContext.jsx`, `editor/layout/AppMenuBar.jsx` | `dirtyTracking.test.js`, `editorLifecycle.test.js` |
| M1 | `PhysicsWorld.dispose()` never freed the Rapier world; `init()` dropped the previous one. | `dispose()` frees the world (idempotent, tolerant of `free()` throwing); `init()` disposes first. | `runtime/PhysicsWorld.js` | `physicsWorldDisposal.test.js`, `gameRuntimeLifecycle.test.js` (5 cycles → 5 frees) |
| M2 | `play()` could start overlapping sessions. | A pending/token guard allows one session. `stop()`, a world swap or `dispose()` cancels a Play that is still initializing and frees its physics. A failed start leaves a clean edit session. The editor ignores Play while one is active and reports failures. | `runtime/GameRuntime.js`, `editor/EditorContext.jsx` | `gameRuntimeLifecycle.test.js`, `editorLifecycle.test.js` |
| M3 | Stop reset the editor camera to a hardcoded pose. | The pose (position, orientation, zoom) is captured on Play and restored on Stop; the old default remains as a fallback only. | `runtime/GameRuntime.js` | `gameRuntimeLifecycle.test.js` |
| M4 | Failed texture / mesh loads were cached as `null` forever. | `createRetryableCache` shares in-flight requests and caches successes, but evicts nullish or rejected results. | `runtime/retryableCache.js`, `materialFactory.js`, `meshLoader.js` | `retryableAssetLoads.test.js` |
| M5 | `_applyBrushMaterials` attached or leaked materials after the scene was rebuilt. | Re-checks the sync token after each material load and disposes the late material (textures included). Replaced materials are disposed with their textures. | `runtime/SceneView.js` | `sceneViewStaleMaterials.test.js` |
| M7 | The render loop ran while the tab was hidden. | The loop is suspended on `visibilitychange` and resumes without a time jump; no duplicate frames after repeated toggles; the listener is removed on dispose. | `runtime/GameRuntime.js` | `gameRuntimeLifecycle.test.js` |
| M9 | Any `schemaVersion` was accepted. | Versions **1–3** load (3 = ConvexBrush). Newer, older-than-1, non-integer or non-numeric versions are rejected with an explicit message naming the supported range. All shipped levels still load. No migration framework was added. | `serialization/LevelDeserializer.js`, `LevelSerializer.js` | `levelSchemaVersion.test.js` |
| M11 | Play/Stop cleared undo history. | History is no longer cleared. Safe because every command addresses actors by id, the world instance persists, and Stop restores identical ids. | `editor/EditorContext.jsx` | `editorLifecycle.test.js`, `gameRuntimeLifecycle.test.js` |

Behavior changes to be aware of:

- `useEditor().loadLevel(name)` is now the guarded, user-facing call. It confirms when dirty and reports errors instead of throwing. The unguarded loader is internal.
- `RemoveActorsCommand` gained `entries` (id, index, JSON); `actorIds` / `actorsJson` still exist.
- The Stop button restores the world in place as before; selection is still cleared on Stop.

## 4. Remaining audit findings (not addressed)

Early-audit IDs plus foundation audit **F#** from [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md).

| ID | Severity | Finding |
| --- | --- | --- |
| M6 | Medium | **Closed in 2F.7C** — ordinary edits use `syncIncremental`; full sync retained for load / Play restore / recovery. |
| M8 / F2 | High/Med | **Closed in consolidation C2** — SceneView imports runtime-local gizmo/factories/viewport helpers; editor paths are compatibility re-exports; `architectureBoundaries.test.js` guards. |
| M10 | Medium | **Closed in 2F.7F** — StaticMesh box uses `boundingBoxMeters` + `boundingBoxCenterMeters` (fallback 1 m cube at origin). |
| M / F8 | Medium | **C5 closed.** JS caches flat across 50 level switches; geometry Δ = 0; progressive `renderer.info.textures` climb root-caused to undisposed point-light cube shadow maps and fixed (`bbLightDispose` / `light.shadow.dispose()`). Post-fix Play/Stop and level-switch Δtex = 0. Ordinary switches still retain shared material/mesh caches by design. |
| F1 | High | EditorContext hub — **partial in C3** (shared propertyEditing + command factories); further domain extraction deferred. |
| F21 | Medium | **Closed in C3** — Set*Properties / SetWorld* scaffolding shared via `componentPropertyCommands.js`. |
| F3 | High | **Measurement integrity closed in C5** (unequal workloads + stall-hardened sampler). Integrated quad still under ≥30 FPS target (Batch 8 **18.7** @ ~671×507; C5 closure **23.9** @ ~458×382). Architectural N-camera cost remains. |
| F4 / F16 / F17 | High | **C4:** ceilings reconfirmed (AABB carve, 512, render≠collision). Broadphase **deferred** (no measured win). See `ACCEPTANCE_CONSOLIDATION_C4.md`. |
| F5 | Medium | **Closed in consolidation C1** — status/roadmap/prereq docs reconciled. |
| F7 | Medium | **Closed in consolidation C1** — `public/vendor` ignored; first-party unused cleaned; hooks warnings retained. |
| F10 | Low | **Closed in consolidation C1** — single `folderForKind` in `AssetRegistry`. |
| F11 | Low | **Closed** — hooks removed in C1; `World.clear` O(n) in C4. |
| L | Low | Stair-assist is now grounded + ledge-probed (2F.7F); remaining assist feel tweaks are design, not defects. |
| L / F1 / F13 | Low | `EditorContext.jsx` and `SceneView.js` are large. SceneView largely coherent; EditorContext partitioning deferred. |
| L / F7 | Low | First-party lint warnings remain (mostly React hooks / refs / export-components / set-state-in-effect). Vendor noise eliminated from reporting. |
| L / F9 | Low | Production build is one ~8 MB chunk. |
| L | Low | The dev file APIs (`vite-plugins/`) have no authentication; path traversal is rejected. Dev-only. |

## 5. Observations made during this pass (not fixed, not yet confirmed as defects)

- **Tutorial "Save as" drops the stored project snapshot.** `saveTutorialWorkAs` sets `sessionStackRef.current = []` after saving, discarding the project world captured when the tutorial began. Not reproduced.
- **Orphan parent references are silently nulled on load.** `LevelDeserializer` resets a `parentId` that points at a missing actor to `null`, so a file produced by the old H1 bug loads as unparented actors rather than failing. This was left as is.
- **Dirty detection cost.** The check serializes the whole world. It is debounced (200 ms) for the indicator and computed synchronously only when guarding a load or closing the tab. Very large levels may need a cheaper scheme.
- **Late materials in surface/ramp paths.** Now use the same actor-epoch + `disposeOwnedMaterial` path as brushes (2F.7B).
- **Selection after Stop.** Selection is cleared on Stop. Preserving it was not requested.

## 6. Deferred technical debt

- Incremental scene synchronization (M6) — **done** in Phase **2F.7C** (`ACCEPTANCE_INCREMENTAL_SYNC.md`).
- Code cleanup pass — **done** in Phase **2F.7D** (`ACCEPTANCE_CODE_CLEANUP.md`); legacy Toolbar/Hierarchy/Inspector removed; `worldSolidFit` in runtime.
- Persistence / data integrity — **done** in Phase **2F.7E** (`ACCEPTANCE_DATA_INTEGRITY.md`).
- Physics / collision hardening — **done** in Phase **2F.7F** (`ACCEPTANCE_PHYSICS.md`).
- Final regression / profiling / CI — **done** in Phase **2F.7G** (`ACCEPTANCE_STABILIZATION.md`).
- Consolidation C1 (docs / lint / F10 / dead Component hooks) — **done** (`ACCEPTANCE_CONSOLIDATION_C1.md`).
- Consolidation C2 (M8/F2 + F20 boundaries) — **done** (`ACCEPTANCE_CONSOLIDATION_C2.md`).
- Consolidation C3 (F21 + F1 gesture/command extract) — **done** (`ACCEPTANCE_CONSOLIDATION_C3.md`).
- Consolidation C4 (geometry/collision/scalability) — **done** (`ACCEPTANCE_CONSOLIDATION_C4.md`).
- Further EditorContext domain extraction (prefab/layer/geometry sessions) — **requires approval**.
- Carve broadphase + World Solid spatial chunking — measured in C4; **deferred** until larger maps justify.
- Stair material instance sharing (F18) — **done** in C4; full stair mesh batching still optional later.
- Remaining incremental sync costs: O(n) fingerprint walk; optional explicit `fullSync` for huge prefab replaces.
- Consolidation C5 (GPU lifecycle / FPS integrity) — **done** (`ACCEPTANCE_CONSOLIDATION_C5.md`).
- Consolidation C6 (final foundation acceptance) — **done** (`ACCEPTANCE_CONSOLIDATION_C6.md`); Phase 2G still reserved.
- Level-switch shared material/mesh cache retention — by design (F8); owned shadow-map leak closed in C5; soak cache release verified in C6.
- Splitting the single production chunk (~8 MB).
- Remaining React hooks / refs-during-render lint warnings (dedicated pass; avoid drive-by dep array changes).
- Integrated quad ≥30 FPS (architectural; C5 ~23.9 @ small canvas; C6 Batch 8 ~9.0 @ 671×507).

### Development sequence (current)

1. **Foundation consolidation** — **C1–C6 complete**
2. **Phase 2G** rule-based map generator (reserved — not started; requires approval)
3. **World Map** (reserved — requires approval)

Materials and AI Assets already have substantial implementation outside this sequence.

## 7. Manual acceptance tests

These need a real browser, GPU, display and pointer-lock; they cannot be run in vitest.

1. **Dialogs vs. unsaved work.** Open a non-default level, make an edit, then trigger a dialog (Window → Layouts → Save Layout As…, an error such as an over-complex subtraction, a "Saved…" notice). The level, file name and undo history must be unchanged after the dialog closes.
2. **Delete a Cell with children.** Delete it, confirm the outliner and viewport lose the whole subtree, Undo, and confirm identical hierarchy, positions and outliner order. Repeat with a prefab instance, then Save and reload.
3. **Unsaved-change prompts.** Make an edit, then use File → Reload Level or open another level from the File menu: a confirmation appears; Cancel keeps everything, Discard loads. The `•` appears after an edit and disappears after Undo back to the saved state. Save, edit, close the tab: the browser warns.
4. **Failed save.** Stop the dev server (or make `public/levels` read-only), press Save: an error appears and the `•` stays. Restore and Save again: the `•` clears.
5. **Play/Stop.** Orbit/fly the editor camera somewhere distinctive, press Play, then Stop: the camera returns to the same view. Undo/Redo still work after Stop. Click Play rapidly several times: one session only. Repeat Play/Stop 20+ times and watch memory in the browser task manager (Rapier worlds are freed).
6. **Hidden tab.** Start Play, switch to another tab for ~10 seconds, return: rendering resumes with no physics jump. In Edit mode, confirm GPU/CPU use drops while the tab is hidden.
7. **Asset retry.** Make a texture or mesh URL fail (rename the file), load the level, restore the file, trigger a resync (any edit): the asset appears without a page reload.
8. **Unsupported schema.** Edit a copy of a level to an unsupported `"schemaVersion"` (e.g. **4**, or `0`): an explicit unsupported-schema message appears naming the supported range (**1–3**), and the current level is untouched. *(Schema **3** is valid for ConvexBrush levels — do not treat 3 as unsupported.)*
9. **Existing visuals (unchanged, still worth a spot check).** Mitered corners, openings, curved walls and stairs; edge snapping for walls/floors, pivot snapping for props and lights; the four color themes and UI scale.
10. **Phase 2E.1 surfaces.** File → `acceptance-surfaces.json`. Enable **Surface**, click faces on wall/ramp/stair/column/arch/curved wall: highlight + Details “Selected Surface”. Assign a Content Browser material; Undo/Redo; Save/reload. Confirm Select mode still picks whole actors and actor material remains the fallback.
11. **Phase 2E.3 Align to Neighbor.** File → `acceptance-surfaces.json`. Confirm **Align Wall A** / **Align Wall B** show continuous stone on adjoining `pz` faces. Enable **Align**, click A’s `pz` (amber reference), then B’s `pz` — target `faceUVs` updates; Undo restores prior UVs. Click a column/curved/non-coplanar face as target: status rejects and nothing changes. Esc returns to Select.
12. **Phase 2E.4 Materials workspace.** Open **Materials**. Search/select a material; edit PBR/UV fields — Save stays disabled until dirty; Cancel restores; Save writes the asset and refreshes level instances without reload. Leave to Level Editor with unsaved edits: confirm discard. New / Duplicate create assets. Preview Sphere/Cube/Plane.
13. **Phase 2E.5 persistence.** File → `acceptance-surfaces.json`. Assign a surface material + UV; Undo/Redo; Save and reload — overrides remain. Resize a brush face; surfaces unchanged. Play then Stop — authored surfaces restored. Prefab: create from a brush with `faceMaterials`/`faceUVs`, override one face UV, update source — override kept. Materials workspace: Cancel/leave warnings; Save does not mark the level dirty.
14. **Gothic mansion acceptance.** File → `acceptance-gothic-mansion.json`. Multi-floor mansion with stairs (straight/curved/spiral), arch, columns, curved wall, subtract, prefab instance, surface Align pair, lights and mesh props. Play/Stop and walk (pointer lock). See [`ACCEPTANCE_GOTHIC_MANSION.md`](./ACCEPTANCE_GOTHIC_MANSION.md).
15. **Stale surface selection fix.** On the mansion: Select a wall, leave a surface pick while in Select, apply a Content Browser material — actor `materialId` updates, not `faceMaterials`. Switch to Surface, pick a face, apply material — only that face overrides.
