// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters } from '../../core/units.js';
import { getWorldTransform } from '../../core/hierarchy.js';
import { createThreeMaterial, assetUrl } from '../materialFactory.js';
import { createThreeLightFromComponent, ensureRectAreaLightUniforms } from '../createThreeLight.js';
import { createThreeEnvironmentFromComponent, rebuildDecalGeometry } from '../createThreeEnvironment.js';
import { createThreePrimitiveVisual } from '../createThreePrimitive.js';
import { normalizePrimitiveMeshFields } from '../../components/PrimitiveMeshComponent.js';
import { normalizeEnvironmentFields } from '../../components/EnvironmentComponent.js';
import { disposeObject } from './shared.js';

export class LightEnvironmentVisualMethods {
  _addPrimitiveMeshVisual(group, actor, comp, syncToken) {
    const holder = new THREE.Group();
    holder.userData.bbPrimitiveHolder = true;
    holder.userData.actorId = actor.id;
    group.add(holder);
    void this._finishPrimitiveMeshVisual(holder, actor, comp, syncToken);
  }

  async _finishPrimitiveMeshVisual(holder, actor, comp, syncToken) {
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
      built = await createThreePrimitiveVisual(comp, {
        createMaterial: async (materialId) => {
          if (!materialId || !resolver?.getMaterialDefinition) return null;
          const def = await resolver.getMaterialDefinition(materialId);
          if (!def) return null;
          return createThreeMaterial(def, mapResolver, {
            maxAnisotropy: this.maxAnisotropy,
          });
        },
      });
    } catch (err) {
      console.warn('[BloodBound] primitive build failed', actor?.id, err);
      return;
    }
    if (!this._isActorVisualCurrent(actor.id, syncToken, visualEpoch)) {
      built.dispose?.();
      if (built.root) disposeObject(built.root);
      return;
    }
    while (holder.children.length) {
      const child = holder.children[0];
      holder.remove(child);
      disposeObject(child);
    }
    holder.add(built.root);
    holder.userData.bbPrimitiveDispose = built.dispose;
    built.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.pickable = true;
        this._stampActorVisual(obj, actor.id);
      }
    });
    // Cache geometry positions (meters) for physics trimesh/convex rebuilds.
    const entry = this._actorMeshes.get(actor.id);
    if (entry && built.mesh?.geometry) {
      entry.primitiveGeometry = built.mesh.geometry;
      entry.primitiveFields = normalizePrimitiveMeshFields(comp);
    }
    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds);
    }
  }

  /**
   * Async light visual (spot maps / lensflare textures). Placeholder root is sync so
   * transforms and pick gizmos appear immediately.
   */
  _addLightVisual(group, actor, comp, syncToken, world = actor.world) {
    if (comp.lightType === 'rectArea') ensureRectAreaLightUniforms();
    const holder = new THREE.Group();
    holder.userData.bbLightHolder = true;
    holder.userData.actorId = actor.id;
    group.add(holder);
    if (this.editMode) {
      group.add(this._createLightGizmo(comp, actor.id));
    }
    void this._finishLightVisual(holder, actor, comp, syncToken, world);
  }

  async _finishLightVisual(holder, actor, comp, syncToken, world) {
    const visualEpoch = this._actorMeshes.get(actor.id)?.visualEpoch;
    const resolveTextureUrl = (assetId) => {
      const path = this.assetResolver?.getTextureUrl?.(assetId);
      return path ? (assetUrl(path) || path) : null;
    };
    let built;
    try {
      built = await createThreeLightFromComponent(comp, {
        resolveTextureUrl,
        maxAnisotropy: this.maxAnisotropy,
      });
    } catch (err) {
      console.warn('[BloodBound] light build failed', actor?.id, err);
      return;
    }
    if (!this._isActorVisualCurrent(actor.id, syncToken, visualEpoch)) {
      built.dispose?.();
      if (built.root) disposeObject(built.root);
      return;
    }
    // Free prior light GPU (shadow maps / spot maps) before replacing children.
    if (typeof holder.userData.bbLightDispose === 'function') {
      try { holder.userData.bbLightDispose(); } catch { /* ignore */ }
      holder.userData.bbLightDispose = null;
    }
    while (holder.children.length) {
      const child = holder.children[0];
      holder.remove(child);
      disposeObject(child);
    }
    holder.add(built.root);
    holder.userData.bbLightDispose = built.dispose;
    holder.userData.bbLightRef = built.light;
    // Target lives as a sibling of the light under built.root when present.
    this._applyLightTargetAim(built.light.parent || holder, built.light, comp, world);
    built.helper?.update?.();
  }

  _addEnvironmentVisual(group, actor, comp, syncToken, world = actor.world) {
    const holder = new THREE.Group();
    holder.userData.bbEnvHolder = true;
    holder.userData.actorId = actor.id;
    holder.userData.pickable = true;
    group.add(holder);
    if (this.editMode && (comp.envType === 'decal' || comp.envType === 'sky')) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({
          color: comp.envType === 'sky' ? 0x88ccff : 0xcc8844,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
      );
      marker.userData.actorId = actor.id;
      marker.userData.pickable = true;
      marker.userData.editorOnly = true;
      group.add(marker);
    }
    void this._finishEnvironmentVisual(holder, actor, comp, syncToken, world);
  }

  async _finishEnvironmentVisual(holder, actor, comp, syncToken, world) {
    const visualEpoch = this._actorMeshes.get(actor.id)?.visualEpoch;
    const resolveTextureUrl = (assetId) => {
      const path = this.assetResolver?.getTextureUrl?.(assetId);
      return path ? (assetUrl(path) || path) : null;
    };
    let built;
    try {
      built = await createThreeEnvironmentFromComponent(comp, {
        resolveTextureUrl,
        maxAnisotropy: this.maxAnisotropy,
        world,
        actor,
      });
    } catch (err) {
      console.warn('[BloodBound] environment build failed', actor?.id, err);
      return;
    }
    if (!this._isActorVisualCurrent(actor.id, syncToken, visualEpoch)) {
      built.dispose?.();
      if (built.root) disposeObject(built.root);
      return;
    }
    while (holder.children.length) {
      const child = holder.children[0];
      holder.remove(child);
      disposeObject(child);
    }
    holder.add(built.root);
    // Register dispose once on the holder only — tagging both holder and root
    // caused double RT/geo teardown when disposeObject traversed both (C5).
    holder.userData.bbEnvDispose = built.dispose;
    holder.userData.bbEnvKind = built.kind;
    if (built.kind === 'decal') {
      this._projectDecal(built.root, actor, comp, world);
    }
    if (built.kind === 'sky') {
      holder.userData.bbPlaceableSky = true;
      built.root.userData.bbPlaceableSky = true;
      this._syncPlaceableSkyPrecedence();
    }
  }

  _projectDecal(decalRoot, actor, comp, world = actor.world) {
    const def = normalizeEnvironmentFields(comp);
    if (!def.targetActorId || !world) return;
    const targetEntry = this._actorMeshes.get(def.targetActorId);
    if (!targetEntry?.group) return;
    let targetMesh = null;
    targetEntry.group.traverse((obj) => {
      if (targetMesh) return;
      if (obj.isMesh && obj.userData?.pickable !== false && !obj.userData?.editorOnly) {
        targetMesh = obj;
      }
    });
    if (!targetMesh) return;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    // Projector pose = decal actor world transform.
    const entry = this._actorMeshes.get(actor.id);
    if (entry?.group) {
      entry.group.updateWorldMatrix(true, false);
      entry.group.getWorldPosition(worldPos);
      entry.group.getWorldQuaternion(worldQuat);
    } else {
      const p = actor.transform.position;
      worldPos.set(toMeters(p.x), toMeters(p.y), toMeters(p.z));
      const r = actor.transform.rotation;
      worldQuat.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(r.x),
        THREE.MathUtils.degToRad(r.y),
        THREE.MathUtils.degToRad(r.z),
      ));
    }
    // DecalGeometry expects world-space projector pose; verts are mesh-local.
    const orient = new THREE.Euler().setFromQuaternion(worldQuat);
    targetMesh.updateWorldMatrix(true, false);
    rebuildDecalGeometry(decalRoot, targetMesh, worldPos, orient, def.decalSize);
  }

  /**
   * Placeable Sky wins over World Settings procedural sky when any enabled
   * placeable Sky actor exists. World.scene.sky JSON is preserved.
   */
  _syncPlaceableSkyPrecedence() {
    let hasPlaceable = false;
    this.scene?.traverse((obj) => {
      if (obj.userData?.bbPlaceableSky && obj.visible !== false) hasPlaceable = true;
    });
    const worldSky = this.scene?.getObjectByName?.('WorldSky');
    if (worldSky) {
      worldSky.userData.bbSuppressedByPlaceableSky = hasPlaceable;
      if (hasPlaceable) worldSky.visible = false;
    }
    this.worldEnvironment?.setPlaceableSkyActive?.(hasPlaceable);
  }

  /** Sync factory for tests/benches that stub or call `_createLight` directly. */
  _createLight(comp) {
    // Prefer the async `_addLightVisual` path in production; this sync helper
    // preserves legacy stubbing and unit benches.
    const color = new THREE.Color(comp.color || '#ffffff');
    const intensity = comp.intensity ?? 1;
    const decay = Number.isFinite(Number(comp.decay)) ? Number(comp.decay) : 2;
    let light;
    if (comp.lightType === 'directional') {
      light = new THREE.DirectionalLight(color, intensity);
      light.target.position.set(0, -1, 0);
    } else if (comp.lightType === 'ambient') {
      light = new THREE.AmbientLight(color, intensity);
    } else if (comp.lightType === 'hemisphere') {
      light = new THREE.HemisphereLight(color, new THREE.Color(comp.groundColor || '#444444'), intensity);
    } else if (comp.lightType === 'rectArea') {
      ensureRectAreaLightUniforms();
      light = new THREE.RectAreaLight(color, intensity, toMeters(comp.width || 200), toMeters(comp.height || 200));
      light.rotation.x = -Math.PI / 2;
    } else if (comp.lightType === 'spot') {
      light = new THREE.SpotLight(
        color,
        intensity,
        toMeters(comp.range ?? 1000),
        THREE.MathUtils.degToRad(comp.spotAngle ?? 45),
        comp.spotPenumbra ?? 0.25,
        decay,
      );
      light.target.position.set(0, -1, 0);
    } else {
      light = new THREE.PointLight(color, intensity, toMeters(comp.range ?? 1000), decay);
    }
    if ((light.isDirectionalLight || light.isSpotLight || light.isPointLight) && comp.castShadow) {
      light.castShadow = true;
      const mapSize = Math.max(256, Number(comp.shadowMapSize) || 1024);
      light.shadow.mapSize.set(mapSize, mapSize);
      light.shadow.bias = Number.isFinite(Number(comp.shadowBias)) ? Number(comp.shadowBias) : -0.0005;
      light.shadow.normalBias = Number.isFinite(Number(comp.shadowNormalBias)) ? Number(comp.shadowNormalBias) : 0.04;
      light.shadow.radius = Number.isFinite(Number(comp.shadowRadius)) ? Number(comp.shadowRadius) : 2;
      if (light.isDirectionalLight) {
        const extent = Number.isFinite(Number(comp.shadowCameraSize)) ? Number(comp.shadowCameraSize) : 20;
        light.shadow.camera.left = -extent;
        light.shadow.camera.right = extent;
        light.shadow.camera.top = extent;
        light.shadow.camera.bottom = -extent;
        light.shadow.camera.near = Number(comp.shadowCameraNear) || 0.5;
        light.shadow.camera.far = Number(comp.shadowCameraFar) || 80;
        light.shadow.camera.updateProjectionMatrix();
      } else {
        const rangeMeters = toMeters(comp.range ?? 1000);
        light.shadow.camera.near = Number(comp.shadowCameraNear) || 0.2;
        light.shadow.camera.far = Number(comp.shadowCameraFar) || Math.max(rangeMeters, 1);
        light.shadow.camera.updateProjectionMatrix();
      }
    }
    if (light.target) {
      const holder = new THREE.Group();
      holder.add(light);
      holder.add(light.target);
      light.target.position.set(0, -1, 0);
      return holder;
    }
    return light;
  }

  _applyLightTargetAim(holder, light, comp, world) {
    if (!light?.target || !holder) return;
    const targetId = comp?.targetActorId;
    if (!targetId || !world?.getActor) {
      light.target.position.set(0, -1, 0);
      light.target.updateMatrixWorld(true);
      return;
    }
    const targetActor = world.getActor(targetId);
    if (!targetActor) {
      light.target.position.set(0, -1, 0);
      light.target.updateMatrixWorld(true);
      return;
    }
    const wt = getWorldTransform(targetActor, world);
    const worldPos = new THREE.Vector3(
      toMeters(wt.position.x),
      toMeters(wt.position.y),
      toMeters(wt.position.z),
    );
    holder.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
    light.target.position.copy(worldPos.applyMatrix4(inv));
    light.target.updateMatrixWorld(true);
  }

  _createLightGizmo(comp, actorId) {
    const color = new THREE.Color(comp.color || '#ffffff');
    const gizmo = new THREE.Group();
    gizmo.userData.editorOnly = true;
    gizmo.userData.actorId = actorId;

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 14, 14),
      new THREE.MeshBasicMaterial({ color }),
    );
    marker.userData.pickable = true;
    marker.userData.actorId = actorId;
    gizmo.add(marker);

    if (comp.lightType === 'point' || !comp.lightType) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.22, 24),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.7,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.userData.pickable = true;
      gizmo.add(ring);
      if (comp.range) {
        const radius = toMeters(comp.range) * 0.15;
        const guide = new THREE.Mesh(
          new THREE.SphereGeometry(Math.min(Math.max(radius, 0.3), 2.5), 16, 12),
          new THREE.MeshBasicMaterial({
            color: color.clone(),
            wireframe: true,
            transparent: true,
            opacity: 0.65,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        // Dense latitude/longitude sphere — hide in View→Wireframe (see viewportDisplay).
        guide.userData.denseWireHelper = true;
        guide.userData.pickable = true;
        gizmo.add(guide);
      }
    } else if (comp.lightType === 'spot') {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.35, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      cone.rotation.x = Math.PI;
      cone.position.y = -0.1;
      cone.userData.pickable = true;
      gizmo.add(cone);
    } else if (comp.lightType === 'directional') {
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0.2, 0),
        0.6,
        color.getHex(),
        0.15,
        0.1,
      );
      gizmo.add(arrow);
      marker.userData.pickable = true;
    } else if (comp.lightType === 'ambient' || comp.lightType === 'hemisphere') {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        }),
      );
      halo.userData.denseWireHelper = true;
      halo.userData.pickable = true;
      gizmo.add(halo);
      if (comp.lightType === 'hemisphere') {
        const ground = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(comp.groundColor || '#444444'),
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
          }),
        );
        ground.userData.pickable = true;
        gizmo.add(ground);
      }
    } else if (comp.lightType === 'rectArea') {
      const w = Math.min(Math.max(toMeters(comp.width || 200) * 0.15, 0.2), 1.2);
      const h = Math.min(Math.max(toMeters(comp.height || 200) * 0.15, 0.2), 1.2);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      panel.rotation.x = -Math.PI / 2;
      panel.userData.pickable = true;
      gizmo.add(panel);
    }

    gizmo.traverse((obj) => {
      if (obj.isMesh || obj.isLine || obj.isObject3D) {
        obj.userData.actorId = actorId;
        if (obj.isMesh || obj.isLine) {
          obj.userData.pickable = true;
          obj.userData.editorOnly = true;
        }
      }
    });

    return gizmo;
  }
}
