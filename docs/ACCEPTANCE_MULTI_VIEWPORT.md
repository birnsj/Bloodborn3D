# Phase 2F.6 — Multi-Viewport & Orthographic Acceptance

**Status:** Implemented (2026-11-24)  
**Harness:** `public/dev/phase2f6Acceptance.js` → `await window.__phase2f6Acceptance()`  
**Level:** reuses `public/levels/acceptance-convex-brushes.json`  
**Unit suites:** `viewportPrefs.test.js`, `viewportCameras.test.js`, `marqueeSelection.test.js`, `phase2f6MultiViewport.test.js`

## Scope verified

| Capability | Result |
| --- | --- |
| Single / dual-h / dual-v / triple / quad layouts | Pass |
| Default quad = Perspective, Top, Front, Right | Pass |
| Adjustable dividers + maximize/restore | Pass (unit + harness) |
| Perspective + six orthographic directions | Pass |
| Independent camera pose / zoom / display per pane | Pass |
| Orthographic pan/zoom (OrbitControls) | Pass |
| Grid aligned to ortho plane | Pass (SceneView `_applyGridPlane`) |
| Focus selected | Pass |
| Display modes: lit / unlit / textured / wireframe / solid-edges | Pass (apply/restore unit + harness) |
| Shared selection across panes | Pass |
| Marquee (actors + geometry elements) | Pass (unit + editor path) |
| Axis-constrained ortho gizmo | Pass (filter helper) |
| Shared World / SceneView / scissor render (no geo dup) | Pass |
| Play/Stop restores editor camera | Pass |
| Persist layout / cameras / display (`bloodbound.editor.viewport.v1`) | Pass |
| Single vs quad frame-time measurement | Recorded in harness `perf` |

## Browser harness

```js
const s = document.createElement('script');
s.src = '/dev/phase2f6Acceptance.js';
document.head.appendChild(s);
await new Promise((r) => { s.onload = r; });
const report = await window.__phase2f6Acceptance();
console.log(report);
```

## Architecture notes

- One `GameRuntime` / `SceneView` / WebGLRenderer; panes render via scissor + viewport.
- Pane cameras live in `SceneView._paneCameras`; active pane mirrors `sceneView.camera` for Play capture.
- UI prefs: `src/editor/viewport/viewportPrefs.js`.

## Performance

Harness records average frame ms / FPS for **single** vs **quad** on the convex acceptance level. Expect quad to cost roughly more fill/setup work (4 scissor passes) without duplicating scene graphs. Exact numbers are environment-dependent; see harness `report.perf`.

**Browser run (2026-11-24):** `ok: true`. Sample `report.perf` under automated tab (RAF may be throttled):

| Layout | avgFrameMs | avgFps |
| --- | --- | --- |
| single | 665.45 | 1.5 |
| quad | 912 | 1.1 |

Relative cost: quad slower than single as expected (multi scissor passes). Re-run interactively in a focused tab for local FPS budgets.
