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
 * Item shape: { id, label, disabled?, danger?, separator?, shortcut?, onSelect? }
 */
export function EditorContextMenuProvider({ children }) {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const closeContextMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const openContextMenu = useCallback(({ clientX = 0, clientY = 0, items = [] } = {}) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) {
      setMenu(null);
      return;
    }
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
  }, [menu, closeContextMenu]);

  const value = useMemo(() => ({
    openContextMenu,
    openFromEvent,
    closeContextMenu,
    isOpen: Boolean(menu),
  }), [openContextMenu, openFromEvent, closeContextMenu, menu]);

  const menuTree = menu ? (
    <div
      ref={menuRef}
      className="bb-ctx-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, index) => {
        if (item.separator) {
          return <div key={item.id || `sep-${index}`} className="bb-ctx-menu__sep" role="separator" />;
        }
        return (
          <button
            key={item.id || `item-${index}`}
            type="button"
            role="menuitem"
            className={`bb-ctx-menu__item${item.danger ? ' is-danger' : ''}`}
            disabled={Boolean(item.disabled)}
            onClick={() => {
              if (item.disabled) return;
              closeContextMenu();
              try {
                item.onSelect?.();
              } catch {
                // Caller handles its own errors.
              }
            }}
          >
            <span className="bb-ctx-menu__label">{item.label}</span>
            {item.shortcut ? (
              <span className="bb-ctx-menu__shortcut">{item.shortcut}</span>
            ) : null}
          </button>
        );
      })}
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
