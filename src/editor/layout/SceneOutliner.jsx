import { useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  IconBrush,
  IconCategory,
  IconLight,
  IconSearch,
  IconSpawn,
} from '../../ui/icons.jsx';
import { getChildren, getRootActors } from '../../core/hierarchy.js';
import {
  normalizeAuthoringLayersState,
  resolveAuthoringLayerId,
} from '../../core/authoringLayers.js';
import {
  buildOutlinerDisplayRoots,
  normalizeOutlinerLayout,
} from '../../core/outlinerLayout.js';
import { normalizeIconColor } from '../../core/iconColor.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import { layerColorForActor } from './LayersPanel.jsx';
import {
  dataTransferHasType,
  getListDropEdge,
  LIST_DROP_AFTER,
  LIST_DROP_BEFORE,
  LIST_DROP_INTO,
  listDropEdgeClass,
} from '../dnd/listDropEdge.js';

const OUTLINER_DRAG = 'application/x-bloodbound-outliner-actor';
const OUTLINER_CATEGORY_DRAG = 'application/x-bloodbound-outliner-category';

function typeIcon(actor) {
  if (actor.prefab?.prefabId) {
    return <span className="bb-outliner-glyph" title="Prefab instance">P</span>;
  }
  const type = actor.components[0]?.type;
  if (type === 'Light') return <IconLight />;
  if (type === 'PlayerSpawn') return <IconSpawn />;
  if (type === 'Cell') return <span className="bb-outliner-glyph">C</span>;
  if (type === 'StaticMesh') return <span className="bb-outliner-glyph">M</span>;
  if (type === 'Ramp') return <span className="bb-outliner-glyph">R</span>;
  if (type === 'Stair') return <span className="bb-outliner-glyph">S</span>;
  return <IconBrush />;
}

function dropEdgeToken(edge) {
  if (edge === LIST_DROP_BEFORE) return 'before';
  if (edge === LIST_DROP_INTO) return 'into';
  return 'after';
}

/** Category + actor ids that currently have children (for Collapse All). */
function collectCollapsibleOutlinerIds(displayRoots, world, out = []) {
  for (const node of displayRoots || []) {
    if (node.kind === 'category') {
      if (node.children?.length) {
        out.push(node.id);
        for (const actor of node.children) {
          collectCollapsibleActorIds(actor.id, world, out);
        }
      }
      continue;
    }
    if (node.kind === 'actor' && node.actor) {
      collectCollapsibleActorIds(node.actor.id, world, out);
    }
  }
  return out;
}

function collectCollapsibleActorIds(actorId, world, out) {
  const kids = getChildren(actorId, world);
  if (!kids.length) return;
  out.push(actorId);
  for (const child of kids) {
    collectCollapsibleActorIds(child.id, world, out);
  }
}

export function SceneOutliner({ docked = false } = {}) {
  const {
    world,
    selectedActorIds,
    selectActor,
    deselectAllActors,
    mode,
    revision,
    reparentSelected,
    reorderSelectedBeside,
    createCell,
    setSelectedActorFlags,
    renameSelected,
    duplicateSelected,
    deleteSelected,
    createPrefabFromSelection,
    unpackSelectedPrefab,
    setStatus,
    createOutlinerCategory,
    renameOutlinerCategoryById,
    deleteOutlinerCategoryById,
    setOutlinerCategoryIconColorById,
    placeOutlinerRoots,
  } = useEditor();
  const { prompt, confirm, pickColor } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  void revision;

  const [query, setQuery] = useState('');
  const [layerFilterId, setLayerFilterId] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropTarget, setDropTarget] = useState(null); // { id, edge }

  const authoringLayers = useMemo(
    () => normalizeAuthoringLayersState(world?.authoringLayers, { seedIfEmpty: Boolean(world) }),
    [world, world?.authoringLayers, revision],
  );

  const filteredIds = useMemo(() => {
    if (!world) return null;
    const q = query.trim().toLowerCase();
    if (!q && !layerFilterId) return null;
    const ids = new Set();
    for (const a of world.actors) {
      const layerOk = !layerFilterId
        || resolveAuthoringLayerId(authoringLayers, a.authoringLayerId) === layerFilterId;
      const match = !q || (
        a.name.toLowerCase().includes(q)
        || a.id.toLowerCase().includes(q)
        || a.components.some((c) => c.type?.toLowerCase().includes(q))
      );
      if (match && layerOk) {
        ids.add(a.id);
        let p = a.parentId;
        while (p) {
          ids.add(p);
          p = world.getActor(p)?.parentId;
        }
      }
    }
    return ids;
  }, [world, query, layerFilterId, authoringLayers, revision]);

  const { nodes: displayRoots } = useMemo(() => {
    if (!world) return { nodes: [], layout: normalizeOutlinerLayout(null, null) };
    return buildOutlinerDisplayRoots(world, world.outliner);
  }, [world, world?.outliner, world?.actors, revision]);

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    if (!world) return;
    setCollapsed(new Set(collectCollapsibleOutlinerIds(displayRoots, world)));
  };

  const onDropOnActor = (targetId, edge = LIST_DROP_INTO) => {
    setDropTarget(null);
    if (mode === 'play') return;
    if (edge === LIST_DROP_INTO) {
      reparentSelected(targetId);
      return;
    }
    reorderSelectedBeside(targetId, edge);
    if (placeOutlinerRoots && selectedActorIds.length) {
      const roots = new Set(getRootActors(world).map((a) => a.id));
      const moving = selectedActorIds.filter((id) => roots.has(id) || !world.getActor(id)?.parentId);
      if (moving.length && roots.has(targetId)) {
        placeOutlinerRoots(moving, { targetId, edge: dropEdgeToken(edge) });
      }
    }
  };

  const onDropOnCategory = (categoryId, edge = LIST_DROP_INTO) => {
    setDropTarget(null);
    if (mode === 'play' || !placeOutlinerRoots || !selectedActorIds.length) return;
    const token = dropEdgeToken(edge);
    placeOutlinerRoots(selectedActorIds, {
      targetId: categoryId,
      edge: token === 'into' ? 'into' : token,
    });
  };

  const addCategory = async () => {
    const name = await prompt('Category name', {
      title: 'Add Outliner Category',
      initialValue: 'New Category',
    });
    if (name == null) return;
    createOutlinerCategory?.(String(name).trim() || 'New Category');
    setStatus?.(`Added category “${String(name).trim() || 'New Category'}”`);
  };

  const openCategoryMenu = (event, category) => {
    if (mode === 'play') return;
    openFromEvent(event, [
      {
        id: 'rename',
        label: 'Rename Category…',
        onSelect: async () => {
          const name = await prompt('Category name', {
            title: 'Rename Category',
            initialValue: category.name,
          });
          if (name == null || name === category.name) return;
          renameOutlinerCategoryById?.(category.id, name);
        },
      },
      {
        id: 'icon-color',
        label: 'Icon Color…',
        onSelect: async () => {
          const current = normalizeIconColor(category.iconColor) || '#8490a4';
          const color = await pickColor('Pick an icon color. Most-used colors are remembered.', {
            title: 'Icon Color',
            initialValue: current,
            allowClear: true,
          });
          if (color == null) return;
          const next = color === '' ? null : normalizeIconColor(color);
          setOutlinerCategoryIconColorById?.(category.id, next);
        },
      },
      {
        id: 'delete',
        label: 'Delete Category',
        danger: true,
        onSelect: async () => {
          const ok = await confirm(
            `Delete category “${category.name}”? Actors in the section stay in the level.`,
            { title: 'Delete Category', confirmLabel: 'Delete', tone: 'warning' },
          );
          if (!ok) return;
          deleteOutlinerCategoryById?.(category.id);
        },
      },
    ]);
  };

  const openActorContextMenu = (event, actor) => {
    if (!actor || mode === 'play') return;
    if (!selectedActorIds.includes(actor.id)) {
      selectActor(actor.id, { additive: false });
    }
    const count = selectedActorIds.includes(actor.id)
      ? Math.max(1, selectedActorIds.length)
      : 1;
    const isPrefabInstance = Boolean(actor.prefab?.instanceId);
    openFromEvent(event, [
      {
        id: 'focus',
        label: 'Focus Selection',
        shortcut: 'F',
        onSelect: () => window.dispatchEvent(new CustomEvent('bb:focus-selection')),
      },
      {
        id: 'rename',
        label: 'Rename',
        disabled: count > 1,
        onSelect: async () => {
          const name = await prompt('Actor name', {
            title: 'Rename',
            initialValue: actor.name || actor.id,
          });
          if (!name || name === actor.name) return;
          renameSelected(name);
          setStatus?.(`Renamed to “${name}”`);
        },
      },
      {
        id: 'icon-color',
        label: 'Icon Color…',
        disabled: count > 1,
        onSelect: async () => {
          const current = normalizeIconColor(actor.iconColor) || '#8490a4';
          const color = await pickColor('Pick an icon color. Most-used colors are remembered.', {
            title: 'Icon Color',
            initialValue: current,
            allowClear: true,
          });
          if (color == null) return;
          const next = color === '' ? null : normalizeIconColor(color);
          setSelectedActorFlags({ iconColor: next });
        },
      },
      {
        id: 'duplicate',
        label: count > 1 ? `Duplicate ${count} Actors` : 'Duplicate',
        onSelect: () => duplicateSelected(),
      },
      {
        id: 'hide',
        label: actor.visible === false ? 'Show' : 'Hide',
        onSelect: () => {
          setSelectedActorFlags({ visible: actor.visible === false });
        },
      },
      {
        id: 'lock',
        label: actor.locked ? 'Unlock' : 'Lock',
        onSelect: () => {
          setSelectedActorFlags({ locked: !actor.locked });
        },
      },
      {
        id: 'unparent',
        label: 'Unparent',
        disabled: count < 1,
        onSelect: () => reparentSelected(null),
      },
      { id: 'sep-create', separator: true },      {
        id: 'create-cell',
        label: 'Create Cell',
        onSelect: () => createCell(),
      },
      {
        id: 'create-prefab',
        label: 'Create Prefab From Selection',
        onSelect: async () => {
          const name = await prompt('Prefab name', {
            title: 'Create Prefab',
            initialValue: 'Prefab',
          });
          if (!name) return;
          await createPrefabFromSelection(name.trim());
        },
      },
      isPrefabInstance ? {
        id: 'unpack-prefab',
        label: 'Unpack Prefab',
        onSelect: () => unpackSelectedPrefab(),
      } : null,
      { id: 'sep-del', separator: true },
      {
        id: 'delete',
        label: count > 1 ? `Delete ${count} Actors` : 'Delete',
        danger: true,
        onSelect: async () => {
          const ok = await confirm(
            count > 1
              ? `Delete ${count} selected actors?`
              : `Delete “${actor.name || actor.id}”?`,
            { title: 'Delete', confirmLabel: 'Delete', tone: 'warning' },
          );
          if (!ok) return;
          deleteSelected();
        },
      },
      { id: 'sep-sel', separator: true },
      {
        id: 'deselect',
        label: 'Deselect All',
        disabled: selectedActorIds.length === 0,
        onSelect: () => deselectAllActors(),
      },
    ]);
  };

  const renderActorNode = (actor, depth) => (
    <OutlinerNode
      key={actor.id}
      actor={actor}
      world={world}
      depth={depth}
      filteredIds={filteredIds}
      collapsed={collapsed}
      toggleCollapse={toggleCollapse}
      selectedActorIds={selectedActorIds}
      selectActor={selectActor}
      mode={mode}
      dropTarget={dropTarget}
      setDropTarget={setDropTarget}
      onDropOn={onDropOnActor}
      setSelectedActorFlags={setSelectedActorFlags}
      onActorContextMenu={openActorContextMenu}
    />
  );

  return (
    <aside className={`bb-panel-chrome bb-outliner${docked ? ' bb-panel-chrome--docked' : ''}`}>
      {!docked && (
        <div className="bb-panel-chrome__head">
          <span className="bb-panel-chrome__title">Scene Outliner</span>
        </div>
      )}
      <div className="bb-outliner__search">
        <div className="bb-search">
          <span className="bb-search__icon"><IconSearch /></span>
          <input
            className="bb-input bb-input--search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            disabled={!world || mode === 'play'}
            {...helpProps(
              'outliner.search',
              mode === 'play' ? 'Unavailable during Play mode.' : null,
            )}
          />
        </div>
        <select
          className="bb-select bb-outliner__layer-filter"
          value={layerFilterId}
          disabled={!world}
          onChange={(e) => setLayerFilterId(e.target.value)}
          title="Filter by authoring layer"
          {...helpProps('outliner.layerFilter')}
        >
          <option value="">All layers</option>
          {authoringLayers.layers.map((layer) => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
        <div className="bb-outliner__actions">
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!world || mode === 'play'}
            onClick={() => { void addCategory(); }}
            title="Add category section header"
            {...helpProps(
              'outliner.category',
              mode === 'play' ? 'Unavailable during Play mode.' : null,
            )}
          >
            Category
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!world}
            onClick={collapseAll}
            title="Collapse all categories and hierarchies"
            {...helpProps('outliner.collapseAll')}
          >
            Collapse All
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!world || mode === 'play'}
            onClick={() => createCell()}
            title="Create empty cell"
            {...helpProps(
              'outliner.newCell',
              mode === 'play' ? 'Unavailable during Play mode.' : null,
            )}
          >
            + Cell
          </button>
          <button
            type="button"
            className="bb-btn bb-btn--ghost"
            disabled={!world || mode === 'play' || selectedActorIds.length === 0}
            onClick={() => reparentSelected(null)}
            title="Unparent selection"
            {...helpProps(
              'outliner.unparent',
              mode === 'play'
                ? 'Unavailable during Play mode.'
                : (selectedActorIds.length === 0 ? 'Select actors to unparent.' : null),
            )}
          >
            Unparent
          </button>
        </div>
      </div>
      <div
        className="bb-panel-chrome__body bb-outliner__body"
        onDragOver={(e) => {
          if (!dataTransferHasType(e.dataTransfer, [OUTLINER_DRAG, OUTLINER_CATEGORY_DRAG])) return;
          e.preventDefault();
          setDropTarget({ id: '__root__', edge: LIST_DROP_INTO });
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(null);
          const catId = e.dataTransfer.getData(OUTLINER_CATEGORY_DRAG);
          if (catId && placeOutlinerRoots) {
            // Drop category at end of list
            const order = normalizeOutlinerLayout(world?.outliner, world).rootOrder;
            const last = order[order.length - 1];
            if (last && last !== catId) {
              placeOutlinerRoots([catId], { targetId: last, edge: 'after' });
            }
            return;
          }
          reparentSelected(null);
        }}
      >
        {!world ? (
          <p className="bb-muted">No level loaded</p>
        ) : (
          <>
            <div className={`bb-outliner__root bb-list-drop-line${dropTarget?.id === '__root__' ? ` ${listDropEdgeClass(LIST_DROP_INTO)}` : ''}`}>
              {world.name}
            </div>
            <ul className="bb-outliner-list">
              {displayRoots.map((node) => {
                if (node.kind === 'category') {
                  const hasKids = node.children.length > 0;
                  const isCollapsed = collapsed.has(node.id);
                  const dropEdge = dropTarget?.id === node.id ? dropTarget.edge : null;
                  const visibleChildren = node.children.filter(
                    (a) => !filteredIds || filteredIds.has(a.id),
                  );
                  if (filteredIds && !visibleChildren.length && query.trim()) {
                    return null;
                  }
                  return (
                    <li key={node.id}>
                      <div
                        className={`bb-outliner-row bb-outliner-row--category bb-list-drop-line${dropEdge ? ` ${listDropEdgeClass(dropEdge)}` : ''}`}
                        onContextMenu={(e) => openCategoryMenu(e, node)}
                        onDragOver={(e) => {
                          if (!dataTransferHasType(e.dataTransfer, [OUTLINER_DRAG, OUTLINER_CATEGORY_DRAG])) {
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          const edge = getListDropEdge(e.clientY, e.currentTarget, { allowInto: true });
                          setDropTarget({ id: node.id, edge });
                        }}
                        onDragLeave={() => {
                          if (dropTarget?.id === node.id) setDropTarget(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const edge = dropTarget?.id === node.id
                            ? dropTarget.edge
                            : getListDropEdge(e.clientY, e.currentTarget, { allowInto: true });
                          setDropTarget(null);
                          const dragCat = e.dataTransfer.getData(OUTLINER_CATEGORY_DRAG);
                          if (dragCat) {
                            placeOutlinerRoots?.([dragCat], {
                              targetId: node.id,
                              edge: dropEdgeToken(edge) === 'into' ? 'after' : dropEdgeToken(edge),
                            });
                            return;
                          }
                          onDropOnCategory(node.id, edge);
                        }}
                      >
                        <button
                          type="button"
                          className="bb-outliner-twist bb-content-category-twist"
                          disabled={!hasKids}
                          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                          onClick={() => {
                            if (hasKids) toggleCollapse(node.id);
                          }}
                        >
                          {hasKids ? (isCollapsed ? '▸' : '▾') : '·'}
                        </button>
                        <button
                          type="button"
                          className={`bb-outliner-category${isCollapsed ? ' is-collapsed' : ''}`}
                          draggable={mode !== 'play'}
                          disabled={mode === 'play'}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(OUTLINER_CATEGORY_DRAG, node.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => {
                            if (hasKids) toggleCollapse(node.id);
                          }}
                          {...helpProps('outliner.category')}
                        >
                          <span
                            className="bb-list-icon"
                            style={node.iconColor ? { color: node.iconColor } : undefined}
                          >
                            <IconCategory />
                          </span>
                          <span className="bb-outliner-category__name">{node.name}</span>
                        </button>
                      </div>
                      {hasKids && !isCollapsed && (
                        <ul className="bb-outliner-list">
                          {visibleChildren.map((actor) => renderActorNode(actor, 1))}
                        </ul>
                      )}
                    </li>
                  );
                }
                if (filteredIds && !filteredIds.has(node.actor.id)) return null;
                return renderActorNode(node.actor, 0);
              })}
              {displayRoots.length === 0 && (
                <li className="bb-muted">No matching actors</li>
              )}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

function OutlinerNode({
  actor,
  world,
  depth,
  filteredIds,
  collapsed,
  toggleCollapse,
  selectedActorIds,
  selectActor,
  mode,
  dropTarget,
  setDropTarget,
  onDropOn,
  setSelectedActorFlags,
  onActorContextMenu,
}) {
  const children = getChildren(actor.id, world)
    .filter((c) => !filteredIds || filteredIds.has(c.id));
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(actor.id);
  const selected = selectedActorIds.includes(actor.id);
  const isCell = Boolean(actor.getComponent('Cell'));
  const dropEdge = dropTarget?.id === actor.id ? dropTarget.edge : null;

  return (
    <li>
      <div
        className={`bb-outliner-row bb-list-drop-line${selected ? ' is-selected' : ''}${dropEdge ? ` ${listDropEdgeClass(dropEdge)}` : ''}${actor.visible === false ? ' is-hidden' : ''}${actor.locked ? ' is-locked' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        draggable={mode !== 'play'}
        {...helpProps('outliner.row')}
        onDragStart={(e) => {
          if (!selected) selectActor(actor.id);
          e.dataTransfer.setData(OUTLINER_DRAG, actor.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!dataTransferHasType(e.dataTransfer, [OUTLINER_DRAG])) return;
          e.preventDefault();
          e.stopPropagation();
          const edge = getListDropEdge(e.clientY, e.currentTarget, { allowInto: true });
          setDropTarget({ id: actor.id, edge });
        }}
        onDragLeave={() => {
          if (dropTarget?.id === actor.id) setDropTarget(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const edge = dropTarget?.id === actor.id
            ? dropTarget.edge
            : getListDropEdge(e.clientY, e.currentTarget, { allowInto: true });
          onDropOn(actor.id, edge);
        }}
        onDragEnd={() => setDropTarget(null)}
        onContextMenu={(e) => onActorContextMenu?.(e, actor)}
      >
        <button
          type="button"
          className="bb-outliner-twist"
          disabled={!hasChildren}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleCollapse(actor.id);
          }}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {hasChildren ? (isCollapsed ? '▸' : '▾') : '·'}
        </button>
        <button
          type="button"
          className={`bb-outliner-item${selected ? ' is-selected' : ''}`}
          disabled={mode === 'play'}
          onClick={(e) => selectActor(actor.id, { additive: e.ctrlKey || e.metaKey })}
        >
          <span
            className="bb-outliner-layer-chip"
            style={{ background: layerColorForActor(actor, world) }}
            title="Authoring layer"
          />
          <span
            className="bb-outliner-item__icon"
            style={actor.iconColor ? { color: actor.iconColor } : undefined}
          >
            {typeIcon(actor)}
          </span>
          <span className="bb-outliner-item__name">{actor.name}</span>
          <span className="bb-outliner-item__type">
            {isCell
              ? 'Cell'
              : (actor.getComponent?.('Brush')?.operation === 'subtract'
                ? 'Subtract'
                : (actor.components[0]?.type || 'Actor'))}
          </span>
        </button>
        <button
          type="button"
          className="bb-outliner-flag"
          title={actor.visible === false ? 'Show' : 'Hide'}
          disabled={mode === 'play'}
          {...helpProps(
            'outliner.visibility',
            mode === 'play' ? 'Unavailable during Play mode.' : null,
          )}
          onClick={(e) => {
            e.stopPropagation();
            selectActor(actor.id);
            setSelectedActorFlags({ visible: actor.visible === false });
          }}
        >
          {actor.visible === false ? '○' : '●'}
        </button>
        <button
          type="button"
          className="bb-outliner-flag"
          title={actor.locked ? 'Unlock' : 'Lock'}
          disabled={mode === 'play'}
          {...helpProps(
            'outliner.lock',
            mode === 'play' ? 'Unavailable during Play mode.' : null,
          )}
          onClick={(e) => {
            e.stopPropagation();
            selectActor(actor.id);
            setSelectedActorFlags({ locked: !actor.locked });
          }}
        >
          {actor.locked ? 'L' : '·'}
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="bb-outliner-list">
          {children.map((child) => (
            <OutlinerNode
              key={child.id}
              actor={child}
              world={world}
              depth={depth + 1}
              filteredIds={filteredIds}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              selectedActorIds={selectedActorIds}
              selectActor={selectActor}
              mode={mode}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDropOn={onDropOn}
              setSelectedActorFlags={setSelectedActorFlags}
              onActorContextMenu={onActorContextMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
