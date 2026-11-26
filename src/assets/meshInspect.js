/**
 * Batch 7 — mesh / asset inspection helpers for Asset Viewer.
 */
import * as THREE from 'three';

/**
 * Gather geometry/material stats from a loaded Object3D root.
 */
export function inspectMeshRoot(root) {
  let vertices = 0;
  let triangles = 0;
  let meshCount = 0;
  let geometryCount = 0;
  const materials = new Set();
  const materialNames = [];
  const textures = new Set();
  let hasSkinned = false;
  let hasMorph = false;
  const box = new THREE.Box3();
  if (root) box.setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root?.traverse((obj) => {
    if (obj.isSkinnedMesh) hasSkinned = true;
    if (!obj.isMesh) return;
    meshCount += 1;
    const geo = obj.geometry;
    if (geo) {
      geometryCount += 1;
      const pos = geo.attributes?.position;
      if (pos) vertices += pos.count;
      if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) hasMorph = true;
      if (geo.index) triangles += geo.index.count / 3;
      else if (pos) triangles += pos.count / 3;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      materials.add(mat.uuid);
      if (mat.name) materialNames.push(mat.name);
      for (const key of Object.keys(mat)) {
        const v = mat[key];
        if (v && v.isTexture) textures.add(v.uuid);
      }
    }
  });

  const warnings = [];
  if (vertices === 0) warnings.push('No vertex data found.');
  if (hasSkinned) warnings.push('Skinned meshes present — BloodBound StaticMesh path is static-only.');
  if (hasMorph) warnings.push('Morph targets present — not used by StaticMesh placement.');

  return {
    vertices: Math.round(vertices),
    triangles: Math.round(triangles),
    meshCount,
    geometryCount,
    materialCount: materials.size,
    materialNames: [...new Set(materialNames)].slice(0, 32),
    textureCount: textures.size,
    hasSkinned,
    hasMorph,
    boundingBoxMeters: { x: size.x, y: size.y, z: size.z },
    boundingBoxCenterMeters: { x: center.x, y: center.y, z: center.z },
    warnings,
  };
}

export function formatBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Merge registry meta + live inspect stats for Asset Viewer.
 */
export function buildMeshAssetReport(asset, liveStats = null) {
  const meta = asset?.meta || {};
  const derivedFrom = meta.derivedFrom || meta.sourceAssetId || null;
  const relationship = meta.relationship || (derivedFrom ? 'derived' : 'source');
  return {
    id: asset?.id || null,
    name: asset?.name || null,
    path: asset?.path || null,
    format: meta.format || null,
    bytes: meta.bytes ?? null,
    bytesLabel: formatBytes(meta.bytes),
    sourceFormat: meta.sourceFormat || meta.format || null,
    derivedFrom,
    relationship,
    simplification: meta.simplification || null,
    lodGenerated: Boolean(meta.lodGenerated),
    compression: meta.compression || null,
    triangles: liveStats?.triangles ?? meta.triangles ?? null,
    vertices: liveStats?.vertices ?? meta.vertices ?? null,
    meshCount: liveStats?.meshCount ?? meta.meshCount ?? null,
    materialCount: liveStats?.materialCount ?? meta.materialCount ?? null,
    textureCount: liveStats?.textureCount ?? meta.textureCount ?? null,
    boundingBoxMeters: liveStats?.boundingBoxMeters || meta.boundingBoxMeters || null,
    warnings: [
      ...(Array.isArray(meta.importWarnings) ? meta.importWarnings : []),
      ...(liveStats?.warnings || []),
    ],
  };
}
