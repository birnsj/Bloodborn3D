# Manual Level Editor Acceptance Checklist

**Purpose:** Designer smoke pass after foundation consolidation C6.  
**Levels:** `acceptance-gothic-mansion.json`, `acceptance-integrated-editor.json`  
**Do not begin Phase 2G or World Map work from this checklist.**

Mark each item Pass / Fail / N/A. Note failures with steps to reproduce.

## A. Persistence

- [ ] New level → place a brush → **Save** → reload → actor + transform intact
- [ ] **Save As** to a new filename → both files exist → reload new file
- [ ] Dirty indicator appears after edit; clears after successful save
- [ ] Unsaved prompt on load / leave when dirty
- [ ] Failed save (optional: stop Vite mid-save) leaves dirty state and world unchanged
- [ ] Invalid / hand-edited JSON rejected without wiping the open level
- [ ] Play → move player → **Stop** restores authored actors / camera / undo stack usable

## B. Construction & geometry

- [ ] Additive box / wall / floor / ceiling place and snap
- [ ] Subtractive brush carves solids; Play collision matches expectations for AABB carve
- [ ] Face / Edge / Vertex edit move + undo
- [ ] Ramp, stair, column, arch, curved wall place and Play
- [ ] ConvexBrush convert / edit (if used in level)

## C. Assets & materials

- [ ] Content Browser drag mesh into viewport
- [ ] Asset Viewer open mesh / texture; pivot edit apply
- [ ] Material assign to brush surface; undo/redo
- [ ] Texture transform (scale/offset) persists after save/reload

## D. Lighting & environment

- [ ] Point / spot / directional lights with shadows
- [ ] Water / mirror / sky / decal place and dispose cleanly on delete
- [ ] World Settings ambient / env / post-processing preview toggles

## E. Organization

- [ ] Multi-select, parent/unparent, Cell create/assign
- [ ] Prefab create → place → override → apply / revert
- [ ] Authoring layer assign, visibility, lock (locked actor rejects edit)
- [ ] Outliner filter by layer

## F. Viewports

- [ ] Single ↔ four-pane layout; cameras independent
- [ ] Lit / unlit / wire display modes
- [ ] ViewHelper axes visible without opaque black corner box
- [ ] Focus selection frames content

## G. Integrated mansion workflow

- [ ] Load `acceptance-integrated-editor.json`
- [ ] Select furniture static mesh → Details → pivot / material override
- [ ] Save → reload → overrides intact
- [ ] Play / Stop on mansion
- [ ] Quad layout remains usable (expect lower FPS than single)

## H. Known non-goals (do not fail C6)

- Integrated quad ≥30 FPS
- True CSG / non-AABB carve
- World Map workspace
- Procedural map generation UI

## Sign-off

| Field | Value |
| --- | --- |
| Tester | |
| Date | |
| Build / commit | |
| Result | Pass / Fail |
| Notes | |
