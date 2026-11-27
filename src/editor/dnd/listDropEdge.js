/**
 * Shared list drag-and-drop edge detection for Outliner / Layers / Content Browser.
 * Hover near the top or bottom of a row → insert line (before/after).
 * Hover the middle → nest into the row (when allowInto is true).
 */

export const LIST_DROP_BEFORE = 'before';
export const LIST_DROP_AFTER = 'after';
export const LIST_DROP_INTO = 'into';

/**
 * @param {number} clientY
 * @param {Element | null | undefined} element
 * @param {{ allowInto?: boolean, edgeRatio?: number }} [options]
 * @returns {'before' | 'after' | 'into'}
 */
export function getListDropEdge(clientY, element, {
  allowInto = true,
  edgeRatio = 0.28,
} = {}) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return allowInto ? LIST_DROP_INTO : LIST_DROP_AFTER;
  }
  const rect = element.getBoundingClientRect();
  const height = Math.max(rect.height, 1);
  const y = Number(clientY);
  if (!Number.isFinite(y)) {
    return allowInto ? LIST_DROP_INTO : LIST_DROP_AFTER;
  }
  const t = (y - rect.top) / height;
  const ratio = Math.min(0.45, Math.max(0.12, Number(edgeRatio) || 0.28));
  if (t <= ratio) return LIST_DROP_BEFORE;
  if (t >= 1 - ratio) return LIST_DROP_AFTER;
  return allowInto ? LIST_DROP_INTO : (t < 0.5 ? LIST_DROP_BEFORE : LIST_DROP_AFTER);
}

/** CSS modifier class for the active drop edge. */
export function listDropEdgeClass(edge) {
  if (edge === LIST_DROP_BEFORE) return 'is-drop-before';
  if (edge === LIST_DROP_AFTER) return 'is-drop-after';
  if (edge === LIST_DROP_INTO) return 'is-drop-into';
  return '';
}

/**
 * True when the dataTransfer type list includes any of the mime types.
 * @param {DataTransfer | null | undefined} dataTransfer
 * @param {string[]} mimeTypes
 */
export function dataTransferHasType(dataTransfer, mimeTypes) {
  const types = dataTransfer?.types ? [...dataTransfer.types] : [];
  return mimeTypes.some((mime) => types.includes(mime));
}
