# Phase 2F.7A — Subtractive Map Mode Acceptance

## Summary

Subtractive construction is activated only via **File → New Map → Subtractive**. The world is a locked **World Solid** substrate; subtract brushes carve playable space. Rendering shows only faces that border carved empty space (UnrealEd 2/2.5 style). Additive maps and the additive geometry pipeline are unchanged.

## Root cause (pre-fix)

AABB partition carving produced many sibling solid boxes. Only faces on the **parent outer hull** were hidden (`solidFacesOnBrushHull`). Faces between sibling pieces (internal partitions) remained visible, reading as solid blocks / overlapping sheets.

## Fix

- `solidFacesToHide` — hide a face when a sample just outside it is outside the parent brush **or** inside another remaining solid.
- Applied **only** to World Solid meshes (subtractive maps). Additive brush rendering untouched.
- `ensureWorldSolidContainsSubtracts` — auto-grow World Solid around subtract volumes on cutter move/resize.

## Acceptance level

`public/levels/acceptance-subtractive.json` (factory: `src/editor/subtractiveAcceptanceFactory.js`)

Contains: 2×2 maze rooms + doorways, overlapping alcove, raised upper alcove, additive pillar + platform, lights, spawn. World Solid solid-count ≤ 64.

## Verification (2026-11-24 gate)

| Check | Result |
| --- | --- |
| `npm test` | **560 / 560 pass** (0 fail) |
| `colorThemes` / `hoverHelp` | Fixed outdated expectations (`DEFAULT_COLOR_THEME` = midnight; grid help split Move Grid / Enable Snap) |
| Unit: `phase2f7aSubtractive.test.js` | Pass |
| Unit: `worldSolidFit.test.js` | Pass |
| Unit: `brushBoolean.test.js` (partition hide) | Pass |
| Existing additive / mansion / convex suites | Pass (no additive pipeline change) |
| `npm run lint` | exit 0, warnings only (no errors) |
| `npm run build` | Pass |
| Browser: `acceptance-subtractive.json` | Subtractive Lit; World Solid present; **0** exterior hull faces; 40 substrate / 42 empty-adjacent faces; editor helpers visible |
| Browser: Play / Stop (subtractive) | Play hides all `editorOnly` helpers; Stop restores edit |
| Browser: `acceptance-gothic-mansion.json` | Additive; 35 actors; no World Solid |
| Browser: `acceptance-convex-brushes.json` | Additive; 14 actors / 6 ConvexBrush |

## Limits

- Axis-aligned AABB subtract only (existing constraint).
- Hard cap `MAX_SUBTRACT_SOLIDS = 64` per additive brush — dense intersecting layouts can still exceed it; designers should use fewer/larger cutters.
- No full BSP / external CSG dependency.
- Phase **2F.7B** not started.