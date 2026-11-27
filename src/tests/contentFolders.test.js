import { describe, expect, it } from 'vitest';
import {
  applyFolderOp,
  buildFolderTree,
  countAssetsInFolder,
  DEFAULT_CONTENT_CATEGORY,
  ensureDefaultContentCategory,
  FOLDER_KIND_CATEGORY,
  isBuiltinContentFolder,
  isContentCategory,
  normalizeContentFolderList,
  normalizeFolderPath,
  uniqueFolderName,
} from '../assets/contentFolders.js';

describe('contentFolders', () => {
  it('normalizes paths and rejects traversal', () => {
    expect(normalizeFolderPath('Textures\\Walls')).toBe('Textures/Walls');
    expect(normalizeFolderPath(' /a/b/ ')).toBe('a/b');
    expect(normalizeFolderPath('Textures/../Hack')).toBe('');
  });

  it('merges builtins, persisted, and asset folders', () => {
    const list = normalizeContentFolderList(
      ['Textures/Walls', 'Custom'],
      [{ folder: 'Meshes/Props' }],
    );
    expect(list).toContain('Textures');
    expect(list).toContain('Textures/Walls');
    expect(list).toContain('Meshes');
    expect(list).toContain('Meshes/Props');
    expect(list).toContain('Custom');
    expect(isBuiltinContentFolder('Textures')).toBe(true);
    expect(isBuiltinContentFolder('Textures/Walls')).toBe(false);
  });

  it('builds a tree with sibling order', () => {
    const tree = buildFolderTree([
      'Textures',
      'Textures/Walls',
      'Textures/Floors',
      'Materials',
    ]);
    const textures = tree.find((n) => n.path === 'Textures');
    expect(textures).toBeTruthy();
    expect(textures.children.map((c) => c.name)).toEqual(['Walls', 'Floors']);
  });

  it('creates a subfolder', () => {
    const base = { folders: ['Textures', 'Materials'], assets: [] };
    const result = applyFolderOp(base, { type: 'create', parent: 'Textures', name: 'Walls' });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('Textures/Walls');
    expect(result.registry.folders).toContain('Textures/Walls');
  });

  it('renames a folder and remaps assets', () => {
    const base = {
      folders: ['Textures', 'Textures/Walls', 'Textures/Walls/Brick'],
      assets: [
        { id: 'a', kind: 'texture', name: 'A', folder: 'Textures/Walls' },
        { id: 'b', kind: 'texture', name: 'B', folder: 'Textures/Walls/Brick' },
      ],
    };
    const result = applyFolderOp(base, { type: 'rename', path: 'Textures/Walls', name: 'Surfaces' });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('Textures/Surfaces');
    expect(result.registry.assets[0].folder).toBe('Textures/Surfaces');
    expect(result.registry.assets[1].folder).toBe('Textures/Surfaces/Brick');
  });

  it('blocks deleting builtins and non-empty folders', () => {
    expect(applyFolderOp({ folders: ['Textures'], assets: [] }, { type: 'delete', path: 'Textures' }).ok)
      .toBe(false);
    const blocked = applyFolderOp(
      {
        folders: ['Textures', 'Textures/Walls'],
        assets: [{ id: 'a', kind: 'texture', name: 'A', folder: 'Textures/Walls' }],
      },
      { type: 'delete', path: 'Textures/Walls' },
    );
    expect(blocked.ok).toBe(false);
    expect(countAssetsInFolder(
      [{ folder: 'Textures/Walls' }],
      'Textures',
      { recursive: true },
    )).toBe(1);
  });

  it('reorders siblings', () => {
    const base = {
      folders: ['Textures', 'Textures/Walls', 'Textures/Floors', 'Materials'],
      assets: [],
    };
    const down = applyFolderOp(base, { type: 'reorder', path: 'Textures/Walls', direction: 'down' });
    expect(down.ok).toBe(true);
    const wallsIdx = down.registry.folders.indexOf('Textures/Walls');
    const floorsIdx = down.registry.folders.indexOf('Textures/Floors');
    expect(floorsIdx).toBeLessThan(wallsIdx);
  });

  it('moves assets between folders', () => {
    const base = {
      folders: ['Textures', 'Materials'],
      assets: [{ id: 'a', kind: 'texture', name: 'A', folder: 'Textures' }],
    };
    const result = applyFolderOp(base, {
      type: 'move-asset',
      assetId: 'a',
      folder: 'Materials',
    });
    expect(result.ok).toBe(true);
    expect(result.registry.assets[0].folder).toBe('Materials');
  });

  it('creates a named category header at the root', () => {
    const base = { folders: ['Textures', 'Materials'], assets: [], folderMeta: {} };
    const result = applyFolderOp(base, {
      type: 'create',
      parent: null,
      name: 'Environment',
      kind: FOLDER_KIND_CATEGORY,
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('Environment');
    expect(isContentCategory('Environment', result.registry.folderMeta)).toBe(true);
    const tree = buildFolderTree(result.registry.folders, result.registry.folderMeta);
    const node = tree.find((n) => n.path === 'Environment');
    expect(node?.kind).toBe(FOLDER_KIND_CATEGORY);
  });

  it('blocks nesting categories and putting assets in a category header', () => {
    const withCategory = applyFolderOp(
      { folders: ['Textures'], assets: [], folderMeta: {} },
      { type: 'create', parent: null, name: 'Props', kind: FOLDER_KIND_CATEGORY },
    );
    expect(withCategory.ok).toBe(true);
    const nested = applyFolderOp(withCategory.registry, {
      type: 'create',
      parent: 'Textures',
      name: 'NestedCat',
      kind: FOLDER_KIND_CATEGORY,
    });
    expect(nested.ok).toBe(false);
    const moveIntoCat = applyFolderOp(
      {
        ...withCategory.registry,
        assets: [{ id: 'a', kind: 'texture', name: 'A', folder: 'Textures' }],
      },
      { type: 'move-asset', assetId: 'a', folder: 'Props' },
    );
    expect(moveIntoCat.ok).toBe(false);
  });

  it('treats categories as sections — create under category is top-level placement', () => {
    const withCategory = applyFolderOp(
      { folders: ['Textures', 'Props'], assets: [], folderMeta: {} },
      { type: 'create', parent: null, name: 'Props', kind: FOLDER_KIND_CATEGORY },
    );
    // Props may already exist as folder — use a fresh category name
    const cat = applyFolderOp(
      { folders: ['Textures', 'Materials'], assets: [], folderMeta: {} },
      { type: 'create', parent: null, name: 'Set Dressing', kind: FOLDER_KIND_CATEGORY },
    );
    expect(cat.ok).toBe(true);
    const underCat = applyFolderOp(cat.registry, {
      type: 'create',
      parent: 'Set Dressing',
      name: 'Walls',
    });
    expect(underCat.ok).toBe(true);
    expect(underCat.path).toBe('Walls');
    const tree = buildFolderTree(underCat.registry.folders, underCat.registry.folderMeta);
    const section = tree.find((n) => n.path === 'Set Dressing');
    expect(section?.children.map((c) => c.path)).toContain('Walls');
  });

  it('collapses category section members that follow it in list order', () => {
    const tree = buildFolderTree(
      ['Meshes', 'New Category', 'Environments', 'test', 'Prefabs', 'Characters'],
      {
        'New Category': { kind: FOLDER_KIND_CATEGORY },
        Characters: { kind: FOLDER_KIND_CATEGORY },
      },
    );
    const neu = tree.find((n) => n.path === 'New Category');
    expect(neu?.children.map((c) => c.path)).toEqual(['Environments', 'test', 'Prefabs']);
    const chars = tree.find((n) => n.path === 'Characters');
    // Remaining builtins land in the last open section after normalize merges them.
    expect(chars?.children.map((c) => c.path).length).toBeGreaterThan(0);
    expect(chars?.children.every((c) => c.kind === 'folder')).toBe(true);
  });

  it('copies a category header only (section folders stay put)', () => {
    expect(uniqueFolderName(['Environment'], null, 'Environment')).toBe('Environment Copy');
    const base = {
      folders: ['Environment', 'Walls', 'Textures'],
      folderMeta: { Environment: { kind: FOLDER_KIND_CATEGORY } },
      assets: [{ id: 'a', kind: 'texture', name: 'A', folder: 'Walls' }],
    };
    const copied = applyFolderOp(base, { type: 'copy', path: 'Environment', parent: null });
    expect(copied.ok).toBe(true);
    expect(copied.path).toBe('Environment Copy');
    expect(isContentCategory('Environment Copy', copied.registry.folderMeta)).toBe(true);
    expect(copied.registry.folders).not.toContain('Environment Copy/Walls');
    expect(copied.registry.assets[0].folder).toBe('Walls');
  });

  it('seeds Project Content when no categories exist', () => {
    const ensured = ensureDefaultContentCategory(
      ['Textures', 'Materials'],
      {},
    );
    expect(ensured.folders[0]).toBe(DEFAULT_CONTENT_CATEGORY);
    expect(isContentCategory(DEFAULT_CONTENT_CATEGORY, ensured.folderMeta)).toBe(true);
    const again = ensureDefaultContentCategory(ensured.folders, ensured.folderMeta);
    expect(again.folders.filter((f) => f === DEFAULT_CONTENT_CATEGORY)).toHaveLength(1);
  });

  it('sets and clears folder icon colors', () => {
    const base = {
      folders: ['Textures', 'Props'],
      assets: [],
      folderMeta: { Props: { kind: FOLDER_KIND_CATEGORY } },
    };
    const colored = applyFolderOp(base, {
      type: 'set-icon-color',
      path: 'Textures',
      iconColor: '#4A8FD4',
    });
    expect(colored.ok).toBe(true);
    expect(colored.registry.folderMeta.Textures).toEqual({ iconColor: '#4a8fd4' });
    expect(isContentCategory('Textures', colored.registry.folderMeta)).toBe(false);

    const catColored = applyFolderOp(colored.registry, {
      type: 'set-icon-color',
      path: 'Props',
      iconColor: '#FF8800',
    });
    expect(catColored.ok).toBe(true);
    expect(catColored.registry.folderMeta.Props).toEqual({
      kind: FOLDER_KIND_CATEGORY,
      iconColor: '#ff8800',
    });

    const cleared = applyFolderOp(catColored.registry, {
      type: 'set-icon-color',
      path: 'Textures',
      iconColor: null,
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.registry.folderMeta.Textures).toBeUndefined();
    expect(cleared.registry.folderMeta.Props.iconColor).toBe('#ff8800');
  });

  it('reorders a folder after a sibling', () => {
    const base = {
      folders: ['Textures', 'Materials', 'Custom'],
      assets: [],
      folderMeta: {},
    };
    const result = applyFolderOp(base, { type: 'reorder', path: 'Custom', before: 'Textures' });
    expect(result.ok).toBe(true);
    const roots = result.registry.folders.filter((f) => !f.includes('/'));
    expect(roots.indexOf('Custom')).toBeLessThan(roots.indexOf('Textures'));
  });

  it('keeps custom order ahead of builtins after normalize', () => {
    const ordered = normalizeContentFolderList(
      ['Environment', 'Textures', 'Materials', 'Custom'],
      [],
    );
    const roots = ordered.filter((f) => !f.includes('/'));
    expect(roots.indexOf('Environment')).toBeLessThan(roots.indexOf('Textures'));
    expect(roots.indexOf('Custom')).toBeGreaterThan(roots.indexOf('Materials'));
  });
});
