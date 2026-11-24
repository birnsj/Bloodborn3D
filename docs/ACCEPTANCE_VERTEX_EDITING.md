# Vertex Editing — Phase 2F.3 acceptance

**Level:** `public/levels/acceptance-vertex-editing.json`  
**Harness:** `public/dev/phase2f3Acceptance.js` → `await window.__phase2f3Acceptance()`

## Contents

| Actor | Role |
| --- | --- |
| `Floor` | Parametric Brush floor |
| `Vertex Demo Box` (`vert_box`) | Axis-aligned ConvexBrush for vertex move / reject |
| `Vertex Demo Box B` (`vert_box_b`) | Second brush for multi-actor vertex moves |
| `Degree-4 Pyramid` (`vert_pyramid`) | Square pyramid (apex degree 4) |

Schema version **3**. Marquee selection is deferred to 2F.6.

## Manual checklist

1. File → `acceptance-vertex-editing.json`.
2. Click **Vertex** on the toolbar (Move only — rotate/scale hidden).
3. Click near vertices — gold sphere handles; Shift/Ctrl multi-select; Alt = x-ray.
4. Drag move gizmo — grid snap; release = one undo step.
5. Drag a vertex onto another / into the solid — rejected; authored geometry unchanged.
6. Move the pyramid apex — remains valid (degree ≥ 4).
7. Multi-select verts on Box + Box B — one drag / one Undo.
8. Esc / Select clears geometry selection.

## Automated harness

```js
const s = document.createElement('script');
s.src = '/dev/phase2f3Acceptance.js';
document.head.appendChild(s);
await new Promise((r) => { s.onload = r; });
const report = await window.__phase2f3Acceptance();
console.log(report);
```

Expected: `report.ok === true`.
