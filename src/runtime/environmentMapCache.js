/**
 * Shared HDR/EXR → equirect texture cache + PMREM generation.
 * PMREM targets are owned by callers (WorldEnvironmentController); equirects are shared.
 */

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { createRetryableCache } from './retryableCache.js';
import { markSharedGpuResource } from './gpuResources.js';

const equirectCache = createRetryableCache();
const hdrLoader = new HDRLoader();
const exrLoader = new EXRLoader();

export function isEnvironmentMapPath(pathOrUrl = '') {
  const lower = String(pathOrUrl).toLowerCase();
  return lower.endsWith('.hdr') || lower.endsWith('.exr');
}

export function isEnvironmentMapAsset(entry) {
  if (!entry || entry.kind !== 'texture') return false;
  const format = String(entry.meta?.format || '').toLowerCase();
  if (format === 'hdr' || format === 'exr') return true;
  return isEnvironmentMapPath(entry.path) || isEnvironmentMapPath(entry.originalName);
}

function loadEquirectTexture(url) {
  const lower = String(url).toLowerCase();
  const loader = lower.endsWith('.exr') ? exrLoader : hdrLoader;
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        markSharedGpuResource(texture);
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/** Load (or reuse) an equirect HDR/EXR texture for `url`. */
export function loadEnvironmentEquirect(url) {
  if (!url) return Promise.resolve(null);
  return equirectCache.get(url, () => loadEquirectTexture(url));
}

/**
 * Build a PMREM cube RT from an equirect texture.
 * Caller owns the returned render target (must dispose when replaced).
 */
export function buildPmremFromEquirect(renderer, equirect) {
  if (!renderer || !equirect) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null;
  try {
    target = pmrem.fromEquirectangular(equirect);
  } finally {
    pmrem.dispose();
  }
  // PMREM RT is caller-owned (WorldEnvironmentController.disposePmremTarget).
  // Do not mark the cube texture shared — that contradicted owner dispose (C5).
  return target;
}

export function disposePmremTarget(target) {
  if (!target) return;
  try {
    target.dispose?.();
  } catch {
    /* ignore */
  }
}

/**
 * Drop cached equirect HDR/EXR textures.
 * When `dispose` is true (default), frees the shared GPU textures. Only safe
 * when no WorldEnvironmentController still references them (tests / soak reset).
 */
export async function clearEnvironmentMapCache({ dispose = true } = {}) {
  if (dispose) {
    await equirectCache.invalidateWhere((_key, tex) => {
      if (tex?.isTexture) {
        try { tex.dispose?.(); } catch { /* ignore */ }
      }
      return true;
    });
    return;
  }
  equirectCache.clear();
}

export function getEnvironmentMapCacheSize() {
  return equirectCache.size;
}
