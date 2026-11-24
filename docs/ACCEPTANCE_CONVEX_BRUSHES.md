# Acceptance — Convex Brushes (Phase 2F.5)

**Level:** `public/levels/acceptance-convex-brushes.json`  
**Harness:** `public/dev/phase2f5Acceptance.js` → `await window.__phase2f5Acceptance()`  
**Regression:** `public/levels/acceptance-gothic-mansion.json` (unmodified)  
**Unit suite:** `src/tests/phase2f5Integration.test.js`  
**Date:** 2026-11-24  

Integrated verification of the Phase 2F geometry-editing pipeline. Does **not** mark Phase 2F complete — **2F.6** (multi-viewport / marquee) remains.

## Level contents

| Id | Role |
| --- | --- |
| `floor` | Parametric Brush floor (preserved) |
| `wall_convert` | Convertible Brush with face material/UV |
| `convex_demo` | ConvexBrush with stable face IDs + materials |
| `wedge` | Angled ConvexBrush (edge/vertex coverage) |
| `extrude_src` | Extrusion source |
| `clip_src` | Clip / split source |
| `plain_auto` | Brush for auto-convert + split (Q11) |
| `cell_room` / `cell_brush` | Nested Cell hierarchy |
| `rotated_box` | Yaw-transformed ConvexBrush |
| `param_ramp` / `param_column` | Parametric construction preserved |
| `cutter_near` | Subtractive cutter overlapping `convex_demo` |
| `spawn` | PlayerSpawn for Play/Stop |

## Pipeline checks

| Check | Expected |
| --- | --- |
| Convert + undo | Brush ↔ ConvexBrush byte-identical restore |
| Face / Edge / Vertex moves | Grid snap; materials/UVs survive; one undo per drag |
| Invalid edits | Rejected; authored geometry unchanged |
| Extrude | New `"… Extrusion"` sibling; source unchanged |
| Clip split + auto-convert | Single undo; half B created |
| Cutter ∩ ConvexBrush | Reported; convert under overlap refused |
| Prefab create | ConvexBrush in definition |
| Duplicate | New IDs; geometry valid |
| Nested Cell | `parentId` preserved through edits |
| Play / Stop | Authored ConvexBrush + face maps restored |
| Schema | Level emits 3; v1–v3 load; mansion stays non-convex |
| Gothic mansion | Loads unmodified; golden serialize round-trip |

## Performance (recorded by harness)

| Measurement | Budget | Result |
| --- | --- | --- |
| Drag preview (single actor) | ≤ 16 ms | **0.3 ms median** (max 0.8 ms) |
| Edit-mode FPS (acceptance level) | interactive | **180.4 avg FPS** / 5.54 ms frame |
| `moveVertices` + validate (unit soft) | ≤ 5 ms median | covered in `phase2f5Integration.test.js` (soft warn >5 ms) |
| Bundle size delta | report; target < 40 KB gzip | no new deps; production chunk still ~6.2 MB / ~2.15 MB gzip (unchanged debt) |

## Confirmed defects

None found during 2F.5 verification. Prior 2E.5 stale-surface redirect remains fixed.

## Remaining limitations / deferred debt

- Phase **2F.6** not started (multi-viewport, orthographic, marquee).
- Full pointer-lock locomotion feel not automatable.
- Full-scene rebuild on sync (audit M6).
- ~6 MB single production chunk (unchanged).
- Convex CSG / revert ConvexBrush→Brush not in 2F (Q7/Q8).

## Run

```js
const s = document.createElement('script');
s.src = '/dev/phase2f5Acceptance.js';
await new Promise((r, j) => { s.onload = r; s.onerror = j; document.head.appendChild(s); });
const report = await window.__phase2f5Acceptance();
console.log(report);
```
