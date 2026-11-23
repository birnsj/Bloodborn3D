import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrushBoxGeometry, TEXTURE_TILE_EDITOR_UNITS } from '../runtime/brushGeometry.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { LightComponent } from '../components/LightComponent.js';
import { PhysicsWorld } from '../runtime/PhysicsWorld.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  SetBrushMaterialCommand,
  SetTransformsCommand,
  AddActorsCommand,
  RemoveActorsCommand,
} from '../editor/history/commands.js';
import { createStaticMeshActor } from '../editor/meshFactory.js';
import { validateMeshScale, metersToEditorSize } from '../assets/assetCatalog.js';
import { normalizeRegistry, findAsset } from '../assets/AssetRegistry.js';
import { toMeters } from '../core/units.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Manual-gate automated counterparts for Phase 2B acceptance.
 * These do not replace visual QA, but catch regressions in the four gate areas.
 */

describe('Gate 1 — texture mapping / UV continuity', () => {
  it('tiles by world size so resize does not stretch UVs', () => {
    const small = createBrushBoxGeometry({ x: 300, y: 300, z: 20 }, { scale: { x: 1, y: 1 } });
    const large = createBrushBoxGeometry({ x: 600, y: 300, z: 20 }, { scale: { x: 1, y: 1 } });

    // +Z face verts 16..19 — U extent should double when X doubles
    const sU = extent(small.attributes.uv, 16, 20, 'x');
    const lU = extent(large.attributes.uv, 16, 20, 'x');
    expect(lU).toBeCloseTo(sU * 2, 5);

    // V (height) stays the same for same Y
    const sV = extent(small.attributes.uv, 16, 20, 'y');
    const lV = extent(large.attributes.uv, 16, 20, 'y');
    expect(lV).toBeCloseTo(sV, 5);

    small.dispose();
    large.dispose();
  });

  it('adjacent same-height walls share matching vertical UV span', () => {
    const north = createBrushBoxGeometry({ x: 600, y: 300, z: 20 }, {});
    const east = createBrushBoxGeometry({ x: 20, y: 300, z: 600 }, {});
    // Both use Y as V on vertical faces → same V span for wall module height
    const northV = extent(north.attributes.uv, 16, 20, 'y'); // +z
    const eastV = extent(east.attributes.uv, 0, 4, 'y'); // +x
    expect(northV).toBeCloseTo(eastV, 5);
    expect(northV).toBeCloseTo(300 / TEXTURE_TILE_EDITOR_UNITS, 5);
    north.dispose();
    east.dispose();
  });

  it('UV offset/rotation serialize on brushes', () => {
    const world = new World({ name: 'uv', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'w',
      components: [new BrushComponent({
        id: 'b',
        materialId: 'mat_verify_wall',
        uv: { scale: { x: 1, y: 1 }, offset: { x: 0.5, y: 0.25 }, rotation: 90 },
      })],
    }));
    const round = deserializeLevel(serializeLevel(world));
    expect(round.getActor('w').getComponent('Brush').uv).toEqual({
      scale: { x: 1, y: 1 },
      offset: { x: 0.5, y: 0.25 },
      rotation: 90,
    });
  });
});

describe('Gate 2 — asset persistence / scale', () => {
  it('seeded verify assets exist with stable IDs', () => {
    const registry = normalizeRegistry(JSON.parse(
      readFileSync(path.join(root, 'public/assets/registry.json'), 'utf8'),
    ));
    expect(findAsset(registry, 'tex_verify_wall')?.kind).toBe('texture');
    expect(findAsset(registry, 'mat_verify_wall')?.kind).toBe('material');
    expect(findAsset(registry, 'mesh_verify_cube')?.kind).toBe('mesh');
    expect(existsSync(path.join(root, 'public/assets/textures/tex_verify_wall.png'))).toBe(true);
    expect(existsSync(path.join(root, 'public/assets/meshes/mesh_verify_cube.glb'))).toBe(true);
    expect(existsSync(path.join(root, 'public/assets/materials/mat_verify_wall.json'))).toBe(true);

    const mat = JSON.parse(readFileSync(
      path.join(root, 'public/assets/materials/mat_verify_wall.json'),
      'utf8',
    ));
    expect(mat.baseColorMapId).toBe('tex_verify_wall');
  });

  it('mesh scale validation stays meters↔100eu with no arbitrary rescale', () => {
    const meta = {
      unitAssumption: 'meters',
      editorUnitsPerMeter: 100,
      boundingBoxMeters: { x: 1, y: 1, z: 1 },
    };
    expect(validateMeshScale(meta).ok).toBe(true);
    expect(metersToEditorSize(meta.boundingBoxMeters)).toEqual({ x: 100, y: 100, z: 100 });
    expect(toMeters(100)).toBe(1);
  });

  it('level save/reload keeps material + mesh refs and transforms', () => {
    const world = new World({ name: 'Persist', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'wall',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: -300 } }),
      components: [new BrushComponent({
        id: 'bw',
        size: { x: 600, y: 300, z: 20 },
        materialId: 'mat_verify_wall',
      })],
    }));
    world.addActor(createStaticMeshActor({
      assetId: 'mesh_verify_cube',
      name: 'Verify Cube',
      position: { x: 100, y: 50, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      collidable: true,
      collisionType: 'box',
      gridSize: 25,
    }));
    // Force stable id for assertion
    const meshActor = world.actors.find((a) => a.getComponent('StaticMesh'));
    meshActor.id = 'prop_cube';

    const json = serializeLevel(world);
    const restored = deserializeLevel(json);

    expect(restored.getActor('wall').getComponent('Brush').materialId).toBe('mat_verify_wall');
    const mesh = restored.getActor('prop_cube').getComponent('StaticMesh');
    expect(mesh.assetId).toBe('mesh_verify_cube');
    expect(mesh.collisionType).toBe('box');
    expect(restored.getActor('prop_cube').transform.position).toEqual({ x: 100, y: 50, z: 0 });
    expect(serializeLevel(restored)).toEqual(json);
  });
});

describe('Gate 3 — physics box colliders for imported meshes', () => {
  it('builds Rapier box colliders for StaticMesh when explicitly enabled', async () => {
    const world = new World({ name: 'Phys', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'floor',
      transform: new Transform({ position: { x: 0, y: 10, z: 0 } }),
      components: [new BrushComponent({
        id: 'bf',
        size: { x: 600, y: 20, z: 600 },
        collidable: true,
      })],
    }));
    world.addActor(new Actor({
      id: 'crate',
      transform: new Transform({
        position: { x: 0, y: 100, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      }),
      components: [new StaticMeshComponent({
        id: 'sm',
        assetId: 'mesh_verify_cube',
        collidable: true,
        collisionType: 'box',
      })],
    }));
    world.addActor(new Actor({
      id: 'ghost',
      transform: new Transform({ position: { x: 200, y: 100, z: 0 } }),
      components: [new StaticMeshComponent({
        id: 'sm2',
        assetId: 'mesh_verify_cube',
        collidable: false,
        collisionType: 'none',
      })],
    }));

    const physics = new PhysicsWorld();
    await physics.init();
    physics.buildFromWorld(world);

    expect(physics._bodies.has('floor')).toBe(true);
    expect(physics._bodies.has('crate')).toBe(true);
    expect(physics._bodies.has('ghost')).toBe(false);

    const crateBody = physics._bodies.get('crate').body;
    const t = crateBody.translation();
    expect(t.x).toBeCloseTo(0, 5);
    expect(t.y).toBeCloseTo(1, 5); // 100 eu → 1 m
    expect(t.z).toBeCloseTo(0, 5);

    physics.dispose();
  });
});

describe('Gate 4 — editor stability (history / authored content)', () => {
  it('undo/redo restores material and transform without dropping actors', () => {
    const world = new World({ name: 'Stab', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'a',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [new BrushComponent({ id: 'b', materialId: null })],
    }));
    const history = new HistoryStack();

    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'a',
      before: { materialId: null },
      after: { materialId: 'mat_verify_wall' },
    }));
    expect(world.getActor('a').getComponent('Brush').materialId).toBe('mat_verify_wall');

    const beforeT = world.getActor('a').transform.toJSON();
    const afterT = structuredClone(beforeT);
    afterT.position.x = 100;
    history.execute(new SetTransformsCommand({
      world,
      changes: [{ actorId: 'a', before: beforeT, after: afterT }],
    }));
    expect(world.getActor('a').transform.position.x).toBe(100);

    history.undo();
    expect(world.getActor('a').transform.position.x).toBe(0);
    history.undo();
    expect(world.getActor('a').getComponent('Brush').materialId).toBeNull();
    history.redo();
    expect(world.getActor('a').getComponent('Brush').materialId).toBe('mat_verify_wall');
    expect(world.actors.length).toBe(1);
  });

  it('play snapshot restore pattern keeps authored actors intact', () => {
    const world = deserializeLevel(JSON.parse(
      readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8'),
    ));
    const authored = serializeLevel(world);

    // Simulate play-time mutation
    world.getActor('actor_floor').transform.position.y = 999;
    world.addActor(new Actor({
      id: 'runtime_only',
      name: 'Temp',
      components: [new LightComponent({ id: 'tmp' })],
    }));

    const restored = deserializeLevel(authored);
    expect(restored.getActor('actor_floor').transform.position.y).toBe(10);
    expect(restored.getActor('runtime_only')).toBeFalsy();
    expect(restored.actors.length).toBe(authored.actors.length);
  });

  it('add/remove actors via history leaves world consistent', () => {
    const world = new World({ name: 'Dock', schemaVersion: 1 });
    const history = new HistoryStack();
    const actorJson = new Actor({
      id: 'light1',
      name: 'Point Light',
      components: [new LightComponent({ id: 'cl', lightType: 'point' })],
    }).toJSON();

    history.execute(new AddActorsCommand({ world, actorsJson: [actorJson] }));
    expect(world.getActor('light1')).toBeTruthy();
    history.execute(new RemoveActorsCommand({ world, actorIds: ['light1'] }));
    expect(world.getActor('light1')).toBeFalsy();
    history.undo();
    expect(world.getActor('light1')?.getComponent('Light').lightType).toBe('point');
  });
});

function extent(uvAttr, start, end, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i < end; i += 1) {
    const v = axis === 'x' ? uvAttr.getX(i) : uvAttr.getY(i);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return max - min;
}
