# BloodBound3D — Technical Status

Records what is implemented, which audit findings were fixed, and what remains. Product roadmap lives in [`ROADMAP.md`](./ROADMAP.md).

- **Basis:** read-only technical audit of commit `42c37d0`, followed by stabilization (`91bc115`), Phase **2E complete**, Phase **2F.0–2F.2** (ConvexBrush + Face + Edge editing).
- **Finding IDs** (C1, H1, …) are the audit's own.

## 1. Verification (current)

| Check | Result |
| --- | --- |
| `npm test` | 445 / 445 pass, 56 files |
| `npm run lint` | exit 0, warnings only (no errors) |
| `npm run build` | succeeds; single ~6 MB chunk (unchanged, see debt) |
| Phase 2E | Complete (2E.0–2E.5); see prior rows / mansion acceptance |
| Phase 2F.0 | ConvexBrush architecture; convert / render / hull collision / schema 3; `phase2f0ConvexBrush.test.js` |
| Phase 2F.1 | Face mode; `phase2f1FaceEditing.test.js`; `acceptance-face-editing.json`; browser PASS (`34af8bd`) |
| Phase 2F.2 | Edge mode screen-space pick/highlight/move; `phase2f2EdgeEditing.test.js`; `acceptance-edge-editing.json`; browser PASS |
| Phase 2F.3+ | Not started (vertex/extrude/clip deferred) |

## 2. Implemented systems

Status is what the code does today, not an intent.

| System | State | Notes |
| --- | --- | --- |
| Core model (`World`, `Actor`, `Component`, `Transform`, hierarchy helpers) | Implemented | No Three.js / React dependency. Transforms are local to `parentId`. |
| Component types | Implemented | Brush, **ConvexBrush**, Ramp, Stair, Column, Arch, CurvedWall, Light, StaticMesh, PlayerSpawn, Cell, via `componentRegistry`. |
| Serialization | Implemented | Writes `schemaVersion` **2** when no ConvexBrush is present, **3** when one exists; reads 1–3; rejects other versions (see M9). |
| Rendering (`SceneView`) | Implemented | Full rebuild on every world sync (see M6). ConvexBrush uses grouped per-face mesh + per-actor rebuild path. |
| Physics (`PhysicsWorld`) | Implemented | Rapier colliders per brush / **convex hull** / ramp / stair / column / arch / curved wall / mitered wall; static meshes use a unit-cube collider (see M10). |
| ConvexBrush (2F.0) | Implemented | Engine-neutral geometry; Convert from Brush (blocked for subtract/openings/cutter overlap); cutter∩ConvexBrush reported. |
| Geometry Face editing (2F.1) | Implemented | Toolbar Face mode; `geometrySelection`; face overlays; gizmo + normal handle; grid snap; reject invalid; multi-actor atomic undo. |
| Geometry Edge editing (2F.2) | Implemented | Toolbar Edge mode; derived edge keys; screen-space pick + Alt x-ray; `Line2` highlight; same moveVertices pipeline. |
| Level construction | Implemented | Add/subtract brushes, openings, wall joins, ramps, straight and curved stairs, columns, arches, curved walls. Covered by geometry unit tests. |
| Grid snapping | Implemented | Structural geometry snaps by edges/faces; props, lights and meshes by pivot. |
| Cells and prefabs | Implemented | Hierarchy, nested prefabs, overrides, source sync; covered by `prefab*.test.js`, `phase2*.test.js`. |
| Editor commands / undo | Implemented | `HistoryStack` (limit 100); every edit is a command addressed by actor id. |
| Play / Stop | Implemented | Snapshot on Play, restore on Stop; see section 3. |
| Editor shell | Implemented | Dock layout with named layouts, themes, UI scale, Edit → Settings, hover help, shortcut reference. |
| Tutorials | Implemented | 13 lessons with starter levels under `public/levels/tutorials/`. |
| Session recorder | Implemented | Record button in the toolbar. |
| Non-level workspaces | Partial | **Materials** is implemented (2E.4). World Map, Characters, Animation, Visual Scripting, Dialogue, UI Editor, AI Assets remain `PlaceholderWorkspace`. |
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
| M9 | Any `schemaVersion` was accepted. | Versions 1–2 load. Newer, older-than-1, non-integer or non-numeric versions are rejected with an explicit message naming the supported range. All shipped levels still load. No migration framework was added. | `serialization/LevelDeserializer.js`, `LevelSerializer.js` | `levelSchemaVersion.test.js` |
| M11 | Play/Stop cleared undo history. | History is no longer cleared. Safe because every command addresses actors by id, the world instance persists, and Stop restores identical ids. | `editor/EditorContext.jsx` | `editorLifecycle.test.js`, `gameRuntimeLifecycle.test.js` |

Behavior changes to be aware of:

- `useEditor().loadLevel(name)` is now the guarded, user-facing call. It confirms when dirty and reports errors instead of throwing. The unguarded loader is internal.
- `RemoveActorsCommand` gained `entries` (id, index, JSON); `actorIds` / `actorsJson` still exist.
- The Stop button restores the world in place as before; selection is still cleared on Stop.

## 4. Remaining audit findings (not addressed)

These were out of scope for the pass and are unchanged.

| ID | Severity | Finding |
| --- | --- | --- |
| M6 | Medium | Every edit triggers a full `SceneView.syncFromWorld` (geometry and up to 6 materials per solid rebuilt). Acceptable for current level sizes; will not scale. Incremental sync was explicitly deferred. |
| M8 | Medium | `SceneView` (runtime) imports editor modules (`runtime/SceneView.js`, imports near the top). Runtime/editor separation was explicitly deferred. |
| M10 | Medium | Static mesh colliders are a unit cube (`PhysicsWorld.js`, static mesh branch of `buildFromWorld`), not mesh bounds. Collider redesign was explicitly deferred. |
| L | Low | `PlayerController.js` stair-assist hack (~lines 129–139). |
| L | Low | `GameRuntime.stop()` / `restoreAuthoredSnapshot()` clear the world with an O(n²) loop (`World.clear` → `removeActor` filters the array each time). |
| L | Low | `Component.js` defines `onStart` / `onUpdate` / `onStop`, which nothing calls (only `onAttach` / `onDetach` are invoked, by `Actor`). |
| L | Low | `EditorContext.jsx` (~2,100 lines) and `SceneView.js` (~1,500 lines) are large. Not recommended to split without a concrete need. |
| L | Low | 88 lint warnings (hook dependencies, refs during render, unused test imports). |
| L | Low | Production build is one ~6 MB chunk. |
| L | Low | The dev file APIs (`vite-plugins/`) have no authentication; path traversal is rejected. Dev-only. |

## 5. Observations made during this pass (not fixed, not yet confirmed as defects)

- **Dead legacy UI files.** `src/editor/Toolbar.jsx`, `Hierarchy.jsx` and `Inspector.jsx` are not imported anywhere (verified by search); they appear superseded by `layout/LevelToolBar.jsx`, `SceneOutliner.jsx` and `DetailsPanel.jsx`.
- **Tutorial "Save as" drops the stored project snapshot.** `saveTutorialWorkAs` sets `sessionStackRef.current = []` after saving, discarding the project world captured when the tutorial began. Not reproduced.
- **Orphan parent references are silently nulled on load.** `LevelDeserializer` resets a `parentId` that points at a missing actor to `null`, so a file produced by the old H1 bug loads as unparented actors rather than failing. This was left as is.
- **Dirty detection cost.** The check serializes the whole world. It is debounced (200 ms) for the indicator and computed synchronously only when guarding a load or closing the tab. Very large levels may need a cheaper scheme.
- **Late materials in two other paths.** `_applySimpleParamMaterial` and `_applyRampMaterial` already ignore stale results but dispose with `material.dispose()` only (cloned textures are not released). Minor; not changed.
- **Selection after Stop.** Selection is cleared on Stop. Preserving it was not requested.

## 6. Deferred technical debt

- Incremental scene synchronization (M6).
- Runtime/editor dependency separation (M8).
- Static-mesh collider generation (M10).
- Splitting the single production chunk.
- Removing the dead legacy UI files listed above.
- Lint warning cleanup.

## 7. Manual acceptance tests

These need a real browser, GPU, display and pointer-lock; they cannot be run in vitest.

1. **Dialogs vs. unsaved work.** Open a non-default level, make an edit, then trigger a dialog (Window → Layouts → Save Layout As…, an error such as an over-complex subtraction, a "Saved…" notice). The level, file name and undo history must be unchanged after the dialog closes.
2. **Delete a Cell with children.** Delete it, confirm the outliner and viewport lose the whole subtree, Undo, and confirm identical hierarchy, positions and outliner order. Repeat with a prefab instance, then Save and reload.
3. **Unsaved-change prompts.** Make an edit, then use File → Reload Level or open another level from the File menu: a confirmation appears; Cancel keeps everything, Discard loads. The `•` appears after an edit and disappears after Undo back to the saved state. Save, edit, close the tab: the browser warns.
4. **Failed save.** Stop the dev server (or make `public/levels` read-only), press Save: an error appears and the `•` stays. Restore and Save again: the `•` clears.
5. **Play/Stop.** Orbit/fly the editor camera somewhere distinctive, press Play, then Stop: the camera returns to the same view. Undo/Redo still work after Stop. Click Play rapidly several times: one session only. Repeat Play/Stop 20+ times and watch memory in the browser task manager (Rapier worlds are freed).
6. **Hidden tab.** Start Play, switch to another tab for ~10 seconds, return: rendering resumes with no physics jump. In Edit mode, confirm GPU/CPU use drops while the tab is hidden.
7. **Asset retry.** Make a texture or mesh URL fail (rename the file), load the level, restore the file, trigger a resync (any edit): the asset appears without a page reload.
8. **Future schema.** Edit a copy of a level to `"schemaVersion": 3` and open it: an explicit "Unsupported level schemaVersion 3" message appears, and the current level is untouched.
9. **Existing visuals (unchanged, still worth a spot check).** Mitered corners, openings, curved walls and stairs; edge snapping for walls/floors, pivot snapping for props and lights; the four color themes and UI scale.
10. **Phase 2E.1 surfaces.** File → `acceptance-surfaces.json`. Enable **Surface**, click faces on wall/ramp/stair/column/arch/curved wall: highlight + Details “Selected Surface”. Assign a Content Browser material; Undo/Redo; Save/reload. Confirm Select mode still picks whole actors and actor material remains the fallback.
11. **Phase 2E.3 Align to Neighbor.** File → `acceptance-surfaces.json`. Confirm **Align Wall A** / **Align Wall B** show continuous stone on adjoining `pz` faces. Enable **Align**, click A’s `pz` (amber reference), then B’s `pz` — target `faceUVs` updates; Undo restores prior UVs. Click a column/curved/non-coplanar face as target: status rejects and nothing changes. Esc returns to Select.
12. **Phase 2E.4 Materials workspace.** Open **Materials**. Search/select a material; edit PBR/UV fields — Save stays disabled until dirty; Cancel restores; Save writes the asset and refreshes level instances without reload. Leave to Level Editor with unsaved edits: confirm discard. New / Duplicate create assets. Preview Sphere/Cube/Plane.
13. **Phase 2E.5 persistence.** File → `acceptance-surfaces.json`. Assign a surface material + UV; Undo/Redo; Save and reload — overrides remain. Resize a brush face; surfaces unchanged. Play then Stop — authored surfaces restored. Prefab: create from a brush with `faceMaterials`/`faceUVs`, override one face UV, update source — override kept. Materials workspace: Cancel/leave warnings; Save does not mark the level dirty.
14. **Gothic mansion acceptance.** File → `acceptance-gothic-mansion.json`. Multi-floor mansion with stairs (straight/curved/spiral), arch, columns, curved wall, subtract, prefab instance, surface Align pair, lights and mesh props. Play/Stop and walk (pointer lock). See [`ACCEPTANCE_GOTHIC_MANSION.md`](./ACCEPTANCE_GOTHIC_MANSION.md).
15. **Stale surface selection fix.** On the mansion: Select a wall, leave a surface pick while in Select, apply a Content Browser material — actor `materialId` updates, not `faceMaterials`. Switch to Surface, pick a face, apply material — only that face overrides.
