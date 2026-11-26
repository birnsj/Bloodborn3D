import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  __testResetAssetRoots,
  __testSetAssetRoots,
  bakeMissingMaterialPreviews,
  createMaterialAssetFromDefinition,
} from '../../vite-plugins/assetFileApi.js';
import { toCatalogAsset } from '../assets/assetCatalog.js';
import {
  bakeAndWriteMaterialSpherePreview,
  decodePngRgba,
} from '../../scripts/lib/materialSphereBake.mjs';

describe('material sphere preview bake', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-mat-preview-'));
    __testSetAssetRoots(tmp);
  });

  afterEach(async () => {
    __testResetAssetRoots();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('create-material bakes a sphere PNG and sets previewPath', async () => {
    const result = await createMaterialAssetFromDefinition({
      name: 'Auto Sphere',
      baseColor: '#c04040',
      roughness: 0.4,
      metalness: 0.1,
    });
    expect(result.definition.previewPath).toMatch(/^previews\/.+_sphere\.png$/);
    expect(result.asset.meta.previewPath).toBe(result.definition.previewPath);

    const abs = path.join(tmp, result.definition.previewPath);
    const st = await fs.stat(abs);
    expect(st.size).toBeGreaterThan(0);

    const catalog = toCatalogAsset(result.asset, result.definition);
    expect(catalog.preview.kind).toBe('image');
    expect(catalog.preview.url).toContain('_sphere.png');
  });

  it('bake-missing backfills materials that still use the swatch fallback', async () => {
    const created = await createMaterialAssetFromDefinition({
      name: 'Seeded No Preview',
      baseColor: '#2e6e34',
    });
    // Simulate a seeded asset written without a preview.
    const matPath = path.join(tmp, created.asset.path);
    const def = JSON.parse(await fs.readFile(matPath, 'utf8'));
    delete def.previewPath;
    await fs.writeFile(matPath, `${JSON.stringify(def, null, 2)}\n`);
    const previewAbs = path.join(tmp, created.definition.previewPath);
    await fs.rm(previewAbs, { force: true });

    // Clear meta.previewPath in registry via a second bake-missing call after tampering.
    // create already wrote registry with previewPath — strip it to mimic Batch seed entries.
    const registryPath = path.join(tmp, 'registry.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    const entry = registry.assets.find((a) => a.id === created.asset.id);
    delete entry.meta.previewPath;
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const result = await bakeMissingMaterialPreviews();
    expect(result.baked).toBeGreaterThanOrEqual(1);
    expect(result.definitions[created.asset.id]?.previewPath).toMatch(/_sphere\.png$/);

    const restored = JSON.parse(await fs.readFile(matPath, 'utf8'));
    expect(restored.previewPath).toMatch(/_sphere\.png$/);
    const st = await fs.stat(path.join(tmp, restored.previewPath));
    expect(st.size).toBeGreaterThan(0);
  });

  it('glass / clearcoat / toon previews are visually distinct from flat albedo', () => {
    const dir = path.join(tmp, 'cue');
    const resolve = () => null;
    const bake = (definition, name) => {
      const previewAbsPath = path.join(dir, `${name}.png`);
      bakeAndWriteMaterialSpherePreview({ definition, resolveTexturePath: resolve, previewAbsPath });
      return decodePngRgba(previewAbsPath);
    };

    const matte = bake({
      id: 'matte',
      baseColor: '#1a3a8a',
      roughness: 0.85,
      metalness: 0,
      shadingModel: 'standard',
    }, 'matte');
    const clearcoat = bake({
      id: 'coat',
      baseColor: '#1a3a8a',
      roughness: 0.35,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      shadingModel: 'physical',
    }, 'coat');
    const glass = bake({
      id: 'glass',
      baseColor: '#cfe8ff',
      roughness: 0.05,
      metalness: 0,
      transmission: 1,
      transparent: true,
      opacity: 1,
      attenuationColor: '#a8d4ff',
      shadingModel: 'physical',
    }, 'glass');
    const toon = bake({
      id: 'toon',
      baseColor: '#6aa8ff',
      shadingModel: 'toon',
    }, 'toon');

    const stats = (img) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let peak = 0;
      let n = 0;
      for (let i = 0; i < img.rgba.length; i += 4) {
        const sum = img.rgba[i] + img.rgba[i + 1] + img.rgba[i + 2];
        // Sphere pixels only (skip charcoal backdrop ~[18,20,24]).
        if (sum < 80) continue;
        r += img.rgba[i];
        g += img.rgba[i + 1];
        b += img.rgba[i + 2];
        peak = Math.max(peak, sum);
        n += 1;
      }
      return {
        mean: n ? [r / n, g / n, b / n] : [0, 0, 0],
        peak,
      };
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    const matteS = stats(matte);
    const coatS = stats(clearcoat);
    const glassS = stats(glass);
    const toonS = stats(toon);

    // Clearcoat adds a hotter specular peak vs matte of the same base color.
    expect(coatS.peak - matteS.peak).toBeGreaterThan(40);
    expect(dist(matteS.mean, glassS.mean)).toBeGreaterThan(20);
    expect(dist(matteS.mean, toonS.mean)).toBeGreaterThan(20);
  });
});
