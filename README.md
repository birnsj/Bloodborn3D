# BloodBound3D — Phase 1

3D first-person action-adventure authoring environment (editor + shared runtime).

## Stack

- Vite + React (editor UI)
- Three.js (rendering adapter)
- Rapier 3D (physics, Play mode)
- JSON level serialization (engine-neutral)

## Units

| Concept | Value |
| --- | --- |
| Editor units per meter | 100 |
| Default construction grid | 25 editor units |
| Standard wall module | 300 × 300 × 20 |
| Floor / ceiling thickness | 20 |

Authored JSON and the inspector use **editor units**. Three.js and Rapier convert to **meters** at the engine boundary (`src/core/units.js`).

## Scripts

```bash
npm install
npm run dev      # editor at http://localhost:5173
npm test         # unit / serialization / play-restore tests
npm run build    # production build (file API is dev-only)
```

## Phase 1 acceptance

1. Open the editor (`npm run dev`).
2. Select a wall in the hierarchy or viewport; move with **Shift+LMB drag** or inspector position fields (grid snap).
3. **Save** / **Load** via the toolbar (writes `public/levels/*.json` through the Vite `/api/levels` middleware — not `localStorage`).
4. **Play** — Rapier on, WASD + mouse look; click the viewport to capture the pointer.
5. **Stop** — restores the authored level snapshot; runtime moves are discarded.

## Layout

```
src/core/           Actor, Component, World, Transform, units
src/components/     Brush, Light, PlayerSpawn
src/serialization/  Level serialize / deserialize
src/runtime/        Shared GameRuntime, SceneView, Physics, PlayerController
src/editor/         React shell (toolbar, hierarchy, viewport, inspector)
src/io/             Dev level file API client
vite-plugins/       Dev-only safe level file middleware
public/levels/      Authored level JSON (test-room.json)
```
