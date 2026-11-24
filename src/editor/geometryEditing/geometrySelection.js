/**
 * Geometry-element selection helpers (Phase 2F.1).
 * Mirrors surfaceSelection.js — UI state only; never serialized.
 */

export const GEOMETRY_MODES = ['face', 'edge', 'vertex'];

export function emptyGeometrySelection(mode = 'face') {
  return {
    mode: GEOMETRY_MODES.includes(mode) ? mode : 'face',
    items: [],
    primary: null,
  };
}

export function isGeometryTool(tool) {
  return tool === 'geometry';
}

export function toolKeepsGeometrySelection(tool) {
  return tool === 'geometry';
}

/**
 * Normalize a selection object.
 */
export function normalizeGeometrySelection(sel, mode = 'face') {
  if (!sel || typeof sel !== 'object') return emptyGeometrySelection(mode);
  const m = GEOMETRY_MODES.includes(sel.mode) ? sel.mode : mode;
  const items = Array.isArray(sel.items)
    ? sel.items
      .filter((it) => it?.actorId && Array.isArray(it.ids) && it.ids.length)
      .map((it) => ({
        actorId: String(it.actorId),
        ids: [...new Set(it.ids.map(String))],
      }))
    : [];
  let primary = null;
  if (sel.primary?.actorId && sel.primary?.id) {
    const entry = items.find((it) => it.actorId === sel.primary.actorId);
    if (entry?.ids.includes(sel.primary.id)) {
      primary = { actorId: sel.primary.actorId, id: sel.primary.id };
    }
  }
  if (!primary && items.length) {
    primary = { actorId: items[0].actorId, id: items[0].ids[0] };
  }
  return { mode: m, items, primary };
}

/**
 * Toggle or set a face/edge/vertex on an actor within the selection.
 */
export function toggleGeometryItem(sel, { actorId, id, mode, additive = false }) {
  const base = normalizeGeometrySelection(sel, mode || sel?.mode || 'face');
  const nextMode = mode || base.mode;
  if (nextMode !== base.mode) {
    return normalizeGeometrySelection({
      mode: nextMode,
      items: [{ actorId, ids: [id] }],
      primary: { actorId, id },
    });
  }

  if (!additive) {
    return normalizeGeometrySelection({
      mode: nextMode,
      items: [{ actorId, ids: [id] }],
      primary: { actorId, id },
    });
  }

  const items = base.items.map((it) => ({ actorId: it.actorId, ids: [...it.ids] }));
  let entry = items.find((it) => it.actorId === actorId);
  if (!entry) {
    entry = { actorId, ids: [] };
    items.push(entry);
  }
  const idx = entry.ids.indexOf(id);
  if (idx >= 0) {
    entry.ids.splice(idx, 1);
  } else {
    entry.ids.push(id);
  }
  const pruned = items.filter((it) => it.ids.length > 0);
  return normalizeGeometrySelection({
    mode: nextMode,
    items: pruned,
    primary: pruned.length
      ? { actorId, id: pruned.find((it) => it.actorId === actorId)?.ids.slice(-1)[0] || pruned[0].ids[0] }
      : null,
  });
}

/**
 * Drop items for actors no longer selected / missing from the world.
 * Optionally re-validate face ids against live ConvexBrush geometry.
 */
export function nextGeometrySelectionAfterActorChange(prev, nextActorIds, world = null) {
  const sel = normalizeGeometrySelection(prev);
  if (!sel.items.length) return emptyGeometrySelection(sel.mode);
  const allowed = new Set(Array.isArray(nextActorIds) ? nextActorIds : []);
  const items = [];
  for (const it of sel.items) {
    if (!allowed.has(it.actorId)) continue;
    if (world && !world.getActor(it.actorId)) continue;
    const actor = world?.getActor?.(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    if (world && (!convex?.geometry || !convex.isValid)) continue;
    let ids = it.ids;
    if (convex?.geometry && sel.mode === 'face') {
      const live = new Set((convex.geometry.faces || []).map((f) => f.id));
      ids = ids.filter((id) => live.has(id));
    }
    if (!ids.length) continue;
    items.push({ actorId: it.actorId, ids });
  }
  return normalizeGeometrySelection({ mode: sel.mode, items, primary: sel.primary });
}

/**
 * Re-validate selection after a geometry mutation (lineage remap optional).
 * @param {object|null} lineage faces map newId -> oldId|null
 */
export function remappedGeometrySelection(prev, world, lineageByActor = null) {
  const sel = normalizeGeometrySelection(prev);
  if (!sel.items.length) return emptyGeometrySelection(sel.mode);
  const items = [];
  for (const it of sel.items) {
    const actor = world?.getActor?.(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.geometry) continue;
    const liveFaces = convex.geometry.faces || [];
    const live = new Set(liveFaces.map((f) => f.id));
    const lineage = lineageByActor?.[it.actorId]?.faces || null;

    const nextIds = [];
    for (const id of it.ids) {
      if (live.has(id)) {
        nextIds.push(id);
        continue;
      }
      // Expand through lineage: any new face that came from this old id.
      if (lineage) {
        for (const [newId, oldId] of Object.entries(lineage)) {
          if (oldId === id && live.has(newId) && !nextIds.includes(newId)) {
            nextIds.push(newId);
          }
        }
      }
    }
    if (!nextIds.length) continue;
    items.push({ actorId: it.actorId, ids: nextIds });
  }
  return normalizeGeometrySelection({ mode: sel.mode, items, primary: sel.primary });
}

/** True when a geometry edit may apply to this selection. */
export function shouldApplyGeometryEdit({ tool, geometrySelection, world = null }) {
  if (tool !== 'geometry') return false;
  const sel = normalizeGeometrySelection(geometrySelection);
  if (!sel.items.length || !sel.primary) return false;
  if (!world) return true;
  for (const it of sel.items) {
    const actor = world.getActor(it.actorId);
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.isValid) return false;
    if (sel.mode === 'face') {
      const live = new Set((convex.geometry.faces || []).map((f) => f.id));
      if (it.ids.some((id) => !live.has(id))) return false;
    }
  }
  return true;
}

export function listSelectedFaceIds(sel, actorId) {
  const n = normalizeGeometrySelection(sel);
  const entry = n.items.find((it) => it.actorId === actorId);
  return entry ? [...entry.ids] : [];
}

export function selectionActorIds(sel) {
  return normalizeGeometrySelection(sel).items.map((it) => it.actorId);
}
