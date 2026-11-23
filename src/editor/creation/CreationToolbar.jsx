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
  IconPin,
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
  spawn: IconSpawn,
  cell: IconCell,
  mesh: IconMesh,
  prefab: IconPrefab,
};

function toolIcon(tool) {
  const Icon = TOOL_ICONS[tool.icon] || IconBox;
  return <Icon />;
}

/**
 * Photoshop-style floating creation toolbar over the viewport.
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
  const dragBarRef = useRef(null);
  const rootRef = useRef(null);

  const assetsList = useMemo(
    () => (Array.isArray(registry?.assets) ? registry.assets : []),
    [registry],
  );

  const cats = useMemo(
    () => buildCreationCategories(assetsList),
    [assetsList],
  );

  const activeCategory = cats.find((c) => c.id === prefs.categoryId) || cats[0];
  const expanded = prefs.expanded && activeCategory;

  const persist = useCallback((next) => {
    const clamped = clampCreationToolbarPrefs(next, measureViewport(viewportRef));
    setPrefs(clamped);
    saveCreationToolbarPrefs(clamped);
  }, [viewportRef]);

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

  const selectCategory = (id) => {
    if (disabled) return;
    if (prefs.categoryId === id && prefs.expanded) {
      persist({ ...prefs, expanded: false });
    } else {
      persist({ ...prefs, categoryId: id, expanded: true });
    }
  };

  const activateTool = (toolDef) => {
    if (disabled) return;
    onActivateTool?.(toolDef);
    if (!prefs.pinned) {
      persist({ ...prefs, expanded: false, categoryId: prefs.categoryId });
    }
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

      <div className="bb-creation-toolbar__rail">
        {cats.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon] || IconBox;
          const active = prefs.categoryId === cat.id && prefs.expanded;
          return (
            <button
              key={cat.id}
              type="button"
              className={`bb-creation-toolbar__cat${active ? ' is-active' : ''}`}
              disabled={disabled}
              title={cat.label}
              onClick={() => selectCategory(cat.id)}
              {...helpProps(cat.helpId, disabled ? 'Unavailable during Play mode.' : null)}
              data-bb-tutorial={`creation.${cat.id}`}
            >
              <Icon />
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div
          className={`bb-creation-toolbar__flyout bb-creation-toolbar__flyout--${prefs.edge === 'right' ? 'left' : 'right'}`}
        >
          <div className="bb-creation-toolbar__flyout-head">
            <span>{activeCategory.label}</span>
            <button
              type="button"
              className={`bb-btn bb-btn--icon${prefs.pinned ? ' bb-btn--active' : ''}`}
              title={prefs.pinned ? 'Unpin (auto-collapse)' : 'Pin expanded'}
              onClick={() => persist({ ...prefs, pinned: !prefs.pinned })}
              {...helpProps('creation.pin')}
            >
              <IconPin />
            </button>
          </div>
          <div className="bb-creation-toolbar__tools">
            {activeCategory.tools.length === 0 ? (
              <div className="bb-creation-toolbar__empty">No placeable assets yet</div>
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
                      // text/plain backup — some browsers only expose this on drop.
                      e.dataTransfer.setData('text/plain', raw);
                      e.dataTransfer.effectAllowed = 'copy';
                      onToolDragStart?.(payload);
                    }}
                    onDragEnd={() => onToolDragEnd?.()}
                    {...helpProps(t.helpId, disabled ? 'Unavailable during Play mode.' : null)}
                    data-bb-tutorial={t.helpId}
                  >
                    <span className="bb-creation-toolbar__tool-icon">{toolIcon(t)}</span>
                    <span className="bb-creation-toolbar__tool-label">{t.label}</span>
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
