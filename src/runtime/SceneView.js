import * as THREE from 'three';
import {
  toMeters,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_EXTENT_EDITOR_UNITS,
} from '../core/units.js';
import { BrushGizmo } from '../editor/BrushGizmo.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';
import {
  getChildren,
  getRootActors,
  getWorldTransform,
  isEffectivelyVisible,
} from '../core/hierarchy.js';
import { createBrushBoxGeometry } from './brushGeometry.js';
import {
  createThreeMaterial,
  createFallbackBrushMaterial,
  assetUrl,
} from './materialFactory.js';
import { cloneLoadedMesh } from './meshLoader.js';

/**
 * Three.js adapter: builds and syncs visual representation of a World.
 * Gameplay logic does not live here.
 */
export class SceneView {
  constructor({ canvas, editMode = true } = {}) {
    this.canvas = canvas;
    this.editMode = editMode;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d24);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 1.5, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 8;
    this.maxAnisotropy = Math.min(16, maxAniso);

    this.root = new THREE.Group();
    this.root.name = 'WorldRoot';
    this.scene.add(this.root);

    // Editor fill lights — hidden in play so authored lights dominate.
    this.ambient = new THREE.AmbientLight(0xb0b8c4, 0.35);
    this.scene.add(this.ambient);

    this.editFill = new THREE.DirectionalLight(0xffffff, 0.45);
    this.editFill.position.set(6, 10, 4);
    this.scene.add(this.editFill);
    this.editFill2 = new THREE.DirectionalLight(0xd0d8e8, 0.25);
    this.editFill2.position.set(-5, 4, -6);
    this.scene.add(this.editFill2);

    this.gridHelper = null;
    this.gridSize = DEFAULT_GRID_EDITOR_UNITS;
    this._actorMeshes = new Map();
    this._selectionHelpers = [];
    this.selectedActorIds = [];
    this._syncToken = 0;

    /** @type {{ getTextureUrl:(id:string)=>string|null, getMaterialDefinition:(id:string)=>Promise<object|null>, getMeshUrl:(id:string)=>string|null } | null} */
    this.assetResolver = null;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this.gizmo = null;
    this._createPreview = null;

    if (editMode) {
      this._createEditHelpers();
      this.gizmo = new BrushGizmo(this.scene);
    }
  }

  setAssetResolver(resolver) {
    this.assetResolver = resolver || null;
  }

  _createEditHelpers() {
    this.setGridSize(this.gridSize);
  }

  setGridSize(gridSizeEditorUnits) {
    this.gridSize = Math.max(1, gridSizeEditorUnits || DEFAULT_GRID_EDITOR_UNITS);
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      disposeObject(this.gridHelper);
      this.gridHelper = null;
    }
    if (!this.editMode) return;

    const extentMeters = toMeters(GRID_EXTENT_EDITOR_UNITS);
    const divisions = Math.max(2, Math.round(GRID_EXTENT_EDITOR_UNITS / this.gridSize));
    this.gridHelper = new THREE.GridHelper(extentMeters, divisions, 0x4a5568, 0x2a3038);
    this.scene.add(this.gridHelper);
  }

  setEditMode(editMode) {
    this.editMode = editMode;
    if (this.gridHelper) this.gridHelper.visible = editMode;
    if (this.editFill) this.editFill.visible = editMode;
    if (this.editFill2) this.editFill2.visible = editMode;
    // Soft ambient remains in play as a minimal fill if no ambient actor exists.
    if (this.ambient) this.ambient.intensity = editMode ? 0.35 : 0.12;
    if (this.gizmo) this.gizmo.setVisible(editMode && this.selectedActorIds.length > 0);
    if (this._createPreview) this._createPreview.visible = editMode;

    for (const entry of this._actorMeshes.values()) {
      entry.group.traverse((obj) => {
        if (obj.userData?.editorOnly) obj.visible = editMode;
      });
    }
  }

  setSize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  clearWorldMeshes() {
    for (const entry of this._actorMeshes.values()) {
      this.root.remove(entry.group);
      disposeObject(entry.group);
    }
    this._actorMeshes.clear();
    this._clearSelectionHelpers();
  }

  syncFromWorld(world) {
    const token = ++this._syncToken;
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
  }

  addOrUpdateActorVisual(actor) {
    // Hierarchy changes are safest with a full resync
    if (actor.world) {
      this.syncFromWorld(actor.world);
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
    entry.group.visible = isEffectivelyVisible(actor, actor.world);
    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds);
    }
  }

  updateBrushGeometry(actor) {
    this.addOrUpdateActorVisual(actor);
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
    group.visible = isEffectivelyVisible(actor, world);

    for (const comp of actor.components) {
      if (!comp.enabled) continue;

      if (comp.type === 'Brush') {
        this._addBrushVisual(group, actor, comp, syncToken);
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
        group.add(this._createLight(comp));
        if (this.editMode) {
          group.add(this._createLightGizmo(comp, actor.id));
        }
      } else if (comp.type === 'StaticMesh') {
        this._addStaticMeshVisual(group, actor, comp, syncToken);
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

    const parentEntry = actor.parentId ? this._actorMeshes.get(actor.parentId) : null;
    if (parentEntry) parentEntry.group.add(group);
    else this.root.add(group);

    this._actorMeshes.set(actor.id, { group, actor });
  }

  _addBrushVisual(group, actor, comp, syncToken) {
    const geom = createBrushBoxGeometry(comp.size, comp.uv);
    const fallback = createFallbackBrushMaterial(comp.color || '#888888', {
      editMode: this.editMode,
    });
    // Six materials for per-face assignment (+x -x +y -y +z -z)
    const mats = FACE_KEYS.map(() => fallback.clone());
    const mesh = new THREE.Mesh(geom, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applyBrushMaterials(mesh, comp, syncToken);
  }

  async _applyBrushMaterials(mesh, comp, syncToken) {
    const resolver = this.assetResolver;
    const mapResolver = (assetId) => {
      if (!resolver?.getTextureUrl) return null;
      return assetUrl(resolver.getTextureUrl(assetId));
    };

    const resolveDef = async (materialId) => {
      if (!materialId || !resolver?.getMaterialDefinition) return null;
      return resolver.getMaterialDefinition(materialId);
    };

    const defaultDef = await resolveDef(comp.materialId);
    if (syncToken !== this._syncToken) return;

    for (let i = 0; i < FACE_KEYS.length; i += 1) {
      const faceKey = FACE_KEYS[i];
      const faceMatId = comp.faceMaterials?.[faceKey] || comp.materialId;
      let def = null;
      if (faceMatId && faceMatId === comp.materialId) def = defaultDef;
      else if (faceMatId) def = await resolveDef(faceMatId);
      if (syncToken !== this._syncToken) return;

      if (def) {
        const mat = await createThreeMaterial(def, mapResolver);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          if (mat[key]) mat[key].anisotropy = this.maxAnisotropy;
        }
        const old = mesh.material[i];
        mesh.material[i] = mat;
        old?.dispose?.();
      }
    }
    mesh.material.needsUpdate = true;
  }

  async _addStaticMeshVisual(group, actor, comp, syncToken) {
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
    group.add(placeholder);

    const url = this.assetResolver?.getMeshUrl?.(comp.assetId);
    if (!url) return;

    const loaded = await cloneLoadedMesh(assetUrl(url) || url);
    if (syncToken !== this._syncToken) return;
    if (!loaded?.root) return;
    if (!this._actorMeshes.has(actor.id)) return;

    group.remove(placeholder);
    disposeObject(placeholder);

    loaded.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.actorId = actor.id;
        obj.userData.pickable = true;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    group.add(loaded.root);

    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds);
    }
  }

  _createLight(comp) {
    const color = new THREE.Color(comp.color || '#ffffff');
    const intensity = comp.intensity ?? 1;
    let light;

    if (comp.lightType === 'directional') {
      light = new THREE.DirectionalLight(color, intensity);
      light.position.set(0, 0, 0);
      light.target.position.set(0, -1, 0);
    } else if (comp.lightType === 'ambient') {
      light = new THREE.AmbientLight(color, intensity);
    } else if (comp.lightType === 'spot') {
      const rangeMeters = toMeters(comp.range ?? 1000);
      light = new THREE.SpotLight(
        color,
        intensity,
        rangeMeters,
        THREE.MathUtils.degToRad(comp.spotAngle ?? 45),
        comp.spotPenumbra ?? 0.25,
        2,
      );
      light.position.set(0, 0, 0);
      light.target.position.set(0, -1, 0);
    } else {
      const rangeMeters = toMeters(comp.range ?? 1000);
      light = new THREE.PointLight(color, intensity, rangeMeters, 2);
    }

    if (light.isDirectionalLight || light.isSpotLight || light.isPointLight) {
      light.castShadow = Boolean(comp.castShadow);
      if (light.castShadow && light.shadow) {
        const mapSize = Math.max(256, Number(comp.shadowMapSize) || 1024);
        light.shadow.mapSize.set(mapSize, mapSize);
        light.shadow.bias = -0.0002;
        if (light.isDirectionalLight) {
          light.shadow.camera.left = -20;
          light.shadow.camera.right = 20;
          light.shadow.camera.top = 20;
          light.shadow.camera.bottom = -20;
        }
      }
    }

    // Keep target in the same group for spot/directional orientation via actor rotation
    if (light.target) {
      const holder = new THREE.Group();
      holder.add(light);
      holder.add(light.target);
      light.target.position.set(0, -1, 0);
      return holder;
    }
    return light;
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
            color,
            wireframe: true,
            transparent: true,
            opacity: 0.2,
          }),
        );
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
    } else if (comp.lightType === 'ambient') {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        }),
      );
      halo.userData.pickable = true;
      gizmo.add(halo);
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

  /**
   * @param {string|string[]|null} actorIds
   * @param {import('../core/World.js').World|null} world optional, for gizmo brush sizes
   */
  setSelection(actorIds, world = null) {
    const ids = !actorIds
      ? []
      : Array.isArray(actorIds)
        ? [...actorIds]
        : [actorIds];
    this.selectedActorIds = ids;
    this._clearSelectionHelpers();

    for (const id of ids) {
      const entry = this._actorMeshes.get(id);
      if (!entry) continue;
      const box = new THREE.Box3().setFromObject(entry.group);
      if (box.isEmpty()) continue;
      const helper = new THREE.Box3Helper(box, 0xffcc33);
      helper.name = 'SelectionHelper';
      this.scene.add(helper);
      this._selectionHelpers.push(helper);
    }

    this._updateGizmo(world);
  }

  _updateGizmo(world) {
    if (!this.gizmo || !this.editMode) return;
    const brushStates = [];
    let primary = null;
    for (const id of this.selectedActorIds) {
      const actor = world?.getActor?.(id) || this._actorMeshes.get(id)?.actor;
      const brush = actor?.getComponent?.('Brush');
      if (!actor || !brush) continue;
      const worldPos = getWorldTransform(actor, world || actor.world).position;
      const state = {
        position: { ...worldPos },
        size: { ...brush.size },
      };
      brushStates.push(state);
      if (!primary) primary = state;
    }
    this.gizmo.update(brushStates, primary);
  }

  _clearSelectionHelpers() {
    for (const helper of this._selectionHelpers) {
      this.scene.remove(helper);
      disposeObject(helper);
    }
    this._selectionHelpers = [];
  }

  getRaycaster(normalizedX, normalizedY, camera = this.camera) {
    this._pointer.set(normalizedX, normalizedY);
    this._raycaster.setFromCamera(this._pointer, camera);
    return this._raycaster;
  }

  pickGizmo(normalizedX, normalizedY, camera = this.camera) {
    if (!this.gizmo || !this.editMode) return null;
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    return this.gizmo.pick(raycaster);
  }

  pickActorId(normalizedX, normalizedY, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const meshes = [];
    this.root.traverse((obj) => {
      if ((obj.isMesh || obj.isLine) && obj.userData.pickable) meshes.push(obj);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    return hits[0].object.userData.actorId || null;
  }

  /**
   * Intersect construction plane y = planeY (editor units).
   */
  pickConstructionPoint(normalizedX, normalizedY, planeYEditor = 0, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const yMeters = toMeters(planeYEditor);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMeters);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return {
      x: hit.x * 100,
      y: planeYEditor,
      z: hit.z * 100,
    };
  }

  setCreatePreview(boundsOrNull) {
    if (this._createPreview) {
      this.scene.remove(this._createPreview);
      disposeObject(this._createPreview);
      this._createPreview = null;
    }
    if (!boundsOrNull) return;

    const { min, max } = boundsOrNull;
    const size = {
      x: Math.max(0.01, Math.abs(max.x - min.x)),
      y: Math.max(0.01, Math.abs(max.y - min.y)),
      z: Math.max(0.01, Math.abs(max.z - min.z)),
    };
    const center = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(toMeters(size.x), toMeters(size.y), toMeters(size.z)),
      new THREE.MeshBasicMaterial({
        color: 0xc4a35a,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    mesh.position.set(toMeters(center.x), toMeters(center.y), toMeters(center.z));
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xffcc66 }),
    );
    mesh.add(edges);
    this.scene.add(mesh);
    this._createPreview = mesh;
  }

  render(camera = this.camera) {
    this.renderer.render(this.scene, camera);
  }

  dispose() {
    this.clearWorldMeshes();
    this.setCreatePreview(null);
    if (this.gizmo) {
      this.gizmo.dispose();
      this.gizmo = null;
    }
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      disposeObject(this.gridHelper);
    }
    this.renderer.dispose();
  }
}

function disposeObject(obj) {
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => disposeMaterial(m));
      else disposeMaterial(child.material);
    }
  });
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach((m) => disposeMaterial(m));
    else disposeMaterial(obj.material);
  }
}

function disposeMaterial(mat) {
  if (!mat) return;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
    if (mat[key]?.dispose) mat[key].dispose();
  }
  mat.dispose?.();
}
