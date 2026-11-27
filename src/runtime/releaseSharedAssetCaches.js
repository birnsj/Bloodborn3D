/**
 * Explicit shared-cache release for soak / test reset protocols (C5 / F8).
 *
 * Process-lifetime texture/mesh/env caches are intentional for interactive
 * editing. Generator / acceptance soaks that need a clean GPU baseline after
 * unloading a level should call this — never on ordinary level switches.
 *
 * Preconditions: no live SceneView actors, MeshPreview, or WorldEnvironment
 * still borrowing the cached GPU objects.
 */
import { clearTextureCache, getTextureCacheSize } from './materialFactory.js';
import { clearMeshCache, getMeshCacheSize } from './meshLoader.js';
import {
  clearEnvironmentMapCache,
  getEnvironmentMapCacheSize,
} from './environmentMapCache.js';

export async function releaseSharedAssetCaches({
  textures = true,
  meshes = true,
  environments = true,
} = {}) {
  const before = {
    textures: getTextureCacheSize(),
    meshes: getMeshCacheSize(),
    environments: getEnvironmentMapCacheSize(),
  };
  if (meshes) clearMeshCache({ dispose: true });
  if (textures) await clearTextureCache();
  if (environments) await clearEnvironmentMapCache({ dispose: true });
  return {
    before,
    after: {
      textures: getTextureCacheSize(),
      meshes: getMeshCacheSize(),
      environments: getEnvironmentMapCacheSize(),
    },
  };
}
