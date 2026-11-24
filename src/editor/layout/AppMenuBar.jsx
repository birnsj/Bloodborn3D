import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { EditorSettingsDialog } from '../EditorSettingsDialog.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useHoverHelp } from '../../ui/hoverHelp/HoverHelpContext.jsx';
import { KeyboardShortcutsDialog } from '../../ui/hoverHelp/KeyboardShortcutsDialog.jsx';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useTutorials } from '../../tutorials/TutorialProvider.jsx';

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
    isDirty,
    undo,
    redo,
    duplicateSelected,
    deleteSelected,
    selectAllActors,
    deselectAllActors,
    cycleGridSize,
    toggleGridSnap,
    gridSnap,
    gridSize,
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
    setColorTheme,
    viewScales,
    colorThemes,
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
  const { showHoverHelp, setShowHoverHelp } = useHoverHelp();
  const { openTutorialsPanel, startLesson, lessons } = useTutorials();
  const { alert, confirm, prompt } = useEditorDialogs();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isPlay = mode === 'play';
  const hasSelection = selectedActorIds.length > 0;
  const activeId = activeNamedLayout?.id || factoryLayoutId;
  const isFactory = activeId === factoryLayoutId;
  const canSaveActive = !isFactory && !activeNamedLayout?.protected;

  const onSaveLayout = async () => {
    const result = saveLayout();
    if (!result.ok && result.error === 'protected') {
      await alert(
        'The Default layout is protected. Use Save Layout As to create a custom layout.',
        { title: 'Protected Layout' },
      );
    }
  };

  const onSaveLayoutAs = async () => {
    const name = await prompt('Save layout as:', {
      title: 'Save Layout As',
      initialValue: layoutDirty ? `${activeNamedLayout?.name || 'Layout'} Copy` : 'My Layout',
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    const result = saveLayoutAs(trimmed);
    if (!result.ok) {
      if (result.error === 'reserved-name') {
        await alert('That name is reserved for the factory Default layout.', { title: 'Reserved Name' });
      } else if (result.error === 'empty-name') {
        await alert('Enter a layout name.', { title: 'Layout Name' });
      }
    }
  };

  const onRenameLayout = async () => {
    if (isFactory || activeNamedLayout?.protected) {
      await alert('The Default layout cannot be renamed.', { title: 'Protected Layout' });
      return;
    }
    const name = await prompt('Rename layout:', {
      title: 'Rename Layout',
      initialValue: activeNamedLayout?.name || '',
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    renameNamedLayout(activeId, trimmed);
  };

  const onDeleteLayout = async () => {
    if (isFactory || activeNamedLayout?.protected) {
      await alert('The Default layout cannot be deleted.', { title: 'Protected Layout' });
      return;
    }
    const ok = await confirm(
      `Delete layout “${activeNamedLayout?.name}”? This cannot be undone.`,
      { title: 'Delete Layout', confirmLabel: 'Delete' },
    );
    if (!ok) return;
    deleteNamedLayout(activeId);
  };

  const onResetLayout = async () => {
    const ok = await confirm(
      'Reset to the factory Default layout? Unsaved arrangement changes will be discarded.',
      { title: 'Reset Layout', confirmLabel: 'Reset' },
    );
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
            <Item
              label="Select All"
              shortcut="Ctrl+A"
              disabled={isPlay || !world?.actors?.length}
              close={close}
              onClick={() => selectAllActors()}
            />
            <Item
              label="Deselect"
              shortcut="Esc"
              disabled={isPlay || !hasSelection}
              close={close}
              onClick={() => deselectAllActors()}
            />
            <Sep />
            <Item label="Duplicate" shortcut="Ctrl+D" disabled={isPlay || !hasSelection} close={close} onClick={() => duplicateSelected()} />
            <Item label="Delete" shortcut="Del" disabled={isPlay || !hasSelection} close={close} onClick={() => deleteSelected()} />
            <Sep />
            <Item label="Settings…" close={close} onClick={() => setSettingsOpen(true)} />
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
            <Item
              label="Focus Selection"
              shortcut="F"
              disabled={isPlay || !hasSelection}
              close={close}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('bb:focus-selection'));
              }}
            />
            <Sep />
            <Item
              label="Smaller Grid"
              shortcut="["
              disabled={isPlay}
              close={close}
              onClick={() => cycleGridSize(-1)}
            />
            <Item
              label={`Larger Grid (${gridSize})`}
              shortcut="]"
              disabled={isPlay}
              close={close}
              onClick={() => cycleGridSize(1)}
            />
            <Item
              label="Grid Snap"
              shortcut="Shift+G"
              checked={gridSnap}
              disabled={isPlay}
              close={close}
              onClick={() => toggleGridSnap()}
            />
            <Sep />
            <SubMenu label="Theme">
              {(subClose) => {
                const done = () => {
                  subClose();
                  close();
                };
                return (
                  <>
                    {colorThemes.map((theme) => (
                      <Item
                        key={theme.id}
                        label={theme.label}
                        checked={layout.colorTheme === theme.id}
                        close={done}
                        onClick={() => setColorTheme(theme.id)}
                      />
                    ))}
                  </>
                );
              }}
            </SubMenu>
            <Sep />
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
            <Item
              label={`${layout.tutorialsVisible ? 'Hide' : 'Show'} Tutorials`}
              close={close}
              onClick={() => togglePanel('tutorialsVisible')}
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
            <Item
              label="Show Hover Help"
              checked={showHoverHelp}
              close={close}
              onClick={() => setShowHoverHelp(!showHoverHelp)}
            />
            <Item
              label="Keyboard Shortcuts…"
              close={close}
              onClick={() => setShortcutsOpen(true)}
            />
            <Sep />
            <Item
              label="Tutorials…"
              close={close}
              onClick={() => openTutorialsPanel()}
            />
            <SubMenu label="Start Lesson">
              {(subClose) => {
                const done = () => {
                  subClose();
                  close();
                };
                return (
                  <>
                    {lessons.map((lesson) => (
                      <Item
                        key={lesson.id}
                        label={`${lesson.order}. ${lesson.title}`}
                        close={done}
                        onClick={() => { void startLesson(lesson.id); }}
                      />
                    ))}
                  </>
                );
              }}
            </SubMenu>
          </>
        )}
      </Menu>

      <div className="bb-menubar__scene" title={isDirty ? `${levelName} (unsaved changes)` : levelName}>
        {world?.name || 'Untitled'}
        <span className="bb-menubar__scene-file">— {levelName}{isDirty ? ' •' : ''}</span>
      </div>

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <EditorSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
