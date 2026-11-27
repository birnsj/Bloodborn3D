// Methods of SceneView, grouped by concern. Attached to SceneView.prototype in SceneView.js.
import * as THREE from 'three';
import { toMeters, DEFAULT_GRID_EDITOR_UNITS, GRID_EXTENT_EDITOR_UNITS } from '../../core/units.js';
import { DEFAULT_WORLD_AMBIENT, WORLD_AMBIENT_LIGHT_RATIO, migrateLegacyWorldAmbient, normalizeWorldScene, normalizeWorldRenderer, fogDriftFactor, worldAmbientFillStrength } from '../../core/World.js';
import { PostProcessingController } from '../postprocessing/PostProcessingController.js';
import { normalizePostProcessing } from '../postprocessing/postProcessingState.js';
import { syncCameraAtmosphereLayer } from '../atmosphere/AtmosphereController.js';
import { tickEnvironmentVisuals } from '../createThreeEnvironment.js';
import { gridPlaneForCameraMode } from '../viewport/viewportCameras.js';
import { disposeObject, DEFAULT_VIEWPORT_COLORS, EDIT_FILL_BASE_INTENSITY, EDIT_FILL2_BASE_INTENSITY } from './shared.js';

export class SceneSettingsMethods {
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
   * Apply editor viewport color prefs (grid, selection, subtract).
   * Scene clear color comes from level-authored world.scene.background.
   * @param {Partial<typeof DEFAULT_VIEWPORT_COLORS>} colors integer RGB colors
   * @param {import('../core/World.js').World|null} [world] used to refresh selection helpers
   */
  setViewportColors(colors = {}, world = null) {
    if (!colors || typeof colors !== 'object') return;
    for (const key of Object.keys(DEFAULT_VIEWPORT_COLORS)) {
      if (key === 'background') continue;
      const value = colors[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        this.viewportColors[key] = value >>> 0;
      }
    }
    if (this.editMode) this.setGridSize(this.gridSize);
    this._applySubtractColorsToMeshes();
    if (this.selectedActorIds.length) {
      this.setSelection([...this.selectedActorIds], world);
    }
  }

  /**
   * Show/hide editor light gizmos. Actual light contribution is unchanged.
   */
  setLightHelpersVisible(visible) {
    if (typeof visible === 'boolean') this.lightHelpersVisible = visible;
    this._applyLightHelpersVisibility();
  }

  _applyLightHelpersVisibility() {
    const show = this.lightHelpersVisible !== false;
    for (const entry of this._actorMeshes.values()) {
      entry.group?.traverse?.((obj) => {
        if (obj.userData?.bbLightGizmo) obj.visible = show;
      });
    }
  }

  /**
   * Show/hide the translucent subtract fill and set its opacity.
   * Border/edge lines stay visible and fully opaque either way.
   */
  setSubtractDisplay({ visible, opacity } = {}) {
    if (typeof visible === 'boolean') this.subtractFillVisible = visible;
    if (typeof opacity === 'number' && Number.isFinite(opacity)) {
      this.subtractFillOpacity = Math.min(1, Math.max(0, opacity));
    }
    this._applySubtractDisplayToMeshes();
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
        if (obj.userData?.brushOperation === 'subtract-edges') {
          if (obj.material?.color) obj.material.color.setHex(color);
          return;
        }
        if (!obj.isLineSegments || !obj.userData?.editorOnly) return;
        if (obj.material?.color && entry.actor?.getComponent?.('Brush')?.operation === 'subtract') {
          obj.material.color.setHex(color);
        }
      });
    }
    this._applySubtractDisplayToMeshes();
  }

  _applySubtractDisplayToMeshes() {
    const fillVisible = this.subtractFillVisible !== false;
    const fillOpacity = Number.isFinite(this.subtractFillOpacity)
      ? this.subtractFillOpacity
      : 0.14;
    if (this._sharedCutterMaterials?.fill) {
      this._sharedCutterMaterials.fill.opacity = fillOpacity;
      this._sharedCutterMaterials.fill.transparent = true;
      this._sharedCutterMaterials.fill.depthWrite = false;
      this._sharedCutterMaterials.fill.needsUpdate = true;
    }
    if (this._sharedCutterMaterials?.line) {
      this._sharedCutterMaterials.line.transparent = false;
      this._sharedCutterMaterials.line.opacity = 1;
      this._sharedCutterMaterials.line.needsUpdate = true;
    }
    for (const entry of this._actorMeshes.values()) {
      entry.group?.traverse?.((obj) => {
        if (obj.userData?.brushOperation === 'subtract') {
          obj.visible = fillVisible;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat) continue;
            mat.transparent = true;
            mat.opacity = fillOpacity;
            mat.depthWrite = false;
            mat.needsUpdate = true;
          }
          return;
        }
        if (obj.userData?.brushOperation === 'subtract-edges' || (
          obj.isLineSegments
          && obj.userData?.editorOnly
          && entry.actor?.getComponent?.('Brush')?.operation === 'subtract'
        )) {
          obj.visible = true;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat) continue;
            mat.transparent = false;
            mat.opacity = 1;
            mat.needsUpdate = true;
          }
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

  /** Level-authored Three.js Scene look (background + fog + environment). */
  applyWorldScene(settings) {
    this._worldScene = normalizeWorldScene(settings);
    this._fogDriftTime0 = performance.now() * 0.001;
    this._syncSceneFromWorld();
  }

  /** Level-authored WebGLRenderer look (tone mapping + shadows). */
  applyWorldRenderer(settings) {
    this._worldRenderer = normalizeWorldRenderer(settings);
    this._syncRendererFromWorld();
  }

  /** Resolve `/assets/…` URL for an environment texture asset id (HDR/EXR). */
  setEnvironmentAssetResolver(fn) {
    this.worldEnvironment?.setAssetUrlResolver?.(fn);
    // Re-apply so a late resolver can kick off HDR loads.
    if (this._worldScene) this._syncSceneFromWorld();
  }

  _syncSceneFromWorld() {
    const s = this._worldScene || normalizeWorldScene(null);
    if (!this.scene) return;
    this.viewportColors.background = parseInt(String(s.background).slice(1), 16) >>> 0;

    this.worldEnvironment?.apply?.(s);

    const fog = s.fog;
    if (!fog || fog.type === 'none') {
      this.scene.fog = null;
    } else if (fog.type === 'exp2') {
      this.scene.fog = new THREE.FogExp2(fog.color, fog.density);
    } else {
      // Authored near/far are editor units; Three.js Fog is meters.
      this.scene.fog = new THREE.Fog(fog.color, toMeters(fog.near), toMeters(fog.far));
    }
    this.atmosphere?.applyFogSettings?.(fog || { type: 'none' });
  }

  _atmosphereDt() {
    const now = performance.now() * 0.001;
    const last = this._atmosphereLastTime ?? now;
    this._atmosphereLastTime = now;
    return Math.min(0.1, Math.max(0, now - last));
  }

  /**
   * Subtle drifting atmosphere: modulate live fog density / far from authored base.
   * Called each frame before draw when fog + drift are enabled.
   */
  _updateFogDrift() {
    const fog = this._worldScene?.fog;
    if (!fog || fog.type === 'none' || !fog.drift || !this.scene?.fog) return;
    const t0 = this._fogDriftTime0 ?? (this._fogDriftTime0 = performance.now() * 0.001);
    const factor = fogDriftFactor(performance.now() * 0.001 - t0, fog);
    if (fog.type === 'exp2' && this.scene.fog.isFogExp2) {
      this.scene.fog.density = Math.max(0, fog.density * factor);
      this.scene.fog.color.set(fog.color);
    } else if (this.scene.fog.isFog) {
      const nearM = toMeters(fog.near);
      const farM = toMeters(fog.far);
      // Keep near stable; breathe the far plane so interiors feel like drifting mist.
      this.scene.fog.near = nearM;
      this.scene.fog.far = Math.max(nearM + 0.01, farM * factor);
      this.scene.fog.color.set(fog.color);
    }
  }

  _toneMappingFromName(name) {
    switch (name) {
      case 'None':
        return THREE.NoToneMapping;
      case 'Linear':
        return THREE.LinearToneMapping;
      case 'Reinhard':
        return THREE.ReinhardToneMapping;
      case 'Cineon':
        return THREE.CineonToneMapping;
      case 'AgX':
        return THREE.AgXToneMapping;
      case 'Neutral':
        return THREE.NeutralToneMapping;
      case 'ACESFilmic':
      default:
        return THREE.ACESFilmicToneMapping;
    }
  }

  _shadowMapTypeFromName(name) {
    switch (name) {
      case 'Basic':
        return THREE.BasicShadowMap;
      case 'VSM':
        return THREE.VSMShadowMap;
      case 'PCFSoft':
        // Deprecated in Three r187 — same as PCF.
        return THREE.PCFShadowMap;
      case 'PCF':
      default:
        return THREE.PCFShadowMap;
    }
  }

  _outputColorSpaceFromName(name) {
    if (name === 'srgb-linear') return THREE.LinearSRGBColorSpace;
    return THREE.SRGBColorSpace;
  }

  _syncRendererFromWorld() {
    const r = this._worldRenderer || normalizeWorldRenderer(null);
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = r.shadowMapEnabled;
    this.renderer.shadowMap.type = this._shadowMapTypeFromName(r.shadowMapType);
    this.renderer.outputColorSpace = this._outputColorSpaceFromName(r.outputColorSpace);
    // When post-processing is active it owns tone mapping / exposure.
    const ppActive = Boolean(
      this._postProcessing?.enabled && this.postProcessingController?.isActive,
    );
    if (!ppActive) {
      this.renderer.toneMapping = this._toneMappingFromName(r.toneMapping);
      this.renderer.toneMappingExposure = r.toneMappingExposure;
    }
  }

  /** Map-authored post-processing settings (live apply). */
  applyPostProcessing(settings) {
    this._postProcessing = normalizePostProcessing(settings);
    const ctrl = this.postProcessingController;
    if (!ctrl) {
      this._syncRendererFromWorld();
      return;
    }
    // Keep composer buffers matched to the canvas before rebuild/render.
    ctrl.setSize(this._size.width || 1, this._size.height || 1);
    try {
      ctrl.applySettings(this._postProcessing);
    } catch (err) {
      console.error('[BloodBound] post-processing apply failed', err);
      try {
        ctrl.dispose();
      } catch {
        /* ignore */
      }
      this.postProcessingController = new PostProcessingController({
        renderer: this.renderer,
        scene: this.scene,
        resolveActorMeshes: (actorId) => this._resolveActorMeshesForPost(actorId),
        resolveLightMesh: (actorId) => this._resolveLightMeshForPost(actorId),
        resolveTexture: (assetId) => this._resolveTextureForPost(assetId),
      });
      this.postProcessingController.setSize(this._size.width || 1, this._size.height || 1);
    }
    // When PP is off / inactive, restore level-authored tone mapping + exposure.
    this._syncRendererFromWorld();
  }

  setPostProcessingPreview(enabled) {
    this.postProcessingPreview = Boolean(enabled);
  }

  setPostProcessingMultiPane(enabled) {
    this._postProcessingMultiPane = Boolean(enabled);
  }

  _resolveActorMeshesForPost(actorId) {
    const entry = this._actorMeshes.get(actorId);
    if (!entry?.group) return [];
    const meshes = [];
    entry.group.traverse((obj) => {
      if (obj.isMesh && !obj.userData?.editorOnly) meshes.push(obj);
    });
    return meshes;
  }

  _resolveLightMeshForPost(actorId) {
    const entry = this._actorMeshes.get(actorId);
    if (!entry?.group) return null;
    if (!entry.godRaysMesh) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      mesh.name = 'GodRaysSource';
      mesh.visible = false;
      mesh.frustumCulled = false;
      entry.group.add(mesh);
      entry.godRaysMesh = mesh;
    }
    return entry.godRaysMesh;
  }

  _resolveTextureForPost(assetId) {
    if (!assetId) return null;
    if (this._ppTextureCache.has(assetId)) {
      return this._ppTextureCache.get(assetId);
    }
    const url = this.assetResolver?.getTextureUrl?.(assetId);
    if (!url) return null;
    const generation = this._ppTextureCacheGeneration || 0;
    const pending = new Promise((resolve) => {
      this._textureLoader.load(
        url,
        (tex) => {
          // Drop late loads after a level-switch cache clear (C5).
          if (generation !== (this._ppTextureCacheGeneration || 0)) {
            try { tex.dispose?.(); } catch { /* ignore */ }
            resolve(null);
            return;
          }
          tex.colorSpace = THREE.NoColorSpace;
          this._ppTextureCache.set(assetId, tex);
          resolve(tex);
        },
        undefined,
        () => {
          if (this._ppTextureCache.get(assetId) === pending) {
            this._ppTextureCache.delete(assetId);
          }
          resolve(null);
        },
      );
    });
    this._ppTextureCache.set(assetId, pending);
    return pending;
  }

  /** Free post-FX textures that are SceneView-owned (not materialFactory cache). */
  _clearPpTextureCache() {
    this._ppTextureCacheGeneration = (this._ppTextureCacheGeneration || 0) + 1;
    if (!this._ppTextureCache) {
      this._ppTextureCache = new Map();
      return;
    }
    for (const tex of this._ppTextureCache.values()) {
      if (tex && typeof tex.dispose === 'function') {
        try { tex.dispose(); } catch { /* ignore */ }
      }
    }
    this._ppTextureCache.clear();
  }

  /**
   * Whether this frame/pane should run the EffectComposer.
   */
  _shouldUsePostProcessing({
    cameraMode,
    displayMode,
    paneCount = 1,
    showPostProcessing = true,
  } = {}) {
    if (!this._postProcessing?.enabled) return false;
    if (!this.postProcessingController) return false;

    // Play / full-canvas path: always when map PP enabled.
    if (!this.editMode) return true;

    if (!this.postProcessingPreview) return false;
    if (showPostProcessing === false) return false;
    if ((cameraMode || 'perspective') !== 'perspective') return false;
    if ((displayMode || 'lit') !== 'lit') return false;
    if (!this._postProcessingMultiPane && paneCount > 1) return false;
    return true;
  }

  /**
   * @param {THREE.Camera} camera
   * @param {{
   *   usePostProcess?: boolean,
   *   atmosphere?: boolean,
   *   scissor?: { x:number, y:number, width:number, height:number }|null,
   * }} [options]
   */
  _drawScene(camera, {
    usePostProcess = false,
    atmosphere = true,
    scissor = null,
    tickEnvironment = true,
    updateShadows = true,
  } = {}) {
    const renderer = this.renderer;
    const prevToneMapping = renderer.toneMapping;
    const prevExposure = renderer.toneMappingExposure;
    const prevAutoClear = renderer.autoClear;
    const shadowMap = renderer.shadowMap;
    const prevShadowAuto = shadowMap?.autoUpdate;
    const prevShadowNeeds = shadowMap?.needsUpdate;

    try {
      // Keep exposure in sync when PP is on but composer is bypassed (ACES-only).
      if (usePostProcess && this._postProcessing?.enabled) {
        const exposure = this._postProcessing.exposure;
        if (Number.isFinite(exposure)) {
          renderer.toneMappingExposure = exposure;
        }
      } else if (!this.postProcessingController?.isActive) {
        // Restore level-authored tone mapping when PP is not composing.
        const r = this._worldRenderer;
        if (r) {
          renderer.toneMapping = this._toneMappingFromName(r.toneMapping);
          renderer.toneMappingExposure = r.toneMappingExposure;
        }
      }

      if (shadowMap && !updateShadows) {
        shadowMap.autoUpdate = false;
        shadowMap.needsUpdate = false;
      }

      const showAtmosphere = Boolean(atmosphere) && !camera?.isOrthographicCamera;
      syncCameraAtmosphereLayer(camera, showAtmosphere);
      if (!showAtmosphere) {
        this.atmosphere?.setPerspectiveVisible?.(false);
      } else {
        // Soft wall occlusion for mist / noise / volumetric (perspective only).
        // Depth prepass must not regenerate shadow maps — same lights as the main draw.
        const depthShadowAuto = shadowMap?.autoUpdate;
        if (shadowMap) shadowMap.autoUpdate = false;
        try {
          this.atmosphere?.captureDepth?.(this.renderer, camera);
        } finally {
          if (shadowMap) {
            shadowMap.autoUpdate = updateShadows ? depthShadowAuto : false;
            if (updateShadows) shadowMap.needsUpdate = true;
          }
        }
      }
      if (tickEnvironment) tickEnvironmentVisuals(this.scene);

      if (usePostProcess && this.postProcessingController?.isActive) {
        try {
          const ok = this.postProcessingController.render(camera, undefined, { scissor });
          if (ok) return;
        } catch (err) {
          console.error('[BloodBound] post-processing render failed', err);
        }
        // Fall through to a normal draw if compose fails or is inactive.
      }
      this.renderer.render(this.scene, camera);
    } finally {
      if (shadowMap) {
        shadowMap.autoUpdate = prevShadowAuto;
        shadowMap.needsUpdate = prevShadowNeeds;
      }
      renderer.toneMapping = prevToneMapping;
      renderer.toneMappingExposure = prevExposure;
      renderer.autoClear = prevAutoClear;
    }
  }

  _syncAmbientFromWorld() {
    const { color } = this._worldAmbient;
    // Black (or intensity 0) must kill fill: AmbientLight + editor fill dir lights.
    // Strength is intensity × luminance(color) normalized so the default color keeps look.
    // Authored HDRI uses independent environmentIntensity; RoomEnvironment still follows fill.
    const fill = worldAmbientFillStrength(this._worldAmbient, { editMode: this.editMode });
    const defaultFill = DEFAULT_WORLD_AMBIENT.intensity || 0.12;
    const fillScale = defaultFill > 1e-8 ? fill / defaultFill : 0;
    const dark = fill < 1e-6;

    this.worldEnvironment?.setAmbient?.(this._worldAmbient, { editMode: this.editMode });
    this._studioEnv = this.worldEnvironment?.studioEnvironment || this._studioEnv;

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
}
