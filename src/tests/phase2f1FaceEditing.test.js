import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import { convertBrushToConvexGeometry } from '../geometry/convert.js';
import { geometryFingerprint } from '../geometry/convexBrush.js';
import {
  averageFaceNormal,
  moveVertices,
  vertexIdsForFaces,
} from '../geometry/edits.js';
import {
  emptyGeometrySelection,
  nextGeometrySelectionAfterActorChange,
  normalizeGeometrySelection,
  remappedGeometrySelection,
  shouldApplyGeometryEdit,
  toggleGeometryItem,
  toolKeepsGeometrySelection,
} from '../editor/geometryEditing/geometrySelection.js';
import {
  applyFaceMove,
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
  size = { x: 200, y: 100, z: 40 },
  faceMaterials = { pz: 'mat_face' },
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

/** Wedge: tip of +Z face pulled toward -Z to make an angled roof-like prism. */
function makeAngledWedge(id = 'wedge') {
  const actor = makeConvexFromBrush({
    id,
    size: { x: 100, y: 100, z: 100 },
    position: { x: 300, y: 50, z: 0 },
  });
  const convex = actor.getComponent('ConvexBrush');
  // Move +Y top face's +Z edge vertices down… simpler: move py face along -Y partially
  // by moving only the two +Z vertices of py → creates a slanted top.
  const py = convex.geometry.faces.find((f) => f.id === 'py');
  const vids = py.loop.filter((vid) => {
    const v = convex.geometry.vertices.find((x) => x.id === vid);
    return v && v.p[2] > 0;
  });
  const moved = moveVertices(convex.geometry, vids, [0, -50, 0], {
    faceMaterials: convex.faceMaterials,
    faceUVs: convex.faceUVs,
    selectedVertexIds: vids,
  });
  expect(moved.ok).toBe(true);
  convex.geometry = moved.geometry;
  convex.faceMaterials = moved.faceMaterials;
  convex.faceUVs = moved.faceUVs;
  return actor;
}

describe('Phase 2F.1 — geometrySelection transitions', () => {
  it('clears when tool leaves geometry', () => {
    expect(toolKeepsGeometrySelection('geometry')).toBe(true);
    expect(toolKeepsGeometrySelection('select')).toBe(false);
    expect(toolKeepsGeometrySelection('surface')).toBe(false);
  });

  it('toggle single and multi-face selection', () => {
    let sel = emptyGeometrySelection('face');
    sel = toggleGeometryItem(sel, { actorId: 'a', id: 'px', mode: 'face' });
    expect(sel.items).toEqual([{ actorId: 'a', ids: ['px'] }]);
    expect(sel.primary).toEqual({ actorId: 'a', id: 'px' });

    sel = toggleGeometryItem(sel, {
      actorId: 'a',
      id: 'pz',
      mode: 'face',
      additive: true,
    });
    expect(sel.items[0].ids.sort()).toEqual(['px', 'pz']);

    sel = toggleGeometryItem(sel, {
      actorId: 'b',
      id: 'py',
      mode: 'face',
      additive: true,
    });
    expect(sel.items).toHaveLength(2);
  });

  it('drops items for deselected / missing actors and stale face ids', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);

    const sel = normalizeGeometrySelection({
      mode: 'face',
      items: [
        { actorId: 'a', ids: ['px', 'missing'] },
        { actorId: 'gone', ids: ['pz'] },
      ],
    });
    const next = nextGeometrySelectionAfterActorChange(sel, ['a'], world);
    expect(next.items).toEqual([{ actorId: 'a', ids: ['px'] }]);
  });

  it('shouldApplyGeometryEdit rejects stale face ids', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'a' }));
    const bad = normalizeGeometrySelection({
      mode: 'face',
      items: [{ actorId: 'a', ids: ['nope'] }],
      primary: { actorId: 'a', id: 'nope' },
    });
    expect(shouldApplyGeometryEdit({
      tool: 'geometry',
      geometrySelection: bad,
      world,
    })).toBe(false);
    const good = normalizeGeometrySelection({
      mode: 'face',
      items: [{ actorId: 'a', ids: ['px'] }],
      primary: { actorId: 'a', id: 'px' },
    });
    expect(shouldApplyGeometryEdit({
      tool: 'geometry',
      geometrySelection: good,
      world,
    })).toBe(true);
  });

  it('remaps selection after lineage-preserving edit', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const sel = normalizeGeometrySelection({
      mode: 'face',
      items: [{ actorId: 'a', ids: ['px'] }],
    });
    const next = remappedGeometrySelection(sel, world, null);
    expect(next.items[0].ids).toEqual(['px']);
  });
});

describe('Phase 2F.1 — moveVertices / face move', () => {
  it('moves a face along its normal on an AABB (equals resize)', () => {
    const actor = makeConvexFromBrush({
      size: { x: 200, y: 100, z: 40 },
    });
    const convex = actor.getComponent('ConvexBrush');
    const beforeFp = geometryFingerprint(convex.geometry);
    const vids = vertexIdsForFaces(convex.geometry, ['pz']);
    const n = averageFaceNormal(convex.geometry, ['pz']);
    expect(n[2]).toBeGreaterThan(0.9);

    const result = moveVertices(convex.geometry, vids, [0, 0, 10], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: vids,
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBe('fast');
    expect(result.faceMaterials.pz).toBe('mat_face');
    expect(result.faceUVs.pz.scale.x).toBe(2);
    expect(geometryFingerprint(result.geometry)).not.toBe(beforeFp);

    // Depth along Z grew by 10 (half-extents were ±20).
    const zs = result.geometry.vertices.map((v) => v.p[2]);
    expect(Math.max(...zs)).toBeCloseTo(30, 3);
    expect(Math.min(...zs)).toBeCloseTo(-20, 3);
  });

  it('rejects invalid moves without mutating caller geometry', () => {
    const actor = makeConvexFromBrush({
      size: { x: 40, y: 40, z: 40 },
    });
    const convex = actor.getComponent('ConvexBrush');
    const before = structuredClone(convex.geometry);
    const beforeFp = geometryFingerprint(before);
    // Pull a single corner deep inside → interior vertex / non-hull.
    const corner = convex.geometry.vertices[0];
    const toward = [-corner.p[0] * 0.9, -corner.p[1] * 0.9, -corner.p[2] * 0.9];
    const result = moveVertices(convex.geometry, [corner.id], toward, {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: [corner.id],
    });
    expect(result.ok).toBe(false);
    expect(geometryFingerprint(convex.geometry)).toBe(beforeFp);
    expect(JSON.stringify(convex.geometry)).toBe(JSON.stringify(before));
  });

  it('supports angled wedge geometry that remains valid', () => {
    const wedge = makeAngledWedge();
    const convex = wedge.getComponent('ConvexBrush');
    expect(convex.isValid).toBe(true);
    const vids = vertexIdsForFaces(convex.geometry, ['pz']);
    const result = moveVertices(convex.geometry, vids, [0, 0, 5], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: vids,
    });
    expect(result.ok).toBe(true);
  });

  it('applyFaceMove is atomic across multiple actors', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a', position: { x: 0, y: 50, z: 0 } });
    const b = makeConvexFromBrush({ id: 'b', position: { x: 400, y: 50, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    const sel = normalizeGeometrySelection({
      mode: 'face',
      items: [
        { actorId: 'a', ids: ['pz'] },
        { actorId: 'b', ids: ['pz'] },
      ],
      primary: { actorId: 'a', id: 'pz' },
    });
    const result = applyFaceMove(world, sel, [0, 0, 10]);
    expect(result.ok).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('grid snap lands on increments for axis moves', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a' });
    world.addActor(a);
    const sel = normalizeGeometrySelection({
      mode: 'face',
      items: [{ actorId: 'a', ids: ['pz'] }],
      primary: { actorId: 'a', id: 'pz' },
    });
    const snapped = snapWorldDelta(world, sel, 'z', 13, null, 10, true);
    expect(snapped.deltaEditor).toBe(10);
    expect(snapped.worldDelta).toEqual([0, 0, 10]);
  });
});

describe('Phase 2F.1 — undo / persistence', () => {
  it('one SetConvexGeometryCommand undoes and redoes exactly', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const convex = actor.getComponent('ConvexBrush');
    const before = {
      geometry: structuredClone(convex.geometry),
      faceMaterials: structuredClone(convex.faceMaterials),
      faceUVs: structuredClone(convex.faceUVs),
    };
    const vids = vertexIdsForFaces(convex.geometry, ['px']);
    const moved = moveVertices(convex.geometry, vids, [10, 0, 0], {
      faceMaterials: before.faceMaterials,
      faceUVs: before.faceUVs,
      selectedVertexIds: vids,
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
      label: 'Move faces',
    }));
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
    history.undo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(before.geometry));
    expect(convex.faceMaterials.pz).toBe('mat_face');
    history.redo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
  });

  it('survives save/load and duplicate', () => {
    const world = new World();
    world.addActor(makeAngledWedge('wedge'));
    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(3);
    const loaded = deserializeLevel(json);
    const actor = loaded.getActor('wedge');
    expect(actor.getComponent('ConvexBrush').isValid).toBe(true);

    const copies = duplicateActors([loaded.getActor('wedge')]);
    expect(copies).toHaveLength(1);
    expect(copies[0].getComponent('ConvexBrush').isValid).toBe(true);
  });

  it('prefab create/instantiate preserves ConvexBrush geometry', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'src' });
    world.addActor(actor);
    const created = createPrefabFromActors(world, [actor.id], { name: 'FaceBrick' });
    expect(created.ok).toBe(true);
    const nestedWorld = new World({ name: 'nested', schemaVersion: 2 });
    instantiatePrefab(created.definition, nestedWorld, { name: 'Instance' });
    const inst = nestedWorld.actors.find((a) => a.getComponent('ConvexBrush'));
    expect(inst?.getComponent('ConvexBrush').isValid).toBe(true);
  });
});
