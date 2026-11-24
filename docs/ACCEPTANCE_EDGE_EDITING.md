# Edge Editing — Phase 2F.2 acceptance

**Level:** `public/levels/acceptance-edge-editing.json`  
**Harness:** `public/dev/phase2f2Acceptance.js` → `await window.__phase2f2Acceptance()`

## Contents

| Actor | Role |
| --- | --- |
| `Floor` | Parametric Brush floor |
| `Edge Demo Box` (`edge_box`) | Axis-aligned ConvexBrush for edge move / reject |
| `Angled Edge Brick` (`edge_angled`) | ConvexBrush with a pulled edge (silhouette) |
| `Edge Demo Box B` (`edge_box_b`) | Second brush for multi-actor edge moves |

Schema version **3**.

## Manual checklist

1. File → `acceptance-edge-editing.json`.
2. Click **Edge** on the toolbar.
3. Click near edges — gold `Line2` highlight; Shift/Ctrl multi-select; Alt = x-ray pick.
4. Drag move gizmo — grid snap; release = one undo step.
5. Collapse an edge until invalid — release restores start; no history entry.
6. Multi-select edges on Box + Box B — one drag moves both; one Undo restores both.
7. Esc / Select clears geometry selection.

## Automated harness

```js
const s = document.createElement('script');
s.src = '/dev/phase2f2Acceptance.js';
document.head.appendChild(s);
await new Promise((r) => { s.onload = r; });
const report = await window.__phase2f2Acceptance();
console.log(report);
```

Expected: `report.ok === true`.
