import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateMeshScale, metersToEditorSize } from '../assets/assetCatalog.js';
import { createRetryableCache } from './retryableCache.js';
import { markOwnedGpuResource, markSharedGpuResource, markSharedSubtree } from './gpuResources.js';

const gltfLoader = new GLTFLoader();
const meshCache = createRetryableCache();
/** url → latest successful load meta (bounds + center) for sync physics peek. */
const meshMetaByUrl = new Map();

/**
 * Load a glTF/GLB asset. Geometry stays in meters (Three.js / Rapier space).
 * Actor transforms convert editor units → meters at the SceneView boundary.
 * No arbitrary rescale is applied.
 */
export function loadGltfScene(url) {
  if (!url) return Promise.resolve(null);
  // Failed loads resolve null and are evicted, so a later request retries.
  return meshCache.get(url, () => new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) {
          resolve(null);
          return;
        }
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const meta = {
          unitAssumption: 'meters',
          editorUnitsPerMeter: 100,
          boundingBoxMeters: { x: size.x, y: size.y, z: size.z },
          // Local AABB center relative to the glTF root (may be off-origin).
          boundingBoxCenterMeters: { x: center.x, y: center.y, z: center.z },
          boundingBoxEditor: metersToEditorSize({ x: size.x, y: size.y, z: size.z }),
          triangles: countTriangles(root),
        };
        const validation = validateMeshScale(meta);
        // Geometries/materials stay in the cache — mark shared before cloning out.
        markSharedSubtree(root, { materials: true });
        meshMetaByUrl.set(url, meta);
        resolve({
          scene: root,
          animations: gltf.animations || [],
          meta,
          validation,
        });
      },
      undefined,
      () => resolve(null),
    );
  }));
}

export async function cloneLoadedMesh(url) {
  const loaded = await loadGltfScene(url);
  if (!loaded?.scene) return null;
  const clone = loaded.scene.clone(true);
  clone.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Geometry remains shared with the cache; never dispose on instance teardown.
      if (obj.geometry) markSharedGpuResource(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => markOwnedGpuResource(m.clone()));
        } else {
          obj.material = markOwnedGpuResource(obj.material.clone());
        }
      }
    }
  });
  return { root: clone, meta: loaded.meta, validation: loaded.validation };
}

export function clearMeshCache() {
  meshCache.clear();
  meshMetaByUrl.clear();
}

/**
 * Synchronous peek at cached glTF meta (bounds + center) if already loaded.
 */
export function peekLoadedMeshMeta(url) {
  if (!url) return null;
  return meshMetaByUrl.get(url) || null;
}

/** Test / tooling: seed sync meta without a full glTF fetch. */
export function seedLoadedMeshMeta(url, meta) {
  if (!url || !meta) return;
  meshMetaByUrl.set(url, meta);
}

function countTriangles(root) {
  let tris = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const index = obj.geometry.index;
    if (index) tris += index.count / 3;
    else {
      const pos = obj.geometry.attributes.position;
      if (pos) tris += pos.count / 3;
    }
  });
  return Math.round(tris);
}
