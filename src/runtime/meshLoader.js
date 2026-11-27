import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateMeshScale, metersToEditorSize } from '../assets/assetCatalog.js';
import { createRetryableCache } from './retryableCache.js';
import {
  disposeSharedSubtree,
  markOwnedGpuResource,
  markSharedGpuResource,
  markSharedMaterialTextures,
  markSharedSubtree,
} from './gpuResources.js';
import { configureGltfLoaderCompression } from './gltfCompression.js';

const gltfLoader = new GLTFLoader();
const meshCache = createRetryableCache();
/** url → latest successful load meta (bounds + center) for sync physics peek. */
const meshMetaByUrl = new Map();
/** url → cached glTF scene root for sync collider extraction (Batch 6). */
const meshSceneByUrl = new Map();

let compressionConfigured = null;

function ensureCompressionConfigured(renderer = null) {
  if (!compressionConfigured) {
    compressionConfigured = configureGltfLoaderCompression(gltfLoader, { renderer });
  }
  return compressionConfigured;
}

/**
 * Optional: pass the active WebGLRenderer so KTX2 can detect GPU support.
 */
export function configureMeshLoaderRenderer(renderer) {
  compressionConfigured = null;
  return ensureCompressionConfigured(renderer);
}

/**
 * Load a glTF/GLB asset. Geometry stays in meters (Three.js / Rapier space).
 * Actor transforms convert editor units → meters at the SceneView boundary.
 * No arbitrary rescale is applied.
 * Batch 7: DRACO / Meshopt / KTX2 decode via local /vendor libs.
 */
export function loadGltfScene(url, { renderer = null } = {}) {
  if (!url) return Promise.resolve(null);
  // Failed loads resolve null and are evicted, so a later request retries.
  return meshCache.get(url, () => ensureCompressionConfigured(renderer).then(() => new Promise((resolve) => {
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
          vertices: countVertices(root),
          meshCount: countMeshes(root),
        };
        const validation = validateMeshScale(meta);
        // Geometries/materials stay in the cache — mark shared before cloning out.
        markSharedSubtree(root, { materials: true });
        meshMetaByUrl.set(url, meta);
        meshSceneByUrl.set(url, root);
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
  })));
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
        // Clone materials so per-instance edits cannot mutate the cache, but keep
        // map textures shared — disposing one instance must not free GLB maps.
        const cloneMat = (m) => {
          const owned = markOwnedGpuResource(m.clone());
          markSharedMaterialTextures(owned);
          return owned;
        };
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map(cloneMat);
        } else {
          obj.material = cloneMat(obj.material);
        }
      }
    }
  });
  return { root: clone, meta: loaded.meta, validation: loaded.validation };
}

/**
 * Drop cached GLTF roots. When `dispose` is true (default), frees shared GPU
 * resources on those roots. Only safe when no live actor / preview still
 * references the cached geometries (tests, C5 soak reset after unload).
 */
export function clearMeshCache({ dispose = true } = {}) {
  if (dispose) {
    for (const root of meshSceneByUrl.values()) {
      disposeSharedSubtree(root);
    }
  }
  meshCache.clear();
  meshMetaByUrl.clear();
  meshSceneByUrl.clear();
}

export function getMeshCacheSize() {
  return meshSceneByUrl.size;
}

/**
 * Synchronous peek at cached glTF meta (bounds + center) if already loaded.
 */
export function peekLoadedMeshMeta(url) {
  if (!url) return null;
  return meshMetaByUrl.get(url) || null;
}

/**
 * Synchronous peek at cached glTF scene root if already loaded (Batch 6 collision).
 * Returns null when not cached — callers must fall back to AABB.
 */
export function peekLoadedMeshScene(url) {
  if (!url) return null;
  return meshSceneByUrl.get(url) || null;
}

/** Test / tooling: seed sync meta without a full glTF fetch. */
export function seedLoadedMeshMeta(url, meta) {
  if (!url || !meta) return;
  meshMetaByUrl.set(url, meta);
}

/** Test / tooling: seed cached scene root for sync collider extraction. */
export function seedLoadedMeshScene(url, sceneRoot) {
  if (!url || !sceneRoot) return;
  meshSceneByUrl.set(url, sceneRoot);
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

function countVertices(root) {
  let verts = 0;
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const pos = obj.geometry.attributes?.position;
    if (pos) verts += pos.count;
  });
  return verts;
}

function countMeshes(root) {
  let n = 0;
  root.traverse((obj) => {
    if (obj.isMesh) n += 1;
  });
  return n;
}

export { countTriangles };
