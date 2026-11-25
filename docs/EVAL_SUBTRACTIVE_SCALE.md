# Phase 2G — Subtractive Geometry Scalability Evaluation

**Status:** Complete (evaluation only — product solid limit unchanged)  
**Baseline:** `5d47375` — **701 / 701** tests still pass  
**Harness:** `scripts/phase2g-subtractive-scale/runNodeBench.mjs`, `public/dev/phase2gSubtractiveScale.js`  
**Raw data:** `scripts/phase2g-subtractive-scale/results/node-bench.json`, `browser-bench-summary.json`

## Question

Is the existing AABB-partition subtractive architecture practically limited by the arbitrary **64-solid** cap, or by deeper carve / render / physics costs? What solid budget is realistic before decomposition or rendering work is required?

## Method

Temporary configs only:

- Caps tested: **64, 128, 256, 512, 1024** via `globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS` / explicit `maxSolids` (default remains **64**).
- Room scales: **25, 50, 100, 200**.
- **Flush** worlds: grid maze rooms + doorway corridors (existing maze factory).
- **Representative** worlds: flush + upper-floor voids + vertical shafts + partial-height windows + cross corridor + additive stairs (evaluation builder in `src/dev/phase2gSubtractiveScaleWorlds.js` — not product map generation).
- Measured: unconstrained solid count, carve time, exposed-face mesh build, cutter-move re-carve, Rapier `buildFromWorld`, serialize/deserialize, browser load / edit sync / Play collider build, draw calls, triangles, GPU geometry count.
- Correctness (Node): sample room centers empty of solids; outer shell corner remains solid. All fitting caps passed.
- **No** BSP, **no** algorithm replacement, **no** permanent limit change, **no** procedural product generator.

Browser frame-time numbers in this run came from a background automation tab (rAF heavily throttled, often 1 sample). Draw calls, triangles, edit/Play ms, and Node timings are the reliable signals. Focused-tab reference from 2F.7G: gothic mansion ≈ **2032 draw calls → ~5.5 ms** single / ~10.9 ms quad.

## Capacity vs room count

| World | Rooms (approx) | Cutters | Unconstrained solids | Fits 64 | 128 | 256 | 512 | 1024 |
| --- | ---: | ---: | ---: | :---: | :---: | :---: | :---: | :---: |
| flush-25 | 25 | 49 | **98** | no | yes | yes | yes | yes |
| flush-50 | 56 | 111 | **172** | no | no | yes | yes | yes |
| flush-100 | 100 | 199 | **278** | no | no | no | yes | yes |
| flush-200 | 210 | 419 | **522** | no | no | no | no | yes |
| rep-25 | 25 | 81 | **277** | no | no | no | yes | yes |
| rep-50 | 56 | 178 | **391** | no | no | no | yes | yes |
| rep-100 | 100 | 318 | **646** | no | no | no | no | yes |
| rep-200 | 210 | ~700+ | **1387** | no | no | no | no | no |

**Finding:** 64 is far below even a modest flush 25-room maze. Multi-height + window punches roughly **2–3×** the solid count of flush at the same room count (fragmentation, not room count alone).

## Node performance (unconstrained carve / mesh / physics)

Median timings; full tables in `node-bench.json`.

| World | Solids | Carve ms | Mesh gen ms | Meshes | Tris | Physics init ms | Colliders | JSON KB | Edit re-carve ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| flush-25 | 98 | 2.8 | 1.1 | 80 | 648 | 0.8 | 98 | 36 | 0.4 |
| flush-50 | 172 | 0.5 | 2.5 | 154 | 1480 | 1.1 | 172 | 77 | 0.9 |
| flush-100 | 278 | 1.0 | 5.9 | 255 | 2744 | 2.0 | 278 | 135 | 2.1 |
| flush-200 | 522 | 3.2 | 16.9 | 497 | 5712 | 4.4 | 522 | 285 | 6.7 |
| rep-25 | 277 | 0.8 | 4.4 | 222 | 1024 | 1.4 | 352 | 58 | 0.9 |
| rep-50 | 391 | 0.9 | 7.8 | 362 | 2066 | 2.5 | 541 | 123 | 1.9 |
| rep-100 | 646 | 2.5 | 17.1 | 609 | 3852 | 4.3 | 901 | 215 | 6.0 |
| rep-200 | 1387 | 9.4 | **64.4** | 1301 | 8700 | 11.9 | 1912 | 450 | 16.9 |

Save/load (serialize + deserialize without validation) stays **&lt; 1 ms / &lt; 0.5 s** even at rep-200; JSON size is not the limiter.

## Browser (live SceneView + Play)

Fitting cases only. Edit = one cutter move + `syncIncremental` (World Solid rebuild).

| World @ min fitting cap | Solids | Load ms | Edit ms | Play ms | Colliders | Draw calls | Tris | Geometries | Material allocs on edit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| flush-25 @128 | 98 | 13 | 11 | 27 | 98 | **899** | 4214 | 137 | 1052 |
| flush-50 @256 | 172 | 15 | 11 | 5 | 172 | **1078** | 7408 | 165 | 1958 |
| flush-100 @512 | 278 | 21 | 17 | 4 | 278 | **1276** | 11350 | 229 | 3194 |
| flush-200 @1024 | 522 | 43 | 42 | 11 | 522 | **1704** | 21234 | 374 | 6128 |
| rep-25 @512 | 277 | 17 | 18 | 6 | 352 | **2184** | 6128 | 292 | 2840 |
| rep-50 @512 | 391 | 25 | 28 | 7 | 541 | **2233** | 8698 | 374 | 4598 |
| rep-100 @1024 | 646 | 43 | 37 | 12 | 901 | **2780** | 12078 | 522 | 7640 |

Visual/collision: Play succeeded on every fitting case (override active); Node shell/room probes passed. Over-cap cases were skipped (would truncate cutters under the permanent validator).

## Bottlenecks (ranked)

1. **Per-solid mesh + material draw path (dominant)**  
   SceneView builds **one mesh (and materials) per carved solid**, with World Solid empty-adjacent face clipping. Draw calls scale roughly with solids (~900 → ~2800 in this set). Editing a cutter rebuilds the World Solid and allocates **thousands of materials** (`materialAllocs` 1k–7.6k). This is the real scalability wall for interactive editing and frame cost — not the boolean carve.

2. **Fragmentation from intersecting / partial-height cutters**  
   Same room count: flush-25 = 98 solids vs representative-25 = 277. Windows and shafts multiply pieces far faster than adding flush rooms.

3. **Exposed-face mesh generation cost**  
   CPU mesh build grows into tens of ms by ~500–600 solids and ~64 ms at 1300 solids. Still secondary to draw/material cost in the live editor, but it sets a floor on full rebuild latency.

4. **Physics collider count**  
   One cuboid per solid (+ stair colliders). Init stays cheap (&lt;12 ms at 1900 colliders). Not the first limiter for these sizes.

5. **AABB carve itself**  
   Remains fast (&lt;10 ms at 1387 solids). Raising the numeric cap does **not** stress the subtraction algorithm in this range.

## Is raising the limit enough?

| Goal | Raise limit alone? | Notes |
| --- | --- | --- |
| Author ~25 flush rooms / small halls | **Yes — need ≥128** | Still under gothic-scale draw calls |
| Author ~25–50 rooms with multi-height + windows | **Partially — need ≥512** | Draw calls already ≈ gothic mansion; edit 18–28 ms |
| Author ~100 flush rooms | **Yes at 512–1024** | ~1300 DC; edit ~17 ms; workable but heavier |
| Author ~100 enriched / ~200 flush rooms | **Borderline at 1024** | 1700–2800 DC; edit 37–42 ms; uncomfortable without render work |
| Author ~200 enriched rooms (1387 solids) | **No** | Exceeds 1024; needs decomposition and/or merge/instancing before a higher cap helps |

**Verdict:** Increasing the solid limit is **necessary** (64 is not a measured capacity ceiling) but **not sufficient** for large multi-height subtractive maps. Beyond roughly mid-hundreds of solids, **decomposition** (multiple additive shells / sectors) and **rendering optimization** (batch/merge carved pieces, cut material churn on rebuild) are required. Replacing the AABB subtractor or introducing BSP is **not** justified by these numbers — carve is not the bottleneck.

## Recommended practical solid budget

| Budget | Role |
| --- | ---: |
| **64 (current)** | Keeps shipped showcase maps safe; **too low** as a measured capacity limit |
| **256** | Reasonable **near-term raise** for flush-style maps up to ~50 rooms; still rejects representative 25-room enriched maps |
| **512** | **Best practical product budget** for the *current* mesh-per-solid renderer: covers enriched ~25–50 rooms and flush ~100; draw calls ~1.2k–2.2k (gothic-comparable); edit still interactive |
| **1024** | Upper evaluation ceiling that still works for carve/physics; only advisable **after** draw-call / material-batching work, or for offline/Play-only content |
| **&gt;1024** | Not recommended without architectural changes (sectorized World Solids and/or merged render meshes) |

**Recommendation to the designer:** keep **64** until you decide; when you raise it, prefer **512** as the next product default *if* you accept gothic-class draw-call cost on large subtractive maps. Pair any raise above 256 with a follow-up task for **mesh/material batching** and/or **multi-shell decomposition** before targeting 100+ enriched rooms.

## What was not changed

- `MAX_SUBTRACT_SOLIDS` remains **64**.
- Shipped levels and workflows untouched.
- No BSP, no new dependencies, no procedural map generation product feature.
- Small eval hook only: `getMaxSubtractSolids()` honors optional `globalThis.__BLOODBOUND_MAX_SUBTRACT_SOLIDS` so benches can raise the cap temporarily; production never sets it.

## How to re-run

```bash
node scripts/phase2g-subtractive-scale/runNodeBench.mjs
# browser (editor open on Vite):
await import('/dev/phase2gSubtractiveScale.js')
await window.__phase2gSubtractiveScale()
```
