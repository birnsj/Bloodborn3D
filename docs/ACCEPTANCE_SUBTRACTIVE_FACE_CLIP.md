# Subtractive World Solid — Exposed Face Clipping

## Root cause (confirmed)

`solidFacesToHide()` decided visibility from a **single sample** just outside each AABB face center, then SceneView hid or showed the **entire** face material.

When a face was only **partially** empty-adjacent (part flush with a sibling solid, part bordering carved space), center sampling either:

- showed the whole quad → textured strips across rooms / between cutters, or
- hid the whole quad → missing wall/floor patches.

Screenshot reference: maze with stone strips spanning carved volumes (editor assets under `.cursor/projects/.../assets/`).

## Fix (World Solid rendering only)

| Piece | Role |
| --- | --- |
| `exposedSolidFaceRects` / rectilinear `subtractFaceRects2` | Per-face 2D clip against outer hull + flush sibling overlaps |
| `createExposedWorldSolidGeometry` | Emit only exposed quads (normals, UVs, face material groups) |
| `SceneView._addBrushVisual` | World Solid uses clipped geometry; **additive** brushes unchanged |
| Collision | Still `getBrushRenderSolids` AABB solids — **unchanged** |

`solidFacesToHide` now derives from exposed rects (empty ⇒ hide) for tests / callers.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **584 / 584** (+3 face-clip tests) |
| Production build | Pass |
| Maze `subractive.json` | 60 collision solids; **0** hull-exposed faces; **23** clipped face sets; wall tops not emitted |
| `acceptance-subtractive.json` | Load OK; clipped patches present |
| Gothic / ConvexBrush | Additive unchanged (no substrate meshes) |

## Limits

- Axis-aligned flush detection only (same AABB subtract model).
- No BSP / external CSG.
- Phase **2F.7E** not started.
