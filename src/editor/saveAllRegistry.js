/**
 * Lightweight dirty-module registry for Unreal-style Save All.
 * Layout is intentionally excluded — Save All is for content modules only.
 */

/** @typedef {{ id: string, label: string, isDirty: () => boolean, save: () => Promise<void>|void }} SaveAllModule */

/** @type {Map<string, SaveAllModule>} */
const modules = new Map();

/**
 * Register (or replace) a saveable content module.
 * @param {SaveAllModule} mod
 * @returns {() => void} unregister
 */
export function registerSaveAllModule(mod) {
  if (!mod?.id || typeof mod.isDirty !== 'function' || typeof mod.save !== 'function') {
    throw new Error('registerSaveAllModule requires id, isDirty, save');
  }
  modules.set(mod.id, mod);
  return () => {
    if (modules.get(mod.id) === mod) modules.delete(mod.id);
  };
}

export function listDirtySaveAllModules() {
  return [...modules.values()].filter((m) => {
    try {
      return !!m.isDirty();
    } catch {
      return false;
    }
  });
}

/** Test-only: drop all registered modules. */
export function __testClearSaveAllModules() {
  modules.clear();
}

/**
 * Save every currently dirty registered module (plus optional extras from the caller).
 * @param {SaveAllModule[]} [extras] e.g. level module from EditorContext
 * @returns {Promise<{ saved: string[], skipped: string[], errors: { label: string, error: string }[] }>}
 */
export async function runSaveAll(extras = []) {
  const combined = new Map();
  for (const m of extras) {
    if (m?.id) combined.set(m.id, m);
  }
  for (const m of modules.values()) combined.set(m.id, m);

  const saved = [];
  const skipped = [];
  const errors = [];

  for (const m of combined.values()) {
    let dirty = false;
    try {
      dirty = !!m.isDirty();
    } catch (err) {
      errors.push({ label: m.label || m.id, error: String(err?.message || err) });
      continue;
    }
    if (!dirty) {
      skipped.push(m.label || m.id);
      continue;
    }
    try {
      await m.save();
      saved.push(m.label || m.id);
    } catch (err) {
      errors.push({ label: m.label || m.id, error: String(err?.message || err) });
    }
  }

  return { saved, skipped, errors };
}
