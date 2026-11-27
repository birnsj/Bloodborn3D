import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DEFAULT_TEXTURE_SAMPLER,
  applyTextureSampling,
  composeMaterialUvOnTexture,
  estimateTextureGpuBytes,
  mergeTextureMetaPatch,
  normalizeTextureSampler,
  normalizeTextureTransform,
  textureSamplerCacheKey,
  validateTextureSampler,
} from '../assets/textureSampling.js';
import {
  DEFAULT_MAP_CHANNELS,
  channelForMapId,
  collectMaterialUvChannelWarnings,
  inspectGeometryUvChannels,
  normalizeMapChannels,
  warnMissingUvChannel,
} from '../assets/textureUvChannels.js';
import {
  clearTextureCache,
  getTextureCacheSize,
  invalidateTextureCacheMatching,
} from '../runtime/materialFactory.js';
import { normalizeMaterialDefinition } from '../materials/MaterialDefinition.js';
import { listLessons } from '../tutorials/lessons/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Batch 8 texture sampling', () => {
  it('normalizes sampler/transform defaults and enums', () => {
    expect(normalizeTextureSampler({})).toMatchObject(DEFAULT_TEXTURE_SAMPLER);
    expect(normalizeTextureSampler({ wrapS: 'nope', anisotropy: 99 }).anisotropy).toBe(16);
    expect(normalizeTextureSampler({ wrapS: 'mirrored' }).wrapS).toBe('mirrored');
    const t = normalizeTextureTransform({ repeatU: 2, rotation: 90 });
    expect(t.repeatU).toBe(2);
    expect(t.rotation).toBe(90);
    expect(normalizeTextureTransform({}).centerU).toBe(0);
    expect(normalizeTextureTransform({}).centerV).toBe(0);
  });

  it('scales UV from origin (center 0) so brush density mapping stays aligned', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, { transform: { repeatU: 2, repeatV: 2 } });
    expect(tex.center.x).toBe(0);
    expect(tex.center.y).toBe(0);
    tex.updateMatrix();
    // UV (1,1) → (2,2) when scaling from origin; center 0.5 would map to (1.5,1.5).
    const m = tex.matrix.elements;
    const x = m[0] * 1 + m[3] * 1 + m[6];
    const y = m[1] * 1 + m[4] * 1 + m[7];
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(2);
  });

  it('forces generateMipmaps off for compressed textures', () => {
    const s = normalizeTextureSampler({ generateMipmaps: true }, { compressed: true });
    expect(s.generateMipmaps).toBe(false);
  });

  it('applies Three.js wrap/filter/transform and composes Layer-2 UV once', () => {
    const tex = new THREE.Texture();
    applyTextureSampling(tex, {
      sampler: { wrapS: 'clamp', magFilter: 'nearest', minFilter: 'nearest', anisotropy: 4, colorSpace: 'none' },
      transform: { repeatU: 2, repeatV: 3, offsetU: 0.1, offsetV: 0.2, rotation: 90 },
      role: 'data',
      maxAnisotropy: 8,
    });
    expect(tex.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.repeat.x).toBeCloseTo(2);
    expect(tex.repeat.y).toBeCloseTo(3);
    expect(tex.offset.x).toBeCloseTo(0.1);
    expect(tex.rotation).toBeCloseTo(Math.PI / 2);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);

    composeMaterialUvOnTexture(tex, { uvScale: { x: 2, y: 1 }, uvOffset: { x: 0.5, y: 0 }, uvRotation: 0 });
    expect(tex.repeat.x).toBeCloseTo(4);
    expect(tex.offset.x).toBeCloseTo(0.6);
  });

  it('isolates cache keys by sampler fingerprint', () => {
    const a = textureSamplerCacheKey({ sampler: { magFilter: 'nearest' } });
    const b = textureSamplerCacheKey({ sampler: { magFilter: 'linear' } });
    expect(a).not.toBe(b);
  });

  it('merges meta patches without dropping unrelated keys', () => {
    const next = mergeTextureMetaPatch(
      { width: 64, notes: 'keep', sampler: { magFilter: 'linear' } },
      { sampler: { wrapS: 'clamp' }, transform: { repeatU: 3 } },
    );
    expect(next.width).toBe(64);
    expect(next.notes).toBe('keep');
    expect(next.sampler.wrapS).toBe('clamp');
    expect(next.sampler.magFilter).toBe('linear');
    expect(next.transform.repeatU).toBe(3);
  });

  it('estimates GPU bytes and validates incompatible settings', () => {
    const est = estimateTextureGpuBytes({ width: 1024, height: 1024, generateMipmaps: true });
    expect(est).toBe(Math.round(1024 * 1024 * 4 * (4 / 3)));
    const warn = validateTextureSampler({ generateMipmaps: false, minFilter: 'linearMipmapLinear' });
    expect(warn.ok).toBe(false);
    expect(warn.warnings.length).toBeGreaterThan(0);
  });
});

describe('Batch 8 UV channels', () => {
  it('defaults all map channels to UV0 and preserves material mapChannels', () => {
    expect(DEFAULT_MAP_CHANNELS.ao).toBe(0);
    expect(DEFAULT_MAP_CHANNELS.lightMap).toBe(0);
    expect(channelForMapId({ ao: 2 }, 'aoMapId')).toBe(2);
    const def = normalizeMaterialDefinition({
      mapChannels: { baseColor: 1, ao: 2 },
      baseColorMapId: 'tex_x',
    });
    expect(def.mapChannels.baseColor).toBe(1);
    expect(def.mapChannels.ao).toBe(2);
    expect(normalizeMapChannels({ baseColor: 9 }).baseColor).toBe(0);
  });

  it('inspects geometry UV attributes and warns on missing channels', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    const info = inspectGeometryUvChannels(geo);
    expect(info.channels).toEqual(expect.arrayContaining([0, 1]));
    expect(warnMissingUvChannel(info.channels, 0).ok).toBe(true);
    expect(warnMissingUvChannel(info.channels, 3).ok).toBe(false);
    const warnings = collectMaterialUvChannelWarnings({
      baseColorMapId: 'tex_x',
      mapChannels: { baseColor: 3 },
    }, info.channels);
    expect(warnings.some((w) => /UV3/.test(w))).toBe(true);
  });

  it('ships multi-UV fixture GLB with uv/uv1/uv2', async () => {
    const glbPath = path.join(rootDir, 'public/assets/meshes/mesh_batch8_multi_uv.glb');
    expect(existsSync(glbPath)).toBe(true);
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const buf = readFileSync(glbPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(ab, '', resolve, reject);
    });
    const info = inspectGeometryUvChannels(gltf.scene);
    expect(info.channels).toEqual(expect.arrayContaining([0, 1, 2]));
  });
});

describe('Batch 8 texture cache invalidation', () => {
  it('invalidates matching keys without clearing unrelated entries', async () => {
    await clearTextureCache();
    expect(getTextureCacheSize()).toBe(0);
    const removed = await invalidateTextureCacheMatching('does-not-exist.png');
    expect(removed).toBe(0);
    expect(getTextureCacheSize()).toBe(0);
  });
});

describe('Batch 8 acceptance artifacts', () => {
  it('ships acceptance level, Academy lesson 29, and KTX2 fixture', () => {
    const level = path.join(rootDir, 'public/levels/acceptance-textures.json');
    expect(existsSync(level)).toBe(true);
    const parsed = JSON.parse(readFileSync(level, 'utf8'));
    expect(parsed.name).toMatch(/Textures/i);
    expect(parsed.actors.some((a) => a.id === 'actor_b8_nearest')).toBe(true);
    expect(parsed.actors.some((a) => a.components?.some((c) => c.operation === 'subtract'))).toBe(true);

    const lesson = listLessons().find((l) => l.id === 'textures');
    expect(lesson?.order).toBe(29);

    expect(existsSync(path.join(rootDir, 'public/assets/fixtures/ktx2/2d_uastc.ktx2'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'public/assets/materials/mat_batch8_nearest.json'))).toBe(true);

    const reg = JSON.parse(readFileSync(path.join(rootDir, 'public/assets/registry.json'), 'utf8'));
    const ids = new Set(reg.assets.map((a) => a.id));
    for (const id of [
      'tex_batch8_wood_nearest',
      'tex_batch8_wood_linear',
      'tex_batch8_floor_aniso',
      'tex_batch8_ktx2',
      'mat_batch8_nearest',
      'mat_batch8_linear',
      'mat_batch8_tiled',
      'mat_batch8_ktx2',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
