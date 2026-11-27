/**
 * Shared selected-component property update / scrub / commit helpers (C3 / F1).
 * Pure orchestration — EditorContext supplies locks, history, and SceneView hooks.
 */

/** Build before/after clones for the keys present in `partial`. */
export function buildPropertyPatch(target, partial) {
  const before = {};
  const after = {};
  for (const key of Object.keys(partial)) {
    before[key] = structuredClone(target[key]);
    after[key] = structuredClone(partial[key]);
  }
  return { before, after };
}

/** True when two property snapshots are JSON-equal. */
export function propertySnapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Live-apply (no history) or execute a Set*Properties command for the last selected actor.
 *
 * @returns {{ ok: boolean, actorId?: string, reason?: string }}
 */
export function updateSelectedComponentProperties({
  world,
  mode,
  selectedIds,
  componentType,
  partial,
  options = {},
  CommandClass,
  isEditorActorLocked,
  setStatus,
  lockedMessage,
  executeCommand,
  autoCapturePrefabOverrides,
  rebuildActorVisual,
  bump,
  validate = null,
}) {
  if (!world || mode === 'play' || !selectedIds?.length) {
    return { ok: false, reason: 'unavailable' };
  }
  const {
    undoable = true,
    label = 'Edit properties',
  } = options;
  const actorId = selectedIds[selectedIds.length - 1];
  const actor = world.getActor(actorId);
  if (isEditorActorLocked?.(actor)) {
    setStatus?.(lockedMessage || 'Cannot edit: actor or authoring layer is locked.');
    return { ok: false, actorId, reason: 'locked' };
  }
  const comp = actor?.getComponent(componentType);
  if (!comp) return { ok: false, actorId, reason: 'missing-component' };

  if (typeof validate === 'function') {
    const check = validate(comp, partial);
    if (check && check.ok === false) {
      if (check.message) console.warn('[BloodBound]', check.message);
      return { ok: false, actorId, reason: 'invalid' };
    }
  }

  const { before, after } = buildPropertyPatch(comp, partial);

  if (!undoable) {
    for (const key of Object.keys(after)) {
      comp[key] = after[key];
    }
    if (actor) rebuildActorVisual?.(actor, world);
    bump?.();
    return { ok: true, actorId };
  }

  executeCommand(
    new CommandClass({ world, actorId, before, after, label }),
    { resync: true },
  );
  autoCapturePrefabOverrides?.([actorId]);
  return { ok: true, actorId };
}

/**
 * After a live scrub, record one undo entry from beforeSnapshot → current fields.
 */
export function commitSelectedComponentGesture({
  world,
  mode,
  selectedIds,
  componentType,
  beforeSnapshot,
  label = 'Edit properties',
  CommandClass,
  recordCommand,
  autoCapturePrefabOverrides,
  validate = null,
}) {
  if (!world || mode === 'play' || !beforeSnapshot || !selectedIds?.length) {
    return { ok: false, reason: 'unavailable' };
  }
  const actorId = selectedIds[selectedIds.length - 1];
  const comp = world.getActor(actorId)?.getComponent(componentType);
  if (!comp) return { ok: false, actorId, reason: 'missing-component' };

  const before = {};
  const after = {};
  for (const key of Object.keys(beforeSnapshot)) {
    before[key] = structuredClone(beforeSnapshot[key]);
    after[key] = structuredClone(comp[key]);
  }
  if (propertySnapshotsEqual(before, after)) {
    return { ok: false, actorId, reason: 'unchanged' };
  }

  if (typeof validate === 'function') {
    const check = validate(comp, after);
    if (check && check.ok === false) return { ok: false, actorId, reason: 'invalid' };
  }

  recordCommand(
    new CommandClass({ world, actorId, before, after, label }),
  );
  autoCapturePrefabOverrides?.([actorId]);
  return { ok: true, actorId };
}

/**
 * World-field live edit or undoable replace (ambient / scene / renderer / PP).
 */
export function updateWorldField({
  world,
  mode,
  field,
  after,
  before,
  options = {},
  CommandClass,
  executeCommand,
  onApply,
  bump,
}) {
  if (!world || mode === 'play') return { ok: false, reason: 'unavailable' };
  const {
    undoable = true,
    label = 'Edit world',
  } = options;

  if (undoable) {
    executeCommand(
      new CommandClass({
        world,
        before,
        after,
        label,
        onApply,
      }),
    );
    bump?.();
    return { ok: true };
  }

  world[field] = after;
  onApply?.(after);
  bump?.();
  return { ok: true };
}

/**
 * Record one undo step after a live world-field scrub.
 */
export function commitWorldFieldGesture({
  world,
  mode,
  before,
  after,
  label = 'Edit world',
  CommandClass,
  recordCommand,
  onApply,
  normalize = (v) => v,
}) {
  if (!world || mode === 'play' || before == null) return { ok: false, reason: 'unavailable' };
  const beforeN = normalize(before);
  const afterN = normalize(after);
  if (propertySnapshotsEqual(beforeN, afterN)) {
    return { ok: false, reason: 'unchanged' };
  }
  recordCommand(
    new CommandClass({
      world,
      before: beforeN,
      after: afterN,
      label,
      onApply,
    }),
  );
  return { ok: true };
}
