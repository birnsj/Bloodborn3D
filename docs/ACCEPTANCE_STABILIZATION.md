# Phase 2F.7G — Final Regression, Profiling and Stabilization

**Status:** Complete (2026-11-25)  
**Baseline:** `df77689` — 612 tests  
**Gate tip:** see git history after this commit  
**Harness:** `public/dev/phase2f7gAcceptance.js` → `await window.__phase2f7gAcceptance()`  
**CI:** `.github/workflows/ci.yml` (test + lint + production build on `main` / PRs)

## Completion gate

| Requirement | Result |
| --- | --- |
| All prior tests + new regression | **627 / 627** (612 + 15) |
| Lint | exit 0 (warnings only) |
| Production build | Pass |
| Browser acceptance levels | **11 / 11** load + Play/Stop → edit |
| Critical / high defects | **None confirmed** |
| Sustained geometry growth under stress | **None** (Play/Stop / create-delete / level-switch return Δgeo = 0) |
| Unexplained performance regressions | **None** vs 2F.7C / 2F.6 recorded benches |

Phase **2F.7** is complete. Phase **2G** not started.

## 1. Full regression

### Automated

| Area | Coverage |
| --- | --- |
| Additive / subtractive maps | Round-trip `test-room`, gothic, convex, subtractive, `subractive` / `subractive-halls`; World Solid solids; physics build |
| ConvexBrush | `acceptance-convex-brushes.json` deserialize + prior 2F.5 suites |
| Materials / surfaces / UVs | Material undo×40; surfaces level Play; prior 2E suites |
| Prefabs / hierarchy / transforms | Prior prefab + hierarchy suites; incremental transform×30 |
| Selection / snap / multi-viewport | Prior 2F.6 suites (unchanged) |
| Serialization / undo | Acceptance level round-trips; HistoryStack material stress |
| Play/Stop / physics | **50** Rapier free cycles (unit); browser Play on 11 levels |
| Asset / GPU ownership | Prior 2F.7B suites; preview toggle stress in harness |

New units: `phase2f7gStabilization.test.js`; Play/Stop×50 in `gameRuntimeLifecycle.test.js`.

### Browser acceptance levels (harness)

| Level | Actors | Play | Geometries (post) | Triangles (post) |
| --- | ---: | --- | ---: | ---: |
| `acceptance-gothic-mansion.json` | 35 | OK | 160 | 9284 |
| `acceptance-convex-brushes.json` | 14 | OK | 33 | 348 |
| `acceptance-subtractive.json` | 15 | OK | 60 | 1418 |
| `subractive.json` | 30 | OK | 98 | 2624 |
| `subractive-halls.json` | 39 | OK | 131 | 2980 |
| `acceptance-surfaces.json` | 13 | OK | 78 | 3344 |
| `acceptance-multilevel.json` | 12 | OK | 86 | 480 |
| `acceptance-face-editing.json` | 4 | OK | 16 | 48 |
| `acceptance-edge-editing.json` | 4 | OK | 16 | 48 |
| `acceptance-vertex-editing.json` | 4 | OK | 16 | 42 |
| `acceptance-extrusion-clipping.json` | 4 | OK | 16 | 48 |

All restored `mode: edit` after Stop.

## 2. Performance profiling

Browser harness (`localhost:5175`, focused automation tab). Frame times via `measureFrameTimes(0.4)`.

| Level | Actors | Load (ms) | Single avg ms / FPS | Quad avg ms / FPS | Draw calls | Tris | Transform sync (ms) |
| --- | ---: | ---: | --- | --- | ---: | ---: | ---: |
| Small `test-room.json` | 8 | 161 | 5.49 / 182 | 5.50 / 182 | 48 | 548 | 0.2 |
| Medium `acceptance-convex-brushes.json` | 14 | 161 | 5.56 / 180 | 5.55 / 180 | 80 | 348 | 0.4 |
| Large `acceptance-gothic-mansion.json` | 35 | 465 | 5.59 / 179 | 10.88 / **92** | 2032 | 8668 | 0.3 |

### Comparison to prior benchmarks

| Source | Prior | This gate |
| --- | --- | --- |
| 2F.7C Node incremental transform (small/med/large) | 0.16 / 0.90 / 3.14 ms median | Re-run: **0.16 / 0.89 / 2.50 ms** (speedup 2.11× / 2.36× / 1.52×) — no regression |
| 2F.6 single vs quad (throttled tab) | ~665 / 912 ms (background) | Focused tab: small/medium ~parity; large quad ~2× single frame cost — expected multi-scissor |

Incremental sync still avoids full rebuilds on ordinary transforms (`fullSyncs = 0` in unit stress).

## 3. Lifecycle stress

| Stress | Cycles | Result |
| --- | ---: | --- |
| Play/Stop | 50 | OK; Rapier free×50 (unit); browser Δgeometries **0**, Δtextures **0** |
| Level switches | 20 | OK; return to `test-room` Δgeometries **0**; Δtextures **+40** (see debt) |
| Actor create + undo | 100 | OK; actors 8→8; Δgeometries **0** |
| Material apply + undo/redo | 40 | OK; material restored to `mat_verify_wall` |
| Asset preview Meshes tab toggles | 8 | OK |

Warm-up: first loads allocate shared material/texture cache entries; after warm-up, Play/Stop and create/delete geometry counts are stable.

## 4. Cleanup and tooling

- Added GitHub Actions CI: `npm test`, `npm run lint`, `npm run build`.
- No critical/high defect fixes required in this gate (physics/data/lifecycle already closed in 2F.7E–F).
- Docs: this file; `TECHNICAL_STATUS.md` / `ROADMAP.md` updated for 2F.7G complete.

## Remaining technical debt (by severity)

| Sev | Item |
| --- | --- |
| M | Level-switch return can leave **+textures** in `renderer.info` (shared material/texture cache retention across loads). Geometries stable. Not a Play/Stop leak. |
| M | Runtime still imports some editor helpers (audit M8 residual). |
| L | Incremental sync still O(n) fingerprint walk. |
| L | ~80+ React hooks / refs-during-render lint warnings. |
| L | Single ~6 MB production chunk. |
| L | `World.clear` O(n²) remove loop on large restores. |
| L | Mesh collision remains AABB box (no hull/trimesh). |

## How to re-run

```js
const s = document.createElement('script');
s.src = '/dev/phase2f7gAcceptance.js';
document.head.appendChild(s);
await new Promise((r) => { s.onload = r; });
const report = await window.__phase2f7gAcceptance(); // or { quick: true }
console.log(report.ok, report.profiling, report.stress);
```

```bash
npm test && npm run lint && npm run build
node scripts/bench-incremental-sync.mjs
```
