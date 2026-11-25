# Phase 2F.7B — Asset Lifecycle and GPU Resource Hardening

## Findings (verified against `435b8c4`)

1. **Global sync invalidation on single-actor edits.** `updateBrushGeometry` bumped `_syncToken`, cancelling in-flight material/mesh loads for *all* actors when one brush was resized.
2. **Shared GLTF geometry disposed with instances.** `cloneLoadedMesh` shared geometries with the cache; `disposeObject` disposed them on actor remove / preview teardown, corrupting the mesh cache.
3. **Cached textures lacked ownership tags.** Instance clones were disposed correctly in most paths, but preview abandonment and shared-source disposal were unsafe without an explicit shared/owned contract.
4. **Material preview abandoned loads** called `material.dispose()` without releasing owned map clones.

M4/M5 (retryable null eviction; stale brush materials vs full rebuild) remain in place and are preserved.

## Corrections

| Area | Change |
| --- | --- |
| `gpuResources.js` | Shared vs owned tagging; `disposeObjectTree` / `disposeOwnedMaterial` skip shared cache assets |
| `materialFactory.js` | Cache textures marked shared; per-material clones marked owned |
| `meshLoader.js` | Cached GLTF subtree marked shared; instance materials owned, geometries stay shared |
| `SceneView.js` | Per-actor `visualEpoch`; `updateBrushGeometry` no longer bumps global `_syncToken`; async apply/static-mesh paths check actor epoch |
| `MeshPreviewCanvas.jsx` | Uses owned disposal; abandons mid-load clones safely |

No geometry algorithm or serialization changes. Incremental sync landed separately in Phase 2F.7C.

## Verification (2026-11-24)

| Check | Result |
| --- | --- |
| `npm test` | **569 / 569 pass** (560 baseline + 9 new) |
| New: `gpuResources.test.js` | Pass |
| New: `phase2f7bAssetLifecycle.test.js` | Pass |
| `sceneViewStaleMaterials.test.js` / `retryableAssetLoads.test.js` | Pass |
| Lint | exit 0, warnings only |
| Production build | Pass |
| Browser: Gothic Mansion | Additive load OK; `renderer.info` ~116 geometries after settle |
| Browser: 8× `syncFromWorld` (same world) | Geometry/texture counts stable across samples (no monotonic climb) |
| Browser: `acceptance-subtractive.json` | Subtractive OK; World Solid + 40 substrate pieces |

## Remaining limitations

- Texture/mesh caches are process-lifetime (no LRU eviction beyond failed-load eviction).
- Browser memory tooling cannot fully prove JS heap leaks; GPU `info.memory` is the measured proxy.
- Ordinary edits now use incremental sync (Phase **2F.7C**); full `syncFromWorld` retained for load/recovery.
