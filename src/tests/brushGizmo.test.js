import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BrushGizmo,
  GIZMO_SCREEN_SIZE_MUL,
  computeGizmoScreenScale,
} from '../editor/BrushGizmo.js';

describe('BrushGizmo sampleDrag', () => {
  it('returns a finite axis delta (not Vector3 - number NaN)', () => {
    const scene = new THREE.Scene();
    const gizmo = new BrushGizmo(scene);
    gizmo.update([
      { position: { x: 0, y: 150, z: 0 }, size: { x: 300, y: 300, z: 25 } },
    ], null);

    const startPoint = new THREE.Vector3(1, 1.5, 0);
    gizmo.beginDrag(
      { kind: 'move', axis: 'x', sign: 1, point: startPoint.clone() },
      new THREE.Ray(new THREE.Vector3(1, 5, 5), new THREE.Vector3(0, -1, -1).normalize()),
    );

    const sample = gizmo.sampleDrag(
      new THREE.Ray(new THREE.Vector3(2, 5, 5), new THREE.Vector3(0, -1, -1).normalize()),
    );
    expect(sample).toBeTruthy();
    expect(Number.isFinite(sample.deltaEditor)).toBe(true);

    gizmo.dispose();
  });
});

describe('computeGizmoScreenScale', () => {
  it('scales perspective gizmos with camera distance', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const target = new THREE.Vector3(0, 0, 0);
    cam.position.set(0, 0, 10);
    expect(computeGizmoScreenScale(cam, target)).toBeCloseTo(1 * GIZMO_SCREEN_SIZE_MUL, 3);
    cam.position.set(0, 0, 20);
    expect(computeGizmoScreenScale(cam, target)).toBeCloseTo(2 * GIZMO_SCREEN_SIZE_MUL, 3);
  });

  it('scales ortho gizmos with frustum height', () => {
    const cam = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    cam.userData.frustumSize = 12;
    expect(computeGizmoScreenScale(cam, new THREE.Vector3())).toBeCloseTo(1 * GIZMO_SCREEN_SIZE_MUL, 3);
    updateOrtho(cam, 24);
    expect(computeGizmoScreenScale(cam, new THREE.Vector3())).toBeCloseTo(2 * GIZMO_SCREEN_SIZE_MUL, 3);
  });

  it('scales axis handles but not face-resize handles', () => {
    const scene = new THREE.Scene();
    const gizmo = new BrushGizmo(scene);
    gizmo.update([
      { position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 200 } },
    ], null);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 20);
    gizmo.updateScreenScale(cam);
    expect(gizmo.moveGroup.scale.x).toBeCloseTo(2 * GIZMO_SCREEN_SIZE_MUL, 3);
    expect(gizmo.resizeGroup.scale.x).toBe(1);
    gizmo.dispose();
  });
});

describe('BrushGizmo scale handle style', () => {
  it('toggles brush scale between face resize and Unreal axis gizmo', () => {
    const scene = new THREE.Scene();
    const gizmo = new BrushGizmo(scene);
    gizmo.update([
      { position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 200 } },
    ], null);
    gizmo.setMode('scale');
    expect(gizmo.scaleHandleStyle).toBe('face');
    expect(gizmo.resizeGroup.visible).toBe(true);
    expect(gizmo.scaleGroup.visible).toBe(false);

    gizmo.setScaleHandleStyle('gizmo');
    expect(gizmo.resizeGroup.visible).toBe(false);
    expect(gizmo.scaleGroup.visible).toBe(true);

    gizmo.setScaleHandleStyle('face');
    expect(gizmo.resizeGroup.visible).toBe(true);
    expect(gizmo.scaleGroup.visible).toBe(false);
    gizmo.dispose();
  });

  it('includes a center uniform xyz scale handle', () => {
    const scene = new THREE.Scene();
    const gizmo = new BrushGizmo(scene);
    const axes = [];
    gizmo.scaleGroup.traverse((obj) => {
      if (obj.userData?.kind === 'scale') axes.push(obj.userData.axis);
    });
    expect(axes).toEqual(expect.arrayContaining(['x', 'y', 'z', 'xyz']));
    gizmo.dispose();
  });
});

function updateOrtho(cam, frustumSize) {
  const half = frustumSize / 2;
  cam.top = half;
  cam.bottom = -half;
  cam.left = -half;
  cam.right = half;
  cam.userData.frustumSize = frustumSize;
  cam.updateProjectionMatrix();
}
