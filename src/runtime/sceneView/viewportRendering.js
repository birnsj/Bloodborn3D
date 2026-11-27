// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { syncCameraAtmosphereLayer } from '../atmosphere/AtmosphereController.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import { isEffectivelyVisible, isEffectivelyLocked } from '../../core/hierarchy.js';
import { isActorAuthoringLayerVisible, isActorAuthoringLayerLocked } from '../../core/authoringLayers.js';
import { setLensflarePerspectiveVisible } from '../createThreeLight.js';
import { tickEnvironmentVisuals } from '../createThreeEnvironment.js';
import { applyDisplayMode, restoreDisplayMode, ensureEdgesOverlay } from '../viewport/viewportDisplay.js';
import { createPaneCamera, applyPanePose, updateOrthoFrustum, updatePerspectiveAspect, gridPlaneForCameraMode } from '../viewport/viewportCameras.js';
import { isOrthographicMode, normalizeCameraMode, resolvePaneShowFog, resolvePaneShowMist, resolvePaneShowPostProcessing } from '../viewport/viewportPrefs.js';
import { paneScissorFromDomRect } from '../viewport/paneScissor.js';
import { setEnvironmentSurfacesPerspectiveVisible, DEFAULT_VIEWPORT_COLORS, hideViewHelperNegativeAxes } from './shared.js';

export class ViewportRenderingMethods {
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
    this.applyEditorVisibilityFilters();
  }

  /**
   * Push editor-only authoring-layer filters and refresh group.visible without rebuild.
   * @param {{ hidden?: Set|string[], locked?: Set|string[], solo?: object }|null} layerUi
   */
  setLayerUi(layerUi) {
    this.layerUi = layerUi || null;
    this.applyEditorVisibilityFilters();
  }

  /**
   * Edit mode: authored hierarchy visibility ∧ authoring-layer filters.
   * Play mode: authored hierarchy visibility only.
   */
  _isActorEditorVisible(actor, world = actor?.world || this.world) {
    if (!actor) return false;
    if (!isEffectivelyVisible(actor, world)) return false;
    if (!this.editMode) return true;
    return isActorAuthoringLayerVisible(actor, world, this.layerUi);
  }

  _isActorEditorLocked(actor, world = actor?.world || this.world) {
    if (!actor) return false;
    if (isEffectivelyLocked(actor, world)) return true;
    if (!this.editMode) return false;
    return isActorAuthoringLayerLocked(actor, world, this.layerUi);
  }

  /** Lightweight visibility pass — never rebuilds meshes / CSG. */
  applyEditorVisibilityFilters(world = this.world) {
    for (const entry of this._actorMeshes.values()) {
      const actor = entry?.actor || world?.getActor?.(entry?.group?.userData?.actorId);
      if (!entry?.group || !actor) continue;
      entry.group.visible = this._isActorEditorVisible(actor, world || actor.world);
    }
  }

  /**
   * Keep drawing-buffer density matched to on-screen size.
   * EditorShell uses CSS `transform: scale(uiScale)`, so layout clientWidth is
   * smaller than the painted size when UI scale > 100% — boost pixelRatio.
   */
  _applyOutputPixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ui = Number.isFinite(this._uiScale) && this._uiScale > 0 ? this._uiScale : 1;
    // Cap so 150% UI × 2 DPR does not explode VRAM.
    this.renderer.setPixelRatio(Math.min(dpr * ui, 3));
  }

  /**
   * @param {number} width layout CSS px (shell.clientWidth)
   * @param {number} height layout CSS px (shell.clientHeight)
   * @param {{ uiScale?: number }} [options]
   */
  setSize(width, height, options = {}) {
    if (width <= 0 || height <= 0) return;
    if (options.uiScale != null) {
      const next = Number(options.uiScale);
      if (Number.isFinite(next) && next > 0) this._uiScale = next;
    }
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
    this._applyOutputPixelRatio();
    this.renderer.setSize(width, height, false);
    this.postProcessingController?.setSize(width, height);
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
    // Atmosphere lives on a dedicated layer — ortho cameras must never enable it.
    syncCameraAtmosphereLayer(cam, mode === 'perspective' && !cam.isOrthographicCamera);
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

    this._updateFogDrift();
    const dt = this._atmosphereDt();

    // Three.js setViewport/setScissor take CSS/logical pixels and multiply by
    // pixelRatio internally — do NOT pre-scale by DPR (double-scale breaks HiDPI).
    const canvasH = this._size.height || 1;
    const fullW = Math.max(1, Math.round(this._size.width || 1));
    const fullH = Math.max(1, Math.round(this._size.height || 1));
    // Edges overlays are only needed for wireframe / solid-edges display modes.
    const needsEdges = panes.some((p) => {
      const m = p.displayMode || 'lit';
      return m === 'wireframe' || m === 'solid-edges';
    });
    if (needsEdges) this._ensureActorEdgesOverlays();

    const renderer = this.renderer;
    const lights = [this.ambient, this.editFill, this.editFill2];
    const paneCount = panes.length;

    // Shared scene fog/background are authored World state — never mutate the
    // authored objects; only swap scene references per pane and restore afterward.
    const authoredFog = this.scene.fog;
    const authoredBackground = this.scene.background;
    const authoredBgIntensity = this.scene.backgroundIntensity;
    const authoredBgBlurriness = this.scene.backgroundBlurriness;
    if (!this._editorClearColor) {
      this._editorClearColor = new THREE.Color(DEFAULT_VIEWPORT_COLORS.background);
    } else {
      this._editorClearColor.setHex(DEFAULT_VIEWPORT_COLORS.background);
    }
    const prevToneMapping = renderer.toneMapping;
    const prevExposure = renderer.toneMappingExposure;
    const prevAutoClear = renderer.autoClear;
    const prevScissorTest = renderer.getScissorTest();

    renderer.setScissorTest(true);

    // Multi-pane: regenerate shadow maps once, then reuse for remaining scissors.
    // Lights and casters are shared — per-pane shadow rebuilds are redundant.
    const shadowMap = renderer.shadowMap;
    const prevShadowAuto = shadowMap?.autoUpdate;
    let shadowsDrawn = false;
    let lastPerspectiveVisible = null;
    // Environment ticks once per frame (not once per pane).
    tickEnvironmentVisuals(this.scene);

    try {
      for (const pane of panes) {
        const rect = pane.rect;
        if (!rect || rect.width <= 0 || rect.height <= 0) continue;

        const cam = this.ensurePaneCamera(pane.paneId, pane.cameraMode, pane.paneState);
        this.updatePaneCameraProjection(cam, rect);

        const scissor = paneScissorFromDomRect(rect, canvasH);
        renderer.setViewport(scissor.x, scissor.y, scissor.width, scissor.height);
        renderer.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);

        if (this._showEditorOverlays() && this.gridHelper) {
          this._applyGridPlane(gridPlaneForCameraMode(pane.cameraMode));
        }

        // Axis gizmo screen size follows this pane’s camera; face-resize stays object-sized.
        this.gizmo?.updateScreenScale?.(cam);

        const displayState = applyDisplayMode(this.scene, lights, pane.displayMode || 'lit');
        const ortho = isOrthographicMode(pane.cameraMode) || cam?.isOrthographicCamera;
        // Pane Show Fog is independent of World Settings. Ortho defaults off in prefs;
        // atmosphere stays perspective-only even if ortho fog is forced on.
        // Mist chip gates particle mist only; distance fog uses the Fog chip.
        const wantFog = resolvePaneShowFog(pane);
        const wantMist = resolvePaneShowMist(pane);
        const showAtmosphere = wantFog && !ortho;
        const wantPp = resolvePaneShowPostProcessing(pane);
        const usePostProcess = this._shouldUsePostProcessing({
          cameraMode: pane.cameraMode,
          displayMode: pane.displayMode,
          paneCount,
          showPostProcessing: wantPp,
        });

        this.scene.fog = wantFog ? authoredFog : null;
        // Ortho / isometric construction views use the editor clear color — not the
        // level-authored background (that stays on perspective + Play).
        if (ortho) {
          this.scene.background = this._editorClearColor;
          this.scene.backgroundIntensity = 1;
          this.scene.backgroundBlurriness = 0;
        } else {
          this.scene.background = authoredBackground;
          this.scene.backgroundIntensity = authoredBgIntensity;
          this.scene.backgroundBlurriness = authoredBgBlurriness;
        }
        syncCameraAtmosphereLayer(cam, showAtmosphere);
        this.atmosphere?.setPaneMistVisible?.(wantMist);
        this.atmosphere?.setPerspectiveVisible?.(showAtmosphere);
        // Sky / env surfaces / lensflare: only re-traverse when perspective↔ortho flips.
        const perspectiveVisible = !ortho;
        if (lastPerspectiveVisible !== perspectiveVisible) {
          this.worldEnvironment?.setPerspectiveVisible?.(perspectiveVisible);
          setLensflarePerspectiveVisible(this.scene, perspectiveVisible);
          setEnvironmentSurfacesPerspectiveVisible(this.scene, perspectiveVisible);
          this._syncPlaceableSkyPrecedence();
          lastPerspectiveVisible = perspectiveVisible;
        }
        if (showAtmosphere) this.atmosphere?.update?.(cam, dt);

        const updateShadows = !shadowsDrawn;
        try {
          this._drawScene(cam, {
            usePostProcess,
            atmosphere: showAtmosphere,
            scissor: usePostProcess ? scissor : null,
            tickEnvironment: false,
            updateShadows,
          });
          shadowsDrawn = true;
        } catch (err) {
          console.error('[BloodBound] viewport pane render failed', err);
        } finally {
          this.scene.fog = authoredFog;
          this.scene.background = authoredBackground;
          this.scene.backgroundIntensity = authoredBgIntensity;
          this.scene.backgroundBlurriness = authoredBgBlurriness;
          restoreDisplayMode(displayState);
        }

        // Axis ViewHelper — perspective panes only; after scene draw so depth clears locally.
        if (
          this.editMode
          && this._showEditorOverlays()
          && !isOrthographicMode(pane.cameraMode)
          && !cam?.isOrthographicCamera
        ) {
          this._renderViewHelperForPane(pane.paneId || pane.id, cam, scissor, dt);
        }
      }
    } finally {
      if (shadowMap) {
        shadowMap.autoUpdate = prevShadowAuto;
      }
      this.scene.fog = authoredFog;
      this.scene.background = authoredBackground;
      this.scene.backgroundIntensity = authoredBgIntensity;
      this.scene.backgroundBlurriness = authoredBgBlurriness;
      this.worldEnvironment?.setPerspectiveVisible?.(true);
      setLensflarePerspectiveVisible(this.scene, true);
      setEnvironmentSurfacesPerspectiveVisible(this.scene, true);
      // Play / next single draw should see authored mist again (pane chip is per-scissor only).
      this.atmosphere?.setPaneMistVisible?.(true);
      renderer.toneMapping = prevToneMapping;
      renderer.toneMappingExposure = prevExposure;
      renderer.autoClear = prevAutoClear;
      renderer.setScissorTest(prevScissorTest);
      renderer.setViewport(0, 0, fullW, fullH);
      renderer.setScissor(0, 0, fullW, fullH);
      // Keep composer buffers matched to the full canvas between frames.
      this.postProcessingController?._syncComposerBuffers?.();
    }
  }

  render(camera = this.camera) {
    this._updateFogDrift();
    const dt = this._atmosphereDt();
    const ortho = Boolean(camera?.isOrthographicCamera);
    // Play / single-canvas path: always use authored fog + atmosphere in perspective.
    const showAtmosphere = !ortho;
    syncCameraAtmosphereLayer(camera, showAtmosphere);
    this.atmosphere?.setPaneMistVisible?.(true);
    this.atmosphere?.setPerspectiveVisible?.(showAtmosphere);
    this.worldEnvironment?.setPerspectiveVisible?.(!ortho);
    setLensflarePerspectiveVisible(this.scene, !ortho);
    setEnvironmentSurfacesPerspectiveVisible(this.scene, !ortho);
    this._syncPlaceableSkyPrecedence();
    if (showAtmosphere) this.atmosphere?.update?.(camera, dt);
    this.renderer.setScissorTest(false);
    const fullW = Math.max(1, Math.round(this._size.width || 1));
    const fullH = Math.max(1, Math.round(this._size.height || 1));
    this.renderer.setViewport(0, 0, fullW, fullH);
    this.gizmo?.updateScreenScale?.(camera);
    const usePostProcess = this._shouldUsePostProcessing({
      cameraMode: ortho ? 'top' : 'perspective',
      displayMode: 'lit',
      paneCount: 1,
      showPostProcessing: true,
    });
    this._drawScene(camera, { usePostProcess, atmosphere: showAtmosphere, scissor: null });
    if (this.editMode && this._showEditorOverlays() && !ortho) {
      this._renderViewHelperForPane(
        this.activePaneId || 'pane-0',
        camera,
        { x: 0, y: 0, width: fullW, height: fullH },
        dt,
      );
    }
  }

  /** Sync ViewHelper orbit focus from OrbitControls target (meters). */
  setViewHelperCenter(x, y, z) {
    if (x && typeof x === 'object') {
      this._viewHelperCenter.set(x.x, x.y, x.z);
    } else {
      this._viewHelperCenter.set(Number(x) || 0, Number(y) || 0, Number(z) || 0);
    }
  }

  _ensureViewHelper(paneId, camera) {
    let helper = this._viewHelpers.get(paneId);
    if (!helper) {
      helper = new ViewHelper(camera, this.canvas);
      helper.setLabels?.('X', 'Y', 'Z');
      // Three.js ViewHelper draws -X/-Y/-Z as black sprites at opacity 0.2.
      // Against the grid they read as soft alpha-circle artifacts — hide them.
      hideViewHelperNegativeAxes(helper);
      this._viewHelpers.set(paneId, helper);
    } else {
      helper.camera = camera;
    }
    helper.center.copy(this._viewHelperCenter);
    return helper;
  }

  /**
   * Draw ViewHelper in the bottom-right of a pane scissor (CSS px, WebGL bottom-left).
   */
  _renderViewHelperForPane(paneId, camera, scissor, dt = 0) {
    if (!camera || !scissor || !this.canvas) return;
    const helper = this._ensureViewHelper(paneId, camera);
    const dim = this._viewHelperDim;
    const margin = this._viewHelperMargin;
    const left = Math.max(0, scissor.x + scissor.width - dim - margin);
    const bottom = Math.max(0, scissor.y + margin);
    helper.location = {
      top: null,
      left,
      right: 0,
      bottom,
    };
    if (helper.animating) helper.update(dt || 1 / 60);
    // Scissor MUST be the helper corner only so clearDepth stays local.
    // autoClear must stay false: ViewHelper already clearDepth()s, and enabling
    // autoClear would wipe the corner color buffer to black (opaque black box).
    const renderer = this.renderer;
    const prevScissorTest = renderer.getScissorTest();
    const prevAutoClear = renderer.autoClear;
    renderer.setScissorTest(true);
    renderer.setScissor(left, bottom, dim, dim);
    renderer.setViewport(left, bottom, dim, dim);
    renderer.autoClear = false;
    helper.render(renderer);
    renderer.autoClear = prevAutoClear;
    renderer.setScissorTest(prevScissorTest);
  }

  /**
   * Route a pointer event to the ViewHelper for the pane under the cursor.
   * @returns {boolean} true if the helper consumed the click
   */
  handleViewHelperClick(event, paneId, camera, paneScissor) {
    if (!this.editMode || !this._showEditorOverlays() || !camera || camera.isOrthographicCamera) {
      return false;
    }
    if (!paneScissor) return false;
    const helper = this._ensureViewHelper(paneId || this.activePaneId || 'pane-0', camera);
    const dim = this._viewHelperDim;
    const margin = this._viewHelperMargin;
    helper.location = {
      top: null,
      left: Math.max(0, paneScissor.x + paneScissor.width - dim - margin),
      right: 0,
      bottom: Math.max(0, paneScissor.y + margin),
    };
    helper.center.copy(this._viewHelperCenter);
    return Boolean(helper.handleClick(event));
  }
}
