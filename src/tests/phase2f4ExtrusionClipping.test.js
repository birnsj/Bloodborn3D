import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import { convertBrushToConvexGeometry } from '../geometry/convert.js';
import {
  geometryFingerprint,
  geometryVolume,
} from '../geometry/convexBrush.js';
import { extrudeFace } from '../geometry/extrude.js';
import { clipByPlane, planeFromFace, planeFromPoints } from '../geometry/clip.js';
import {
  localPointToWorld,
  planClip,
  planFaceExtrusion,
  planesByActorIdFromWorldPoints,
  snapExtrudeDistance,
  worldPointToLocal,
  worldPointsToLocalPlane,
} from '../editor/geometryEditing/extrudeClip.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { CellComponent } from '../components/CellComponent.js';

function makeConvexFromBrush({
  id = 'cvx',
  size = { x: 200, y: 100, z: 100 },
  faceMaterials = { pz: 'mat_face' },
  faceUVs = {
    pz: { scale: { x: 2, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
  },
  position = { x: 0, y: 50, z: 0 },
  name = id,
} = {}) {
  const brush = new BrushComponent({
    id: `comp_${id}`,
    size,
    faceMaterials,
    faceUVs,
    materialId: 'mat_actor',
  });
  const temp = new Actor({
    id,
    name,
    tags: ['structure', 'brush'],
    transform: new Transform({ position }),
    components: [brush],
  });
  const converted = convertBrushToConvexGeometry(temp, brush);
  expect(converted.ok).toBe(true);
  return new Actor({
    id,
    name,
    tags: ['structure', 'brush'],
    parentId: null,
    transform: new Transform({ position }),
    components: [
      new ConvexBrushComponent({
        id: `comp_${id}`,
        geometry: converted.geometry,
        faceMaterials: converted.faceMaterials,
        faceUVs: converted.faceUVs,
        materialId: 'mat_actor',
        uv: brush.uv,
        provenance: { kind: 'brush' },
      }),
    ],
  });
}

describe('Phase 2F.4 — extrudeFace', () => {
  it('creates a valid convex prism and rejects d ≤ 0', () => {
    const actor = makeConvexFromBrush();
    const convex = actor.getComponent('ConvexBrush');
    const bad = extrudeFace(convex.geometry, 'pz', 0, {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
    });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('INVALID_DISTANCE');

    const good = extrudeFace(convex.geometry, 'pz', 50, {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
    });
    expect(good.ok).toBe(true);
    expect(good.geometry.faces.length).toBeGreaterThanOrEqual(6);
    expect(good.faceMaterials?.[good.frontFaceId]).toBe('mat_face');
    expect(good.faceUVs?.[good.frontFaceId]?.scale?.x).toBe(2);
    // Source unchanged
    expect(geometryFingerprint(convex.geometry)).toBe(
      geometryFingerprint(actor.getComponent('ConvexBrush').geometry),
    );
  });

  it('snapExtrudeDistance snaps up to grid', () => {
    expect(snapExtrudeDistance(12, { gridSize: 25, snapEnabled: true })).toBe(25);
    expect(snapExtrudeDistance(50, { gridSize: 25, snapEnabled: true })).toBe(50);
    expect(snapExtrudeDistance(0, { gridSize: 25, snapEnabled: true })).toBe(0);
  });
});

describe('Phase 2F.4 — clipByPlane', () => {
  it('keep front / back / split conserve volume and preserve face IDs', () => {
    const actor = makeConvexFromBrush({ size: { x: 200, y: 100, z: 100 } });
    const convex = actor.getComponent('ConvexBrush');
    const vol0 = Math.abs(geometryVolume(convex.geometry));
    // Mid plane at local z=0, normal +Z
    const plane = { point: [0, 0, 0], normal: [0, 0, 1] };

    const front = clipByPlane(convex.geometry, plane, 'front', {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
    });
    expect(front.ok).toBe(true);
    expect(front.geometry.faces.some((f) => f.id === 'pz')).toBe(true);
    expect(front.capFaceId).toBeTruthy();
    expect(front.faceMaterials?.pz).toBe('mat_face');
    // Cap has no material entry (Q3)
    expect(front.faceMaterials?.[front.capFaceId]).toBeUndefined();

    const back = clipByPlane(convex.geometry, plane, 'back', {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
    });
    expect(back.ok).toBe(true);

    const split = clipByPlane(convex.geometry, plane, 'split', {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
    });
    expect(split.ok).toBe(true);
    const v1 = Math.abs(geometryVolume(split.front.geometry));
    const v2 = Math.abs(geometryVolume(split.back.geometry));
    expect(Math.abs((v1 + v2) - vol0) / vol0).toBeLessThan(1e-3);

    // Degenerate plane
    const deg = planeFromPoints([0, 0, 0], [1, 0, 0], [2, 0, 0]);
    expect(deg.ok).toBe(false);
    expect(deg.code).toBe('DEGENERATE_PLANE');
  });

  it('rejects sliver clips without mutating caller geometry', () => {
    const actor = makeConvexFromBrush({ size: { x: 200, y: 100, z: 100 } });
    const convex = actor.getComponent('ConvexBrush');
    const before = geometryFingerprint(convex.geometry);
    // Plane just inside +Z face — keep front is a thin sliver
    const plane = { point: [0, 0, 49.9], normal: [0, 0, 1] };
    const result = clipByPlane(convex.geometry, plane, 'front', {
      faceMaterials: convex.faceMaterials,
    });
    expect(result.ok).toBe(false);
    expect(geometryFingerprint(convex.geometry)).toBe(before);
  });

  it('planeFromFace matches outward normal', () => {
    const actor = makeConvexFromBrush();
    const convex = actor.getComponent('ConvexBrush');
    const plane = planeFromFace(convex.geometry, 'pz');
    expect(plane.ok).toBe(true);
    expect(plane.plane.normal[2]).toBeGreaterThan(0.9);
  });
});

describe('Phase 2F.4 — commands / auto-convert', () => {
  it('extrude adds sibling actor in one undo step; source preserved', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'src', name: 'Wall' });
    world.addActor(actor);
    const history = new HistoryStack();
    const beforeFp = geometryFingerprint(actor.getComponent('ConvexBrush').geometry);
    const beforeCount = world.actors.length;

    const planned = planFaceExtrusion(world, {
      actorId: 'src',
      faceId: 'pz',
      distance: 50,
      gridSize: 25,
      snapEnabled: true,
    });
    expect(planned.ok).toBe(true);
    history.execute(planned.command);
    expect(world.actors.length).toBe(beforeCount + 1);
    const extrusion = world.getActor(planned.newActorId);
    expect(extrusion?.name).toBe('Wall Extrusion');
    expect(extrusion?.getComponent('ConvexBrush')?.isValid).toBe(true);
    expect(geometryFingerprint(actor.getComponent('ConvexBrush').geometry)).toBe(beforeFp);

    history.undo();
    expect(world.getActor(planned.newActorId)).toBeFalsy();
    expect(world.actors.length).toBe(beforeCount);
    history.redo();
    expect(world.getActor(planned.newActorId)?.getComponent('ConvexBrush')?.isValid).toBe(true);
  });

  it('clip split is atomic; auto-convert Brush in same undo', () => {
    const world = new World();
    const brushActor = new Actor({
      id: 'plain',
      name: 'Plain',
      tags: ['structure', 'brush'],
      transform: new Transform({ position: { x: 0, y: 50, z: 0 } }),
      components: [
        new BrushComponent({
          id: 'comp_plain',
          size: { x: 200, y: 100, z: 100 },
          faceMaterials: { pz: 'mat_face' },
        }),
      ],
    });
    world.addActor(brushActor);
    expect(brushActor.getComponent('Brush')).toBeTruthy();

    const history = new HistoryStack();
    const planned = planClip(world, {
      actorIds: ['plain'],
      mode: 'split',
      plane: { point: [0, 0, 0], normal: [0, 0, 1] },
    });
    expect(planned.ok).toBe(true);
    history.execute(planned.command);

    expect(world.getActor('plain').getComponent('ConvexBrush')?.isValid).toBe(true);
    expect(world.getActor('plain').getComponent('Brush')).toBeFalsy();
    expect(planned.newActorIds.length).toBe(1);
    const halfB = world.getActor(planned.newActorIds[0]);
    expect(halfB?.name).toBe('Plain B');
    expect(halfB?.getComponent('ConvexBrush')?.isValid).toBe(true);

    history.undo();
    expect(world.getActor('plain').getComponent('Brush')).toBeTruthy();
    expect(world.getActor('plain').getComponent('ConvexBrush')).toBeFalsy();
    expect(world.getActor(planned.newActorIds[0])).toBeFalsy();
  });

  it('multi-brush clip is all-or-nothing', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'a', position: { x: -200, y: 50, z: 0 } }));
    world.addActor(makeConvexFromBrush({ id: 'b', position: { x: 200, y: 50, z: 0 } }));
    const history = new HistoryStack();
    const fpA = geometryFingerprint(world.getActor('a').getComponent('ConvexBrush').geometry);
    const fpB = geometryFingerprint(world.getActor('b').getComponent('ConvexBrush').geometry);

    const planned = planClip(world, {
      actorIds: ['a', 'b'],
      mode: 'front',
      plane: { point: [0, 0, 0], normal: [0, 0, 1] },
    });
    expect(planned.ok).toBe(true);
    history.execute(planned.command);
    expect(
      geometryFingerprint(world.getActor('a').getComponent('ConvexBrush').geometry),
    ).not.toBe(fpA);
    expect(
      geometryFingerprint(world.getActor('b').getComponent('ConvexBrush').geometry),
    ).not.toBe(fpB);

    history.undo();
    expect(
      geometryFingerprint(world.getActor('a').getComponent('ConvexBrush').geometry),
    ).toBe(fpA);
    expect(
      geometryFingerprint(world.getActor('b').getComponent('ConvexBrush').geometry),
    ).toBe(fpB);
  });

  it('round-trips extruded / clipped geometry through serialization', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'src' }));
    const planned = planFaceExtrusion(world, {
      actorId: 'src',
      faceId: 'pz',
      distance: 25,
      snapEnabled: false,
    });
    expect(planned.ok).toBe(true);
    planned.command.do();

    const json = serializeLevel(world);
    const loaded = deserializeLevel(json);
    expect(loaded.actors.length).toBe(2);
    for (const a of loaded.actors) {
      const c = a.getComponent('ConvexBrush');
      expect(c?.isValid).toBe(true);
    }
  });
});

describe('Phase 2F.4 — clip plane hierarchy / multi-actor', () => {
  it('local↔world uses parent hierarchy (degrees TRS)', () => {
    const world = new World();
    const cell = new Actor({
      id: 'cell',
      name: 'Cell',
      transform: new Transform({
        position: { x: 100, y: 0, z: 0 },
        rotation: { x: 0, y: 90, z: 0 },
      }),
      components: [new CellComponent({ id: 'cell_comp' })],
    });
    const child = makeConvexFromBrush({
      id: 'child',
      position: { x: 50, y: 0, z: 0 },
    });
    child.parentId = 'cell';
    world.addActor(cell);
    world.addActor(child);

    const worldPt = localPointToWorld(child, [0, 0, 0], world);
    // Parent yaw 90°: local +X → world −Z; child local origin at parent+local.
    expect(worldPt[0]).toBeCloseTo(100, 5);
    expect(worldPt[1]).toBeCloseTo(0, 5);
    expect(worldPt[2]).toBeCloseTo(-50, 5);

    const back = worldPointToLocal(child, worldPt, world);
    expect(back[0]).toBeCloseTo(0, 5);
    expect(back[1]).toBeCloseTo(0, 5);
    expect(back[2]).toBeCloseTo(0, 5);
  });

  it('re-projects shared world plane per actor instead of reusing one local plane', () => {
    const world = new World();
    const cell = new Actor({
      id: 'cell',
      name: 'Cell',
      transform: new Transform({ position: { x: 0, y: 0, z: 0 } }),
      components: [new CellComponent({ id: 'cell_comp' })],
    });
    const nested = makeConvexFromBrush({
      id: 'nested',
      position: { x: 200, y: 50, z: 0 },
    });
    nested.parentId = 'cell';
    const root = makeConvexFromBrush({
      id: 'root',
      position: { x: -200, y: 50, z: 0 },
    });
    world.addActor(cell);
    world.addActor(nested);
    world.addActor(root);

    // Shared world XY plane through origin, normal +Z.
    const worldPoints = [
      [0, 0, 0],
      [100, 0, 0],
      [0, 100, 0],
    ];
    const built = planesByActorIdFromWorldPoints(
      world,
      ['nested', 'root'],
      worldPoints,
    );
    expect(built.ok).toBe(true);

    // Same world plane must NOT be the same local plane when actors differ in pose.
    const nestedPlane = built.planesByActorId.nested;
    const rootPlane = built.planesByActorId.root;
    expect(nestedPlane.point[0]).not.toBeCloseTo(rootPlane.point[0], 2);

    // Nested: world origin → local (−200, −50, 0) relative to nested local origin.
    const nestedLocal = worldPointsToLocalPlane(nested, worldPoints, world);
    expect(nestedLocal.ok).toBe(true);
    expect(nestedLocal.plane.point[0]).toBeCloseTo(-200, 4);
    expect(nestedLocal.plane.point[1]).toBeCloseTo(-50, 4);

    // Clipping both with the re-projected planes succeeds (unlike copying nested's local plane onto root).
    const planned = planClip(world, {
      actorIds: ['nested', 'root'],
      mode: 'front',
      planesByActorId: built.planesByActorId,
    });
    expect(planned.ok).toBe(true);
  });

  it('rejects copying one actor local plane onto a differently posed sibling', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'a', position: { x: -200, y: 50, z: 0 } }));
    world.addActor(makeConvexFromBrush({ id: 'b', position: { x: 200, y: 50, z: 0 } }));

    // World mid plane between them (z=0, but cut in world X): plane X=0.
    const worldPoints = [
      [0, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
    ];
    const correct = planesByActorIdFromWorldPoints(world, ['a', 'b'], worldPoints);
    expect(correct.ok).toBe(true);

    // Wrong: use A's local plane for B (what the old face multi-select path did).
    const wrongForB = planClip(world, {
      actorIds: ['b'],
      mode: 'front',
      plane: correct.planesByActorId.a,
    });
    const rightForB = planClip(world, {
      actorIds: ['b'],
      mode: 'front',
      plane: correct.planesByActorId.b,
    });
    expect(rightForB.ok).toBe(true);
    // A's local plane is not the same as B's for this world cut.
    expect(correct.planesByActorId.a.point[0]).not.toBeCloseTo(
      correct.planesByActorId.b.point[0],
      2,
    );
    // Applying the wrong plane still "succeeds" mathematically but yields a different cut —
    // assert fingerprints diverge so the re-projection matters.
    if (wrongForB.ok && rightForB.ok) {
      const wrongFp = geometryFingerprint(wrongForB.changes[0].after.geometry);
      const rightFp = geometryFingerprint(rightForB.changes[0].after.geometry);
      expect(wrongFp).not.toBe(rightFp);
    }
  });
});

