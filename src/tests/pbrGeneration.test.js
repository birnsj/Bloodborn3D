import { describe, expect, it } from 'vitest';
import {
  blurHeightField,
  composeHeightField,
  generatePbrMapsFromImageData,
  generateRoughnessMap,
  heightToNormalMap,
  imageToHeightField,
  sampleHeight,
  tileImageDataPreview,
} from '../editor/materials/pbrGeneration.js';
import {
  createDefaultPbrSession,
  normalizeNormalParams,
  normalizePbrGeneratorMeta,
  normalizeRoughnessParams,
} from '../editor/materials/pbrGeneratorState.js';
import { createMaterialDefinition } from '../materials/MaterialDefinition.js';
import {
  cloneMaterialDraft,
  materialDraftToSavePayload,
} from '../editor/materials/materialDraft.js';

function solidImage(w, h, rgba = [180, 140, 100, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { data, width: w, height: h };
}

/** Ramp darker → lighter left→right for predictable slopes. */
function rampImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = Math.round((x / Math.max(w - 1, 1)) * 255);
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe('pbrGeneratorState', () => {
  it('normalizes and clamps params', () => {
    expect(normalizeNormalParams({ strength: 99 }).strength).toBe(4);
    expect(normalizeRoughnessParams({ mode: 'uniform', uniformValue: 2 }).uniformValue).toBe(1);
    expect(normalizeRoughnessParams({ min: 0.9, max: 0.1 }).min).toBeLessThanOrEqual(
      normalizeRoughnessParams({ min: 0.9, max: 0.1 }).max,
    );
  });

  it('restores prior session tiling and map ids', () => {
    const session = createDefaultPbrSession({
      sourceTextureId: 'tex_a',
      previous: {
        sourceTextureId: 'tex_old',
        tileHorizontal: true,
        tileVertical: false,
        normal: { strength: 1.2 },
        roughness: { mode: 'uniform', uniformValue: 0.4 },
        generatedNormalMapId: 'tex_n',
        generatedRoughnessMapId: 'tex_r',
      },
    });
    expect(session.tiling.tileHorizontal).toBe(true);
    expect(session.tiling.tileVertical).toBe(false);
    expect(session.generatedNormalMapId).toBe('tex_n');
    expect(session.roughness.mode).toBe('uniform');
  });
});

describe('sampleHeight wrap modes', () => {
  const height = new Float32Array([1, 2, 3, 4]); // 2x2
  it('wraps horizontally when tileHorizontal', () => {
    expect(sampleHeight(height, 2, 2, -1, 0, { tileHorizontal: true, tileVertical: false }))
      .toBe(2);
  });
  it('clamps vertically when not tiling V', () => {
    expect(sampleHeight(height, 2, 2, 0, -5, { tileHorizontal: true, tileVertical: false }))
      .toBe(1);
  });
  it('wraps vertically when tileVertical', () => {
    expect(sampleHeight(height, 2, 2, 0, 2, { tileHorizontal: false, tileVertical: true }))
      .toBe(1);
  });
});

describe('normal map generation', () => {
  it('preserves image dimensions', () => {
    const img = rampImage(32, 16);
    const { height, width, heightPx } = imageToHeightField(img);
    const composed = composeHeightField(height, width, heightPx, {}, {
      tileHorizontal: true,
      tileVertical: false,
    });
    const normal = heightToNormalMap(composed, width, heightPx, {
      tileHorizontal: true,
      tileVertical: false,
    });
    expect(normal.width).toBe(32);
    expect(normal.height).toBe(16);
    expect(normal.data.length).toBe(32 * 16 * 4);
  });

  it('produces OpenGL-style outward normals (mostly blue) on flat areas', () => {
    const img = solidImage(16, 16, [128, 128, 128, 255]);
    const result = generatePbrMapsFromImageData(img, {
      tiling: { tileHorizontal: true, tileVertical: true },
    });
    const mid = ((8 * 16 + 8) * 4);
    // Z channel dominant for flat surface.
    expect(result.normal.data[mid + 2]).toBeGreaterThan(200);
  });

  it('invertY flips green encoding relative to default', () => {
    // Vertical luminance ramp → nonzero dY so invertY changes green.
    const data = new Uint8ClampedArray(24 * 24 * 4);
    for (let y = 0; y < 24; y += 1) {
      const v = Math.round((y / 23) * 255);
      for (let x = 0; x < 24; x += 1) {
        const i = (y * 24 + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const img = { data, width: 24, height: 24 };
    const a = generatePbrMapsFromImageData(img, {
      normal: { invertY: false, strength: 2, fineDetail: 0, largeScale: 1, smoothing: 0 },
      tiling: { tileHorizontal: true, tileVertical: true },
    });
    const b = generatePbrMapsFromImageData(img, {
      normal: { invertY: true, strength: 2, fineDetail: 0, largeScale: 1, smoothing: 0 },
      tiling: { tileHorizontal: true, tileVertical: true },
    });
    let diff = 0;
    for (let i = 1; i < a.normal.data.length; i += 4) {
      diff += Math.abs(a.normal.data[i] - b.normal.data[i]);
    }
    expect(diff).toBeGreaterThan(0);
  });
});

describe('roughness map generation', () => {
  it('uniform mode fills absolute roughness', () => {
    const img = solidImage(8, 8);
    const map = generateRoughnessMap(img, { mode: 'uniform', uniformValue: 0.25 });
    expect(map.data[0]).toBe(64);
    expect(map.data[1]).toBe(64);
    expect(map.data[2]).toBe(64);
  });

  it('derived mode respects min/max', () => {
    const img = rampImage(16, 4);
    const map = generateRoughnessMap(img, {
      mode: 'derived',
      overall: 0.5,
      contrast: 1,
      detail: 1,
      min: 0.2,
      max: 0.6,
    });
    for (let i = 0; i < map.data.length; i += 4) {
      const v = map.data[i] / 255;
      expect(v).toBeGreaterThanOrEqual(0.2 - 0.02);
      expect(v).toBeLessThanOrEqual(0.6 + 0.02);
    }
  });
});

describe('tiling preview and blur', () => {
  it('tileImageDataPreview keeps pixel size × cols/rows', () => {
    const img = solidImage(10, 5, [10, 20, 30, 255]);
    const tiled = tileImageDataPreview(img, 3, 1);
    expect(tiled.width).toBe(30);
    expect(tiled.height).toBe(5);
  });

  it('blurHeightField keeps length', () => {
    const h = new Float32Array(9).fill(0.5);
    h[4] = 1;
    const out = blurHeightField(h, 3, 3, 1, { tileHorizontal: true, tileVertical: true });
    expect(out.length).toBe(9);
  });
});

describe('material UV / pbrGenerator persistence', () => {
  it('preserves uvScale when saving a payload with pbrGenerator', () => {
    const src = createMaterialDefinition({
      id: 'mat_full',
      name: 'Full Wall',
      baseColorMapId: 'tex_base',
      uvScale: { x: 1 / 6, y: 1 / 6 },
      roughness: 0.85,
      metalness: 0.02,
    });
    const draft = cloneMaterialDraft(src);
    draft.normalMapId = 'tex_n';
    draft.roughnessMapId = 'tex_r';
    draft.roughness = 1;
    draft.metalness = 0;
    draft.pbrGenerator = normalizePbrGeneratorMeta({
      sourceTextureId: 'tex_base',
      tileHorizontal: true,
      tileVertical: false,
      normal: { strength: 1 },
      roughness: { mode: 'derived' },
      generatedNormalMapId: 'tex_n',
      generatedRoughnessMapId: 'tex_r',
    });
    const payload = materialDraftToSavePayload(draft);
    expect(payload.uvScale.x).toBeCloseTo(1 / 6, 5);
    expect(payload.uvScale.y).toBeCloseTo(1 / 6, 5);
    expect(payload.pbrGenerator.tileHorizontal).toBe(true);
    expect(payload.pbrGenerator.tileVertical).toBe(false);
    expect(payload.normalMapId).toBe('tex_n');
    expect(payload.roughness).toBe(1);
    expect(payload.metalness).toBe(0);
  });

  it('full pipeline returns matching dimensions for both maps', () => {
    const img = rampImage(48, 32);
    const result = generatePbrMapsFromImageData(img, {
      tiling: { tileHorizontal: true, tileVertical: false },
    });
    expect(result.normal.width).toBe(result.roughness.width);
    expect(result.normal.height).toBe(result.roughness.height);
    expect(result.width).toBe(48);
    expect(result.height).toBe(32);
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });
});
