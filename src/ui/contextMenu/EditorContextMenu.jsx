import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const EditorContextMenuContext = createContext(null);

/**
 * Shared floating context menu for the editor.
 * Surfaces call openContextMenu({ clientX, clientY, items }).
 *
 * Item shape:
 *   { id, label, disabled?, danger?, separator?, shortcut?, onSelect? }
 *   { id, label, submenu: Item[] } — hover/click flyout
 */
export function EditorContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [openSubmenuId, setOpenSubmenuId] = useState(null);

  const closeContextMenu = useCallback(() => {
    setOpenSubmenuId(null);
    setMenu(null);
  }, []);

  const openContextMenu = useCallback(({ clientX = 0, clientY = 0, items = [] } = {}) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) {
      setMenu(null);
      setOpenSubmenuId(null);
      return;
    }
    setOpenSubmenuId(null);
    setMenu({
      clientX: Number(clientX) || 0,
      clientY: Number(clientY) || 0,
      items: list,
    });
  }, []);

  /** Open from a native contextmenu / pointer event; prevents the browser menu. */
  const openFromEvent = useCallback((event, items) => {
    if (!event) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    openContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      items,
    });
  }, [openContextMenu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 6;
    const left = Math.min(
      Math.max(pad, menu.clientX),
      Math.max(pad, window.innerWidth - rect.width - pad),
    );
    const top = Math.min(
      Math.max(pad, menu.clientY),
      Math.max(pad, window.innerHeight - rect.height - pad),
    );
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (openSubmenuId) {
          setOpenSubmenuId(null);
          return;
        }
        closeContextMenu();
      }
    };
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      closeContextMenu();
    };
    const onBlur = () => closeContextMenu();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', closeContextMenu);
    // Defer dismiss listening so the opening click / ⋯ press cannot immediately close.
    let removePointer = null;
    const raf = window.requestAnimationFrame(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
      removePointer = () => window.removeEventListener('pointerdown', onPointerDown, true);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      removePointer?.();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', closeContextMenu);
    };
  }, [menu, closeContextMenu, openSubmenuId]);

  const value = useMemo(() => ({
    openContextMenu,
    openFromEvent,
    closeContextMenu,
    isOpen: Boolean(menu),
  }), [openContextMenu, openFromEvent, closeContextMenu, menu]);

  const runSelect = useCallback((item) => {
    if (item?.disabled) return;
    closeContextMenu();
    try {
      item.onSelect?.();
    } catch {
      // Caller handles its own errors.
    }
  }, [closeContextMenu]);

  const menuTree = menu ? (
    <div
      ref={menuRef}
      className="bb-ctx-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, index) => (
        <ContextMenuRow
          key={item.id || `item-${index}`}
          item={item}
          index={index}
          openSubmenuId={openSubmenuId}
          setOpenSubmenuId={setOpenSubmenuId}
          onSelect={runSelect}
        />
      ))}
    </div>
  ) : null;

  return (
    <EditorContextMenuContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && menuTree
        ? createPortal(menuTree, document.body)
        : null}
    </EditorContextMenuContext.Provider>
  );
}

function ContextMenuRow({ item, index, openSubmenuId, setOpenSubmenuId, onSelect }) {
  const rowRef = useRef(null);
  const closeTimerRef = useRef(0);
  const [flyoutSide, setFlyoutSide] = useState('right');
  const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
  const open = hasSubmenu && openSubmenuId === (item.id || `sub-${index}`);

  useLayoutEffect(() => {
    if (!open || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const flyoutWidth = 200;
    const spaceRight = window.innerWidth - rect.right;
    setFlyoutSide(spaceRight < flyoutWidth + 8 ? 'left' : 'right');
  }, [open]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  if (item.separator) {
    return <div className="bb-ctx-menu__sep" role="separator" />;
  }

  if (hasSubmenu) {
    const subId = item.id || `sub-${index}`;
    const openNow = () => {
      if (item.disabled) return;
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = 0;
      }
      setOpenSubmenuId(subId);
    };
    const scheduleClose = () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        setOpenSubmenuId((cur) => (cur === subId ? null : cur));
        closeTimerRef.current = 0;
      }, 180);
    };
    return (
      <div
        ref={rowRef}
        className={`bb-ctx-menu__submenu${open ? ' is-open' : ''}`}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          role="menuitem"
          className="bb-ctx-menu__item bb-ctx-menu__item--submenu"
          disabled={Boolean(item.disabled)}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (item.disabled) return;
            setOpenSubmenuId((cur) => (cur === subId ? null : subId));
          }}
        >
          <span className="bb-ctx-menu__label">{item.label}</span>
          <span className="bb-ctx-menu__caret" aria-hidden>▸</span>
        </button>
        {open ? (
          <div
            className={`bb-ctx-menu bb-ctx-menu--flyout bb-ctx-menu--flyout-${flyoutSide}`}
            role="menu"
            onMouseEnter={openNow}
            onContextMenu={(e) => e.preventDefault()}
          >
            {item.submenu.filter(Boolean).map((sub, subIndex) => {
              if (sub.separator) {
                return (
                  <div
                    key={sub.id || `sep-${subIndex}`}
                    className="bb-ctx-menu__sep"
                    role="separator"
                  />
                );
              }
              return (
                <button
                  key={sub.id || `subitem-${subIndex}`}
                  type="button"
                  role="menuitem"
                  className={`bb-ctx-menu__item${sub.danger ? ' is-danger' : ''}`}
                  disabled={Boolean(sub.disabled)}
                  onClick={() => onSelect(sub)}
                >
                  <span className="bb-ctx-menu__label">{sub.label}</span>
                  {sub.shortcut ? (
                    <span className="bb-ctx-menu__shortcut">{sub.shortcut}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={`bb-ctx-menu__item${item.danger ? ' is-danger' : ''}`}
      disabled={Boolean(item.disabled)}
      onMouseEnter={() => setOpenSubmenuId(null)}
      onClick={() => onSelect(item)}
    >
      <span className="bb-ctx-menu__label">{item.label}</span>
      {item.shortcut ? (
        <span className="bb-ctx-menu__shortcut">{item.shortcut}</span>
      ) : null}
    </button>
  );
}

export function useEditorContextMenu() {
  const ctx = useContext(EditorContextMenuContext);
  if (!ctx) {
    throw new Error('useEditorContextMenu must be used within EditorContextMenuProvider');
  }
  return ctx;
}

/** Safe hook for optional use outside provider (tests / isolated mounts). */
export function useOptionalEditorContextMenu() {
  return useContext(EditorContextMenuContext);
}

/**
 * Suppress the browser native image / media context menu on a surface.
 * Prefer calling this from `<img>` / canvas `onContextMenu` (or via openFromEvent).
 * Does not attach globally — leave text inputs alone.
 */
export function suppressNativeImageMenu(event) {
  event?.preventDefault?.();
}
