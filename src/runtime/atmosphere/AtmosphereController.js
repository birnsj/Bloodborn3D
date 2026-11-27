/**
 * Layered moving atmosphere for World Fog:
 * - world-space particle mist (wraps around camera; does not stick to it)
 * - lagged noise billboard sheets (noise-only path)
 * - camera-local volumetric raymarch volume with scene-depth termination
 *
 * Lives in the scene (not EffectComposer). Caller hides in orthographic panes.
 * Depth soft-occlusion requires captureDepth() before each perspective draw.
 */

import * as THREE from 'three';
import { normalizeWorldFog } from '../../core/World.js';

const BOX_HALF = 8; // mist wrap box half-extent (meters)
const NOISE_SHEET_COUNT = 3;
const DEPTH_SOFT = 0.55; // meters — soft particle / sheet fade against walls
const ANCHOR_FOLLOW = 3.5; // noise-sheet lag rate

/** Perspective cameras enable this layer; ortho cameras leave it off so fog never draws in Top/Front/etc. */
export const ATMOSPHERE_LAYER = 2;

function assignAtmosphereLayer(object) {
  if (!object) return;
  object.layers.set(ATMOSPHERE_LAYER);
  object.traverse?.((child) => {
    child.layers.set(ATMOSPHERE_LAYER);
  });
}

/** Enable or disable atmosphere visibility for a camera via layers (more reliable than toggling scene graph). */
export function syncCameraAtmosphereLayer(camera, enabled) {
  if (!camera?.layers) return;
  if (enabled) camera.layers.enable(ATMOSPHERE_LAYER);
  else camera.layers.disable(ATMOSPHERE_LAYER);
}

function createSoftParticleTexture() {
  const size = 64;
  // Prefer canvas when available; fall back to a generated DataTexture (tests / headless).
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext?.('2d');
      if (ctx?.createRadialGradient) {
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
      }
    } catch {
      /* fall through */
    }
  }
  const data = new Uint8Array(size * size * 4);
  const cx = (size - 1) * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cx) / cx;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const a = Math.round(255 * Math.max(0, 1 - d) ** 2);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/** Shared GLSL value-noise helpers for sheet + volume shaders. */
const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + 17.0;
    a *= 0.5;
  }
  return v;
}
`;

const DEPTH_SAMPLE_GLSL = /* glsl */ `
uniform sampler2D uDepth;
uniform vec2 uBufferSize;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uSoft;
uniform float uUseDepth;

float sampleSceneViewZ(vec2 fragCoord) {
  vec2 uv = fragCoord / uBufferSize;
  float d = texture2D(uDepth, uv).x;
  return perspectiveDepthToViewZ(d, uCameraNear, uCameraFar);
}
float softDepthFade(float fragViewZ, vec2 fragCoord) {
  if (uUseDepth < 0.5) return 1.0;
  float sceneZ = sampleSceneViewZ(fragCoord);
  // View Z is negative; sceneZ closer to 0 is nearer the camera.
  float diff = fragViewZ - sceneZ; // >0 means fragment is in front of occluder
  return smoothstep(0.0, max(uSoft, 0.05), diff);
}
`;

function createMistMaterial(map) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color('#6a7380') },
      uOpacity: { value: 0.35 },
      uSize: { value: 0.6 },
      uDepth: { value: null },
      uBufferSize: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 500 },
      uSoft: { value: DEPTH_SOFT },
      uUseDepth: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec3 vViewPos;
      varying float vPointSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        float dist = max(0.15, -mv.z);
        gl_PointSize = uSize * (180.0 / dist);
        vPointSize = gl_PointSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vViewPos;
      varying float vPointSize;
      ${DEPTH_SAMPLE_GLSL}
      void main() {
        vec2 uv = gl_PointCoord;
        vec4 texel = texture2D(map, uv);
        float a = texel.a * uOpacity;
        a *= softDepthFade(vViewPos.z, gl_FragCoord.xy);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function createNoiseSheetMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#6a7380') },
      uTime: { value: 0 },
      uStrength: { value: 0.35 },
      uScale: { value: 0.45 },
      uSpeed: { value: 0.08 },
      uOpacity: { value: 0.18 },
      uDepth: { value: null },
      uBufferSize: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 500 },
      uSoft: { value: DEPTH_SOFT * 1.4 },
      uUseDepth: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uStrength;
      uniform float uScale;
      uniform float uSpeed;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      ${NOISE_GLSL}
      ${DEPTH_SAMPLE_GLSL}
      void main() {
        float radial = 1.0 - smoothstep(0.15, 0.92, length(vUv - 0.5) * 2.0);
        vec3 p = vWorldPos * uScale + vec3(uTime * uSpeed, uTime * uSpeed * 0.37, -uTime * uSpeed * 0.21);
        float n = fbm(p);
        float a = radial * uStrength * uOpacity * smoothstep(0.28, 0.72, n);
        a *= softDepthFade(vViewPos.z, gl_FragCoord.xy);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

function createVolumetricMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false, // raymarch handles occlusion via depth texture
    side: THREE.BackSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#6a7380') },
      uTime: { value: 0 },
      uDensity: { value: 0.35 },
      uExtent: { value: 12 },
      uSteps: { value: 12 },
      uNoise: { value: 0 },
      uNoiseStrength: { value: 0.35 },
      uNoiseScale: { value: 0.45 },
      uNoiseSpeed: { value: 0.08 },
      uCameraPos: { value: new THREE.Vector3() },
      uDepth: { value: null },
      uBufferSize: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 500 },
      uSoft: { value: 0.35 },
      uUseDepth: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <packing>
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uDensity;
      uniform float uExtent;
      uniform float uSteps;
      uniform float uNoise;
      uniform float uNoiseStrength;
      uniform float uNoiseScale;
      uniform float uNoiseSpeed;
      uniform vec3 uCameraPos;
      varying vec3 vWorldPos;
      ${NOISE_GLSL}
      ${DEPTH_SAMPLE_GLSL}
      void main() {
        vec3 rayDir = normalize(vWorldPos - uCameraPos);
        float maxDist = uExtent * 1.732;
        float stepSize = maxDist / max(uSteps, 1.0);
        float sceneZ = uUseDepth > 0.5
          ? sampleSceneViewZ(gl_FragCoord.xy)
          : -uCameraFar;

        vec3 pos = uCameraPos;
        float accum = 0.0;
        for (int i = 0; i < 16; i++) {
          if (float(i) >= uSteps) break;
          pos += rayDir * stepSize;
          vec4 viewPos = viewMatrix * vec4(pos, 1.0);
          // Stop at / soft-fade into occluders (view Z more negative = farther).
          if (uUseDepth > 0.5 && viewPos.z <= sceneZ + uSoft) {
            float edge = smoothstep(sceneZ - uSoft, sceneZ + uSoft, viewPos.z);
            if (edge < 0.02) break;
            // Partial last contribution near the wall, then stop.
            vec3 local = pos - uCameraPos;
            float box = max(max(abs(local.x), abs(local.y)), abs(local.z));
            if (box <= uExtent) {
              float falloff = 1.0 - smoothstep(uExtent * 0.4, uExtent, box);
              float dens = uDensity * falloff * edge;
              if (uNoise > 0.5) {
                vec3 np = pos * uNoiseScale + vec3(uTime * uNoiseSpeed, uTime * uNoiseSpeed * 0.4, -uTime * uNoiseSpeed * 0.25);
                dens *= mix(1.0 - uNoiseStrength, 1.0 + uNoiseStrength * 0.5, fbm(np));
              }
              accum += dens * stepSize * 0.28;
            }
            break;
          }
          vec3 local = pos - uCameraPos;
          float box = max(max(abs(local.x), abs(local.y)), abs(local.z));
          if (box > uExtent) continue;
          float falloff = 1.0 - smoothstep(uExtent * 0.4, uExtent, box);
          // Keep fog thinner near the camera so it doesn't read as a helmet smear.
          float nearFade = smoothstep(0.35, 2.2, length(local));
          float dens = uDensity * falloff * nearFade;
          if (uNoise > 0.5) {
            vec3 np = pos * uNoiseScale + vec3(uTime * uNoiseSpeed, uTime * uNoiseSpeed * 0.4, -uTime * uNoiseSpeed * 0.25);
            dens *= mix(1.0 - uNoiseStrength, 1.0 + uNoiseStrength * 0.5, fbm(np));
          }
          accum += dens * stepSize * 0.28;
          if (accum > 1.2) break;
        }
        float a = 1.0 - exp(-accum);
        if (a < 0.008) discard;
        gl_FragColor = vec4(uColor, a * 0.72);
      }
    `,
  });
}

export class AtmosphereController {
  /**
   * @param {{ scene: THREE.Scene }} options
   */
  constructor({ scene }) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'AtmosphereRoot';
    this.root.visible = false;
    this.root.renderOrder = 10;
    assignAtmosphereLayer(this.root);
    this.scene.add(this.root);

    this._fog = normalizeWorldFog(null);
    this._perspectiveVisible = true;
    /** Pane Mist chip — independent of distance fog / other atmosphere layers. */
    this._paneMistVisible = true;
    this._time = 0;
    this._particleTex = createSoftParticleTexture();

    this._mist = null;
    this._mistWorld = null;
    this._mistVelocities = null;
    this._mistMat = null;

    this._noiseSheets = [];
    this._noiseMat = createNoiseSheetMaterial();
    this._noiseAnchor = new THREE.Vector3();
    this._noiseAnchorReady = false;
    this._tmpLook = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3(0, 1, 0);

    this._volumeMesh = null;
    this._volumeMat = createVolumetricMaterial();

    this._depthTarget = null;
    this._depthTexture = null;
    this._depthMaterial = new THREE.MeshDepthMaterial();
    this._depthSize = new THREE.Vector2(0, 0);
    this._bufferSize = new THREE.Vector2(1, 1);
    this._depthReady = false;
    this._viewport = new THREE.Vector4();
    this._scissor = new THREE.Vector4();

    this._rebuildMist(this._fog.mistCount);
    this._rebuildNoiseSheets();
    this._rebuildVolume(this._fog.volumetricExtent);
    this.applyFogSettings(this._fog);
  }

  _mistLayerActive() {
    const f = this._fog;
    return Boolean(f.mist && f.type !== 'none' && this._paneMistVisible);
  }

  _needsDepth() {
    const f = this._fog;
    return Boolean(
      this._perspectiveVisible
      && f.type !== 'none'
      && (this._mistLayerActive() || f.noise || f.volumetric),
    );
  }

  _ensureDepthTarget(width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this._depthTarget && this._depthSize.x === w && this._depthSize.y === h) {
      return;
    }
    this._disposeDepthTarget();
    this._depthTexture = new THREE.DepthTexture(w, h);
    this._depthTexture.type = THREE.UnsignedShortType;
    this._depthTexture.minFilter = THREE.NearestFilter;
    this._depthTexture.magFilter = THREE.NearestFilter;
    this._depthTarget = new THREE.WebGLRenderTarget(w, h, {
      depthTexture: this._depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this._depthTarget.texture.minFilter = THREE.NearestFilter;
    this._depthTarget.texture.magFilter = THREE.NearestFilter;
    this._depthSize.set(w, h);
  }

  _disposeDepthTarget() {
    if (this._depthTarget) {
      this._depthTarget.dispose();
      this._depthTarget = null;
    }
    if (this._depthTexture) {
      this._depthTexture.dispose();
      this._depthTexture = null;
    }
    this._depthSize.set(0, 0);
    this._depthReady = false;
  }

  _bindDepthUniforms(useDepth) {
    const flag = useDepth ? 1 : 0;
    const tex = useDepth ? this._depthTexture : null;
    const mats = [this._mistMat, this._noiseMat, this._volumeMat];
    for (const mat of mats) {
      if (!mat?.uniforms) continue;
      mat.uniforms.uDepth.value = tex;
      mat.uniforms.uBufferSize.value.copy(this._bufferSize);
      mat.uniforms.uUseDepth.value = flag;
    }
  }

  /**
   * Depth prepass for soft occlusion. Call once per perspective pane before render.
   * Matches the active viewport/scissor so multi-pane sampling lines up with gl_FragCoord.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera
   */
  captureDepth(renderer, camera) {
    if (!renderer || !camera || !this._needsDepth()) {
      this._depthReady = false;
      this._bindDepthUniforms(false);
      return;
    }

    renderer.getDrawingBufferSize(this._bufferSize);
    this._ensureDepthTarget(this._bufferSize.x, this._bufferSize.y);

    const prevTarget = renderer.getRenderTarget();
    renderer.getViewport(this._viewport);
    renderer.getScissor(this._scissor);
    const prevScissorTest = renderer.getScissorTest();
    const prevAutoClear = renderer.autoClear;
    const prevOverride = this.scene.overrideMaterial;
    const wasVisible = this.root.visible;

    this.root.visible = false;
    this.scene.overrideMaterial = this._depthMaterial;

    renderer.setRenderTarget(this._depthTarget);
    renderer.autoClear = false;
    // Same viewport/scissor as the pane so frag coords match the main draw.
    renderer.setViewport(this._viewport);
    renderer.setScissor(this._scissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.clear(true, true, true);
    renderer.render(this.scene, camera);

    renderer.setRenderTarget(prevTarget);
    renderer.setViewport(this._viewport);
    renderer.setScissor(this._scissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.autoClear = prevAutoClear;
    this.scene.overrideMaterial = prevOverride;
    this.root.visible = wasVisible;

    const near = camera.near ?? 0.1;
    const far = camera.far ?? 500;
    for (const mat of [this._mistMat, this._noiseMat, this._volumeMat]) {
      if (!mat?.uniforms) continue;
      mat.uniforms.uCameraNear.value = near;
      mat.uniforms.uCameraFar.value = far;
    }
    this._depthReady = true;
    this._bindDepthUniforms(true);
  }

  applyFogSettings(fog) {
    this._fog = normalizeWorldFog(fog);
    const f = this._fog;
    const color = new THREE.Color(f.color);

    if (!this._mist || this._mist.geometry.getAttribute('position').count !== f.mistCount) {
      this._rebuildMist(f.mistCount);
    }
    if (this._mist && this._mistMat) {
      this._mist.visible = this._mistLayerActive();
      this._mistMat.uniforms.uOpacity.value = f.mistOpacity;
      this._mistMat.uniforms.uColor.value.copy(color);
      this._mistMat.uniforms.uSize.value = f.mistSize;
    }

    const noiseOn = Boolean(f.noise) && f.type !== 'none';
    const volumeOn = Boolean(f.volumetric) && f.type !== 'none';
    // Noise sheets only when noise is on and volumetric is off (volume shader owns noise).
    const sheetsOn = noiseOn && !volumeOn;
    for (const sheet of this._noiseSheets) {
      sheet.visible = sheetsOn;
    }
    this._noiseMat.uniforms.uColor.value.copy(color);
    this._noiseMat.uniforms.uStrength.value = f.noiseStrength;
    this._noiseMat.uniforms.uScale.value = f.noiseScale;
    this._noiseMat.uniforms.uSpeed.value = f.noiseSpeed;
    this._noiseMat.uniforms.uOpacity.value = 0.18;

    if (this._volumeMesh) {
      const ext = f.volumetricExtent;
      const expected = Math.max(1, ext) * 2;
      if (Math.abs(this._volumeMesh.geometry.parameters?.width - expected) > 0.01) {
        this._rebuildVolume(ext);
      }
      this._volumeMesh.visible = volumeOn;
    }
    this._volumeMat.uniforms.uColor.value.copy(color);
    this._volumeMat.uniforms.uDensity.value = f.volumetricDensity;
    this._volumeMat.uniforms.uExtent.value = f.volumetricExtent;
    this._volumeMat.uniforms.uSteps.value = f.volumetricSteps;
    this._volumeMat.uniforms.uNoise.value = noiseOn ? 1 : 0;
    this._volumeMat.uniforms.uNoiseStrength.value = f.noiseStrength;
    this._volumeMat.uniforms.uNoiseScale.value = f.noiseScale;
    this._volumeMat.uniforms.uNoiseSpeed.value = f.noiseSpeed;

    this._syncRootVisibility();
  }

  setPerspectiveVisible(visible) {
    this._perspectiveVisible = Boolean(visible);
    this._syncRootVisibility();
  }

  /**
   * Pane Mist chip: show/hide mist particles without touching distance fog,
   * noise sheets, or volumetric volume.
   */
  setPaneMistVisible(visible) {
    this._paneMistVisible = Boolean(visible);
    if (this._mist) this._mist.visible = this._mistLayerActive();
    this._syncRootVisibility();
  }

  _syncRootVisibility() {
    const f = this._fog;
    const any = f.type !== 'none'
      && (this._mistLayerActive() || f.noise || f.volumetric);
    this.root.visible = Boolean(any && this._perspectiveVisible);
    if (this._mist) this._mist.visible = this._mistLayerActive() && this.root.visible;
  }

  /**
   * @param {THREE.Camera} camera
   * @param {number} dt
   */
  update(camera, dt = 0.016) {
    if (!camera || !this.root.visible) return;
    const f = this._fog;
    const clampedDt = Math.max(0, Math.min(0.1, dt));
    this._time += clampedDt;

    if (this._mistLayerActive() && this._mist) {
      this._updateMist(camera, clampedDt);
    }

    if (f.noise && !f.volumetric) {
      this._noiseMat.uniforms.uTime.value = this._time;
      this._updateNoiseSheets(camera, clampedDt);
    }

    if (f.volumetric && this._volumeMesh) {
      this._volumeMesh.position.copy(camera.position);
      this._volumeMat.uniforms.uTime.value = this._time;
      this._volumeMat.uniforms.uCameraPos.value.copy(camera.position);
    }
  }

  _rebuildMist(count) {
    if (this._mist) {
      this.root.remove(this._mist);
      this._mist.geometry.dispose();
      this._mistMat?.dispose?.();
      this._mist = null;
      this._mistMat = null;
    }
    const n = Math.max(0, Math.round(count));
    if (n <= 0) return;

    const world = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      world[i * 3] = (Math.random() * 2 - 1) * BOX_HALF;
      world[i * 3 + 1] = (Math.random() * 2 - 1) * BOX_HALF * 0.45;
      world[i * 3 + 2] = (Math.random() * 2 - 1) * BOX_HALF;
      velocities[i * 3] = (Math.random() * 2 - 1) * 0.12;
      velocities[i * 3 + 1] = 0.015 + Math.random() * 0.05;
      velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(world, 3));
    this._mistMat = createMistMaterial(this._particleTex);
    this._mist = new THREE.Points(geo, this._mistMat);
    this._mist.frustumCulled = false;
    this._mist.name = 'AtmosphereMist';
    this._mist.renderOrder = 11;
    assignAtmosphereLayer(this._mist);
    this.root.add(this._mist);
    this._mistWorld = world;
    this._mistVelocities = velocities;
  }

  _updateMist(camera, dt) {
    const world = this._mistWorld;
    const velocities = this._mistVelocities;
    const attr = this._mist?.geometry?.attributes?.position;
    if (!world || !velocities || !attr) return;
    const speed = this._fog.mistSpeed;
    const cam = camera.position;
    const half = BOX_HALF;
    const limY = half * 0.45;
    // World-space drift; wrap only when a particle leaves the camera neighborhood.
    for (let i = 0; i < world.length; i += 3) {
      world[i] += velocities[i] * speed * dt * 4;
      world[i + 1] += velocities[i + 1] * speed * dt * 4;
      world[i + 2] += velocities[i + 2] * speed * dt * 4;

      let dx = world[i] - cam.x;
      let dy = world[i + 1] - cam.y;
      let dz = world[i + 2] - cam.z;
      if (dx > half) world[i] -= half * 2;
      else if (dx < -half) world[i] += half * 2;
      if (dy > limY) world[i + 1] -= limY * 2;
      else if (dy < -limY) world[i + 1] += limY * 2;
      if (dz > half) world[i + 2] -= half * 2;
      else if (dz < -half) world[i + 2] += half * 2;
    }
    attr.needsUpdate = true;
  }

  _rebuildNoiseSheets() {
    for (const sheet of this._noiseSheets) {
      this.root.remove(sheet);
      sheet.geometry.dispose();
    }
    this._noiseSheets = [];
    for (let i = 0; i < NOISE_SHEET_COUNT; i += 1) {
      const geo = new THREE.PlaneGeometry(16, 11);
      const mesh = new THREE.Mesh(geo, this._noiseMat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.name = `AtmosphereNoiseSheet${i}`;
      mesh.userData.sheetIndex = i;
      mesh.renderOrder = 12;
      assignAtmosphereLayer(mesh);
      this.root.add(mesh);
      this._noiseSheets.push(mesh);
    }
    this._noiseAnchorReady = false;
  }

  _updateNoiseSheets(camera, dt) {
    const camPos = camera.position;
    if (!this._noiseAnchorReady) {
      this._noiseAnchor.copy(camPos);
      this._noiseAnchorReady = true;
    } else {
      const t = 1 - Math.exp(-ANCHOR_FOLLOW * dt);
      this._noiseAnchor.lerp(camPos, t);
    }

    camera.getWorldDirection(this._tmpLook);
    // Prefer world up so sheets don't roll with the camera.
    this._tmpUp.set(0, 1, 0);

    for (let i = 0; i < this._noiseSheets.length; i += 1) {
      const sheet = this._noiseSheets[i];
      const dist = 3.2 + i * 2.6;
      // Place ahead of the lagged anchor (not the live camera) so motion eases.
      sheet.position
        .copy(this._noiseAnchor)
        .addScaledVector(this._tmpLook, dist);
      sheet.position.y += (i - 1) * 0.45;
      sheet.lookAt(camPos);
    }
  }

  _rebuildVolume(extent) {
    if (this._volumeMesh) {
      this.root.remove(this._volumeMesh);
      this._volumeMesh.geometry.dispose();
      this._volumeMesh = null;
    }
    const size = Math.max(1, extent) * 2;
    const geo = new THREE.BoxGeometry(size, size, size);
    this._volumeMesh = new THREE.Mesh(geo, this._volumeMat);
    this._volumeMesh.frustumCulled = false;
    this._volumeMesh.visible = false;
    this._volumeMesh.name = 'AtmosphereVolume';
    this._volumeMesh.renderOrder = 13;
    assignAtmosphereLayer(this._volumeMesh);
    this.root.add(this._volumeMesh);
  }

  dispose() {
    this.scene.remove(this.root);
    if (this._mist) {
      this._mist.geometry.dispose();
    }
    this._mistMat?.dispose?.();
    for (const sheet of this._noiseSheets) {
      sheet.geometry.dispose();
    }
    this._noiseMat.dispose();
    if (this._volumeMesh) this._volumeMesh.geometry.dispose();
    this._volumeMat.dispose();
    this._particleTex.dispose();
    this._depthMaterial.dispose();
    this._disposeDepthTarget();
    this._mist = null;
    this._mistMat = null;
    this._noiseSheets = [];
    this._volumeMesh = null;
  }
}
