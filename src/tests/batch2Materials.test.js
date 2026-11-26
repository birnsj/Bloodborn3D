import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {
  createMaterialDefinition,
  normalizeMaterialDefinition,
  serializeAttenuationDistance,
  MATERIAL_SHADING_MODELS,
} from '../materials/MaterialDefinition.js';
import { createThreeMaterial } from '../runtime/materialFactory.js';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftFingerprint,
  materialDraftToSavePayload,
} from '../editor/materials/materialDraft.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Batch 2 — material shading models', () => {
  it('defaults legacy assets to standard without changing core PBR look fields', () => {
    const legacy = normalizeMaterialDefinition({
      id: 'mat_legacy',
      name: 'Legacy',
      baseColor: '#cfd6e0',
      roughness: 0.12,
      metalness: 1,
    });
    expect(legacy.shadingModel).toBe('standard');
    expect(legacy.side).toBe('front');
    expect(legacy.depthWrite).toBe(true);
    expect(legacy.clearcoat).toBe(0);
    expect(legacy.transmission).toBe(0);
    expect(legacy.roughness).toBe(0.12);
    expect(legacy.metalness).toBe(1);
  });

  it('normalizes all supported shading models', () => {
    for (const model of MATERIAL_SHADING_MODELS) {
      expect(normalizeMaterialDefinition({ shadingModel: model }).shadingModel).toBe(model);
    }
    expect(normalizeMaterialDefinition({ shadingModel: 'nope' }).shadingModel).toBe('standard');
  });

  it('round-trips attenuationDistance through JSON-safe null', () => {
    const glass = createMaterialDefinition({
      shadingModel: 'physical',
      transmission: 1,
      attenuationDistance: Infinity,
    });
    expect(glass.attenuationDistance).toBe(Infinity);
    expect(serializeAttenuationDistance(glass.attenuationDistance)).toBeNull();

    const payload = materialDraftToSavePayload(glass);
    expect(payload.attenuationDistance).toBeNull();
    const restored = normalizeMaterialDefinition(JSON.parse(JSON.stringify(payload)));
    expect(restored.attenuationDistance).toBe(Infinity);

    const finite = createMaterialDefinition({ attenuationDistance: 2.5 });
    expect(materialDraftToSavePayload(finite).attenuationDistance).toBe(2.5);
  });

  it('keeps draft fingerprints stable across Infinity / null attenuation', () => {
    const a = cloneMaterialDraft(createMaterialDefinition({
      id: 'mat_a',
      attenuationDistance: Infinity,
    }));
    const b = cloneMaterialDraft({
      ...a,
      attenuationDistance: null,
    });
    expect(isMaterialDraftDirty(a, b)).toBe(false);
    expect(materialDraftFingerprint(a)).toBe(materialDraftFingerprint(b));
  });

  it('creates native Three.js materials for each shading model', async () => {
    const resolver = () => null;
    const cases = [
      ['standard', THREE.MeshStandardMaterial],
      ['physical', THREE.MeshPhysicalMaterial],
      ['basic', THREE.MeshBasicMaterial],
      ['toon', THREE.MeshToonMaterial],
      ['matcap', THREE.MeshMatcapMaterial],
    ];
    for (const [model, Ctor] of cases) {
      const mat = await createThreeMaterial(
        createMaterialDefinition({ shadingModel: model, baseColor: '#8899aa' }),
        resolver,
      );
      expect(mat).toBeInstanceOf(Ctor);
      expect(mat.userData.bbShadingModel).toBe(model);
      mat.dispose();
    }
  });

  it('applies physical and surface-flag properties on MeshPhysicalMaterial', async () => {
    const mat = await createThreeMaterial(createMaterialDefinition({
      shadingModel: 'physical',
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      transmission: 0.9,
      thickness: 0.5,
      ior: 1.45,
      sheen: 0.6,
      sheenColor: '#ff00aa',
      specularIntensity: 0.7,
      iridescence: 0.4,
      anisotropy: 0.3,
      anisotropyRotation: 90,
      dispersion: 0.2,
      alphaTest: 0.1,
      alphaHash: true,
      alphaToCoverage: true,
      side: 'double',
      depthWrite: false,
      wireframe: false,
      flatShading: true,
      fog: false,
      toneMapped: false,
    }), () => null);

    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.clearcoat).toBeCloseTo(0.8);
    expect(mat.transmission).toBeCloseTo(0.9);
    expect(mat.ior).toBeCloseTo(1.45);
    expect(mat.sheen).toBeCloseTo(0.6);
    expect(mat.iridescence).toBeCloseTo(0.4);
    expect(mat.anisotropy).toBeCloseTo(0.3);
    expect(mat.anisotropyRotation).toBeCloseTo(Math.PI / 2);
    expect(mat.dispersion).toBeCloseTo(0.2);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.depthWrite).toBe(false);
    expect(mat.flatShading).toBe(true);
    expect(mat.fog).toBe(false);
    expect(mat.toneMapped).toBe(false);
    expect(mat.alphaTest).toBeCloseTo(0.1);
    expect(mat.alphaHash).toBe(true);
    expect(mat.alphaToCoverage).toBe(true);
    mat.dispose();
  });

  it('loads acceptance materials and level round-trip', () => {
    const ids = [
      'mat_batch2_standard',
      'mat_batch2_metal',
      'mat_batch2_glass',
      'mat_batch2_clearcoat',
      'mat_batch2_foliage',
      'mat_batch2_basic',
      'mat_batch2_toon',
      'mat_batch2_matcap',
      'mat_batch2_sheen',
    ];
    for (const id of ids) {
      const raw = JSON.parse(readFileSync(path.join(root, `public/assets/materials/${id}.json`), 'utf8'));
      const def = normalizeMaterialDefinition(raw);
      expect(def.id).toBe(id);
      expect(MATERIAL_SHADING_MODELS).toContain(def.shadingModel);
    }

    const level = JSON.parse(
      readFileSync(path.join(root, 'public/levels/acceptance-materials.json'), 'utf8'),
    );
    expect(level.scene.environmentAssetId).toBe('tex_batch1_studio');
    const world = deserializeLevel(level);
    const again = serializeLevel(world);
    expect(again.name).toBe('acceptance-materials');
    const materialIds = again.actors
      .flatMap((a) => a.components || [])
      .map((c) => c.materialId)
      .filter(Boolean);
    expect(materialIds).toEqual(expect.arrayContaining([
      'mat_batch2_glass',
      'mat_batch2_clearcoat',
      'mat_batch2_foliage',
      'mat_batch2_basic',
      'mat_batch2_toon',
      'mat_batch2_matcap',
      'mat_batch1_metal',
      'mat_batch1_rough',
    ]));
  });
});
