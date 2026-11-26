/**
 * Bake a small PNG thumbnail of a glTF/GLB for Asset Viewer tiles.
 * Runs in the browser (WebGL); Node import path has no headless GL.
 */
import * as THREE from 'three';
import { cloneLoadedMesh } from '../../runtime/meshLoader.js';
import { disposeObjectTree } from '../../runtime/gpuResources.js';

export const MESH_THUMB_SIZE = 256;

const pendingIds = new Set();
let queue = Promise.resolve();

/**
 * Render one frame of a mesh to a PNG Blob.
 * @param {string} url
 * @param {{ size?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function bakeMeshThumbnailBlob(url, { size = MESH_THUMB_SIZE } = {}) {
  if (!url) throw new Error('Missing mesh URL for thumbnail');
  if (typeof document === 'undefined') {
    throw new Error('Mesh thumbnails require a browser WebGL context');
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x141820, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141820);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8b8d0, 0.4);
  fill.position.set(-2, 1.5, -2.5);
  scene.add(fill);

  let root = null;
  try {
    const loaded = await cloneLoadedMesh(url);
    if (!loaded?.root) throw new Error('Failed to load mesh for thumbnail');
    root = loaded.root;
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    const sizeVec = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(sizeVec);
    box.getCenter(center);
    root.position.sub(center);

    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 0.001);
    const dist = maxDim * 2.35;
    camera.position.set(dist * 0.85, dist * 0.55, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed for mesh thumbnail'))),
        'image/png',
      );
    });
    return blob;
  } finally {
    if (root) {
      scene.remove(root);
      disposeObjectTree(root);
    }
    renderer.dispose();
  }
}

/**
 * Serial queue: bake + upload one mesh preview. Skips if already in-flight or has previewPath.
 * @param {object} entry registry mesh asset
 * @param {(id: string, blob: Blob) => Promise<{ asset?: object, registry?: object }>} uploadMeshPreview
 * @param {(rel: string) => string|null} resolvePublicUrl
 */
export function enqueueMeshThumbnailBake(entry, uploadMeshPreview, resolvePublicUrl) {
  if (!entry?.id || entry.kind !== 'mesh') return Promise.resolve(null);
  if (entry.meta?.previewPath) return Promise.resolve(null);
  if (pendingIds.has(entry.id)) return Promise.resolve(null);

  pendingIds.add(entry.id);
  queue = queue
    .then(async () => {
      if (entry.meta?.previewPath) return null;
      const url = resolvePublicUrl(entry.path);
      if (!url) return null;
      const blob = await bakeMeshThumbnailBlob(url);
      return uploadMeshPreview(entry.id, blob);
    })
    .catch((err) => {
      // Non-fatal — keep the glyph thumb; next refresh can retry.
      console.warn(`[mesh-thumb] ${entry.id}:`, err?.message || err);
      return null;
    })
    .finally(() => {
      pendingIds.delete(entry.id);
    });
  return queue;
}

/** Enqueue bakes for every mesh missing previewPath. */
export function enqueueMissingMeshThumbnails(registry, uploadMeshPreview, resolvePublicUrl) {
  const assets = Array.isArray(registry?.assets) ? registry.assets : [];
  let last = Promise.resolve(null);
  for (const entry of assets) {
    if (entry?.kind !== 'mesh' || entry.meta?.previewPath) continue;
    last = enqueueMeshThumbnailBake(entry, uploadMeshPreview, resolvePublicUrl);
  }
  return last;
}
