import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { IconCollapse, IconExpand } from './icons.jsx';

const CollapseGroupContext = createContext(null);

const STORAGE_PREFIX = 'bloodbound.ui.collapse.';

function storageKeyFor(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStoredOpen(storageKey, defaultOpen) {
  if (!storageKey) return defaultOpen;
  try {
    const raw = localStorage.getItem(storageKeyFor(storageKey));
    if (raw == null) return defaultOpen;
    return raw === '1';
  } catch {
    return defaultOpen;
  }
}

function writeStoredOpen(storageKey, open) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKeyFor(storageKey), open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function writeStoredOpenByPrefixes(prefixes, open) {
  if (!prefixes?.length) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const suffix = key.slice(STORAGE_PREFIX.length);
      if (prefixes.some((prefix) => suffix === prefix || suffix.startsWith(prefix))) {
        keys.push(key);
      }
    }
    const value = open ? '1' : '0';
    for (const key of keys) localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * Groups sibling Collapsibles and exposes Collapse all / Expand all.
 * Nested Collapsibles register with the nearest group.
 *
 * @param {string[]} [storagePrefixes] optional localStorage key prefixes (e.g. `world.`)
 *   so unmounted nested sections also sync when collapsing/expanding all
 */
export function CollapsibleGroup({
  children,
  showControls = true,
  storagePrefixes = null,
}) {
  const membersRef = useRef(new Map());
  const [epoch, setEpoch] = useState(0);

  const register = useCallback((id, api) => {
    membersRef.current.set(id, api);
    return () => {
      membersRef.current.delete(id);
    };
  }, []);

  const setAll = useCallback((open) => {
    writeStoredOpenByPrefixes(storagePrefixes, open);
    for (const api of membersRef.current.values()) {
      api.setOpen(open);
    }
    setEpoch((n) => n + 1);
  }, [storagePrefixes]);

  const collapseAll = useCallback(() => setAll(false), [setAll]);
  const expandAll = useCallback(() => setAll(true), [setAll]);

  return (
    <CollapseGroupContext.Provider value={{ register, epoch }}>
      {showControls ? (
        <div className="bb-collapse-group__actions">
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={collapseAll}
          >
            Collapse all
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            onClick={expandAll}
          >
            Expand all
          </button>
        </div>
      ) : null}
      {children}
    </CollapseGroupContext.Provider>
  );
}

export function Collapsible({ title, defaultOpen = true, children, storageKey }) {
  const id = useId();
  const group = useContext(CollapseGroupContext);
  const [open, setOpen] = useState(() => readStoredOpen(storageKey, defaultOpen));
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  useEffect(() => {
    if (!group) return undefined;
    return group.register(id, {
      setOpen: (next) => {
        const value = Boolean(next);
        setOpenRef.current(value);
        writeStoredOpen(storageKey, value);
      },
    });
  }, [group, id, storageKey]);

  // Re-read storage after group Collapse/Expand all (covers remounted nested sections).
  useEffect(() => {
    if (!group || group.epoch === 0) return;
    setOpen(readStoredOpen(storageKey, defaultOpen));
  }, [group, group?.epoch, storageKey, defaultOpen]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      writeStoredOpen(storageKey, next);
      return next;
    });
  };

  return (
    <div className="bb-collapse">
      <button type="button" className="bb-collapse__head" onClick={toggle}>
        <span className="bb-collapse__chevron">
          {open ? <IconCollapse /> : <IconExpand />}
        </span>
        <span>{title}</span>
      </button>
      {open ? <div className="bb-collapse__body">{children}</div> : null}
    </div>
  );
}
