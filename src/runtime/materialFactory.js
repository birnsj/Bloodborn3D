import * as THREE from 'three';
import { createRetryableCache } from './retryableCache.js';
import { markOwnedGpuResource, markSharedGpuResource } from './gpuResources.js';

const textureCache = createRetryableCache();
const loader = new THREE.TextureLoader();

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
  // Failed loads resolve null and are evicted, so a later request retries.
  return textureCache.get(key, () => new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        const configured = normal ? configureNormalTexture(tex) : configureTexture(tex);
        // Cache entry is shared across materials — instances must clone first.
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

/**
 * Resolve asset path from registry entry or absolute/relative URL.
 */
export function assetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/') || path.startsWith('blob:')) return path;
  return `/assets/${path.replace(/^assets\//, '')}`;
}

/**
 * Build a Three.js MeshStandardMaterial from an engine-neutral material definition.
 * mapResolver(assetId) → absolute URL string | null
 */
export async function createThreeMaterial(definition, mapResolver = () => null, options = {}) {
  const def = definition || {};
  const normalScale = Number.isFinite(Number(def.normalScale)) ? Number(def.normalScale) : 1;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.baseColor || '#8a9099'),
    roughness: def.roughness ?? 0.75,
    metalness: def.metalness ?? 0.05,
    emissive: new THREE.Color(def.emissive || '#000000'),
    emissiveIntensity: def.emissiveIntensity ?? 0,
    envMapIntensity: Number.isFinite(Number(def.envMapIntensity)) ? Number(def.envMapIntensity) : 1,
    transparent: Boolean(def.transparent) || (def.opacity != null && def.opacity < 1),
    opacity: def.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
  mat.normalScale.set(normalScale, normalScale);

  const applyMap = async (assetId, assign, { normal = false } = {}) => {
    if (!assetId) return;
    const url = mapResolver(assetId);
    if (!url) return;
    const tex = await loadTexture(url, { normal });
    if (!tex) return;
    // Clone so UV transforms can differ per brush instance; clone is instance-owned.
    const clone = markOwnedGpuResource(tex.clone());
    clone.needsUpdate = true;
    if (options.maxAnisotropy) {
      clone.anisotropy = options.maxAnisotropy;
    }
    // Layer 2 — material UV (Phase 2E.0). Composes with geometry/actor UVs already
    // written into the mesh attribute. Identity defaults leave authored looks unchanged.
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

  await applyMap(def.baseColorMapId, (t) => { mat.map = t; });
  await applyMap(def.normalMapId, (t) => { mat.normalMap = t; }, { normal: true });
  await applyMap(def.roughnessMapId, (t) => { mat.roughnessMap = t; }, { normal: true });
  await applyMap(def.metalnessMapId, (t) => { mat.metalnessMap = t; }, { normal: true });
  await applyMap(def.emissiveMapId, (t) => { mat.emissiveMap = t; });

  mat.needsUpdate = true;
  return mat;
}

/** Fallback when no material is assigned — preserves legacy brush color look. */
export function createFallbackBrushMaterial(color = '#8a9099', { editMode = false } = {}) {
  // No emissive boost — World ambient / authored lights own visibility.
  // (Previously editMode used emissive so brushes stayed visible in the dark,
  // which made World Ambient → black look broken.)
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
