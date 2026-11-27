# Consolidation C1 — Documentation and Code Hygiene

**Status:** Complete  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md)  
**Scope:** F5, F7, F10, verified dead-code portion of F11  
**Constraints honored:** No architecture restructuring, EditorContext partitioning, rendering/geometry behavior changes, dependency upgrades, schema changes, UI redesign, generator work, or paid AI generation.

## Baseline (before C1)

| Check | Result |
| --- | --- |
| HEAD | `764a430` (audit doc commit on `main`) |
| Working tree | Clean before edits |
| `npm test` | **1151 / 1151** pass (124 files) |
| `npm run lint` | exit 0 · **~1276** warnings (**~1067** `public/vendor` · **~209** first-party) |
| `npm run build` | pass · ~8.0 MB JS chunk |

First-party warning categories (pre-cleanup, src only):

| Count | Rule |
| --- | --- |
| 79 | `react-hooks(exhaustive-deps)` |
| 35 | `react(refs)` |
| 28 | `react(only-export-components)` |
| 26 | `react(set-state-in-effect)` |
| 22 | `eslint(no-unused-vars)` |
| 10 | `react(immutability)` |
| 5 | `react(preserve-manual-memoization)` |
| 2 | `eslint(no-control-regex)` |
| 1 | `oxc(erasing-op)` |
| 1 | `eslint(no-useless-escape)` |

## After C1

| Check | Result |
| --- | --- |
| `npm test` | **1154 / 1154** pass (125 files; +3 from `folderForKind.test.js`) |
| `npm run lint` | exit 0 · **186** first-party warnings · **0** `public/vendor` |
| `npm run build` | pass · ~8.0 MB JS chunk (unchanged shape) |

### Lint before → after

| Metric | Before | After |
| --- | --- | --- |
| Total reported warnings | ~1276 | **186** |
| `public/vendor` warnings | ~1067 | **0** |
| First-party warnings | ~209 | **186** |
| `eslint(no-unused-vars)` | 22 | **0** |
| `react-hooks(exhaustive-deps)` | 79 | **79** (retained intentionally) |

### Remaining first-party warnings (baseline)

| Count | Rule | Notes |
| --- | --- | --- |
| 79 | `react-hooks(exhaustive-deps)` | Concentrated in `EditorContext.jsx`; not suppressed |
| 35 | `react(refs)` | Ref-during-render patterns |
| 28 | `react(only-export-components)` | Context/provider modules |
| 26 | `react(set-state-in-effect)` | Sync-from-props effects |
| 10 | `react(immutability)` | |
| 5 | `react(preserve-manual-memoization)` | |
| 2 | `eslint(no-control-regex)` | Intentional sanitizers (Drive / Project Art) |
| 1 | `oxc(erasing-op)` | `src/core/math3d.js` — left for measured review |

Top modules by remaining warning count: `EditorContext.jsx` (~65, mostly hooks), then AssetBrowserContext / MaterialsWorkspace / AssetViewer / dockPanels / Viewport / Project Art.

---

## Files changed

### Config / hygiene
- `.oxlintrc.json` — `ignorePatterns: ["public/vendor/**"]`

### F10 — `folderForKind`
- `src/assets/assetCatalog.js` — import shared `folderForKind` from `AssetRegistry.js`; remove private duplicate
- `src/tests/folderForKind.test.js` — **new** regression coverage (defaults, catalog parity, explicit folder preserve)

### F11 — Component lifecycle (partial)
- `src/core/Component.js` — remove unused `onStart` / `onUpdate` / `onStop`; keep `onAttach` / `onDetach`

### Dead / unused cleanup (mechanical)
- `src/dev/googleDrive/googleDriveClient.js` — remove uncalled private `driveFetch`; fix useless `\-` escape
- `src/dev/googleDrive/googleDriveSession.js` — unused `loadOAuthClientConfig` import
- `src/dev/mesh/glbPivot.js` — unused `mat4Identity`
- `src/dev/integratedEditorAcceptance.js` — unused `THREE` import
- `src/runtime/createThreePrimitive.js` — remove dead material-URL stub; keep API param as `_resolveTextureUrl`
- `src/components/PrimitiveMeshComponent.js` — underscore unused destructure bindings
- `src/editor/EditorContext.jsx` — unused `getDefaultAuthoringLayerId` import
- `src/editor/Viewport.jsx` — unused `setGizmoSpace` destructure
- `src/editor/layout/AssetViewer.jsx` — wire `suppressNativeImageMenu` on tile context menu (was imported unused; now called)
- `src/editor/assets/MeshAssetTools.jsx` — unused imports
- `src/editor/conceptLibrary/ConceptLibraryPanel.jsx` — unused `useMemo`
- `src/editor/postprocessing/PostProcessingSettings.jsx` — unused `setAxis` helper
- Tests: unused imports/vars in `batch9AcceptanceClosure`, `phase2f7fPhysics`, `phase2f7hAuditCorrections`, `batch71PivotEditing`, `batch8UvRegression`

### Documentation (F5)
- `docs/TECHNICAL_STATUS.md` — current tests, schemas 1–3, 512 solids, deps, Batches 1–9 + pivot, workspaces, debt, perf Unverified, C1 dispositions
- `docs/ROADMAP.md` — workspaces nav order, development sequence, Batches 1–9, foundation consolidation C1
- `docs/ACCEPTANCE_PREREQUISITES.md` — annotate historical 64-cap as superseded by 512
- `docs/ACCEPTANCE_CONSOLIDATION_C1.md` — this report

---

## Dead code removed — evidence

| Item | Evidence | Disposition |
| --- | --- | --- |
| `Component.onStart` / `onUpdate` / `onStop` | Grep: only defined on `Component.js`; never called; never overridden. `Actor` only invokes `onAttach` / `onDetach`. | **Removed** |
| Private `driveFetch` | Defined in `googleDriveClient.js`; zero call sites; live APIs use inline `fetch`. | **Removed** (Drive surface retained) |
| `mat4Identity` in `glbPivot.js` | Defined; never referenced. | **Removed** |
| No-op material URL try-block in `createThreePrimitive.js` | Assigned unused `defUrl` / unused `createThreeMaterial` import; materials come from `_resolvedMaterial`. | **Removed stub**; caller API kept |
| Duplicate `folderForKind` in `assetCatalog.js` | Identical mapping to `AssetRegistry.folderForKind` (string kinds). | **Consolidated** |

**Deferred (not removed):** `World.clear` O(n²) — measured pass later. Extension points, acceptance harnesses, Drive OAuth surface, compatibility migrations, deferred Three.js capabilities.

---

## Documentation corrections

- Test count **783 → 1151+** (now **1154** after C1).
- Schema manual test no longer claims schema **3** unsupported; supported range **1–3**.
- Solid cap docs: historical **64** annotated as superseded by **512**.
- Batches **1–9** + pivot **7.1** recorded complete; mansion FPS re-measure remains **Unverified**.
- Nine workspaces listed in nav order; development sequence Foundation → 2G → Level Editor acceptance → World Map.
- Materials + AI Assets noted as already substantial.

---

## Audit finding dispositions

| ID | Disposition |
| --- | --- |
| **F5** | **Closed** — TECHNICAL_STATUS, ROADMAP, ACCEPTANCE_PREREQUISITES updated |
| **F7** | **Closed** — vendor ignored; unused cleaned; remaining warnings documented |
| **F10** | **Closed** — single `folderForKind`; regression tests |
| **F11** | **Partial** — lifecycle stubs removed; `World.clear` deferred |
| F1–F4, F8–F9, F16–F22, M8 | **Open** — out of C1 scope; require approval for next passes |

---

## Remaining consolidation work (do not start without approval)

1. M8 — extract SceneView preview/factory/gizmo/viewport-pref from `editor/`  
2. EditorContext domain partition + shared gesture helpers  
3. Move PP normalize out of `World` → runtime import  
4. Measured `World.clear` / mansion FPS re-measure  
5. Optional DetailsPanel / Viewport splits  

**Stop after C1.** Phase 2G generator and M8/EditorContext restructuring are not authorized by this pass.

---

## Compatibility

- Existing levels, assets, preferences: unchanged schemas and APIs.  
- Content Browser folders: same kind→folder defaults (`Textures` / `Meshes` / `Materials` / `Prefabs` / `Misc`); explicit folders preserved.  
- Asset Viewer RMB: still opens custom menu; now also calls `suppressNativeImageMenu` (same preventDefault as `openFromEvent`).
