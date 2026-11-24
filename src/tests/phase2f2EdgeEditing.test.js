import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ConvexBrushComponent } from '../components/ConvexBrushComponent.js';
import { convertBrushToConvexGeometry } from '../geometry/convert.js';
import { geometryFingerprint } from '../geometry/convexBrush.js';
import {
  edgeKey,
  listGeometryEdges,
  moveVertices,
  parseEdgeKey,
  vertexIdsForEdges,
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

/** Top-front edge of an AABB box (shared by py and pz). */
function topFrontEdgeKey(geometry) {
  const edges = listGeometryEdges(geometry);
  const vmap = new Map(geometry.vertices.map((v) => [v.id, v.p]));
  for (const key of edges) {
    const [a, b] = parseEdgeKey(key);
    const pa = vmap.get(a);
    const pb = vmap.get(b);
    if (!pa || !pb) continue;
    // Both verts on +Y and +Z faces of a centered box.
    if (pa[1] > 0 && pb[1] > 0 && pa[2] > 0 && pb[2] > 0) return key;
  }
  return edges[0];
}

describe('Phase 2F.2 — edge keys and selection', () => {
  it('derives sorted undirected edge keys', () => {
    expect(edgeKey('v7', 'v3')).toBe('v3|v7');
    expect(edgeKey('v3', 'v7')).toBe('v3|v7');
    expect(parseEdgeKey('v3|v7')).toEqual(['v3', 'v7']);
  });

  it('lists 12 edges on a box ConvexBrush', () => {
    const actor = makeConvexFromBrush();
    const edges = listGeometryEdges(actor.getComponent('ConvexBrush').geometry);
    expect(edges).toHaveLength(12);
  });

  it('toggles single and multi edge selection across actors', () => {
    let sel = emptyGeometrySelection('edge');
    sel = toggleGeometryItem(sel, { actorId: 'a', id: 'v0|v1', mode: 'edge' });
    expect(sel.mode).toBe('edge');
    expect(sel.items).toEqual([{ actorId: 'a', ids: ['v0|v1'] }]);

    sel = toggleGeometryItem(sel, {
      actorId: 'a',
      id: 'v2|v3',
      mode: 'edge',
      additive: true,
    });
    expect(sel.items[0].ids.sort()).toEqual(['v0|v1', 'v2|v3']);

    sel = toggleGeometryItem(sel, {
      actorId: 'b',
      id: 'v0|v1',
      mode: 'edge',
      additive: true,
    });
    expect(sel.items).toHaveLength(2);
  });

  it('drops stale edge keys after actor/geometry change', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const live = listGeometryEdges(actor.getComponent('ConvexBrush').geometry)[0];
    const sel = normalizeGeometrySelection({
      mode: 'edge',
      items: [
        { actorId: 'a', ids: [live, 'v9|v99'] },
        { actorId: 'gone', ids: [live] },
      ],
    });
    const next = nextGeometrySelectionAfterActorChange(sel, ['a'], world);
    expect(next.items).toEqual([{ actorId: 'a', ids: [live] }]);
  });

  it('shouldApplyGeometryEdit rejects stale edge ids', () => {
    const world = new World();
    world.addActor(makeConvexFromBrush({ id: 'a' }));
    expect(shouldApplyGeometryEdit({
      tool: 'geometry',
      geometrySelection: normalizeGeometrySelection({
        mode: 'edge',
        items: [{ actorId: 'a', ids: ['nope|nope'] }],
        primary: { actorId: 'a', id: 'nope|nope' },
      }),
      world,
    })).toBe(false);
  });

  it('remaps edge selection by dropping lost edges after mutation', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const key = listGeometryEdges(actor.getComponent('ConvexBrush').geometry)[0];
    const sel = normalizeGeometrySelection({
      mode: 'edge',
      items: [{ actorId: 'a', ids: [key] }],
    });
    const next = remappedGeometrySelection(sel, world, null);
    expect(next.items[0].ids).toEqual([key]);
  });
});

describe('Phase 2F.2 — edge moveVertices', () => {
  it('moves an edge and preserves face materials / UVs (fast path)', () => {
    const actor = makeConvexFromBrush();
    const convex = actor.getComponent('ConvexBrush');
    const key = topFrontEdgeKey(convex.geometry);
    const vids = vertexIdsForEdges(convex.geometry, [key]);
    expect(vids).toHaveLength(2);
    const beforeFp = geometryFingerprint(convex.geometry);
    const result = moveVertices(convex.geometry, vids, [0, 10, 0], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: vids,
    });
    expect(result.ok).toBe(true);
    expect(result.faceMaterials.pz).toBe('mat_face');
    expect(result.faceUVs.pz.scale.x).toBe(2);
    expect(geometryFingerprint(result.geometry)).not.toBe(beforeFp);
  });

  it('rejects invalid edge moves without mutating caller geometry', () => {
    const actor = makeConvexFromBrush({ size: { x: 40, y: 40, z: 40 } });
    const convex = actor.getComponent('ConvexBrush');
    const before = structuredClone(convex.geometry);
    const beforeFp = geometryFingerprint(before);
    // Collapse +X vertical edge almost onto -X → below MIN_THICKNESS / MIN_EDGE.
    const vmap = new Map(convex.geometry.vertices.map((v) => [v.id, v.p]));
    let key = null;
    for (const e of listGeometryEdges(convex.geometry)) {
      const [a, b] = parseEdgeKey(e);
      const pa = vmap.get(a);
      const pb = vmap.get(b);
      if (pa[0] > 0 && pb[0] > 0 && pa[1] * pb[1] < 0 && Math.abs(pa[2] - pb[2]) < 1e-6) {
        key = e;
        break;
      }
    }
    expect(key).toBeTruthy();
    const vids = vertexIdsForEdges(convex.geometry, [key]);
    const result = moveVertices(convex.geometry, vids, [-39.7, 0, 0], {
      faceMaterials: convex.faceMaterials,
      faceUVs: convex.faceUVs,
      selectedVertexIds: vids,
    });
    expect(result.ok).toBe(false);
    expect(geometryFingerprint(convex.geometry)).toBe(beforeFp);
    expect(JSON.stringify(convex.geometry)).toBe(JSON.stringify(before));
  });

  it('applyGeometryMove is atomic across multiple actors for edges', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a', position: { x: 0, y: 50, z: 0 } });
    const b = makeConvexFromBrush({ id: 'b', position: { x: 400, y: 50, z: 0 } });
    world.addActor(a);
    world.addActor(b);
    const keyA = topFrontEdgeKey(a.getComponent('ConvexBrush').geometry);
    const keyB = topFrontEdgeKey(b.getComponent('ConvexBrush').geometry);
    const sel = normalizeGeometrySelection({
      mode: 'edge',
      items: [
        { actorId: 'a', ids: [keyA] },
        { actorId: 'b', ids: [keyB] },
      ],
      primary: { actorId: 'a', id: keyA },
    });
    const result = applyGeometryMove(world, sel, [0, 10, 0]);
    expect(result.ok).toBe(true);
    expect(result.changes).toHaveLength(2);
  });

  it('grid snap lands on increments for edge axis moves', () => {
    const world = new World();
    const a = makeConvexFromBrush({ id: 'a' });
    world.addActor(a);
    const key = topFrontEdgeKey(a.getComponent('ConvexBrush').geometry);
    const sel = normalizeGeometrySelection({
      mode: 'edge',
      items: [{ actorId: 'a', ids: [key] }],
      primary: { actorId: 'a', id: key },
    });
    const snapped = snapWorldDelta(world, sel, 'y', 13, null, 10, true);
    expect(snapped.deltaEditor).toBe(10);
    expect(snapped.worldDelta).toEqual([0, 10, 0]);
  });
});

describe('Phase 2F.2 — undo / persistence for edges', () => {
  it('one SetConvexGeometryCommand undoes and redoes an edge move', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'a' });
    world.addActor(actor);
    const convex = actor.getComponent('ConvexBrush');
    const before = {
      geometry: structuredClone(convex.geometry),
      faceMaterials: structuredClone(convex.faceMaterials),
      faceUVs: structuredClone(convex.faceUVs),
    };
    const key = topFrontEdgeKey(convex.geometry);
    const vids = vertexIdsForEdges(convex.geometry, [key]);
    const moved = moveVertices(convex.geometry, vids, [0, 10, 0], {
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
      label: 'Move edges',
    }));
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
    history.undo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(before.geometry));
    history.redo();
    expect(geometryFingerprint(convex.geometry)).toBe(geometryFingerprint(after.geometry));
  });

  it('survives save/load, duplicate, and prefab round-trip', () => {
    const world = new World();
    const actor = makeConvexFromBrush({ id: 'edge_demo' });
    world.addActor(actor);
    const key = topFrontEdgeKey(actor.getComponent('ConvexBrush').geometry);
    const vids = vertexIdsForEdges(actor.getComponent('ConvexBrush').geometry, [key]);
    const moved = moveVertices(
      actor.getComponent('ConvexBrush').geometry,
      vids,
      [0, 5, 0],
      {
        faceMaterials: actor.getComponent('ConvexBrush').faceMaterials,
        faceUVs: actor.getComponent('ConvexBrush').faceUVs,
        selectedVertexIds: vids,
      },
    );
    expect(moved.ok).toBe(true);
    actor.getComponent('ConvexBrush').geometry = moved.geometry;

    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(3);
    const loaded = deserializeLevel(json);
    expect(loaded.getActor('edge_demo').getComponent('ConvexBrush').isValid).toBe(true);

    const copies = duplicateActors([loaded.getActor('edge_demo')]);
    expect(copies[0].getComponent('ConvexBrush').isValid).toBe(true);

    const created = createPrefabFromActors(loaded, ['edge_demo'], { name: 'EdgeBrick' });
    expect(created.ok).toBe(true);
    const nested = new World({ name: 'nested', schemaVersion: 2 });
    instantiatePrefab(created.definition, nested, { name: 'Instance' });
    expect(nested.actors.some((a) => a.getComponent('ConvexBrush')?.isValid)).toBe(true);
  });
});
