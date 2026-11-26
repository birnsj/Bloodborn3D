import * as THREE from 'three';
import { createRetryableCache } from './retryableCache.js';
import { markOwnedGpuResource, markSharedGpuResource } from './gpuResources.js';
import { normalizeMaterialDefinition, normalizeShadingModel } from '../materials/MaterialDefinition.js';

const textureCache = createRetryableCache();
const loader = new THREE.TextureLoader();

const SIDE_MAP = {
  front: THREE.FrontSide,
  back: THREE.BackSide,
  double: THREE.DoubleSide,
};

/**
 * Configure texture sampling for architectural materials.
 */
export function configureTexture(tex) {
  if (!tex) return tex;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function configureNormalTexture(tex) {
  if (!tex) return tex;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function loadTexture(url, { normal = false } = {}) {
  if (!url) return Promise.resolve(null);
  const key = `${normal ? 'n:' : 'c:'}${url}`;
  return textureCache.get(key, () => new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        const configured = normal ? configureNormalTexture(tex) : configureTexture(tex);
        resolve(markSharedGpuResource(configured));
      },
      undefined,
      () => resolve(null),
    );
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

  // standard (default) — preserves pre-Batch-2 appearance
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
 * mapResolver(assetId) → absolute URL string | null
 */
export async function createThreeMaterial(definition, mapResolver = () => null, options = {}) {
  const def = normalizeMaterialDefinition(definition) || {};
  const model = normalizeShadingModel(def.shadingModel);
  const mat = createMaterialShell(def, options);

  const applyMap = async (assetId, assign, { normal = false } = {}) => {
    if (!assetId) return;
    const url = mapResolver(assetId);
    if (!url) return;
    const tex = await loadTexture(url, { normal });
    if (!tex) return;
    const clone = markOwnedGpuResource(tex.clone());
    clone.needsUpdate = true;
    if (options.maxAnisotropy) {
      clone.anisotropy = options.maxAnisotropy;
    }
    if (def.uvScale) {
      clone.repeat.set(def.uvScale.x || 1, def.uvScale.y || 1);
    }
    if (def.uvOffset) {
      clone.offset.set(def.uvOffset.x || 0, def.uvOffset.y || 0);
    }
    if (def.uvRotation) {
      clone.rotation = (def.uvRotation * Math.PI) / 180;
      clone.center.set(0.5, 0.5);
    }
    assign(clone);
  };

  // Shared albedo / coverage maps
  await applyMap(def.baseColorMapId, (t) => { mat.map = t; });
  await applyMap(def.alphaMapId, (t) => { mat.alphaMap = t; }, { normal: true });
  await applyMap(def.aoMapId, (t) => {
    mat.aoMap = t;
    if ('aoMapIntensity' in mat) mat.aoMapIntensity = def.aoMapIntensity ?? 1;
  }, { normal: true });
  await applyMap(def.lightMapId, (t) => {
    mat.lightMap = t;
    if ('lightMapIntensity' in mat) mat.lightMapIntensity = def.lightMapIntensity ?? 1;
  }, { normal: true });

  if (model === 'matcap') {
    await applyMap(def.matcapMapId, (t) => { mat.matcap = t; });
  }

  if (model === 'toon') {
    await applyMap(def.gradientMapId, (t) => {
      // Gradient maps are typically nearest-filtered 1D / small LUTs.
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      mat.gradientMap = t;
    }, { normal: true });
    await applyMap(def.emissiveMapId, (t) => { mat.emissiveMap = t; });
    await applyMap(def.bumpMapId, (t) => {
      mat.bumpMap = t;
      mat.bumpScale = def.bumpScale ?? 1;
    }, { normal: true });
    await applyMap(def.normalMapId, (t) => { mat.normalMap = t; }, { normal: true });
    await applyMap(def.displacementMapId, (t) => {
      mat.displacementMap = t;
      mat.displacementScale = def.displacementScale ?? 1;
      mat.displacementBias = def.displacementBias ?? 0;
    }, { normal: true });
  }

  if (model === 'standard' || model === 'physical') {
    await applyMap(def.normalMapId, (t) => { mat.normalMap = t; }, { normal: true });
    await applyMap(def.roughnessMapId, (t) => { mat.roughnessMap = t; }, { normal: true });
    await applyMap(def.metalnessMapId, (t) => { mat.metalnessMap = t; }, { normal: true });
    await applyMap(def.emissiveMapId, (t) => { mat.emissiveMap = t; });
    await applyMap(def.bumpMapId, (t) => {
      mat.bumpMap = t;
      mat.bumpScale = def.bumpScale ?? 1;
    }, { normal: true });
    await applyMap(def.displacementMapId, (t) => {
      mat.displacementMap = t;
      mat.displacementScale = def.displacementScale ?? 1;
      mat.displacementBias = def.displacementBias ?? 0;
    }, { normal: true });
  }

  if (model === 'physical') {
    await applyMap(def.clearcoatMapId, (t) => { mat.clearcoatMap = t; }, { normal: true });
    await applyMap(def.clearcoatNormalMapId, (t) => { mat.clearcoatNormalMap = t; }, { normal: true });
    await applyMap(def.clearcoatRoughnessMapId, (t) => { mat.clearcoatRoughnessMap = t; }, { normal: true });
    await applyMap(def.transmissionMapId, (t) => { mat.transmissionMap = t; }, { normal: true });
    await applyMap(def.thicknessMapId, (t) => { mat.thicknessMap = t; }, { normal: true });
    await applyMap(def.sheenColorMapId, (t) => { mat.sheenColorMap = t; });
    await applyMap(def.sheenRoughnessMapId, (t) => { mat.sheenRoughnessMap = t; }, { normal: true });
    await applyMap(def.specularIntensityMapId, (t) => { mat.specularIntensityMap = t; }, { normal: true });
    await applyMap(def.specularColorMapId, (t) => { mat.specularColorMap = t; });
    await applyMap(def.iridescenceMapId, (t) => { mat.iridescenceMap = t; }, { normal: true });
    await applyMap(def.iridescenceThicknessMapId, (t) => { mat.iridescenceThicknessMap = t; }, { normal: true });
    await applyMap(def.anisotropyMapId, (t) => { mat.anisotropyMap = t; }, { normal: true });
  }

  if (model === 'basic') {
    // MeshBasicMaterial supports envMap via scene; reflectivity already set.
  }

  mat.userData.bbShadingModel = model;
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
