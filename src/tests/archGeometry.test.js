import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ArchComponent } from '../components/ArchComponent.js';
import { createArchFromBounds } from '../editor/archFactory.js';
import {
  createArchGeometry,
  getArchAabbSize,
} from '../runtime/archGeometry.js';
import { toMeters } from '../core/units.js';

describe('archGeometry', () => {
  it('mesh bounds match AABB in meters (not editor units)', () => {
    const arch = new ArchComponent({
      openingWidth: 200,
      openingHeight: 220,
      archRise: 100,
      thickness: 40,
      depth: 40,
    });
    const aabb = getArchAabbSize(arch);
    const geom = createArchGeometry(arch);
    geom.computeBoundingBox();
    const box = geom.boundingBox;

    expect(box.max.x - box.min.x).toBeCloseTo(toMeters(aabb.x), 4);
    expect(box.max.y - box.min.y).toBeCloseTo(toMeters(aabb.y), 4);
    expect(box.max.z - box.min.z).toBeCloseTo(toMeters(aabb.z), 4);
  });

  it('factory arch geometry is game-scale (~2–4 m)', () => {
    const actor = createArchFromBounds({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 25, y: 0, z: 25 },
      gridSize: 25,
      archType: 'roman',
    });
    const arch = actor.getComponent('Arch');
    const aabb = getArchAabbSize(arch);
    const geom = createArchGeometry(arch);
    geom.computeBoundingBox();
    const size = new THREE.Vector3();
    geom.boundingBox.getSize(size);

    // Width/height should be meters, not ~100× oversized.
    expect(size.x).toBeCloseTo(toMeters(aabb.x), 4);
    expect(size.y).toBeCloseTo(toMeters(aabb.y), 4);
    expect(size.x).toBeLessThan(10);
    expect(size.y).toBeLessThan(10);
    expect(size.x).toBeGreaterThan(1);
  });
});
