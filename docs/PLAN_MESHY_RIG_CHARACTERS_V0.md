# Plan — Meshy Auto-Rig + Characters v0

**Status:** awaiting designer confirm to implement  
**Approval context:** designer approved Meshy auto-rig in AI Assets and starting Characters; this doc locks the thin first Characters slice.

## Intent

1. **AI Assets:** paid Meshy **Rigging** after Image-to-3D (same estimate → approve → CLI pattern).  
2. **Characters v0:** replace the Characters placeholder with a minimal **character library** that points at a rigged mesh. No animation authoring, no level Character actor, no Play skinned runtime yet.

## Locked thin Characters slice (v0)

| In | Out |
| --- | --- |
| Characters workspace UI (not placeholder) | Animation workspace |
| Character JSON: `id`, `name`, `meshAssetId`, optional `meshyRigTaskId`, `heightMeters`, `schemaVersion` | Bone editing / retargeting |
| Create from Content Browser mesh or post-rig handoff | State machines / clips library |
| Bind-pose 3D preview of the mesh | Playing walk/run in Characters |
| List / rename / select | Level Editor Character component |
| Persist under project characters store (engine-neutral) | Standalone player character runtime |

Bundled Meshy walk/run URLs may be **downloaded into staging** for later Animation work, but v0 does not play them.

## A — Meshy Auto-Rig (AI Assets)

### UX
- On a **succeeded** Image-to-3D job in Meshy Results: **Auto-rig…**
- Controls: `height_meters` (default 1.7), type **biped** only in v0
- Confirm dialog lists credits + height (same spend gate as Image-to-3D)
- Progress → preview rigged GLB → **Import** to Meshes → optional **Create Character** (switches to Characters with that mesh)

### CLI / server
- `meshy rigging create --input-task-id <image-to-3d-id> --height-meters …` (prefer task id over re-upload)
- Fallback: `--model-url` to staged GLB when task id missing
- Poll/wait; download `rigged_character_glb` (and optionally `--all-assets` for bundled clips into staging only)
- Credit estimate: document Meshy’s published rig cost (task reports ~5 credits); hard-code estimate with note until pricing helper exists
- Localhost-only vite plugin routes; never spend without `confirmSpend: true`

### Files (expected)
- `src/dev/meshy/meshyRigging.js` — validate settings, argv, credit estimate, summarize
- Extend `vite-plugins/meshyApi.js` + `src/io/meshyClient.js` + `meshyUiStore` / `MeshyResults`
- Tests: argv, Character-only humanoid path, spend gate, reject without source
- Docs: `MESHY_CAPABILITY_INVENTORY.md`, `ACCEPTANCE_MESHY_RIGGING.md`, help ids, `TECHNICAL_STATUS.md`

## B — Characters workspace v0

### Data
- Engine-neutral character docs, e.g. `public/characters/<id>.json` + index (mirror Materials/Project Art simplicity; exact path chosen to match existing project IO)
- No Three.js types in JSON
- `meshAssetId` must reference registry `mesh`

### UI
- Replace `PlaceholderWorkspace` when `workspace === 'characters'`
- Layout: list | details (name, mesh link) | preview canvas (reuse mesh preview patterns; SkinnedMesh shows bind pose)
- Mark workspace live in `WorkspaceNav` (`LIVE_WORKSPACES`)
- Help: `workspace.characters`

### Explicit non-goals for v0
- Player / Play skinned characters  
- Animation workspace  
- Quadruped / skeleton template picker (can add later)  
- Auto-rig from arbitrary non-Meshy meshes via URL upload (can add; v0 prefers `input_task_id`)

## Verify
- Automated: rigging settings/CLI tests; character JSON normalize/round-trip
- Manual: Image-to-3D Character → Auto-rig → approve → import → Create Character → Characters tab shows bind-pose preview
- `npm test` / `lint` / `build`

## Sequencing
Implement **A then B** in one pass if confirmed; Characters can ship as empty library if rig lands first, but handoff button should land with both.
