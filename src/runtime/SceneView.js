import * as THREE from 'three';
import {
  toMeters,
  DEFAULT_GRID_EDITOR_UNITS,
  GRID_EXTENT_EDITOR_UNITS,
  WALL_MODULE_SIZE,
} from '../core/units.js';
import {
  DEFAULT_WORLD_AMBIENT,
  WORLD_AMBIENT_LIGHT_RATIO,
  migrateLegacyWorldAmbient,
  worldAmbientFillStrength,
} from '../core/World.js';

const EDIT_FILL_BASE_INTENSITY = 0.06;
const EDIT_FILL2_BASE_INTENSITY = 0.03;
import { BrushGizmo } from '../editor/BrushGizmo.js';
import { FACE_KEYS } from '../materials/MaterialDefinition.js';
import {
  getChildren,
  getRootActors,
  getWorldMatrix,
  getWorldTransform,
  isEffectivelyVisible,
} from '../core/hierarchy.js';
import { mat4TransformPoint } from '../core/math3d.js';
import {
  edgesCentroidLocal,
  facesCentroidLocal,
  listGeometryEdges,
  parseEdgeKey,
  verticesCentroidLocal,
} from '../geometry/edits.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  createBrushBoxGeometry,
  createBrushSolidGeometry,
  getBrushRenderSolids,
} from './brushGeometry.js';
import {
  isSubtractBrush,
  isWorldSolidActor,
  solidFacesOnBrushHull,
} from './brushBoolean.js';
import { createRampWedgeGeometry } from './rampGeometry.js';
import { createStairGeometry } from './stairGeometry.js';
import { createColumnGeometry } from './columnGeometry.js';
import { createArchGeometry } from './archGeometry.js';
import { createCurvedWallGeometry } from './curvedWallGeometry.js';
import { brushHasMiters, createMiteredWallGeometry } from './miteredWallGeometry.js';
import { createConvexBrushGeometry } from './convexBrushGeometry.js';
import {
  createThreeMaterial,
  createFallbackBrushMaterial,
  assetUrl,
} from './materialFactory.js';
import {
  BOX_SURFACE_IDS,
  getStructuralComponent,
  resolveSurfaceMaterialId,
  surfaceIdFromHit,
} from './surfaces.js';
import { cloneLoadedMesh } from './meshLoader.js';
import { installStudioEnvironment } from './studioEnvironment.js';
import { createBrushFromBounds } from '../editor/brushFactory.js';
import { createRampFromBounds } from '../editor/rampFactory.js';
import { createStairFromBounds } from '../editor/stairFactory.js';
import { createColumnFromBounds } from '../editor/columnFactory.js';
import { createArchFromBounds } from '../editor/archFactory.js';
import { createCurvedWallFromBounds } from '../editor/curvedWallFactory.js';
import { DEFAULT_RAMP_RISE } from '../components/RampComponent.js';
import {
  applyDisplayMode,
  restoreDisplayMode,
  ensureEdgesOverlay,
} from '../editor/viewport/viewportDisplay.js';
import {
  createPaneCamera,
  applyPanePose,
  updateOrthoFrustum,
  updatePerspectiveAspect,
  gridPlaneForCameraMode,
} from '../editor/viewport/viewportCameras.js';
import { normalizeCameraMode } from '../editor/viewport/viewportPrefs.js';
import { paneScissorFromDomRect } from '../editor/viewport/paneScissor.js';

const DEFAULT_VIEWPORT_COLORS = {
  background: 0x0e1218,
  gridMajor: 0x4a5568,
  gridMinor: 0x2a3038,
  selection: 0xffcc33,
  subtract: 0xc23b4a,
};

/**
 * Three.js adapter: builds and syncs visual representation of a World.
 * Gameplay logic does not live here.
 */
export class SceneView {
  constructor({ canvas, editMode = true } = {}) {
    this.canvas = canvas;
    this.editMode = editMode;
    /** Unreal-style Game View (G) — hides editor helpers while editing. */
    this.gameView = false;
    this.viewportColors = { ...DEFAULT_VIEWPORT_COLORS };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.viewportColors.background);

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

    this._studioEnv = installStudioEnvironment(this.renderer, this.scene, {
      intensity: DEFAULT_WORLD_AMBIENT.intensity,
    });

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 8;
    this.maxAnisotropy = Math.min(16, maxAniso);

    this.root = new THREE.Group();
    this.root.name = 'WorldRoot';
    this.scene.add(this.root);

    // Editor fill lights — hidden in play so authored lights dominate.
    // Levels override via world.ambient (World Settings) — drives IBL + AmbientLight.
    this._worldAmbient = { ...DEFAULT_WORLD_AMBIENT };
    this.ambient = new THREE.AmbientLight(
      DEFAULT_WORLD_AMBIENT.color,
      DEFAULT_WORLD_AMBIENT.intensity * WORLD_AMBIENT_LIGHT_RATIO,
    );
    this.scene.add(this.ambient);

    this.editFill = new THREE.DirectionalLight(0x7a9ac0, EDIT_FILL_BASE_INTENSITY);
    this.editFill.position.set(6, 10, 4);
    this.editFill.castShadow = false;
    this.scene.add(this.editFill);
    this.editFill2 = new THREE.DirectionalLight(0x405070, EDIT_FILL2_BASE_INTENSITY);
    this.editFill2.position.set(-5, 4, -6);
    this.editFill2.castShadow = false;
    this.scene.add(this.editFill2);

    this.gridHelper = null;
    this.gridSize = DEFAULT_GRID_EDITOR_UNITS;
    this._actorMeshes = new Map();
    this._selectionHelpers = [];
    this._surfaceHighlight = null;
    /** @type {{ actorId: string, surfaceId: string } | null} */
    this.selectedSurface = null;
    /** Align-to-Neighbor reference (Phase 2E.3); highlighted separately from selection. */
    this.alignReferenceSurface = null;
    this.selectedActorIds = [];
    /** @type {{ mode: string, items: Array<{actorId:string, ids:string[]}>, primary: {actorId:string,id:string}|null } | null} */
    this.geometrySelection = null;
    this._geometryFaceOverlays = [];
    /** Screen-space edge/vertex pick threshold in CSS pixels (Phase 2F.2 / 2F.3). */
    this.geometryEdgePickThresholdPx = 12;
    this.geometryVertexPickThresholdPx = 12;
    this._syncToken = 0;

    /** @type {{ getTextureUrl:(id:string)=>string|null, getMaterialDefinition:(id:string)=>Promise<object|null>, getMeshUrl:(id:string)=>string|null } | null} */
    this.assetResolver = null;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this.gizmo = null;
    this._createPreview = null;
    this._placementPreview = null;

    /** @type {Map<string, THREE.Camera>} Independent cameras per viewport pane */
    this._paneCameras = new Map();
    /** Active pane id for input / Play capture (legacy `this.camera` mirrors it). */
    this.activePaneId = 'pane-0';
    this._gridPlane = 'xz';
    this._size = { width: 1, height: 1 };

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
    const { gridMajor, gridMinor } = this.viewportColors;
    this.gridHelper = new THREE.GridHelper(extentMeters, divisions, gridMajor, gridMinor);
    this.gridHelper.userData.baseQuaternion = this.gridHelper.quaternion.clone();
    this.scene.add(this.gridHelper);
    this._applyGridPlane(this._gridPlane);
  }

  /**
   * Orient the edit grid to the active orthographic plane.
   * @param {'xz'|'xy'|'zy'} plane
   */
  _applyGridPlane(plane) {
    this._gridPlane = plane || 'xz';
    if (!this.gridHelper) return;
    this.gridHelper.rotation.set(0, 0, 0);
    // GridHelper lies on XZ by default.
    if (this._gridPlane === 'xy') {
      this.gridHelper.rotation.x = Math.PI / 2;
    } else if (this._gridPlane === 'zy') {
      this.gridHelper.rotation.z = Math.PI / 2;
    }
    this.gridHelper.updateMatrixWorld(true);
  }

  setGridPlaneForCameraMode(cameraMode) {
    this._applyGridPlane(gridPlaneForCameraMode(cameraMode));
  }

  /**
   * Apply editor viewport color prefs (background, grid, selection, subtract).
   * @param {Partial<typeof DEFAULT_VIEWPORT_COLORS>} colors integer RGB colors
   * @param {import('../core/World.js').World|null} [world] used to refresh selection helpers
   */
  setViewportColors(colors = {}, world = null) {
    if (!colors || typeof colors !== 'object') return;
    for (const key of Object.keys(DEFAULT_VIEWPORT_COLORS)) {
      const value = colors[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        this.viewportColors[key] = value >>> 0;
      }
    }
    this.scene.background.set(this.viewportColors.background);
    if (this.editMode) this.setGridSize(this.gridSize);
    this._applySubtractColorsToMeshes();
    if (this.selectedActorIds.length) {
      this.setSelection([...this.selectedActorIds], world);
    }
  }

  _applySubtractColorsToMeshes() {
    const color = this.viewportColors.subtract;
    for (const entry of this._actorMeshes.values()) {
      entry.group.traverse((obj) => {
        if (obj.userData?.brushOperation !== 'subtract') return;
        if (obj.material?.color) obj.material.color.setHex(color);
      });
      // Edge lines paired with subtract meshes (no brushOperation flag on edges).
      entry.group.traverse((obj) => {
        if (!obj.isLineSegments || !obj.userData?.editorOnly) return;
        if (obj.material?.color && entry.actor?.getComponent?.('Brush')?.operation === 'subtract') {
          obj.material.color.setHex(color);
        }
      });
    }
  }

  /**
   * Apply level-authored scene ambient fill (color + edit/play intensity).
   * Does not affect Ambient Light actors.
   */
  applyWorldAmbient(settings) {
    this._worldAmbient = migrateLegacyWorldAmbient(settings);
    this._syncAmbientFromWorld();
  }

  _syncAmbientFromWorld() {
    const { color } = this._worldAmbient;
    // Black (or intensity 0) must kill fill: IBL + AmbientLight + editor fill dir lights.
    // Strength is intensity × luminance(color) normalized so the default color keeps look.
    const fill = worldAmbientFillStrength(this._worldAmbient, { editMode: this.editMode });
    const defaultFill = DEFAULT_WORLD_AMBIENT.intensity || 0.12;
    const fillScale = defaultFill > 1e-8 ? fill / defaultFill : 0;
    const dark = fill < 1e-6;

    if (this.scene) {
      // Intensity 0 alone can still leave a faint IBL contribution — detach env when dark.
      this.scene.environment = dark ? null : this._studioEnv;
      this.scene.environmentIntensity = dark ? 0 : fill;
    }
    if (this.ambient) {
      this.ambient.color.set(color);
      this.ambient.intensity = dark ? 0 : fill * WORLD_AMBIENT_LIGHT_RATIO;
      this.ambient.visible = !dark;
    }
    const showEditorFill = this.editMode && !this.gameView && !dark;
    if (this.editFill) {
      this.editFill.color.set(color);
      this.editFill.intensity = dark ? 0 : EDIT_FILL_BASE_INTENSITY * fillScale;
      this.editFill.visible = showEditorFill;
    }
    if (this.editFill2) {
      this.editFill2.color.set(color);
      this.editFill2.intensity = dark ? 0 : EDIT_FILL2_BASE_INTENSITY * fillScale;
      this.editFill2.visible = showEditorFill;
    }

    // Kill leftover fallback-brush emissive glow from older material builds.
    this._suppressFallbackEmissiveWhenDark(dark);
  }

  _suppressFallbackEmissiveWhenDark(dark) {
    for (const entry of this._actorMeshes.values()) {
      entry.group?.traverse((obj) => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (!mat?.isMeshStandardMaterial) continue;
          if (mat.userData.bbKeepEmissive) continue;
          // Authored materials keep emissive; fallback brushes used color-matched emissive.
          if (mat.userData.bbFallbackBrush || (
            mat.emissiveIntensity > 0
            && mat.emissive
            && mat.color
            && mat.emissive.getHex() === mat.color.getHex()
            && mat.emissiveIntensity <= 0.1
          )) {
            if (mat.userData._bbEmissiveBackup == null) {
              mat.userData._bbEmissiveBackup = mat.emissiveIntensity;
            }
            mat.emissiveIntensity = dark ? 0 : (mat.userData._bbEmissiveBackup || 0);
          }
        }
      });
    }
  }

  /**
   * Unreal-style Game View (G): hide editor-only helpers (light icons, grid, gizmos,
   * edge overlays) while keeping authored meshes and real lights.
   */
  setGameView(enabled) {
    this.gameView = Boolean(enabled);
    this._applyEditorOverlayVisibility();
    this._syncAmbientFromWorld();
  }

  toggleGameView() {
    this.setGameView(!this.gameView);
    return this.gameView;
  }

  /** Editor chrome visible only in edit mode when Game View is off. */
  _showEditorOverlays() {
    return this.editMode && !this.gameView;
  }

  _applyEditorOverlayVisibility() {
    const show = this._showEditorOverlays();
    if (this.gridHelper) this.gridHelper.visible = show;
    if (this.gizmo) this.gizmo.setVisible(show && this.selectedActorIds.length > 0);
    if (this._createPreview) this._createPreview.visible = show;
    if (this._surfaceHighlight) this._surfaceHighlight.visible = show;
    for (const helper of this._selectionHelpers) {
      if (helper) helper.visible = show;
    }
    for (const overlay of this._geometryFaceOverlays) {
      if (overlay) overlay.visible = show;
    }
    for (const entry of this._actorMeshes.values()) {
      entry.group?.traverse((obj) => {
        if (obj.userData?.editorOnly) obj.visible = show;
      });
    }
  }

  setEditMode(editMode) {
    this.editMode = editMode;
    if (!editMode) this.gameView = false;
    this._syncAmbientFromWorld();
    this._applyEditorOverlayVisibility();
  }

  setSize(width, height) {
    if (width <= 0 || height <= 0) return;
    this._size.width = width;
    this._size.height = height;
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.isOrthographicCamera) {
      const frustum = this.camera.userData.frustumSize
        || Math.abs(this.camera.top - this.camera.bottom)
        || 12;
      updateOrthoFrustum(this.camera, frustum, width / height);
    }
    this.renderer.setSize(width, height, false);
  }

  /**
   * Ensure a camera exists for a pane. Recreates when camera mode changes.
   * @returns {THREE.Camera}
   */
  ensurePaneCamera(paneId, cameraMode, paneState = null) {
    const mode = normalizeCameraMode(cameraMode);
    let cam = this._paneCameras.get(paneId);
    if (!cam || cam.userData.viewportMode !== mode) {
      if (cam) {
        // Drop old camera; not added to scene.
        this._paneCameras.delete(paneId);
      }
      const aspect = this._size.width / Math.max(this._size.height, 1);
      cam = createPaneCamera(mode, aspect);
      this._paneCameras.set(paneId, cam);
      if (paneState) applyPanePose(cam, { ...paneState, cameraMode: mode });
    }
    return cam;
  }

  getPaneCamera(paneId) {
    return this._paneCameras.get(paneId) || null;
  }

  /**
   * Promote a pane camera to `this.camera` so Play capture / legacy paths stay valid.
   */
  setActivePaneCamera(paneId, cameraMode, paneState = null) {
    const cam = this.ensurePaneCamera(paneId, cameraMode, paneState);
    this.activePaneId = paneId;
    this.camera = cam;
    return cam;
  }

  /** Update projection for a pane from its CSS pixel rect inside the canvas. */
  updatePaneCameraProjection(camera, rect) {
    if (!camera || !rect || rect.width <= 0 || rect.height <= 0) return;
    const aspect = rect.width / rect.height;
    if (camera.isPerspectiveCamera) {
      updatePerspectiveAspect(camera, aspect);
    } else if (camera.isOrthographicCamera) {
      const frustum = camera.userData.frustumSize
        || Math.abs(camera.top - camera.bottom)
        || 12;
      updateOrthoFrustum(camera, frustum, aspect);
    }
  }

  _ensureActorEdgesOverlays() {
    for (const entry of this._actorMeshes.values()) {
      entry.group?.traverse((obj) => {
        if (obj.isMesh && obj.geometry && !obj.userData?.editorOnly) {
          ensureEdgesOverlay(obj, entry.group);
        }
      });
    }
  }

  /**
   * Render multiple panes with scissor. Shared scene — no duplicated geometry.
   * @param {Array<{ paneId: string, rect: {x:number,y:number,width:number,height:number}, cameraMode: string, displayMode: string, paneState?: object }>} panes
   * Rects use top-left CSS pixel origin (DOM); converted to WebGL bottom-left.
   */
  renderViewports(panes) {
    if (!Array.isArray(panes) || panes.length === 0) {
      this.render(this.camera);
      return;
    }

    // Three.js setViewport/setScissor take CSS/logical pixels and multiply by
    // pixelRatio internally — do NOT pre-scale by DPR (double-scale breaks HiDPI).
    const canvasH = this._size.height || 1;
    this._ensureActorEdgesOverlays();

    this.renderer.setScissorTest(true);
    const lights = [this.ambient, this.editFill, this.editFill2];

    for (const pane of panes) {
      const rect = pane.rect;
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;

      const cam = this.ensurePaneCamera(pane.paneId, pane.cameraMode, pane.paneState);
      this.updatePaneCameraProjection(cam, rect);

      const scissor = paneScissorFromDomRect(rect, canvasH);
      this.renderer.setViewport(scissor.x, scissor.y, scissor.width, scissor.height);
      this.renderer.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);

      if (this._showEditorOverlays() && this.gridHelper) {
        this._applyGridPlane(gridPlaneForCameraMode(pane.cameraMode));
      }

      // Axis gizmo screen size follows this pane’s camera; face-resize stays object-sized.
      this.gizmo?.updateScreenScale?.(cam);

      const displayState = applyDisplayMode(this.scene, lights, pane.displayMode || 'lit');
      this.renderer.render(this.scene, cam);
      restoreDisplayMode(displayState);
    }

    this.renderer.setScissorTest(false);
    // Reset full-canvas viewport for any follow-up readbacks (logical px).
    const fullW = Math.max(1, Math.round(this._size.width || 1));
    const fullH = Math.max(1, Math.round(this._size.height || 1));
    this.renderer.setViewport(0, 0, fullW, fullH);
  }

  render(camera = this.camera) {
    this.renderer.setScissorTest(false);
    const fullW = Math.max(1, Math.round(this._size.width || 1));
    const fullH = Math.max(1, Math.round(this._size.height || 1));
    this.renderer.setViewport(0, 0, fullW, fullH);
    this.gizmo?.updateScreenScale?.(camera);
    this.renderer.render(this.scene, camera);
  }

  clearWorldMeshes() {
    this._clearGeometryFaceOverlays();
    for (const entry of this._actorMeshes.values()) {
      this.root.remove(entry.group);
      disposeObject(entry.group);
    }
    this._actorMeshes.clear();
    this._clearSelectionHelpers();
  }

  syncFromWorld(world) {
    const token = ++this._syncToken;
    if (world) {
      world.ambient = migrateLegacyWorldAmbient(world.ambient);
      this.applyWorldAmbient(world.ambient);
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
   * Rebuild only this actor's brush / convex-brush meshes in place.
   * Avoids syncFromWorld on every gizmo resize sample (which was disposing the
   * entire scene graph and could make brushes vanish).
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

    const token = ++this._syncToken;
    if (convex) this._addConvexBrushVisual(entry.group, actor, convex, token);
    else this._addBrushVisual(entry.group, actor, brush, token);
    for (const child of childGroups) {
      entry.group.add(child);
    }

    this.updateActorTransform(actor);
    if (this.geometrySelection?.items?.some((it) => it.actorId === actor.id)) {
      this._refreshGeometryFaceOverlays(actor.world);
      this._updateGeometryGizmo(actor.world);
    }
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
      } else if (comp.type === 'ConvexBrush') {
        this._addConvexBrushVisual(group, actor, comp, syncToken);
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

  _addConvexBrushVisual(group, actor, comp, syncToken) {
    if (!comp?.geometry) {
      if (this.editMode) {
        const ghost = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)),
          new THREE.LineBasicMaterial({ color: 0xaa3344, transparent: true, opacity: 0.7 }),
        );
        ghost.userData.actorId = actor.id;
        ghost.userData.pickable = true;
        ghost.userData.editorOnly = true;
        ghost.userData.convexInvalid = true;
        group.add(ghost);
      }
      return;
    }

    const geom = createConvexBrushGeometry(comp);
    if (!geom) return;

    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || [];
    const mats = surfaceIds.map(() => fallback.clone());
    const mesh = new THREE.Mesh(geom, mats.length ? mats : fallback);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.convexBrush = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
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

    void this._applySurfaceMaterials(mesh, comp, syncToken);
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
      const subtractColor = this.viewportColors.subtract;
      const mat = new THREE.MeshBasicMaterial({
        color: subtractColor,
        transparent: true,
        opacity: 0.14,
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
        new THREE.LineBasicMaterial({ color: subtractColor }),
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
        comp.faceUVs,
      );
      const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
        editMode: this.editMode,
      });
      const surfaceIds = geom.userData.surfaceIds || [...BOX_SURFACE_IDS];
      const mats = surfaceIds.map(() => fallback.clone());
      const mesh = new THREE.Mesh(geom, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.actorId = actor.id;
      mesh.userData.pickable = true;
      mesh.userData.miteredWall = true;
      mesh.userData.surfaceScheme = 'grouped';
      mesh.userData.surfaceIds = surfaceIds;
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
      void this._applySurfaceMaterials(mesh, comp, syncToken);
      return;
    }

    const { solids } = getBrushRenderSolids(comp, world ? { world, actor } : null);

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

    const hideOuterHull = isWorldSolidActor(actor);
    let anyVisibleFace = false;

    for (const solid of solids) {
      // Brush-local min corner so cut pieces share continuous world-aligned UVs.
      const bias = {
        origin: {
          x: solid.center.x - solid.size.x * 0.5,
          y: solid.center.y - solid.size.y * 0.5,
          z: solid.center.z - solid.size.z * 0.5,
        },
      };
      const geom = solids.length === 1 && solid.role === 'solid'
        ? createBrushBoxGeometry(solid.size, comp.uv, comp.faceUVs)
        : createBrushSolidGeometry(solid.size, comp.uv, bias, comp.faceUVs);

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
      mesh.userData.surfaceScheme = 'box';
      mesh.userData.surfaceIds = [...BOX_SURFACE_IDS];

      // World Solid = invisible substrate. Only faces opened by subtract cuts render.
      if (hideOuterHull) {
        const hull = solidFacesOnBrushHull(solid, comp.size);
        mesh.userData.hideHullFaces = hull;
        this._applyHiddenHullFaces(mesh);
        if (FACE_KEYS.some((key) => !hull[key])) anyVisibleFace = true;
      } else {
        anyVisibleFace = true;
      }

      group.add(mesh);

      if (this.editMode && !hideOuterHull) {
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

    // Substrate outline so World Solid stays findable when its hull is hidden.
    if (hideOuterHull && this.editMode) {
      const ghostGeom = new THREE.BoxGeometry(
        toMeters(comp.size.x),
        toMeters(comp.size.y),
        toMeters(comp.size.z),
      );
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(ghostGeom),
        new THREE.LineBasicMaterial({
          color: anyVisibleFace ? 0x4a5560 : 0x667788,
          transparent: true,
          opacity: anyVisibleFace ? 0.35 : 0.55,
        }),
      );
      ghost.userData.actorId = actor.id;
      ghost.userData.pickable = true;
      ghost.userData.editorOnly = true;
      ghost.userData.worldSolidGhost = true;
      group.add(ghost);
      ghostGeom.dispose();
    }
  }

  /** Hide materials for World Solid faces that still sit on the outer brush hull. */
  _applyHiddenHullFaces(mesh) {
    const hull = mesh?.userData?.hideHullFaces;
    if (!hull || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < FACE_KEYS.length; i += 1) {
      const mat = mats[i];
      if (!mat) continue;
      const hide = Boolean(hull[FACE_KEYS[i]]);
      mat.visible = !hide;
      if (hide) {
        mat.colorWrite = false;
        mat.depthWrite = false;
      }
    }
  }

  _addStairVisual(group, actor, comp, syncToken) {
    const steps = createStairGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    steps.traverse((child) => {
      if (!child.isMesh) return;
      const surfaceIds = child.geometry.userData.surfaceIds || [...BOX_SURFACE_IDS];
      const isBox = !child.geometry.userData.surfaceIds;
      child.material = surfaceIds.map(() => fallback.clone());
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.actorId = actor.id;
      child.userData.pickable = true;
      child.userData.stair = true;
      child.userData.surfaceScheme = isBox ? 'box' : 'grouped';
      child.userData.surfaceIds = surfaceIds;
      if (this.editMode) {
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry),
          new THREE.LineBasicMaterial({ color: 0xc0c8d0 }),
        );
        edges.userData.actorId = actor.id;
        edges.userData.editorOnly = true;
        child.add(edges);
      }
      void this._applySurfaceMaterials(child, comp, syncToken);
    });
    group.add(steps);
  }

  _addRampVisual(group, actor, comp, syncToken) {
    const geom = createRampWedgeGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['slope'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.ramp = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
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

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addColumnVisual(group, actor, comp, syncToken) {
    const geom = createColumnGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9098', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['shaft'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.column = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
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

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addArchVisual(group, actor, comp, syncToken) {
    const geom = createArchGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#7a8494', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['outer'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.arch = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
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

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  async _applySimpleParamMaterial(mesh, comp, syncToken) {
    return this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  _addCurvedWallVisual(group, actor, comp, syncToken) {
    const geom = createCurvedWallGeometry(comp);
    const fallback = createFallbackBrushMaterial(comp.color || '#8a9099', {
      editMode: this.editMode,
    });
    const surfaceIds = geom.userData.surfaceIds || ['outer'];
    const mesh = new THREE.Mesh(geom, surfaceIds.map(() => fallback.clone()));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.actorId = actor.id;
    mesh.userData.pickable = true;
    mesh.userData.curvedWall = true;
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = surfaceIds;
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

    void this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  async _applyRampMaterial(mesh, comp, syncToken) {
    return this._applySurfaceMaterials(mesh, comp, syncToken);
  }

  /**
   * Apply actor materialId + faceMaterials overrides onto a multi-material mesh.
   * surfaceIds come from mesh.userData (semantic IDs, not triangle indices).
   */
  async _applySurfaceMaterials(mesh, comp, syncToken) {
    const resolver = this.assetResolver;
    if (!resolver?.getMaterialDefinition) return;
    const surfaceIds = mesh.userData?.surfaceIds
      || mesh.geometry?.userData?.surfaceIds
      || null;

    const mapResolver = (assetId) => {
      if (!resolver?.getTextureUrl) return null;
      return assetUrl(resolver.getTextureUrl(assetId));
    };
    const resolveDef = async (materialId) => {
      if (!materialId) return null;
      return resolver.getMaterialDefinition(materialId);
    };

    // Single-material fallback path (no surface groups).
    if (!surfaceIds?.length || !Array.isArray(mesh.material)) {
      const matId = comp.materialId;
      if (!matId) return;
      const def = await resolveDef(matId);
      if (syncToken !== this._syncToken || !def) return;
      const mat = await createThreeMaterial(def, mapResolver, {
        maxAnisotropy: this.maxAnisotropy,
      });
      if (syncToken !== this._syncToken) {
        disposeMaterial(mat);
        return;
      }
      const prev = mesh.material;
      mesh.material = mat;
      if (prev && prev !== mat) {
        if (Array.isArray(prev)) prev.forEach((m) => disposeMaterial(m));
        else disposeMaterial(prev);
      }
      return;
    }

    const defaultDef = await resolveDef(comp.materialId);
    if (syncToken !== this._syncToken) return;

    for (let i = 0; i < surfaceIds.length; i += 1) {
      const surfaceId = surfaceIds[i];
      const faceMatId = resolveSurfaceMaterialId(comp, surfaceId);
      let def = null;
      if (faceMatId && faceMatId === comp.materialId) def = defaultDef;
      else if (faceMatId) def = await resolveDef(faceMatId);
      if (syncToken !== this._syncToken) return;
      if (!def) continue;

      const mat = await createThreeMaterial(def, mapResolver, {
        maxAnisotropy: this.maxAnisotropy,
      });
      if (syncToken !== this._syncToken) {
        disposeMaterial(mat);
        return;
      }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
        if (mat[key]) mat[key].anisotropy = this.maxAnisotropy;
      }
      const old = mesh.material[i];
      mesh.material[i] = mat;
      disposeMaterial(old);
    }
    mesh.material.needsUpdate = true;
    if (this.selectedSurface?.actorId === mesh.userData.actorId) {
      this._refreshSurfaceHighlight();
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
        // The scene may have been rebuilt while textures loaded; this mesh is
        // already disposed, so release the new material instead of attaching it.
        if (syncToken !== this._syncToken) {
          disposeMaterial(mat);
          return;
        }
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          if (mat[key]) mat[key].anisotropy = this.maxAnisotropy;
        }
        const old = mesh.material[i];
        mesh.material[i] = mat;
        disposeMaterial(old);
      }
    }
    // Re-apply after async material swap (World Solid outer hull stays invisible).
    this._applyHiddenHullFaces(mesh);
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
      halo.userData.denseWireHelper = true;
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
      const helper = new THREE.Box3Helper(box, this.viewportColors.selection);
      helper.name = 'SelectionHelper';
      helper.visible = this._showEditorOverlays();
      this.scene.add(helper);
      this._selectionHelpers.push(helper);
    }

    this._updateGizmo(world);
  }

  setTransformMode(mode) {
    this.gizmo?.setMode?.(mode);
  }

  /** @param {'face'|'gizmo'} style */
  setScaleHandleStyle(style) {
    this.gizmo?.setScaleHandleStyle?.(style);
  }

  /**
   * Geometry Face/Edge/Vertex selection overlays + gizmo (Phase 2F.1).
   * @param {object|null} selection
   * @param {object|null} world
   * @param {{ faceNormalWorld?: {x:number,y:number,z:number}|null } } [options]
   */
  setGeometrySelection(selection, world = null, options = {}) {
    this.geometrySelection = selection && selection.items?.length
      ? {
          mode: selection.mode || 'face',
          items: selection.items.map((it) => ({
            actorId: it.actorId,
            ids: [...it.ids],
          })),
          primary: selection.primary || null,
        }
      : null;
    this._refreshGeometryFaceOverlays(world);
    if (this.geometrySelection) {
      this.gizmo?.setGeometryElementMode?.(true, options.faceNormalWorld || null);
      this._updateGeometryGizmo(world, options.gizmoCenter || null);
    } else {
      this.gizmo?.setGeometryElementMode?.(false, null);
      this._updateGizmo(world);
    }
  }

  _clearGeometryFaceOverlays() {
    for (const overlay of this._geometryFaceOverlays) {
      overlay.parent?.remove(overlay);
      disposeObject(overlay);
    }
    this._geometryFaceOverlays = [];
  }

  _refreshGeometryFaceOverlays(world = null) {
    this._clearGeometryFaceOverlays();
    if (!this.geometrySelection?.items?.length || !this.editMode) return;
    const mode = this.geometrySelection.mode || 'face';

    for (const item of this.geometrySelection.items) {
      const actor = world?.getActor?.(item.actorId)
        || this._actorMeshes.get(item.actorId)?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      const entry = this._actorMeshes.get(item.actorId);
      if (!convex?.geometry || !entry?.group) continue;
      const want = new Set(item.ids);

      if (mode === 'edge') {
        for (const key of want) {
          const overlay = this._buildEdgeOverlayLine(convex.geometry, key);
          if (!overlay) continue;
          entry.group.add(overlay);
          this._geometryFaceOverlays.push(overlay);
        }
        continue;
      }

      if (mode === 'vertex') {
        for (const vid of want) {
          const overlay = this._buildVertexOverlayHandle(convex.geometry, vid);
          if (!overlay) continue;
          entry.group.add(overlay);
          this._geometryFaceOverlays.push(overlay);
        }
        continue;
      }

      for (const face of convex.geometry.faces || []) {
        if (!want.has(face.id)) continue;
        const overlay = this._buildFaceOverlayMesh(convex.geometry, face);
        if (!overlay) continue;
        // Parent under actor group so local coords match.
        entry.group.add(overlay);
        this._geometryFaceOverlays.push(overlay);
      }
    }
  }

  _buildVertexOverlayHandle(geometry, vertexId) {
    const v = (geometry.vertices || []).find((x) => x.id === vertexId);
    if (!v?.p) return null;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xf0c040,
        depthTest: true,
        transparent: true,
        opacity: 0.95,
      }),
    );
    mesh.position.set(toMeters(v.p[0]), toMeters(v.p[1]), toMeters(v.p[2]));
    mesh.renderOrder = 11;
    mesh.userData.editorOnly = true;
    mesh.userData.geometryVertexOverlay = true;
    mesh.userData.pickable = false;
    return mesh;
  }

  _buildEdgeOverlayLine(geometry, edgeKeyStr) {
    const parts = parseEdgeKey(edgeKeyStr);
    if (!parts) return null;
    const vmap = new Map((geometry.vertices || []).map((v) => [v.id, v.p]));
    const p0 = vmap.get(parts[0]);
    const p1 = vmap.get(parts[1]);
    if (!p0 || !p1) return null;
    const positions = [
      toMeters(p0[0]), toMeters(p0[1]), toMeters(p0[2]),
      toMeters(p1[0]), toMeters(p1[1]), toMeters(p1[2]),
    ];
    const lineGeom = new LineGeometry();
    lineGeom.setPositions(positions);
    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const mat = new LineMaterial({
      color: 0xf0c040,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      worldUnits: false,
      resolution: size.x > 0 ? size.clone() : new THREE.Vector2(1, 1),
    });
    const line = new Line2(lineGeom, mat);
    line.computeLineDistances();
    line.renderOrder = 10;
    line.userData.editorOnly = true;
    line.userData.geometryEdgeOverlay = true;
    line.userData.pickable = false;
    return line;
  }

  _buildFaceOverlayMesh(geometry, face) {
    const vmap = new Map((geometry.vertices || []).map((v) => [v.id, v.p]));
    const loop = face.loop || [];
    if (loop.length < 3) return null;
    const pos = [];
    const p0 = vmap.get(loop[0]);
    if (!p0) return null;
    for (let i = 1; i < loop.length - 1; i += 1) {
      const p1 = vmap.get(loop[i]);
      const p2 = vmap.get(loop[i + 1]);
      if (!p1 || !p2) continue;
      for (const p of [p0, p1, p2]) {
        pos.push(toMeters(p[0]), toMeters(p[1]), toMeters(p[2]));
      }
    }
    if (!pos.length) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf0c040,
      transparent: true,
      opacity: 0.35,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 9;
    mesh.userData.editorOnly = true;
    mesh.userData.geometryFaceOverlay = true;
    mesh.userData.pickable = false;
    return mesh;
  }

  _updateGeometryGizmo(world, centerOverride = null) {
    if (!this.gizmo || !this.editMode) return;
    const center = centerOverride || this._geometrySelectionWorldCenter(world);
    if (!center) {
      this.gizmo.update([], null);
      return;
    }
    this.gizmo.update([{ position: center }], { position: center });
  }

  _geometrySelectionWorldCenter(world) {
    const sel = this.geometrySelection;
    if (!sel?.items?.length) return null;
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    const mode = sel.mode || 'face';
    for (const item of sel.items) {
      const actor = world?.getActor?.(item.actorId)
        || this._actorMeshes.get(item.actorId)?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.geometry) continue;
      const local = mode === 'edge'
        ? edgesCentroidLocal(convex.geometry, item.ids)
        : mode === 'vertex'
          ? verticesCentroidLocal(convex.geometry, item.ids)
          : facesCentroidLocal(convex.geometry, item.ids);
      const worldMat = getWorldMatrix(actor, world || actor.world);
      const wp = mat4TransformPoint(worldMat, { x: local[0], y: local[1], z: local[2] });
      x += wp.x;
      y += wp.y;
      z += wp.z;
      n += 1;
    }
    if (!n) return null;
    return { x: x / n, y: y / n, z: z / n };
  }

  _updateGizmo(world) {
    if (!this.gizmo || !this._showEditorOverlays()) {
      this.gizmo?.setVisible?.(false);
      return;
    }
    if (this.geometrySelection?.items?.length) {
      this._updateGeometryGizmo(world);
      return;
    }
    this.gizmo.setGeometryElementMode?.(false, null);
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
    if (!this.gizmo || !this._showEditorOverlays()) return null;
    this.gizmo.updateScreenScale?.(camera);
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    return this.gizmo.pick(raycaster);
  }

  pickActorId(normalizedX, normalizedY, camera = this.camera) {
    const hits = this.pickWorldHits(normalizedX, normalizedY, camera);
    return hits[0]?.actorId || null;
  }

  /**
   * Pick a semantic surface under the cursor (Phase 2E.1).
   * @returns {{ actorId: string, surfaceId: string, componentType: string } | null}
   */
  pickSurface(normalizedX, normalizedY, camera = this.camera) {
    const raycaster = this.getRaycaster(normalizedX, normalizedY, camera);
    const meshes = [];
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.userData.pickable && !obj.userData.placementIgnore && !obj.userData.editorOnly) {
        meshes.push(obj);
      }
    });
    const intersects = raycaster.intersectObjects(meshes, false);
    for (const inter of intersects) {
      const actorId = inter.object.userData.actorId;
      if (!actorId) continue;
      const entry = this._actorMeshes.get(actorId);
      const actor = entry?.actor;
      const comp = getStructuralComponent(actor);
      if (!comp) continue;
      const surfaceId = surfaceIdFromHit(inter.object, inter.faceIndex);
      if (!surfaceId) continue;
      return {
        actorId,
        surfaceId,
        componentType: comp.type,
        faceIndex: inter.faceIndex,
        point: inter.point?.clone?.() || null,
      };
    }
    return null;
  }

  /**
   * Pick a ConvexBrush face for Geometry Face mode (Phase 2F.1).
   * @returns {{ actorId: string, faceId: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryFace(normalizedX, normalizedY, camera = this.camera) {
    const hit = this.pickSurface(normalizedX, normalizedY, camera);
    if (!hit || hit.componentType !== 'ConvexBrush') return null;
    const entry = this._actorMeshes.get(hit.actorId);
    const actor = entry?.actor;
    const convex = actor?.getComponent?.('ConvexBrush');
    if (!convex?.isValid) return null;
    let pointLocal = null;
    if (hit.point && entry?.group) {
      const local = entry.group.worldToLocal(hit.point.clone());
      pointLocal = {
        x: local.x * 100,
        y: local.y * 100,
        z: local.z * 100,
      };
    }
    return {
      actorId: hit.actorId,
      faceId: hit.surfaceId,
      pointLocal,
    };
  }

  /**
   * Screen-space edge pick (Phase 2F.2).
   * Nearest projected edge within thresholdPx; depth-checked against brush hit unless xray.
   * @returns {{ actorId: string, edgeKey: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryEdge(normalizedX, normalizedY, camera = this.camera, options = {}) {
    const thresholdPx = Number(options.thresholdPx) > 0
      ? Number(options.thresholdPx)
      : this.geometryEdgePickThresholdPx;
    const xray = Boolean(options.xray);
    const cam = camera || this.camera;
    if (!cam) return null;

    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const width = size.x || this.renderer?.domElement?.clientWidth || 1;
    const height = size.y || this.renderer?.domElement?.clientHeight || 1;
    const pointerPx = {
      x: (normalizedX * 0.5 + 0.5) * width,
      y: (-normalizedY * 0.5 + 0.5) * height,
    };

    const surfaceHit = this.pickSurface(normalizedX, normalizedY, cam);
    const surfaceDist = surfaceHit?.point
      ? cam.position.distanceTo(surfaceHit.point)
      : null;

    let best = null;
    let bestDist = thresholdPx;

    for (const [actorId, entry] of this._actorMeshes) {
      const actor = entry?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.isValid || !convex.geometry || !entry?.group) continue;
      if (!xray && surfaceHit && surfaceHit.actorId !== actorId) continue;

      const worldMat = getWorldMatrix(actor, actor.world);
      const vmap = new Map((convex.geometry.vertices || []).map((v) => [v.id, v.p]));
      const edges = listGeometryEdges(convex.geometry);

      for (const key of edges) {
        const parts = parseEdgeKey(key);
        if (!parts) continue;
        const a = vmap.get(parts[0]);
        const b = vmap.get(parts[1]);
        if (!a || !b) continue;

        const wa = mat4TransformPoint(worldMat, { x: a[0], y: a[1], z: a[2] });
        const wb = mat4TransformPoint(worldMat, { x: b[0], y: b[1], z: b[2] });
        const pa = new THREE.Vector3(toMeters(wa.x), toMeters(wa.y), toMeters(wa.z));
        const pb = new THREE.Vector3(toMeters(wb.x), toMeters(wb.y), toMeters(wb.z));

        // Depth check: reject edges clearly behind the surface hit.
        if (!xray && surfaceDist != null) {
          const mid = pa.clone().add(pb).multiplyScalar(0.5);
          const midDist = cam.position.distanceTo(mid);
          if (midDist > surfaceDist + 0.05) continue;
        }

        const sa = this._projectToScreenPx(pa, cam, width, height);
        const sb = this._projectToScreenPx(pb, cam, width, height);
        if (!sa || !sb) continue;
        const dist = distPointToSegment2D(pointerPx, sa, sb);
        if (dist < bestDist) {
          bestDist = dist;
          const t = closestParamOnSegment2D(pointerPx, sa, sb);
          const localHint = [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t,
          ];
          best = {
            actorId,
            edgeKey: key,
            pointLocal: { x: localHint[0], y: localHint[1], z: localHint[2] },
            screenDist: dist,
          };
        }
      }
    }
    return best;
  }

  _projectToScreenPx(worldMeters, camera, width, height) {
    const v = worldMeters.clone().project(camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
    if (v.z < -1 || v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
    };
  }

  /**
   * Screen-space vertex pick (Phase 2F.3).
   * Nearest projected vertex within thresholdPx; depth-checked unless xray.
   * @returns {{ actorId: string, vertexId: string, pointLocal: {x,y,z}|null } | null}
   */
  pickGeometryVertex(normalizedX, normalizedY, camera = this.camera, options = {}) {
    const thresholdPx = Number(options.thresholdPx) > 0
      ? Number(options.thresholdPx)
      : this.geometryVertexPickThresholdPx;
    const xray = Boolean(options.xray);
    const cam = camera || this.camera;
    if (!cam) return null;

    const size = new THREE.Vector2();
    this.renderer?.getSize?.(size);
    const width = size.x || this.renderer?.domElement?.clientWidth || 1;
    const height = size.y || this.renderer?.domElement?.clientHeight || 1;
    const pointerPx = {
      x: (normalizedX * 0.5 + 0.5) * width,
      y: (-normalizedY * 0.5 + 0.5) * height,
    };

    const surfaceHit = this.pickSurface(normalizedX, normalizedY, cam);
    const surfaceDist = surfaceHit?.point
      ? cam.position.distanceTo(surfaceHit.point)
      : null;

    let best = null;
    let bestDist = thresholdPx;

    for (const [actorId, entry] of this._actorMeshes) {
      const actor = entry?.actor;
      const convex = actor?.getComponent?.('ConvexBrush');
      if (!convex?.isValid || !convex.geometry || !entry?.group) continue;
      if (!xray && surfaceHit && surfaceHit.actorId !== actorId) continue;

      const worldMat = getWorldMatrix(actor, actor.world);
      for (const vert of convex.geometry.vertices || []) {
        const p = vert.p;
        if (!p) continue;
        const wp = mat4TransformPoint(worldMat, { x: p[0], y: p[1], z: p[2] });
        const wm = new THREE.Vector3(toMeters(wp.x), toMeters(wp.y), toMeters(wp.z));

        if (!xray && surfaceDist != null) {
          const d = cam.position.distanceTo(wm);
          if (d > surfaceDist + 0.05) continue;
        }

        const sp = this._projectToScreenPx(wm, cam, width, height);
        if (!sp) continue;
        const dist = Math.hypot(pointerPx.x - sp.x, pointerPx.y - sp.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = {
            actorId,
            vertexId: vert.id,
            pointLocal: { x: p[0], y: p[1], z: p[2] },
            screenDist: dist,
          };
        }
      }
    }
    return best;
  }

  /**
   * @param {{ actorId: string, surfaceId: string } | null} selection
   */
  setSurfaceSelection(selection) {
    this.selectedSurface = selection && selection.actorId && selection.surfaceId
      ? { actorId: selection.actorId, surfaceId: selection.surfaceId }
      : null;
    this._refreshSurfaceHighlight();
  }

  /**
   * @param {{ actorId: string, surfaceId: string } | null} selection
   */
  setAlignReferenceSurface(selection) {
    this.alignReferenceSurface = selection && selection.actorId && selection.surfaceId
      ? { actorId: selection.actorId, surfaceId: selection.surfaceId }
      : null;
    this._refreshSurfaceHighlight();
  }

  _clearSurfaceHighlight() {
    this._restoreSurfaceEmissives();
  }

  _restoreSurfaceEmissives() {
    for (const entry of this._actorMeshes.values()) {
      entry.group.traverse((obj) => {
        if (!obj.isMesh || !Array.isArray(obj.material)) return;
        for (const mat of obj.material) {
          if (!mat?.userData?._bbSurfaceHighlight) continue;
          if (mat.userData._bbPrevEmissive && mat.emissive) {
            mat.emissive.copy(mat.userData._bbPrevEmissive);
          }
          if (mat.userData._bbPrevEmissiveIntensity != null) {
            mat.emissiveIntensity = mat.userData._bbPrevEmissiveIntensity;
          }
          delete mat.userData._bbPrevEmissive;
          delete mat.userData._bbPrevEmissiveIntensity;
          delete mat.userData._bbSurfaceHighlight;
          mat.needsUpdate = true;
        }
      });
    }
  }

  _paintSurfaceHighlight(sel, color, intensity = 0.55) {
    if (!sel) return;
    const entry = this._actorMeshes.get(sel.actorId);
    if (!entry) return;
    const highlight = color instanceof THREE.Color ? color : new THREE.Color(color);
    entry.group.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.pickable) return;
      const ids = obj.userData.surfaceIds;
      if (!ids?.length || !Array.isArray(obj.material)) return;
      const matIndex = ids.indexOf(sel.surfaceId);
      if (matIndex < 0) return;
      const mat = obj.material[matIndex];
      if (!mat?.emissive) return;
      if (!mat.userData._bbSurfaceHighlight) {
        mat.userData._bbPrevEmissive = mat.emissive.clone();
        mat.userData._bbPrevEmissiveIntensity = mat.emissiveIntensity;
        mat.userData._bbSurfaceHighlight = true;
      }
      mat.emissive.copy(highlight);
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, intensity);
      mat.needsUpdate = true;
    });
  }

  _refreshSurfaceHighlight() {
    this._restoreSurfaceEmissives();
    if (!this.editMode) return;
    // Reference (amber) then selection (viewport selection color) so target wins if same.
    if (this.alignReferenceSurface) {
      this._paintSurfaceHighlight(this.alignReferenceSurface, 0xe8a838, 0.5);
    }
    if (this.selectedSurface) {
      this._paintSurfaceHighlight(
        this.selectedSurface,
        this.viewportColors.selection,
        0.55,
      );
    }
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
      const subtractColor = this.viewportColors.subtract;
      return {
        mat: new THREE.MeshBasicMaterial({
          color: subtractColor,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
        edgeMat: new THREE.LineBasicMaterial({ color: subtractColor }),
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
    this._paneCameras.clear();
    this.renderer.dispose();
  }
}

function distPointToSegment2D(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(p.x - cx, p.y - cy);
}

function closestParamOnSegment2D(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return 0;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  return Math.max(0, Math.min(1, t));
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
