import { useMemo, useState } from 'react';
import { IconFolder } from '../../ui/icons.jsx';
import { useLayout } from './LayoutContext.jsx';
import { useAssetBrowser } from '../assets/AssetBrowserContext.jsx';
import { helpProps } from '../../ui/hoverHelp/helpProps.js';
import { useEditorDialogs } from '../../ui/dialogs/EditorDialogContext.jsx';
import { useEditorContextMenu } from '../../ui/contextMenu/EditorContextMenu.jsx';
import {
  buildFolderTree,
  countAssetsInFolder,
  folderParentOf,
  isBuiltinContentFolder,
  normalizeFolderPath,
} from '../../assets/contentFolders.js';

const FOLDER_DRAG = 'application/x-bloodbound-content-folder';

/**
 * Content Browser — folder navigation only.
 * Assets for the selected folder appear in Asset Viewer.
 * Right-click folders for New Subfolder / Rename / Delete / Move / Reorder.
 */
export function ContentBrowser({ docked = false } = {}) {
  const { layout, patch, ensurePanel } = useLayout();
  const {
    folders,
    folderTree,
    registry,
    mutateFolders,
    queryAssets,
    notify,
  } = useAssetBrowser();
  const { prompt, confirm } = useEditorDialogs();
  const { openFromEvent } = useEditorContextMenu();
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [dropPath, setDropPath] = useState(null);

  const selected = layout.contentFolder || 'Materials';
  const assets = registry?.assets || [];

  const tree = useMemo(
    () => (Array.isArray(folderTree) && folderTree.length
      ? folderTree
      : buildFolderTree(folders)),
    [folderTree, folders],
  );

  const selectFolder = (path) => {
    patch({ contentFolder: path });
    ensurePanel?.('assetViewer');
  };

  const toggleCollapse = (path) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const createFolder = async (parentPath) => {
    const name = await prompt('New folder name', {
      title: parentPath ? 'New Subfolder' : 'New Folder',
      initialValue: 'New Folder',
    });
    if (name == null) return;
    try {
      const result = await mutateFolders({
        type: 'create',
        parent: parentPath || null,
        name: String(name).trim(),
      });
      if (result?.path) selectFolder(result.path);
      notify?.(parentPath ? `Created subfolder under ${parentPath}` : `Created folder ${result.path}`);
    } catch (err) {
      notify?.(err.message || 'Could not create folder');
    }
  };

  const renameFolder = async (path) => {
    if (isBuiltinContentFolder(path)) {
      notify?.('Built-in folders cannot be renamed.');
      return;
    }
    const current = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
    const name = await prompt('Rename folder', {
      title: 'Rename Folder',
      initialValue: current,
    });
    if (name == null) return;
    try {
      const result = await mutateFolders({ type: 'rename', path, name: String(name).trim() });
      if (selected === path || selected.startsWith(`${path}/`)) {
        const next = result?.path || path;
        const suffix = selected === path ? '' : selected.slice(path.length);
        selectFolder(`${next}${suffix}`);
      }
      notify?.(`Renamed to ${result.path}`);
    } catch (err) {
      notify?.(err.message || 'Could not rename folder');
    }
  };

  const deleteFolder = async (path) => {
    if (isBuiltinContentFolder(path)) {
      notify?.('Built-in folders cannot be deleted.');
      return;
    }
    const count = countAssetsInFolder(assets, path, { recursive: true });
    if (count > 0) {
      notify?.(`Folder is not empty (${count} asset${count === 1 ? '' : 's'}). Move assets first.`);
      return;
    }
    const ok = await confirm(`Delete folder “${path}”?`, {
      title: 'Delete Folder',
      confirmLabel: 'Delete',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await mutateFolders({ type: 'delete', path });
      if (selected === path || selected.startsWith(`${path}/`)) {
        selectFolder(folderParentOf(path) || 'Materials');
      }
      notify?.(`Deleted ${path}`);
    } catch (err) {
      notify?.(err.message || 'Could not delete folder');
    }
  };

  const moveFolder = async (path, parent) => {
    try {
      const result = await mutateFolders({ type: 'move', path, parent });
      if (selected === path || selected.startsWith(`${path}/`)) {
        const next = result?.path || path;
        const suffix = selected === path ? '' : selected.slice(path.length);
        selectFolder(`${next}${suffix}`);
      }
      notify?.(parent ? `Moved to ${parent}` : `Moved ${result.path} to root`);
    } catch (err) {
      notify?.(err.message || 'Could not move folder');
    }
  };

  const reorderFolder = async (path, direction) => {
    try {
      await mutateFolders({ type: 'reorder', path, direction });
    } catch (err) {
      notify?.(err.message || 'Could not reorder folder');
    }
  };

  const openFolderMenu = (event, path) => {
    const parent = folderParentOf(path);
    const siblings = folders.filter((f) => folderParentOf(f) === parent);
    const sibIdx = siblings.indexOf(path);
    const builtin = isBuiltinContentFolder(path);
    const assetCount = countAssetsInFolder(assets, path, { recursive: true });

    const moveTargets = folders.filter((f) => {
      if (f === path) return false;
      if (f === parent) return false;
      // Cannot move into self/descendant.
      if (f === path || f.startsWith(`${path}/`)) return false;
      return true;
    });

    openFromEvent(event, [
      {
        id: 'open',
        label: 'Open Folder',
        onSelect: () => selectFolder(path),
      },
      {
        id: 'new-sub',
        label: 'New Subfolder…',
        onSelect: () => { void createFolder(path); },
      },
      { id: 'sep1', separator: true },
      {
        id: 'rename',
        label: 'Rename…',
        disabled: builtin,
        onSelect: () => { void renameFolder(path); },
      },
      {
        id: 'delete',
        label: 'Delete…',
        disabled: builtin || assetCount > 0,
        danger: true,
        onSelect: () => { void deleteFolder(path); },
      },
      { id: 'sep2', separator: true },
      {
        id: 'move-up',
        label: 'Move Up',
        disabled: sibIdx <= 0,
        onSelect: () => { void reorderFolder(path, 'up'); },
      },
      {
        id: 'move-down',
        label: 'Move Down',
        disabled: sibIdx < 0 || sibIdx >= siblings.length - 1,
        onSelect: () => { void reorderFolder(path, 'down'); },
      },
      {
        id: 'move-to',
        label: 'Move To',
        disabled: builtin || moveTargets.length === 0,
        submenu: [
          {
            id: 'move-root',
            label: '(Top level)',
            disabled: parent == null,
            onSelect: () => { void moveFolder(path, null); },
          },
          ...moveTargets.map((target) => ({
            id: `move-${target}`,
            label: target,
            onSelect: () => { void moveFolder(path, target); },
          })),
        ],
      },
    ]);
  };

  const openBackgroundMenu = (event) => {
    openFromEvent(event, [
      {
        id: 'new-root',
        label: 'New Folder…',
        onSelect: () => { void createFolder(null); },
      },
    ]);
  };

  return (
    <section className={`bb-panel-chrome bb-content bb-content--nav${docked ? ' bb-panel-chrome--docked' : ''}`}>
      <div className="bb-panel-chrome__head">
        {!docked && <span className="bb-panel-chrome__title">Content Browser</span>}
        <span className="bb-muted bb-content__nav-hint">Folders</span>
        <button
          type="button"
          className="bb-btn bb-btn--ghost"
          onClick={() => { void createFolder(null); }}
          {...helpProps('content.folder.new')}
        >
          + Folder
        </button>
      </div>

      <div
        className="bb-content__body bb-content__body--nav"
        onContextMenu={openBackgroundMenu}
      >
        <div className="bb-content__path">Content</div>
        <ul className="bb-content-folder-list">
          {tree.map((node) => (
            <FolderNode
              key={node.path}
              node={node}
              depth={0}
              selected={selected}
              collapsed={collapsed}
              dropPath={dropPath}
              assets={assets}
              queryAssets={queryAssets}
              onSelect={selectFolder}
              onToggle={toggleCollapse}
              onMenu={openFolderMenu}
              onDropPath={setDropPath}
              onReparent={(dragPath, targetPath) => { void moveFolder(dragPath, targetPath); }}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FolderNode({
  node,
  depth,
  selected,
  collapsed,
  dropPath,
  assets,
  queryAssets,
  onSelect,
  onToggle,
  onMenu,
  onDropPath,
  onReparent,
}) {
  const hasKids = node.children?.length > 0;
  const isCollapsed = collapsed.has(node.path);
  const count = typeof queryAssets === 'function'
    ? queryAssets(node.path).length
    : countAssetsInFolder(assets, node.path);
  const isSelected = selected === node.path;
  const isDrop = dropPath === node.path;
  const builtin = isBuiltinContentFolder(node.path);

  return (
    <>
      <li>
        <div
          className={`bb-content-folder-row${isDrop ? ' is-drop' : ''}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          onContextMenu={(e) => onMenu(e, node.path)}
          onDragOver={(e) => {
            const types = e.dataTransfer?.types || [];
            if ([...types].includes(FOLDER_DRAG)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              onDropPath?.(node.path);
            }
          }}
          onDragLeave={() => {
            if (dropPath === node.path) onDropPath?.(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDropPath?.(null);
            const dragPath = normalizeFolderPath(e.dataTransfer.getData(FOLDER_DRAG));
            if (!dragPath || dragPath === node.path) return;
            onReparent?.(dragPath, node.path);
          }}
        >
          <button
            type="button"
            className="bb-outliner-twist"
            disabled={!hasKids}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={() => onToggle(node.path)}
          >
            {hasKids ? (isCollapsed ? '▸' : '▾') : '·'}
          </button>
          <button
            type="button"
            className={`bb-content-folder${isSelected ? ' is-selected' : ''}`}
            draggable={!builtin}
            onDragStart={(e) => {
              if (builtin) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData(FOLDER_DRAG, node.path);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => onDropPath?.(null)}
            onClick={() => onSelect(node.path)}
            onContextMenu={(e) => onMenu(e, node.path)}
            {...helpProps('content.folder')}
          >
            <IconFolder />
            <span className="bb-content-folder__name">{node.name}</span>
            <span className="bb-content-folder__count">{count}</span>
          </button>
        </div>
      </li>
      {!isCollapsed && (node.children || []).map((child) => (
        <FolderNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          collapsed={collapsed}
          dropPath={dropPath}
          assets={assets}
          queryAssets={queryAssets}
          onSelect={onSelect}
          onToggle={onToggle}
          onMenu={onMenu}
          onDropPath={onDropPath}
          onReparent={onReparent}
        />
      ))}
    </>
  );
}
