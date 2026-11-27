/**
 * Content fingerprint for incremental scene sync.
 * Transform is intentionally excluded — movers use updateActorTransform /
 * carve-dependency refresh instead of a full actor mesh rebuild.
 */

function stable(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value.toJSON === 'function') return stable(value.toJSON());
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stable(value[key]);
  }
  return out;
}

/**
 * Component fingerprint (no transform / parent).
 * Actor.visible is intentionally excluded — Outliner/layer hide toggles
 * group.visible via a lightweight path (no mesh/CSG rebuild).
 */
export function actorContentFingerprint(actor) {
  if (!actor) return '';
  const components = (actor.components || []).map((comp) => {
    if (typeof comp.toJSON === 'function') return stable(comp.toJSON());
    return stable({
      type: comp.type,
      enabled: comp.enabled !== false,
      ...comp,
    });
  });
  return JSON.stringify({
    name: actor.name || '',
    components,
  });
}

/** Transform fingerprint for subtractive carve dependency detection. */
export function actorTransformFingerprint(actor) {
  if (!actor?.transform) return '';
  const t = typeof actor.transform.toJSON === 'function'
    ? actor.transform.toJSON()
    : actor.transform;
  // Content offset shifts the visual/CSG frame relative to the pivot.
  const contentOffset = actor.contentOffset || { x: 0, y: 0, z: 0 };
  return JSON.stringify(stable({ transform: t, contentOffset }));
}

/** Parent id fingerprint for hierarchy re-linking without mesh rebuild. */
export function actorParentFingerprint(actor) {
  return actor?.parentId || '';
}

/**
 * Ids of actors whose WORLD pose differs from the pose their visual was last
 * built/updated with: own transform changed, re-parented, or any ancestor did
 * (Phase 2G D1). A brush's carve depends on its world pose relative to cutters,
 * so these are exactly the actors whose carve may be stale.
 *
 * `entries` is SceneView's actorId → { transformFingerprint, parentFingerprint }.
 * Actors without a visual yet are skipped (they build fresh from current data).
 */
export function collectWorldPoseChangedIds(world, entries) {
  const changed = new Set();
  if (!world?.actors) return changed;
  const memo = new Map();

  const poseChanged = (actor, trail) => {
    if (!actor) return false;
    if (memo.has(actor.id)) return memo.get(actor.id);
    if (trail.has(actor.id)) return false; // cycle guard; hierarchy is validated elsewhere
    trail.add(actor.id);

    const entry = entries.get(actor.id);
    let result = false;
    if (entry) {
      result = entry.transformFingerprint !== actorTransformFingerprint(actor)
        || (entry.parentFingerprint != null
          && entry.parentFingerprint !== actorParentFingerprint(actor));
    }
    if (!result && actor.parentId) {
      result = poseChanged(world.getActor(actor.parentId), trail);
    }
    memo.set(actor.id, result);
    return result;
  };

  for (const actor of world.actors) {
    if (poseChanged(actor, new Set())) changed.add(actor.id);
  }
  return changed;
}

export function isSubtractBrushActor(actor) {
  const brush = actor?.getComponent?.('Brush');
  return Boolean(brush && brush.operation === 'subtract');
}

export function isAdditiveBrushActor(actor) {
  const brush = actor?.getComponent?.('Brush');
  return Boolean(brush && brush.operation !== 'subtract');
}
