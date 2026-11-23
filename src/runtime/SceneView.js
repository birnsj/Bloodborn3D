import * as THREE from 'three';
import {
  toMeters,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_EXTENT_EDITOR_UNITS,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import { BrushGizmo } from '../editor/BrushGizmo.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';
import {
  getChildren,
  getRootActors,
  getWorldTransform,
  isEffectivelyVisible,
} from '../core/hierarchy.js';
import {
  createBrushBoxGeometry,
  createBrushSolidGeometry,
  getBrushRenderSolids,
  TEXTURE_TILE_EDITOR_UNITS,
} from './brushGeometry.js';
import { isSubtractBrush } from './brushBoolean.js';
import { createRampWedgeGeometry } from './rampGeometry.js';
import { createStairGeometry } from './stairGeometry.js';
import { createColumnGeometry } from './columnGeometry.js';
import { createArchGeometry } from './archGeometry.js';
import { createCurvedWallGeometry } from './curvedWallGeometry.js';
import { brushHasMiters, createMiteredWallGeometry } from './miteredWallGeometry.js';
import {
  createThreeMaterial,
  createFallbackBrushMaterial,
  assetUrl,
} from './materialFactory.js';
import { cloneLoadedMesh } from './meshLoader.js';
import { installStudioEnvironment } from './studioEnvironment.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createRampFromBounds } from '../editor/rampFactory.js';
import { createStairFromBounds } from '../editor/stairFactory.js';
import { createColumnFromBounds } from '../editor/columnFactory.js';
import { createArchFromBounds } from '../editor/archFactory.js';
import { createCurvedWallFromBounds } from '../editor/curvedWallFactory.js';
import { DEFAULT_RAMP_RISE } from '../components/RampComponent.js';

const SUBTRACT_COLOR = 0xc23b4a;

/**
 * Three.js adapter: builds and syncs visual representation of a World.
 * Gameplay logic does not live here.
 */
export class SceneView {
  constructor({ canvas, editMode = true } = {}) {
    this.canvas = canvas;
    this.editMode = editMode;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1218);

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
    this.renderer.toneMappingExposure = 0.95;

    this._studioEnv = installStudioEnvironment(this.renderer, this.scene, { intensity: 0.12 });

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 8;
    this.maxAnisotropy = Math.min(16, maxAniso);

    this.root = new THREE.Group();
    this.root.name = 'WorldRoot';
    this.scene.add(this.root);

    // Editor fill lights — hidden in play so authored lights dominate.
    // Very dim cool fill so authored bluish moonlight / window wash stay moody.
    this.ambient = new THREE.AmbientLight(0x3a4a68, 0.05);
    this.scene.add(this.ambient);

    this.editFill = new THREE.DirectionalLight(0x7a9ac0, 0.06);
    this.editFill.position.set(6, 10, 4);
    this.editFill.castShadow = false;
    this.scene.add(this.editFill);
    this.editFill2 = new THREE.DirectionalLight(0x405070, 0.03);
    this.editFill2.position.set(-5, 4, -6);
    this.editFill2.castShadow = false;
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
    this._placementPreview = null;

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
    if (this.ambient) this.ambient.intensity = editMode ? 0.05 : 0.02;
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
    // Hierarchy parenting changes need a full resync; geometry/transform
    // refreshes must not tear down the whole scene (gizmo resize path).
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
    entry.group.visible = isEffectivelyVisible(actor, actor.world);
    // Spot / directional lights need target matrices current after the group moves.
    entry.group.updateMatrixWorld(true);
    entry.group.traverse((obj) => {
      if (obj.isLight && obj.target) {
        obj.target.updateMatrixWorld(true);
      }
    });
    if (this.selectedActorIds.includes(actor.id)) {
      this.setSelection(this.selectedActorIds, actor.world);
    }
  }

  /**
   * Rebuild only this actor's brush meshes in place.
   * Avoids syncFromWorld on every gizmo resize sample (which was disposing the
   * entire scene graph and could make brushes vanish).
   */
  updateBrushGeometry(actor) {
    const brush = actor?.getComponent?.('Brush');
    const entry = this._actorMeshes.get(actor.id);
    if (!brush) {
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

    const token = ++this._syncToken;
    this._addBrushVisual(entry.group, actor, brush, token);
    for (const child of childGroups) {
      entry.group.add(child);
    }

    this.updateActorTransform(actor);
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
    group.visible = isEffectivelyVisible(actor, world);

    for (const comp of actor.components) {
      if (!comp.enabled) continue;

      if (comp.type === 'Brush') {
        this._addBrushVisual(group, actor, comp, syncToken);
      } else if (comp.type === 'Ramp') {
        this._addRampVisual(group, actor, comp, syncToken);
      } else if (comp.type === 'Stair') {
        this._addStairVisual(group, actor, comp, syncToken);
      } else if (comp.type === 'Column') {
        this._addColumnVisual(group, actor, comp, syncToken);
      } else if (comp.type === 'Arch') {
        this._addArchVisual(group, actor, comp, syncToken);
      } else if (comp.type === 'CurvedWall') {
        this._addCurvedWallVisual(group, actor, comp, syncToken);
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
    // Subtractive volumes: translucent crimson wireframe in Edit only — never solid, never Play.
    if (isSubtractBrush(comp)) {
      if (!this.editMode) return;
      const geom = new THREE.BoxGeometry(
        toMeters(comp.size.x),
        toMeters(comp.size.y),
        toMeters(comp.size.z),
      );
      const mat = new THREE.MeshBasicMaterial({
        color: SUBTRACT_COLOR,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.editorOnly = true;
      mesh.userData.brushOperation = 'subtract';
      group.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom),
        new THREE.LineBasicMaterial({ color: SUBTRACT_COLOR }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
      return;
    }

    const world = actor.world || null;
    // Mitered walls without openings: single prism mesh (keeps clean angled junctions).
    // Openings keep the AABB solid path; miters are ignored while openings exist.
    if (
      brushHasMiters(comp)
      && !(comp.openings?.length)
      && actor.tags?.includes?.('wall')
    ) {
      const geom = createMiteredWallGeometry(
        comp.size,
        comp.uv,
        comp.miterStart,
        comp.miterEnd,
      );
      const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
        editMode: this.editMode,
      });
      const mesh = new THREE.Mesh(geom, fallback);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.miteredWall = true;
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
      void this._applySimpleParamMaterial(mesh, comp, syncToken);
      return;
    }

    const { solids } = getBrushRenderSolids(comp, world ? { world, actor } : null);
    const tile = TEXTURE_TILE_EDITOR_UNITS;

    // Fully carved brush: keep an editor-only ghost so it remains selectable.
    if (!solids.length) {
      if (this.editMode) {
        const geom = new THREE.BoxGeometry(
          toMeters(comp.size.x),
          toMeters(comp.size.y),
          toMeters(comp.size.z),
        );
        const ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.45 }),
        );
        ghost.userData.actorId = actor.id;
        ghost.userData.pickable = true;
        ghost.userData.editorOnly = true;
        group.add(ghost);
        geom.dispose();
      }
      return;
    }

    for (const solid of solids) {
      const bias = {
        u: (solid.center.x / tile) * (Number(comp.uv?.scale?.x) || 1),
        v: (solid.center.y / tile) * (Number(comp.uv?.scale?.y) || 1),
      };
      const geom = solids.length === 1 && solid.role === 'solid'
        ? createBrushBoxGeometry(solid.size, comp.uv)
        : createBrushSolidGeometry(solid.size, comp.uv, bias);

      // Cut pieces inherit brush materials; slightly darker fallback for newly exposed faces.
      const baseColor = solid.role === 'cut' && !comp.materialId
        ? darkenHex(comp.color || '#888888', 0.12)
        : (comp.color || '#888888');
      const fallback = createFallbackBrushMaterial(baseColor, {
        editMode: this.editMode,
      });
      const mats = FACE_KEYS.map(() => fallback.clone());
      const mesh = new THREE.Mesh(geom, mats);
      mesh.position.set(
        toMeters(solid.center.x),
        toMeters(solid.center.y),
        toMeters(solid.center.z),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.brushSolid = solid.role;
      group.add(mesh);

      if (this.editMode) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geom),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.position.copy(mesh.position);
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        group.add(edges);
      }

      void this._applyBrushMaterials(mesh, comp, syncToken);
    }
  }

  _addStairVisual(group, actor, comp, syncToken) {
    const steps = createStairGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    steps.traverse((child) => {
      if (!child.isMesh) return;
      child.material = fallback.clone();
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.actorId = actor.id;
      child.userData.pickable = true;
      child.userData.stair = true;
      if (this.editMode) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        child.add(edges);
      }
      void this._applyRampMaterial(child, comp, syncToken);
    });
    group.add(steps);
  }

  _addRampVisual(group, actor, comp, syncToken) {
    const geom = createRampWedgeGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const mesh = new THREE.Mesh(geom, fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.ramp = true;
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

    void this._applyRampMaterial(mesh, comp, syncToken);
  }

  _addColumnVisual(group, actor, comp, syncToken) {
    const geom = createColumnGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9098', {
      editMode: this.editMode,
    });
    const mesh = new THREE.Mesh(geom, fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.column = true;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 24),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySimpleParamMaterial(mesh, comp, syncToken);
  }

  _addArchVisual(group, actor, comp, syncToken) {
    const geom = createArchGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const mesh = new THREE.Mesh(geom, fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.arch = true;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 20),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySimpleParamMaterial(mesh, comp, syncToken);
  }

  async _applySimpleParamMaterial(mesh, comp, syncToken) {
    if (!comp.materialId || !this.assetResolver?.getMaterialDefinition) return;
    const def = await this.assetResolver.getMaterialDefinition(comp.materialId);
    if (syncToken !== this._syncToken || !def) return;
    const mapResolver = (assetId) => {
      if (!this.assetResolver?.getTextureUrl) return null;
      return assetUrl(this.assetResolver.getTextureUrl(assetId));
    };
    const mat = await createThreeMaterial(def, mapResolver, {
      maxAnisotropy: this.maxAnisotropy,
    });
    if (syncToken !== this._syncToken) {
      mat.dispose?.();
      return;
    }
    const prev = mesh.material;
    mesh.material = mat;
    if (Array.isArray(prev)) prev.forEach((m) => m.dispose?.());
    else prev?.dispose?.();
  }

  _addCurvedWallVisual(group, actor, comp, syncToken) {
    const geom = createCurvedWallGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    const mesh = new THREE.Mesh(geom, fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.curvedWall = true;
    group.add(mesh);

    if (this.editMode) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geom, 24),
        new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
      );
      edges.userData.actorId = actor.id;
      edges.userData.editorOnly = true;
      group.add(edges);
    }

    void this._applySimpleParamMaterial(mesh, comp, syncToken);
  }

  async _applyRampMaterial(mesh, comp, syncToken) {
    if (!comp.materialId || !this.assetResolver?.getMaterialDefinition) return;
    const def = await this.assetResolver.getMaterialDefinition(comp.materialId);
    if (syncToken !== this._syncToken || !def) return;
    const mapResolver = (assetId) => {
      if (!this.assetResolver?.getTextureUrl) return null;
      return assetUrl(this.assetResolver.getTextureUrl(assetId));
    };
    const mat = await createThreeMaterial(def, mapResolver, {
      maxAnisotropy: this.maxAnisotropy,
    });
    if (syncToken !== this._syncToken) {
      mat.dispose?.();
      return;
    }
    const prev = mesh.material;
    mesh.material = mat;
    if (prev && prev !== mat) {
      if (Array.isArray(prev)) prev.forEach((m) => m.dispose?.());
      else prev.dispose?.();
    }
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
        // Soft contact shadows; normalBias reduces acne on large brush faces.
        light.shadow.bias = -0.0005;
        light.shadow.normalBias = 0.04;
        light.shadow.radius = 2;
        if (light.isDirectionalLight) {
          // Cover a hall-sized volume (~±20 m) from the fill light.
          const extent = 20;
          light.shadow.camera.left = -extent;
          light.shadow.camera.right = extent;
          light.shadow.camera.top = extent;
          light.shadow.camera.bottom = -extent;
          light.shadow.camera.near = 0.5;
          light.shadow.camera.far = 80;
          light.shadow.camera.updateProjectionMatrix();
        } else if (light.isSpotLight) {
          const rangeMeters = toMeters(comp.range ?? 1000);
          light.shadow.camera.near = 0.2;
          light.shadow.camera.far = Math.max(rangeMeters, 1);
          light.shadow.camera.updateProjectionMatrix();
        } else if (light.isPointLight) {
          const rangeMeters = toMeters(comp.range ?? 1000);
          light.shadow.camera.near = 0.2;
          light.shadow.camera.far = Math.max(rangeMeters, 1);
          light.shadow.camera.updateProjectionMatrix();
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

  setTransformMode(mode) {
    this.gizmo?.setMode?.(mode);
  }

  _updateGizmo(world) {
    if (!this.gizmo || !this.editMode) return;
    const brushStates = [];
    let primary = null;
    for (const id of this.selectedActorIds) {
      const actor = world?.getActor?.(id) || this._actorMeshes.get(id)?.actor;
      if (!actor) continue;
      const brush = actor.getComponent?.('Brush');
      const worldPos = getWorldTransform(actor, world || actor.world).position;
      const state = {
        position: { ...worldPos },
        // Face-scale handles only for brushes (parametric actors keep size in Details).
        size: brush ? { ...brush.size } : undefined,
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
    const hits = this.pickWorldHits(normalizedX, normalizedY, camera);
    return hits[0]?.actorId || null;
  }

  /**
   * Raycast all pickable meshes (including non-collidable props).
   * Returns nearest-first hits in editor units with normals and actor metadata.
   */
  pickWorldHits(normalizedX, normalizedY, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const meshes = [];
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.userData.pickable && !obj.userData.placementIgnore) {
        meshes.push(obj);
      }
    });
    const intersects = raycaster.intersectObjects(meshes, false);
    const seen = new Set();
    const hits = [];
    for (const inter of intersects) {
      const actorId = inter.object.userData.actorId || null;
      const key = `${actorId}|${inter.faceIndex}|${inter.distance.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const entry = actorId ? this._actorMeshes.get(actorId) : null;
      const actor = entry?.actor || null;
      const tags = actor?.tags ? [...actor.tags] : [];
      let brushKind = null;
      if (tags.includes('ceiling')) brushKind = 'ceiling';
      else if (tags.includes('floor')) brushKind = 'floor';
      else if (tags.includes('wall')) brushKind = 'wall';
      else if (tags.includes('box')) brushKind = 'box';

      const n = inter.face?.normal
        ? inter.face.normal.clone()
        : new THREE.Vector3(0, 1, 0);
      // Transform normal into world space.
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(inter.object.matrixWorld);
      n.applyMatrix3(normalMatrix).normalize();

      hits.push({
        actorId,
        distance: inter.distance,
        point: {
          x: inter.point.x * 100,
          y: inter.point.y * 100,
          z: inter.point.z * 100,
        },
        normal: { x: n.x, y: n.y, z: n.z },
        tags,
        brushKind,
        locked: Boolean(actor?.locked),
        visible: actor ? isEffectivelyVisible(actor, actor.world) : true,
        editorOnly: Boolean(inter.object.userData.editorOnly),
        placeable: inter.object.userData.placeable !== false,
        collidable: actor?.getComponent?.('Brush')?.collidable
          ?? actor?.getComponent?.('StaticMesh')?.collidable
          ?? true,
        componentType: actor?.components?.find((c) => c.enabled)?.type || null,
      });
    }
    return hits;
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
    this._clearCreatePreview();
    if (!boundsOrNull) return;

    const {
      min,
      max,
      operation,
      valid = true,
      kind = 'box',
      gridSize = DEFAULT_GRID_EDITOR_UNITS,
    } = boundsOrNull;
    const subtract = operation === 'subtract' || kind === 'subtract';
    const opts = { valid, subtract };

    const actor = this._previewActorFromBounds(kind, min, max, gridSize);
    const content = actor
      ? this._buildCreatePreviewContent(actor, opts)
      : null;

    if (content) {
      const root = new THREE.Group();
      root.userData.placementIgnore = true;
      const t = actor.transform;
      root.position.set(
        toMeters(t.position.x),
        toMeters(t.position.y),
        toMeters(t.position.z),
      );
      root.rotation.set(
        THREE.MathUtils.degToRad(t.rotation?.x || 0),
        THREE.MathUtils.degToRad(t.rotation?.y || 0),
        THREE.MathUtils.degToRad(t.rotation?.z || 0),
      );
      root.add(content);
      this.scene.add(root);
      this._createPreview = root;
      return;
    }

    // Fallback AABB (lights / unknown) — solid, not translucent
    const { mat, edgeMat } = this._previewMaterials(opts, '#8a9099');
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
      mat,
    );
    mesh.position.set(toMeters(center.x), toMeters(center.y), toMeters(center.z));
    mesh.userData.placementIgnore = true;
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat));
    this.scene.add(mesh);
    this._createPreview = mesh;
  }

  _previewActorFromBounds(kind, min, max, gridSize) {
    try {
      if (kind === 'ramp') {
        return createRampFromBounds({ min, max, gridSize, rise: DEFAULT_RAMP_RISE });
      }
      if (kind === 'stair') {
        return createStairFromBounds({ min, max, gridSize, totalRise: WALL_MODULE_SIZE });
      }
      if (kind === 'column') {
        return createColumnFromBounds({ min, max, gridSize });
      }
      if (kind === 'arch' || kind === 'archRoman' || kind === 'archGothic') {
        return createArchFromBounds({
          min,
          max,
          gridSize,
          archType: kind === 'archGothic' ? 'gothic' : 'roman',
        });
      }
      if (kind === 'curvedWall') {
        return createCurvedWallFromBounds({ min, max, gridSize });
      }
      if (kind === 'box' || kind === 'wall' || kind === 'floor' || kind === 'ceiling' || kind === 'subtract') {
        return createBrushFromBounds({
          kind: kind === 'subtract' ? 'box' : kind,
          min,
          max,
          gridSize,
          operation: kind === 'subtract' ? 'subtract' : 'add',
        });
      }
    } catch (err) {
      console.warn('[SceneView] create-preview actor failed', kind, err);
      return null;
    }
    return null;
  }

  /**
   * Solid preview materials matching the placed object (not translucent ghosts).
   * Subtract cutters stay translucent so they read as volumes.
   */
  _previewMaterials({ valid = true, subtract = false } = {}, color = '#8a9099') {
    if (!valid) {
      return {
        mat: new THREE.MeshStandardMaterial({
          color: 0xc23b4a,
          roughness: 0.7,
          metalness: 0.05,
          emissive: 0xc23b4a,
          emissiveIntensity: 0.12,
        }),
        edgeMat: new THREE.LineBasicMaterial({ color: 0xff6688 }),
      };
    }
    if (subtract) {
      return {
        mat: new THREE.MeshBasicMaterial({
          color: SUBTRACT_COLOR,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
        edgeMat: new THREE.LineBasicMaterial({ color: SUBTRACT_COLOR }),
      };
    }
    return {
      mat: createFallbackBrushMaterial(color, { editMode: true }),
      edgeMat: new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
    };
  }

  _buildCreatePreviewContent(actor, { valid = true, subtract = false } = {}) {
    const mark = (obj) => {
      obj.userData.placementIgnore = true;
      obj.traverse?.((c) => { c.userData.placementIgnore = true; });
      return obj;
    };
    const applyMat = (mesh, color) => {
      const { mat, edgeMat } = this._previewMaterials({ valid, subtract }, color);
      mesh.material = mat;
      mesh.castShadow = !subtract && valid;
      mesh.receiveShadow = !subtract && valid;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat));
      return mark(mesh);
    };

    const brush = actor.getComponent('Brush');
    if (brush) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          toMeters(brush.size.x),
          toMeters(brush.size.y),
          toMeters(brush.size.z),
        ),
      );
      return applyMat(mesh, brush.color || '#8a9099');
    }

    const ramp = actor.getComponent('Ramp');
    if (ramp) return applyMat(new THREE.Mesh(createRampWedgeGeometry(ramp)), ramp.color || '#8a9099');

    const stair = actor.getComponent('Stair');
    if (stair) {
      const steps = createStairGeometry(stair);
      const color = stair.color || '#8a9099';
      steps.traverse((child) => {
        if (!child.isMesh) return;
        applyMat(child, color);
      });
      return mark(steps);
    }

    const column = actor.getComponent('Column');
    if (column) {
      return applyMat(new THREE.Mesh(createColumnGeometry(column)), column.color || '#8a9099');
    }

    const arch = actor.getComponent('Arch');
    if (arch) return applyMat(new THREE.Mesh(createArchGeometry(arch)), arch.color || '#8a9099');

    const curved = actor.getComponent('CurvedWall');
    if (curved) {
      return applyMat(new THREE.Mesh(createCurvedWallGeometry(curved)), curved.color || '#8a9099');
    }

    return null;
  }

  /**
   * Solid placement preview + optional surface highlight disc.
   * Geometry tools use the same factory mesh as create-drag preview.
   * @param {null|{
   *   position:{x:number,y:number,z:number},
   *   size?:{x:number,y:number,z:number},
   *   valid?:boolean,
   *   normal?:{x:number,y:number,z:number},
   *   rotation?:{x:number,y:number,z:number},
   *   gridSnap?:boolean,
   *   kind?:string|null,
   *   min?:{x:number,y:number,z:number}|null,
   *   max?:{x:number,y:number,z:number}|null,
   *   gridSize?:number,
   * }} state
   */
  setPlacementPreview(state) {
    this._clearPlacementPreview();
    if (!state?.position) return;

    const valid = state.valid !== false;
    const size = state.size || { x: 40, y: 40, z: 40 };
    const opts = { valid, subtract: false };
    const group = new THREE.Group();
    group.userData.placementIgnore = true;

    let placedMesh = false;
    const kind = state.kind;
    const min = state.min;
    const max = state.max;
    const gridSize = state.gridSize || DEFAULT_GRID_EDITOR_UNITS;
    if (kind && min && max) {
      const actor = this._previewActorFromBounds(kind, min, max, gridSize);
      const content = actor
        ? this._buildCreatePreviewContent(actor, opts)
        : null;
      if (content && actor) {
        const root = new THREE.Group();
        root.userData.placementIgnore = true;
        const t = actor.transform;
        root.position.set(
          toMeters(t.position.x),
          toMeters(t.position.y),
          toMeters(t.position.z),
        );
        const rot = state.rotation || t.rotation;
        root.rotation.set(
          THREE.MathUtils.degToRad(rot?.x || 0),
          THREE.MathUtils.degToRad(rot?.y || 0),
          THREE.MathUtils.degToRad(rot?.z || 0),
        );
        root.add(content);
        group.add(root);
        placedMesh = true;
      }
    }

    if (!placedMesh) {
      const { mat, edgeMat } = this._previewMaterials(opts, '#8a9099');
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(toMeters(size.x), toMeters(size.y), toMeters(size.z)),
        mat,
      );
      box.position.set(
        toMeters(state.position.x),
        toMeters(state.position.y),
        toMeters(state.position.z),
      );
      box.userData.placementIgnore = true;
      box.add(new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), edgeMat));
      group.add(box);
    }

    if (state.normal) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(toMeters(28), 24),
        new THREE.MeshBasicMaterial({
          color: valid ? 0xa8c8e8 : 0xff6688,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      disc.position.set(
        toMeters(state.position.x),
        toMeters(state.position.y),
        toMeters(state.position.z),
      );
      // Orient disc to surface normal.
      const n = new THREE.Vector3(state.normal.x, state.normal.y, state.normal.z).normalize();
      disc.lookAt(disc.position.clone().add(n));
      disc.userData.placementIgnore = true;
      group.add(disc);
    }

    this.scene.add(group);
    this._placementPreview = group;
  }

  _clearCreatePreview() {
    if (this._createPreview) {
      this.scene.remove(this._createPreview);
      disposeObject(this._createPreview);
      this._createPreview = null;
    }
  }

  _clearPlacementPreview() {
    if (this._placementPreview) {
      this.scene.remove(this._placementPreview);
      disposeObject(this._placementPreview);
      this._placementPreview = null;
    }
  }

  render(camera = this.camera) {
    this.renderer.render(this.scene, camera);
  }

  dispose() {
    this.clearWorldMeshes();
    this.setCreatePreview(null);
    this.setPlacementPreview(null);
    if (this.gizmo) {
      this.gizmo.dispose();
      this.gizmo = null;
    }
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      disposeObject(this.gridHelper);
    }
    this._studioEnv?.dispose?.();
    this.scene.environment = null;
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

/** Darken a CSS hex for cut-face fallback tinting. */
function darkenHex(hex, amount = 0.1) {
  const raw = String(hex || '#888888').replace('#', '');
  if (raw.length !== 6) return hex;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n)) return hex;
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
