import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../EditorContext.jsx';
import { EditorSettingsDialog } from '../EditorSettingsDialog.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useHoverHelp } from '../../ui/hoverHelp/HoverHelpContext.jsx';
import { KeyboardShortcutsDialog } from '../../ui/hoverHelp/KeyboardShortcutsDialog.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useTutorials } from '../../tutorials/TutorialProvider.jsx';
import { LAYOUT_MODE_OPTIONS } from '../viewport/viewportPrefs.js';

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

function Item({ label, shortcut, disabled, onClick, close, checked, helpId = null, disabledReason = null }) {
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
        {...(helpId ? helpProps(helpId, disabled ? (disabledReason || 'Unavailable.') : null) : {})}
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
    saveLevelAs,
    createNewMap,
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
    setViewportLayoutMode,
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
  const { openTutorialsPanel } = useTutorials();
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
        'The Default layout is protected. Rearranging autosaves to Autosaved, or use Save Layout As for a custom name.',
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
            <Item
              label="New Map…"
              disabled={isPlay}
              close={close}
              helpId="file.newMap"
              disabledReason="Unavailable during Play mode."
              onClick={async () => {
                const rawName = await prompt('New map filename:', {
                  title: 'New Map',
                  initialValue: 'untitled.json',
                });
                if (!rawName?.trim()) return;
                const subtractive = await confirm(
                  'Choose map mode.\n\nSubtractive starts as a solid world — structural brushes carve rooms.\nAdditive starts empty — you add brushes to build.',
                  {
                    title: 'Map Mode',
                    confirmLabel: 'Subtractive',
                    cancelLabel: 'Additive',
                  },
                );
                await createNewMap({
                  fileName: rawName,
                  mapMode: subtractive ? 'subtractive' : 'additive',
                });
              }}
            />
            <Sep />
            <Item label="Save Level" shortcut="Ctrl+S" disabled={isPlay} close={close} onClick={() => saveLevel()} />
            <Item label="Save Level As…" disabled={isPlay} close={close} onClick={() => saveLevelAs()} />
            <Item label="Reload Level" disabled={isPlay} close={close} onClick={() => loadLevel(levelName)} />
            <Sep />
            {levels.map((name) => {
              const active = name === levelName;
              const modeSuffix = active && world?.mapMode === 'subtractive'
                ? ' · subtractive'
                : (active && world?.mapMode === 'additive' ? ' · additive' : '');
              return (
                <Item
                  key={name}
                  label={`${name}${modeSuffix}`}
                  disabled={isPlay}
                  close={close}
                  checked={active}
                  onClick={() => loadLevel(name)}
                />
              );
            })}
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
            <Item
              label="Settings…"
              close={close}
              onClick={() => setSettingsOpen(true)}
              helpId="settings.dialog"
            />
          </>
        )}
      </Menu>

      <Menu label="Level">
        {(close) => (
          <>
            <Item label="Open Level Editor" close={close} onClick={() => setWorkspace('level')} />
            <Item label="Open Materials" close={close} onClick={() => setWorkspace('materials')} />
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
              helpId="viewport.focus"
              disabledReason={isPlay ? 'Unavailable during Play mode.' : 'Select actors first.'}
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
            <SubMenu label="Viewport Layout">
              {(subClose) => {
                const done = () => {
                  subClose();
                  close();
                };
                const currentMode = layout.viewportView?.layoutMode || 'single';
                return (
                  <>
                    {LAYOUT_MODE_OPTIONS.map((mode) => (
                      <Item
                        key={mode.id}
                        label={mode.label}
                        checked={currentMode === mode.id}
                        close={done}
                        onClick={() => setViewportLayoutMode(mode.id)}
                      />
                    ))}
                  </>
                );
              }}
            </SubMenu>
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
            <Item
              label={`${layout.openartVisible ? 'Hide' : 'Show'} OpenArt`}
              close={close}
              onClick={() => togglePanel('openartVisible')}
            />
            <Sep />
            <Item
              label="Maximize Active View"
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
              helpId="help.hoverHelp"
            />
            <Item
              label="Keyboard Shortcuts…"
              close={close}
              onClick={() => setShortcutsOpen(true)}
              helpId="help.shortcuts"
            />
            <Sep />
            <Item
              label="Tutorials…"
              close={close}
              onClick={() => openTutorialsPanel()}
              helpId="panel.tutorials"
            />
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
