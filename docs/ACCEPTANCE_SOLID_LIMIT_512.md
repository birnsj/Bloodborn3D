# Phase 2G — Solid Limit Increase (64 → 512)

**Prior commit:** rendering integration (batching defaults ON).  
**This change:** `MAX_SUBTRACT_SOLIDS = 512` in `src/runtime/brushBoolean.js`.  
`getMaxSubtractSolids()` still honors temporary harness overrides.

## Enforcement (unchanged paths, new number)

| Boundary | Behavior |
| --- | --- |
| Load (`deserializeLevel`) | Rejects with `LevelGeometryValidationError` / `SUBTRACT_COMPLEXITY_EXCEEDED` |
| Save (level file API) | HTTP 422 + structured diagnostics; nothing written |
| Edit (`validateWorldSubtractComplexity`) | Blocks create/move that would exceed |
| Play | Refuses before physics init |
| Diagnostics | Include actor, solidCount, maxSolids (512), offending cutter, remediation text |

## Verification

| Check | Result |
| --- | --- |
| Unit tests | **725 / 725** |
| All 17 shipped `public/levels/*.json` | validate + deserialize OK |
| Under-cap (flush-100, 278 solids) | `validateWorldGeometry` ok; carve not exceeded |
| Over-cap (flush-200, 522 solids) | load rejected: “would need 513 solids … (limit 512)” |
| Shipped `subractive-halls.json` Play | OK, 78 colliders |
| Node scale bench (repeated) | flush-25/50/100 fit under 512; flush-200 (522) and rep-100/200 do not |

## Existing maps

No level JSON changed. Maps that previously passed the 64-cap continue to pass under 512.

## Remaining limitations

- Representative multi-height maps with ≥100 rooms still exceed 512 (rep-100 ≈ 646 solids) — need fewer/larger cutters or future decomposition.
- Edit rebuild cost on large World Solids remains the next practical limiter after rendering batching.
- Rule-based map generation is **not** started.
