/**
 * Batch 7 — non-destructive mesh simplification via official SimplifyModifier (Meshopt).
 */
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { inspectMeshRoot } from './meshInspect.js';

const modifier = new SimplifyModifier();

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {number} targetRatio 0..1 remaining (e.g. 0.5 keeps ~50% verts)
 */
export async function simplifyGeometry(geometry, targetRatio = 0.5) {
  if (!geometry?.attributes?.position) {
    return { geometry: null, error: 'Geometry has no positions', before: null, after: null };
  }
  const beforeCount = geometry.attributes.position.count;
  const ratio = Math.min(0.99, Math.max(0.05, Number(targetRatio) || 0.5));
  const removeCount = Math.max(0, Math.floor(beforeCount * (1 - ratio)));
  if (removeCount < 1) {
    return {
      geometry: geometry.clone(),
      error: null,
      before: { vertices: beforeCount },
      after: { vertices: beforeCount },
      removed: 0,
    };
  }
  try {
    const simplified = await modifier.modify(geometry, removeCount);
    const afterCount = simplified.attributes?.position?.count ?? 0;
    return {
      geometry: simplified,
      error: null,
      before: { vertices: beforeCount },
      after: { vertices: afterCount },
      removed: beforeCount - afterCount,
      targetRatio: ratio,
    };
  } catch (err) {
    return {
      geometry: null,
      error: err?.message || String(err),
      before: { vertices: beforeCount },
      after: null,
    };
  }
}

/**
 * Clone a scene and simplify each mesh geometry. Materials/hierarchy preserved.
 * @param {THREE.Object3D} root
 * @param {number} targetRatio
 */
export async function simplifySceneRoot(root, targetRatio = 0.5) {
  if (!root) throw new Error('No mesh root');
  const clone = root.clone(true);
  const before = inspectMeshRoot(root);
  const perMesh = [];
  const meshes = [];
  clone.traverse((obj) => {
    if (obj.isMesh && obj.geometry) meshes.push(obj);
  });

  for (const mesh of meshes) {
    const result = await simplifyGeometry(mesh.geometry, targetRatio);
    if (result.error) {
      perMesh.push({ name: mesh.name, error: result.error });
      continue;
    }
    // Dispose previous owned clone geometry if we replaced it
    const prev = mesh.geometry;
    mesh.geometry = result.geometry;
    if (prev && prev !== result.geometry) {
      // Clone from load may share cache — only dispose if not shared
      if (!prev.userData?.bbShared) {
        try { prev.dispose(); } catch { /* ignore */ }
      }
    }
    perMesh.push({
      name: mesh.name,
      before: result.before,
      after: result.after,
      removed: result.removed,
    });
  }

  const after = inspectMeshRoot(clone);
  const reduction = before.triangles > 0
    ? 1 - (after.triangles / before.triangles)
    : 0;

  const degradation = [];
  if (after.triangles < 3) degradation.push('Result has fewer than one triangle.');
  if (before.materialCount !== after.materialCount) {
    degradation.push('Material count changed unexpectedly.');
  }
  if (reduction > 0.95) degradation.push('Extreme reduction (>95%) — preview carefully.');

  return {
    root: clone,
    before,
    after,
    reduction,
    perMesh,
    degradation,
    targetRatio,
  };
}
