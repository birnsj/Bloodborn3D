import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  __testResetAssetRoots,
  __testSetAssetRoots,
  importMeshBuffer,
  saveMeshPreviewPng,
} from '../../vite-plugins/assetFileApi.js';
import { toCatalogAsset } from '../assets/assetCatalog.js';

/** Minimal 1×1 PNG */
function tinyPng() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

/** Minimal valid-looking GLB magic buffer (import only checks extension + non-empty). */
function tinyGlb() {
  const buf = Buffer.alloc(20);
  buf.write('glTF', 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(20, 8);
  return buf;
}

describe('mesh thumbnail save API', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bb-mesh-thumb-'));
    __testSetAssetRoots(tmp);
  });

  afterEach(async () => {
    __testResetAssetRoots();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('writes preview PNG and sets meta.previewPath', async () => {
    const imported = await importMeshBuffer(tinyGlb(), {
      originalName: 'prop.glb',
      name: 'Prop',
    });
    const id = imported.asset.id;
    const result = await saveMeshPreviewPng(id, tinyPng());
    expect(result.previewPath).toBe(`previews/${id}_mesh.png`);
    expect(result.asset.meta.previewPath).toBe(result.previewPath);

    const abs = path.join(tmp, result.previewPath);
    const st = await fs.stat(abs);
    expect(st.size).toBeGreaterThan(0);

    const catalog = toCatalogAsset(result.asset);
    expect(catalog.preview.kind).toBe('image');
    expect(catalog.preview.url).toContain(`${id}_mesh.png`);
  });

  it('rejects non-PNG uploads', async () => {
    const imported = await importMeshBuffer(tinyGlb(), {
      originalName: 'prop.glb',
      name: 'Prop',
    });
    await expect(saveMeshPreviewPng(imported.asset.id, Buffer.from('not-png')))
      .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
});
