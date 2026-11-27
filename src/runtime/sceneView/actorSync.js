// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { migrateLegacyWorldAmbient, normalizeWorldScene, normalizeWorldRenderer } from '../../core/World.js';
import { getChildren, getRootActors } from '../../core/hierarchy.js';
import { contentOffsetToMeters } from '../../core/contentOffset.js';
import { isWorldSolidActor } from '../brushBoolean.js';
import { actorContentFingerprint, actorParentFingerprint, actorTransformFingerprint, collectWorldPoseChangedIds, isAdditiveBrushActor, isSubtractBrushActor } from '../actorVisualFingerprint.js';
import { ensureWorldSolidContainsSubtracts } from '../worldSolidFit.js';
import { disposeObject, createEmptySyncStats, carveRoleForActor, countOwnedResources } from './shared.js';

export class ActorSyncMethods {
  clearWorldMeshes() {
    this._clearGeometryFaceOverlays();
    if (!this._actorEpochHighWater) this._actorEpochHighWater = new Map();
    for (const [actorId, entry] of this._actorMeshes.entries()) {
      const epoch = entry.visualEpoch || 0;
      const prev = this._actorEpochHighWater.get(actorId) || 0;
      if (epoch > prev) this._actorEpochHighWater.set(actorId, epoch);
      this.root.remove(entry.group);
      disposeObject(entry.group);
    }
    this._actorMeshes.clear();
    this._clearSelectionHelpers();
    // Post-FX textures are SceneView-owned and must not survive level switches (C5).
    this._clearPpTextureCache();
  }

  syncFromWorld(world) {
    if (!this.syncStats) this.syncStats = createEmptySyncStats();
    this.syncStats.fullSyncs += 1;
    const token = ++this._syncToken;
    // Keep a live world ref for InstancedMesh rebuild / key counts (Batch 6).
    this.world = world || null;
    if (world) {
      world.ambient = migrateLegacyWorldAmbient(world.ambient);
      world.scene = normalizeWorldScene(world.scene);
      world.renderer = normalizeWorldRenderer(world.renderer);
      this.applyWorldAmbient(world.ambient);
      this.applyWorldScene(world.scene);
      this.applyWorldRenderer(world.renderer);
      this.applyPostProcessing(world.postProcessing);
    }
    this.clearWorldMeshes();
    // Build root-first so parents exist before children attach.
    const roots = getRootActors(world);
    const visit = (actor) => {
      this._addActorVisual(actor, token, world);
      for (const child of getChildren(actor.id, world)) {
        visit(child);
      }
    };
    for (const root of roots) visit(root);
    // Orphans with missing parents still render at root
    for (const actor of world.actors) {
      if (!this._actorMeshes.has(actor.id)) {
        this._addActorVisual(actor, token, world);
      }
    }
    this.setSelection(this.selectedActorIds);
    if (this.selectedSurface) this._refreshSurfaceHighlight();
    this._applyEditorOverlayVisibility();
    this.applyEditorVisibilityFilters(world);
  }

  /**
   * Targeted sync: add/remove/rebuild only actors whose content changed.
   * Full-world sync remains for load / Play restore / explicit recovery.
   * Preserves Phase 2F.7B visualEpoch (no global token bump).
   */
  syncIncremental(world) {
    if (!this.syncStats) this.syncStats = createEmptySyncStats();
    this.syncStats.incrementalSyncs += 1;
    if (!world) return;
    this.world = world;
    world.ambient = migrateLegacyWorldAmbient(world.ambient);
    world.scene = normalizeWorldScene(world.scene);
    world.renderer = normalizeWorldRenderer(world.renderer);
    this.applyWorldAmbient(world.ambient);
    this.applyWorldScene(world.scene);
    this.applyWorldRenderer(world.renderer);

    let carveDirty = false;
    const liveIds = new Set(world.actors.map((a) => a.id));
    // Deleting a subtract / World Solid must invalidate carved dependents.
    for (const id of [...this._actorMeshes.keys()]) {
      if (liveIds.has(id)) continue;
      const entry = this._actorMeshes.get(id);
      if (entry?.carveRole === 'subtract' || entry?.carveRole === 'world-solid') {
        carveDirty = true;
      } else if (entry?.actor && (isSubtractBrushActor(entry.actor) || isWorldSolidActor(entry.actor))) {
        carveDirty = true;
      }
      this.removeActorVisual(id);
      this.syncStats.actorRemoves += 1;
    }

    for (const actor of world.actors) {
      const entry = this._actorMeshes.get(actor.id);
      const contentFp = actorContentFingerprint(actor);
      const transformFp = actorTransformFingerprint(actor);
      const isSubtract = isSubtractBrushActor(actor);
      const isSolid = isWorldSolidActor(actor);
      if (!entry) {
        if (isSubtract || isSolid) carveDirty = true;
        continue;
      }
      const contentChanged = entry.contentFingerprint !== contentFp;
      const transformChanged = entry.transformFingerprint !== transformFp;
      // Operation flip add↔subtract: entry.carveRole is the pre-edit role.
      const wasSubtract = entry.carveRole === 'subtract';
      if (wasSubtract !== isSubtract) carveDirty = true;
      if (
        (isSubtract && (contentChanged || transformChanged))
        || (isSolid && contentChanged)
      ) {
        carveDirty = true;
      }
    }

    // A brush's carve depends on its WORLD pose relative to every cutter, so a
    // changed own transform, re-parenting, or any ancestor transform matters
    // (Phase 2G D1). Computed before syncOne refreshes the stored fingerprints.
    const poseChanged = collectWorldPoseChangedIds(world, this._actorMeshes);
    let hasCutters = false;
    for (const actor of world.actors) {
      if (!isSubtractBrushActor(actor)) continue;
      hasCutters = true;
      // Cutter moved relative to everything: all additive brushes re-carve.
      if (poseChanged.has(actor.id)) carveDirty = true;
    }

    if (carveDirty && world.mapMode === 'subtractive') {
      ensureWorldSolidContainsSubtracts(world, { gridSize: this.gridSize || 25 });
    }

    const syncOne = (actor, { forceRebuild = false } = {}) => {
      const contentFp = actorContentFingerprint(actor);
      const transformFp = actorTransformFingerprint(actor);
      const parentFp = actorParentFingerprint(actor);
      let entry = this._actorMeshes.get(actor.id);

      if (!entry) {
        this._addActorVisual(actor, this._syncToken, world);
        entry = this._actorMeshes.get(actor.id);
        if (entry) {
          entry.contentFingerprint = contentFp;
          entry.transformFingerprint = transformFp;
          entry.parentFingerprint = parentFp;
        }
        this.syncStats.actorAdds += 1;
        return;
      }

      const needRebuild = forceRebuild
        || entry.contentFingerprint !== contentFp
        || (carveDirty && (isAdditiveBrushActor(actor) || isWorldSolidActor(actor)))
        // Carved brush moved (directly, via ancestor, or re-parented) while cutters exist.
        || (hasCutters
          && (isAdditiveBrushActor(actor) || isWorldSolidActor(actor))
          && poseChanged.has(actor.id));

      if (needRebuild) {
        this.rebuildActorVisual(actor, world);
        this.syncStats.actorRebuilds += 1;
      } else if (entry.transformFingerprint !== transformFp) {
        this.updateActorTransform(actor);
        this.syncStats.transformUpdates += 1;
      }

      entry = this._actorMeshes.get(actor.id);
      if (entry) {
        entry.contentFingerprint = actorContentFingerprint(actor);
        entry.transformFingerprint = actorTransformFingerprint(actor);
        entry.parentFingerprint = actorParentFingerprint(actor);
        entry.carveRole = carveRoleForActor(actor);
      }
    };

    const forceRebuild = carveDirty;
    const visit = (actor) => {
      syncOne(actor, { forceRebuild: forceRebuild && (isAdditiveBrushActor(actor) || isWorldSolidActor(actor)) });
      for (const child of getChildren(actor.id, world)) visit(child);
    };
    for (const root of getRootActors(world)) visit(root);
    for (const actor of world.actors) {
      if (!this._actorMeshes.has(actor.id)) syncOne(actor, { forceRebuild: false });
    }

    this._syncActorHierarchy(world);
    this.setSelection(this.selectedActorIds, world);
    if (this.selectedSurface) this._refreshSurfaceHighlight();
    this._applyEditorOverlayVisibility();
    this.applyEditorVisibilityFilters(world);
  }

  /** Re-parent Three groups when actor.parentId changes without mesh rebuild. */
  _syncActorHierarchy(world) {
    if (!world) return;
    for (const actor of world.actors) {
      const entry = this._actorMeshes.get(actor.id);
      if (!entry?.group) continue;
      const parentFp = actorParentFingerprint(actor);
      if (entry.parentFingerprint === parentFp && entry.group.parent) {
        // Still verify parent pointer in case of prior detach.
        const desired = actor.parentId
          ? this._actorMeshes.get(actor.parentId)?.group
          : this.root;
        if (desired && entry.group.parent === desired) continue;
      }
      const desiredParent = actor.parentId
        ? this._actorMeshes.get(actor.parentId)?.group
        : this.root;
      if (!desiredParent) continue;
      if (entry.group.parent !== desiredParent) {
        desiredParent.add(entry.group);
        this.syncStats.hierarchyMoves += 1;
      }
      entry.parentFingerprint = parentFp;
      this.updateActorTransform(actor);
    }
  }

  /**
   * Rebuild one actor's component meshes in place (visualEpoch only — no global token).
   */
  rebuildActorVisual(actor, world = actor.world) {
    const entry = this._actorMeshes.get(actor.id);
    if (!entry) {
      this._addActorVisual(actor, this._syncToken, world);
      const created = this._actorMeshes.get(actor.id);
      if (created) {
        created.contentFingerprint = actorContentFingerprint(actor);
        created.transformFingerprint = actorTransformFingerprint(actor);
        created.parentFingerprint = actorParentFingerprint(actor);
      }
      return;
    }

    const childGroups = this._detachChildActorGroups(entry.group, actor.id);
    for (const child of [...entry.group.children]) {
      entry.group.remove(child);
      disposeObject(child);
    }
    entry.group.userData.bbContentRoot = null;

    entry.visualEpoch = (entry.visualEpoch || 0) + 1;
    entry.actor = actor;
    this._populateActorComponents(entry.group, actor, this._syncToken, world);
    entry.group.traverse((obj) => {
      if (obj.userData?.actorId === actor.id) this._stampActorVisual(obj, actor.id);
    });
    for (const child of childGroups) {
      entry.group.add(child);
    }
    this.updateActorTransform(actor);
    entry.contentFingerprint = actorContentFingerprint(actor);
    entry.transformFingerprint = actorTransformFingerprint(actor);
    entry.parentFingerprint = actorParentFingerprint(actor);
    entry.carveRole = carveRoleForActor(actor);
    this._actorEpochHighWater.set(actor.id, entry.visualEpoch || 0);
  }

  resetSyncStats() {
    this.syncStats = createEmptySyncStats();
  }

  getSyncStats() {
    return { ...this.syncStats };
  }

  addOrUpdateActorVisual(actor) {
    // Prefer incremental sync when the actor belongs to a live world.
    if (actor.world) {
      this.syncIncremental(actor.world);
      return;
    }
    this.removeActorVisual(actor.id);
    this._addActorVisual(actor, this._syncToken, null);
    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds);
    }
  }

  removeActorVisual(actorId) {
    const entry = this._actorMeshes.get(actorId);
    if (!entry) return;
    // Preserve high-water epoch so undo-recreate cannot reuse a stale generation.
    if (!this._actorEpochHighWater) this._actorEpochHighWater = new Map();
    const epoch = entry.visualEpoch || 0;
    const prev = this._actorEpochHighWater.get(actorId) || 0;
    if (epoch > prev) this._actorEpochHighWater.set(actorId, epoch);
    // Re-parent nested actor groups before disposing so children stay in the map.
    this._detachChildActorGroups(entry.group, actorId);
    if (entry.group.parent) entry.group.parent.remove(entry.group);
    disposeObject(entry.group);
    this._actorMeshes.delete(actorId);
  }

  updateActorTransform(actor) {
    const entry = this._actorMeshes.get(actor.id);
    if (!entry) return;
    // Groups are nested: apply LOCAL transform (parent group handles ancestry).
    const pos = actor.transform.position;
    entry.group.position.set(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z));
    const rot = actor.transform.rotation;
    entry.group.rotation.set(
      THREE.MathUtils.degToRad(rot.x),
      THREE.MathUtils.degToRad(rot.y),
      THREE.MathUtils.degToRad(rot.z),
    );
    const scale = actor.transform.scale;
    entry.group.scale.set(scale.x, scale.y, scale.z);
    // Content frame (pivot × contentOffset) — geometry lives here.
    this._syncContentRoot(entry.group, actor);
    entry.group.visible = this._isActorEditorVisible(actor, actor.world);
    entry.transformFingerprint = actorTransformFingerprint(actor);
    // Spot / directional lights need target matrices current after the group moves.
    entry.group.updateMatrixWorld(true);
    const lightComp = actor.getComponent?.('Light');
    entry.group.traverse((obj) => {
      if (obj.isLight && obj.target) {
        if (lightComp?.targetActorId) {
          this._applyLightTargetAim(obj.parent, obj, lightComp, actor.world);
        } else {
          obj.target.updateMatrixWorld(true);
        }
      }
      if (obj.isSpotLightHelper || obj.isDirectionalLightHelper || obj.isPointLightHelper
        || obj.isHemisphereLightHelper || obj.type === 'RectAreaLightHelper') {
        obj.update?.();
      }
    });
    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds, actor.world);
    }
  }

  /**
   * Rebuild only this actor's brush / convex-brush meshes in place.
   * Avoids syncFromWorld on every gizmo resize sample (which was disposing the
   * entire scene graph and could make brushes vanish).
   *
   * Bumps only this actor's visualEpoch — not the global sync token — so other
   * actors' in-flight material/mesh loads are not cancelled.
   */
  updateBrushGeometry(actor) {
    const brush = actor?.getComponent?.('Brush');
    const convex = actor?.getComponent?.('ConvexBrush');
    const entry = this._actorMeshes.get(actor.id);
    if (!brush && !convex) {
      if (actor?.world) this.syncFromWorld(actor.world);
      return;
    }
    if (!entry) {
      this._addActorVisual(actor, this._syncToken, actor.world);
      if (this.selectedActorIds.includes(actor.id)) {
        this.setSelection(this.selectedActorIds, actor.world);
      }
      return;
    }

    const childGroups = this._detachChildActorGroups(entry.group, actor.id);
    for (const child of [...entry.group.children]) {
      entry.group.remove(child);
      disposeObject(child);
    }
    entry.group.userData.bbContentRoot = null;

    entry.visualEpoch = (entry.visualEpoch || 0) + 1;
    const token = this._syncToken;
    const contentRoot = typeof this._syncContentRoot === 'function'
      ? this._syncContentRoot(entry.group, actor)
      : entry.group;
    if (convex) this._addConvexBrushVisual(contentRoot, actor, convex, token);
    else this._addBrushVisual(contentRoot, actor, brush, token);
    entry.group.traverse((obj) => {
      if (obj.userData?.actorId === actor.id) this._stampActorVisual(obj, actor.id);
    });
    for (const child of childGroups) {
      entry.group.add(child);
    }

    this.updateActorTransform(actor);
    entry.contentFingerprint = actorContentFingerprint(actor);
    entry.transformFingerprint = actorTransformFingerprint(actor);
    if (!this.syncStats) this.syncStats = createEmptySyncStats();
    this.syncStats.actorRebuilds += 1;
    if (this.geometrySelection?.items?.some((it) => it.actorId === actor.id)) {
      this._refreshGeometryFaceOverlays(actor.world);
      this._updateGeometryGizmo(actor.world);
    }
  }

  /** True when a full-world sync token and this actor's visual epoch still match. */
  _isActorVisualCurrent(actorId, syncToken, visualEpoch) {
    if (syncToken !== this._syncToken) return false;
    // Direct helper calls (unit tests) may omit actor binding — sync token only.
    if (actorId == null || actorId === '') return true;
    const entry = this._actorMeshes.get(actorId);
    if (!entry) return false;
    if (visualEpoch != null && entry.visualEpoch !== visualEpoch) return false;
    return true;
  }

  /** Stamp meshes so async material/mesh loads can detect actor-local rebuilds. */
  _stampActorVisual(obj, actorId) {
    if (!obj) return;
    const entry = this._actorMeshes.get(actorId);
    obj.userData.actorId = actorId;
    obj.userData.visualEpoch = entry?.visualEpoch ?? 0;
  }

  /** Pull nested actor Three groups out of a parent group without disposing them. */
  _detachChildActorGroups(group, ownerActorId) {
    const detached = [];
    for (const child of [...group.children]) {
      const childId = child.userData?.actorId;
      if (!childId || childId === ownerActorId) continue;
      const childEntry = this._actorMeshes.get(childId);
      if (childEntry?.group !== child) continue;
      group.remove(child);
      detached.push(child);
    }
    return detached;
  }

  _addActorVisual(actor, syncToken = this._syncToken, world = actor.world) {
    const group = new THREE.Group();
    group.name = actor.name;
    group.userData.actorId = actor.id;

    // LOCAL transform — nesting under parent group yields correct world pose.
    const pos = actor.transform.position;
    group.position.set(toMeters(pos.x), toMeters(pos.y), toMeters(pos.z));

    const rot = actor.transform.rotation;
    group.rotation.set(
      THREE.MathUtils.degToRad(rot.x),
      THREE.MathUtils.degToRad(rot.y),
      THREE.MathUtils.degToRad(rot.z),
    );

    const scale = actor.transform.scale;
    group.scale.set(scale.x, scale.y, scale.z);
    group.visible = this._isActorEditorVisible(actor, world);

    // Register before component visuals so async loads can read visualEpoch.
    // High-water survives delete so undo/redo recreate never reuses a generation.
    if (!this._actorEpochHighWater) this._actorEpochHighWater = new Map();
    const liveEpoch = this._actorMeshes.get(actor.id)?.visualEpoch || 0;
    const highWater = this._actorEpochHighWater.get(actor.id) || 0;
    const nextEpoch = Math.max(liveEpoch, highWater) + 1;
    this._actorEpochHighWater.set(actor.id, nextEpoch);
    this._actorMeshes.set(actor.id, {
      group,
      actor,
      visualEpoch: nextEpoch,
      contentFingerprint: actorContentFingerprint(actor),
      transformFingerprint: actorTransformFingerprint(actor),
      parentFingerprint: actorParentFingerprint(actor),
      carveRole: carveRoleForActor(actor),
    });

    this._populateActorComponents(group, actor, syncToken, world);

    group.traverse((obj) => {
      if (obj === group || obj.userData?.actorId === actor.id) {
        this._stampActorVisual(obj, actor.id);
      }
    });

    const parentEntry = actor.parentId ? this._actorMeshes.get(actor.parentId) : null;
    if (parentEntry) parentEntry.group.add(group);
    else this.root.add(group);
  }

  /** Ensure content root under the actor pivot group; sync contentOffset. */
  _syncContentRoot(group, actor) {
    let root = group.userData.bbContentRoot;
    // Rebuild disposes prior children; a stale userData handle must not be reused
    // once the ContentRoot is no longer parented under the actor group.
    if (!root || !root.isObject3D || root.parent !== group) {
      root = new THREE.Group();
      root.name = 'ContentRoot';
      root.userData.bbContentRoot = true;
      group.add(root);
      group.userData.bbContentRoot = root;
    }
    const m = contentOffsetToMeters(actor?.contentOffset);
    root.position.set(m.x, m.y, m.z);
    return root;
  }

  /** Component visuals for an actor group (shared by add + rebuild). */
  _populateActorComponents(group, actor, syncToken, world = actor.world) {
    void world;
    // Test stubs may omit _syncContentRoot — fall back to the actor group.
    const contentRoot = typeof this._syncContentRoot === 'function'
      ? this._syncContentRoot(group, actor)
      : group;
    for (const comp of actor.components) {
      if (!comp.enabled) continue;

      if (comp.type === 'Brush') {
        this._addBrushVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'ConvexBrush') {
        this._addConvexBrushVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'Ramp') {
        this._addRampVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'Stair') {
        this._addStairVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'Column') {
        this._addColumnVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'Arch') {
        this._addArchVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'CurvedWall') {
        this._addCurvedWallVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'Cell' && this.editMode) {
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.25, 0.25),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(comp.color || '#4d7ea8'),
            wireframe: true,
            transparent: true,
            opacity: 0.7,
          }),
        );
        marker.userData.actorId = actor.id;
        marker.userData.pickable = true;
        marker.userData.editorOnly = true;
        group.add(marker);
      } else if (comp.type === 'Light') {
        this._addLightVisual(group, actor, comp, syncToken, world);
      } else if (comp.type === 'Environment') {
        this._addEnvironmentVisual(group, actor, comp, syncToken, world);
      } else if (comp.type === 'StaticMesh') {
        this._addStaticMeshVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'PrimitiveMesh') {
        this._addPrimitiveMeshVisual(contentRoot, actor, comp, syncToken);
      } else if (comp.type === 'PlayerSpawn' && this.editMode) {
        const marker = new THREE.Mesh(
          new THREE.ConeGeometry(0.15, 0.4, 8),
          new THREE.MeshBasicMaterial({ color: 0x44cc66 }),
        );
        marker.rotation.x = Math.PI;
        marker.position.y = toMeters(comp.eyeHeight || 160) * 0.5;
        marker.userData.actorId = actor.id;
        marker.userData.pickable = true;
        marker.userData.editorOnly = true;
        group.add(marker);
      }
    }
    const counted = countOwnedResources(group, actor.id);
    this.syncStats.geometryAllocs += counted.geometries;
    this.syncStats.materialAllocs += counted.materials;
  }
}
