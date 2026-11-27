import { useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  countActorsPerLayer,
  getLayerChildren,
  normalizeAuthoringLayersState,
  resolveAuthoringLayerId,
} from '../../core/authoringLayers.js';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import {
  dataTransferHasType,
  getListDropEdge,
  LIST_DROP_BEFORE,
  LIST_DROP_INTO,
  listDropEdgeClass,
} from '../dnd/listDropEdge.js';

const OUTLINER_DRAG = 'application/x-bloodbound-outliner-actor';
const LAYER_DRAG = 'application/x-bloodbound-authoring-layer';

/**
 * Batch 9 — dockable authoring Layers panel.
 * Editor-only visibility/lock/solo; membership is serialized on actors/world.
 */
export function LayersPanel({ docked = false } = {}) {
  const {
    world,
    mode,
    revision,
    layerUi,
    selectedActorIds,
    setActiveAuthoringLayer,
    assignSelectedToAuthoringLayer,
    createAuthoringLayer,
    updateAuthoringLayer,
    reorderAuthoringLayers,
    deleteAuthoringLayerById,
    toggleAuthoringLayerHidden,
    toggleAuthoringLayerLocked,
    setAuthoringLayerSolo,
    selectActorsInAuthoringLayer,
    setStatus,
  } = useEditor();
  const { prompt, confirm, pickColor } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  void revision;

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropTarget, setDropTarget] = useState(null); // { id, edge }

  const state = useMemo(
    () => normalizeAuthoringLayersState(world?.authoringLayers, { seedIfEmpty: Boolean(world) }),
    [world, world?.authoringLayers, revision],
  );

  const counts = useMemo(
    () => countActorsPerLayer(world?.actors || [], state),
    [world?.actors, state, revision],
  );

  const roots = useMemo(() => getLayerChildren(state.layers, null), [state.layers]);

  const queryLower = query.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!queryLower) return null;
    const ids = new Set();
    for (const layer of state.layers) {
      if (layer.name.toLowerCase().includes(queryLower)) {
        ids.add(layer.id);
        let p = layer.parentId;
        while (p) {
          ids.add(p);
          p = state.layers.find((l) => l.id === p)?.parentId;
        }
      }
    }
    return ids;
  }, [state.layers, queryLower]);

  const disabled = !world || mode === 'play';

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openLayerMenu = (event, layer) => {
    if (!layer || disabled) return;
    openFromEvent(event, [
      {
        id: 'activate',
        label: 'Set Active',
        onSelect: () => setActiveAuthoringLayer(layer.id),
      },
      {
        id: 'select',
        label: 'Select Actors in Layer',
        onSelect: () => selectActorsInAuthoringLayer(layer.id),
      },
      {
        id: 'assign',
        label: 'Assign Selection',
        disabled: selectedActorIds.length === 0,
        onSelect: () => assignSelectedToAuthoringLayer(layer.id),
      },
      { id: 'sep1', separator: true },
      {
        id: 'rename',
        label: 'Rename…',
        onSelect: async () => {
          const name = await prompt('Layer name', {
            title: 'Rename Layer',
            initialValue: layer.name,
          });
          if (name != null && String(name).trim()) {
            updateAuthoringLayer(layer.id, { name: String(name).trim() });
          }
        },
      },
      {
        id: 'recolor',
        label: 'Recolor…',
        onSelect: async () => {
          const color = await pickColor('Pick a layer color. Most-used colors are remembered.', {
            title: 'Layer Color',
            initialValue: layer.color || '#888888',
          });
          if (color == null || color === '') return;
          updateAuthoringLayer(layer.id, { color });
        },
      },
      {
        id: 'child',
        label: 'New Child Layer',
        onSelect: async () => {
          const name = await prompt('Layer name', {
            title: 'New Layer',
            initialValue: 'New Layer',
          });
          if (name == null) return;
          createAuthoringLayer({ name: String(name).trim() || 'New Layer', parentId: layer.id });
        },
      },
      {
        id: 'solo',
        label: layerUi.solo?.activeLayerId === layer.id ? 'Clear Solo' : 'Solo',
        onSelect: () => setAuthoringLayerSolo(
          layerUi.solo?.activeLayerId === layer.id ? null : layer.id,
        ),
      },
      { id: 'sep2', separator: true },
      {
        id: 'delete',
        label: 'Delete…',
        onSelect: async () => {
          const ok = await confirm(
            `Delete "${layer.name}"? Actors move to the reassignment target (parent or Architecture). Actors are never deleted.`,
            { title: 'Delete Layer', confirmLabel: 'Delete', tone: 'warning' },
          );
          if (!ok) return;
          deleteAuthoringLayerById(layer.id);
        },
      },
    ]);
  };

  return (
    <aside className={`bb-layers${docked ? ' is-docked' : ''}`}>
      <div className="bb-panel-chrome__body bb-layers__chrome">
        <div className="bb-outliner__search" {...helpProps('panel.layers')}>
          <input
            className="bb-input"
            type="search"
            placeholder="Filter layers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!world}
          />
          <div className="bb-outliner__actions">
            <button
              type="button"
              className="bb-btn"
              disabled={disabled}
              onClick={async () => {
                const name = await prompt('Layer name', {
                  title: 'New Layer',
                  initialValue: 'New Layer',
                });
                if (name == null) return;
                createAuthoringLayer({ name: String(name).trim() || 'New Layer' });
              }}
              {...helpProps('layers.new', disabled ? 'Unavailable during Play mode.' : null)}
            >
              + Layer
            </button>
            <button
              type="button"
              className="bb-btn"
              disabled={disabled || selectedActorIds.length === 0 || !state.activeLayerId}
              onClick={() => assignSelectedToAuthoringLayer(state.activeLayerId)}
              title="Assign selection to active layer"
              {...helpProps(
                'layers.assignSelection',
                disabled
                  ? 'Unavailable during Play mode.'
                  : (selectedActorIds.length === 0 ? 'Select actors first.' : null),
              )}
            >
              Assign
            </button>
          </div>
        </div>
      </div>
      <div className="bb-panel-chrome__body bb-layers__body">
        {!world ? (
          <p className="bb-muted">No level loaded</p>
        ) : (
          <ul className="bb-layers-list">
            {roots.map((layer) => (
              <LayerNode
                key={layer.id}
                layer={layer}
                layers={state.layers}
                depth={0}
                matchIds={matchIds}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                activeLayerId={state.activeLayerId}
                counts={counts}
                layerUi={layerUi}
                disabled={disabled}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                onActivate={setActiveAuthoringLayer}
                onToggleHidden={toggleAuthoringLayerHidden}
                onToggleLocked={toggleAuthoringLayerLocked}
                onSolo={setAuthoringLayerSolo}
                onSelectActors={selectActorsInAuthoringLayer}
                onAssignSelection={assignSelectedToAuthoringLayer}
                onUpdate={updateAuthoringLayer}
                onReorder={reorderAuthoringLayers}
                onContextMenu={openLayerMenu}
                setStatus={setStatus}
                selectedActorIds={selectedActorIds}
              />
            ))}
            {roots.length === 0 && (
              <li className="bb-muted">No layers</li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );
}

function LayerNode({
  layer,
  layers,
  depth,
  matchIds,
  collapsed,
  toggleCollapse,
  activeLayerId,
  counts,
  layerUi,
  disabled,
  dropTarget,
  setDropTarget,
  onActivate,
  onToggleHidden,
  onToggleLocked,
  onSolo,
  onSelectActors,
  onAssignSelection,
  onUpdate,
  onReorder,
  onContextMenu,
  setStatus,
  selectedActorIds,
}) {
  const children = getLayerChildren(layers, layer.id)
    .filter((c) => !matchIds || matchIds.has(c.id));
  if (matchIds && !matchIds.has(layer.id)) return null;

  const hasKids = getLayerChildren(layers, layer.id).length > 0;
  const isCollapsed = collapsed.has(layer.id);
  const isActive = activeLayerId === layer.id;
  const isHidden = layerUi.hidden?.has?.(layer.id);
  const isLocked = layerUi.locked?.has?.(layer.id);
  const isSolo = layerUi.solo?.activeLayerId === layer.id;
  const count = counts[layer.id] || 0;
  const dropEdge = dropTarget?.id === layer.id ? dropTarget.edge : null;

  return (
    <li>
      <div
        className={`bb-layers-row bb-list-drop-line${isActive ? ' is-active' : ''}${isHidden ? ' is-hidden' : ''}${isLocked ? ' is-locked' : ''}${dropEdge ? ` ${listDropEdgeClass(dropEdge)}` : ''}`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, layer);
        }}
        onDragOver={(e) => {
          if (!dataTransferHasType(e.dataTransfer, [OUTLINER_DRAG, LAYER_DRAG])) return;
          e.preventDefault();
          const isActorDrag = dataTransferHasType(e.dataTransfer, [OUTLINER_DRAG]);
          const edge = getListDropEdge(e.clientY, e.currentTarget, {
            // Actor drops always assign into the layer; layer drags use insert lines.
            allowInto: true,
            edgeRatio: isActorDrag ? 0.5 : 0.28,
          });
          setDropTarget({
            id: layer.id,
            edge: isActorDrag ? LIST_DROP_INTO : edge,
          });
        }}
        onDragLeave={() => {
          if (dropTarget?.id === layer.id) setDropTarget(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const edge = dropTarget?.id === layer.id
            ? dropTarget.edge
            : getListDropEdge(e.clientY, e.currentTarget, { allowInto: true });
          setDropTarget(null);
          if (disabled) return;
          const actorId = e.dataTransfer.getData(OUTLINER_DRAG);
          if (actorId) {
            onAssignSelection(layer.id);
            setStatus?.(`Assigned selection to ${layer.name}`);
            return;
          }
          const dragLayerId = e.dataTransfer.getData(LAYER_DRAG);
          if (!dragLayerId || dragLayerId === layer.id) return;

          if (edge === LIST_DROP_INTO) {
            onUpdate(dragLayerId, { parentId: layer.id });
            const siblings = getLayerChildren(layers, layer.id).map((l) => l.id);
            if (!siblings.includes(dragLayerId)) siblings.push(dragLayerId);
            onReorder(siblings, layer.id);
            return;
          }

          const parentId = layer.parentId || null;
          onUpdate(dragLayerId, { parentId });
          const siblings = getLayerChildren(layers, parentId)
            .map((l) => l.id)
            .filter((id) => id !== dragLayerId);
          const idx = siblings.indexOf(layer.id);
          const insertAt = edge === LIST_DROP_BEFORE
            ? Math.max(0, idx)
            : (idx < 0 ? siblings.length : idx + 1);
          siblings.splice(insertAt, 0, dragLayerId);
          onReorder(siblings, parentId);
        }}
      >
        <button
          type="button"
          className="bb-outliner-twist"
          disabled={!hasKids}
          onClick={() => toggleCollapse(layer.id)}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {hasKids ? (isCollapsed ? '▸' : '▾') : '·'}
        </button>
        <span
          className="bb-layers-swatch"
          style={{ background: layer.color }}
          title={layer.color}
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(LAYER_DRAG, layer.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => setDropTarget(null)}
        />
        <button
          type="button"
          className={`bb-layers-item${isActive ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={(e) => {
            if (e.detail === 2) {
              onSelectActors(layer.id);
              return;
            }
            onActivate(layer.id);
          }}
          title="Click: set active · Double-click: select actors"
          {...helpProps('layers.row', disabled ? 'Unavailable during Play mode.' : null)}
        >
          <span className="bb-layers-item__name">{layer.name}</span>
          <span className="bb-layers-item__count">{count}</span>
          {isActive && <span className="bb-layers-item__active">Active</span>}
        </button>
        <button
          type="button"
          className={`bb-outliner-flag${isHidden ? ' is-on' : ''}`}
          title={isHidden ? 'Show layer' : 'Hide layer'}
          disabled={disabled}
          onClick={() => onToggleHidden(layer.id)}
          {...helpProps('layers.visibility', disabled ? 'Unavailable during Play mode.' : null)}
        >
          {isHidden ? '○' : '●'}
        </button>
        <button
          type="button"
          className={`bb-outliner-flag${isLocked ? ' is-on' : ''}`}
          title={isLocked ? 'Unlock layer' : 'Lock layer'}
          disabled={disabled}
          onClick={() => onToggleLocked(layer.id)}
          {...helpProps('layers.lock', disabled ? 'Unavailable during Play mode.' : null)}
        >
          {isLocked ? 'L' : '·'}
        </button>
        <button
          type="button"
          className={`bb-outliner-flag${isSolo ? ' is-on' : ''}`}
          title={isSolo ? 'Clear solo' : 'Solo layer'}
          disabled={disabled}
          onClick={() => onSolo(isSolo ? null : layer.id)}
          {...helpProps('layers.solo', disabled ? 'Unavailable during Play mode.' : null)}
        >
          S
        </button>
        <button
          type="button"
          className="bb-outliner-flag"
          title={selectedActorIds.length ? 'Assign selection' : 'Select actors in layer'}
          disabled={disabled}
          onClick={() => {
            if (selectedActorIds.length) onAssignSelection(layer.id);
            else onSelectActors(layer.id);
          }}
          {...helpProps('layers.rowAssign', disabled ? 'Unavailable during Play mode.' : null)}
        >
          →
        </button>
      </div>
      {!isCollapsed && children.map((child) => (
        <LayerNode
          key={child.id}
          layer={child}
          layers={layers}
          depth={depth + 1}
          matchIds={matchIds}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          activeLayerId={activeLayerId}
          counts={counts}
          layerUi={layerUi}
          disabled={disabled}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onActivate={onActivate}
          onToggleHidden={onToggleHidden}
          onToggleLocked={onToggleLocked}
          onSolo={onSolo}
          onSelectActors={onSelectActors}
          onAssignSelection={onAssignSelection}
          onUpdate={onUpdate}
          onReorder={onReorder}
          onContextMenu={onContextMenu}
          setStatus={setStatus}
          selectedActorIds={selectedActorIds}
        />
      ))}
    </li>
  );
}

/** Resolve layer color for Outliner chips. */
export function layerColorForActor(actor, world) {
  const state = normalizeAuthoringLayersState(world?.authoringLayers, { seedIfEmpty: true });
  const id = resolveAuthoringLayerId(state, actor?.authoringLayerId);
  return state.layers.find((l) => l.id === id)?.color || '#888888';
}

export function layerNameForActor(actor, world) {
  const state = normalizeAuthoringLayersState(world?.authoringLayers, { seedIfEmpty: true });
  const id = resolveAuthoringLayerId(state, actor?.authoringLayerId);
  return state.layers.find((l) => l.id === id)?.name || 'Layer';
}
