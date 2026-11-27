# Batch 9 — Editor Organization and Viewport Tools

**Level:** `public/levels/acceptance-layers.json`  
**Academy:** lesson 30 (`editor-layers`)  
**Tests:** `src/tests/batch9AuthoringLayers.test.js`  
**Baseline prior:** Batch 8 UV closure (`dc5f925` / `aa20925`)

## Architecture

| Concern | Owner | Notes |
| --- | --- | --- |
| Layer tree + `activeLayerId` | `world.authoringLayers` | Serialized; seed defaults Architecture / Props / Lighting / Environment / Gameplay |
| Actor membership | `actor.authoringLayerId` | ID only; null resolves to Architecture (or first root) |
| Editor filters | `EditorContext.layerUi` | `hidden` / `locked` / `solo` — **session only**, never level JSON |
| Viewport filter | `SceneView` edit mode | `group.visible` ∧ layer filter; Play ignores `layerUi` |
| Parenting / Cells / Prefabs | Unchanged | Layers do not replace hierarchy |
| `THREE.Layers` | Atmosphere bit 2 only | **No** mapping from authoring layers |

**TextureHelper:** **Deferred** — Texture Inspector already covers 2D sampling diagnostics; a second helper would overlap without adding authoring value.

## Deliverables

| Item | Status |
| --- | --- |
| Hierarchical layers + cycle-safe reparent | Done |
| Delete requires reassignment; never deletes actors | Done |
| Nested effective visibility/lock | Done |
| Solo restore of prior hidden map | Done |
| Undo commands for tree / membership / active | Done |
| Creation / duplicate / prefab stamp Active layer | Done |
| Prefab save strips `authoringLayerId` | Done |
| Fingerprint rebuild trap fixed (`visible` out of content FP) | Done |
| Layers dock + Outliner chips/filter + Details assign | Done |
| Per-pane ViewHelper (perspective) | Done |
| Academy 30 + Help + acceptance level | Done |

## Closure checklist

| Criterion | Result | Notes |
| --- | --- | --- |
| Nested layers | **Passed** | Detail Props under Props in acceptance level |
| Solo restore | **Passed** | Unit + UI: previousHidden restored on clear |
| Layer hide non-destructive (no CSG rebuild) | **Passed** | `group.visible` only; fingerprint excludes `actor.visible` |
| Prefab cross-level | **Passed** | Strip on save; Active layer on place |
| Multi-viewport ViewHelper | **Passed** | Per-pane helper; perspective only |
| Play with hidden layers | **Passed** | `editMode` false → layer filter off |
| Backward compat | **Passed** | Missing `authoringLayers` seeds defaults |
| No THREE.Layers map | **Documented** | Authoring layers stay separate |
| TextureHelper | **Deferred** | Rationale above |

## Performance

Use the same method as Batch 8: `measureFrameTimes(seconds, { warmupFrames })` on the gothic mansion under comparable viewport prefs. Authoring-layer filters are O(actors) visibility toggles with no mesh rebuild; ViewHelper is a small ortho overlay per perspective pane.

## Non-goals (explicit)

- Mapping authoring layers → `THREE.Layers` for GPU layer masks
- Replacing Outliner parent tree with a layer tree
- TextureHelper / advanced texture diagnostics beyond Texture Inspector
