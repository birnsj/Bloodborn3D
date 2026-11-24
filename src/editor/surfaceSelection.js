/**
 * Surface-selection validity helpers (stale-selection defect fix).
 *
 * Actor material assignment must not redirect to a surface pick unless the
 * Surface tool is active and the pick still matches a live selected actor.
 */

/**
 * @param {{
 *   tool: string,
 *   selectedSurface: { actorId: string, surfaceId: string } | null | undefined,
 *   selectedActorIds: string[],
 *   world?: { getActor: (id: string) => unknown } | null,
 * }} args
 */
export function shouldApplyMaterialToSurface({
  tool,
  selectedSurface,
  selectedActorIds,
  world = null,
}) {
  if (tool !== 'surface') return false;
  if (!selectedSurface?.actorId || !selectedSurface?.surfaceId) return false;
  if (!Array.isArray(selectedActorIds) || !selectedActorIds.includes(selectedSurface.actorId)) {
    return false;
  }
  if (world && !world.getActor(selectedSurface.actorId)) return false;
  return true;
}

/**
 * Keep or drop a surface pick after actor selection / world membership changes.
 * @returns {{ actorId: string, surfaceId: string } | null}
 */
export function nextSelectedSurfaceAfterActorChange(prev, nextActorIds, world = null) {
  if (!prev?.actorId || !prev?.surfaceId) return null;
  if (!Array.isArray(nextActorIds) || !nextActorIds.includes(prev.actorId)) return null;
  if (world && !world.getActor(prev.actorId)) return null;
  return prev;
}

/** True when the active tool should retain a surface pick in Details. */
export function toolKeepsSurfaceSelection(tool) {
  return tool === 'surface' || tool === 'align';
}
