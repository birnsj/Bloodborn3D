import { v4 as uuidv4 } from 'uuid';

/**
 * Persistent IDs for Actors and Components.
 * Prefer preserving existing IDs on load; generate only when missing.
 */
export function createId(prefix = 'id') {
  return `${prefix}_${uuidv4()}`;
}

export function ensureId(existing, prefix = 'id') {
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  return createId(prefix);
}
