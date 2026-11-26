import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { toMeters } from '../core/units.js';
import {
  normalizeLightFields,
  normalizeLensflareElements,
} from '../components/LightComponent.js';
import { loadTexture, assetUrl } from './materialFactory.js';
import { markOwnedGpuResource, isSharedGpuResource } from './gpuResources.js';

function disposeOwnedTexture(tex) {
  if (!tex?.dispose || isSharedGpuResource(tex)) return;
  tex.dispose();
}

let rectAreaUniformsReady = false;

/** Call once before any RectAreaLight is added to a WebGL scene. */
export function ensureRectAreaLightUniforms() {
  if (rectAreaUniformsReady) return;
  RectAreaLightUniformsLib.init();
  rectAreaUniformsReady = true;
}

/**
 * Build a Three.js light graph from a LightComponent.
 * Returns { root, light, target, lensflare, helper, dispose }.
 *
 * @param {object} comp LightComponent-like
 * @param {{ resolveTextureUrl?: (id: string) => string|null, maxAnisotropy?: number }} [options]
 */
export async function createThreeLightFromComponent(comp, options = {}) {
  const def = normalizeLightFields(comp);
  const color = new THREE.Color(def.color || '#ffffff');
  let light;
  let root;
  let helper = null;

  if (def.lightType === 'directional') {
    light = new THREE.DirectionalLight(color, def.intensity);
    light.position.set(0, 0, 0);
    light.target.position.set(0, -1, 0);
  } else if (def.lightType === 'ambient') {
    light = new THREE.AmbientLight(color, def.intensity);
  } else if (def.lightType === 'hemisphere') {
    light = new THREE.HemisphereLight(
      color,
      new THREE.Color(def.groundColor || '#444444'),
      def.intensity,
    );
  } else if (def.lightType === 'rectArea') {
    ensureRectAreaLightUniforms();
    light = new THREE.RectAreaLight(
      color,
      def.intensity,
      toMeters(def.width),
      toMeters(def.height),
    );
    // RectArea emits along local -Z in Three.js; rotate so actor -Y aim matches legacy spot/dir feel.
    light.rotation.x = -Math.PI / 2;
  } else if (def.lightType === 'spot') {
    const rangeMeters = toMeters(def.range ?? 1000);
    light = new THREE.SpotLight(
      color,
      resolveIntensity(def),
      rangeMeters,
      THREE.MathUtils.degToRad(def.spotAngle ?? 45),
      def.spotPenumbra ?? 0.25,
      def.decay ?? 2,
    );
    light.position.set(0, 0, 0);
    light.target.position.set(0, -1, 0);
  } else {
    const rangeMeters = toMeters(def.range ?? 1000);
    light = new THREE.PointLight(color, resolveIntensity(def), rangeMeters, def.decay ?? 2);
  }

  applyShadowSettings(light, def);

  if (def.lightType === 'spot' && def.spotMapId && typeof options.resolveTextureUrl === 'function') {
    const url = options.resolveTextureUrl(def.spotMapId);
    if (url) {
      const tex = await loadTexture(url);
      if (tex) {
        const clone = markOwnedGpuResource(tex.clone());
        clone.colorSpace = THREE.SRGBColorSpace;
        clone.needsUpdate = true;
        if (options.maxAnisotropy) clone.anisotropy = options.maxAnisotropy;
        light.map = clone;
      }
    }
  }

  let lensflare = null;
  if (def.lensflareEnabled && def.lensflareElements?.length) {
    lensflare = await createLensflareObject(def.lensflareElements, options);
    if (lensflare) {
      light.add(lensflare);
    }
  }

  if (light.target) {
    root = new THREE.Group();
    root.add(light);
    root.add(light.target);
    light.target.position.set(0, -1, 0);
  } else {
    root = light;
  }

  if (def.showHelper) {
    helper = createNativeLightHelper(light, def);
    if (helper) {
      helper.userData.editorOnly = true;
      helper.userData.bbLightHelper = true;
      if (root.isGroup) root.add(helper);
      else {
        const wrap = new THREE.Group();
        wrap.add(light);
        wrap.add(helper);
        root = wrap;
      }
    }
  }

  const dispose = () => {
    if (light?.map) {
      disposeOwnedTexture(light.map);
      light.map = null;
    }
    if (lensflare) {
      disposeLensflare(lensflare);
    }
    if (helper) {
      helper.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
      helper.dispose?.();
    }
  };

  root.userData.bbLightRoot = true;
  root.userData.bbLightType = def.lightType;
  light.userData.bbLightType = def.lightType;

  return { root, light, target: light.target || null, lensflare, helper, dispose };
}

function resolveIntensity(def) {
  if (def.power != null && Number.isFinite(Number(def.power)) && Number(def.power) > 0) {
    // PhysicallyCorrectLights-style: power (lm) → intensity (cd) for point/spot.
    return Number(def.power) / (4 * Math.PI);
  }
  return def.intensity ?? 1;
}

function applyShadowSettings(light, def) {
  const canShadow = light.isDirectionalLight || light.isSpotLight || light.isPointLight;
  if (!canShadow) return;
  light.castShadow = Boolean(def.castShadow);
  if (!light.castShadow || !light.shadow) return;

  const mapSize = Math.max(256, Number(def.shadowMapSize) || 1024);
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = Number(def.shadowBias);
  light.shadow.normalBias = Number(def.shadowNormalBias);
  light.shadow.radius = Number(def.shadowRadius);
  if ('blurSamples' in light.shadow) {
    light.shadow.blurSamples = Number(def.shadowBlurSamples) || 8;
  }

  if (light.isDirectionalLight) {
    const extent = Math.max(0.5, Number(def.shadowCameraSize) || 20);
    light.shadow.camera.left = -extent;
    light.shadow.camera.right = extent;
    light.shadow.camera.top = extent;
    light.shadow.camera.bottom = -extent;
    light.shadow.camera.near = Math.max(0.01, Number(def.shadowCameraNear) || 0.5);
    light.shadow.camera.far = Math.max(light.shadow.camera.near + 0.1, Number(def.shadowCameraFar) || 80);
    light.shadow.camera.updateProjectionMatrix();
  } else if (light.isSpotLight || light.isPointLight) {
    const rangeMeters = toMeters(def.range ?? 1000);
    light.shadow.camera.near = Math.max(0.01, Number(def.shadowCameraNear) || 0.2);
    const farAuthored = Number(def.shadowCameraFar);
    // Preserve legacy behavior: far tracks range unless author raises it.
    light.shadow.camera.far = Math.max(
      light.shadow.camera.near + 0.1,
      Number.isFinite(farAuthored) && farAuthored > 0 ? farAuthored : Math.max(rangeMeters, 1),
    );
    light.shadow.camera.updateProjectionMatrix();
  }
}

async function createLensflareObject(elements, options = {}) {
  const list = normalizeLensflareElements(elements);
  if (!list.length) return null;
  const flare = new Lensflare();
  flare.userData.bbLensflare = true;
  // Perspective-only — SceneView hides these for orthographic panes.
  flare.userData.hideInOrtho = true;

  for (const el of list) {
    if (!el.textureAssetId || typeof options.resolveTextureUrl !== 'function') continue;
    const url = options.resolveTextureUrl(el.textureAssetId);
    if (!url) continue;
    const tex = await loadTexture(url);
    if (!tex) continue;
    const clone = markOwnedGpuResource(tex.clone());
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.needsUpdate = true;
    flare.addElement(new LensflareElement(
      clone,
      el.size,
      el.distance,
      new THREE.Color(el.color || '#ffffff'),
    ));
  }

  if (!flare.elements?.length) {
    flare.dispose?.();
    return null;
  }
  return flare;
}

function disposeLensflare(flare) {
  if (!flare) return;
  for (const el of flare.elements || []) {
    disposeOwnedTexture(el.map);
  }
  flare.dispose?.();
}

function createNativeLightHelper(light, def) {
  try {
    if (light.isDirectionalLight) {
      return new THREE.DirectionalLightHelper(light, 0.5);
    }
    if (light.isSpotLight) {
      return new THREE.SpotLightHelper(light);
    }
    if (light.isPointLight) {
      return new THREE.PointLightHelper(light, 0.25);
    }
    if (light.isHemisphereLight) {
      return new THREE.HemisphereLightHelper(light, 0.4);
    }
    if (light.isRectAreaLight) {
      return new RectAreaLightHelper(light);
    }
  } catch {
    return null;
  }
  void def;
  return null;
}

/**
 * Aim light.target at a world-space point expressed in the light root's parent space.
 * When targetActorId is unset, restores local (0,-1,0).
 */
export function updateLightTargetAim(light, root, worldPointLocalToParent) {
  if (!light?.target || !root) return;
  if (!worldPointLocalToParent) {
    light.target.position.set(0, -1, 0);
  } else {
    // worldPointLocalToParent is already in the same space as root.parent
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const local = worldPointLocalToParent.clone().applyMatrix4(inv);
    light.target.position.copy(local);
  }
  light.target.updateMatrixWorld(true);
}

/**
 * Toggle lensflare visibility for orthographic panes.
 * Call from SceneView when applying per-pane camera state.
 */
export function setLensflarePerspectiveVisible(root, visible) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.userData?.bbLensflare || obj.userData?.hideInOrtho) {
      obj.visible = visible;
    }
  });
}

export function isRectAreaUniformsReady() {
  return rectAreaUniformsReady;
}

/** Test helper — reset init flag between isolated tests. */
export function __resetRectAreaUniformsForTests() {
  rectAreaUniformsReady = false;
}

export { assetUrl };
