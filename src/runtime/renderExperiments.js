/**
 * Opt-in rendering experiments. Every flag defaults to OFF so shipped behavior
 * is unchanged; harnesses flip the global before a (full) scene sync.
 *
 * Phase 2G:
 * - `__BLOODBOUND_BATCH_WORLD_SOLID` — render the subtractive World Solid as one
 *   batched mesh per actor (see createBatchedWorldSolidGeometry).
 * - `__BLOODBOUND_SHARE_CUTTER_MATERIALS` — Edit-mode subtract-brush wireframes
 *   share one fill + one line material per viewport color instead of allocating
 *   a pair per cutter (SceneView owns them; actor teardown never disposes them).
 */
export function isWorldSolidBatchingEnabled() {
  return globalThis.__BLOODBOUND_BATCH_WORLD_SOLID === true;
}

export function isCutterMaterialSharingEnabled() {
  return globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS === true;
}
