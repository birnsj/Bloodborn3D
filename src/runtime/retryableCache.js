/**
 * Promise cache for asset loads that never pins a failure.
 *
 * Loaders in this project resolve `null` on failure instead of rejecting, so a
 * plain Map<key, Promise> would keep returning that `null` forever. Entries
 * that settle with a nullish value (or reject) are evicted so the next request
 * starts a fresh load. In-flight requests are still shared.
 */
export function createRetryableCache() {
  const entries = new Map();

  return {
    /** Return the cached promise for `key`, starting `start()` if needed. */
    get(key, start) {
      const existing = entries.get(key);
      if (existing) return existing;

      const promise = Promise.resolve().then(start);
      entries.set(key, promise);

      const evict = () => {
        // A newer load may already have replaced this entry; only drop our own.
        if (entries.get(key) === promise) entries.delete(key);
      };
      promise.then((value) => {
        if (value == null) evict();
      }, evict);

      return promise;
    },

    has(key) {
      return entries.has(key);
    },

    clear() {
      entries.clear();
    },

    /**
     * Delete entries whose keys match `test(key)`. Optionally inspect settled values.
     * @param {(key: string, value: unknown) => boolean | Promise<boolean>} test
     * @returns {Promise<number>} number of deleted entries
     */
    async invalidateWhere(test) {
      const keys = [...entries.keys()];
      let removed = 0;
      for (const key of keys) {
        const promise = entries.get(key);
        if (!promise) continue;
        let value = null;
        try {
          value = await promise;
        } catch {
          value = null;
        }
        // Only delete if still the same in-flight entry.
        if (entries.get(key) !== promise) continue;
        if (await test(key, value)) {
          entries.delete(key);
          removed += 1;
        }
      }
      return removed;
    },

    /** Snapshot of cache keys (diagnostics / acceptance). */
    keys() {
      return [...entries.keys()];
    },

    get size() {
      return entries.size;
    },
  };
}
