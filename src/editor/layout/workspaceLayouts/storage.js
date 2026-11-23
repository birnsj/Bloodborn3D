/**
 * Storage abstraction for named workspace layouts.
 * localStorage now; swap the adapter later for file-based layouts.
 */

export function createLocalStorageAdapter(key) {
  return {
    async read() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async write(data) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      try {
        globalThis.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Sync helpers for the React session path (no async required). */
export function createLocalStorageSyncAdapter(key) {
  return {
    read() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    write(data) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        globalThis.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const WORKSPACE_LAYOUTS_STORAGE_KEY = 'bloodbound.editor.workspaceLayouts.v1';
