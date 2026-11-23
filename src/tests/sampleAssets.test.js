import { describe, expect, it } from 'vitest';
import {
  ASSET_DRAG_MIME,
  ASSET_FOLDERS,
  listCatalogAssets,
  getCatalogAsset,
} from '../assets/assetCatalog.js';
import { normalizeRegistry, ASSET_KINDS } from '../assets/AssetRegistry.js';

describe('project asset catalog', () => {
  it('lists folders and drag mime for Content Browser', () => {
    expect(ASSET_FOLDERS).toContain('Materials');
    expect(ASSET_FOLDERS).toContain('Meshes');
    expect(ASSET_FOLDERS).toContain('Textures');
    expect(ASSET_DRAG_MIME).toContain('bloodbound-asset');
  });

  it('filters registry assets by folder and search query', () => {
    const registry = normalizeRegistry({
      assets: [
        {
          id: 'mat_stone',
          kind: ASSET_KINDS.material,
          name: 'Ashen Stone',
          folder: 'Materials',
          path: 'materials/mat_stone.json',
          tags: ['stone'],
        },
        {
          id: 'tex_noise',
          kind: ASSET_KINDS.texture,
          name: 'Noise Mask',
          folder: 'Textures',
          path: 'textures/tex_noise.png',
          tags: ['mask'],
        },
      ],
    });

    const materials = listCatalogAssets(registry, { folder: 'Materials' });
    expect(materials.every((a) => a.folder === 'Materials')).toBe(true);
    expect(listCatalogAssets(registry, { query: 'noise' })[0]?.id).toBe('tex_noise');
    expect(getCatalogAsset(registry, 'mat_stone')?.type).toBe('material');
  });
});
