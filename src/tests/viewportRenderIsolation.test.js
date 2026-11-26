// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SceneView } from '../runtime/SceneView.js';
import { ATMOSPHERE_LAYER } from '../runtime/atmosphere/AtmosphereController.js';

function makeIsolatedSceneView() {
  const view = Object.create(SceneView.prototype);
  view.editMode = true;
  view.gameView = false;
  view.scene = new THREE.Scene();
  view.scene.fog = new THREE.FogExp2('#6a7380', 0.04);
  view._authoredFogRef = view.scene.fog;
  view.renderer = {
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 0.95,
    autoClear: true,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap, autoUpdate: true, needsUpdate: false },
    setScissorTest: vi.fn(),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    getScissorTest: () => true,
    render: vi.fn(),
  };
  view.worldEnvironment = { setPerspectiveVisible: vi.fn() };
  view._size = { width: 400, height: 200 };
  view._worldRenderer = { toneMapping: 'ACESFilmic', toneMappingExposure: 0.95 };
  view._postProcessing = { enabled: false };
  view.postProcessingPreview = true;
  view._postProcessingMultiPane = true;
  view.postProcessingController = {
    isActive: false,
    render: vi.fn(() => false),
    _syncComposerBuffers: vi.fn(),
  };
  view.ambient = { intensity: 0.1, visible: true };
  view.editFill = { intensity: 0.06, visible: true };
  view.editFill2 = { intensity: 0.03, visible: true };
  view.gridHelper = null;
  view.gizmo = { updateScreenScale: vi.fn() };
  view.atmosphere = {
    setPerspectiveVisible: vi.fn(),
    update: vi.fn(),
    captureDepth: vi.fn(),
    applyFogSettings: vi.fn(),
  };
  view._paneCameras = new Map();
  view._actorMeshes = new Map();
  view._atmosphereLastTime = 0;
  view._showEditorOverlays = () => false;
  view._updateFogDrift = () => {};
  view._atmosphereDt = () => 0.016;
  view._ensureActorEdgesOverlays = () => {};
  view._toneMappingFromName = SceneView.prototype._toneMappingFromName;
  view._shouldUsePostProcessing = SceneView.prototype._shouldUsePostProcessing;
  view._drawScene = SceneView.prototype._drawScene;
  view.ensurePaneCamera = SceneView.prototype.ensurePaneCamera;
  view.updatePaneCameraProjection = SceneView.prototype.updatePaneCameraProjection;
  view.renderViewports = SceneView.prototype.renderViewports;
  view.getPaneCamera = SceneView.prototype.getPaneCamera;
  return view;
}

describe('SceneView.renderViewports isolation', () => {
  it('restores authored scene.fog after mixed perspective/ortho panes', () => {
    const view = makeIsolatedSceneView();
    const authored = view.scene.fog;
    const fogSeen = [];

    view._drawScene = function draw(camera, opts) {
      fogSeen.push({
        fog: this.scene.fog,
        atmosphere: opts.atmosphere,
        cameraOrtho: Boolean(camera?.isOrthographicCamera),
      });
    };

    view.renderViewports([
      {
        paneId: 'pane-0',
        rect: { x: 0, y: 0, width: 200, height: 200 },
        cameraMode: 'perspective',
        displayMode: 'lit',
        showFog: true,
        showPostProcessing: true,
        paneState: {
          id: 'pane-0',
          cameraMode: 'perspective',
          showFog: true,
          showPostProcessing: true,
          position: [6, 5, 8],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
      {
        paneId: 'pane-1',
        rect: { x: 200, y: 0, width: 200, height: 200 },
        cameraMode: 'top',
        displayMode: 'lit',
        showFog: false,
        showPostProcessing: false,
        paneState: {
          id: 'pane-1',
          cameraMode: 'top',
          showFog: false,
          showPostProcessing: false,
          position: [0, 20, 0],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);

    expect(fogSeen).toHaveLength(2);
    expect(fogSeen[0].fog).toBe(authored);
    expect(fogSeen[0].atmosphere).toBe(true);
    expect(fogSeen[1].fog).toBeNull();
    expect(fogSeen[1].atmosphere).toBe(false);
    expect(view.scene.fog).toBe(authored);
    expect(authored.density).toBeCloseTo(0.04);
  });

  it('honors explicit Show Fog on an ortho pane for distance fog only', () => {
    const view = makeIsolatedSceneView();
    const authored = view.scene.fog;
    const fogSeen = [];
    view._drawScene = function draw(_camera, opts) {
      fogSeen.push({ fog: this.scene.fog, atmosphere: opts.atmosphere });
    };

    view.renderViewports([
      {
        paneId: 'pane-1',
        rect: { x: 0, y: 0, width: 400, height: 200 },
        cameraMode: 'top',
        displayMode: 'lit',
        showFog: true,
        showPostProcessing: false,
        paneState: {
          id: 'pane-1',
          cameraMode: 'top',
          showFog: true,
          position: [0, 20, 0],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);

    expect(fogSeen[0].fog).toBe(authored);
    expect(fogSeen[0].atmosphere).toBe(false);
    expect(view.scene.fog).toBe(authored);
  });

  it('skips post-processing when pane showPostProcessing is false', () => {
    const view = makeIsolatedSceneView();
    view._postProcessing = { enabled: true, effects: { bloom: { enabled: true } } };
    view.postProcessingController.isActive = true;
    const draws = [];
    view._drawScene = function draw(_c, opts) {
      draws.push(opts);
    };

    view.renderViewports([
      {
        paneId: 'pane-0',
        rect: { x: 0, y: 0, width: 400, height: 200 },
        cameraMode: 'perspective',
        displayMode: 'lit',
        showFog: true,
        showPostProcessing: false,
        paneState: {
          id: 'pane-0',
          cameraMode: 'perspective',
          showFog: true,
          showPostProcessing: false,
          position: [6, 5, 8],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);

    expect(draws[0].usePostProcess).toBe(false);
  });

  it('disables atmosphere layer on ortho cameras', () => {
    const view = makeIsolatedSceneView();
    view._drawScene = () => {};
    view.renderViewports([
      {
        paneId: 'pane-1',
        rect: { x: 0, y: 0, width: 400, height: 200 },
        cameraMode: 'top',
        displayMode: 'lit',
        showFog: false,
        paneState: {
          id: 'pane-1',
          cameraMode: 'top',
          showFog: false,
          position: [0, 20, 0],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);
    const cam = view.getPaneCamera('pane-1');
    expect(cam.isOrthographicCamera).toBe(true);
    expect(cam.layers.isEnabled(ATMOSPHERE_LAYER)).toBe(false);
  });

  it('uses editor clear color in ortho/iso and restores authored background', () => {
    const view = makeIsolatedSceneView();
    view.scene.background = new THREE.Color('#5b708f');
    view.scene.backgroundIntensity = 1.5;
    view.scene.backgroundBlurriness = 0.25;
    const authored = view.scene.background;
    const seen = [];
    view._drawScene = function draw(camera) {
      seen.push({
        hex: this.scene.background?.getHexString?.(),
        intensity: this.scene.backgroundIntensity,
        blurriness: this.scene.backgroundBlurriness,
        ortho: Boolean(camera?.isOrthographicCamera),
      });
    };

    view.renderViewports([
      {
        paneId: 'pane-0',
        rect: { x: 0, y: 0, width: 200, height: 200 },
        cameraMode: 'perspective',
        displayMode: 'lit',
        showFog: true,
        paneState: {
          id: 'pane-0',
          cameraMode: 'perspective',
          position: [6, 5, 8],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
      {
        paneId: 'pane-1',
        rect: { x: 200, y: 0, width: 200, height: 200 },
        cameraMode: 'isometric',
        displayMode: 'lit',
        showFog: false,
        paneState: {
          id: 'pane-1',
          cameraMode: 'isometric',
          position: [10, 10, 10],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);

    expect(seen[0]).toMatchObject({ hex: '5b708f', intensity: 1.5, blurriness: 0.25, ortho: false });
    expect(seen[1]).toMatchObject({ hex: '0e1218', intensity: 1, blurriness: 0, ortho: true });
    expect(view.scene.background).toBe(authored);
    expect(view.scene.backgroundIntensity).toBe(1.5);
    expect(view.scene.backgroundBlurriness).toBe(0.25);
  });

  it('reuses shadow maps after the first pane and skips per-pane env ticks', () => {
    const view = makeIsolatedSceneView();
    const shadowFlags = [];
    const tickFlags = [];
    view._drawScene = function draw(_camera, opts) {
      shadowFlags.push(opts.updateShadows);
      tickFlags.push(opts.tickEnvironment);
    };

    view.renderViewports([
      {
        paneId: 'pane-0',
        rect: { x: 0, y: 0, width: 200, height: 200 },
        cameraMode: 'perspective',
        displayMode: 'lit',
        showFog: true,
        paneState: {
          id: 'pane-0',
          cameraMode: 'perspective',
          position: [6, 5, 8],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
      {
        paneId: 'pane-1',
        rect: { x: 200, y: 0, width: 200, height: 200 },
        cameraMode: 'top',
        displayMode: 'lit',
        showFog: false,
        paneState: {
          id: 'pane-1',
          cameraMode: 'top',
          position: [0, 20, 0],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
      {
        paneId: 'pane-2',
        rect: { x: 0, y: 200, width: 200, height: 200 },
        cameraMode: 'front',
        displayMode: 'lit',
        showFog: false,
        paneState: {
          id: 'pane-2',
          cameraMode: 'front',
          position: [0, 0, 20],
          target: [0, 1.5, 0],
          frustumSize: 12,
        },
      },
    ]);

    expect(shadowFlags).toEqual([true, false, false]);
    expect(tickFlags).toEqual([false, false, false]);
    expect(view.renderer.shadowMap.autoUpdate).toBe(true);
  });
});
