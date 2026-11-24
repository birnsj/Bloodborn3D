import { describe, expect, it } from 'vitest';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { getWorldMatrix } from '../core/hierarchy.js';
import { mat4Invert, mat4TransformPoint } from '../core/math3d.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { CurvedWallComponent } from '../components/CurvedWallComponent.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetBrushMaterialCommand } from '../editor/history/commands.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import {
  ALIGN_LIMITATIONS,
  computeAlignFaceUv,
  densityUvOnBrushFace,
} from '../rules/alignSurfaces.js';
import { createBrushBoxGeometry } from '../runtime/brushGeometry.js';
import { composeGeometryUv, normalizeActorUv } from '../runtime/uvMapping.js';

function makeWorldWithAdjoiningWalls(opts = {}) {
  const world = new World({ name: 'align', schemaVersion: 2 });
  const refUv = opts.refFaceUv || {
    scale: { x: 1, y: 1 },
    offset: { x: 0.35, y: 0.1 },
    rotation: 0,
  };
  world.addActor(new Actor({
    id: 'wall_a',
    name: 'Wall A',
    tags: ['structure', 'brush', 'wall'],
    transform: {
      position: { x: -200, y: 150, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    components: [new BrushComponent({
      size: { x: 400, y: 300, z: 20 },
      materialId: 'mat_verify_wall',
      faceMaterials: { pz: 'mat_hall_stone' },
      faceUVs: { pz: refUv },
      uv: opts.refActorUv || null,
    })],
  }));
  world.addActor(new Actor({
    id: 'wall_b',
    name: 'Wall B',
    tags: ['structure', 'brush', 'wall'],
    transform: {
      position: { x: 150, y: 150, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    components: [new BrushComponent({
      size: { x: 300, y: 300, z: 20 },
      materialId: 'mat_verify_wall',
      faceMaterials: { pz: 'mat_hall_stone' },
      uv: opts.tgtActorUv || null,
    })],
  }));
  return world;
}

function composedUvAt(world, actorId, surfaceId, worldPoint) {
  const actor = world.getActor(actorId);
  const brush = actor.getComponent('Brush');
  const inv = mat4Invert(getWorldMatrix(actor, world));
  const local = mat4TransformPoint(inv, worldPoint);
  const density = densityUvOnBrushFace(surfaceId, local, brush.size);
  return composeGeometryUv(
    density[0],
    density[1],
    normalizeActorUv(brush.uv),
    brush.faceUVs?.[surfaceId] || null,
  );
}

describe('Phase 2E.3 — density UV frame matches brushGeometry', () => {
  it('documents alignment limitations', () => {
    expect(ALIGN_LIMITATIONS.length).toBeGreaterThan(3);
  });

  it('pz density UV matches createBrushBoxGeometry corners', () => {
    const size = { x: 200, y: 100, z: 40 };
    const geom = createBrushBoxGeometry(size, {});
    const uv = geom.attributes.uv;
    const pos = geom.attributes.position;
    for (let i = 16; i < 20; i += 1) {
      const local = {
        x: pos.getX(i) * 100,
        y: pos.getY(i) * 100,
        z: pos.getZ(i) * 100,
      };
      const [du, dv] = densityUvOnBrushFace('pz', local, size);
      expect(du).toBeCloseTo(uv.getX(i), 4);
      expect(dv).toBeCloseTo(uv.getY(i), 4);
    }
    geom.dispose();
  });
});

describe('Phase 2E.3 — Align to Neighbor', () => {
  it('aligns adjoining coplanar walls of different widths at contact UV', () => {
    const world = makeWorldWithAdjoiningWalls({
      refFaceUv: {
        scale: { x: 1.5, y: 1 },
        offset: { x: 0.2, y: 0.05 },
        rotation: 0,
      },
    });
    const result = computeAlignFaceUv(
      world,
      { actorId: 'wall_a', surfaceId: 'pz' },
      { actorId: 'wall_b', surfaceId: 'pz' },
    );
    expect(result.ok).toBe(true);
    expect(result.contact).toBeTruthy();

    world.getActor('wall_b').getComponent('Brush').faceUVs = result.faceUVs;
    const refUv = composedUvAt(world, 'wall_a', 'pz', result.contact);
    const tgtUv = composedUvAt(world, 'wall_b', 'pz', result.contact);
    expect(tgtUv[0]).toBeCloseTo(refUv[0], 4);
    expect(tgtUv[1]).toBeCloseTo(refUv[1], 4);
  });

  it('accounts for differing actor UV scale', () => {
    const world = makeWorldWithAdjoiningWalls({
      refFaceUv: {
        scale: { x: 1, y: 1 },
        offset: { x: 0.1, y: 0 },
        rotation: 0,
      },
      refActorUv: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
      tgtActorUv: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
    });
    const result = computeAlignFaceUv(
      world,
      { actorId: 'wall_a', surfaceId: 'pz' },
      { actorId: 'wall_b', surfaceId: 'pz' },
    );
    expect(result.ok).toBe(true);
    expect(result.faceUv.scale.x).toBeCloseTo(2, 5);
    world.getActor('wall_b').getComponent('Brush').faceUVs = result.faceUVs;
    const refUv = composedUvAt(world, 'wall_a', 'pz', result.contact);
    const tgtUv = composedUvAt(world, 'wall_b', 'pz', result.contact);
    expect(tgtUv[0]).toBeCloseTo(refUv[0], 4);
    expect(tgtUv[1]).toBeCloseTo(refUv[1], 4);
  });

  it('rejects incompatible pairs without mutating target', () => {
    const world = makeWorldWithAdjoiningWalls();
    const before = world.getActor('wall_b').getComponent('Brush').faceUVs;

    expect(computeAlignFaceUv(
      world,
      { actorId: 'wall_a', surfaceId: 'pz' },
      { actorId: 'wall_b', surfaceId: 'nz' },
    ).ok).toBe(false);
    expect(world.getActor('wall_b').getComponent('Brush').faceUVs).toBe(before);

    const far = new World({ name: 'far' });
    far.addActor(new Actor({
      id: 'a',
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 20 } })],
      transform: { position: { x: 0, y: 50, z: 0 } },
    }));
    far.addActor(new Actor({
      id: 'b',
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 20 } })],
      transform: { position: { x: 500, y: 50, z: 0 } },
    }));
    expect(computeAlignFaceUv(
      far,
      { actorId: 'a', surfaceId: 'pz' },
      { actorId: 'b', surfaceId: 'pz' },
    ).ok).toBe(false);

    const curved = new World({ name: 'cw' });
    curved.addActor(new Actor({
      id: 'a',
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 20 } })],
    }));
    curved.addActor(new Actor({
      id: 'c',
      components: [new CurvedWallComponent({})],
    }));
    const bad = computeAlignFaceUv(
      curved,
      { actorId: 'a', surfaceId: 'pz' },
      { actorId: 'c', surfaceId: 'outer' },
    );
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/Brush/i);
  });

  it('persists aligned faceUVs through save/load and undo', () => {
    const world = makeWorldWithAdjoiningWalls();
    const result = computeAlignFaceUv(
      world,
      { actorId: 'wall_a', surfaceId: 'pz' },
      { actorId: 'wall_b', surfaceId: 'pz' },
    );
    expect(result.ok).toBe(true);

    const history = new HistoryStack();
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'wall_b',
      before: { faceUVs: null },
      after: { faceUVs: result.faceUVs },
      label: 'Align surface UV',
    }));
    expect(world.getActor('wall_b').getComponent('Brush').faceUVs.pz.offset.x)
      .toBeCloseTo(result.faceUv.offset.x, 5);

    const round = deserializeLevel(serializeLevel(world));
    expect(round.getActor('wall_b').getComponent('Brush').faceUVs.pz.scale.x)
      .toBeCloseTo(result.faceUv.scale.x, 5);

    history.undo();
    expect(world.getActor('wall_b').getComponent('Brush').faceUVs).toBeNull();
    history.redo();
    expect(world.getActor('wall_b').getComponent('Brush').faceUVs.pz.offset.y)
      .toBeCloseTo(result.faceUv.offset.y, 5);
  });
});
