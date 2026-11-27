// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  clampViewportPrefs,
  defaultShowFogForCameraMode,
  defaultShowMistForCameraMode,
  defaultShowPostProcessingForCameraMode,
  resolvePaneShowFog,
  resolvePaneShowMist,
  resolvePaneShowPostProcessing,
} from '../editor/viewport/viewportPrefs.js';
import { orientPaneToCameraMode } from '../editor/viewport/viewportCameras.js';
import { paneScissorFromDomRect } from '../editor/viewport/paneScissor.js';
import { buildViewportPanes } from '../editor/viewport/viewportRuntimeBridge.js';
import {
  needsComposerPipeline,
  PostProcessingController,
} from '../runtime/postprocessing/PostProcessingController.js';

describe('viewport fog / PP prefs', () => {
  it('defaults fog and PP on for perspective, off for ortho; mist off', () => {
    expect(defaultShowFogForCameraMode('perspective')).toBe(true);
    expect(defaultShowFogForCameraMode('top')).toBe(false);
    expect(defaultShowFogForCameraMode('isometric')).toBe(false);
    expect(defaultShowMistForCameraMode('perspective')).toBe(false);
    expect(defaultShowMistForCameraMode('top')).toBe(false);
    expect(defaultShowPostProcessingForCameraMode('perspective')).toBe(true);
    expect(defaultShowPostProcessingForCameraMode('front')).toBe(false);
  });

  it('clampViewportPrefs fills showFog / showMist / showPostProcessing from camera mode', () => {
    const p = clampViewportPrefs({
      layoutMode: 'dual-h',
      panes: [
        { id: 'pane-0', cameraMode: 'perspective' },
        { id: 'pane-1', cameraMode: 'top' },
      ],
    });
    expect(p.panes[0].showFog).toBe(true);
    expect(p.panes[0].showMist).toBe(false);
    expect(p.panes[0].showPostProcessing).toBe(true);
    expect(p.panes[1].showFog).toBe(false);
    expect(p.panes[1].showMist).toBe(false);
    expect(p.panes[1].showPostProcessing).toBe(false);
  });

  it('preserves explicit per-pane fog / mist / PP toggles', () => {
    const p = clampViewportPrefs({
      panes: [
        {
          id: 'pane-0',
          cameraMode: 'perspective',
          showFog: false,
          showMist: true,
          showPostProcessing: false,
        },
        { id: 'pane-1', cameraMode: 'top', showFog: true, showPostProcessing: true },
      ],
    });
    expect(p.panes[0].showFog).toBe(false);
    expect(p.panes[0].showMist).toBe(true);
    expect(p.panes[0].showPostProcessing).toBe(false);
    expect(p.panes[1].showFog).toBe(true);
    expect(p.panes[1].showPostProcessing).toBe(true);
  });

  it('resolvePaneShowFog / Mist read pane and paneState', () => {
    expect(resolvePaneShowFog({ cameraMode: 'top' })).toBe(false);
    expect(resolvePaneShowFog({ cameraMode: 'top', showFog: true })).toBe(true);
    expect(resolvePaneShowFog({ paneState: { showFog: true, cameraMode: 'top' } })).toBe(true);
    expect(resolvePaneShowMist({ cameraMode: 'perspective' })).toBe(false);
    expect(resolvePaneShowMist({ cameraMode: 'perspective', showMist: true })).toBe(true);
    expect(resolvePaneShowMist({ paneState: { showMist: true } })).toBe(true);
    expect(resolvePaneShowPostProcessing({
      cameraMode: 'perspective',
      showPostProcessing: false,
    })).toBe(false);
  });

  it('orientPaneToCameraMode resets fog/mist/PP defaults for the new mode', () => {
    const fromPersp = orientPaneToCameraMode({
      id: 'pane-0',
      cameraMode: 'perspective',
      showFog: true,
      showMist: true,
      showPostProcessing: true,
      position: [6, 5, 8],
      target: [0, 1.5, 0],
    }, 'top');
    expect(fromPersp.cameraMode).toBe('top');
    expect(fromPersp.showFog).toBe(false);
    expect(fromPersp.showMist).toBe(false);
    expect(fromPersp.showPostProcessing).toBe(false);

    const back = orientPaneToCameraMode(fromPersp, 'perspective');
    expect(back.showFog).toBe(true);
    expect(back.showMist).toBe(false);
    expect(back.showPostProcessing).toBe(true);
  });

  it('buildViewportPanes forwards showFog / showMist / showPostProcessing', () => {
    const prefs = clampViewportPrefs({
      layoutMode: 'dual-h',
      panes: [
        {
          id: 'pane-0',
          cameraMode: 'perspective',
          showFog: true,
          showMist: true,
          showPostProcessing: false,
        },
        { id: 'pane-1', cameraMode: 'top', showFog: false, showPostProcessing: false },
      ],
    });
    const panes = buildViewportPanes(prefs, 200, 100, null);
    expect(panes).toHaveLength(2);
    expect(panes[0].showFog).toBe(true);
    expect(panes[0].showMist).toBe(true);
    expect(panes[0].showPostProcessing).toBe(false);
    expect(panes[1].showFog).toBe(false);
    expect(panes[1].showMist).toBe(false);
  });
});

describe('paneScissorFromDomRect', () => {
  it('converts top-left DOM rects to bottom-left WebGL scissors', () => {
    expect(paneScissorFromDomRect({ x: 10, y: 20, width: 100, height: 50 }, 200)).toEqual({
      x: 10,
      y: 130,
      width: 100,
      height: 50,
    });
  });
});

describe('PostProcessingController pane isolation', () => {
  let renderer;
  let scene;
  let ctrl;

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = {
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 0.95,
      autoClear: true,
      getPixelRatio: () => 2,
      getSize: (v) => v.set(400, 200),
      getDrawingBufferSize: (v) => v.set(800, 400),
      getViewport: (v) => v.set(0, 0, 400, 200),
      getScissor: (v) => v.set(0, 0, 400, 200),
      getScissorTest: () => true,
      getRenderTarget: () => null,
      setViewport: vi.fn(),
      setScissor: vi.fn(),
      setScissorTest: vi.fn(),
      setRenderTarget: vi.fn(),
      getContext: () => ({ getContextAttributes: () => ({ alpha: true }) }),
    };
    ctrl = new PostProcessingController({ renderer, scene });
  });

  afterEach(() => {
    if (ctrl.composer && typeof ctrl.composer.dispose !== 'function') {
      ctrl.composer = null;
    }
    ctrl.dispose();
  });

  it('needsComposerPipeline stays false for ACES-only enable', () => {
    expect(needsComposerPipeline({ enabled: true })).toBe(false);
  });

  it('sizes composer buffers to pane × DPR without rewriting canvas size', () => {
    const setSize = vi.fn();
    const passes = [
      { renderToScreen: true, setSize },
      { renderToScreen: false, setSize },
    ];
    ctrl.composer = {
      inputBuffer: { setSize },
      outputBuffer: { setSize },
      depthRenderTarget: { setSize },
      passes,
      copyPass: { setSize },
      autoRenderToScreen: true,
      dispose: vi.fn(),
    };

    ctrl._setComposerBufferSize(200 * 2, 100 * 2);
    expect(ctrl._composerBuf).toEqual({ width: 400, height: 200 });
    expect(setSize).toHaveBeenCalledWith(400, 200);

    ctrl._setComposerRenderToScreen(false);
    expect(ctrl.composer.autoRenderToScreen).toBe(false);
    expect(passes.every((p) => p.renderToScreen === false)).toBe(true);

    ctrl._setComposerRenderToScreen(true);
    expect(ctrl.composer.autoRenderToScreen).toBe(true);
    expect(passes[0].renderToScreen).toBe(false);
    expect(passes[1].renderToScreen).toBe(true);
  });

  it('blit uses copyPass to screen and restores copyPass.renderToScreen', () => {
    const copyRender = vi.fn();
    ctrl.composer = {
      inputBuffer: { texture: {} },
      outputBuffer: {},
      copyPass: { render: copyRender, renderToScreen: false },
      passes: [],
      autoRenderToScreen: false,
      dispose: vi.fn(),
    };
    ctrl._blitComposerToScreen();
    expect(copyRender).toHaveBeenCalledTimes(1);
    expect(ctrl.composer.copyPass.renderToScreen).toBe(false);
  });
});

describe('SceneView fog restore contract', () => {
  it('swapping scene.fog for a pane does not mutate the authored Fog object', () => {
    const authored = new THREE.FogExp2('#112233', 0.05);
    const scene = new THREE.Scene();
    scene.fog = authored;
    const densityBefore = authored.density;

    scene.fog = null;
    expect(scene.fog).toBeNull();
    scene.fog = authored;
    expect(scene.fog).toBe(authored);
    expect(authored.density).toBe(densityBefore);
  });
});
