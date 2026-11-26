import * as THREE from 'three';
import { Water as Water2 } from 'three/addons/objects/Water2.js';
import { Water } from 'three/addons/objects/Water.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { toMeters } from '../core/units.js';
import { normalizeEnvironmentFields } from '../components/EnvironmentComponent.js';
import { loadTexture, assetUrl } from './materialFactory.js';
import { markOwnedGpuResource, isSharedGpuResource } from './gpuResources.js';

/** Nested reflection/refraction guard — prevent RT recursion across mirrors/water. */
let envPassDepth = 0;

function disposeOwnedTexture(tex) {
  if (!tex?.dispose || isSharedGpuResource(tex)) return;
  tex.dispose();
}

function qualityToResolution(quality, authored) {
  const base = authored || 512;
  if (quality === 'low') return Math.min(base, 256);
  if (quality === 'high') return Math.max(base, 512);
  return base;
}

function wrapEnvPass(object) {
  if (!object?.onBeforeRender) return;
  const prior = object.onBeforeRender.bind(object);
  object.onBeforeRender = function wrappedEnvPass(renderer, scene, camera) {
    if (envPassDepth > 0) return;
    envPassDepth += 1;
    const hidden = [];
    scene.traverse((obj) => {
      if (obj === object) return;
      if (obj.isReflector || obj.isRefractor || obj.isWater) {
        if (obj.visible) {
          hidden.push(obj);
          obj.visible = false;
        }
      }
    });
    try {
      prior(renderer, scene, camera);
    } finally {
      for (const obj of hidden) obj.visible = true;
      envPassDepth -= 1;
    }
  };
}

function makePlane(widthEu, heightEu) {
  const geo = new THREE.PlaneGeometry(toMeters(widthEu), toMeters(heightEu));
  markOwnedGpuResource(geo);
  return geo;
}

function makeOrthoProxy(widthEu, heightEu, color, opacity = 1) {
  const geo = makePlane(widthEu, heightEu);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color || '#4a90a4'),
    transparent: opacity < 0.999,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.999,
  });
  markOwnedGpuResource(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.bbEnvOrthoProxy = true;
  return mesh;
}

/**
 * Build a Three.js environmental object from EnvironmentComponent.
 * @returns {Promise<{ root: THREE.Object3D, dispose: Function, kind: string, syncSky?: Function }>}
 */
export async function createThreeEnvironmentFromComponent(comp, options = {}) {
  const def = normalizeEnvironmentFields(comp);
  const resolveUrl = options.resolveTextureUrl
    || ((id) => (id ? assetUrl(`textures/${id}.png`) : null));
  const maxAniso = options.maxAnisotropy || 8;
  const rt = qualityToResolution(def.quality, def.textureResolution);

  if (def.envType === 'sky') {
    return createSky(def);
  }
  if (def.envType === 'sprite') {
    return createSprite(def, resolveUrl, maxAniso);
  }
  if (def.envType === 'decal') {
    return createDecal(def, options, resolveUrl, maxAniso);
  }
  if (def.envType === 'reflector') {
    return createReflector(def, rt);
  }
  if (def.envType === 'refractor') {
    return createRefractor(def, rt);
  }
  if (def.envType === 'water') {
    return createWaterSimple(def, rt, resolveUrl, maxAniso);
  }
  return createWater2(def, rt, resolveUrl, maxAniso);
}

async function loadOptionalMap(id, resolveUrl, maxAniso, colorSpace = THREE.LinearSRGBColorSpace) {
  if (!id) return null;
  try {
    const url = resolveUrl(id);
    if (!url) return null;
    const tex = await loadTexture(url, { colorSpace, maxAnisotropy: maxAniso });
    if (!tex) return null;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  } catch {
    return null;
  }
}

async function createWater2(def, rt, resolveUrl, maxAniso) {
  const geo = makePlane(def.width, def.height);
  const normal0 = await loadOptionalMap(def.normalMap0Id, resolveUrl, maxAniso);
  const normal1 = await loadOptionalMap(def.normalMap1Id, resolveUrl, maxAniso);
  const n0 = normal0 || makeFlatNormalTexture();
  const n1 = normal1 || n0;
  if (!normal0) markOwnedGpuResource(n0);
  if (!normal1 && n1 !== n0) markOwnedGpuResource(n1);

  n0.wrapS = n0.wrapT = THREE.RepeatWrapping;
  n1.wrapS = n1.wrapT = THREE.RepeatWrapping;

  // Compose official Water2 pieces with owned Reflector/Refractor for RT dispose.
  const reflector = new Reflector(geo, {
    textureWidth: rt,
    textureHeight: rt,
    clipBias: def.clipBias,
  });
  const refractor = new Refractor(geo, {
    textureWidth: rt,
    textureHeight: rt,
    clipBias: def.clipBias,
  });
  reflector.matrixAutoUpdate = false;
  refractor.matrixAutoUpdate = false;

  const shader = Water2.WaterShader;
  const cycle = 0.15;
  const halfCycle = cycle * 0.5;
  const textureMatrix = new THREE.Matrix4();
  const flowDirection = new THREE.Vector2(def.flowDirection.x, def.flowDirection.y);
  const flowSpeed = def.flowSpeed;

  const material = new THREE.ShaderMaterial({
    name: shader.name,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      shader.uniforms,
    ]),
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    transparent: true,
    fog: true,
  });
  markOwnedGpuResource(material);
  material.uniforms.tReflectionMap.value = reflector.getRenderTarget().texture;
  material.uniforms.tRefractionMap.value = refractor.getRenderTarget().texture;
  material.uniforms.tNormalMap0.value = n0;
  material.uniforms.tNormalMap1.value = n1;
  material.uniforms.color.value = new THREE.Color(def.color);
  material.uniforms.reflectivity.value = def.reflectivity;
  material.uniforms.textureMatrix.value = textureMatrix;
  material.uniforms.flowDirection = { value: flowDirection };
  material.uniforms.config.value.set(0, halfCycle, halfCycle, def.waterScale);

  const water = new THREE.Mesh(geo, material);
  water.isWater = true;
  water.userData.bbWater2 = true;

  let lastFlowTime = performance.now();
  water.onBeforeRender = function (renderer, scene, camera) {
    if (envPassDepth > 0) return;
    envPassDepth += 1;
    const hidden = [];
    scene.traverse((obj) => {
      if (obj === water) return;
      if (obj.isReflector || obj.isRefractor || obj.isWater) {
        if (obj.visible) {
          hidden.push(obj);
          obj.visible = false;
        }
      }
    });
    try {
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastFlowTime) / 1000);
      lastFlowTime = now;
      const config = material.uniforms.config;
      config.value.x += flowSpeed * delta;
      config.value.y = config.value.x + halfCycle;
      if (config.value.x >= cycle) {
        config.value.x = 0;
        config.value.y = halfCycle;
      } else if (config.value.y >= cycle) {
        config.value.y = config.value.y - cycle;
      }

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      );
      textureMatrix.multiply(camera.projectionMatrix);
      textureMatrix.multiply(camera.matrixWorldInverse);
      textureMatrix.multiply(water.matrixWorld);

      water.visible = false;
      reflector.matrixWorld.copy(water.matrixWorld);
      refractor.matrixWorld.copy(water.matrixWorld);
      reflector.onBeforeRender(renderer, scene, camera);
      refractor.onBeforeRender(renderer, scene, camera);
      water.visible = true;
    } finally {
      for (const obj of hidden) obj.visible = true;
      envPassDepth -= 1;
    }
  };

  const ortho = makeOrthoProxy(def.width, def.height, def.color, 0.7);
  ortho.visible = false;

  const root = new THREE.Group();
  root.add(water);
  root.add(ortho);
  root.userData.bbEnvKind = 'water2';
  root.userData.bbEnvPerspectiveMesh = water;
  root.userData.bbEnvOrthoMesh = ortho;

  return {
    root,
    kind: 'water2',
    dispose: () => {
      reflector.dispose?.();
      refractor.dispose?.();
      // geo shared with reflector/refractor — dispose once
      geo.dispose?.();
      material.dispose?.();
      if (normal0) disposeOwnedTexture(normal0);
      if (normal1 && normal1 !== normal0) disposeOwnedTexture(normal1);
      if (!normal0) disposeOwnedTexture(n0);
      ortho.geometry?.dispose?.();
      ortho.material?.dispose?.();
    },
  };
}

async function createWaterSimple(def, rt, resolveUrl, maxAniso) {
  const geo = makePlane(def.width, def.height);
  const normals = await loadOptionalMap(def.normalMap0Id, resolveUrl, maxAniso);
  const waterNormals = normals || makeFlatNormalTexture();
  if (!normals) markOwnedGpuResource(waterNormals);

  const water = new Water(geo, {
    textureWidth: rt,
    textureHeight: rt,
    waterNormals,
    sunDirection: new THREE.Vector3(def.sunDirection.x, def.sunDirection.y, def.sunDirection.z),
    sunColor: def.sunColor,
    waterColor: def.color,
    distortionScale: def.distortionScale,
    alpha: def.opacity,
    fog: true,
    clipBias: def.clipBias,
  });
  wrapEnvPass(water);
  const ortho = makeOrthoProxy(def.width, def.height, def.color, 0.7);
  ortho.visible = false;

  const root = new THREE.Group();
  root.add(water);
  root.add(ortho);
  root.userData.bbEnvKind = 'water';
  root.userData.bbEnvPerspectiveMesh = water;
  root.userData.bbEnvOrthoMesh = ortho;

  // Drive Water.js time uniform for animation.
  let t0 = performance.now();
  root.userData.bbEnvTick = () => {
    const u = water.material?.uniforms;
    if (!u?.time) return;
    u.time.value = (performance.now() - t0) * 0.001 * Math.max(0.1, def.flowSpeed * 30);
  };

  return {
    root,
    kind: 'water',
    dispose: () => {
      water.geometry?.dispose?.();
      water.material?.dispose?.();
      if (normals) disposeOwnedTexture(normals);
      else disposeOwnedTexture(waterNormals);
      ortho.geometry?.dispose?.();
      ortho.material?.dispose?.();
    },
  };
}

function createReflector(def, rt) {
  const geo = makePlane(def.width, def.height);
  const reflector = new Reflector(geo, {
    color: def.color,
    textureWidth: rt,
    textureHeight: rt,
    clipBias: def.clipBias,
    multisample: def.multisample,
  });
  wrapEnvPass(reflector);
  const ortho = makeOrthoProxy(def.width, def.height, def.color, 1);
  ortho.visible = false;

  const root = new THREE.Group();
  root.add(reflector);
  root.add(ortho);
  root.userData.bbEnvKind = 'reflector';
  root.userData.bbEnvPerspectiveMesh = reflector;
  root.userData.bbEnvOrthoMesh = ortho;

  return {
    root,
    kind: 'reflector',
    dispose: () => {
      reflector.geometry?.dispose?.();
      reflector.material?.dispose?.();
      reflector.dispose?.();
      ortho.geometry?.dispose?.();
      ortho.material?.dispose?.();
    },
  };
}

function createRefractor(def, rt) {
  const geo = makePlane(def.width, def.height);
  const refractor = new Refractor(geo, {
    color: def.color,
    textureWidth: rt,
    textureHeight: rt,
    clipBias: def.clipBias,
    multisample: def.multisample,
  });
  wrapEnvPass(refractor);
  const ortho = makeOrthoProxy(def.width, def.height, def.color, 0.85);
  ortho.visible = false;

  const root = new THREE.Group();
  root.add(refractor);
  root.add(ortho);
  root.userData.bbEnvKind = 'refractor';
  root.userData.bbEnvPerspectiveMesh = refractor;
  root.userData.bbEnvOrthoMesh = ortho;

  return {
    root,
    kind: 'refractor',
    dispose: () => {
      refractor.geometry?.dispose?.();
      refractor.material?.dispose?.();
      refractor.dispose?.();
      ortho.geometry?.dispose?.();
      ortho.material?.dispose?.();
    },
  };
}

async function createSprite(def, resolveUrl, maxAniso) {
  const map = await loadOptionalMap(def.mapId, resolveUrl, maxAniso, THREE.SRGBColorSpace);
  const mat = new THREE.SpriteMaterial({
    map: map || null,
    color: new THREE.Color(def.color),
    opacity: def.opacity,
    transparent: def.opacity < 0.999 || Boolean(map),
    sizeAttenuation: def.sizeAttenuation,
    rotation: THREE.MathUtils.degToRad(def.spriteRotation),
    fog: def.fog,
    depthTest: def.depthTest,
    depthWrite: def.depthWrite,
  });
  markOwnedGpuResource(mat);
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(def.center.x, def.center.y);
  sprite.scale.set(toMeters(def.width), toMeters(def.height), 1);
  sprite.userData.bbEnvKind = 'sprite';
  // Authoring billboard — not an editor-only helper icon.
  sprite.userData.bbAuthoredBillboard = true;

  return {
    root: sprite,
    kind: 'sprite',
    dispose: () => {
      mat.dispose?.();
      if (map) disposeOwnedTexture(map);
    },
  };
}

function createSky(def) {
  const sky = new Sky();
  sky.scale.setScalar(def.skyScale);
  const uniforms = sky.material.uniforms;
  const syncSky = (next = def) => {
    uniforms.turbidity.value = next.turbidity;
    uniforms.rayleigh.value = next.rayleigh;
    uniforms.mieCoefficient.value = next.mieCoefficient;
    uniforms.mieDirectionalG.value = next.mieDirectionalG;
    const phi = THREE.MathUtils.degToRad(90 - next.elevation);
    const theta = THREE.MathUtils.degToRad(next.azimuth);
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    uniforms.sunPosition.value.copy(sun);
  };
  syncSky(def);
  sky.userData.bbEnvKind = 'sky';
  sky.userData.bbPlaceableSky = true;
  sky.name = 'PlaceableSky';

  return {
    root: sky,
    kind: 'sky',
    syncSky,
    dispose: () => {
      sky.geometry?.dispose?.();
      sky.material?.dispose?.();
    },
  };
}

async function createDecal(def, options, resolveUrl, maxAniso) {
  const root = new THREE.Group();
  root.userData.bbEnvKind = 'decal';

  const map = await loadOptionalMap(def.mapId, resolveUrl, maxAniso, THREE.SRGBColorSpace);
  const mat = new THREE.MeshStandardMaterial({
    map: map || null,
    color: new THREE.Color(def.color),
    transparent: true,
    opacity: def.opacity,
    depthTest: def.depthTest,
    depthWrite: def.depthWrite,
    polygonOffset: def.polygonOffset,
    polygonOffsetFactor: def.polygonOffsetFactor,
    polygonOffsetUnits: def.polygonOffsetUnits,
    side: THREE.DoubleSide,
  });
  markOwnedGpuResource(mat);

  // Placeholder plane until target mesh is resolved in SceneView.
  const placeholder = new THREE.Mesh(
    makePlane(def.decalSize.x, def.decalSize.y),
    mat,
  );
  placeholder.userData.bbDecalPlaceholder = true;
  root.add(placeholder);
  root.userData.bbDecalMaterial = mat;
  root.userData.bbDecalDef = def;

  return {
    root,
    kind: 'decal',
    material: mat,
    dispose: () => {
      mat.dispose?.();
      if (map) disposeOwnedTexture(map);
      root.traverse((o) => {
        if (o.geometry && o.userData?.bbOwnedDecalGeo) o.geometry.dispose?.();
      });
    },
  };
}

/**
 * Project / rebuild DecalGeometry onto a target mesh (world-space projector).
 * @param {THREE.Object3D} decalRoot
 * @param {THREE.Mesh} targetMesh
 * @param {THREE.Vector3} worldPos
 * @param {THREE.Euler} worldOrient
 * @param {{ x:number,y:number,z:number }} sizeEu
 */
export function rebuildDecalGeometry(decalRoot, targetMesh, worldPos, worldOrient, sizeEu) {
  if (!decalRoot || !targetMesh?.isMesh) return false;
  const mat = decalRoot.userData.bbDecalMaterial;
  if (!mat) return false;

  // Remove previous projected mesh / placeholder.
  const stale = [...decalRoot.children];
  for (const child of stale) {
    decalRoot.remove(child);
    if (child.geometry && (child.userData.bbOwnedDecalGeo || child.userData.bbDecalPlaceholder)) {
      child.geometry.dispose?.();
    }
  }

  const size = new THREE.Vector3(
    toMeters(sizeEu.x),
    toMeters(sizeEu.y),
    toMeters(sizeEu.z),
  );
  let geo;
  try {
    geo = new DecalGeometry(targetMesh, worldPos, worldOrient, size);
  } catch {
    return false;
  }
  markOwnedGpuResource(geo);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.bbOwnedDecalGeo = true;
  mesh.userData.pickable = true;
  // Decal vertices are in target mesh local space — parent under target? 
  // DecalGeometry returns geometry in mesh local space. Attach to target's parent
  // with same matrix as target, OR add to target.
  // Official examples parent decal in scene with identity and use mesh-local verts
  // when mesh is at origin. Safer: add as child of target mesh.
  targetMesh.add(mesh);
  mesh.userData.bbDecalDetached = true;
  decalRoot.userData.bbDecalMesh = mesh;
  decalRoot.userData.bbDecalHost = targetMesh;
  return true;
}

function makeFlatNormalTexture() {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  return tex;
}

/** Toggle perspective RT meshes vs ortho proxies for one env root. */
export function setEnvironmentPerspectiveVisible(root, perspective) {
  if (!root) return;
  const persp = root.userData.bbEnvPerspectiveMesh;
  const ortho = root.userData.bbEnvOrthoMesh;
  if (persp) persp.visible = perspective;
  if (ortho) ortho.visible = !perspective;
  if (root.userData.bbPlaceableSky) {
    root.visible = perspective;
  }
}

export function tickEnvironmentVisuals(scene, dt) {
  scene?.traverse((obj) => {
    if (typeof obj.userData?.bbEnvTick === 'function') {
      obj.userData.bbEnvTick(dt);
    }
  });
}
