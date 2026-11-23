import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateMeshScale, metersToEditorSize } from '../assets/assetCatalog.js';

const gltfLoader = new GLTFLoader();
const meshCache = new Map();

/**
 * Load a glTF/GLB asset. Geometry stays in meters (Three.js / Rapier space).
 * Actor transforms convert editor units → meters at the SceneView boundary.
 * No arbitrary rescale is applied.
 */
export function loadGltfScene(url) {
  if (!url) return Promise.resolve(null);
  if (meshCache.has(url)) return meshCache.get(url);

  const promise = new Promise((resolve) => {
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
        box.getSize(size);
        const meta = {
          unitAssumption: 'meters',
          editorUnitsPerMeter: 100,
          boundingBoxMeters: { x: size.x, y: size.y, z: size.z },
          boundingBoxEditor: metersToEditorSize({ x: size.x, y: size.y, z: size.z }),
          triangles: countTriangles(root),
        };
        const validation = validateMeshScale(meta);
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
  });

  meshCache.set(url, promise);
  return promise;
}

export async function cloneLoadedMesh(url) {
  const loaded = await loadGltfScene(url);
  if (!loaded?.scene) return null;
  const clone = loaded.scene.clone(true);
  clone.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m) => m.clone());
        } else {
          obj.material = obj.material.clone();
        }
      }
    }
  });
  return { root: clone, meta: loaded.meta, validation: loaded.validation };
}

export function clearMeshCache() {
  meshCache.clear();
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
