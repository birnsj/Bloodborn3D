import * as THREE from 'three';
import { createRetryableCache } from './retryableCache.js';
import { markOwnedGpuResource, markSharedGpuResource } from './gpuResources.js';
import { normalizeMaterialDefinition, normalizeShadingModel } from '../materials/MaterialDefinition.js';
import {
  applyTextureSampling,
  composeMaterialUvOnTexture,
  isCompressedTextureMeta,
  isCompressedTexturePath,
  textureSamplerCacheKey,
  normalizeTextureSampler,
  normalizeTextureTransform,
} from '../assets/textureSampling.js';
import { channelForMapId, normalizeMapChannels } from '../assets/textureUvChannels.js';

const textureCache = createRetryableCache();
const loader = new THREE.TextureLoader();
/** @type {import('three/addons/loaders/KTX2Loader.js').KTX2Loader | null} */
let ktx2Loader = null;
let ktx2Init = null;

const SIDE_MAP = {
  front: THREE.FrontSide,
  back: THREE.BackSide,
  double: THREE.DoubleSide,
};

/** Map roles that must use non-color data color space when sampler.colorSpace === 'auto'. */
const DATA_MAP_FIELDS = new Set([
  'normalMapId',
  'roughnessMapId',
  'metalnessMapId',
  'aoMapId',
  'bumpMapId',
  'displacementMapId',
  'alphaMapId',
  'lightMapId',
  'clearcoatMapId',
  'clearcoatNormalMapId',
  'clearcoatRoughnessMapId',
  'transmissionMapId',
  'thicknessMapId',
  'sheenRoughnessMapId',
  'specularIntensityMapId',
  'iridescenceMapId',
  'iridescenceThicknessMapId',
  'anisotropyMapId',
  'gradientMapId',
]);

/**
 * @deprecated Prefer applyTextureSampling via loadTexture options.
 * Kept for callers that expect the old fixed architectural defaults.
 */
export function configureTexture(tex) {
  return applyTextureSampling(tex, {
    role: 'color',
    sampler: normalizeTextureSampler({}),
    transform: normalizeTextureTransform({}),
  });
}

export function configureNormalTexture(tex) {
  return applyTextureSampling(tex, {
    role: 'data',
    sampler: normalizeTextureSampler({ colorSpace: 'none' }),
    transform: normalizeTextureTransform({}),
  });
}

async function ensureKtx2Loader(renderer = null) {
  if (ktx2Loader) return ktx2Loader;
  if (!ktx2Init) {
    ktx2Init = (async () => {
      const { getKtx2Loader } = await import('./gltfCompression.js');
      ktx2Loader = getKtx2Loader(renderer);
      return ktx2Loader;
    })();
  }
  return ktx2Init;
}

/**
 * Resolve mapResolver return value to { url, meta }.
 * Supports legacy string URLs and richer { url, meta, path } objects.
 */
export function resolveMapSource(mapResolver, assetId) {
  if (!assetId || typeof mapResolver !== 'function') return null;
  const raw = mapResolver(assetId);
  if (!raw) return null;
  if (typeof raw === 'string') return { url: raw, meta: {}, path: raw };
  if (typeof raw === 'object' && raw.url) {
    return {
      url: raw.url,
      meta: raw.meta || {},
      path: raw.path || raw.url,
      format: raw.format,
    };
  }
  return null;
}

/**
 * Load a shared GPU texture. Cache key includes sampler fingerprint so identical
 * settings reuse one upload; divergent settings get separate shared instances.
 */
export function loadTexture(url, options = {}) {
  if (!url) return Promise.resolve(null);
  const meta = options.meta || {};
  const role = options.role || (options.normal ? 'data' : 'color');
  const compressed = Boolean(options.compressed)
    || isCompressedTexturePath(url)
    || isCompressedTextureMeta(meta);
  const key = `${role}:${url}:${textureSamplerCacheKey(meta)}:${compressed ? 'c' : 'u'}`;

  return textureCache.get(key, () => new Promise((resolve) => {
    const finish = (tex) => {
      if (!tex) {
        resolve(null);
        return;
      }
      applyTextureSampling(tex, {
        sampler: meta.sampler,
        transform: meta.transform,
        role,
        maxAnisotropy: options.maxAnisotropy,
        compressed: compressed || tex.isCompressedTexture,
      });
      resolve(markSharedGpuResource(tex));
    };

    if (compressed || isCompressedTexturePath(url)) {
      ensureKtx2Loader(options.renderer || null)
        .then((ktx2) => {
          if (!ktx2?.load) {
            finish(null);
            return;
          }
          ktx2.load(url, finish, undefined, () => finish(null));
        })
        .catch(() => finish(null));
      return;
    }

    loader.load(url, finish, undefined, () => finish(null));
  }));
}

export function clearTextureCache() {
  textureCache.clear();
}

export function assetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/') || path.startsWith('blob:')) return path;
  return `/assets/${path.replace(/^assets\//, '')}`;
}

function applyCommonMaterialFlags(mat, def, options = {}) {
  mat.transparent = Boolean(def.transparent) || (def.opacity != null && def.opacity < 1);
  mat.opacity = def.opacity ?? 1;
  mat.side = options.side ?? SIDE_MAP[def.side] ?? THREE.FrontSide;
  mat.depthWrite = def.depthWrite !== false;
  mat.wireframe = Boolean(def.wireframe);
  mat.flatShading = Boolean(def.flatShading);
  mat.fog = def.fog !== false;
  mat.toneMapped = def.toneMapped !== false;
  const alphaTest = Number(def.alphaTest) || 0;
  mat.alphaTest = alphaTest;
  if ('alphaHash' in mat) {
    mat.alphaHash = Boolean(def.alphaHash);
  }
  if ('alphaToCoverage' in mat) {
    mat.alphaToCoverage = Boolean(def.alphaToCoverage);
  }
}

function createMaterialShell(def, options = {}) {
  const model = normalizeShadingModel(def.shadingModel);
  const color = new THREE.Color(def.baseColor || '#8a9099');
  const emissive = new THREE.Color(def.emissive || '#000000');
  const emissiveIntensity = def.emissiveIntensity ?? 0;

  if (model === 'basic') {
    const mat = new THREE.MeshBasicMaterial({
      color,
      reflectivity: def.reflectivity ?? 1,
    });
    applyCommonMaterialFlags(mat, def, options);
    return mat;
  }

  if (model === 'matcap') {
    const mat = new THREE.MeshMatcapMaterial({ color });
    applyCommonMaterialFlags(mat, def, options);
    return mat;
  }

  if (model === 'toon') {
    const mat = new THREE.MeshToonMaterial({
      color,
      emissive,
      emissiveIntensity,
    });
    applyCommonMaterialFlags(mat, def, options);
    return mat;
  }

  if (model === 'physical') {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: def.roughness ?? 0.75,
      metalness: def.metalness ?? 0.05,
      emissive,
      emissiveIntensity,
      envMapIntensity: Number.isFinite(Number(def.envMapIntensity)) ? Number(def.envMapIntensity) : 1,
      clearcoat: def.clearcoat ?? 0,
      clearcoatRoughness: def.clearcoatRoughness ?? 0,
      transmission: def.transmission ?? 0,
      thickness: def.thickness ?? 0,
      attenuationDistance: Number.isFinite(Number(def.attenuationDistance))
        ? Number(def.attenuationDistance)
        : Infinity,
      attenuationColor: new THREE.Color(def.attenuationColor || '#ffffff'),
      ior: def.ior ?? 1.5,
      sheen: def.sheen ?? 0,
      sheenRoughness: def.sheenRoughness ?? 1,
      sheenColor: new THREE.Color(def.sheenColor || '#000000'),
      specularIntensity: def.specularIntensity ?? 1,
      specularColor: new THREE.Color(def.specularColor || '#ffffff'),
      iridescence: def.iridescence ?? 0,
      iridescenceIOR: def.iridescenceIOR ?? 1.3,
      anisotropy: def.anisotropy ?? 0,
      anisotropyRotation: ((Number(def.anisotropyRotation) || 0) * Math.PI) / 180,
      dispersion: def.dispersion ?? 0,
    });
    mat.iridescenceThicknessRange = [
      Number(def.iridescenceThicknessMin) || 100,
      Number(def.iridescenceThicknessMax) || 400,
    ];
    const normalScale = Number.isFinite(Number(def.normalScale)) ? Number(def.normalScale) : 1;
    mat.normalScale.set(normalScale, normalScale);
    const ccScale = Number.isFinite(Number(def.clearcoatNormalScale))
      ? Number(def.clearcoatNormalScale)
      : 1;
    mat.clearcoatNormalScale.set(ccScale, ccScale);
    applyCommonMaterialFlags(mat, def, options);
    return mat;
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: def.roughness ?? 0.75,
    metalness: def.metalness ?? 0.05,
    emissive,
    emissiveIntensity,
    envMapIntensity: Number.isFinite(Number(def.envMapIntensity)) ? Number(def.envMapIntensity) : 1,
  });
  const normalScale = Number.isFinite(Number(def.normalScale)) ? Number(def.normalScale) : 1;
  mat.normalScale.set(normalScale, normalScale);
  applyCommonMaterialFlags(mat, def, options);
  return mat;
}

/**
 * Build a Three.js material from an engine-neutral material definition.
 * mapResolver(assetId) → URL string | { url, meta, path } | null
 */
export async function createThreeMaterial(definition, mapResolver = () => null, options = {}) {
  const def = normalizeMaterialDefinition(definition) || {};
  const model = normalizeShadingModel(def.shadingModel);
  const mat = createMaterialShell(def, options);
  const mapChannels = normalizeMapChannels(def.mapChannels);
  const materialUv = {
    uvScale: def.uvScale,
    uvOffset: def.uvOffset,
    uvRotation: def.uvRotation,
  };

  const applyMap = async (mapIdField, assign, { normal = false } = {}) => {
    const assetId = def[mapIdField];
    if (!assetId) return;
    const source = resolveMapSource(mapResolver, assetId);
    if (!source?.url) return;
    const role = normal || DATA_MAP_FIELDS.has(mapIdField) ? 'data' : 'color';
    const tex = await loadTexture(source.url, {
      meta: source.meta,
      role,
      normal: role === 'data',
      maxAnisotropy: options.maxAnisotropy,
      renderer: options.renderer || null,
      compressed: isCompressedTexturePath(source.path || source.url)
        || isCompressedTextureMeta(source.meta),
    });
    if (!tex) return;
    const clone = markOwnedGpuResource(tex.clone());
    // Re-apply sampling on the owned clone (clone copies image but keep settings explicit).
    applyTextureSampling(clone, {
      sampler: source.meta?.sampler,
      transform: source.meta?.transform,
      role,
      maxAnisotropy: options.maxAnisotropy,
      compressed: clone.isCompressedTexture,
    });
    composeMaterialUvOnTexture(clone, materialUv);
    if (options.maxAnisotropy) {
      clone.anisotropy = Math.min(clone.anisotropy || 1, options.maxAnisotropy);
    }
    const ch = channelForMapId(mapChannels, mapIdField);
    if ('channel' in clone) clone.channel = ch;
    clone.needsUpdate = true;
    assign(clone);
  };

  await applyMap('baseColorMapId', (t) => { mat.map = t; });
  await applyMap('alphaMapId', (t) => { mat.alphaMap = t; }, { normal: true });
  await applyMap('aoMapId', (t) => {
    mat.aoMap = t;
    if ('aoMapIntensity' in mat) mat.aoMapIntensity = def.aoMapIntensity ?? 1;
  }, { normal: true });
  await applyMap('lightMapId', (t) => {
    mat.lightMap = t;
    if ('lightMapIntensity' in mat) mat.lightMapIntensity = def.lightMapIntensity ?? 1;
  }, { normal: true });

  if (model === 'matcap') {
    await applyMap('matcapMapId', (t) => { mat.matcap = t; });
  }

  if (model === 'toon') {
    await applyMap('gradientMapId', (t) => {
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      mat.gradientMap = t;
    }, { normal: true });
    await applyMap('emissiveMapId', (t) => { mat.emissiveMap = t; });
    await applyMap('bumpMapId', (t) => {
      mat.bumpMap = t;
      mat.bumpScale = def.bumpScale ?? 1;
    }, { normal: true });
    await applyMap('normalMapId', (t) => { mat.normalMap = t; }, { normal: true });
    await applyMap('displacementMapId', (t) => {
      mat.displacementMap = t;
      mat.displacementScale = def.displacementScale ?? 1;
      mat.displacementBias = def.displacementBias ?? 0;
    }, { normal: true });
  }

  if (model === 'standard' || model === 'physical') {
    await applyMap('normalMapId', (t) => { mat.normalMap = t; }, { normal: true });
    await applyMap('roughnessMapId', (t) => { mat.roughnessMap = t; }, { normal: true });
    await applyMap('metalnessMapId', (t) => { mat.metalnessMap = t; }, { normal: true });
    await applyMap('emissiveMapId', (t) => { mat.emissiveMap = t; });
    await applyMap('bumpMapId', (t) => {
      mat.bumpMap = t;
      mat.bumpScale = def.bumpScale ?? 1;
    }, { normal: true });
    await applyMap('displacementMapId', (t) => {
      mat.displacementMap = t;
      mat.displacementScale = def.displacementScale ?? 1;
      mat.displacementBias = def.displacementBias ?? 0;
    }, { normal: true });
  }

  if (model === 'physical') {
    await applyMap('clearcoatMapId', (t) => { mat.clearcoatMap = t; }, { normal: true });
    await applyMap('clearcoatNormalMapId', (t) => { mat.clearcoatNormalMap = t; }, { normal: true });
    await applyMap('clearcoatRoughnessMapId', (t) => { mat.clearcoatRoughnessMap = t; }, { normal: true });
    await applyMap('transmissionMapId', (t) => { mat.transmissionMap = t; }, { normal: true });
    await applyMap('thicknessMapId', (t) => { mat.thicknessMap = t; }, { normal: true });
    await applyMap('sheenColorMapId', (t) => { mat.sheenColorMap = t; });
    await applyMap('sheenRoughnessMapId', (t) => { mat.sheenRoughnessMap = t; }, { normal: true });
    await applyMap('specularIntensityMapId', (t) => { mat.specularIntensityMap = t; }, { normal: true });
    await applyMap('specularColorMapId', (t) => { mat.specularColorMap = t; });
    await applyMap('iridescenceMapId', (t) => { mat.iridescenceMap = t; }, { normal: true });
    await applyMap('iridescenceThicknessMapId', (t) => { mat.iridescenceThicknessMap = t; }, { normal: true });
    await applyMap('anisotropyMapId', (t) => { mat.anisotropyMap = t; }, { normal: true });
  }

  mat.userData.bbShadingModel = model;
  mat.userData.bbMapChannels = mapChannels;
  mat.needsUpdate = true;
  return mat;
}

/** Fallback when no material is assigned — preserves legacy brush color look. */
export function createFallbackBrushMaterial(color = '#8a9099', { editMode = false } = {}) {
  void editMode;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.75,
    metalness: 0.05,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
  mat.userData.bbFallbackBrush = true;
  return mat;
}
