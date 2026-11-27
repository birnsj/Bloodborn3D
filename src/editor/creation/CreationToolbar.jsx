import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { AssetThumbnail } from '../assets/AssetThumbnail.jsx';
import { toCatalogAsset } from '../../assets/assetCatalog.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import {
  IconActors,
  IconAmbientLight,
  IconArch,
  IconArchGothic,
  IconBillboard,
  IconBox,
  IconCapsule,
  IconCeiling,
  IconCell,
  IconCircle,
  IconColumn,
  IconCone,
  IconConvex,
  IconCurvedWall,
  IconCylinder,
  IconDecal,
  IconDirLight,
  IconDodecahedron,
  IconDragHandle,
  IconEnvironment,
  IconExtrude,
  IconFloor,
  IconHemiLight,
  IconIcosahedron,
  IconLathe,
  IconLight,
  IconMesh,
  IconMirror,
  IconOctahedron,
  IconParametric,
  IconPlane,
  IconPointLight,
  IconPrefab,
  IconRamp,
  IconRectAreaLight,
  IconRefractor,
  IconRing,
  IconRoundedBox,
  IconShape,
  IconSky,
  IconSpawn,
  IconSphere,
  IconSpotLight,
  IconStairs,
  IconSubtract,
  IconTetrahedron,
  IconTextPrim,
  IconTorus,
  IconTorusKnot,
  IconTube,
  IconWall,
  IconWater,
} from '../../ui/icons.jsx';
import {
  CREATE_DRAG_MIME,
  buildCreationCategories,
} from './creationTools.js';
import {
  applyCreationToolbarDockInsets,
  clampCreationToolbarPrefs,
  clearCreationToolbarDockInsets,
  creationToolbarButtonSize,
  creationToolbarIconSize,
  creationToolbarStripThickness,
  CREATION_TOOLBAR_PREFS_EVENT,
  isFloatingDock,
  isHorizontalDock,
  loadCreationToolbarPrefs,
  saveCreationToolbarPrefs,
  snapToolbarDock,
} from './creationToolbarPrefs.js';
import {
  loadRecentCreationAssets,
  RECENT_CREATION_ASSETS_EVENT,
} from './recentCreationAssets.js';

const CATEGORY_ICONS = {
  geometry: IconBox,
  environment: IconEnvironment,
  light: IconLight,
  lights: IconLight,
  actors: IconActors,
  assets: IconPrefab,
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
  plane: IconPlane,
  circle: IconCircle,
  sphere: IconSphere,
  capsule: IconCapsule,
  cylinder: IconCylinder,
  cone: IconCone,
  ring: IconRing,
  torus: IconTorus,
  torusKnot: IconTorusKnot,
  tetrahedron: IconTetrahedron,
  octahedron: IconOctahedron,
  dodecahedron: IconDodecahedron,
  icosahedron: IconIcosahedron,
  roundedBox: IconRoundedBox,
  shape: IconShape,
  extrude: IconExtrude,
  lathe: IconLathe,
  tube: IconTube,
  convex: IconConvex,
  text: IconTextPrim,
  parametric: IconParametric,
  pointLight: IconPointLight,
  spotLight: IconSpotLight,
  dirLight: IconDirLight,
  hemiLight: IconHemiLight,
  rectAreaLight: IconRectAreaLight,
  ambientLight: IconAmbientLight,
  water: IconWater,
  mirror: IconMirror,
  refractor: IconRefractor,
  decal: IconDecal,
  billboard: IconBillboard,
  sky: IconSky,
  spawn: IconSpawn,
  cell: IconCell,
  mesh: IconMesh,
  prefab: IconPrefab,
  environment: IconEnvironment,
};

function ToolIcon({ tool, thumbSize }) {
  if (tool.action === 'asset' && tool.asset) {
    const catalog = toCatalogAsset(tool.asset);
    const size = Math.max(14, thumbSize || 26);
    return (
      <span className="bb-creation-toolbar__thumb">
        <AssetThumbnail asset={catalog} size={size} />
      </span>
    );
  }
  const Icon = TOOL_ICONS[tool.icon] || TOOL_ICONS[tool.id] || IconBox;
  return <Icon />;
}

function rolloutDirection(dock) {
  if (dock === 'right') return 'left';
  if (dock === 'top') return 'down';
  if (dock === 'bottom') return 'up';
  return 'right';
}

/**
 * Creation toolbox: flush top/left/right/bottom dock, or floating (drag to undock/re-dock).
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
  const [recentAssets, setRecentAssets] = useState(() => loadRecentCreationAssets());
  const [flyoutOffset, setFlyoutOffset] = useState(0);
  const dragBarRef = useRef(null);
  const rootRef = useRef(null);
  const catRefs = useRef(new Map());

  const assetsList = useMemo(
    () => (Array.isArray(registry?.assets) ? registry.assets : []),
    [registry],
  );

  const cats = useMemo(
    () => buildCreationCategories(assetsList, { recent: recentAssets }),
    [assetsList, recentAssets],
  );
  const thumbSize = Math.max(14, creationToolbarButtonSize(prefs) - 6);

  const openId = prefs.expanded ? prefs.categoryId : null;
  const activeCategory = (openId && cats.find((c) => c.id === openId))
    || cats.find((c) => c.id === prefs.categoryId)
    || cats[0];
  const expanded = Boolean(openId && activeCategory && cats.some((c) => c.id === openId));
  const floating = isFloatingDock(prefs.dock);
  const horizontal = !floating && isHorizontalDock(prefs.dock);

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

  useEffect(() => {
    const onPrefs = (e) => {
      const detail = e?.detail && typeof e.detail === 'object' ? e.detail : null;
      setPrefs(clampCreationToolbarPrefs(detail || loadCreationToolbarPrefs(), measureViewport(viewportRef)));
    };
    window.addEventListener(CREATION_TOOLBAR_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(CREATION_TOOLBAR_PREFS_EVENT, onPrefs);
  }, [viewportRef]);

  useEffect(() => {
    const onRecent = (e) => {
      const detail = Array.isArray(e?.detail) ? e.detail : loadRecentCreationAssets();
      setRecentAssets(detail);
    };
    window.addEventListener(RECENT_CREATION_ASSETS_EVENT, onRecent);
    return () => window.removeEventListener(RECENT_CREATION_ASSETS_EVENT, onRecent);
  }, []);

  // Push Cam / View / Fog chrome off the flush-docked strip (floating → no inset).
  useEffect(() => {
    const el = viewportRef?.current;
    applyCreationToolbarDockInsets(el, prefs);
    return () => clearCreationToolbarDockInsets(el);
  }, [viewportRef, prefs.dock, prefs.scale]);

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
    if (horizontal) {
      setFlyoutOffset(Math.max(0, btnRect.left - rootRect.left - 4));
    } else {
      setFlyoutOffset(Math.max(0, btnRect.top - rootRect.top - 4));
    }
  }, [expanded, activeCategory, prefs.offset, prefs.dock, prefs.scale, cats.length, openId, horizontal]);

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
    const root = rootRef.current?.getBoundingClientRect();
    const grabX = root ? e.clientX - root.left : 16;
    const grabY = root ? e.clientY - root.top : 16;

    const onMove = (ev) => {
      const left = ev.clientX - rect.left - grabX;
      const top = ev.clientY - rect.top - grabY;
      // Near an edge → flush dock; otherwise float at the pointer.
      const snapped = snapToolbarDock(
        left + grabX,
        top + grabY,
        rect.width,
        rect.height,
        44,
      );
      if (snapped.dock === 'float') {
        persist({
          ...prefs,
          dock: 'float',
          left,
          top,
          offset: 0,
        });
        return;
      }
      persist({
        ...prefs,
        dock: snapped.dock,
        left: snapped.left ?? prefs.left,
        top: snapped.top ?? prefs.top,
        offset: 0,
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
  const flyoutSide = rolloutDirection(prefs.dock);
  const flyoutPos = horizontal
    ? { left: flyoutOffset }
    : { top: flyoutOffset };

  if (mode === 'play') return null;

  return (
    <div
      ref={rootRef}
      className={`bb-creation-toolbar bb-creation-toolbar--${prefs.dock}${floating ? ' is-floating' : ''}${horizontal ? ' is-horizontal' : ' is-vertical'}${expanded ? ' is-expanded' : ''}${disabled ? ' is-disabled' : ''}`}
      style={style}
      data-bb-tutorial="creation.toolbar"
      {...helpProps('creation.toolbar', disabled ? 'Unavailable during Play mode.' : null)}
    >
      <button
        type="button"
        className="bb-creation-toolbar__handle"
        title="Drag to float or snap to an edge"
        aria-label="Drag creation toolbar"
        onPointerDown={onHandlePointerDown}
        ref={dragBarRef}
        {...helpProps('creation.dragHandle')}
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
          style={flyoutPos}
          role="menu"
          aria-label={activeCategory.label}
        >
          <div className="bb-creation-toolbar__tools">
            {activeCategory.tools.length === 0 ? (
              <div className="bb-creation-toolbar__empty">
                {activeCategory.id === 'assets' ? 'No recent assets' : 'Empty'}
              </div>
            ) : (
              activeCategory.tools.map((t) => {
                const isActive = t.action === 'mode' && tool === t.tool;
                const isAsset = t.action === 'asset';
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`bb-creation-toolbar__tool${isActive ? ' is-active' : ''}${isAsset ? ' is-asset' : ''}`}
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
                    <span className={`bb-creation-toolbar__tool-icon${isAsset ? ' is-thumb' : ''}`}>
                      <ToolIcon tool={t} thumbSize={thumbSize} />
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
  const btn = creationToolbarButtonSize(prefs);
  const icon = creationToolbarIconSize(prefs);
  const thickness = creationToolbarStripThickness(prefs);
  const sizeVars = {
    '--bb-creation-btn': `${btn}px`,
    '--bb-creation-icon': `${icon}px`,
    '--bb-creation-strip': `${thickness}px`,
  };
  const dock = prefs.dock || 'left';
  if (dock === 'float') {
    return {
      ...sizeVars,
      left: `${prefs.left}px`,
      top: `${prefs.top}px`,
      right: null,
      bottom: null,
      width: `${thickness}px`,
      height: 'auto',
    };
  }
  const horizontal = dock === 'top' || dock === 'bottom';
  return {
    ...sizeVars,
    left: null,
    right: null,
    top: null,
    bottom: null,
    ...(horizontal
      ? { height: `${thickness}px` }
      : { width: `${thickness}px` }),
  };
}
