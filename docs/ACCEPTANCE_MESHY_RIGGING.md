# Acceptance — Meshy Auto-rig + Characters v0

## Behaviour

### Auto-rig (AI Assets → Meshy Results)
- After a **succeeded** Image-to-3D job (not already a rig job): **Height (m)** + **Auto-rig…**
- Spend gate: estimate → confirm (~5 credits) → `meshy rigging create --input-task-id … --height-meters …`
- On success: preview swaps to the skinned GLB; **Import Model** writes to Content Browser Meshes
- **Create Character** imports if needed, creates `public/characters/<id>.json`, opens Characters workspace

### Characters workspace v0
- Replaces the Characters placeholder (live in workspace nav)
- List / New / Rename / Delete character docs (`name` + `meshAssetId` + optional height / Meshy rig task id)
- Bind-pose mesh preview only — no clip playback, no level Character component, no player runtime

## Verify

- Automated: `meshyRigging.test.js`, `characterSchema.test.js`
- Manual: Character Image-to-3D → Auto-rig → approve → Import → Create Character → Characters tab shows bind-pose preview; Esc/discard still works on Meshy results
