/**
 * Backfill lit sphere previews for materials missing previewPath.
 * Usage: node scripts/bakeMaterialPreviews.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakeAndWriteMaterialSpherePreview,
  previewAbsPathForMaterial,
  previewRelPathForMaterial,
} from './lib/materialSphereBake.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'public/assets');
const registryPath = join(assetsDir, 'registry.json');

const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const textures = new Map(
  (registry.assets || [])
    .filter((a) => a.kind === 'texture')
    .map((a) => [a.id, a]),
);

let baked = 0;
let skipped = 0;
let failed = 0;

for (const entry of registry.assets || []) {
  if (entry.kind !== 'material') continue;
  const matPath = join(assetsDir, entry.path);
  const definition = JSON.parse(readFileSync(matPath, 'utf8'));
  const hasPreview = Boolean(definition.previewPath || entry.meta?.previewPath);
  if (hasPreview) {
    skipped += 1;
    continue;
  }

  try {
    const { previewPath } = bakeAndWriteMaterialSpherePreview({
      definition,
      resolveTexturePath: (texId) => {
        const tex = textures.get(texId);
        return tex?.path ? join(assetsDir, tex.path) : null;
      },
      previewAbsPath: previewAbsPathForMaterial(assetsDir, definition.id),
    });
    definition.previewPath = previewPath;
    definition.updatedAt = Date.now();
    writeFileSync(matPath, `${JSON.stringify(definition, null, 2)}\n`);
    entry.meta = {
      ...(entry.meta || {}),
      baseColor: definition.baseColor,
      roughness: definition.roughness,
      metalness: definition.metalness,
      hasBaseMap: Boolean(definition.baseColorMapId),
      previewPath: previewRelPathForMaterial(definition.id),
    };
    entry.updatedAt = definition.updatedAt;
    baked += 1;
    console.log(`baked ${definition.id} (${definition.name})`);
  } catch (err) {
    failed += 1;
    console.error(`failed ${entry.id}:`, err.message);
  }
}

writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`done: baked=${baked} skipped=${skipped} failed=${failed}`);
