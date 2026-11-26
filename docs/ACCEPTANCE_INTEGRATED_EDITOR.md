# Pre-Batch 8 — Integrated Editor Acceptance

**Baseline:** Batches 1–7.1 complete (1,078 tests)  
**Level (working copy):** `public/levels/acceptance-integrated-editor.json`  
**Original preserved:** `public/levels/acceptance-gothic-mansion.json` (`Gothic Mansion Acceptance`, 35 actors)  
**Harness:** `src/dev/integratedEditorAcceptance.js`  
**CDP entry:** `import('/src/dev/integratedEditorAcceptance.js').then(m => m.runIntegratedEditorAcceptance())`  
**Screenshots:** `docs/acceptance-integrated-editor/`  
**Commit:** `8b4ded6`  
**Unit tests:** **1,081 passed**

## Objective

Production-oriented authoring pass across completed systems on a **duplicate** Gothic Mansion level. Identify workflow friction, integration defects, and regressions. No Batch 8. No paid AI generation.

## Workflow results

| Workflow | Status | Notes |
| --- | --- | --- |
| Load mansion duplicate | **PASS** | ~450 ms load; original file untouched |
| Original preserved | **PASS** | Name + 35-actor gothic level unchanged |
| Furniture / asset placement + pivot | **PASS** | Meta pivot Apply → new placements inherit; existing actors unchanged; actor pivot overrides; rotate/scale/duplicate; multi-select; snap |
| Architectural editing | **PASS** | Additive/subtractive near furniture; door hinge pivot + rotate; UV/material surface edits; perspective/ortho |
| Materials and lighting | **PASS** | StaticMesh material override; wood/metal/glass/fabric brushes; light intensity; world fog; post-processing |
| Asset optimization | **PASS** | Simplify + auto LOD (~1.8 s); derived LOD assets registered; collision fields remain independent of visual LOD |
| Instancing (repeated furniture) | **PASS** | Eight additional Verify Cube instances |
| Editor workflow | **PASS** | Parenting, prefab create/place/override, undo/redo, delete, cell assign, quad layout switch, Asset Viewer present |
| Persistence / reload | **PASS** | Save → reload fingerprint (counts, mesh offsets, lights, prefabs) |
| Play / Stop restore | **PASS** | Play transition ~0.95 s; Stop restores edit mode + actor count |
| Performance metrics | **PASS** | Measured (see below) |
| Content Browser drag-and-drop | **NOT VERIFIED** | CDP cannot synthesize reliable pointer DnD — listed as manual |

## Performance (Chromium automation tab)

| Metric | Value |
| --- | ---: |
| Level load | 456 ms |
| Level save | 439 ms |
| Level reload | 722 ms |
| Play transition | 949 ms |
| Stop transition | 554 ms |
| Asset optimize (simplify + LOD gen/import) | 1,798 ms |
| Single viewport avg FPS / frame | 70.1 / 14.3 ms |
| Quad viewport avg FPS / frame | 14.5 / 68.8 ms |
| Final draw calls / triangles | 4,186 / 123,325 |
| Actors (furnished) | 101 |
| Heap delta after churn (place/delete + meta) | +39.9 MB |

Quad-viewport cost is expected (4× panes). Single-viewport remains interactive under the furnished load.

## Screenshots

| File | Captures |
| --- | --- |
| `01-furnished-mansion-overview.png` | Furnished mansion duplicate overview |
| `02-furniture-pivot-edit.png` | Furniture selection + Details / pivot workflow |
| `03-quad-viewport.png` | Quad layout with orthographic panes |
| `04-play-mode.png` | Play mode walkthrough view |

## Defects corrected

| Severity | Issue | Fix |
| --- | --- | --- |
| **P1** | `selectActors` updated React state but not `selectedRef` until next render — immediate `applySelectedMaterialToBrush` / transform APIs hit the previous selection | Sync `selectedRef.current = next` inside `selectActors` (`EditorContext.jsx`) |
| **P2** | `placeMeshAsset` read `asset.meta.defaultContentOffset` from the caller’s object — stale after Asset Viewer pivot Apply | Resolve live registry via `findAsset(assetRegistry, id)` before placing |

Regression: `src/tests/integratedEditorAcceptance.test.js`.

## Remaining usability / P3 (documented, not expanded)

| Item | Notes |
| --- | --- |
| Pivot Edit toolbar discoverability | Mode sits beside World/Local; consider viewport badge |
| Material override slot keys | `meshName:index` opaque for non-technical authors |
| Outliner reparent DnD affordance | Needs manual verification |
| Content Browser DnD | Manual only |
| Compression encode | **Deferred** (Batch 7) |
| Brush displacement tessellation | **Outstanding** |
| Full scene rebuild on sync | Known M6 debt |
| Batch 8 | **Not started** |

## Recommended manual user tests

Automation cannot adequately evaluate:

1. Pointer-lock FPS walk through furnished rooms (stairs, openings, furniture collision feel).
2. Content Browser drag-and-drop of meshes into Perspective and orthographic viewports.
3. Asset Viewer interactive gizmo drag on a hierarchical Meshy mesh (hand feel, Escape mid-drag).
4. Outliner multi-select reparent via drag onto a Cell.
5. Quad-viewport simultaneous orbit while editing a subtractive brush near furniture.
6. Material workspace PBR scrubbing with live mansion lighting (metal/glass/fabric look).

## Completion

| Gate | Result |
| --- | --- |
| Interactive harness | **All automated workflows PASS** (`ok: true`) |
| Unit tests | **1,081 passed** |
| Lint | Pass (warnings only; pre-existing) |
| Production build | Pass |
| Commit | `8b4ded6` |
