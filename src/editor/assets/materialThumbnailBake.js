/**
 * Bake material Asset Viewer thumbs in-browser with the same studio IBL /
 * lighting as MaterialPreviewCanvas. CPU sphere bake cannot match metal/glass.
 */
import * as THREE from 'three';
import { createThreeMaterial, assetUrl } from '../../runtime/materialFactory.js';
import { disposeOwnedMaterial } from '../../runtime/gpuResources.js';
import { installStudioEnvironment } from '../../runtime/studioEnvironment.js';
import { MESH_THUMB_SIZE } from './meshThumbnailBake.js';

export const MATERIAL_THUMB_SIZE = MESH_THUMB_SIZE;

const pendingIds = new Set();
let queue = Promise.resolve();

/**
 * @param {object} definition normalized material definition
 * @param {(assetId: string) => string|null} [getTextureUrl]
 * @param {{ size?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function bakeMaterialThumbnailBlob(definition, getTextureUrl = null, { size = MATERIAL_THUMB_SIZE } = {}) {
  if (!definition) throw new Error('Missing material definition for thumbnail');
  if (typeof document === 'undefined') {
    throw new Error('Material thumbnails require a browser WebGL context');
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12161d);
  const studioEnv = installStudioEnvironment(renderer, scene, { intensity: 0.85 });

  const sphereRadius = 0.55;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
  // Same look angle as the detail preview, but pulled in so the sphere fills the
  // square like the old CPU thumbs (detail preview keeps looser framing + ground).
  const viewDir = new THREE.Vector3(1.55, 0.85, 1.85).normalize();
  const fill = 0.92;
  const dist = sphereRadius / (fill * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.copy(viewDir.multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  scene.add(new THREE.AmbientLight(0xb8c4d8, 0.22));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.55);
  key.position.set(2.4, 3.2, 2.0);
  scene.add(key);
  const fillLight = new THREE.DirectionalLight(0x8aa0c0, 0.4);
  fillLight.position.set(-2.2, 1.4, -1.8);
  scene.add(fillLight);
  const rim = new THREE.DirectionalLight(0xd0e0ff, 0.35);
  rim.position.set(0.2, 1.0, -2.5);
  scene.add(rim);

  let mat = null;
  const geometry = new THREE.SphereGeometry(sphereRadius, 64, 48);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x888888 }));
  scene.add(mesh);

  try {
    const resolver = (assetId) => {
      if (!assetId || typeof getTextureUrl !== 'function') return null;
      return assetUrl(getTextureUrl(assetId));
    };
    mat = await createThreeMaterial(definition, resolver);
    mesh.material = mat;

    // Let GPU texture uploads settle one frame when maps are present.
    renderer.render(scene, camera);
    await new Promise((r) => requestAnimationFrame(() => r()));
    renderer.render(scene, camera);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed for material thumbnail'))),
        'image/png',
      );
    });
    return blob;
  } finally {
    mesh.geometry.dispose();
    if (mat) disposeOwnedMaterial(mat);
    else disposeOwnedMaterial(mesh.material);
    studioEnv?.dispose?.();
    scene.environment = null;
    renderer.dispose();
  }
}

/** True when Asset Viewer should replace the thumb with a WebGL studio bake. */
export function needsBrowserMaterialThumb(entry) {
  if (!entry?.id || entry.kind !== 'material') return false;
  if (!entry.meta?.previewPath) return true;
  // CPU / script bakes lack studio IBL; older WebGL thumbs may be loose-framed or include ground.
  return entry.meta?.previewRenderer !== 'webgl'
    || entry.meta?.previewStyle !== 'sphere-fill';
}

/**
 * Serial queue: bake + upload one material preview.
 * @param {object} entry registry material asset
 * @param {object|null} definition
 * @param {(id: string, blob: Blob) => Promise<object>} uploadMaterialPreview
 * @param {(assetId: string) => string|null} getTextureUrl
 * @param {{ force?: boolean }} [opts]
 */
export function enqueueMaterialThumbnailBake(
  entry,
  definition,
  uploadMaterialPreview,
  getTextureUrl,
  { force = false } = {},
) {
  if (!entry?.id || entry.kind !== 'material') return Promise.resolve(null);
  if (!force && !needsBrowserMaterialThumb(entry)) return Promise.resolve(null);
  if (pendingIds.has(entry.id)) return Promise.resolve(null);
  if (!definition) return Promise.resolve(null);

  pendingIds.add(entry.id);
  queue = queue
    .then(async () => {
      const blob = await bakeMaterialThumbnailBlob(definition, getTextureUrl);
      return uploadMaterialPreview(entry.id, blob);
    })
    .catch((err) => {
      console.warn(`[material-thumb] ${entry.id}:`, err?.message || err);
      return null;
    })
    .finally(() => {
      pendingIds.delete(entry.id);
    });
  return queue;
}

/**
 * Enqueue browser rebakes for materials missing a WebGL thumb.
 * @param {object} registry
 * @param {Record<string, object>} materialDefs
 * @param {(id: string, blob: Blob) => Promise<object>} uploadMaterialPreview
 * @param {(assetId: string) => string|null} getTextureUrl
 */
export function enqueueMissingMaterialThumbnails(
  registry,
  materialDefs,
  uploadMaterialPreview,
  getTextureUrl,
) {
  const assets = Array.isArray(registry?.assets) ? registry.assets : [];
  let last = Promise.resolve(null);
  for (const entry of assets) {
    if (!needsBrowserMaterialThumb(entry)) continue;
    const def = materialDefs?.[entry.id];
    if (!def) continue;
    last = enqueueMaterialThumbnailBake(
      entry,
      def,
      uploadMaterialPreview,
      getTextureUrl,
    );
  }
  return last;
}
