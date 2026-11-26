import { describe, expect, it } from 'vitest';
import { needsBrowserMaterialThumb } from '../editor/assets/materialThumbnailBake.js';

describe('needsBrowserMaterialThumb', () => {
  it('requests bake when preview is missing', () => {
    expect(needsBrowserMaterialThumb({ id: 'mat_a', kind: 'material', meta: {} })).toBe(true);
  });

  it('requests upgrade for CPU/script thumbs without webgl flag', () => {
    expect(needsBrowserMaterialThumb({
      id: 'mat_batch1_metal',
      kind: 'material',
      meta: { previewPath: 'previews/mat_batch1_metal_sphere.png' },
    })).toBe(true);
  });

  it('skips materials already marked webgl sphere-fill', () => {
    expect(needsBrowserMaterialThumb({
      id: 'mat_ok',
      kind: 'material',
      meta: {
        previewPath: 'previews/mat_ok_sphere.png',
        previewRenderer: 'webgl',
        previewStyle: 'sphere-fill',
      },
    })).toBe(false);
  });

  it('rebakes older webgl thumbs with loose framing or ground', () => {
    expect(needsBrowserMaterialThumb({
      id: 'mat_old',
      kind: 'material',
      meta: {
        previewPath: 'previews/mat_old_sphere.png',
        previewRenderer: 'webgl',
        previewStyle: 'sphere',
      },
    })).toBe(true);
  });

  it('ignores non-materials', () => {
    expect(needsBrowserMaterialThumb({ id: 'mesh_1', kind: 'mesh', meta: {} })).toBe(false);
  });
});
