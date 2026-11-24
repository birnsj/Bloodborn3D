# Acceptance — Extrusion and Clipping (Phase 2F.4)

**Level:** `public/levels/acceptance-extrusion-clipping.json`  
**Harness:** `public/dev/phase2f4Acceptance.js` → `await window.__phase2f4Acceptance()`

## Actors

| Id | Role |
| --- | --- |
| `floor` | Floor Brush |
| `ex_box` | ConvexBrush for face extrude (cap material on `pz`) |
| `clip_box` | ConvexBrush for plane clip |
| `plain_box` | Parametric Brush for auto-convert + split |

## Checks

1. Extrude selected face → new `"… Extrusion"` sibling; source unchanged; one undo.
2. `d ≤ 0` rejected with no state change.
3. Clip keep-front via three points; undo restores geometry.
4. Clip split on plain Brush auto-converts in the same undo step; half B named `"… B"`.
5. Esc / cancel clears clip session without mutating brushes.

## Run

```js
const s = document.createElement('script');
s.src = '/dev/phase2f4Acceptance.js';
await new Promise((r, j) => { s.onload = r; s.onerror = j; document.head.appendChild(s); });
const report = await window.__phase2f4Acceptance();
console.log(report);
```
