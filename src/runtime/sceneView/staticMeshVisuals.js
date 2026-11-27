// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { createThreeMaterial, assetUrl } from '../materialFactory.js';
import { inspectGeometryUvChannels } from '../../assets/textureUvChannels.js';
import { normalizeStaticMeshFields } from '../../components/StaticMeshComponent.js';
import { buildStaticMeshVisual, createCollisionHelper, staticMeshInstanceKey } from '../createThreeStaticMesh.js';
import { peekLoadedMeshMeta } from '../meshLoader.js';
import { cloneLoadedMesh } from '../meshLoader.js';
import { markOwnedGpuResource, markSharedMaterialTextures } from '../gpuResources.js';
import { disposeObject } from './shared.js';

export class StaticMeshVisualMethods {
  /** Discovered GLB material slots for the selected StaticMesh actor (Batch 6). */
  getStaticMeshSlots(actorId) {
    return this._actorMeshes.get(actorId)?.staticMeshSlots || [];
  }

  getStaticMeshTriangleCounts(actorId) {
    return this._actorMeshes.get(actorId)?.staticMeshTriangles || [];
  }

  async _addStaticMeshVisual(group, actor, comp, syncToken) {
    const fields = normalizeStaticMeshFields(comp);
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x6a8098,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      }),
    );
    placeholder.userData.actorId = actor.id;
    placeholder.userData.pickable = true;
    placeholder.userData.placeholder = true;
    this._stampActorVisual(placeholder, actor.id);
    group.add(placeholder);

    const visualEpoch = this._actorMeshes.get(actor.id)?.visualEpoch;
    const resolver = this.assetResolver;
    const mapResolver = (assetId) => {
      if (resolver?.getTextureAsset) {
        const src = resolver.getTextureAsset(assetId);
        if (!src?.url) return null;
        return { url: assetUrl(src.url) || src.url, meta: src.meta, path: src.path };
      }
      const path = resolver?.getTextureUrl?.(assetId);
      return path ? (assetUrl(path) || path) : null;
    };

    let built;
    try {
      built = await buildStaticMeshVisual(fields, {
        resolveMeshUrl: (assetId) => {
          const path = resolver?.getMeshUrl?.(assetId);
          return path ? (assetUrl(path) || path) : null;
        },
        createMaterial: async (materialId, meshHint = null) => {
          if (!materialId || !resolver?.getMaterialDefinition) return null;
          const def = await resolver.getMaterialDefinition(materialId);
          if (!def) return null;
          const uvChannels = meshHint
            ? inspectGeometryUvChannels(meshHint).channels
            : [];
          return createThreeMaterial(def, mapResolver, {
            maxAnisotropy: this.maxAnisotropy,
            availableUvChannels: uvChannels,
          });
        },
        stamp: (root) => {
          root.traverse((obj) => {
            if (obj.isMesh) {
              obj.userData.pickable = true;
              this._stampActorVisual(obj, actor.id);
            }
          });
        },
      });
    } catch (err) {
      console.warn('[BloodBound] static mesh build failed', actor?.id, err);
      return;
    }

    if (!this._isActorVisualCurrent(actor.id, syncToken, visualEpoch)) {
      built.dispose?.();
      if (built.root) disposeObject(built.root);
      return;
    }

    group.remove(placeholder);
    disposeObject(placeholder);

    // Opt-in instancing: hide per-actor mesh and register with instance pool.
    const useInstancing = fields.instancing === 'force'
      || (fields.instancing === 'auto' && this._countStaticMeshKey(staticMeshInstanceKey(fields)) >= 3);
    if (useInstancing && fields.assetId && !fields.lodLevels?.length) {
      group.userData.bbStaticInstanceKey = staticMeshInstanceKey(fields);
      group.userData.bbStaticInstanceHidden = true;
      // Invisible pick proxy keeps selection / gizmo working.
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.userData.pickable = true;
      this._stampActorVisual(proxy, actor.id);
      group.add(proxy);
      built.dispose?.();
      if (built.root) disposeObject(built.root);
      this._queueStaticMeshInstanceRebuild();
    } else {
      group.add(built.root);
      group.userData.bbStaticMeshDispose = built.dispose;
      group.userData.bbStaticMeshSlots = built.slots;
      group.userData.bbStaticMeshTriangles = built.triangleCounts;
    }

    // Collision helper (edit mode).
    if (this.editMode && fields.showCollision) {
      const url = resolver?.getMeshUrl?.(fields.assetId);
      const meta = peekLoadedMeshMeta(url ? (assetUrl(url) || url) : null)
        || peekLoadedMeshMeta(url);
      const helper = createCollisionHelper(
        fields,
        meta?.boundingBoxMeters,
        meta?.boundingBoxCenterMeters,
      );
      if (helper) group.add(helper);
    }

    const entry = this._actorMeshes.get(actor.id);
    if (entry) {
      entry.staticMeshFields = fields;
      entry.staticMeshSlots = built.slots || [];
      entry.staticMeshTriangles = built.triangleCounts || [];
    }

    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds);
    }
  }

  _countStaticMeshKey(key) {
    let n = 0;
    for (const actor of this.world?.actors || []) {
      const c = actor.getComponent?.('StaticMesh');
      if (!c || !c.enabled) continue;
      if (staticMeshInstanceKey(c) === key) n += 1;
    }
    return n;
  }

  _queueStaticMeshInstanceRebuild() {
    if (this._staticInstanceRebuildQueued) return;
    this._staticInstanceRebuildQueued = true;
    queueMicrotask(() => {
      this._staticInstanceRebuildQueued = false;
      this._rebuildStaticMeshInstances();
    });
  }

  /**
   * Opt-in InstancedMesh pools for repeated StaticMesh assets (Batch 6).
   * Default instancing is off — enable per actor (`force` / `auto`).
   * BatchedMesh evaluated: better for multi-material atlases; deferred — InstancedMesh
   * covers same-asset prop scatters without merging authoring objects.
   */
  _rebuildStaticMeshInstances() {
    if (!this.scene) return;
    // Clear previous instance roots
    if (this._staticInstanceRoot) {
      this.scene.remove(this._staticInstanceRoot);
      disposeObject(this._staticInstanceRoot);
      this._staticInstanceRoot = null;
    }
    const groups = new Map();
    for (const actor of this.world?.actors || []) {
      const c = actor.getComponent?.('StaticMesh');
      if (!c?.enabled || !c.assetId) continue;
      const fields = normalizeStaticMeshFields(c);
      const use = fields.instancing === 'force'
        || (fields.instancing === 'auto' && this._countStaticMeshKey(staticMeshInstanceKey(fields)) >= 3);
      if (!use || fields.lodLevels?.length) continue;
      const key = staticMeshInstanceKey(fields);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(actor);
    }
    if (!groups.size) return;

    const root = new THREE.Group();
    root.userData.bbStaticInstanceRoot = true;
    this._staticInstanceRoot = root;
    this.scene.add(root);

    for (const [key, actors] of groups) {
      if (actors.length < 1) continue;
      const sample = normalizeStaticMeshFields(actors[0].getComponent('StaticMesh'));
      const url = this.assetResolver?.getMeshUrl?.(sample.assetId);
      if (!url) continue;
      const resolved = assetUrl(url) || url;
      // Use first mesh geometry from cached clone asynchronously
      void this._fillInstancedMeshGroup(root, key, actors, sample, resolved);
    }
  }

  async _fillInstancedMeshGroup(root, key, actors, sample, resolvedUrl) {
    const loaded = await cloneLoadedMesh(resolvedUrl);
    if (!loaded?.root || !this._staticInstanceRoot) {
      if (loaded?.root) disposeObject(loaded.root);
      return;
    }
    // Find first mesh to instance (single-material props). Multi-mesh assets stay individual.
    let sourceMesh = null;
    loaded.root.traverse((o) => {
      if (!sourceMesh && o.isMesh) sourceMesh = o;
    });
    if (!sourceMesh?.geometry) {
      disposeObject(loaded.root);
      return;
    }
    const geo = sourceMesh.geometry;
    const srcMat = Array.isArray(sourceMesh.material)
      ? sourceMesh.material[0]
      : sourceMesh.material;
    // Own a material clone so disposing the temporary GLB clone cannot free the instance mat.
    // Maps stay shared (same Texture refs from cloneLoadedMesh); markSharedMaterialTextures
    // keeps disposeOwnedMaterial from freeing the GLB cache maps.
    const mat = srcMat?.clone ? srcMat.clone() : srcMat;
    if (mat) {
      markOwnedGpuResource(mat);
      markSharedMaterialTextures(mat);
    }
    const instanced = new THREE.InstancedMesh(geo, mat, actors.length);
    instanced.castShadow = sample.castShadow !== false;
    instanced.receiveShadow = sample.receiveShadow !== false;
    instanced.frustumCulled = sample.frustumCulled !== false;
    instanced.renderOrder = sample.renderOrder || 0;
    instanced.userData.bbInstancedKey = key;
    instanced.userData.pickable = false;
    instanced.userData.bbOwnedMaterial = mat;

    const dummy = new THREE.Object3D();
    actors.forEach((actor, i) => {
      const entry = this._actorMeshes.get(actor.id);
      const g = entry?.group;
      const content = g?.userData?.bbContentRoot || g;
      if (content) {
        content.updateWorldMatrix(true, false);
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.applyMatrix4(content.matrixWorld);
      } else {
        const t = actor.transform;
        dummy.position.set(
          toMeters(t.position.x),
          toMeters(t.position.y),
          toMeters(t.position.z),
        );
        dummy.rotation.set(
          (t.rotation.x * Math.PI) / 180,
          (t.rotation.y * Math.PI) / 180,
          (t.rotation.z * Math.PI) / 180,
        );
        dummy.scale.set(t.scale.x || 1, t.scale.y || 1, t.scale.z || 1);
      }
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    root.add(instanced);
    // Geometry stays shared with the mesh cache; dispose clone tree (owned mats).
    disposeObject(loaded.root);
  }
}
