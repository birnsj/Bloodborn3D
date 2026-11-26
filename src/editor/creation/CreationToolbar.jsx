import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  IconActors,
  IconBox,
  IconCeiling,
  IconCell,
  IconDragHandle,
  IconFloor,
  IconFolder,
  IconLight,
  IconMesh,
  IconPrefab,
  IconArch,
  IconArchGothic,
  IconColumn,
  IconCurvedWall,
  IconRamp,
  IconSpawn,
  IconStairs,
  IconSubtract,
  IconWall,
} from '../../ui/icons.jsx';
import {
  CREATE_DRAG_MIME,
  buildCreationCategories,
} from './creationTools.js';
import {
  clampCreationToolbarPrefs,
  loadCreationToolbarPrefs,
  saveCreationToolbarPrefs,
  snapToolbarEdge,
} from './creationToolbarPrefs.js';

const CATEGORY_ICONS = {
  geometry: IconBox,
  environment: IconLight,
  lights: IconLight,
  actors: IconActors,
  assets: IconFolder,
};

const TOOL_ICONS = {
  box: IconBox,
  wall: IconWall,
  floor: IconFloor,
  ceiling: IconCeiling,
  ramp: IconRamp,
  stairs: IconStairs,
  column: IconColumn,
  curvedWall: IconCurvedWall,
  arch: IconArch,
  archGothic: IconArchGothic,
  subtract: IconSubtract,
  pointLight: IconLight,
  spotLight: IconLight,
  dirLight: IconLight,
  water: IconFloor,
  mirror: IconWall,
  decal: IconMesh,
  billboard: IconActors,
  sky: IconLight,
  spawn: IconSpawn,
  cell: IconCell,
  mesh: IconMesh,
  prefab: IconPrefab,
};

function ToolIcon({ tool }) {
  const Icon = TOOL_ICONS[tool.icon] || IconBox;
  return <Icon />;
}

/**
 * Floating tool strip: category rail + click-to-open icon rollout (stays open).
 */
export function CreationToolbar({
  viewportRef,
  onActivateTool,
  onToolDragStart,
  onToolDragEnd,
  disabled = false,
}) {
  const { tool, mode } = useEditor();
  const { registry } = useAssetBrowser();
  const [prefs, setPrefs] = useState(() => loadCreationToolbarPrefs());
  const [flyoutOffset, setFlyoutOffset] = useState(0);
  const dragBarRef = useRef(null);
  const rootRef = useRef(null);
  const catRefs = useRef(new Map());

  const assetsList = useMemo(
    () => (Array.isArray(registry?.assets) ? registry.assets : []),
    [registry],
  );

  const cats = useMemo(
    () => buildCreationCategories(assetsList),
    [assetsList],
  );

  const openId = prefs.expanded ? prefs.categoryId : null;
  const activeCategory = (openId && cats.find((c) => c.id === openId))
    || cats.find((c) => c.id === prefs.categoryId)
    || cats[0];
  const expanded = Boolean(openId && activeCategory && cats.some((c) => c.id === openId));

  const persist = useCallback((next) => {
    const clamped = clampCreationToolbarPrefs(next, measureViewport(viewportRef));
    setPrefs(clamped);
    saveCreationToolbarPrefs(clamped);
  }, [viewportRef]);

  const toggleCategory = useCallback((id) => {
    if (disabled || !id) return;
    if (prefs.expanded && prefs.categoryId === id) {
      persist({ ...prefs, expanded: false, pinned: false });
      return;
    }
    persist({
      ...prefs,
      categoryId: id,
      expanded: true,
      pinned: false,
    });
  }, [disabled, persist, prefs]);

  useEffect(() => {
    const el = viewportRef?.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setPrefs((p) => clampCreationToolbarPrefs(p, {
        width: el.clientWidth,
        height: el.clientHeight,
      }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportRef]);

  // Align rollout with the active category button.
  useEffect(() => {
    if (!expanded || !activeCategory) {
      setFlyoutOffset(0);
      return;
    }
    const btn = catRefs.current.get(activeCategory.id);
    const root = rootRef.current;
    if (!btn || !root) return;
    const rootRect = root.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setFlyoutOffset(Math.max(0, btnRect.top - rootRect.top - 4));
  }, [expanded, activeCategory, prefs.top, prefs.edge, cats.length, openId]);

  const closeRollout = useCallback(() => {
    persist({ ...prefs, expanded: false, pinned: false });
  }, [persist, prefs]);

  useEffect(() => {
    if (!expanded || disabled) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      closeRollout();
    };
    const onPointerDown = (e) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target)) return;
      closeRollout();
    };
    window.addEventListener('keydown', onKeyDown);
    // Capture so viewport/canvas clicks close the rollout before other handlers.
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [expanded, disabled, closeRollout]);

  const activateTool = (toolDef) => {
    if (disabled) return;
    onActivateTool?.(toolDef);
  };

  const onHandlePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const vp = viewportRef?.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const originLeft = prefs.edge === 'right'
      ? rect.width - 56
      : prefs.edge === 'left'
        ? 12
        : prefs.left;
    const originTop = prefs.top;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let left = originLeft + dx;
      let top = originTop + dy;
      const snapped = snapToolbarEdge(left, rect.width);
      persist({
        ...prefs,
        edge: snapped.edge,
        left: snapped.left,
        top,
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const style = positionStyle(prefs);
  const flyoutSide = prefs.edge === 'right' ? 'left' : 'right';

  if (mode === 'play') return null;

  return (
    <div
      ref={rootRef}
      className={`bb-creation-toolbar bb-creation-toolbar--${prefs.edge}${expanded ? ' is-expanded' : ''}${disabled ? ' is-disabled' : ''}`}
      style={style}
      data-bb-tutorial="creation.toolbar"
      {...helpProps('creation.toolbar', disabled ? 'Unavailable during Play mode.' : null)}
    >
      <button
        type="button"
        className="bb-creation-toolbar__handle"
        title="Drag toolbar"
        aria-label="Drag creation toolbar"
        onPointerDown={onHandlePointerDown}
        ref={dragBarRef}
      >
        <IconDragHandle />
      </button>

      <div className="bb-creation-toolbar__rail" role="toolbar" aria-label="Creation categories">
        {cats.map((cat) => {
          const active = openId === cat.id;
          const faceTool = cat.tools.find((t) => t.action === 'mode' && t.tool === tool);
          const CatIcon = CATEGORY_ICONS[cat.icon] || IconBox;
          return (
            <button
              key={cat.id}
              type="button"
              ref={(el) => {
                if (el) catRefs.current.set(cat.id, el);
                else catRefs.current.delete(cat.id);
              }}
              className={`bb-creation-toolbar__cat${active ? ' is-active' : ''}${faceTool ? ' has-tool' : ''}`}
              disabled={disabled}
              title={faceTool ? `${cat.label}: ${faceTool.label}` : cat.label}
              aria-expanded={active}
              aria-haspopup="true"
              onClick={() => toggleCategory(cat.id)}
              {...helpProps(cat.helpId, disabled ? 'Unavailable during Play mode.' : null)}
              data-bb-tutorial={`creation.${cat.id}`}
            >
              {faceTool ? <ToolIcon tool={faceTool} /> : <CatIcon />}
              <span className="bb-creation-toolbar__cat-chevron" aria-hidden />
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div
          className={`bb-creation-toolbar__rollout bb-creation-toolbar__rollout--${flyoutSide}`}
          style={{ top: flyoutOffset }}
          role="menu"
          aria-label={activeCategory.label}
        >
          <div className="bb-creation-toolbar__tools">
            {activeCategory.tools.length === 0 ? (
              <div className="bb-creation-toolbar__empty">Empty</div>
            ) : (
              activeCategory.tools.map((t) => {
                const isActive = t.action === 'mode' && tool === t.tool;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`bb-creation-toolbar__tool${isActive ? ' is-active' : ''}`}
                    disabled={disabled}
                    draggable={!disabled}
                    title={t.label}
                    role="menuitem"
                    onClick={() => activateTool(t)}
                    onDragStart={(e) => {
                      const payload = {
                        toolId: t.id,
                        categoryId: activeCategory.id,
                        action: t.action,
                        tool: t.tool || (t.action === 'mode' ? t.id : undefined),
                        placeKind: t.placeKind,
                        lightType: t.lightType,
                        assetKind: t.assetKind,
                        assetId: t.assetId,
                        placement: t.placement,
                        label: t.label,
                      };
                      const raw = JSON.stringify(payload);
                      e.dataTransfer.setData(CREATE_DRAG_MIME, raw);
                      e.dataTransfer.setData('text/plain', raw);
                      e.dataTransfer.effectAllowed = 'copy';
                      onToolDragStart?.(payload);
                    }}
                    onDragEnd={() => onToolDragEnd?.()}
                    {...helpProps(t.helpId, disabled ? 'Unavailable during Play mode.' : null)}
                    data-bb-tutorial={t.helpId}
                  >
                    <span className="bb-creation-toolbar__tool-icon">
                      <ToolIcon tool={t} />
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function measureViewport(viewportRef) {
  const el = viewportRef?.current;
  if (!el) return {};
  return { width: el.clientWidth, height: el.clientHeight };
}

function positionStyle(prefs) {
  const top = `${prefs.top}px`;
  if (prefs.edge === 'right') {
    return { top, right: '12px', left: 'auto' };
  }
  if (prefs.edge === 'left') {
    return { top, left: '12px', right: 'auto' };
  }
  return { top, left: `${prefs.left}px`, right: 'auto' };
}
