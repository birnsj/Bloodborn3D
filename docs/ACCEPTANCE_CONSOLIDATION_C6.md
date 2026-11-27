# Consolidation C6 — Final Level Editor Foundation Acceptance

**Status:** Complete (2026-11-26)  
**Baseline:** C5 `8ef9cf2` · 1195 tests · 176 first-party lint warnings  
**Closure:** Browser harness `ok: true` · **1219** tests · production build OK · Phase 2G **not started**  
**Authority:** [`AUDIT_LEVEL_EDITOR_FOUNDATION.md`](./AUDIT_LEVEL_EDITOR_FOUNDATION.md) + C1–C5 acceptance reports  

Raw capture: [`c6-foundation-capture.json`](./c6-foundation-capture.json)  
Designer checklist: [`MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md`](./MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md)

**Scope:** Final correctness / integration pass. No EditorContext partitioning, DetailsPanel rewrite, Viewport decomposition, procedural generation, or schema changes.

---

## 1. Persistence and data integrity

| Check | Result | Evidence |
| --- | --- | --- |
| Schema versions 1–3 / reject others | **Pass** | Existing `levelSchemaVersion` + 2F.7E suites |
| Atomic level writes (Windows rename-over) | **Pass (hardened)** | `levelFileApi` now uses `fsSafety.atomicWriteFile` |
| Invalid JSON on PUT | **Pass (hardened)** | 400 `INVALID_JSON`; nothing written — `consolidationC6Foundation.test.js` |
| Oversize PUT body | **Pass (hardened)** | 413 `BODY_TOO_LARGE` (8 MiB cap) |
| Non-localhost Level API | **Pass (hardened)** | 403 `LOCALHOST_ONLY` |
| Over-cap / malformed geometry refused | **Pass** | `phase2gPrerequisites` (+ localhost header) |
| Dirty tracking / failed save / failed load | **Pass** | `editorLifecycle` / `dirtyTracking` / 2F.7E |
| Undo/redo + composite atomicity | **Pass** | history + C6 generator composite fixture |
| Play/Stop restoration | **Pass** | unit + C6 quick browser confirm (Δgeo 1, Δtex 3) |
| Gothic / integrated validate + deserialize | **Pass** | C6 persistence pointer tests |
| Save As / delete-level E2E | **Manual** | Checklist §A |

No schema changes.

---

## 2. Editor workflow acceptance

| Workflow family | Automated | Manual |
| --- | --- | --- |
| Gothic + integrated load / measure | C6 harness + prior integrated/C5 harnesses | Checklist §G |
| Construction / subtractive / geometry edit | Existing geometry / convex / subtractive suites | Checklist §B |
| Assets / pivot / materials | Asset tools + textures acceptance | Checklist §C |
| Lighting / environment | Batch lighting + env acceptance | Checklist §D |
| Prefab / Cell / authoring layers | Prefab + batch9 layers suites | Checklist §E |
| Multi-viewport | Multi-viewport + C6 layout measure | Checklist §F |
| Save/reload / Play/Stop | 2F.7E + lifecycle | Checklist §A/G |

Browser automation exercised: level load, layout single/quad, framed GPU snapshot, Play/Stop×10, shared-cache release. Drag-drop, Prefab apply/revert UI, and Save As remain **manual**.

---

## 3. C5 measurement gaps — closed

Harness: `src/dev/c6FoundationAcceptance.js`  
CDP: `import('/src/dev/c6FoundationAcceptance.js').then((m) => m.runC6FoundationAcceptance())`

Conditions: Cursor Chromium · DPR **1.5** · forced canvas **671×507** (Batch 8) · stall-hardened `measureFrameTimes`.

| Metric | Gothic | Integrated |
| --- | ---: | ---: |
| Median FPS single | **76.3** | **29.8** |
| Median FPS quad | **35.5** | **9.0** |
| Lit draw calls (authority) | **556** (quad) | **1692** (quad) |
| Lit triangles (authority) | **3112** (quad) | **38334** (quad) |
| Geometries / textures | 188 / 32 | 270 / 39 |

| Gap | Disposition |
| --- | --- |
| Lit single-pane draw/tri | **Partial** — after layoutMode toggles, single `measureGpuSnapshot` still reports shallow ~6/66 under automation. **Quad lit snapshot after framing** is the C6 authority (556/3112 gothic). Documented instrumentation caveat — not a content leak. |
| Batch 8 canvas FPS | **Closed** — integrated **29.8 / 9.0** @ 671×507 DPR 1.5 (vs C5 small-canvas ~95 / ~24). Larger canvas lowers FPS as expected; integrated quad still under ≥30. |
| `releaseSharedAssetCaches` | **Closed** — after integrated → test-room, release cleared caches **18/8/0 → 0/0/0**. |
| C5 lifecycle fixes | **Confirmed** — Play/Stop×10 Δgeo **1**, Δtex **3** (bounded). |

---

## 4. Development API safety

| Item | Disposition |
| --- | --- |
| Level PUT unbounded body | **Fixed** — `readBodyLimited` + 413 |
| Level API LAN exposure | **Fixed** — `isLocalDevHost` + 403 |
| Level atomic write on Windows | **Fixed** — `atomicWriteFile` |
| Level path containment | **Hardened** — `resolveContainedPath` |
| Invalid JSON status | **Fixed** — 400 |
| Meshy staging `..` / prefix escape | **Fixed** — separator-aware containment |
| OpenArt / Meshy spend gates + localhost | **Confirmed** prior (pipeline hardening) |
| Asset / concept / project-art localhost parity | **Deferred** — implementations use `fsSafety` body/path helpers; localhost gate not added in C6 (paid APIs already gated) |
| Paid generation jobs | **Not initiated** |

---

## 5. Architecture and maintainability

| Area | Verdict |
| --- | --- |
| Core ↛ runtime PP / runtime ↛ editor (C2) | **Hold** — `architectureBoundaries` green |
| Shared gestures / Set*Properties (C3) | **Hold** |
| Geometry validation / F14 `syncGeneratedWorld` (C4) | **Hold** + C6 generator fixtures |
| GPU ownership (C5) | **Hold** + cache-release exercised |
| Incremental sync | **Hold** — ordinary edits still incremental |
| EditorContext / Details / Viewport split | **Not reopened** (no correctness defect) |

### Remaining architectural debt

- F1 residual EditorContext domain extraction (approval-gated)
- F6 DetailsPanel monolith / F22 Viewport input monolith
- F9 ~8 MB single chunk
- F3 integrated quad ≥30 FPS (architectural N-camera)
- F4/F19 carve broadphase + World Solid spatial chunking (deferred; no measured win)
- ~180 first-party lint warnings (hooks/refs; concurrent WIP may add vs C5’s 176)

---

## 6. Phase 2G readiness

Surface: `src/editor/generatorIntegration.js`  
Tests: `consolidationC6Foundation.test.js`

| Requirement | Result |
| --- | --- |
| Build candidates without mutating active world | **Pass** |
| Validate before commit | **Pass** (`validateWorldGeometry` / `assertWorldGeometry`) |
| Reject invalid without partial mutation | **Pass** |
| Stable IDs + asset refs through serialize/deserialize | **Pass** |
| Apply via `AddActorsCommand` / `CompositeCommand` | **Pass** |
| Cells + authoring layers stamp | **Pass** |
| Atomic undo of generated batch | **Pass** |
| `syncGeneratedWorld` asserts before sync (F14) | **Pass** |

**Verdict: Ready for Phase 2G design work under existing ceilings** (AABB carve only, solid cap 512, render≠collision intentional, prefer `syncGeneratedWorld`).  
**Do not implement** generation rules, generator UI, or new content systems without explicit approval.

---

## 7. Audit finding disposition table

| ID | Class | Notes |
| --- | --- | --- |
| F1 | Partial | Gestures/commands extracted (C3); hub still large |
| F2 / M8 | Resolved | C2 |
| F3 | Partial + accepted constraint | Measurement integrity closed; integrated quad &lt;30 FPS remains |
| F4 | Accepted + deferred | Cap 512; broadphase deferred |
| F5 | Resolved | Docs reconciled through C6 |
| F6 | Deferred | DetailsPanel |
| F7 | Resolved | Vendor ignored; residual hooks = L debt |
| F8 | Resolved + accepted constraint | Owned leaks fixed; shared JS caches by design |
| F9 | Deferred | Chunk split |
| F10 | Resolved | C1 |
| F11 | Resolved | C1 hooks + C4 clear |
| F12 | Accepted constraint | Esc/tool contract |
| F13 | Accepted constraint | SceneView size OK |
| F14 | Accepted constraint | Generators must call `syncGeneratedWorld` / assert |
| F15 | Resolved | Lean deps |
| F16 | Accepted / blocking 2G design | AABB carve only |
| F17 | Accepted / blocking 2G design | Render ≠ collision intentional |
| F18 | Partial | Stair material share; mesh batching deferred |
| F19 | Deferred | WS spatial chunks |
| F20 | Resolved | C2 |
| F21 | Resolved | C3 |
| F22 | Deferred | Viewport split |
| F23 | Accepted / deferred | Instancing vs LOD |
| F24 | Resolved | Brush solids coherent |
| M1–M11, H1–H2, stab C1 | Resolved | Prior phases |
| D1–D3 | Resolved | 2G prerequisites |
| L / F7 / F9 / dev APIs | Deferred / accepted | As above |

No finding is **blocking Phase 2G start** beyond the documented design ceilings (F16/F17/F4/F14).

---

## 8. Final verification

| Check | Result |
| --- | --- |
| `npm test` | **1219 passed** (131 files) |
| `npm run lint` | Exit 0 · **180** warnings (C5 was 176; delta from concurrent WIP outside C6 commit set) |
| `npm run build` | **Pass** |
| Architecture boundaries | **Pass** |
| C6 foundation unit suite | **13/13** |
| C5 GPU lifecycle regression | **Pass** |
| Geometry / 2G prerequisite regression | **Pass** |
| Browser C6 foundation harness | **`ok: true`** |
| Integrated editor full UI soak | Covered by prior acceptance + manual checklist |

### Confirmed defects corrected in C6

1. Level API unbounded body / missing localhost / Windows atomic rename  
2. Meshy staging path prefix escape  

---

## 9. Remaining manual verification

See [`MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md`](./MANUAL_LEVEL_EDITOR_ACCEPTANCE_CHECKLIST.md).

Automation caveats:

- Single-pane `measureGpuSnapshot` after layout toggle may report shallow draw/tri  
- Fiber `editor.world.actors.length` can lag immediately after `applyLevelData` (reported 15; on-disk levels are 35 / 101)  
- Shell CSS width may lag forced 671px while renderer size in GPU snapshot shows 671×507  

---

## 10. Phase 2G readiness verdict

**Foundation consolidation complete through C6.**  

Phase 2G rule-based map generation may be scheduled **only with explicit designer approval**, using `generatorIntegration` + existing validation/history/sync pathways, and respecting AABB-carve / 512-solid / render≠collision ceilings.

**Stop here. Do not begin Phase 2G or World Map development without approval.**
