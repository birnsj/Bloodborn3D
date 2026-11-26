import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import { loadGltfScene, peekLoadedMeshMeta } from './meshLoader.js';

/**
 * Collect material slots from a loaded glTF root (stable keys for overrides).
 * key = `${meshName}:${localMatIndex}` with fallbacks.
 */
export function collectMaterialSlots(root) {
  const slots = [];
  if (!root) return slots;
  let meshIndex = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat, matIndex) => {
      const meshName = obj.name || `Mesh_${meshIndex}`;
      const matName = mat?.name || `Material_${matIndex}`;
      const key = `${meshName}:${matIndex}`;
      slots.push({
        key,
        meshName,
        matName,
        matIndex,
        meshIndex,
      });
    });
    meshIndex += 1;
  });
  return slots;
}

/**
 * Flatten mesh positions (meters, local) + triangle indices for Rapier hull/trimesh.
 * Applies optional actor scale into the point cloud.
 */
function matrixRelativeToRoot(obj, root) {
  const mat = new THREE.Matrix4().identity();
  const stack = [];
  let node = obj;
  while (node && node !== root) {
    stack.push(node);
    node = node.parent;
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    stack[i].updateMatrix();
    mat.multiply(stack[i].matrix);
  }
  return mat;
}

export function extractCollisionGeometryMeters(root, scale = { x: 1, y: 1, z: 1 }) {
  const positions = [];
  const indices = [];
  let base = 0;
  if (!root) return { positions: new Float32Array(0), indices: new Uint32Array(0) };

  // Do not mutate shared cached glTF roots — bake mesh→root local matrices only.
  const tmp = new THREE.Vector3();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const geo = obj.geometry;
    const pos = geo.attributes?.position;
    if (!pos) return;
    const index = geo.index;
    const m = matrixRelativeToRoot(obj, root);
    for (let i = 0; i < pos.count; i += 1) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(m);
      positions.push(
        tmp.x * (scale.x || 1),
        tmp.y * (scale.y || 1),
        tmp.z * (scale.z || 1),
      );
    }
    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        indices.push(base + index.getX(i));
      }
    } else {
      for (let i = 0; i < pos.count; i += 1) {
        indices.push(base + i);
      }
    }
    base += pos.count;
  });

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

/**
 * Async: ensure glTF is cached then extract collision geometry.
 */
export async function loadMeshCollisionGeometry(url, scale) {
  if (!url) return null;
  const loaded = await loadGltfScene(url);
  if (!loaded?.scene) return null;
  return extractCollisionGeometryMeters(loaded.scene, scale);
}

export function countTrianglesInRoot(root) {
  let tris = 0;
  if (!root) return 0;
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

/**
 * Build editor collision helper dimensions from StaticMesh fields + bounds meta.
 * Returns meters for helper / physics shared math.
 */
export function resolveStaticCollisionDims(fields, boundsMeters, centerMeters) {
  const size = boundsMeters || { x: 1, y: 1, z: 1 };
  const center = centerMeters || { x: 0, y: 0, z: 0 };
  const off = fields.collisionOffset || { x: 0, y: 0, z: 0 };
  const offsetMeters = {
    x: center.x + toMeters(off.x || 0),
    y: center.y + toMeters(off.y || 0),
    z: center.z + toMeters(off.z || 0),
  };

  const overrideSize = fields.collisionSize || { x: 0, y: 0, z: 0 };
  const boxSize = {
    x: overrideSize.x > 0 ? toMeters(overrideSize.x) : size.x,
    y: overrideSize.y > 0 ? toMeters(overrideSize.y) : size.y,
    z: overrideSize.z > 0 ? toMeters(overrideSize.z) : size.z,
  };

  const radius = fields.collisionRadius > 0
    ? toMeters(fields.collisionRadius)
    : Math.max(boxSize.x, boxSize.z) * 0.5;
  const height = fields.collisionHeight > 0
    ? toMeters(fields.collisionHeight)
    : boxSize.y;

  return { boxSize, offsetMeters, radius, height };
}

export function peekBoundsForUrl(url) {
  return peekLoadedMeshMeta(url);
}
