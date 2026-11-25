/**
 * Rendering feature flags for subtractive World Solid visuals.
 *
 * Phase 2G integration: both features are ON by default. Harnesses and tests
 * may set the globals to `false` to force the legacy path, or to `true` to
 * be explicit. Leaving them unset keeps the product defaults.
 *
 * - `__BLOODBOUND_BATCH_WORLD_SOLID` — one batched mesh per World Solid actor
 *   (see createBatchedWorldSolidGeometry).
 * - `__BLOODBOUND_SHARE_CUTTER_MATERIALS` — Edit-mode subtract-brush wireframes
 *   share one fill + one line material (SceneView owns them; actor teardown
 *   never disposes them).
 */
export function isWorldSolidBatchingEnabled() {
  return globalThis.__BLOODBOUND_BATCH_WORLD_SOLID !== false;
}

export function isCutterMaterialSharingEnabled() {
  return globalThis.__BLOODBOUND_SHARE_CUTTER_MATERIALS !== false;
}
