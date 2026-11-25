# Acceptance — AI / Asset Pipeline Hardening

**Baseline:** `08e15fd` audit findings.  
**Scope:** Corrective pass only (OpenArt spend safety, asset/concept persistence, job recovery, API validation, level transform validation). No Meshy/ComfyUI, no rendering/physics changes.

## Confirmed findings → corrections

| Finding | Status | Correction |
| --- | --- | --- |
| Concurrent approve on same estimate | Confirmed | Synchronous `reservation='reserved'` before `_submit`; second call → `SPEND_RESERVED` |
| Spend only after await (race) | Confirmed | Reservation precedes paid call |
| Ambiguous submit vs confirmed failure | Confirmed | Provider/timeout/`NO_GENERATION_ID` → `reservation='ambiguous'` + block resubmit; preflight codes release reservation |
| Estimated params vs CLI submit | Confirmed | CLI 0.1.x generate accepts prompt/model/image/async only; aspect/resolution/formValues listed in `UNSUPPORTED_GENERATE_CLI_PARAMS` and returned on estimate/generate |
| Asset registry non-atomic write | Confirmed | `atomicWriteJson` (temp + rename) |
| Registry RMW races | Confirmed | `createAsyncMutex` / `mutateRegistry` |
| Concept library RMW races | Confirmed (write was already atomic) | Middleware serializes all `/api/concept-library` requests through one mutex |
| Failed import orphans | Confirmed | Texture/mesh import rolls back files if registry mutation fails; magic-byte reject before register |
| Job recovery after restart | Confirmed missing | Persist jobs under `.openart-staging/jobs/`; `recoverJobsFromDisk` / `recoverExistingGeneration` (no paid generate) |
| Upload size / magic / path / localhost | Confirmed weak | `fsSafety` limits + magic detection; OpenArt API rejects non-localhost Host |
| Transform `Number(null/''/true)` | Confirmed | `coerceFiniteNumber` rejects those; keeps non-empty numeric strings for legacy |

## Rejected / deferred

| Item | Reason |
| --- | --- |
| Invent CLI flags for aspect/resolution on generate | Unsupported by OpenArt CLI 0.1.x — explicitly disabled/documented instead |
| Database / new persistence dependency | Out of scope; temp+rename + JSON files only |
| Meshy / ComfyUI | Explicitly excluded from this pass |
| Broad EditorContext / SceneView refactors | Out of scope |

## Manual acceptance

1. `npm test` — includes `pipelineHardening.test.js` + OpenArt suite.
2. `npm run lint` and `npm run build`.
3. Dev server only: `/api/openart` returns 403 if Host is not localhost.
4. Do **not** run paid OpenArt generate as part of this acceptance (mocks cover spend gates).
5. Confirm `.openart-staging/` remains gitignored; no credentials committed.

## Files (primary)

- `src/dev/openart/openArtSession.js`, `openArtCli.js`
- `vite-plugins/fsSafety.js`, `assetFileApi.js`, `conceptLibraryApi.js`, `openArtApi.js`
- `src/serialization/LevelDeserializer.js`
- `src/tests/pipelineHardening.test.js`, `src/tests/phase2h1aOpenArt.test.js`
- `docs/TECHNICAL_STATUS.md`, this file
