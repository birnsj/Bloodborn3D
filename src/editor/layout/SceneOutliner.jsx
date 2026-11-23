import { useMemo, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import {
  IconBrush,
  IconLight,
  IconSearch,
  IconSpawn,
} from '../../ui/icons.jsx';
import { getChildren, getRootActors } from '../../core/hierarchy.js';

const OUTLINER_DRAG = 'application/x-bloodbound-outliner-actor';


function typeIcon(actor) {
  if (actor.prefab?.prefabId) {
    return <span className="bb-outliner-glyph" title="Prefab instance">P</span>;
  }
  const type = actor.components[0]?.type;
  if (type === 'Light') return <IconLight />;
  if (type === 'PlayerSpawn') return <IconSpawn />;
  if (type === 'Cell') return <span className="bb-outliner-glyph">C</span>;
  if (type === 'StaticMesh') return <span className="bb-outliner-glyph">M</span>;
  return <IconBrush />;
}

export function SceneOutliner({ docked = false } = {}) {
  const {
    world,
    selectedActorIds,
    selectActor,
    mode,
    revision,
    reparentSelected,
    createCell,
    setSelectedActorFlags,
  } = useEditor();
  void revision;

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropTargetId, setDropTargetId] = useState(null);

  const filteredIds = useMemo(() => {
    if (!world) return null;
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set();
    for (const a of world.actors) {
      const match =
        a.name.toLowerCase().includes(q)
        || a.id.toLowerCase().includes(q)
        || a.components.some((c) => c.type?.toLowerCase().includes(q));
      if (match) {
        ids.add(a.id);
        let p = a.parentId;
        while (p) {
          ids.add(p);
          p = world.getActor(p)?.parentId;
        }
      }
    }
    return ids;
  }, [world, query, revision]);

  const roots = useMemo(() => {
    if (!world) return [];
    return getRootActors(world).filter((a) => !filteredIds || filteredIds.has(a.id));
  }, [world, filteredIds, revision]);

  const toggleCollapse = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDropOn = (targetId, asChild) => {
    setDropTargetId(null);
    if (mode === 'play') return;
    if (asChild) reparentSelected(targetId);
    else {
      const target = world?.getActor(targetId);
      reparentSelected(target?.parentId || null);
    }
  };

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
          />
        </div>
        <div className="bb-outliner__actions">
          <button
            type="button"
            className="bb-btn"
            disabled={!world || mode === 'play'}
            onClick={() => createCell()}
            title="Create empty cell"
          >
            + Cell
          </button>
          <button
            type="button"
            className="bb-btn"
            disabled={!world || mode === 'play' || selectedActorIds.length === 0}
            onClick={() => reparentSelected(null)}
            title="Unparent selection"
          >
            Unparent
          </button>
        </div>
      </div>
      <div
        className="bb-panel-chrome__body bb-outliner__body"
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes(OUTLINER_DRAG)) {
            e.preventDefault();
            setDropTargetId('__root__');
          }
        }}
        onDragLeave={() => setDropTargetId(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTargetId(null);
          reparentSelected(null);
        }}
      >
        {!world ? (
          <p className="bb-muted">No level loaded</p>
        ) : (
          <>
            <div className={`bb-outliner__root${dropTargetId === '__root__' ? ' is-drop' : ''}`}>
              {world.name}
            </div>
            <ul className="bb-outliner-list">
              {roots.map((actor) => (
                <OutlinerNode
                  key={actor.id}
                  actor={actor}
                  world={world}
                  depth={0}
                  filteredIds={filteredIds}
                  collapsed={collapsed}
                  toggleCollapse={toggleCollapse}
                  selectedActorIds={selectedActorIds}
                  selectActor={selectActor}
                  mode={mode}
                  dropTargetId={dropTargetId}
                  setDropTargetId={setDropTargetId}
                  onDropOn={onDropOn}
                  setSelectedActorFlags={setSelectedActorFlags}
                />
              ))}
              {roots.length === 0 && (
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
  dropTargetId,
  setDropTargetId,
  onDropOn,
  setSelectedActorFlags,
}) {
  const children = getChildren(actor.id, world)
    .filter((c) => !filteredIds || filteredIds.has(c.id));
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(actor.id);
  const selected = selectedActorIds.includes(actor.id);
  const isCell = Boolean(actor.getComponent('Cell'));
  const isDrop = dropTargetId === actor.id;

  return (
    <li>
      <div
        className={`bb-outliner-row${selected ? ' is-selected' : ''}${isDrop ? ' is-drop' : ''}${actor.visible === false ? ' is-hidden' : ''}${actor.locked ? ' is-locked' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        draggable={mode !== 'play'}
        onDragStart={(e) => {
          if (!selected) selectActor(actor.id);
          e.dataTransfer.setData(OUTLINER_DRAG, actor.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes(OUTLINER_DRAG)) return;
          e.preventDefault();
          e.stopPropagation();
          setDropTargetId(actor.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropOn(actor.id, true);
        }}
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
          <span className="bb-outliner-item__icon">{typeIcon(actor)}</span>
          <span className="bb-outliner-item__name">{actor.name}</span>
          <span className="bb-outliner-item__type">
            {isCell ? 'Cell' : (actor.components[0]?.type || 'Actor')}
          </span>
        </button>
        <button
          type="button"
          className="bb-outliner-flag"
          title={actor.visible === false ? 'Show' : 'Hide'}
          disabled={mode === 'play'}
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
              dropTargetId={dropTargetId}
              setDropTargetId={setDropTargetId}
              onDropOn={onDropOn}
              setSelectedActorFlags={setSelectedActorFlags}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
