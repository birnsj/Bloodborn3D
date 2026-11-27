import { describe, expect, it } from 'vitest';
import { ASSET_KINDS, folderForKind, normalizeRegistry } from '../assets/AssetRegistry.js';
import { toCatalogAsset } from '../assets/assetCatalog.js';

describe('folderForKind (shared AssetRegistry helper)', () => {
  it('maps known kinds and falls back to Misc', () => {
    expect(folderForKind(ASSET_KINDS.texture)).toBe('Textures');
    expect(folderForKind(ASSET_KINDS.mesh)).toBe('Meshes');
    expect(folderForKind(ASSET_KINDS.material)).toBe('Materials');
    expect(folderForKind(ASSET_KINDS.prefab)).toBe('Prefabs');
    expect(folderForKind('unknown')).toBe('Misc');
    expect(folderForKind(undefined)).toBe('Misc');
  });

  it('normalizeRegistry and catalog share the same defaults', () => {
    const reg = normalizeRegistry({
      assets: [
        { id: 't1', kind: ASSET_KINDS.texture, name: 'T', path: 'textures/t.png' },
        { id: 'm1', kind: ASSET_KINDS.mesh, name: 'M', path: 'meshes/m.glb' },
      ],
    });
    expect(reg.assets[0].folder).toBe('Textures');
    expect(reg.assets[1].folder).toBe('Meshes');
    expect(toCatalogAsset(reg.assets[0]).folder).toBe('Textures');
    expect(toCatalogAsset({ id: 'x', kind: ASSET_KINDS.prefab, name: 'P' }).folder).toBe('Prefabs');
  });

  it('preserves an explicit folder over the kind default', () => {
    const entry = {
      id: 't2',
      kind: ASSET_KINDS.texture,
      name: 'Custom',
      folder: 'Textures/Walls',
      path: 'textures/c.png',
    };
    expect(normalizeRegistry({ assets: [entry] }).assets[0].folder).toBe('Textures/Walls');
    expect(toCatalogAsset(entry).folder).toBe('Textures/Walls');
  });
});
