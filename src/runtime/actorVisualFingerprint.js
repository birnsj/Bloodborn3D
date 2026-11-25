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

/** Component + visibility fingerprint (no transform / parent). */
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
    visible: actor.visible !== false,
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
  return JSON.stringify(stable(t));
}

/** Parent id fingerprint for hierarchy re-linking without mesh rebuild. */
export function actorParentFingerprint(actor) {
  return actor?.parentId || '';
}

export function isSubtractBrushActor(actor) {
  const brush = actor?.getComponent?.('Brush');
  return Boolean(brush && brush.operation === 'subtract');
}

export function isAdditiveBrushActor(actor) {
  const brush = actor?.getComponent?.('Brush');
  return Boolean(brush && brush.operation !== 'subtract');
}
