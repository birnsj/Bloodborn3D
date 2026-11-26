/**
 * Wraps pmndrs EffectComposer on the shared SceneView WebGLRenderer.
 * Rebuilds passes when enable-set / multisampling / required inputs change;
 * otherwise updates uniforms in place.
 */

import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  ColorAverageEffect,
  ColorDepthEffect,
  DepthOfFieldEffect,
  DotScreenEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  GammaCorrectionEffect,
  GlitchEffect,
  GlitchMode,
  GodRaysEffect,
  GridEffect,
  HueSaturationEffect,
  KernelSize,
  LUT3DEffect,
  LensDistortionEffect,
  NoiseEffect,
  OutlineEffect,
  PixelationEffect,
  RealisticBokehEffect,
  RenderPass,
  SMAAEffect,
  SSAOEffect,
  ScanlineEffect,
  SelectiveBloomEffect,
  SepiaEffect,
  ShockWaveEffect,
  TextureEffect,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  VignetteTechnique,
} from 'postprocessing';
import { toMeters } from '../../core/units.js';
import {
  EFFECT_ORDER,
  effectInputsReady,
} from './effectRegistry.js';
import {
  DEFAULT_POST_PROCESSING_EXPOSURE,
  normalizePostProcessing,
} from './postProcessingState.js';

const KERNEL = {
  VERY_SMALL: KernelSize.VERY_SMALL,
  SMALL: KernelSize.SMALL,
  MEDIUM: KernelSize.MEDIUM,
  LARGE: KernelSize.LARGE,
  VERY_LARGE: KernelSize.VERY_LARGE,
  HUGE: KernelSize.HUGE,
};

const TONE_MODE = {
  LINEAR: ToneMappingMode.LINEAR,
  REINHARD: ToneMappingMode.REINHARD,
  REINHARD2: ToneMappingMode.REINHARD2,
  REINHARD2_ADAPTIVE: ToneMappingMode.REINHARD2_ADAPTIVE,
  UNCHARTED2: ToneMappingMode.UNCHARTED2,
  OPTIMIZED_CINEON: ToneMappingMode.OPTIMIZED_CINEON,
  ACES_FILMIC: ToneMappingMode.ACES_FILMIC,
  AGX: ToneMappingMode.AGX,
  NEUTRAL: ToneMappingMode.NEUTRAL,
};

const VIGNETTE_TECH = {
  DEFAULT: VignetteTechnique.DEFAULT,
  ESKIL: VignetteTechnique.ESKIL,
};

const GLITCH = {
  DISABLED: GlitchMode.DISABLED,
  SPORADIC: GlitchMode.SPORADIC,
  CONSTANT_MILD: GlitchMode.CONSTANT_MILD,
  CONSTANT_WILD: GlitchMode.CONSTANT_WILD,
};

function hexColor(hex) {
  return new THREE.Color(hex || '#000000');
}

/**
 * Composer is only required when an effect beyond native ACES+exposure is active.
 * Enabling PP with defaults (ACES tone mapping only) must not engage the composer —
 * that path was blanking the viewport.
 */
export function needsComposerPipeline(settings) {
  const s = normalizePostProcessing(settings);
  if (!s.enabled) return false;
  for (const id of EFFECT_ORDER) {
    if (id === 'toneMapping') continue;
    const e = s.effects[id];
    if (e?.enabled && effectInputsReady(id, e)) return true;
  }
  const tm = s.effects.toneMapping;
  if (tm?.enabled && tm.mode && tm.mode !== 'ACES_FILMIC') return true;
  return false;
}

function structureKey(settings, contextKey) {
  const s = normalizePostProcessing(settings);
  const parts = [
    s.enabled ? '1' : '0',
    needsComposerPipeline(s) ? '1' : '0',
    String(s.multisampling),
    contextKey || '',
  ];
  for (const id of EFFECT_ORDER) {
    const e = s.effects[id];
    const ready = e.enabled && effectInputsReady(id, e);
    parts.push(`${id}:${ready ? 1 : 0}`);
    if (!ready) continue;
    if (id === 'selectiveBloom' || id === 'outline') {
      parts.push((e.actorIds || []).join(','));
    }
    if (id === 'godRays') parts.push(String(e.lightActorId || ''));
    if (id === 'lut' || id === 'textureOverlay') {
      parts.push(String(e.textureAssetId || ''));
    }
    if (id === 'bloom') parts.push(e.mipmapBlur ? '1' : '0');
    if (id === 'tiltShift' || id === 'depthOfField' || id === 'outline') {
      parts.push(String(e.resolutionScale ?? ''));
    }
  }
  return parts.join('|');
}

export class PostProcessingController {
  /**
   * @param {{
   *   renderer: THREE.WebGLRenderer,
   *   scene: THREE.Scene,
   *   resolveActorMeshes?: (actorId: string) => THREE.Object3D[],
   *   resolveLightMesh?: (actorId: string) => THREE.Object3D | null,
   *   resolveTexture?: (assetId: string) => THREE.Texture | null | Promise<THREE.Texture|null>,
   * }} options
   */
  constructor({
    renderer,
    scene,
    resolveActorMeshes = () => [],
    resolveLightMesh = () => null,
    resolveTexture = () => null,
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.resolveActorMeshes = resolveActorMeshes;
    this.resolveLightMesh = resolveLightMesh;
    this.resolveTexture = resolveTexture;

    this.settings = normalizePostProcessing({ enabled: false });
    this.composer = null;
    this._effects = new Map();
    this._renderPass = null;
    this._effectPasses = [];
    this._structureKey = '';
    this._size = { width: 1, height: 1 };
    this._composerBuf = { width: 0, height: 0 };
    this._savedToneMapping = renderer.toneMapping;
    this._savedExposure = renderer.toneMappingExposure;
    this._savedAutoClear = renderer.autoClear;
    this._active = false;
    this._contextKey = '';
    this._pendingTextureLoads = new Set();
    this._viewport = new THREE.Vector4();
    this._scissor = new THREE.Vector4();
  }

  setResolvers({ resolveActorMeshes, resolveLightMesh, resolveTexture } = {}) {
    if (resolveActorMeshes) this.resolveActorMeshes = resolveActorMeshes;
    if (resolveLightMesh) this.resolveLightMesh = resolveLightMesh;
    if (resolveTexture) this.resolveTexture = resolveTexture;
  }

  /** Extra key so mesh/light identity changes force rebuild. */
  setContextKey(key) {
    const next = String(key || '');
    if (next === this._contextKey) return;
    this._contextKey = next;
    if (this.settings.enabled && needsComposerPipeline(this.settings)) {
      this._rebuild(this.settings);
    }
  }

  applySettings(settings) {
    const next = normalizePostProcessing(settings);
    const key = structureKey(next, this._contextKey);
    this.settings = next;
    if (!next.enabled) {
      this._teardownComposer();
      this._restoreRendererToneMapping();
      return;
    }

    // Defaults = ACES + exposure only → keep the normal renderer path.
    if (!needsComposerPipeline(next)) {
      this._teardownComposer();
      this._restoreRendererToneMapping();
      this._applyExposure(next.exposure);
      this._structureKey = key;
      return;
    }

    if (!this.composer || key !== this._structureKey) {
      this._rebuild(next);
      return;
    }
    this._updateParams(next);
    this._applyExposure(next.exposure);
  }

  setSize(width, height) {
    this._size.width = Math.max(1, Math.round(width));
    this._size.height = Math.max(1, Math.round(height));
    // Do NOT call composer.setSize(w,h) — it also calls renderer.setSize(w,h)
    // with updateStyle=true and can collapse the canvas. Only sync RT buffers.
    this._syncComposerBuffers();
  }

  _syncComposerBuffers() {
    if (!this.composer || !this.renderer) return;
    const drawing = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this._setComposerBufferSize(Math.max(1, drawing.x), Math.max(1, drawing.y));
  }

  /**
   * Resize composer RTs / passes without touching the canvas CSS size.
   * @param {number} width drawing-buffer pixels
   * @param {number} height drawing-buffer pixels
   */
  _setComposerBufferSize(width, height) {
    if (!this.composer) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this._composerBuf.width === w && this._composerBuf.height === h) return;
    this.composer.inputBuffer?.setSize(w, h);
    this.composer.outputBuffer?.setSize(w, h);
    if (this.composer.depthRenderTarget) {
      this.composer.depthRenderTarget.setSize(w, h);
    }
    for (const pass of this.composer.passes || []) {
      pass.setSize?.(w, h);
    }
    this.composer.copyPass?.setSize?.(w, h);
    this._composerBuf.width = w;
    this._composerBuf.height = h;
  }

  /**
   * Toggle whether the final composer pass writes to the default framebuffer.
   * When false, the result stays in composer.inputBuffer for a scissored blit.
   */
  _setComposerRenderToScreen(toScreen) {
    if (!this.composer) return;
    this.composer.autoRenderToScreen = Boolean(toScreen);
    const passes = this.composer.passes || [];
    for (let i = 0; i < passes.length; i += 1) {
      passes[i].renderToScreen = false;
    }
    if (toScreen && passes.length > 0) {
      passes[passes.length - 1].renderToScreen = true;
    }
  }

  /**
   * Copy composer.inputBuffer into the current viewport/scissor on the screen.
   */
  _blitComposerToScreen() {
    const composer = this.composer;
    const renderer = this.renderer;
    if (!composer || !renderer) return;
    const copyPass = composer.copyPass;
    if (!copyPass) return;
    const prevRenderToScreen = copyPass.renderToScreen;
    copyPass.renderToScreen = true;
    try {
      // After passes with needsSwap, the resolved frame lives in inputBuffer.
      copyPass.render(renderer, composer.inputBuffer, composer.outputBuffer, 0, false);
    } finally {
      copyPass.renderToScreen = prevRenderToScreen;
    }
  }

  get isActive() {
    return Boolean(this.composer && this.settings.enabled && needsComposerPipeline(this.settings));
  }

  /**
   * Render through the composer for the given camera.
   *
   * @param {THREE.Camera} camera
   * @param {number} [deltaTime]
   * @param {{ scissor?: { x:number, y:number, width:number, height:number }|null }} [options]
   *   `scissor` is CSS/logical pixels (Three setViewport/setScissor space). When set and
   *   smaller than the full canvas, the composer renders into a pane-sized RT and blits
   *   only into that rectangle — adjacent panes are untouched.
   * @returns {boolean}
   */
  render(camera, deltaTime = 0.016, options = {}) {
    if (!this.composer || !this.settings.enabled || !camera) return false;
    if (!needsComposerPipeline(this.settings)) return false;

    this.composer.setMainCamera(camera);
    if (this._renderPass) this._renderPass.mainCamera = camera;
    for (const pass of this._effectPasses) {
      pass.mainCamera = camera;
    }
    this._applyExposure(this.settings.exposure);

    const renderer = this.renderer;
    renderer.getViewport(this._viewport);
    renderer.getScissor(this._scissor);
    const hadScissor = renderer.getScissorTest();
    const prevAutoClear = renderer.autoClear;
    const prevToneMapping = renderer.toneMapping;
    const prevTarget = renderer.getRenderTarget();

    const canvasSize = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio() || 1;
    const scissor = options?.scissor || null;
    const fullFrame = !scissor
      || (
        scissor.x <= 0
        && scissor.y <= 0
        && scissor.width >= canvasSize.x - 0.5
        && scissor.height >= canvasSize.y - 0.5
      );

    // Composer manages clears via ClearPass; keep tone mapping off for HDR RTs.
    renderer.autoClear = false;
    renderer.toneMapping = THREE.NoToneMapping;

    try {
      if (fullFrame) {
        this._syncComposerBuffers();
        this._setComposerRenderToScreen(true);
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, canvasSize.x, canvasSize.y);
        renderer.setScissor(0, 0, canvasSize.x, canvasSize.y);
        renderer.setScissorTest(false);
        this.composer.render(deltaTime);
      } else {
        const bufW = Math.max(1, Math.round(scissor.width * pixelRatio));
        const bufH = Math.max(1, Math.round(scissor.height * pixelRatio));
        this._setComposerBufferSize(bufW, bufH);
        this._setComposerRenderToScreen(false);
        renderer.setRenderTarget(null);
        // Internal RT passes ignore screen viewport; keep a matching logical size handy.
        renderer.setViewport(0, 0, scissor.width, scissor.height);
        renderer.setScissorTest(false);
        this.composer.render(deltaTime);

        renderer.setRenderTarget(null);
        renderer.setViewport(scissor.x, scissor.y, scissor.width, scissor.height);
        renderer.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);
        renderer.setScissorTest(true);
        this._blitComposerToScreen();
      }
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setViewport(this._viewport);
      renderer.setScissor(this._scissor);
      renderer.setScissorTest(hadScissor);
      renderer.autoClear = prevAutoClear;
      renderer.toneMapping = prevToneMapping;
    }
    return true;
  }

  dispose() {
    this._teardownComposer();
    this._restoreRendererToneMapping();
  }

  _applyExposure(exposure) {
    this.renderer.toneMappingExposure = Number.isFinite(exposure)
      ? exposure
      : DEFAULT_POST_PROCESSING_EXPOSURE;
  }

  _saveAndDisableRendererToneMapping() {
    this._savedToneMapping = this.renderer.toneMapping;
    this._savedExposure = this.renderer.toneMappingExposure;
    this._savedAutoClear = this.renderer.autoClear;
    this.renderer.toneMapping = THREE.NoToneMapping;
  }

  _restoreRendererToneMapping() {
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DEFAULT_POST_PROCESSING_EXPOSURE;
    if (this._savedAutoClear != null) {
      this.renderer.autoClear = this._savedAutoClear;
    } else {
      this.renderer.autoClear = true;
    }
    this._active = false;
  }

  _teardownComposer() {
    if (!this.composer) return;
    for (const effect of this._effects.values()) {
      effect.dispose?.();
    }
    this._effects.clear();
    this.composer.dispose();
    this.composer = null;
    this._renderPass = null;
    this._effectPasses = [];
    this._structureKey = '';
    this._composerBuf.width = 0;
    this._composerBuf.height = 0;
  }

  _rebuild(settings) {
    this._teardownComposer();
    this._saveAndDisableRendererToneMapping();

    try {
      // Construct against the live renderer size — EffectComposer.setRenderer
      // already sizes buffers from getDrawingBufferSize(). Do not call
      // composer.setSize() afterward (it can rewrite the canvas CSS size).
      const composer = new EffectComposer(this.renderer, {
        frameBufferType: THREE.HalfFloatType,
        multisampling: settings.multisampling || 0,
      });

      const renderPass = new RenderPass(this.scene, null);
      composer.addPass(renderPass);
      this._renderPass = renderPass;
      this._effectPasses = [];

      const effects = [];
      for (const id of EFFECT_ORDER) {
        const state = settings.effects[id];
        if (!state?.enabled || !effectInputsReady(id, state)) continue;
        let effect = null;
        try {
          effect = this._createEffect(id, state);
        } catch (err) {
          console.warn(`[BloodBound] skipped post effect "${id}"`, err);
        }
        if (!effect) continue;
        this._effects.set(id, effect);
        effects.push(effect);
      }

      if (!effects.length) {
        // Nothing to compose (creations failed) — keep the native path.
        composer.dispose();
        this._restoreRendererToneMapping();
        this._applyExposure(settings.exposure);
        this._structureKey = structureKey(settings, this._contextKey);
        return;
      }

      // One EffectPass so tone mapping / AA stay correctly ordered in one merge.
      const pass = new EffectPass(null, ...effects);
      composer.addPass(pass);
      this._effectPasses.push(pass);

      this.composer = composer;
      this._syncComposerBuffers();
      this._structureKey = structureKey(settings, this._contextKey);
      this._active = true;
      this._updateParams(settings);
      this._applyExposure(settings.exposure);
    } catch (err) {
      this._teardownComposer();
      this._restoreRendererToneMapping();
      throw err;
    }
  }

  _createEffect(id, state) {
    switch (id) {
      case 'toneMapping':
        return new ToneMappingEffect({
          mode: TONE_MODE[state.mode] ?? ToneMappingMode.ACES_FILMIC,
          resolution: state.resolution,
          whitePoint: state.whitePoint,
          middleGrey: state.middleGrey,
          averageLuminance: state.averageLuminance,
          minLuminance: state.minLuminance,
          adaptationRate: state.adaptationRate,
        });
      case 'fxaa':
        return new FXAAEffect();
      case 'smaa':
        return new SMAAEffect();
      case 'bloom':
        return new BloomEffect({
          intensity: state.intensity,
          luminanceThreshold: state.luminanceThreshold,
          luminanceSmoothing: state.luminanceSmoothing,
          kernelSize: KERNEL[state.kernelSize] ?? KernelSize.LARGE,
          mipmapBlur: state.mipmapBlur,
          radius: state.radius,
        });
      case 'selectiveBloom': {
        const effect = new SelectiveBloomEffect(this.scene, null, {
          intensity: state.intensity,
          luminanceThreshold: state.luminanceThreshold,
          luminanceSmoothing: state.luminanceSmoothing,
          kernelSize: KERNEL[state.kernelSize] ?? KernelSize.LARGE,
        });
        effect.inverted = Boolean(state.inverted);
        effect.ignoreBackground = Boolean(state.ignoreBackground);
        this._fillSelection(effect.selection, state.actorIds);
        return effect;
      }
      case 'ssao':
        return new SSAOEffect(null, null, {
          samples: state.samples,
          rings: state.rings,
          radius: state.radius,
          intensity: state.intensity,
          luminanceInfluence: state.luminanceInfluence,
          distanceScaling: state.distanceScaling,
          depthAwareUpsampling: state.depthAwareUpsampling,
          color: hexColor(state.color),
        });
      case 'godRays': {
        const light = this.resolveLightMesh(state.lightActorId);
        if (!light) return null;
        return new GodRaysEffect(null, light, {
          density: state.density,
          decay: state.decay,
          weight: state.weight,
          exposure: state.exposure,
          clampMax: state.clampMax,
          samples: state.samples,
          blur: state.blur,
          kernelSize: KERNEL[state.kernelSize] ?? KernelSize.SMALL,
        });
      }
      case 'brightnessContrast':
        return new BrightnessContrastEffect({
          brightness: state.brightness,
          contrast: state.contrast,
        });
      case 'hueSaturation':
        return new HueSaturationEffect({
          hue: state.hue,
          saturation: state.saturation,
        });
      case 'gammaCorrection':
        return new GammaCorrectionEffect({ gamma: state.gamma });
      case 'colorAverage':
        return new ColorAverageEffect();
      case 'sepia':
        return new SepiaEffect({ intensity: state.intensity });
      case 'colorDepth':
        return new ColorDepthEffect({ bits: state.bitDepth });
      case 'lut': {
        const tex = this.resolveTexture(state.textureAssetId);
        if (!tex || typeof tex.then === 'function') {
          if (tex && typeof tex.then === 'function') {
            this._loadTextureAsync('lut', state.textureAssetId);
          }
          return null;
        }
        return new LUT3DEffect(tex, {
          tetrahedralInterpolation: Boolean(state.tetrahedralInterpolation),
        });
      }
      case 'depthOfField':
        return new DepthOfFieldEffect(null, {
          focusDistance: state.focusDistance,
          focalLength: state.focalLength,
          bokehScale: state.bokehScale,
          resolutionScale: state.resolutionScale,
        });
      case 'realisticBokeh':
        return new RealisticBokehEffect({
          focus: state.focus,
          focalLength: state.focalLength,
          fstop: state.fStop,
          luminanceThreshold: state.luminanceThreshold,
          luminanceGain: state.luminanceGain,
          bias: state.bias,
          fringe: state.fringe,
          maxBlur: state.maxBlur,
          rings: state.rings,
          samples: state.samples,
          showFocus: state.showFocus,
          manualdoF: state.manualDoF,
          pentagon: state.pentagon,
        });
      case 'vignette':
        return new VignetteEffect({
          technique: VIGNETTE_TECH[state.technique] ?? VignetteTechnique.DEFAULT,
          offset: state.offset,
          darkness: state.darkness,
        });
      case 'chromaticAberration':
        return new ChromaticAberrationEffect({
          offset: new THREE.Vector2(state.offsetX, state.offsetY),
          radialModulation: state.radialModulation,
          modulationOffset: state.modulationOffset,
        });
      case 'lensDistortion':
        return new LensDistortionEffect({
          distortion: new THREE.Vector2(state.distortionX, state.distortionY),
          principalPoint: new THREE.Vector2(state.principalPointX, state.principalPointY),
          focalLength: new THREE.Vector2(state.focalLengthX, state.focalLengthY),
          skew: state.skew,
        });
      case 'tiltShift':
        return new TiltShiftEffect({
          offset: state.offset,
          rotation: state.rotation,
          focusArea: state.focusArea,
          feather: state.feather,
          kernelSize: KERNEL[state.kernelSize] ?? KernelSize.MEDIUM,
          resolutionScale: state.resolutionScale,
        });
      case 'noise': {
        const effect = new NoiseEffect({ premultiply: state.premultiply });
        effect.blendMode.opacity.value = state.opacity;
        return effect;
      }
      case 'pixelation':
        return new PixelationEffect(state.granularity);
      case 'dotScreen':
        return new DotScreenEffect({ angle: state.angle, scale: state.scale });
      case 'scanlines':
        return new ScanlineEffect({
          density: state.density,
          scrollSpeed: state.scrollSpeed,
        });
      case 'grid':
        return new GridEffect({ scale: state.scale, lineWidth: state.lineWidth });
      case 'glitch': {
        const effect = new GlitchEffect({
          mode: GLITCH[state.mode] ?? GlitchMode.SPORADIC,
          delay: new THREE.Vector2(state.minDelay, state.maxDelay),
          duration: new THREE.Vector2(state.minDuration, state.maxDuration),
          strength: new THREE.Vector2(state.minStrength, state.maxStrength),
          columns: state.columns,
          ratio: state.ratio,
        });
        return effect;
      }
      case 'outline': {
        const effect = new OutlineEffect(this.scene, null, {
          edgeStrength: state.edgeStrength,
          visibleEdgeColor: hexColor(state.visibleEdgeColor).getHex(),
          hiddenEdgeColor: hexColor(state.hiddenEdgeColor).getHex(),
          pulseSpeed: state.pulseSpeed,
          xRay: state.xRay,
          blur: state.blur,
          kernelSize: KERNEL[state.kernelSize] ?? KernelSize.VERY_SMALL,
          multisampling: state.multisampling,
          resolutionScale: state.resolutionScale,
        });
        this._fillSelection(effect.selection, state.actorIds);
        return effect;
      }
      case 'textureOverlay': {
        const tex = this.resolveTexture(state.textureAssetId);
        if (!tex || typeof tex.then === 'function') {
          if (tex && typeof tex.then === 'function') {
            this._loadTextureAsync('textureOverlay', state.textureAssetId);
          }
          return null;
        }
        return new TextureEffect({
          texture: tex,
          aspectCorrection: state.aspectCorrection,
        });
      }
      case 'shockWave': {
        const e = state.epicenter || { x: 0, y: 0, z: 0 };
        const epicenter = new THREE.Vector3(
          toMeters(e.x),
          toMeters(e.y),
          toMeters(e.z),
        );
        return new ShockWaveEffect(null, epicenter, {
          speed: state.speed,
          maxRadius: state.maxRadius,
          waveSize: state.waveSize,
          amplitude: state.amplitude,
        });
      }
      default:
        return null;
    }
  }

  _fillSelection(selection, actorIds) {
    selection?.clear?.();
    if (!selection || !Array.isArray(actorIds)) return;
    for (const id of actorIds) {
      const objs = this.resolveActorMeshes(id) || [];
      for (const obj of objs) selection.add(obj);
    }
  }

  async _loadTextureAsync(effectId, assetId) {
    const key = `${effectId}:${assetId}`;
    if (this._pendingTextureLoads.has(key)) return;
    this._pendingTextureLoads.add(key);
    try {
      const tex = await this.resolveTexture(assetId);
      if (tex && this.settings.effects[effectId]?.textureAssetId === assetId) {
        this._rebuild(this.settings);
      }
    } finally {
      this._pendingTextureLoads.delete(key);
    }
  }

  _updateParams(settings) {
    for (const [id, effect] of this._effects) {
      const state = settings.effects[id];
      if (!state) continue;
      try {
        this._applyParams(id, effect, state);
      } catch {
        // Ignore per-effect update errors; next rebuild recovers.
      }
    }
  }

  _applyParams(id, effect, state) {
    switch (id) {
      case 'toneMapping':
        effect.mode = TONE_MODE[state.mode] ?? effect.mode;
        effect.resolution = state.resolution;
        effect.whitePoint = state.whitePoint;
        effect.middleGrey = state.middleGrey;
        effect.averageLuminance = state.averageLuminance;
        effect.adaptationRate = state.adaptationRate;
        break;
      case 'fxaa':
        effect.minEdgeThreshold = state.minEdgeThreshold;
        effect.maxEdgeThreshold = state.maxEdgeThreshold;
        effect.subpixelQuality = state.subpixelQuality;
        effect.samples = state.samples;
        break;
      case 'bloom':
        effect.intensity = state.intensity;
        if (effect.luminanceMaterial) {
          effect.luminanceMaterial.threshold = state.luminanceThreshold;
          effect.luminanceMaterial.smoothing = state.luminanceSmoothing;
        }
        effect.kernelSize = KERNEL[state.kernelSize] ?? effect.kernelSize;
        if (effect.mipmapBlurPass) {
          effect.mipmapBlurPass.radius = state.radius;
        }
        break;
      case 'selectiveBloom':
        effect.intensity = state.intensity;
        if (effect.luminanceMaterial) {
          effect.luminanceMaterial.threshold = state.luminanceThreshold;
          effect.luminanceMaterial.smoothing = state.luminanceSmoothing;
        }
        effect.inverted = Boolean(state.inverted);
        effect.ignoreBackground = Boolean(state.ignoreBackground);
        break;
      case 'ssao':
        effect.samples = state.samples;
        effect.rings = state.rings;
        effect.radius = state.radius;
        effect.intensity = state.intensity;
        effect.luminanceInfluence = state.luminanceInfluence;
        effect.distanceScaling = state.distanceScaling;
        effect.depthAwareUpsampling = state.depthAwareUpsampling;
        if (effect.color) effect.color.copy(hexColor(state.color));
        break;
      case 'godRays':
        if (effect.godRaysMaterial) {
          effect.godRaysMaterial.density = state.density;
          effect.godRaysMaterial.decay = state.decay;
          effect.godRaysMaterial.weight = state.weight;
          effect.godRaysMaterial.exposure = state.exposure;
          effect.godRaysMaterial.samples = state.samples;
        }
        effect.blur = state.blur;
        break;
      case 'brightnessContrast':
        effect.brightness = state.brightness;
        effect.contrast = state.contrast;
        break;
      case 'hueSaturation':
        effect.hue = state.hue;
        effect.saturation = state.saturation;
        break;
      case 'sepia':
        effect.intensity = state.intensity;
        break;
      case 'colorDepth':
        effect.bitDepth = state.bitDepth;
        break;
      case 'depthOfField':
        if (effect.cocMaterial) {
          effect.cocMaterial.focusDistance = state.focusDistance;
          effect.cocMaterial.focalLength = state.focalLength;
        }
        effect.bokehScale = state.bokehScale;
        break;
      case 'realisticBokeh':
        if (effect.uniforms) {
          effect.uniforms.get('focus').value = state.focus;
          effect.uniforms.get('focalLength').value = state.focalLength;
          effect.uniforms.get('fStop').value = state.fStop;
          effect.uniforms.get('luminanceThreshold').value = state.luminanceThreshold;
          effect.uniforms.get('luminanceGain').value = state.luminanceGain;
          effect.uniforms.get('bias').value = state.bias;
          effect.uniforms.get('fringe').value = state.fringe;
          effect.uniforms.get('maxBlur').value = state.maxBlur;
        }
        effect.rings = state.rings;
        effect.samples = state.samples;
        effect.showFocus = state.showFocus;
        effect.manualDoF = state.manualDoF;
        effect.pentagon = state.pentagon;
        break;
      case 'vignette':
        effect.technique = VIGNETTE_TECH[state.technique] ?? effect.technique;
        effect.offset = state.offset;
        effect.darkness = state.darkness;
        break;
      case 'chromaticAberration':
        effect.offset.set(state.offsetX, state.offsetY);
        effect.radialModulation = state.radialModulation;
        effect.modulationOffset = state.modulationOffset;
        break;
      case 'lensDistortion':
        effect.distortion.set(state.distortionX, state.distortionY);
        effect.principalPoint.set(state.principalPointX, state.principalPointY);
        effect.focalLength.set(state.focalLengthX, state.focalLengthY);
        effect.skew = state.skew;
        break;
      case 'tiltShift':
        effect.offset = state.offset;
        effect.rotation = state.rotation;
        effect.focusArea = state.focusArea;
        effect.feather = state.feather;
        break;
      case 'noise':
        effect.premultiply = state.premultiply;
        effect.blendMode.opacity.value = state.opacity;
        break;
      case 'pixelation':
        effect.granularity = state.granularity;
        break;
      case 'dotScreen':
        effect.angle = state.angle;
        effect.scale = state.scale;
        break;
      case 'scanlines':
        effect.density = state.density;
        effect.scrollSpeed = state.scrollSpeed;
        break;
      case 'grid':
        effect.scale = state.scale;
        effect.lineWidth = state.lineWidth;
        break;
      case 'glitch':
        effect.mode = GLITCH[state.mode] ?? effect.mode;
        effect.minDelay = state.minDelay;
        effect.maxDelay = state.maxDelay;
        effect.minDuration = state.minDuration;
        effect.maxDuration = state.maxDuration;
        effect.minStrength = state.minStrength;
        effect.maxStrength = state.maxStrength;
        effect.columns = state.columns;
        break;
      case 'outline':
        effect.edgeStrength = state.edgeStrength;
        effect.visibleEdgeColor = hexColor(state.visibleEdgeColor).getHex();
        effect.hiddenEdgeColor = hexColor(state.hiddenEdgeColor).getHex();
        effect.pulseSpeed = state.pulseSpeed;
        effect.xRay = state.xRay;
        effect.blur = state.blur;
        break;
      case 'textureOverlay':
        effect.aspectCorrection = state.aspectCorrection;
        break;
      case 'shockWave': {
        const e = state.epicenter || { x: 0, y: 0, z: 0 };
        effect.epicenter.set(toMeters(e.x), toMeters(e.y), toMeters(e.z));
        effect.speed = state.speed;
        effect.maxRadius = state.maxRadius;
        effect.waveSize = state.waveSize;
        effect.amplitude = state.amplitude;
        break;
      }
      default:
        break;
    }
  }
}
