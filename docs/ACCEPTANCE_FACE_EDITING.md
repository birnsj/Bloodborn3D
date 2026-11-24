# Face Editing — Phase 2F.1 acceptance

**Level:** `public/levels/acceptance-face-editing.json`  
**Harness:** `public/dev/phase2f1Acceptance.js` → `await window.__phase2f1Acceptance()`

## Contents

| Actor | Role |
| --- | --- |
| `Floor` | Parametric Brush floor (unchanged) |
| `Face Demo Box` (`face_box`) | Axis-aligned ConvexBrush for face move / reject tests |
| `Angled Wedge` (`face_wedge`) | ConvexBrush with slanted top (valid angled geometry) |
| `Face Demo Box B` (`face_box_b`) | Second ConvexBrush for multi-actor face moves |

Schema version **3** (contains ConvexBrush).

## Manual checklist

1. File → `acceptance-face-editing.json`.
2. Click **Face** on the toolbar (Edge/Vertex disabled).
3. Click faces on `Face Demo Box` — amber overlay; Shift/Ctrl multi-select.
4. Drag the move gizmo / face-normal handle — grid snap; release commits one undo step.
5. Pull a face through the brush until invalid — preview sticks to last valid; release restores start with no history entry.
6. Edit the wedge’s `pz` face — remains valid.
7. Multi-select faces on Box + Box B — one drag moves both; one Undo restores both.
8. Esc / Select clears geometry selection; Surface mode is independent.

## Automated harness

```js
const s = document.createElement('script');
s.src = '/dev/phase2f1Acceptance.js';
document.head.appendChild(s);
await new Promise((r) => { s.onload = r; });
const report = await window.__phase2f1Acceptance();
console.log(report);
```

Expected: `report.ok === true`.
