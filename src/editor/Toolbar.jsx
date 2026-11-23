import { useEffect, useRef, useState } from 'react';
import { useEditor } from './EditorContext.jsx';

function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="bb-menu" ref={ref}>
      <button
        type="button"
        className={`bb-menu-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <ul className="bb-menu-list" role="menu">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </ul>
      )}
    </div>
  );
}

function MenuItem({ label, shortcut, disabled, onClick, close }) {
  return (
    <li>
      <button
        type="button"
        className="bb-menu-item"
        role="menuitem"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onClick?.();
          close?.();
        }}
      >
        <span>{label}</span>
        {shortcut ? <span className="bb-menu-shortcut">{shortcut}</span> : null}
      </button>
    </li>
  );
}

export function Toolbar() {
  const {
    mode,
    tool,
    setTool,
    levelName,
    setLevelName,
    levels,
    status,
    gridSize,
    setGridSize,
    gridIncrements,
    loadLevel,
    saveLevel,
    play,
    stop,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteSelected,
    duplicateSelected,
    selectedActorIds,
    world,
  } = useEditor();

  const isPlay = mode === 'play';
  const hasSelection = selectedActorIds.length > 0;

  return (
    <>
      <div className="bb-menubar">
        <Menu label="File">
          {(close) => (
            <>
              <MenuItem
                label="Save"
                shortcut="Ctrl+S"
                disabled={isPlay}
                close={close}
                onClick={() => saveLevel()}
              />
              <MenuItem
                label="Load"
                disabled={isPlay}
                close={close}
                onClick={() => loadLevel(levelName)}
              />
              <div className="bb-menu-sep" />
              {levels.map((name) => (
                <MenuItem
                  key={name}
                  label={name}
                  disabled={isPlay}
                  close={close}
                  onClick={() => loadLevel(name)}
                />
              ))}
            </>
          )}
        </Menu>
        <Menu label="Edit">
          {(close) => (
            <>
              <MenuItem label="Undo" shortcut="Ctrl+Z" disabled={isPlay || !canUndo} close={close} onClick={() => undo()} />
              <MenuItem label="Redo" shortcut="Ctrl+Y" disabled={isPlay || !canRedo} close={close} onClick={() => redo()} />
              <div className="bb-menu-sep" />
              <MenuItem label="Duplicate" shortcut="Ctrl+D" disabled={isPlay || !hasSelection} close={close} onClick={() => duplicateSelected()} />
              <MenuItem label="Delete" shortcut="Del" disabled={isPlay || !hasSelection} close={close} onClick={() => deleteSelected()} />
            </>
          )}
        </Menu>
        <div className="bb-menubar-title">
          {world?.name || 'BloodBound'}
          {levelName ? ` — ${levelName}` : ''}
        </div>
      </div>

      <header className="bb-toolbar">
        <div className="bb-seg">
          <input
            className="bb-level-name"
            value={levelName}
            disabled={isPlay}
            onChange={(e) => setLevelName(e.target.value)}
            title="Level filename"
          />
          <button type="button" disabled={isPlay} onClick={() => saveLevel()}>
            Save
          </button>
          <button type="button" disabled={isPlay} onClick={() => loadLevel(levelName)}>
            Load
          </button>
        </div>

        <div className="bb-seg">
          {[
            ['select', 'Select'],
            ['box', 'Box'],
            ['wall', 'Wall'],
            ['floor', 'Floor'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tool === id && !isPlay ? 'bb-btn-active' : ''}
              disabled={isPlay}
              onClick={() => setTool(id)}
              title={label}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bb-seg">
          <select
            className="bb-grid-select"
            value={gridSize}
            disabled={isPlay}
            onChange={(e) => setGridSize(Number(e.target.value))}
            title="Grid size"
          >
            {gridIncrements.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="bb-seg">
          <button type="button" disabled={isPlay || !canUndo} onClick={() => undo()}>Undo</button>
          <button type="button" disabled={isPlay || !canRedo} onClick={() => redo()}>Redo</button>
          <button type="button" disabled={isPlay || !hasSelection} onClick={() => duplicateSelected()}>Dup</button>
          <button type="button" disabled={isPlay || !hasSelection} onClick={() => deleteSelected()}>Del</button>
        </div>

        <div className="bb-toolbar-end">
          <div className="bb-status" title={status}>{status}</div>
          <div className="bb-seg">
            <button
              type="button"
              className={`bb-btn-primary${isPlay ? ' bb-btn-active' : ''}`}
              disabled={isPlay}
              onClick={() => play()}
            >
              Play
            </button>
            <button type="button" disabled={!isPlay} onClick={() => stop()}>
              Stop
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
