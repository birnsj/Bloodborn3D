import * as THREE from 'three';
import { DEFAULT_GRID_EDITOR_UNITS } from '../core/units.js';
import { DEFAULT_WORLD_AMBIENT, DEFAULT_WORLD_SCENE, DEFAULT_WORLD_RENDERER, WORLD_AMBIENT_LIGHT_RATIO, normalizeWorldScene, normalizeWorldRenderer } from '../core/World.js';
import { PostProcessingController } from './postprocessing/PostProcessingController.js';
import { normalizePostProcessing } from './postprocessing/postProcessingState.js';
import { AtmosphereController, syncCameraAtmosphereLayer } from './atmosphere/AtmosphereController.js';
import { BrushGizmo } from './BrushGizmo.js';
import { WorldEnvironmentController } from './WorldEnvironmentController.js';
import { disposeObject, createEmptySyncStats, DEFAULT_VIEWPORT_COLORS, EDIT_FILL_BASE_INTENSITY, EDIT_FILL2_BASE_INTENSITY } from './sceneView/shared.js';
import { SceneSettingsMethods } from './sceneView/sceneSettings.js';
import { ViewportRenderingMethods } from './sceneView/viewportRendering.js';
import { ActorSyncMethods } from './sceneView/actorSync.js';
import { GeometryVisualMethods } from './sceneView/geometryVisuals.js';
import { StaticMeshVisualMethods } from './sceneView/staticMeshVisuals.js';
import { LightEnvironmentVisualMethods } from './sceneView/lightEnvironmentVisuals.js';
import { SelectionGizmoMethods } from './sceneView/selectionGizmos.js';
import { PickingMethods } from './sceneView/picking.js';
import { CreatePreviewMethods } from './sceneView/createPreviews.js';
import { installMethods } from './sceneView/installMethods.js';

export { hideViewHelperNegativeAxes } from './sceneView/shared.js';

export class SceneView {
  constructor({ canvas, editMode = true } = {}) {
    this.canvas = canvas;
    this.editMode = editMode;
    /**
     * Batch 9 — editor-only authoring layer UI filters (hidden/locked/solo).
     * Never written to level JSON; ignored while editMode is false (Play).
     */
    this.layerUi = null;
    /** Unreal-style Game View (G) — hides editor helpers while editing. */
    this.gameView = false;
    this.viewportColors = { ...DEFAULT_VIEWPORT_COLORS };
    /** Edit-mode subtract fill visibility (edge lines always remain). */
    this.subtractFillVisible = true;
    /** Edit-mode subtract fill opacity (0–1). Edge lines stay opaque. */
    this.subtractFillOpacity = 0.14;
    /** Edit-mode light gizmos (THREE.Light objects stay active either way). */
    this.lightHelpersVisible = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.viewportColors.background);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
    syncCameraAtmosphereLayer(this.camera, true);
    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 1.5, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    /** Multiplier for CSS UI scale (EditorShell transform) so the buffer stays sharp. */
    this._uiScale = 1;
    this._applyOutputPixelRatio();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.worldEnvironment = new WorldEnvironmentController(this.renderer, this.scene, {
      intensity: DEFAULT_WORLD_AMBIENT.intensity,
    });
    /** @deprecated use worldEnvironment.studioEnvironment — kept for older tests */
    this._studioEnv = this.worldEnvironment.studioEnvironment;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy?.() || 8;
    this.maxAnisotropy = Math.min(16, maxAniso);

    this.root = new THREE.Group();
    this.root.name = 'WorldRoot';
    this.scene.add(this.root);

    // Editor fill lights — hidden in play so authored lights dominate.
    // Levels override via world.ambient (World Settings) — drives IBL + AmbientLight.
    this._worldAmbient = { ...DEFAULT_WORLD_AMBIENT };
    this._worldScene = normalizeWorldScene(DEFAULT_WORLD_SCENE);
    this._worldRenderer = normalizeWorldRenderer(DEFAULT_WORLD_RENDERER);
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
    /** actorId → highest visualEpoch ever assigned (survives delete for undo recreate). */
    this._actorEpochHighWater = new Map();
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
    /** Instrumentation for Phase 2F.7C incremental sync benchmarks. */
    this.syncStats = createEmptySyncStats();

    /** @type {{ getTextureUrl:(id:string)=>string|null, getMaterialDefinition:(id:string)=>Promise<object|null>, getMeshUrl:(id:string)=>string|null } | null} */
    this.assetResolver = null;

    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();

    this.gizmo = null;
    this._createPreview = null;
    this._placementPreview = null;

    /** @type {Map<string, THREE.Camera>} Independent cameras per viewport pane */
    this._paneCameras = new Map();
    /**
     * Batch 9 — per-pane ViewHelper (perspective only).
     * @type {Map<string, import('three/addons/helpers/ViewHelper.js').ViewHelper>}
     */
    this._viewHelpers = new Map();
    /** Shared orbit focus for ViewHelper axis clicks (meters). */
    this._viewHelperCenter = new THREE.Vector3(0, 1.5, 0);
    /** Active pane id for input / Play capture (legacy `this.camera` mirrors it). */
    this.activePaneId = 'pane-0';
    this._gridPlane = 'xz';
    this._size = { width: 1, height: 1 };
    this._viewHelperDim = 128;
    this._viewHelperMargin = 8;

    /** Editor-only: preview map post-processing in perspective lit panes. */
    this.postProcessingPreview = true;
    /** Perspective+lit panes may compose; ortho/technical modes stay raw. */
    this._postProcessingMultiPane = true;
    this._postProcessing = normalizePostProcessing({ enabled: false });
    this._textureLoader = new THREE.TextureLoader();
    this._ppTextureCache = new Map();
    /** Bumped on clear so in-flight PP texture loads are discarded. */
    this._ppTextureCacheGeneration = 0;
    this.postProcessingController = new PostProcessingController({
      renderer: this.renderer,
      scene: this.scene,
      resolveActorMeshes: (actorId) => this._resolveActorMeshesForPost(actorId),
      resolveLightMesh: (actorId) => this._resolveLightMeshForPost(actorId),
      resolveTexture: (assetId) => this._resolveTextureForPost(assetId),
    });

    this.atmosphere = new AtmosphereController({ scene: this.scene });
    this._atmosphereLastTime = performance.now() * 0.001;

    if (editMode) {
      this._createEditHelpers();
      this.gizmo = new BrushGizmo(this.scene);
    }
  }

  setAssetResolver(resolver) {
    this.assetResolver = resolver || null;
    this.setEnvironmentAssetResolver((assetId) => (
      this.assetResolver?.getTextureUrl?.(assetId) || null
    ));
  }

  _createEditHelpers() {
    this.setGridSize(this.gridSize);
  }

  dispose() {
    this.clearWorldMeshes();
    this.setCreatePreview(null);
    this.setPlacementPreview(null);
    this.atmosphere?.dispose?.();
    this.atmosphere = null;
    if (this.gizmo) {
      this.gizmo.dispose();
      this.gizmo = null;
    }
    for (const helper of this._viewHelpers.values()) {
      helper.dispose?.();
    }
    this._viewHelpers.clear();
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      disposeObject(this.gridHelper);
    }
    if (this._sharedCutterMaterials) {
      this._sharedCutterMaterials.fill.dispose();
      this._sharedCutterMaterials.line.dispose();
      this._sharedCutterMaterials = null;
    }
    this.postProcessingController?.dispose();
    this.postProcessingController = null;
    this._clearPpTextureCache();
    this.worldEnvironment?.dispose?.();
    this.worldEnvironment = null;
    this._studioEnv = null;
    this.scene.environment = null;
    this._paneCameras.clear();
    this.renderer.dispose();
  }
}

installMethods(SceneView, [
  SceneSettingsMethods,
  ViewportRenderingMethods,
  ActorSyncMethods,
  GeometryVisualMethods,
  StaticMeshVisualMethods,
  LightEnvironmentVisualMethods,
  SelectionGizmoMethods,
  PickingMethods,
  CreatePreviewMethods,
]);
