import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import { createComponentFromJSON } from '../components/componentRegistry.js';
import {
  createGeometryFromParts,
  geometryFingerprint,
  geometryVolume,
} from '../geometry/convexBrush.js';
import { convertBrushToConvexGeometry, convertEligibility } from '../geometry/convert.js';
import { buildConvexHull } from '../geometry/hull.js';
import { validateGeometry } from '../geometry/validate.js';
import { findConvexBrushCutterConflicts } from '../geometry/cutterIntersection.js';
import { densityUvOnProjection } from '../geometry/uvProjection.js';
import { createBrushBoxGeometry } from '../runtime/brushGeometry.js';
import { createConvexBrushGeometry } from '../runtime/convexBrushGeometry.js';
import { densityUvOnBrushFace } from '../rules/alignSurfaces.js';
import {
  HistoryStack,
} from '../editor/history/HistoryStack.js';
import {
  ConvertBrushToConvexCommand,
} from '../editor/history/commands.js';
import {
  LEVEL_SCHEMA_VERSION,
  LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX,
  serializeLevel,
  schemaVersionForWorld,
} from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
} from '../prefabs/prefabOps.js';
import { duplicateActors } from '../editor/brushFactory.js';
import { toMeters } from '../core/units.js';

function makeBrushActor({
  id = 'brush_a',
  size = { x: 200, y: 100, z: 40 },
  faceMaterials = null,
  faceUVs = null,
  openings = null,
  operation = 'add',
  miterStart = 0,
  miterEnd = 0,
  tags = ['structure', 'brush'],
  position = { x: 0, y: 50, z: 0 },
} = {}) {
  return new Actor({
    id,
    name: id,
    tags,
    transform: new Transform({ position }),
    components: [
      new BrushComponent({
        id: `comp_${id}`,
        size,
        faceMaterials,
        faceUVs,
        openings,
        operation,
        miterStart,
        miterEnd,
        materialId: 'mat_test',
        uv: { scale: { x: 1.25, y: 0.8 }, offset: { x: 0.1, y: -0.05 }, rotation: 15 },
      }),
    ],
  });
}

describe('Phase 2F.0 — convert Brush → ConvexBrush', () => {
  it('converts an AABB brush preserving face ids, materials, and UVs', () => {
    const actor = makeBrushActor({
      faceMaterials: { pz: 'mat_face', px: 'mat_side' },
      faceUVs: {
        pz: { scale: { x: 2, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
      },
    });
    const brush = actor.getComponent('Brush');
    const result = convertBrushToConvexGeometry(actor, brush, null);
    expect(result.ok).toBe(true);
    expect(result.geometry.faces.map((f) => f.id).sort()).toEqual(
      ['nx', 'ny', 'nz', 'px', 'py', 'pz'],
    );
    expect(result.faceMaterials).toEqual({ pz: 'mat_face', px: 'mat_side' });
    expect(result.faceUVs.pz.scale.x).toBe(2);

    const checked = validateGeometry(result.geometry, {
      faceMaterials: result.faceMaterials,
      faceUVs: result.faceUVs,
    });
    expect(checked.ok).toBe(true);
    expect(geometryVolume(result.geometry)).toBeCloseTo(200 * 100 * 40, 4);
  });

  it('matches Brush density UVs on each face (oracle)', () => {
    const size = { x: 200, y: 100, z: 40 };
    const actor = makeBrushActor({ size, faceMaterials: null, faceUVs: null });
    const brush = actor.getComponent('Brush');
    brush.uv = { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 };
    const result = convertBrushToConvexGeometry(actor, brush, null);
    expect(result.ok).toBe(true);

    const ref = createBrushBoxGeometry(size, {});
    const uvAttr = ref.attributes.uv;
    const posAttr = ref.attributes.position;
    // Sample one corner vertex per box face (4 verts × 6 faces).
    for (let face = 0; face < 6; face += 1) {
      const faceId = ['px', 'nx', 'py', 'ny', 'pz', 'nz'][face];
      for (let i = 0; i < 4; i += 1) {
        const idx = face * 4 + i;
        const local = {
          x: posAttr.getX(idx) * 100,
          y: posAttr.getY(idx) * 100,
          z: posAttr.getZ(idx) * 100,
        };
        const [du, dv] = densityUvOnBrushFace(faceId, local, size);
        const [cu, cv] = densityUvOnProjection(
          [local.x, local.y, local.z],
          faceId,
          { size },
        );
        expect(cu).toBeCloseTo(du, 5);
        expect(cv).toBeCloseTo(dv, 5);
        expect(cu).toBeCloseTo(uvAttr.getX(idx), 4);
        expect(cv).toBeCloseTo(uvAttr.getY(idx), 4);
      }
    }
    ref.dispose();
  });

  it('rejects subtractive brushes, openings, and overlapping cutters', () => {
    const sub = makeBrushActor({ id: 'sub', operation: 'subtract' });
    expect(convertEligibility(sub, sub.getComponent('Brush')).code).toBe('SUBTRACT_BRUSH');

    const open = makeBrushActor({
      id: 'open',
      openings: [{
        id: 'o1', type: 'door', profile: 'rect',
        offset: 0, bottom: 0, width: 80, height: 200,
      }],
      tags: ['structure', 'brush', 'wall'],
      size: { x: 300, y: 300, z: 20 },
    });
    expect(convertEligibility(open, open.getComponent('Brush')).code).toBe('HAS_OPENINGS');

    const world = new World({ name: 'cut', schemaVersion: 2 });
    const target = makeBrushActor({ id: 'target', size: { x: 200, y: 200, z: 200 } });
    const cutter = makeBrushActor({
      id: 'cutter',
      operation: 'subtract',
      size: { x: 50, y: 50, z: 50 },
      position: { x: 0, y: 50, z: 0 },
    });
    world.addActor(target);
    world.addActor(cutter);
    const blocked = convertEligibility(target, target.getComponent('Brush'), world);
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('CUTTER_OVERLAP');
  });
});

describe('Phase 2F.0 — component + persistence', () => {
  it('round-trips ConvexBrush through serialize/deserialize', () => {
    const world = new World({ name: 'convex', schemaVersion: 2 });
    const actor = makeBrushActor({
      faceMaterials: { pz: 'mat_face' },
    });
    world.addActor(actor);
    const converted = convertBrushToConvexGeometry(actor, actor.getComponent('Brush'));
    const convex = new ConvexBrushComponent({
      id: actor.getComponent('Brush').id,
      geometry: converted.geometry,
      faceMaterials: converted.faceMaterials,
      faceUVs: converted.faceUVs,
      materialId: 'mat_test',
      uv: actor.getComponent('Brush').uv,
      provenance: converted.provenance,
    });
    actor.removeComponent(actor.getComponent('Brush'));
    actor.addComponent(convex);

    expect(schemaVersionForWorld(world)).toBe(LEVEL_SCHEMA_VERSION);
    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(3);

    const loaded = deserializeLevel(json);
    const loadedConvex = loaded.getActor('brush_a').getComponent('ConvexBrush');
    expect(loadedConvex).toBeTruthy();
    expect(loadedConvex.isValid).toBe(true);
    expect(geometryFingerprint(loadedConvex.geometry))
      .toBe(geometryFingerprint(convex.geometry));
    expect(loadedConvex.faceMaterials.pz).toBe('mat_face');

    // Levels without ConvexBrush still emit schema 2.
    const plain = new World({ name: 'plain', schemaVersion: 2 });
    plain.addActor(makeBrushActor({ id: 'plain_brush' }));
    expect(serializeLevel(plain).schemaVersion).toBe(LEVEL_SCHEMA_VERSION_WITHOUT_CONVEX);
  });

  it('undo restores a byte-identical Brush after convert', () => {
    const world = new World({ name: 'undo', schemaVersion: 2 });
    const actor = makeBrushActor({
      faceMaterials: { ny: 'mat_floor' },
      faceUVs: { ny: { scale: { x: 1.5, y: 1.5 }, offset: { x: 0, y: 0 }, rotation: 45 } },
    });
    world.addActor(actor);
    const brushJson = actor.getComponent('Brush').toJSON();
    const converted = convertBrushToConvexGeometry(actor, actor.getComponent('Brush'));
    const convex = new ConvexBrushComponent({
      id: brushJson.id,
      geometry: converted.geometry,
      faceMaterials: converted.faceMaterials,
      faceUVs: converted.faceUVs,
      materialId: brushJson.materialId,
      uv: brushJson.uv,
      color: brushJson.color,
      provenance: converted.provenance,
    });

    const history = new HistoryStack();
    history.execute(new ConvertBrushToConvexCommand({
      world,
      actorId: actor.id,
      brushJson,
      convexJson: convex.toJSON(),
    }));
    expect(world.getActor(actor.id).getComponent('Brush')).toBeFalsy();
    expect(world.getActor(actor.id).getComponent('ConvexBrush')).toBeTruthy();

    history.undo();
    const restored = world.getActor(actor.id).getComponent('Brush');
    expect(restored).toBeTruthy();
    expect(JSON.stringify(restored.toJSON())).toBe(JSON.stringify(brushJson));
  });

  it('duplicates and prefab-instantiates ConvexBrush including nested', () => {
    const world = new World({ name: 'prefab', schemaVersion: 2 });
    const actor = makeBrushActor({ id: 'src' });
    world.addActor(actor);
    const converted = convertBrushToConvexGeometry(actor, actor.getComponent('Brush'));
    actor.removeComponent(actor.getComponent('Brush'));
    actor.addComponent(new ConvexBrushComponent({
      id: 'comp_src',
      geometry: converted.geometry,
      faceMaterials: { pz: 'mat_wall' },
      provenance: converted.provenance,
    }));

    const copies = duplicateActors([actor]);
    expect(copies[0].getComponent('ConvexBrush').geometry.faces).toHaveLength(6);
    expect(copies[0].getComponent('ConvexBrush').faceMaterials.pz).toBe('mat_wall');

    const created = createPrefabFromActors(world, [actor.id], { name: 'Convex Prefab' });
    expect(created.ok).toBe(true);
    const def = created.definition;
    expect(def.actors[0].components.some((c) => c.type === 'ConvexBrush')).toBe(true);

    const nestedWorld = new World({ name: 'nested', schemaVersion: 2 });
    const placed = instantiatePrefab(def, nestedWorld, { name: 'Instance' });
    expect(placed.rootActorIds.length).toBeGreaterThan(0);
    const inst = nestedWorld.actors.find((a) => a.getComponent('ConvexBrush'));
    expect(inst).toBeTruthy();
    expect(inst.getComponent('ConvexBrush').isValid).toBe(true);

    // Nested: create a prefab that contains the instance as nested source.
    const outerCreated = createPrefabFromActors(nestedWorld, placed.rootActorIds, {
      name: 'Outer Nested',
      getDefinition: () => def,
    });
    expect(outerCreated.ok).toBe(true);
    expect(outerCreated.definition.nestedPrefabIds).toContain(def.id);

    const outerWorld = new World({ name: 'outer', schemaVersion: 2 });
    instantiatePrefab(outerCreated.definition, outerWorld, {
      name: 'Outer Inst',
      getDefinition: (id) => (id === def.id ? def : null),
    });
    const nestedConvex = outerWorld.actors.filter((a) => a.getComponent('ConvexBrush'));
    expect(nestedConvex.length).toBeGreaterThan(0);
    const level = serializeLevel(outerWorld);
    expect(level.schemaVersion).toBe(3);
    const reloaded = deserializeLevel(level);
    expect(reloaded.actors.some((a) => a.getComponent('ConvexBrush')?.isValid)).toBe(true);
  });

  it('reports cutter ∩ ConvexBrush conflicts after conversion', () => {
    const world = new World({ name: 'conflict', schemaVersion: 2 });
    const actor = makeBrushActor({ id: 'solid', size: { x: 200, y: 200, z: 200 } });
    world.addActor(actor);
    const converted = convertBrushToConvexGeometry(actor, actor.getComponent('Brush'));
    actor.removeComponent(actor.getComponent('Brush'));
    actor.addComponent(new ConvexBrushComponent({
      id: 'comp_solid',
      geometry: converted.geometry,
      provenance: converted.provenance,
    }));

    expect(findConvexBrushCutterConflicts(world)).toHaveLength(0);

    world.addActor(makeBrushActor({
      id: 'later_cutter',
      operation: 'subtract',
      size: { x: 40, y: 40, z: 40 },
      position: { x: 0, y: 50, z: 0 },
    }));
    const conflicts = findConvexBrushCutterConflicts(world);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].convexId).toBe('solid');
    expect(conflicts[0].cutterId).toBe('later_cutter');
  });

  it('loads invalid ConvexBrush geometry as disabled with preserved data', () => {
    const bad = createGeometryFromParts(
      [
        { id: 'v0', p: [0, 0, 0] },
        { id: 'v1', p: [1, 0, 0] },
        { id: 'v2', p: [0, 1, 0] },
      ],
      [{ id: 'f0', loop: ['v0', 'v1', 'v2'], proj: 'pz' }],
    );
    const comp = new ConvexBrushComponent({
      geometry: bad,
      faceMaterials: { f0: 'mat_x' },
    });
    expect(comp.isValid).toBe(false);
    expect(comp.enabled).toBe(false);
    expect(comp.invalidGeometry).toBeTruthy();
    expect(comp.geometryError?.code).toBeTruthy();
  });
});

describe('Phase 2F.0 — hull + validation', () => {
  it('builds a hull for a box and rejects concave point sets that leave interior verts', () => {
    const box = [
      { id: 'v0', p: [-1, -1, -1] },
      { id: 'v1', p: [1, -1, -1] },
      { id: 'v2', p: [1, 1, -1] },
      { id: 'v3', p: [-1, 1, -1] },
      { id: 'v4', p: [-1, -1, 1] },
      { id: 'v5', p: [1, -1, 1] },
      { id: 'v6', p: [1, 1, 1] },
      { id: 'v7', p: [-1, 1, 1] },
    ];
    const hull = buildConvexHull(box);
    expect(hull.ok).toBe(true);
    expect(hull.interior).toHaveLength(0);
    expect(hull.vertices.length).toBe(8);

    const withInterior = [
      ...box.map((v) => ({ ...v, p: v.p.map((c) => c * 50) })),
      { id: 'v8', p: [0, 0, 0] },
    ];
    const hull2 = buildConvexHull(withInterior);
    expect(hull2.ok).toBe(true);
    expect(hull2.interior).toContain('v8');
  });

  it('creates Three.js geometry with grouped surface ids', () => {
    const actor = makeBrushActor();
    const converted = convertBrushToConvexGeometry(actor, actor.getComponent('Brush'));
    const convex = new ConvexBrushComponent({
      geometry: converted.geometry,
      uv: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
    });
    const geom = createConvexBrushGeometry(convex);
    expect(geom).toBeTruthy();
    expect(geom.userData.surfaceIds).toEqual(
      expect.arrayContaining(['px', 'nx', 'py', 'ny', 'pz', 'nz']),
    );
    expect(geom.attributes.position.count).toBeGreaterThan(0);
    // Positions are in meters.
    expect(Math.abs(geom.attributes.position.getX(0))).toBeLessThanOrEqual(toMeters(100) + 1e-6);
    geom.dispose();
  });

  it('preserves parametric Brush JSON shape via fromJSON registry', () => {
    const brush = new BrushComponent({ size: { x: 10, y: 20, z: 30 } });
    const again = createComponentFromJSON(brush.toJSON());
    expect(again.type).toBe('Brush');
    expect(again.size).toEqual({ x: 10, y: 20, z: 30 });
  });
});
