import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  STATIC_MESH_COLLISION_TYPES,
  STATIC_MESH_INSTANCING,
  normalizeStaticMeshFields,
  serializeStaticMeshFields,
  assertStaticColliderAllowed,
  StaticMeshComponent,
} from '../components/StaticMeshComponent.js';
import {
  collectMaterialSlots,
  extractCollisionGeometryMeters,
  resolveStaticCollisionDims,
} from '../runtime/staticMeshGeometry.js';
import { staticMeshInstanceKey } from '../runtime/createThreeStaticMesh.js';
import { validateLevelPayloads } from '../serialization/levelGeometryValidation.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { seedLoadedMeshMeta, seedLoadedMeshScene, clearMeshCache } from '../runtime/meshLoader.js';
import acceptance from '../../public/levels/acceptance-static-meshes.json';

describe('Batch 6 StaticMesh component', () => {
  it('exposes full collision and instancing enums', () => {
    expect(STATIC_MESH_COLLISION_TYPES).toContain('convex');
    expect(STATIC_MESH_COLLISION_TYPES).toContain('trimesh');
    expect(STATIC_MESH_INSTANCING).toEqual(['off', 'auto', 'force']);
  });

  it('normalizes legacy collidable+box and none defaults', () => {
    expect(normalizeStaticMeshFields({ collidable: true }).collisionType).toBe('box');
    expect(normalizeStaticMeshFields({}).collidable).toBe(false);
    expect(normalizeStaticMeshFields({ collisionType: 'none' }).collidable).toBe(false);
    expect(normalizeStaticMeshFields({ collisionType: 'auto', collidable: true }).collisionType).toBe('auto');
  });

  it('round-trips serialize fields including overrides and LOD', () => {
    const raw = {
      assetId: 'mesh_verify_cube',
      collidable: true,
      collisionType: 'capsule',
      collisionRadius: 40,
      collisionHeight: 160,
      materialOverrides: { 'Mesh_0:0': 'mat_batch2_metal' },
      lodLevels: [
        { assetId: 'mesh_verify_cube', distance: 0 },
        { assetId: 'mesh_verify_cube', distance: 500 },
      ],
      lodHysteresis: 25,
      lodPreview: 1,
      instancing: 'auto',
      castShadow: false,
      showCollision: true,
    };
    const ser = serializeStaticMeshFields(raw);
    const again = normalizeStaticMeshFields(ser);
    expect(again.collisionType).toBe('capsule');
    expect(again.materialOverrides['Mesh_0:0']).toBe('mat_batch2_metal');
    expect(again.lodLevels).toHaveLength(2);
    expect(again.instancing).toBe('auto');
    expect(again.castShadow).toBe(false);
    const comp = new StaticMeshComponent(raw);
    expect(comp.toJSON().lodLevels[1].distance).toBe(500);
  });

  it('enforces Rapier fixed-body rule for convex/trimesh', () => {
    expect(assertStaticColliderAllowed('trimesh', 'fixed').ok).toBe(true);
    expect(assertStaticColliderAllowed('convex', 'dynamic').ok).toBe(false);
    expect(assertStaticColliderAllowed('box', 'dynamic').ok).toBe(true);
  });
});

describe('Batch 6 geometry helpers', () => {
  it('collects material slots with stable keys', () => {
    const root = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m0 = new THREE.MeshStandardMaterial({ name: 'A' });
    const m1 = new THREE.MeshStandardMaterial({ name: 'B' });
    const mesh = new THREE.Mesh(geo, [m0, m1]);
    mesh.name = 'PropBody';
    root.add(mesh);
    const slots = collectMaterialSlots(root);
    expect(slots.map((s) => s.key)).toEqual(['PropBody:0', 'PropBody:1']);
  });

  it('extracts collision verts without mutating shared scene', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.position.set(1, 0, 0);
    root.add(mesh);
    root.updateMatrixWorld(true);
    const before = mesh.matrix.elements.slice();
    const { positions, indices } = extractCollisionGeometryMeters(root, { x: 1, y: 1, z: 1 });
    expect(positions.length).toBeGreaterThan(0);
    expect(indices.length).toBeGreaterThan(0);
    expect(mesh.matrix.elements).toEqual(before);
  });

  it('resolves collision dims from AABB and overrides', () => {
    const dims = resolveStaticCollisionDims(
      normalizeStaticMeshFields({
        collisionSize: { x: 200, y: 0, z: 0 },
        collisionOffset: { x: 50, y: 0, z: 0 },
        collisionRadius: 0,
        collisionHeight: 100,
      }),
      { x: 1, y: 2, z: 3 },
      { x: 0.1, y: 0, z: 0 },
    );
    expect(dims.boxSize.x).toBeCloseTo(2); // 200 eu → 2 m
    expect(dims.boxSize.y).toBe(2); // AABB
    expect(dims.height).toBeCloseTo(1); // 100 eu
    expect(dims.offsetMeters.x).toBeCloseTo(0.6);
  });

  it('instance keys include asset and material overrides', () => {
    const a = staticMeshInstanceKey({
      assetId: 'mesh_a',
      materialOverrides: { 'M:0': 'mat1' },
      castShadow: true,
      receiveShadow: true,
    });
    const b = staticMeshInstanceKey({
      assetId: 'mesh_a',
      materialOverrides: {},
      castShadow: true,
      receiveShadow: true,
    });
    expect(a).not.toBe(b);
  });
});

describe('Batch 6 payload + acceptance level', () => {
  beforeEach(() => {
    clearMeshCache();
  });

  it('accepts expanded StaticMesh collision / instancing enums', () => {
    for (const collisionType of STATIC_MESH_COLLISION_TYPES) {
      const data = {
        schemaVersion: 2,
        name: 't',
        actors: [{
          id: 'a',
          name: 'm',
          transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
          components: [{ id: 'c', type: 'StaticMesh', assetId: 'mesh_verify_cube', collisionType, collidable: collisionType !== 'none' }],
        }],
      };
      expect(validateLevelPayloads(data), collisionType).toEqual([]);
      expect(() => deserializeLevel(data), collisionType).not.toThrow();
    }
  });

  it('loads acceptance-static-meshes.json', () => {
    expect(validateLevelPayloads(acceptance)).toEqual([]);
    const world = deserializeLevel(acceptance);
    const statics = world.actors.filter((a) => a.getComponent('StaticMesh'));
    expect(statics.length).toBeGreaterThanOrEqual(12);
    const types = new Set(statics.map((a) => a.getComponent('StaticMesh').collisionType));
    expect(types.has('convex')).toBe(true);
    expect(types.has('trimesh')).toBe(true);
    expect(types.has('capsule')).toBe(true);
    const withLod = statics.find((a) => (a.getComponent('StaticMesh').lodLevels || []).length > 1);
    expect(withLod).toBeTruthy();
    const withOverride = statics.find((a) => Object.keys(a.getComponent('StaticMesh').materialOverrides || {}).length);
    expect(withOverride).toBeTruthy();
    const instanced = statics.filter((a) => a.getComponent('StaticMesh').instancing === 'force');
    expect(instanced.length).toBeGreaterThanOrEqual(3);
  });

  it('seeds mesh scene for convex extraction smoke', () => {
    const url = 'seed://cube';
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    seedLoadedMeshMeta(url, {
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 0, z: 0 },
    });
    seedLoadedMeshScene(url, root);
    const { positions } = extractCollisionGeometryMeters(root);
    expect(positions.length).toBeGreaterThanOrEqual(8 * 3);
  });
});
