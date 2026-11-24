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

    get size() {
      return entries.size;
    },
  };
}
