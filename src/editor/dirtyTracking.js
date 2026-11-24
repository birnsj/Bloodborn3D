import { serializeLevel } from '../serialization/LevelSerializer.js';

/**
 * Unsaved-change detection.
 *
 * "Dirty" means the authored world no longer matches the last state that was
 * loaded from or successfully written to disk. Comparing content (rather than
 * counting edits) makes Undo/Redo back to the saved state read as clean, and
 * makes Play/Stop (which restores an identical world) leave the flag alone.
 */

/** JSON.stringify with sorted object keys, so key order never causes false dirt. */
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

/** Canonical fingerprint of the persistable level content (null for no world). */
export function levelFingerprint(world) {
  return world ? stableStringify(serializeLevel(world)) : null;
}

/** Holds the fingerprint of the last loaded/saved state. Not React state. */
export class SavedStateTracker {
  constructor() {
    this.savedFingerprint = null;
  }

  /** Record `fingerprint` as the clean baseline (see levelFingerprint). */
  markSaved(fingerprint) {
    this.savedFingerprint = fingerprint ?? null;
  }

  /** True when `world` differs from the baseline. No baseline means nothing to lose. */
  isDirty(world) {
    if (!world || this.savedFingerprint == null) return false;
    return levelFingerprint(world) !== this.savedFingerprint;
  }
}
