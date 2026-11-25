/**
 * GPU resource ownership helpers.
 *
 * Cached textures / GLTF geometries are marked shared and must not be disposed
 * when an instance mesh is torn down. Instance-owned clones and editor-built
 * geometries dispose normally.
 */

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'];

export function markSharedGpuResource(resource) {
  if (!resource) return resource;
  if (!resource.userData) resource.userData = {};
  resource.userData.bbShared = true;
  return resource;
}

export function markOwnedGpuResource(resource) {
  if (!resource) return resource;
  if (!resource.userData) resource.userData = {};
  resource.userData.bbShared = false;
  return resource;
}

export function isSharedGpuResource(resource) {
  return Boolean(resource?.userData?.bbShared);
}

/** Mark every geometry (and optionally material) under a loaded asset as shared. */
export function markSharedSubtree(root, { materials = true } = {}) {
  if (!root) return root;
  root.traverse?.((obj) => {
    if (obj.geometry) markSharedGpuResource(obj.geometry);
    if (!materials || !obj.material) return;
    if (Array.isArray(obj.material)) obj.material.forEach((m) => markSharedGpuResource(m));
    else markSharedGpuResource(obj.material);
  });
  return root;
}

export function disposeOwnedGeometry(geometry) {
  if (!geometry || isSharedGpuResource(geometry)) return;
  geometry.dispose?.();
}

export function disposeOwnedMaterial(mat) {
  if (!mat || isSharedGpuResource(mat)) return;
  for (const key of MAP_KEYS) {
    const tex = mat[key];
    if (tex?.dispose && !isSharedGpuResource(tex)) tex.dispose();
  }
  mat.dispose?.();
}

/** Dispose instance-owned GPU resources under an Object3D; skip shared cache assets. */
export function disposeObjectTree(obj) {
  if (!obj) return;
  if (typeof obj.traverse === 'function') {
    // traverse visits the root as well — do not dispose again afterward.
    obj.traverse((child) => {
      disposeOwnedGeometry(child.geometry);
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => disposeOwnedMaterial(m));
        else disposeOwnedMaterial(child.material);
      }
    });
    return;
  }
  disposeOwnedGeometry(obj.geometry);
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach((m) => disposeOwnedMaterial(m));
    else disposeOwnedMaterial(obj.material);
  }
}
