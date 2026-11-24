# BloodBound3D

A first-person action-adventure **level editor** with a shared **runtime** for Play-in-Editor. Levels are engine-neutral JSON; Three.js renders them and Rapier simulates Play mode.

Project state, verified findings and known debt are tracked in [`docs/TECHNICAL_STATUS.md`](docs/TECHNICAL_STATUS.md).

## Stack

- Vite + React 19 (editor UI), dockview for the dockable panel layout
- Three.js (rendering adapter)
- Rapier 3D (`@dimforge/rapier3d-compat`, Play mode physics)
- JSON level serialization (engine-neutral, `schemaVersion` 2; **3** when a level contains a ConvexBrush)
- vitest (tests), oxlint (lint)

## Scripts

```bash
npm install
npm run dev      # editor at http://localhost:5173 (also: run-server.bat on Windows)
npm test         # vitest run
npm run lint     # oxlint
npm run build    # production build (the level/asset file APIs are dev-only)
```

## Units

| Concept | Value |
| --- | --- |
| Editor units per meter | 100 |
| Default construction grid | 25 editor units (1, 5, 10, 25, 50, 100 selectable) |
| Standard wall module | 300 × 300 × 20 |
| Floor / ceiling thickness | 20 |

Authored JSON and the inspector use **editor units**. Three.js and Rapier convert to **meters** at the engine boundary (`src/core/units.js`).

## What the editor does today

- **Actors and components.** An `Actor` has a local `Transform`, an optional `parentId` and an optional prefab link. Components: `Brush`, `Ramp`, `Stair`, `Column`, `Arch`, `CurvedWall`, `Light`, `StaticMesh`, `PlayerSpawn`, `Cell`.
- **Level construction.** Additive and subtractive brushes, wall openings (doors, windows, arches), wall joins/miters, ramps, straight and curved stairs, columns, arches, curved walls, multi-level building and ceilings.
- **Snapping.** Structural geometry (brushes, floors, walls, …) snaps its **edges and faces** to the grid. Props, lights and meshes snap by **pivot**.
- **Hierarchy.** Cells and parenting; the outliner, reparenting and per-actor visible/locked flags.
- **Prefabs and assets.** Content Browser with materials, textures, meshes and prefabs (dev file API writes under `public/assets`); prefab instances with overrides and source updates.
- **Materials and surfaces (Phase 2E).** Local UV density at 100 eu; Surface / Align tools; per-surface materials and UV; Materials workspace with Save/Cancel drafts; persistence through save/load, prefabs, undo and Play/Stop. Production acceptance level: `acceptance-gothic-mansion.json` (see `docs/ACCEPTANCE_GOTHIC_MANSION.md`).
- **Editable convex brushes (Phase 2F.0–2F.2).** Explicit Convert to Convex Brush; Face and Edge mode select/move with validation and undo; Rapier convex-hull collision; materials/UVs preserved. Vertex editing is 2F.3+. Spec: `docs/PHASE_2F_SPEC.md`.
- **Editing.** Every edit is a command on a 100-step undo/redo stack. Selection, move/rotate/scale gizmos, duplicate, delete.
- **Play / Stop.** Play snapshots the authored level and runs Rapier with a first-person controller. Stop restores the snapshot. See *Editing safety* below.
- **Workspace.** Dockable panels with named layouts, UI scale, four color themes (View → Theme), Edit → Settings (camera, viewport colors, play look), hover help, keyboard-shortcut reference, 13 in-app tutorial lessons, and a session recorder.
- **Workspace tabs.** *Level Editor* and *Materials* are implemented. World Map, Characters, Animation, Visual Scripting, Dialogue, UI Editor and AI Assets remain placeholders.

### Editing safety

- **Unsaved changes.** The editor compares the world with its last loaded/saved state. A `•` after the file name in the menu bar marks unsaved edits. Undoing back to the saved state clears it; Play/Stop does not change it. Loading another level or reloading asks for confirmation when there are unsaved edits, and closing the tab triggers the browser's leave-page prompt. A failed save never clears the marker.
- **Dialogs** (alerts, confirms, prompts) never reload or replace the level.
- **Deleting an actor deletes all of its descendants.** Undo restores them with their IDs, transforms, hierarchy links, prefab metadata and original order.
- **Play/Stop** keeps the authored world, the editor camera pose and the undo/redo history. Only one Play session can run at a time; Rapier worlds are freed on Stop.
- **Level files** declare a `schemaVersion`. Versions 1–3 load; anything newer (or malformed) is rejected with an explicit message. Saves write version 2 unless the level contains a ConvexBrush (then 3).
- Failed texture/mesh loads are not cached, so a later request retries.
- Rendering pauses while the browser tab is hidden and resumes when it is visible.

## Using it

1. `npm run dev` and open the editor. `test-room.json` loads on startup.
2. Select with **LMB**; **W / E / R** switch move / rotate / scale; **F** focuses; **Del** deletes; **Ctrl+D** duplicates; **Ctrl+Z / Ctrl+Y** undo/redo; **RMB** orbits, **WASD / Q / E** free-flies, **MMB** pans.
3. **Save** (Ctrl+S) writes `public/levels/<name>.json` through the Vite `/api/levels` middleware, not `localStorage`. File → Open lists the other levels.
4. **Play** runs Rapier with WASD and mouse look (click the viewport to capture the pointer; Esc releases). **Stop** restores the authored level.

## Layout

```
src/core/           Actor, Component, World, Transform, hierarchy, math, units
src/components/     Component types + registry
src/serialization/  Level serialize / deserialize (schema gate)
src/runtime/        GameRuntime, SceneView, PhysicsWorld, PlayerController, geometry generators
src/editor/         EditorContext, command history, factories, dirty tracking, Viewport, layout/ (dock panels)
src/prefabs/        Prefab definitions and operations
src/assets/         Asset registry / catalog
src/materials/      Material definitions
src/tutorials/      Lesson definitions and runner
src/ui/             Dialogs, themes, hover help, shared controls
src/io/             Dev level/asset file API clients
src/tests/          vitest suites
vite-plugins/       Dev-only level and asset file middleware
public/levels/      Authored levels (tutorials/ holds lesson starters)
public/assets/      Registry, materials, textures, meshes, prefabs
scripts/            Asset/level generator scripts
```

## Boundaries worth knowing

- `World`/`Actor`/`Component` and the serializer have no Three.js or React dependency.
- `SceneView` is the Three.js adapter. It currently **imports a few editor modules** (documented debt, see the status doc).
- The file APIs in `vite-plugins/` exist only in `npm run dev`. Do not expose the dev server to untrusted networks.
