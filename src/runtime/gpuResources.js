/**
 * GPU resource ownership helpers.
 *
 * Cached textures / GLTF geometries are marked shared and must not be disposed
 * when an instance mesh is torn down. Instance-owned clones and editor-built
 * geometries dispose normally.
 */

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'matcap',
  'gradientMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularIntensityMap',
  'specularColorMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
];

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

/** Mark material map textures as shared (cached GLB / material library). */
export function markSharedMaterialTextures(mat) {
  if (!mat) return mat;
  for (const key of MAP_KEYS) {
    if (mat[key]) markSharedGpuResource(mat[key]);
  }
  return mat;
}

/** Mark every geometry (and optionally material + maps) under a loaded asset as shared. */
export function markSharedSubtree(root, { materials = true } = {}) {
  if (!root) return root;
  root.traverse?.((obj) => {
    if (obj.geometry) markSharedGpuResource(obj.geometry);
    if (!materials || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      markSharedGpuResource(m);
      markSharedMaterialTextures(m);
    }
  });
  return root;
}

export function disposeOwnedGeometry(geometry, seen) {
  if (!geometry || isSharedGpuResource(geometry)) return;
  if (seen) {
    if (seen.has(geometry)) return;
    seen.add(geometry);
  }
  geometry.dispose?.();
}

export function disposeOwnedMaterial(mat, seen) {
  if (!mat || isSharedGpuResource(mat)) return;
  if (seen) {
    if (seen.has(mat)) return;
    seen.add(mat);
  }
  for (const key of MAP_KEYS) {
    const tex = mat[key];
    if (!tex?.dispose || isSharedGpuResource(tex)) continue;
    if (seen) {
      if (seen.has(tex)) continue;
      seen.add(tex);
    }
    tex.dispose();
  }
  mat.dispose?.();
}

/** Dispose instance-owned GPU resources under an Object3D; skip shared cache assets. */
export function disposeObjectTree(obj) {
  if (!obj) return;
  // Same geometry/material may appear on multiple children — dispose once.
  const seen = new Set();
  if (typeof obj.traverse === 'function') {
    // traverse visits the root as well — do not dispose again afterward.
    obj.traverse((child) => {
      disposeOwnedGeometry(child.geometry, seen);
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => disposeOwnedMaterial(m, seen));
        } else {
          disposeOwnedMaterial(child.material, seen);
        }
      }
    });
    return;
  }
  disposeOwnedGeometry(obj.geometry, seen);
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach((m) => disposeOwnedMaterial(m, seen));
    else disposeOwnedMaterial(obj.material, seen);
  }
}
