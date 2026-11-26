/**
 * Level-authored environment map, procedural sky, grounded skybox, and light probe.
 * RoomEnvironment remains the fallback when no HDRI/EXR asset is assigned.
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';
import { installStudioEnvironment } from './studioEnvironment.js';
import {
  buildPmremFromEquirect,
  disposePmremTarget,
  loadEnvironmentEquirect,
} from './environmentMapCache.js';
import { markOwnedGpuResource } from './gpuResources.js';
import {
  DEFAULT_WORLD_AMBIENT,
  normalizeWorldScene,
  worldAmbientFillStrength,
} from '../core/World.js';

function degToRadEuler(deg = {}) {
  return {
    x: THREE.MathUtils.degToRad(Number(deg.x) || 0),
    y: THREE.MathUtils.degToRad(Number(deg.y) || 0),
    z: THREE.MathUtils.degToRad(Number(deg.z) || 0),
  };
}

function sunDirectionFromSky(sky = {}) {
  const elevation = Number(sky.elevation);
  const azimuth = Number(sky.azimuth);
  const phi = THREE.MathUtils.degToRad(90 - (Number.isFinite(elevation) ? elevation : 2));
  const theta = THREE.MathUtils.degToRad(Number.isFinite(azimuth) ? azimuth : 180);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export class WorldEnvironmentController {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {{ intensity?: number }} [studioOpts]
   */
  constructor(renderer, scene, studioOpts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this._studioEnv = installStudioEnvironment(renderer, scene, studioOpts);
    this._authoredPmrem = null;
    this._authoredAssetId = null;
    this._loadToken = 0;
    this._sky = null;
    this._grounded = null;
    this._probe = null;
    this._settings = normalizeWorldScene(null);
    this._ambient = { ...DEFAULT_WORLD_AMBIENT };
    this._editMode = true;
    this._perspectiveVisible = true;
    this._resolveAssetUrl = null;
  }

  get studioEnvironment() {
    return this._studioEnv;
  }

  get activeEnvironment() {
    return this._authoredPmrem?.texture || this._studioEnv || null;
  }

  setAssetUrlResolver(fn) {
    this._resolveAssetUrl = typeof fn === 'function' ? fn : null;
  }

  setAmbient(ambient, { editMode = true } = {}) {
    this._ambient = ambient || { ...DEFAULT_WORLD_AMBIENT };
    this._editMode = editMode;
    this._applyLighting();
  }

  /**
   * Apply level-authored scene environment settings.
   * HDR loads are async; a newer apply cancels older completions.
   */
  apply(settings) {
    this._settings = normalizeWorldScene(settings);
    this._applyLighting();
    this._applyBackgroundAndSky();
    this._syncAuthoredEnvironment();
  }

  /** Hide sky / grounded skybox in ortho panes (shared scene). */
  setPerspectiveVisible(visible) {
    this._perspectiveVisible = Boolean(visible);
    const show = this._perspectiveVisible;
    if (this._sky) {
      const suppressed = Boolean(this._placeableSkyActive);
      this._sky.visible = show && !suppressed && this._settings.backgroundType === 'sky';
    }
    if (this._grounded) {
      this._grounded.visible = show && Boolean(this._settings.groundedSkybox?.enabled);
    }
  }

  /**
   * When a placeable Sky actor is active, suppress the World Settings Sky mesh
   * (authored world.scene.sky JSON is kept).
   */
  setPlaceableSkyActive(active) {
    this._placeableSkyActive = Boolean(active);
    this.setPerspectiveVisible(this._perspectiveVisible !== false);
  }

  dispose() {
    this._loadToken += 1;
    this._removeSky();
    this._removeGrounded();
    this._removeProbe();
    disposePmremTarget(this._authoredPmrem);
    this._authoredPmrem = null;
    this._authoredAssetId = null;
    if (this.scene) {
      this.scene.environment = null;
      this.scene.background = null;
    }
    this._studioEnv?.dispose?.();
    this._studioEnv = null;
  }

  _resolveUrl(assetId) {
    if (!assetId || !this._resolveAssetUrl) return null;
    try {
      return this._resolveAssetUrl(assetId) || null;
    } catch {
      return null;
    }
  }

  _applyLighting() {
    const s = this._settings;
    const fill = worldAmbientFillStrength(this._ambient, { editMode: this._editMode });
    const dark = fill < 1e-6;
    const hasAuthored = Boolean(this._authoredPmrem?.texture);
    const envTex = hasAuthored ? this._authoredPmrem.texture : this._studioEnv;

    if (!this.scene) return;

    if (hasAuthored) {
      this.scene.environment = envTex;
      this.scene.environmentIntensity = Math.max(0, Number(s.environmentIntensity) || 0);
    } else if (dark) {
      this.scene.environment = null;
      this.scene.environmentIntensity = 0;
    } else {
      this.scene.environment = envTex;
      // Preserve legacy RoomEnvironment look: ambient fill drives IBL gain.
      this.scene.environmentIntensity = fill;
    }

    const envRot = degToRadEuler(s.environmentRotation);
    this.scene.environmentRotation?.set(envRot.x, envRot.y, envRot.z);
  }

  _applyBackgroundAndSky() {
    const s = this._settings;
    if (!this.scene) return;

    const bgRot = degToRadEuler(s.backgroundRotation);
    this.scene.backgroundRotation?.set(bgRot.x, bgRot.y, bgRot.z);
    this.scene.backgroundIntensity = s.backgroundIntensity;
    this.scene.backgroundBlurriness = s.backgroundBlurriness;

    const type = s.backgroundType || 'color';
    const showSky = type === 'sky';
    this._ensureSky(showSky);
    this._ensureGrounded(Boolean(s.groundedSkybox?.enabled));

    if (type === 'environment' && this.activeEnvironment) {
      this.scene.background = this.activeEnvironment;
    } else if (type === 'sky' && this._sky) {
      // Sky mesh provides the backdrop; clear color stays authored for any gaps.
      this.scene.background = new THREE.Color(s.background);
    } else {
      if (!(this.scene.background instanceof THREE.Color)) {
        this.scene.background = new THREE.Color(s.background);
      } else {
        this.scene.background.set(s.background);
      }
      // Blurriness only applies to texture/env backgrounds.
      this.scene.backgroundBlurriness = 0;
    }

    if (this._sky) {
      this._configureSky(s.sky);
      this._sky.visible = this._perspectiveVisible && showSky;
    }
    if (this._grounded) {
      this._grounded.visible = this._perspectiveVisible && Boolean(s.groundedSkybox?.enabled);
    }
  }

  _configureSky(sky = {}) {
    if (!this._sky) return;
    const u = this._sky.material.uniforms;
    u.turbidity.value = sky.turbidity;
    u.rayleigh.value = sky.rayleigh;
    u.mieCoefficient.value = sky.mieCoefficient;
    u.mieDirectionalG.value = sky.mieDirectionalG;
    u.sunPosition.value.copy(sunDirectionFromSky(sky));
    const scale = Math.max(10, Number(sky.scale) || 450000);
    this._sky.scale.setScalar(scale);
  }

  _ensureSky(enabled) {
    if (!enabled) {
      this._removeSky();
      return;
    }
    if (this._sky) return;
    const sky = new Sky();
    sky.name = 'WorldSky';
    sky.renderOrder = -1000;
    markOwnedGpuResource(sky.geometry);
    markOwnedGpuResource(sky.material);
    this.scene.add(sky);
    this._sky = sky;
  }

  _removeSky() {
    if (!this._sky) return;
    this.scene?.remove(this._sky);
    this._sky.geometry?.dispose?.();
    this._sky.material?.dispose?.();
    this._sky = null;
  }

  _ensureGrounded(enabled) {
    if (!enabled) {
      this._removeGrounded();
      return;
    }
    const map = this.activeEnvironment;
    const gs = this._settings.groundedSkybox || {};
    const height = Math.max(0.1, Number(gs.height) || 15);
    const radius = Math.max(1, Number(gs.radius) || 100);
    // Rebuild when map/height/radius change.
    const key = `${map?.uuid || 'none'}:${height}:${radius}`;
    if (this._grounded && this._grounded.userData.bbGroundedKey === key) {
      this._grounded.position.y = height;
      return;
    }
    this._removeGrounded();
    if (!map) return;
    try {
      const mesh = new GroundedSkybox(map, height, radius);
      mesh.name = 'WorldGroundedSkybox';
      mesh.position.y = height;
      mesh.renderOrder = -999;
      mesh.userData.bbGroundedKey = key;
      markOwnedGpuResource(mesh.geometry);
      markOwnedGpuResource(mesh.material);
      this.scene.add(mesh);
      this._grounded = mesh;
    } catch (err) {
      console.warn('[BloodBound] GroundedSkybox failed', err);
    }
  }

  _removeGrounded() {
    if (!this._grounded) return;
    this.scene?.remove(this._grounded);
    this._grounded.geometry?.dispose?.();
    this._grounded.material?.dispose?.();
    this._grounded = null;
  }

  _syncAuthoredEnvironment() {
    const assetId = this._settings.environmentAssetId || null;
    if (!assetId) {
      this._loadToken += 1;
      this._clearAuthoredPmrem();
      this._applyLighting();
      this._applyBackgroundAndSky();
      this._syncProbe();
      return;
    }
    if (assetId === this._authoredAssetId && this._authoredPmrem?.texture) {
      this._applyLighting();
      this._applyBackgroundAndSky();
      this._syncProbe();
      return;
    }

    const url = this._resolveUrl(assetId);
    if (!url) {
      this._clearAuthoredPmrem();
      this._applyLighting();
      this._applyBackgroundAndSky();
      this._syncProbe();
      return;
    }

    const token = ++this._loadToken;
    loadEnvironmentEquirect(url).then((equirect) => {
      if (token !== this._loadToken) return;
      if (!equirect) {
        this._clearAuthoredPmrem();
        this._applyLighting();
        this._applyBackgroundAndSky();
        this._syncProbe();
        return;
      }
      const next = buildPmremFromEquirect(this.renderer, equirect);
      disposePmremTarget(this._authoredPmrem);
      this._authoredPmrem = next;
      this._authoredAssetId = assetId;
      this._applyLighting();
      this._applyBackgroundAndSky();
      this._syncProbe();
    });
  }

  _clearAuthoredPmrem() {
    disposePmremTarget(this._authoredPmrem);
    this._authoredPmrem = null;
    this._authoredAssetId = null;
  }

  _syncProbe() {
    const enabled = Boolean(this._settings.lightProbeEnabled);
    if (!enabled) {
      this._removeProbe();
      return;
    }
    const intensity = Math.max(0, Number(this._settings.lightProbeIntensity) || 0);
    // Prefer async bake from PMREM RT when authored; otherwise skip (studio is fromScene).
    const rt = this._authoredPmrem;
    if (!rt || !this.renderer) {
      this._removeProbe();
      return;
    }
    const token = this._loadToken;
    LightProbeGenerator.fromCubeRenderTarget(this.renderer, rt)
      .then((probe) => {
        if (token !== this._loadToken) {
          probe?.dispose?.();
          return;
        }
        this._removeProbe();
        probe.intensity = intensity;
        probe.name = 'WorldLightProbe';
        this.scene.add(probe);
        this._probe = probe;
      })
      .catch((err) => {
        console.warn('[BloodBound] LightProbe bake failed', err);
      });
  }

  _removeProbe() {
    if (!this._probe) return;
    this.scene?.remove(this._probe);
    this._probe = null;
  }
}
