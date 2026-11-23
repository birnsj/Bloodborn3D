import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEditor } from '../../editor/EditorContext.jsx';
import { useLayout } from '../../editor/layout/LayoutContext.jsx';
import { viewScaleFactor } from '../../editor/layout/viewScale.js';
import { getHelpEntry } from './helpContent.js';
import {
  clampHoverHelpPrefs,
  loadHoverHelpPrefs,
  saveHoverHelpPrefs,
} from './hoverHelpPrefs.js';
import { positionHoverHelp } from './position.js';

const HoverHelpContext = createContext(null);

function findHelpTarget(node) {
  if (!node || typeof node.closest !== 'function') return null;
  return node.closest('[data-bb-help]');
}

export function HoverHelpProvider({ children }) {
  const { mode } = useEditor();
  const { layout } = useLayout();
  const [prefs, setPrefs] = useState(() => loadHoverHelpPrefs());
  const [active, setActive] = useState(null);
  const layerRef = useRef(null);
  const timerRef = useRef(0);
  const activeTargetRef = useRef(null);
  const scale = viewScaleFactor(layout.uiScale);

  const patchPrefs = useCallback((partial) => {
    setPrefs((prev) => {
      const next = clampHoverHelpPrefs({ ...prev, ...partial });
      saveHoverHelpPrefs(next);
      return next;
    });
  }, []);

  const setShowHoverHelp = useCallback((value) => {
    patchPrefs({ showHoverHelp: Boolean(value) });
  }, [patchPrefs]);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    activeTargetRef.current = null;
    setActive(null);
  }, []);

  const setLayerElement = useCallback((node) => {
    layerRef.current = node;
  }, []);

  const computePlacement = useCallback((target) => {
    const layer = layerRef.current;
    if (!layer || !target) return null;
    const layerRect = layer.getBoundingClientRect();
    const anchorRect = target.getBoundingClientRect();
    const anchor = {
      left: (anchorRect.left - layerRect.left) / scale,
      top: (anchorRect.top - layerRect.top) / scale,
      right: (anchorRect.right - layerRect.left) / scale,
      bottom: (anchorRect.bottom - layerRect.top) / scale,
      width: anchorRect.width / scale,
      height: anchorRect.height / scale,
    };
    const layerWidth = layerRect.width / scale;
    const layerHeight = layerRect.height / scale;
    return positionHoverHelp({
      anchor,
      panelWidth: 300,
      panelHeight: 150,
      layerWidth,
      layerHeight,
    });
  }, [scale]);

  const showForTarget = useCallback((target) => {
    if (!target || mode === 'play' || !prefs.showHoverHelp) return;
    const id = target.getAttribute('data-bb-help');
    const entry = getHelpEntry(id);
    if (!entry) return;
    const style = computePlacement(target);
    if (!style) return;
    activeTargetRef.current = target;
    const dynamicMeta = target.getAttribute('data-bb-help-meta');
    setActive({
      id,
      entry: dynamicMeta ? { ...entry, meta: dynamicMeta } : entry,
      disabledReason: target.getAttribute('data-bb-help-disabled') || null,
      style,
    });
  }, [mode, prefs.showHoverHelp, computePlacement]);

  const scheduleShow = useCallback((target) => {
    window.clearTimeout(timerRef.current);
    if (!target || mode === 'play' || !prefs.showHoverHelp) {
      hide();
      return;
    }
    if (!getHelpEntry(target.getAttribute('data-bb-help'))) return;
    timerRef.current = window.setTimeout(() => {
      showForTarget(target);
    }, prefs.delayMs);
  }, [mode, prefs.showHoverHelp, prefs.delayMs, showForTarget, hide]);

  useEffect(() => {
    if (mode === 'play' || !prefs.showHoverHelp) hide();
  }, [mode, prefs.showHoverHelp, hide]);

  useEffect(() => {
    const onPointerOver = (event) => {
      if (mode === 'play' || !prefs.showHoverHelp) return;
      if (event.buttons & 1) {
        hide();
        return;
      }
      const target = findHelpTarget(event.target);
      if (!target) return;
      if (activeTargetRef.current === target && active) return;
      scheduleShow(target);
    };

    const onPointerOut = (event) => {
      const from = findHelpTarget(event.target);
      const to = findHelpTarget(event.relatedTarget);
      if (from && from !== to) {
        if (event.relatedTarget?.closest?.('.bb-hover-help')) return;
        hide();
      }
    };

    const onPointerDown = () => hide();

    const onFocusIn = (event) => {
      if (mode === 'play' || !prefs.showHoverHelp) return;
      const target = findHelpTarget(event.target);
      if (target) scheduleShow(target);
    };

    const onFocusOut = (event) => {
      const from = findHelpTarget(event.target);
      const to = findHelpTarget(event.relatedTarget);
      if (from && from !== to) hide();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') hide();
    };

    const onScroll = () => hide();

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.clearTimeout(timerRef.current);
    };
  }, [mode, prefs.showHoverHelp, scheduleShow, hide, active]);

  useEffect(() => {
    if (!active || !activeTargetRef.current) return undefined;
    const onResize = () => {
      const style = computePlacement(activeTargetRef.current);
      if (!style) {
        hide();
        return;
      }
      setActive((prev) => (prev ? { ...prev, style } : null));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, computePlacement, hide]);

  const value = useMemo(() => ({
    showHoverHelp: prefs.showHoverHelp,
    delayMs: prefs.delayMs,
    setShowHoverHelp,
    setDelayMs: (delayMs) => patchPrefs({ delayMs }),
    hide,
    active,
    setLayerElement,
  }), [prefs, setShowHoverHelp, patchPrefs, hide, active, setLayerElement]);

  return (
    <HoverHelpContext.Provider value={value}>
      {children}
    </HoverHelpContext.Provider>
  );
}

/** Renders inside the scaled editor chrome so help respects UI scale. */
export function HoverHelpLayer() {
  const { active, setLayerElement } = useHoverHelp();

  return (
    <div className="bb-hover-help-layer" ref={setLayerElement} aria-hidden={!active}>
      {active && (
        <div
          className="bb-hover-help"
          role="tooltip"
          id={`bb-hover-help-${active.id}`}
          style={{
            left: active.style.left,
            top: active.style.top,
            width: active.style.width,
          }}
        >
          <div className="bb-hover-help__title">{active.entry.title}</div>
          <p className="bb-hover-help__body">{active.entry.body}</p>
          {active.entry.tips && (
            <p className="bb-hover-help__tips">{active.entry.tips}</p>
          )}
          {active.entry.meta && (
            <p className="bb-hover-help__meta">{active.entry.meta}</p>
          )}
          {active.entry.shortcut && (
            <p className="bb-hover-help__shortcut">
              Shortcut: <kbd>{active.entry.shortcut}</kbd>
            </p>
          )}
          {active.disabledReason && (
            <p className="bb-hover-help__disabled">{active.disabledReason}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function useHoverHelp() {
  const ctx = useContext(HoverHelpContext);
  if (!ctx) throw new Error('useHoverHelp must be used within HoverHelpProvider');
  return ctx;
}
