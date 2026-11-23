import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BrushGizmo } from '../editor/BrushGizmo.js';

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
