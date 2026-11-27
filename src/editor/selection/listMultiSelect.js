/**
 * Ordered-list multi-select (Explorer / Unreal-style).
 *
 * - plain click: select only the target
 * - Ctrl/Cmd+click: toggle target in/out of selection
 * - Shift+click: select inclusive range from anchor → target
 * - Ctrl/Cmd+Shift+click: add that range to the current selection
 * - Alt+click: remove target from selection
 * - Alt+Shift+click: remove that range from selection
 */

export function listSelectModifiers(event) {
  if (!event) return { shift: false, ctrl: false, alt: false };
  return {
    shift: !!event.shiftKey,
    ctrl: !!(event.ctrlKey || event.metaKey),
    alt: !!event.altKey,
  };
}

function unique(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const key = String(id ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function rangeSlice(orderedIds, fromId, toId) {
  const ordered = (orderedIds || []).map(String);
  const a = ordered.indexOf(String(fromId));
  const b = ordered.indexOf(String(toId));
  if (a < 0 || b < 0) return null;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return ordered.slice(lo, hi + 1);
}

/**
 * @returns {{ selectedIds: string[], anchorId: string | null }}
 */
export function applyListMultiSelect({
  orderedIds,
  selectedIds = [],
  anchorId = null,
  targetId,
  shift = false,
  ctrl = false,
  alt = false,
} = {}) {
  const target = targetId == null ? '' : String(targetId);
  if (!target) {
    return { selectedIds: [], anchorId: null };
  }

  const current = unique(selectedIds);
  const ordered = (orderedIds || []).map(String);

  if (shift) {
    const anchor = anchorId && ordered.includes(String(anchorId))
      ? String(anchorId)
      : (current[0] || target);
    const range = rangeSlice(ordered, anchor, target);
    if (!range) {
      return { selectedIds: [target], anchorId: target };
    }
    if (alt) {
      const drop = new Set(range);
      const next = current.filter((id) => !drop.has(id));
      return { selectedIds: next, anchorId: anchor };
    }
    if (ctrl) {
      return {
        selectedIds: unique([...current, ...range]),
        anchorId: anchor,
      };
    }
    return { selectedIds: range, anchorId: anchor };
  }

  if (alt) {
    const next = current.filter((id) => id !== target);
    return {
      selectedIds: next,
      anchorId: next.includes(String(anchorId)) ? String(anchorId) : (next[next.length - 1] || null),
    };
  }

  if (ctrl) {
    const next = current.includes(target)
      ? current.filter((id) => id !== target)
      : [...current, target];
    return { selectedIds: next, anchorId: target };
  }

  return { selectedIds: [target], anchorId: target };
}

/** Depth-first visible folder paths (skips children of collapsed nodes). */
export function flattenVisibleFolderPaths(nodes, collapsed = new Set()) {
  const out = [];
  const walk = (list) => {
    for (const node of list || []) {
      if (!node?.path) continue;
      out.push(node.path);
      if (collapsed.has(node.path)) continue;
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Every folder path that currently has children (for Collapse All). */
export function collectCollapsibleFolderPaths(nodes, out = []) {
  for (const node of nodes || []) {
    if (!node?.path) continue;
    if (node.children?.length) {
      out.push(node.path);
      collectCollapsibleFolderPaths(node.children, out);
    }
  }
  return out;
}
