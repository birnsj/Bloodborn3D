# Consolidation C2 — Architectural Boundary Cleanup

**Status:** Complete  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) (M8/F2, F20)  
**Baseline:** C1 at `e46146f` · 1154 tests · 186 first-party lint warnings  
**Constraints:** No EditorContext partition, no geometry/render behavior changes, no schema/deps/UI redesign, no generator.

## Dependency inventory (before → after)

### Runtime → editor (M8 / F2) — SceneView

| Module | Purpose | Consumers | Ownership decision |
| --- | --- | --- | --- |
| `BrushGizmo` | Three.js transform/face gizmo | SceneView, MeshPreviewCanvas, tests | **runtime** (Three.js helper) |
| `brush/ramp/stair/column/arch/curvedWall` factories | Actor construction from AABB drag | SceneView preview, editor tools, tests, map factories | **runtime** (already depended on runtime geometry) |
| `gridSnap` | Edge/pivot snap math | Factories, EditorContext, Viewport | **core** (engine-neutral) |
| `viewportDisplay` | Lit/unlit/wireframe pass | SceneView, tests | **runtime/viewport** |
| `viewportCameras` | Pane camera create/pose/ortho | SceneView, Viewport, bridge | **runtime/viewport** |
| `viewportPrefs` | Camera/display mode helpers + prefs clamp/storage | SceneView, layout, menus | **runtime/viewport** (browser `localStorage` is editor-facing but not editor-package) |
| `paneScissor` | DOM→WebGL scissor math | SceneView, tests | **runtime/viewport** |

Editor paths remain as **compatibility re-exports** so existing `src/editor/...` import strings keep working.

### Core → runtime (F20)

| Module | Purpose | Ownership decision |
| --- | --- | --- |
| `postProcessingState.js` + `effectRegistry.js` | Defaults, normalize, merge, reset for level JSON | **core/postprocessing** (no Three / pmndrs) |
| `PostProcessingController` / presets / EffectComposer | GPU implementation | **runtime** (unchanged) |

Runtime `postprocessing/{postProcessingState,effectRegistry}.js` are thin re-exports of core.

## Changes

### Moved (canonical)

- `src/core/postprocessing/effectRegistry.js`
- `src/core/postprocessing/postProcessingState.js`
- `src/core/gridSnap.js`
- `src/runtime/BrushGizmo.js`
- `src/runtime/{brush,ramp,stair,column,arch,curvedWall}Factory.js`
- `src/runtime/viewport/{viewportDisplay,viewportCameras,viewportPrefs,paneScissor}.js`

### Updated importers

- `src/core/World.js` → core PP normalize
- `src/runtime/SceneView.js` → runtime-local imports only (no `editor/`)
- `src/serialization/LevelSerializer.js` → core PP normalize

### Compatibility shims

Editor and runtime previous paths re-export canonical modules (documented in each shim file).

### Tests

- `src/tests/architectureBoundaries.test.js` — direct + transitive: core↛runtime/editor, runtime↛editor; SceneView/World string guards

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **1160 / 1160** (126 files; +6 boundary tests) |
| `npm run lint` | exit 0 · **186** first-party warnings · **0** vendor (unchanged vs C1) |
| `npm run build` | pass |

### Functional regression (automated coverage)

Unit/integration suites that exercise unchanged behavior after the move (same assertions):

- Additive / subtractive / World Solid — `brushBoolean`, `phase2f7a*`, `worldSolidFit`, solid-limit tests  
- Parametric factories — brush/ramp/stair/arch/curved/column factory tests  
- Placement / snap — `gridSnap` via factory + Viewport/Editor paths (shim)  
- Gizmo — `brushGizmo.test.js`, Batch 7.1 pivot  
- Multi-viewport / cameras / scissor / prefs — `viewportPrefs`, `viewportCameras`, `paneScissor`, `phase2f6*`, `viewportIsolation`  
- Display modes — `marqueeSelection`, `performanceStabilization`  
- Post-processing normalize/presets — `postProcessing.test.js`  
- Serialization / Play / undo — existing phase2f7* / lifecycle suites  

No new renderers, duplicated Three scenes, or GPU ownership changes were introduced — modules moved with re-exports only.

## Audit dispositions

| ID | Disposition |
| --- | --- |
| **M8 / F2** | **Closed** — SceneView has zero `editor/` imports; boundary tests enforce |
| **F20** | **Closed** — World imports core PP schema only |
| F1 EditorContext partition | Still open — not in C2 |
| Component → runtime (`surfaces` / openings) | Pre-existing; out of C2 scope |

## Remaining consolidation (requires approval)

1. EditorContext domain partition / gesture helpers (F1)  
2. Optional: migrate components off runtime surface helpers into core/geometry  
3. Measured `World.clear`; mansion FPS re-measure  
4. Phase 2G generator — still reserved  

**Stop after C2.** Do not begin EditorContext restructuring or Phase 2G without approval.
