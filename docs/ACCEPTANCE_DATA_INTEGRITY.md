# Phase 2F.7E — Persistence and Data Integrity Hardening

## Baseline

| Item | Value |
| --- | --- |
| Main tip | `fb5dea3` |
| Tests before | **586 / 586** (71 files) |
| Scope | Serialization / load-save, Play/Stop restore, undo/redo, prefab integrity |
| Constraints | No new features; no schema bump; no geometry-algorithm changes; no persistence redesign |

## Findings (confirmed defects)

| Area | Defect | Fix |
| --- | --- | --- |
| Load | Non-string actor ids regenerated via `ensureId` → broken refs | Require non-empty string ids in `validateLevelData` |
| Load | Missing `parentId` silently cleared; dirty baseline hid the loss | Reject missing parents |
| Load | Circular / self-parent hierarchies accepted | Reject on validate + post-load hierarchy check |
| Save | Direct `writeFile` (non-atomic); no semantic validation on PUT | `validateLevelData` + temp file + `rename` |
| Play/Stop | Snapshot included `mapMode` / `ambient` but restore ignored them | `_applyAuthoredSnapshot` restores both |
| Undo | `CompositeCommand.do` left partial mutations on throw | Rollback applied sub-commands |
| Undo | `HistoryStack.undo`/`redo` dropped commands if undo/do threw | Restore stack entry on failure |
| Subtractive | World Solid fit only grew → undo left oversized shell | Exact fit to current cutter union (grow or shrink) |
| Prefab | `duplicateActors` reused `instanceId` (aliased instances) | Fresh `pinst_*` ids + parentId remap among copies |
| Prefab | Auto-captured overrides mutated outside history | History-wrapped via `SetPrefabOverridesCommand` / `CompositeCommand` |
| Prefab | Orphan `parentId` / duplicate template ids kept in defs | `normalizePrefabDefinition` clears orphans, drops dupes |

## Verification

| Check | Result |
| --- | --- |
| `npm test` | **598 / 598** (+12 in `phase2f7eDataIntegrity.test.js`) |
| Lint (`oxlint`) | exit 0 (warnings only; pre-existing React hooks/refs) |
| Production build | Pass |
| Failed load leaves world untouched | Preserved (`deserializeLevel` before `setWorld`; existing `editorLifecycle` coverage) |
| Failed save keeps dirty | Preserved (existing coverage) |
| Malformed level rejected | New validate/deserialize tests |
| Play/Stop mapMode + ambient | Restored via `_applyAuthoredSnapshot`; serialize round-trip covered |
| World Solid undo fit | Exact-fit + history test |
| Prefab duplicate instance ids | Covered |

### Browser acceptance (manual)

| Level | Expectation |
| --- | --- |
| `test-room.json` / additive | Load → edit → save → reload; Play/Stop restores actors |
| `acceptance-subtractive.json` / `subractive.json` | Move subtract out → World Solid grows; Undo → solid recenters/shrinks |
| `acceptance-convex-brushes.json` | Load OK; edits undo; Play/Stop |
| Prefab instance | Duplicate selection → distinct `instanceId`; sync affects one copy |

## Remaining limitations

- Auto-override capture still depends on cached prefab definitions for the sync/composite path; async fallback remains a separate undo step when the definition is not yet cached.
- Unknown component types still load as generic `Component` (fields retained; typed behavior unavailable) — intentional compatibility.
- Prefab asset PUT path does not yet run the same deep validation as level PUT (normalize only).
- Startup load failure still leaves `world === null` (no emergency empty map) — UX only; not a silent corruption path.
- Face-key pruning of stale ConvexBrush overrides on sync (§9) not implemented in this phase.

## Files touched

- `src/serialization/LevelDeserializer.js` — `validateLevelData`, strict hierarchy
- `vite-plugins/levelFileApi.js` — validate + atomic write
- `src/runtime/GameRuntime.js` — `_applyAuthoredSnapshot`
- `src/runtime/worldSolidFit.js` — exact fit
- `src/editor/history/{HistoryStack,commands}.js` — stack / composite integrity
- `src/editor/brushFactory.js` — duplicate prefab/parent remap
- `src/editor/EditorContext.jsx` — history-safe override capture
- `src/prefabs/PrefabDefinition.js` — orphan/dupe cleanup
- `src/tests/phase2f7eDataIntegrity.test.js` — regression suite

Phase **2F.7F** not started.
