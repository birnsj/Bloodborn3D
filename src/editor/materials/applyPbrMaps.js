/**
 * Persist generated normal / roughness maps onto an existing material
 * without resetting UV or unrelated properties.
 */

import {
  imageDataToPngBlob,
} from './pbrGeneration.js';
import { normalizePbrGeneratorMeta } from './pbrGeneratorState.js';

/**
 * @param {object} args
 * @param {object} args.baseline — last saved material definition
 * @param {ImageData} args.normalImage
 * @param {ImageData} args.roughnessImage
 * @param {object} args.session — generator session (tiling + params + prior map ids)
 * @param {(file: File, opts?: object) => Promise<object>} args.importTexture
 * @param {(id: string, file: File) => Promise<object>} args.replaceTexture
 * @param {(id: string, partial: object) => Promise<object>} args.saveMaterialDefinition
 */
export async function applyGeneratedPbrMaps({
  baseline,
  normalImage,
  roughnessImage,
  session,
  importTexture,
  replaceTexture,
  saveMaterialDefinition,
}) {
  if (!baseline?.id) throw new Error('No material to apply PBR maps to');
  if (!baseline.baseColorMapId) throw new Error('Material has no base-color texture');
  if (!normalImage || !roughnessImage) throw new Error('Missing generated maps');

  const matName = baseline.name || baseline.id;
  const normalFile = await imageDataToPngBlob(
    normalImage,
    `${slug(matName)}_normal.png`,
  );
  const roughnessFile = await imageDataToPngBlob(
    roughnessImage,
    `${slug(matName)}_roughness.png`,
  );

  const normalId = await upsertGeneratedTexture({
    existingId: session.generatedNormalMapId,
    file: normalFile,
    name: `${matName} Normal`,
    tags: ['pbr-generated', 'normal', 'non-color'],
    importTexture,
    replaceTexture,
  });
  const roughnessId = await upsertGeneratedTexture({
    existingId: session.generatedRoughnessMapId,
    file: roughnessFile,
    name: `${matName} Roughness`,
    tags: ['pbr-generated', 'roughness', 'non-color'],
    importTexture,
    replaceTexture,
  });

  const pbrGenerator = normalizePbrGeneratorMeta({
    sourceTextureId: baseline.baseColorMapId,
    tileHorizontal: session.tiling?.tileHorizontal !== false,
    tileVertical: Boolean(session.tiling?.tileVertical),
    normal: session.normal,
    roughness: session.roughness,
    generatedNormalMapId: normalId,
    generatedRoughnessMapId: roughnessId,
    updatedAt: Date.now(),
  });

  // Preserve UV scale/offset/rotation and base color exactly.
  // Roughness map stores absolute values → scalar 1 so Three.js does not re-multiply.
  const payload = {
    ...baseline,
    normalMapId: normalId,
    roughnessMapId: roughnessId,
    normalScale: Number.isFinite(Number(baseline.normalScale)) ? baseline.normalScale : 1,
    roughness: 1,
    metalness: 0,
    metalnessMapId: baseline.metalnessMapId || null,
    uvScale: baseline.uvScale,
    uvOffset: baseline.uvOffset,
    uvRotation: baseline.uvRotation,
    pbrGenerator,
    updatedAt: Date.now(),
  };

  const saved = await saveMaterialDefinition(baseline.id, payload);
  return {
    definition: saved,
    normalMapId: normalId,
    roughnessMapId: roughnessId,
    pbrGenerator,
  };
}

async function upsertGeneratedTexture({
  existingId,
  file,
  name,
  tags,
  importTexture,
  replaceTexture,
}) {
  if (existingId && replaceTexture) {
    try {
      await replaceTexture(existingId, file);
      return existingId;
    } catch {
      /* fall through to import */
    }
  }
  const asset = await importTexture(file, {
    name,
    tags,
    select: false,
    notify: false,
  });
  return asset.id;
}

function slug(name) {
  return String(name || 'material')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'material';
}
