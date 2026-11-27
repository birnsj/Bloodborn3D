/**
 * Scene Outliner layout — category section headers (list-order chrome).
 * Categories are not actors and do not change parentId hierarchy.
 * Following root actors in `rootOrder` until the next category belong to that section
 * for collapse/indent only.
 */

import { normalizeIconColor } from './iconColor.js';

const CATEGORY_ID_RE = /^ocat_[a-z0-9]+$/i;

export function createOutlinerCategoryId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ocat_${rand}`;
}

export function isOutlinerCategoryId(id, categories = null) {
  const key = String(id || '');
  if (!key) return false;
  if (categories && typeof categories === 'object') {
    return Object.prototype.hasOwnProperty.call(categories, key);
  }
  return CATEGORY_ID_RE.test(key);
}

export function emptyOutlinerLayout() {
  return { rootOrder: [], categories: {} };
}

/**
 * Keep rootOrder in sync with current root actors; drop stale ids.
 */
export function normalizeOutlinerLayout(raw, world) {
  const categories = {};
  const rawCats = raw?.categories && typeof raw.categories === 'object' && !Array.isArray(raw.categories)
    ? raw.categories
    : {};
  for (const [id, value] of Object.entries(rawCats)) {
    if (!id || typeof id !== 'string') continue;
    const name = String(value?.name || id).trim() || 'Category';
    const entry = { name };
    const iconColor = normalizeIconColor(value?.iconColor);
    if (iconColor) entry.iconColor = iconColor;
    categories[id] = entry;
  }

  const rootActors = world?.actors
    ? world.actors.filter((a) => a && !a.parentId)
    : [];
  const rootIds = new Set(rootActors.map((a) => a.id));
  const seen = new Set();
  const rootOrder = [];

  for (const rawId of Array.isArray(raw?.rootOrder) ? raw.rootOrder : []) {
    const id = String(rawId || '');
    if (!id || seen.has(id)) continue;
    if (categories[id]) {
      seen.add(id);
      rootOrder.push(id);
      continue;
    }
    if (rootIds.has(id)) {
      seen.add(id);
      rootOrder.push(id);
    }
  }

  for (const actor of rootActors) {
    if (seen.has(actor.id)) continue;
    seen.add(actor.id);
    rootOrder.push(actor.id);
  }

  // Drop categories that somehow lost their id from rootOrder (keep them listed once).
  for (const id of Object.keys(categories)) {
    if (!seen.has(id)) {
      rootOrder.push(id);
      seen.add(id);
    }
  }

  return { rootOrder, categories };
}

/**
 * Build display roots for the Outliner:
 * - `{ kind: 'category', id, name, children: Actor[] }` section members are root actors
 * - `{ kind: 'actor', actor }` for roots before any category / uncategorized leading roots
 *
 * Hierarchy under each actor is still parentId-based in the UI.
 */
export function buildOutlinerDisplayRoots(world, layout) {
  const state = normalizeOutlinerLayout(layout, world);
  const nodes = [];
  let currentCategory = null;

  for (const id of state.rootOrder) {
    if (state.categories[id]) {
      currentCategory = {
        kind: 'category',
        id,
        name: state.categories[id].name,
        iconColor: state.categories[id].iconColor || null,
        children: [],
      };
      nodes.push(currentCategory);
      continue;
    }
    const actor = world?.getActor?.(id) || world?.actors?.find((a) => a.id === id);
    if (!actor || actor.parentId) continue;
    if (currentCategory) {
      currentCategory.children.push(actor);
    } else {
      nodes.push({ kind: 'actor', actor });
    }
  }

  return { layout: state, nodes };
}

export function outlinerSectionActorIds(layout, categoryId) {
  const order = layout?.rootOrder || [];
  const categories = layout?.categories || {};
  if (!categories[categoryId]) return [];
  const start = order.indexOf(categoryId);
  if (start < 0) return [];
  const ids = [];
  for (let i = start + 1; i < order.length; i += 1) {
    const id = order[i];
    if (categories[id]) break;
    ids.push(id);
  }
  return ids;
}

/** Insert a new category header at the end of rootOrder (or after `afterId`). */
export function insertOutlinerCategory(layout, { id, name, afterId = null } = {}) {
  const next = {
    rootOrder: [...(layout?.rootOrder || [])],
    categories: { ...(layout?.categories || {}) },
  };
  const catId = id || createOutlinerCategoryId();
  next.categories[catId] = { name: String(name || 'New Category').trim() || 'New Category' };
  next.rootOrder = next.rootOrder.filter((x) => x !== catId);
  if (afterId && next.rootOrder.includes(afterId)) {
    const idx = next.rootOrder.indexOf(afterId);
    next.rootOrder.splice(idx + 1, 0, catId);
  } else {
    next.rootOrder.push(catId);
  }
  return { layout: next, id: catId };
}

export function renameOutlinerCategory(layout, categoryId, name) {
  if (!layout?.categories?.[categoryId]) return layout;
  const prev = layout.categories[categoryId];
  const entry = {
    name: String(name || '').trim() || prev.name,
  };
  if (prev.iconColor) entry.iconColor = prev.iconColor;
  return {
    rootOrder: [...layout.rootOrder],
    categories: {
      ...layout.categories,
      [categoryId]: entry,
    },
  };
}

export function setOutlinerCategoryIconColor(layout, categoryId, iconColor) {
  if (!layout?.categories?.[categoryId]) return layout;
  const prev = layout.categories[categoryId];
  const nextColor = normalizeIconColor(iconColor);
  const entry = { name: prev.name };
  if (nextColor) entry.iconColor = nextColor;
  return {
    rootOrder: [...(layout.rootOrder || [])],
    categories: {
      ...layout.categories,
      [categoryId]: entry,
    },
  };
}

/** Remove category header only — section actors stay in rootOrder. */
export function deleteOutlinerCategory(layout, categoryId) {
  if (!layout?.categories?.[categoryId]) return layout;
  const categories = { ...layout.categories };
  delete categories[categoryId];
  return {
    rootOrder: (layout.rootOrder || []).filter((id) => id !== categoryId),
    categories,
  };
}

/**
 * Place a root actor id into a category section (end of section), or before/after an anchor.
 * Does not change parentId.
 */
export function placeInOutlinerRootOrder(layout, movingIds, { targetId, edge = 'after' } = {}) {
  const moving = (movingIds || []).map(String).filter(Boolean);
  if (!moving.length || !targetId) return layout;
  const movingSet = new Set(moving);
  const without = (layout?.rootOrder || []).filter((id) => !movingSet.has(id));
  const targetIdx = without.indexOf(targetId);
  if (targetIdx < 0) return layout;

  let insertAt;
  if (edge === 'into' && layout.categories?.[targetId]) {
    // End of that category section.
    let end = targetIdx + 1;
    while (end < without.length && !layout.categories?.[without[end]]) end += 1;
    insertAt = end;
  } else if (edge === 'before') {
    insertAt = targetIdx;
  } else {
    insertAt = targetIdx + 1;
  }

  return {
    rootOrder: [...without.slice(0, insertAt), ...moving, ...without.slice(insertAt)],
    categories: { ...(layout?.categories || {}) },
  };
}

/**
 * Apply rootOrder actor sequence onto world.actors (roots only relative order),
 * preserving non-root actors' relative positions among themselves.
 */
export function actorIdsMatchingOutlinerRoots(world, layout) {
  const state = normalizeOutlinerLayout(layout, world);
  const rootSeq = state.rootOrder.filter((id) => !state.categories[id]);
  const rootSet = new Set(rootSeq);
  const beforeIds = world.actors.map((a) => a.id);
  const nonRoots = beforeIds.filter((id) => !rootSet.has(id));
  // Place roots in outliner order; keep other actors in prior relative order after their
  // previous neighbors by appending non-roots in original order.
  // Simpler stable approach: rebuild as roots-in-order, then all non-roots in prior order.
  return [...rootSeq, ...nonRoots.filter((id) => !rootSeq.includes(id))];
}
