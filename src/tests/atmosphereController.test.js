// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  AtmosphereController,
  ATMOSPHERE_LAYER,
  syncCameraAtmosphereLayer,
} from '../runtime/atmosphere/AtmosphereController.js';

describe('AtmosphereController', () => {
  let scene;
  let atmosphere;

  beforeEach(() => {
    scene = new THREE.Scene();
    atmosphere = new AtmosphereController({ scene });
  });

  afterEach(() => {
    atmosphere?.dispose?.();
  });

  it('starts hidden until fog atmosphere layers are enabled', () => {
    expect(atmosphere.root.visible).toBe(false);
    atmosphere.applyFogSettings({ type: 'linear', mist: true, mistCount: 100 });
    expect(atmosphere.root.visible).toBe(true);
    expect(atmosphere._mist.visible).toBe(true);
    expect(atmosphere._mist.geometry.getAttribute('position').count).toBe(100);
  });

  it('rebuilds mist particle count when settings change', () => {
    atmosphere.applyFogSettings({ type: 'linear', mist: true, mistCount: 50 });
    expect(atmosphere._mist.geometry.getAttribute('position').count).toBe(50);
    atmosphere.applyFogSettings({ type: 'linear', mist: true, mistCount: 200 });
    expect(atmosphere._mist.geometry.getAttribute('position').count).toBe(200);
  });

  it('keeps mist in world space when the camera moves', () => {
    atmosphere.applyFogSettings({ type: 'linear', mist: true, mistCount: 40, mistSpeed: 0 });
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 0);
    atmosphere.update(cam, 0);
    const before = Float32Array.from(atmosphere._mist.geometry.getAttribute('position').array);
    cam.position.set(3, 0, 0);
    atmosphere.update(cam, 0);
    const after = atmosphere._mist.geometry.getAttribute('position').array;
    // Camera-glued mist would shift every particle by the camera delta (+3 on X).
    let gluedCount = 0;
    const n = before.length / 3;
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(after[i * 3] - (before[i * 3] + 3)) < 1e-4) gluedCount += 1;
    }
    expect(gluedCount).toBe(0);
  });

  it('hides atmosphere when perspectiveVisible is false', () => {
    atmosphere.applyFogSettings({ type: 'exp2', mist: true, noise: true });
    expect(atmosphere.root.visible).toBe(true);
    atmosphere.setPerspectiveVisible(false);
    expect(atmosphere.root.visible).toBe(false);
    atmosphere.setPerspectiveVisible(true);
    expect(atmosphere.root.visible).toBe(true);
  });

  it('pane Mist chip hides mist particles without killing noise layers', () => {
    atmosphere.applyFogSettings({ type: 'linear', mist: true, noise: true, mistCount: 20 });
    expect(atmosphere._mist.visible).toBe(true);
    expect(atmosphere.root.visible).toBe(true);
    atmosphere.setPaneMistVisible(false);
    expect(atmosphere._mist.visible).toBe(false);
    expect(atmosphere.root.visible).toBe(true);
    atmosphere.setPaneMistVisible(true);
    expect(atmosphere._mist.visible).toBe(true);
  });

  it('pane Mist off hides root when mist is the only atmosphere layer', () => {
    atmosphere.applyFogSettings({ type: 'linear', mist: true, mistCount: 10 });
    expect(atmosphere.root.visible).toBe(true);
    atmosphere.setPaneMistVisible(false);
    expect(atmosphere.root.visible).toBe(false);
    expect(atmosphere._mist.visible).toBe(false);
  });

  it('keeps atmosphere meshes on a dedicated layer for ortho masking', () => {
    atmosphere.applyFogSettings({
      type: 'linear',
      mist: true,
      noise: true,
      volumetric: true,
      mistCount: 10,
    });
    expect(atmosphere.root.layers.isEnabled(ATMOSPHERE_LAYER)).toBe(true);
    expect(atmosphere.root.layers.isEnabled(0)).toBe(false);
    expect(atmosphere._volumeMesh.layers.isEnabled(ATMOSPHERE_LAYER)).toBe(true);
    const persp = new THREE.PerspectiveCamera();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    syncCameraAtmosphereLayer(persp, true);
    syncCameraAtmosphereLayer(ortho, false);
    expect(persp.layers.isEnabled(ATMOSPHERE_LAYER)).toBe(true);
    expect(ortho.layers.isEnabled(ATMOSPHERE_LAYER)).toBe(false);
  });

  it('shows noise sheets when noise is on without volumetric', () => {
    atmosphere.applyFogSettings({ type: 'linear', noise: true, volumetric: false });
    expect(atmosphere._noiseSheets.some((s) => s.visible)).toBe(true);
    expect(atmosphere._volumeMesh.visible).toBe(false);
  });

  it('uses volume mesh when volumetric is on and hides noise sheets', () => {
    atmosphere.applyFogSettings({
      type: 'linear',
      noise: true,
      volumetric: true,
      volumetricExtent: 10,
    });
    expect(atmosphere._volumeMesh.visible).toBe(true);
    expect(atmosphere._noiseSheets.every((s) => !s.visible)).toBe(true);
  });

  it('update early-outs when root is hidden', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    atmosphere.applyFogSettings({ type: 'none' });
    expect(atmosphere.root.visible).toBe(false);
    atmosphere.update(cam, 0.016);
    // no throw
  });

  it('captureDepth is a no-op without a renderer when layers are off', () => {
    atmosphere.applyFogSettings({ type: 'none' });
    atmosphere.captureDepth(null, null);
    expect(atmosphere._depthReady).toBe(false);
  });

  it('dispose removes root from the scene', () => {
    expect(scene.children.includes(atmosphere.root)).toBe(true);
    atmosphere.dispose();
    expect(scene.children.includes(atmosphere.root)).toBe(false);
  });
});
