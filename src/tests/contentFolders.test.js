import { describe, expect, it } from 'vitest';
import {
  applyFolderOp,
  buildFolderTree,
  countAssetsInFolder,
  isBuiltinContentFolder,
  normalizeContentFolderList,
  normalizeFolderPath,
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
});
