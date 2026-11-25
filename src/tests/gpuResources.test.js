import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  disposeObjectTree,
  disposeOwnedGeometry,
  disposeOwnedMaterial,
  isSharedGpuResource,
  markOwnedGpuResource,
  markSharedGpuResource,
  markSharedSubtree,
} from '../runtime/gpuResources.js';

describe('gpu resource ownership', () => {
  it('skips disposal of shared geometries and materials', () => {
    const geom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const mat = markSharedGpuResource(new THREE.MeshBasicMaterial());
    const map = markSharedGpuResource({ dispose: vi.fn(), userData: { bbShared: true } });
    mat.map = map;

    const disposeGeom = vi.spyOn(geom, 'dispose');
    const disposeMat = vi.spyOn(mat, 'dispose');

    disposeOwnedGeometry(geom);
    disposeOwnedMaterial(mat);

    expect(disposeGeom).not.toHaveBeenCalled();
    expect(disposeMat).not.toHaveBeenCalled();
    expect(map.dispose).not.toHaveBeenCalled();
  });

  it('disposes instance-owned materials including cloned maps', () => {
    const map = markOwnedGpuResource({ dispose: vi.fn(), userData: { bbShared: false } });
    const mat = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    mat.map = map;
    const disposeMat = vi.spyOn(mat, 'dispose');

    disposeOwnedMaterial(mat);

    expect(map.dispose).toHaveBeenCalledTimes(1);
    expect(disposeMat).toHaveBeenCalledTimes(1);
  });

  it('disposeObjectTree leaves shared GLTF geometry intact', () => {
    const sharedGeom = markSharedGpuResource(new THREE.BoxGeometry(1, 1, 1));
    const ownedMat = markOwnedGpuResource(new THREE.MeshBasicMaterial());
    const mesh = new THREE.Mesh(sharedGeom, ownedMat);
    const disposeGeom = vi.spyOn(sharedGeom, 'dispose');
    const disposeMat = vi.spyOn(ownedMat, 'dispose');

    disposeObjectTree(mesh);

    expect(disposeGeom).not.toHaveBeenCalled();
    expect(disposeMat).toHaveBeenCalledTimes(1);
  });

  it('markSharedSubtree tags geometries under a loaded root', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    root.add(mesh);
    markSharedSubtree(root);
    expect(isSharedGpuResource(mesh.geometry)).toBe(true);
    expect(isSharedGpuResource(mesh.material)).toBe(true);
  });
});
