import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { useLayout } from './LayoutContext.jsx';

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
        <ul className="bb-menu-list">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </ul>
      )}
    </div>
  );
}

function SubMenu({ label, children }) {
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
    <li className="bb-menu-submenu" ref={ref}>
      <button
        type="button"
        className={`bb-menu-item bb-menu-item--submenu${open ? ' is-open' : ''}`}
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span className="bb-menu-shortcut">▸</span>
      </button>
      {open && (
        <ul className="bb-menu-list bb-menu-list--flyout">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </ul>
      )}
    </li>
  );
}

function Item({ label, shortcut, disabled, onClick, close, checked }) {
  return (
    <li>
      <button
        type="button"
        className="bb-menu-item"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onClick?.();
          close?.();
        }}
      >
        <span>{checked ? `✓ ${label}` : label}</span>
        {shortcut ? <span className="bb-menu-shortcut">{shortcut}</span> : null}
      </button>
    </li>
  );
}

function Sep() {
  return <li className="bb-menu-sep" aria-hidden="true" />;
}

function promptName(title, initial = '') {
  const value = window.prompt(title, initial);
  if (value == null) return null;
  return value.trim();
}

export function AppMenuBar() {
  const {
    mode,
    levelName,
    levels,
    world,
    canUndo,
    canRedo,
    selectedActorIds,
    saveLevel,
    loadLevel,
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    play,
    stop,
  } = useEditor();
  const {
    layout,
    togglePanel,
    toggleMaximizeViewport,
    resetLayout,
    setWorkspace,
    setUiScale,
    viewScales,
    namedLayouts,
    activeNamedLayout,
    layoutDirty,
    saveLayout,
    saveLayoutAs,
    loadNamedLayout,
    renameNamedLayout,
    deleteNamedLayout,
    factoryLayoutId,
  } = useLayout();

  const isPlay = mode === 'play';
  const hasSelection = selectedActorIds.length > 0;
  const activeId = activeNamedLayout?.id || factoryLayoutId;
  const isFactory = activeId === factoryLayoutId;
  const canSaveActive = !isFactory && !activeNamedLayout?.protected;

  const onSaveLayout = () => {
    const result = saveLayout();
    if (!result.ok && result.error === 'protected') {
      window.alert('The Default layout is protected. Use Save Layout As to create a custom layout.');
    }
  };

  const onSaveLayoutAs = () => {
    const name = promptName('Save layout as:', layoutDirty ? `${activeNamedLayout?.name || 'Layout'} Copy` : 'My Layout');
    if (!name) return;
    const result = saveLayoutAs(name);
    if (!result.ok) {
      if (result.error === 'reserved-name') {
        window.alert('That name is reserved for the factory Default layout.');
      } else if (result.error === 'empty-name') {
        window.alert('Enter a layout name.');
      }
    }
  };

  const onRenameLayout = () => {
    if (isFactory || activeNamedLayout?.protected) {
      window.alert('The Default layout cannot be renamed.');
      return;
    }
    const name = promptName('Rename layout:', activeNamedLayout?.name || '');
    if (!name) return;
    renameNamedLayout(activeId, name);
  };

  const onDeleteLayout = () => {
    if (isFactory || activeNamedLayout?.protected) {
      window.alert('The Default layout cannot be deleted.');
      return;
    }
    const ok = window.confirm(`Delete layout “${activeNamedLayout?.name}”? This cannot be undone.`);
    if (!ok) return;
    deleteNamedLayout(activeId);
  };

  const onResetLayout = () => {
    const ok = window.confirm('Reset to the factory Default layout? Unsaved arrangement changes will be discarded.');
    if (!ok) return;
    resetLayout();
  };

  return (
    <div className="bb-menubar">
      <div className="bb-menubar__brand">BloodBound Editor</div>

      <Menu label="File">
        {(close) => (
          <>
            <Item label="Save Level" shortcut="Ctrl+S" disabled={isPlay} close={close} onClick={() => saveLevel()} />
            <Item label="Reload Level" disabled={isPlay} close={close} onClick={() => loadLevel(levelName)} />
            <Sep />
            {levels.map((name) => (
              <Item
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
            <Item label="Undo" shortcut="Ctrl+Z" disabled={isPlay || !canUndo} close={close} onClick={() => undo()} />
            <Item label="Redo" shortcut="Ctrl+Y" disabled={isPlay || !canRedo} close={close} onClick={() => redo()} />
            <Sep />
            <Item label="Duplicate" shortcut="Ctrl+D" disabled={isPlay || !hasSelection} close={close} onClick={() => duplicateSelected()} />
            <Item label="Delete" shortcut="Del" disabled={isPlay || !hasSelection} close={close} onClick={() => deleteSelected()} />
          </>
        )}
      </Menu>

      <Menu label="Level">
        {(close) => (
          <>
            <Item label="Open Level Editor" close={close} onClick={() => setWorkspace('level')} />
            <Sep />
            <Item label={isPlay ? 'Stop Play' : 'Play In Editor'} close={close} onClick={() => (isPlay ? stop() : play())} />
          </>
        )}
      </Menu>

      <Menu label="View">
        {(close) => (
          <>
            {viewScales.map((entry) => (
              <Item
                key={entry.id}
                label={entry.label}
                checked={layout.uiScale === entry.id}
                close={close}
                onClick={() => setUiScale(entry.id)}
              />
            ))}
          </>
        )}
      </Menu>

      <Menu label="Window">
        {(close) => (
          <>
            <Item
              label={`${layout.outlinerVisible ? 'Hide' : 'Show'} Scene Outliner`}
              close={close}
              onClick={() => togglePanel('outlinerVisible')}
            />
            <Item
              label={`${layout.detailsVisible ? 'Hide' : 'Show'} Details`}
              close={close}
              onClick={() => togglePanel('detailsVisible')}
            />
            <Item
              label={`${layout.contentVisible ? 'Hide' : 'Show'} Content Browser`}
              close={close}
              onClick={() => togglePanel('contentVisible')}
            />
            <Item
              label={`${layout.assetViewerVisible ? 'Hide' : 'Show'} Asset Viewer`}
              close={close}
              onClick={() => togglePanel('assetViewerVisible')}
            />
            <Sep />
            <Item
              label={layout.viewportMaximized ? 'Restore Viewport' : 'Maximize Viewport'}
              close={close}
              onClick={() => toggleMaximizeViewport()}
            />
            <Sep />
            <SubMenu label="Layouts">
              {(subClose) => {
                const done = () => {
                  subClose();
                  close();
                };
                return (
                  <>
                    <Item
                      label="Save Layout"
                      disabled={!canSaveActive || !layoutDirty}
                      close={done}
                      onClick={onSaveLayout}
                    />
                    <Item label="Save Layout As…" close={done} onClick={onSaveLayoutAs} />
                    <Sep />
                    {namedLayouts.map((entry) => (
                      <Item
                        key={entry.id}
                        label={`${entry.name}${entry.id === activeId && layoutDirty ? ' •' : ''}`}
                        checked={entry.id === activeId}
                        close={done}
                        onClick={() => loadNamedLayout(entry.id)}
                      />
                    ))}
                    <Sep />
                    <Item
                      label="Rename Layout…"
                      disabled={isFactory || activeNamedLayout?.protected}
                      close={done}
                      onClick={onRenameLayout}
                    />
                    <Item
                      label="Delete Layout…"
                      disabled={isFactory || activeNamedLayout?.protected}
                      close={done}
                      onClick={onDeleteLayout}
                    />
                    <Item label="Reset Layout" close={done} onClick={onResetLayout} />
                  </>
                );
              }}
            </SubMenu>
          </>
        )}
      </Menu>

      <Menu label="Help">
        {(close) => (
          <>
            <Item label="BloodBound Phase 2A.5 — named workspace layouts" disabled close={close} />
          </>
        )}
      </Menu>

      <div className="bb-menubar__scene" title={levelName}>
        {world?.name || 'Untitled'}
        <span className="bb-menubar__scene-file">— {levelName}</span>
      </div>
    </div>
  );
}
