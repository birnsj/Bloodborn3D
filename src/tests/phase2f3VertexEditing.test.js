import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import { convertBrushToConvexGeometry } from '../geometry/convert.js';
import {
  createGeometryFromParts,
  geometryFingerprint,
} from '../geometry/convexBrush.js';
import {
  moveVertices,
  vertexFaceDegree,
} from '../geometry/edits.js';
import {
  emptyGeometrySelection,
  nextGeometrySelectionAfterActorChange,
  normalizeGeometrySelection,
  remappedGeometrySelection,
  shouldApplyGeometryEdit,
  toggleGeometryItem,
} from '../editor/geometryEditing/geometrySelection.js';
import {
  applyGeometryMove,
  snapWorldDelta,
} from '../editor/geometryEditing/faceMove.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetConvexGeometryCommand } from '../editor/history/commands.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { duplicateActors } from '../editor/brushFactory.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
} from '../prefabs/prefabOps.js';

function makeConvexFromBrush({
  id = 'cvx_a',
  size = { x: 200, y: 100, z: 100 },
  faceMaterials = { pz: 'mat_face', px: 'mat_side' },
  faceUVs = {
    pz: { scale: { x: 2, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
  },
  position = { x: 0, y: 50, z: 0 },
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
    name: id,
    tags: ['structure', 'brush'],
    transform: new Transform({ position }),
    components: [brush],
  });
  const converted = convertBrushToConvexGeometry(temp, brush);
  expect(converted.ok).toBe(true);
  return new Actor({
    id,
    name: id,
    tags: ['structure', 'brush'],
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

/** Square pyramid — apex has face degree 4. */
function makePyramidActor(id = 'pyramid') {
  // Outward winding (CCW from outside): base ny, then four slopes.
  const geometry = createGeometryFromParts(
    [
      { id: 'v0', p: [-50, 0, -50] },
      { id: 'v1', p: [50, 0, -50] },
      { id: 'v2', p: [50, 0, 50] },
      { id: 'v3', p: [-50, 0, 50] },
      { id: 'v4', p: [0, 80, 0] },
    ],
    [
      { id: 'f0', loop: ['v0', 'v1', 'v2', 'v3'], proj: 'ny' },
      { id: 'f1', loop: ['v1', 'v0', 'v4'], proj: 'nz' },
      { id: 'f2', loop: ['v2', 'v1', 'v4'], proj: 'px' },
      { id: 'f3', loop: ['v3', 'v2', 'v4'], proj: 'pz' },
      { id: 'f4', loop: ['v0', 'v3', 'v4'], proj: 'nx' },
    ],
    [0, 0, 0],
  );
  return new Actor({
    id,
    name: id,
    tags: ['structure', 'brush'],
    transform: new Transform({ position: { x: 300, y: 0, z: 0 } }),
    components: [
      new ConvexBrushComponent({
        id: `comp_${id}`,
        geometry,
        faceMaterials: { f1: 'mat_slope' },
        provenance: { kind: 'extrude' },
      }),
    ],
  });
}

describe('Phase 2F.3 — vertex selection', () => {
  it('toggles single and multi vertex selection', () => {
    let sel = emptyGeometrySelection('vertex');
    sel = toggleGeometryItem(sel, { actorId: 'a', id: 'v0', mode: 'vertex' });
    expect(sel.mode).toBe('vertex');
    expect(sel.items).toEqual([{ actorId: 'a', ids: ['v0'] }]);

    sel = toggleGeometryItem(sel, {
      actorId: 'a',
      id: 'v1',
      mode: 'vertex',
      additive: true,
    });
    expect(sel.items[0].ids.sort()).toEqual(['v0', 'v1']);

    sel = toggleGeometryItem(sel, {
      actorId: 'b',
      id: 'v2',
      mode: 'vertex',
      additive: true,
    });
    expect(sel.items).toHaveLength(2);
  });

  it('drops stale vertex ids', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const live = actor.getComponent('ConvexBrush').geometry.vertices[0].id;
    const sel = normalizeGeometrySelection({
      mode: 'vertex',
      items: [
        { actorId: 'a', ids: [live, 'v999'] },
        { actorId: 'gone', ids: [live] },
      ],
    });
    const next = nextGeometrySelectionAfterActorChange(sel, ['a'], world);
    expect(next.items).toEqual([{ actorId: 'a', ids: [live] }]);
  });

  it('shouldApplyGeometryEdit rejects stale vertex ids', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'a' }));
    expect(shouldApplyGeometryEdit({
      tool: 'geometry',
      geometrySelection: normalizeGeometrySelection({
        mode: 'vertex',
        items: [{ actorId: 'a', ids: ['missing'] }],
        primary: { actorId: 'a', id: 'missing' },
      }),
      world,
    })).toBe(false);
  });

  it('remaps vertex selection by dropping lost verts', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const vid = actor.getComponent('ConvexBrush').geometry.vertices[0].id;
    const sel = normalizeGeometrySelection({
      mode: 'vertex',
      items: [{ actorId: 'a', ids: [vid] }],
    });
    expect(remappedGeometrySelection(sel, world, null).items[0].ids).toEqual([vid]);
  });
});

describe('Phase 2F.3 — vertex moveVertices', () => {
  it('moves a vertex and preserves materials / UVs', () => {
    const actor = makeConvexFromBrush();
    const convex = actor.getComponent('ConvexBrush');
    const vid = convex.geometry.vertices.find((v) => v.p[0] > 0 && v.p[1] > 0 && v.p[2] > 0).id;
    const beforeFp = geometryFingerprint(convex.geometry);
    const result = moveVertices(convex.geometry, [vid], [10, 0, 0], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: [vid],
    });
    expect(result.ok).toBe(true);
    expect(result.faceMaterials.pz).toBe('mat_face');
    expect(result.faceUVs.pz.scale.x).toBe(2);
    expect(geometryFingerprint(result.geometry)).not.toBe(beforeFp);
    // Vertex id preserved.
    expect(result.geometry.vertices.some((v) => v.id === vid)).toBe(true);
  });

  it('supports degree ≥ 4 apex moves on a pyramid', () => {
    const actor = makePyramidActor();
    const convex = actor.getComponent('ConvexBrush');
    expect(vertexFaceDegree(convex.geometry, 'v4')).toBe(4);
    const result = moveVertices(convex.geometry, ['v4'], [0, 10, 0], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: ['v4'],
    });
    expect(result.ok).toBe(true);
    expect(result.geometry.vertices.find((v) => v.id === 'v4').p[1]).toBeCloseTo(90, 3);
    expect(result.faceMaterials.f1).toBe('mat_slope');
  });

  it('rejects interior / collapsing vertex moves without mutating caller', () => {
    const actor = makeConvexFromBrush({ size: { x: 40, y: 40, z: 40 } });
    const convex = actor.getComponent('ConvexBrush');
    const before = structuredClone(convex.geometry);
    const beforeFp = geometryFingerprint(before);
    const corner = convex.geometry.vertices[0];
    const toward = [-corner.p[0] * 0.95, -corner.p[1] * 0.95, -corner.p[2] * 0.95];
    const result = moveVertices(convex.geometry, [corner.id], toward, {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: [corner.id],
    });
    expect(result.ok).toBe(false);
    expect(['INTERIOR_VERTEX', 'UNSELECTED_VERTEX_LOST', 'NON_CONVEX', 'VERTEX_MERGE', 'MIN_VOLUME', 'MIN_THICKNESS', 'MIN_EDGE', 'MIN_FACE_AREA']).toContain(result.code);
    expect(geometryFingerprint(convex.geometry)).toBe(beforeFp);
    expect(JSON.stringify(convex.geometry)).toBe(JSON.stringify(before));
  });

  it('rejects vertex merge (coincident) without mutating caller', () => {
    const actor = makeConvexFromBrush({ size: { x: 40, y: 40, z: 40 } });
    const convex = actor.getComponent('ConvexBrush');
    const beforeFp = geometryFingerprint(convex.geometry);
    const a = convex.geometry.vertices[0];
    const b = convex.geometry.vertices[1];
    const delta = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const result = moveVertices(convex.geometry, [a.id], delta, {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: [a.id],
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VERTEX_MERGE');
    expect(geometryFingerprint(convex.geometry)).toBe(beforeFp);
  });

  it('applyGeometryMove is atomic across actors for vertices', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a' });
    const b = makeConvexFromBrush({ id: 'b', position: { x: 400, y: 50, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    const va = a.getComponent('ConvexBrush').geometry.vertices[0].id;
    const vb = b.getComponent('ConvexBrush').geometry.vertices[0].id;
    const sel = normalizeGeometrySelection({
      mode: 'vertex',
      items: [
        { actorId: 'a', ids: [va] },
        { actorId: 'b', ids: [vb] },
      ],
      primary: { actorId: 'a', id: va },
    });
    const result = applyGeometryMove(world, sel, [0, 10, 0]);
    expect(result.ok).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('grid snap uses the selected vertex as anchor', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a' });
    world.addActor(a);
    const vid = a.getComponent('ConvexBrush').geometry.vertices[0].id;
    const sel = normalizeGeometrySelection({
      mode: 'vertex',
      items: [{ actorId: 'a', ids: [vid] }],
      primary: { actorId: 'a', id: vid },
    });
    const snapped = snapWorldDelta(world, sel, 'y', 13, null, 10, true);
    expect(snapped.deltaEditor % 10).toBe(0);
  });
});

describe('Phase 2F.3 — undo / persistence for vertices', () => {
  it('one SetConvexGeometryCommand undoes and redoes a vertex move', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const convex = actor.getComponent('ConvexBrush');
    const before = {
      geometry: structuredClone(convex.geometry),
      faceMaterials: structuredClone(convex.faceMaterials),
      faceUVs: structuredClone(convex.faceUVs),
    };
    const vid = convex.geometry.vertices[0].id;
    const moved = moveVertices(convex.geometry, [vid], [0, 10, 0], {
      faceMaterials: before.faceMaterials,
      faceUVs: before.faceUVs,
      selectedVertexIds: [vid],
    });
    expect(moved.ok).toBe(true);
    const after = {
      geometry: moved.geometry,
      faceMaterials: moved.faceMaterials,
      faceUVs: moved.faceUVs,
    };
    const history = new HistoryStack();
    history.execute(new SetConvexGeometryCommand({
      world,
      changes: [{ actorId: 'a', before, after }],
      label: 'Move vertices',
    }));
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
    history.undo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(before.geometry));
    history.redo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
  });

  it('survives save/load, duplicate, and prefab round-trip', () => {
    const world = new World();
    world.addActor(makePyramidActor('pyr'));
    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(3);
    const loaded = deserializeLevel(json);
    expect(loaded.getActor('pyr').getComponent('ConvexBrush').isValid).toBe(true);
    expect(vertexFaceDegree(loaded.getActor('pyr').getComponent('ConvexBrush').geometry, 'v4')).toBe(4);

    const copies = duplicateActors([loaded.getActor('pyr')]);
    expect(copies[0].getComponent('ConvexBrush').isValid).toBe(true);

    const created = createPrefabFromActors(loaded, ['pyr'], { name: 'VertexPyr' });
    expect(created.ok).toBe(true);
    const nested = new World({ name: 'nested', schemaVersion: 2 });
    instantiatePrefab(created.definition, nested, { name: 'Instance' });
    expect(nested.actors.some((a) => a.getComponent('ConvexBrush')?.isValid)).toBe(true);
  });
});
