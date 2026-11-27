import * as THREE from 'three';
import { toMeters } from '../core/units.js';
import {
  normalizeStaticMeshFields,
} from '../components/StaticMeshComponent.js';
import { cloneLoadedMesh } from './meshLoader.js';
import {
  collectMaterialSlots,
  countTrianglesInRoot,
  resolveStaticCollisionDims,
} from './staticMeshGeometry.js';
import { disposeObjectTree } from './gpuResources.js';

/**
 * Apply BloodBound material overrides onto a cloned glTF root.
 * Overrides keyed by slot key from collectMaterialSlots (`meshName:matIndex`).
 */
export async function applyStaticMaterialOverrides(root, overrides, createMaterial) {
  if (!root || !overrides || !Object.keys(overrides).length || !createMaterial) {
    return collectMaterialSlots(root);
  }
  const slots = collectMaterialSlots(root);
  let meshIndex = 0;
  const tasks = [];

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const meshName = obj.name || `Mesh_${meshIndex}`;
    mats.forEach((mat, matIndex) => {
      const key = `${meshName}:${matIndex}`;
      const materialId = overrides[key] ?? overrides[String(meshIndex)] ?? overrides[String(matIndex)];
      if (!materialId) return;
      tasks.push({ obj, matIndex, isArray: Array.isArray(obj.material), materialId, old: mat });
    });
    meshIndex += 1;
  });

  for (const task of tasks) {
    // Per-mesh create so UV-channel warnings reflect that geometry's attributes.
    const mat = await createMaterial(task.materialId, task.obj);
    if (!mat) continue;
    // Each mesh gets its own clone so disposing one actor cannot free another's override.
    const owned = mat.clone();
    if (owned.userData) {
      owned.userData.bbUvWarnings = mat.userData?.bbUvWarnings || [];
      owned.userData.bbMapChannels = mat.userData?.bbMapChannels;
    }
    task.obj.userData = task.obj.userData || {};
    task.obj.userData.bbUvWarnings = owned.userData?.bbUvWarnings || [];
    if (task.isArray) {
      task.obj.material[task.matIndex] = owned;
    } else {
      task.obj.material = owned;
    }
  }
  return slots;
}

function applyMeshRenderFlags(root, fields) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = fields.castShadow !== false;
    obj.receiveShadow = fields.receiveShadow !== false;
    obj.frustumCulled = fields.frustumCulled !== false;
    obj.renderOrder = fields.renderOrder || 0;
  });
}

/**
 * Build a THREE.LOD when lodLevels are authored; otherwise a plain Group with one mesh.
 * Distances are authored in editor units and converted to meters for Three.LOD.
 */
export async function buildStaticMeshVisual(comp, {
  resolveMeshUrl,
  createMaterial,
  stamp,
} = {}) {
  const fields = normalizeStaticMeshFields(comp);
  const disposeFns = [];

  const loadLevel = async (assetId) => {
    const url = resolveMeshUrl?.(assetId);
    if (!url) return null;
    const loaded = await cloneLoadedMesh(url);
    if (!loaded?.root) return null;
    await applyStaticMaterialOverrides(loaded.root, fields.materialOverrides, createMaterial);
    applyMeshRenderFlags(loaded.root, fields);
    if (stamp) stamp(loaded.root);
    const tris = countTrianglesInRoot(loaded.root);
    return { root: loaded.root, meta: loaded.meta, triangles: tris, assetId };
  };

  const levels = fields.lodLevels?.length
    ? fields.lodLevels
    : (fields.assetId ? [{ assetId: fields.assetId, distance: 0 }] : []);

  if (!levels.length) {
    return {
      root: new THREE.Group(),
      slots: [],
      triangleCounts: [],
      dispose: () => {},
      fields,
    };
  }

  const loadedLevels = [];
  for (const level of levels) {
    // eslint-disable-next-line no-await-in-loop
    const built = await loadLevel(level.assetId);
    if (built) loadedLevels.push({ ...built, distanceEu: level.distance });
  }

  if (!loadedLevels.length) {
    return {
      root: new THREE.Group(),
      slots: [],
      triangleCounts: [],
      dispose: () => {},
      fields,
    };
  }

  let root;
  if (loadedLevels.length === 1 && fields.lodPreview < 0) {
    root = loadedLevels[0].root;
  } else {
    const lod = new THREE.LOD();
    lod.userData.bbStaticLod = true;
    const hystMeters = toMeters(fields.lodHysteresis || 0);
    lod.userData.bbLodHysteresisMeters = hystMeters;
    for (const level of loadedLevels) {
      const distM = toMeters(level.distanceEu || 0);
      // THREE.LOD hysteresis is a fraction of the level distance (not absolute meters).
      const hystFrac = distM > 1e-6
        ? Math.min(0.49, Math.max(0, hystMeters / distM))
        : 0;
      lod.addLevel(level.root, distM, hystFrac);
    }
    if (fields.lodPreview >= 0 && fields.lodPreview < loadedLevels.length) {
      // Force a specific level for editor preview (manual LOD).
      // Disable autoUpdate so the renderer does not override visibility per camera.
      lod.autoUpdate = false;
      for (let i = 0; i < lod.levels.length; i += 1) {
        lod.levels[i].object.visible = i === fields.lodPreview;
      }
      lod.userData.bbLodManual = fields.lodPreview;
    }
    root = lod;
  }

  const slots = collectMaterialSlots(loadedLevels[0].root);
  const triangleCounts = loadedLevels.map((l) => ({
    assetId: l.assetId,
    triangles: l.triangles,
    distance: l.distanceEu,
  }));

  disposeFns.push(() => {
    disposeObjectTree(root, { geometries: false });
  });

  return {
    root,
    slots,
    triangleCounts,
    fields,
    dispose: () => {
      for (const fn of disposeFns) fn();
    },
  };
}

/**
 * Wireframe collision helper (edit mode). Sizes in meters.
 */
export function createCollisionHelper(fields, boundsMeters, centerMeters) {
  const f = normalizeStaticMeshFields(fields);
  if (!f.showCollision || !f.collidable || f.collisionType === 'none') return null;
  const mode = f.collisionType === 'auto' ? 'box' : f.collisionType;
  const dims = resolveStaticCollisionDims(f, boundsMeters, centerMeters);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44ffaa,
    wireframe: true,
    depthTest: true,
    transparent: true,
    opacity: 0.85,
  });
  let geo;
  if (mode === 'sphere') {
    geo = new THREE.SphereGeometry(Math.max(0.05, dims.radius), 16, 12);
  } else if (mode === 'capsule') {
    geo = new THREE.CapsuleGeometry(
      Math.max(0.05, dims.radius),
      Math.max(0.05, dims.height),
      4,
      12,
    );
  } else if (mode === 'cylinder') {
    geo = new THREE.CylinderGeometry(
      Math.max(0.05, dims.radius),
      Math.max(0.05, dims.radius),
      Math.max(0.05, dims.height),
      16,
    );
  } else {
    // box / convex / trimesh preview as AABB
    geo = new THREE.BoxGeometry(
      Math.max(0.05, dims.boxSize.x),
      Math.max(0.05, dims.boxSize.y),
      Math.max(0.05, dims.boxSize.z),
    );
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(dims.offsetMeters.x, dims.offsetMeters.y, dims.offsetMeters.z);
  mesh.userData.bbCollisionHelper = true;
  mesh.userData.pickable = false;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Instancing fingerprint — same asset + overrides + shadow flags can share an InstancedMesh.
 */
export function staticMeshInstanceKey(comp) {
  const f = normalizeStaticMeshFields(comp);
  return JSON.stringify({
    assetId: f.assetId,
    materialOverrides: f.materialOverrides,
    castShadow: f.castShadow,
    receiveShadow: f.receiveShadow,
    renderOrder: f.renderOrder,
  });
}
