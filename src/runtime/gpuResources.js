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

/**
 * Dispose instance-owned GPU resources under an Object3D; skip shared cache assets.
 * @param {object} obj
 * @param {{ geometries?: boolean, materials?: boolean }} [options]
 *   Pass `{ geometries: false }` when tearing down GLB instances whose geometries
 *   must remain in the mesh cache (also enforced by bbShared tagging).
 */
export function disposeObjectTree(obj, { geometries = true, materials = true } = {}) {
  if (!obj) return;
  // Same geometry/material may appear on multiple children — dispose once.
  const seen = new Set();
  const visit = (child) => {
    if (geometries !== false) disposeOwnedGeometry(child.geometry, seen);
    if (materials === false || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material.forEach((m) => disposeOwnedMaterial(m, seen));
    } else {
      disposeOwnedMaterial(child.material, seen);
    }
  };
  if (typeof obj.traverse === 'function') {
    // traverse visits the root as well — do not dispose again afterward.
    obj.traverse(visit);
    return;
  }
  visit(obj);
}

/**
 * Inventory geometries / materials / textures under a root by ownership tag.
 * Used by C5 soak harnesses to separate shared-cache retention (F8) from owned leaks.
 *
 * @returns {{
 *   geometries: { shared: number, owned: number, untagged: number },
 *   materials: { shared: number, owned: number, untagged: number },
 *   textures: { shared: number, owned: number, untagged: number },
 * }}
 */
export function inventoryGpuOwnership(root) {
  const geometries = { shared: 0, owned: 0, untagged: 0 };
  const materials = { shared: 0, owned: 0, untagged: 0 };
  const textures = { shared: 0, owned: 0, untagged: 0 };
  const seenG = new Set();
  const seenM = new Set();
  const seenT = new Set();

  const classify = (resource, bucket, seen) => {
    if (!resource || seen.has(resource)) return;
    seen.add(resource);
    if (resource.userData?.bbShared === true) bucket.shared += 1;
    else if (resource.userData?.bbShared === false) bucket.owned += 1;
    else bucket.untagged += 1;
  };

  const visitMaterial = (mat) => {
    if (!mat) return;
    classify(mat, materials, seenM);
    for (const key of MAP_KEYS) {
      classify(mat[key], textures, seenT);
    }
  };

  const visit = (obj) => {
    if (!obj) return;
    classify(obj.geometry, geometries, seenG);
    if (Array.isArray(obj.material)) obj.material.forEach(visitMaterial);
    else visitMaterial(obj.material);
  };

  if (typeof root?.traverse === 'function') root.traverse(visit);
  else visit(root);

  return { geometries, materials, textures };
}

/**
 * Explicitly dispose a shared GLTF / cache root that is being abandoned.
 * Unlike disposeObjectTree, this frees resources tagged bbShared=true.
 * Only call when no live instance still references the cache entry.
 */
export function disposeSharedSubtree(root) {
  if (!root) return;
  const seen = new Set();
  const free = (resource) => {
    if (!resource || seen.has(resource)) return;
    seen.add(resource);
    try { resource.dispose?.(); } catch { /* ignore */ }
  };
  const freeMat = (mat) => {
    if (!mat || seen.has(mat)) return;
    seen.add(mat);
    for (const key of MAP_KEYS) free(mat[key]);
    try { mat.dispose?.(); } catch { /* ignore */ }
  };
  const visit = (obj) => {
    free(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(freeMat);
    else freeMat(obj.material);
  };
  if (typeof root.traverse === 'function') root.traverse(visit);
  else visit(root);
}
