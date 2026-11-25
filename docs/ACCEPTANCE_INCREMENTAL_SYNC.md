# Phase 2F.7C — Incremental Scene Synchronization

## Objective

Ordinary editor mutations must not tear down and rebuild the entire Three.js world.
Targeted sync updates only affected actors while preserving Phase 2F.7B visual epochs and
GPU ownership. Full-world `syncFromWorld` remains for load, Play restore, asset-library
refresh, and explicit recovery.

## Implementation

| Path | Behavior |
| --- | --- |
| `actorVisualFingerprint.js` | Content / transform / parent fingerprints; subtract vs additive helpers |
| `SceneView.syncIncremental` | Add / remove / rebuild / transform / hierarchy without bumping `_syncToken` |
| `SceneView.rebuildActorVisual` | In-place component rebuild; bumps actor `visualEpoch` only |
| `SceneView.syncStats` | Counts full syncs, incremental syncs, rebuilds, transforms, hierarchy moves, geo/mat proxies |
| `GameRuntime.syncIncremental` | Thin wrapper for editor / tests |
| `EditorContext.afterWorldMutation` | Defaults to incremental; `fullSync` or `resync: 'full'` forces full rebuild |

### Change routing

- **Transform** → `updateActorTransform` (no mesh rebuild). Subtract movers set `carveDirty`.
- **Geometry / material / lights / component content** → rebuild that actor only.
- **Create / delete** → add or remove affected visuals.
- **Hierarchy** → re-parent Three groups; no mesh rebuild.
- **Subtractive carve dirty** → `ensureWorldSolidContainsSubtracts`, then rebuild additives + World Solid.
- **Load / setWorld / Play Stop / assetRevision** → full `syncFromWorld`.

## Verification

| Check | Result |
| --- | --- |
| Baseline | `7235f97` — 569 tests |
| `npm test` | **581 / 581 pass** (569 + 12 new) |
| New: `phase2f7cIncrementalSync.test.js` | Pass |
| Lint | exit 0 (warnings only) |
| Production build | Pass |
| Bench script | `node scripts/bench-incremental-sync.mjs` |

### Benchmark (Node harness, median of 8 transform edits)

Independent actor transform — full sync vs incremental:

| Level | Actors | Full median (ms) | Incremental median (ms) | Speedup | Rebuilds |
| --- | ---: | ---: | ---: | ---: | ---: |
| small | 12 | 0.348 | 0.164 | **2.12×** | 0 |
| medium | 80 | 2.361 | 0.898 | **2.63×** | 0 |
| large | 240 | 4.158 | 3.139 | **1.32×** | 0 |

Across all sizes: `fullSyncs = 0`, `actorRebuilds = 0`, `transformUpdates = 8` (one per run).
Unrelated actor groups and `visualEpoch` values are preserved (regression tests).

### Browser acceptance

| Map | Result |
| --- | --- |
| Gothic Mansion (additive) | Load OK; independent transform → `fullSyncs=0`, `actorRebuilds=0`, `transformUpdates=1`; unrelated `visualEpoch` / group preserved; `_syncToken` unchanged; `renderer.info` geometries ~116 |
| `acceptance-subtractive.json` | Load OK (15 actors, World Solid present); subtract move → incremental carve rebuilds additives (`fullSyncs=0`, rebuilds ≥1) |
| `acceptance-convex-brushes.json` | Load OK (14 actors, 6 ConvexBrush); incremental edit path OK (`fullSyncs=0`) |

## Remaining limitations

- Incremental sync still walks all actors to compare fingerprints (O(n) CPU); it avoids O(n) GPU teardown/rebuild.
- Prefab bulk updates still go through `afterWorldMutation` (incremental); very large prefab replaces may prefer an explicit `fullSync` later.
- Geometry/material alloc counters are post-populate proxies under actor groups, not Three.js allocator hooks.
- Phase **2F.7D** not started.
