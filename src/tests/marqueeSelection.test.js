import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  boxIntersectsMarquee,
  normalizeMarqueeNdc,
  ndcPointInMarquee,
  marqueeSelectActors,
} from '../editor/viewport/marqueeSelection.js';
import {
  applyDisplayMode,
  restoreDisplayMode,
} from '../editor/viewport/viewportDisplay.js';

describe('marqueeSelection', () => {
  it('normalizes ndc marquees', () => {
    const m = normalizeMarqueeNdc({ x: 0.5, y: -0.2 }, { x: -0.1, y: 0.4 });
    expect(m.minX).toBeCloseTo(-0.1);
    expect(m.maxX).toBeCloseTo(0.5);
    expect(m.minY).toBeCloseTo(-0.2);
    expect(m.maxY).toBeCloseTo(0.4);
    expect(ndcPointInMarquee({ x: 0, y: 0 }, m)).toBe(true);
    expect(ndcPointInMarquee({ x: 0.9, y: 0 }, m)).toBe(false);
  });

  it('projects boxes into marquee', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const box = new THREE.Box3(
      new THREE.Vector3(-0.5, -0.5, -0.5),
      new THREE.Vector3(0.5, 0.5, 0.5),
    );
    const marquee = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    expect(boxIntersectsMarquee(box, cam, marquee)).toBe(true);
  });

  it('selects actors whose groups fall in marquee', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 5, 10);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);

    const far = new THREE.Group();
    const farMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    far.add(farMesh);
    far.position.set(50, 0, 0);
    far.updateMatrixWorld(true);

    const map = new Map([
      ['near', { group }],
      ['far', { group: far }],
    ]);
    const marquee = { minX: -0.3, maxX: 0.3, minY: -0.3, maxY: 0.3 };
    const ids = marqueeSelectActors(map, cam, marquee);
    expect(ids).toContain('near');
    expect(ids).not.toContain('far');
  });
});

describe('viewportDisplay', () => {
  it('applies and restores wireframe mode via silhouette edges', () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, wireframe: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    scene.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    edges.userData.viewportEdgesOverlay = true;
    edges.visible = false;
    scene.add(edges);
    const rangeGuide = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ wireframe: true }),
    );
    rangeGuide.userData.denseWireHelper = true;
    scene.add(rangeGuide);
    const light = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(light);

    const state = applyDisplayMode(scene, [light], 'wireframe');
    expect(mat.wireframe).toBe(false);
    expect(mesh.visible).toBe(false);
    expect(edges.visible).toBe(true);
    expect(rangeGuide.visible).toBe(false);
    expect(light.intensity).toBe(0);
    restoreDisplayMode(state);
    expect(mesh.visible).toBe(true);
    expect(edges.visible).toBe(false);
    expect(rangeGuide.visible).toBe(true);
    expect(light.intensity).toBe(0.5);
  });
});
