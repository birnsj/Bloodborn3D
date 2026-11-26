/**
 * Batch 7.1 — pivot editing: contentOffset compensation, presets, serialization.
 */
import { describe, it, expect } from 'vitest';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { World } from '../core/World.js';
import { StaticMeshComponent } from '../components/StaticMeshComponent.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { PrimitiveMeshComponent } from '../components/PrimitiveMeshComponent.js';
import {
  applyActorLocalPivotDelta,
  applyActorWorldPivotPosition,
  getContentWorldPosition,
  normalizeContentOffset,
  contentOffsetIsIdentity,
  snapshotPivotState,
  restorePivotState,
} from '../core/contentOffset.js';
import {
  applyPivotPreset,
  measureActorContentBoundsLocalEu,
  actorSupportsPivotEdit,
  assetPivotPresetOffset,
} from '../rules/pivotEdit.js';
import { SetPivotCommand } from '../editor/history/commands.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { createStaticMeshActor } from '../editor/meshFactory.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeWorldWithMesh() {
  const world = new World();
  const actor = new Actor({
    name: 'Prop',
    transform: new Transform({ position: { x: 100, y: 0, z: 0 } }),
    components: [
      new StaticMeshComponent({ assetId: 'mesh_test', collidable: true, collisionType: 'box' }),
    ],
  });
  world.addActor(actor);
  return { world, actor };
}

describe('Batch 7.1 contentOffset math', () => {
  it('keeps content world pose when pivot moves in local space', () => {
    const { world, actor } = makeWorldWithMesh();
    const beforeContent = getContentWorldPosition(actor, world);
    applyActorLocalPivotDelta(actor, { x: 50, y: 0, z: 0 }, world);
    expect(actor.transform.position.x).toBeCloseTo(150, 5);
    expect(actor.contentOffset.x).toBeCloseTo(-50, 5);
    const afterContent = getContentWorldPosition(actor, world);
    expect(afterContent.x).toBeCloseTo(beforeContent.x, 5);
    expect(afterContent.y).toBeCloseTo(beforeContent.y, 5);
    expect(afterContent.z).toBeCloseTo(beforeContent.z, 5);
  });

  it('compensates non-uniform scale', () => {
    const { world, actor } = makeWorldWithMesh();
    actor.transform.scale = { x: 2, y: 1, z: 1 };
    const before = getContentWorldPosition(actor, world);
    applyActorLocalPivotDelta(actor, { x: 25, y: 0, z: 0 }, world);
    const after = getContentWorldPosition(actor, world);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(actor.transform.position.x).toBeCloseTo(100 + 50, 5); // 2 * 25
    expect(actor.contentOffset.x).toBeCloseTo(-25, 5);
  });

  it('compensates direct children world transforms', () => {
    const { world, actor } = makeWorldWithMesh();
    const child = new Actor({
      name: 'Child',
      parentId: actor.id,
      transform: new Transform({ position: { x: 40, y: 0, z: 0 } }),
      components: [new PrimitiveMeshComponent({ primitive: 'box' })],
    });
    world.addActor(child);
    const childBefore = getWorldTransform(child, world).position;
    applyActorLocalPivotDelta(actor, { x: 20, y: 0, z: 0 }, world);
    const childAfter = getWorldTransform(child, world).position;
    expect(childAfter.x).toBeCloseTo(childBefore.x, 5);
    expect(child.transform.position.x).toBeCloseTo(20, 5);
  });

  it('serializes contentOffset only when non-identity', () => {
    const a = new Actor({ name: 'A' });
    expect(a.toJSON().contentOffset).toBeUndefined();
    a.contentOffset = { x: 10, y: 0, z: 0 };
    expect(a.toJSON().contentOffset).toEqual({ x: 10, y: 0, z: 0 });
    const restored = Actor.fromJSON(a.toJSON(), (c) => c);
    expect(restored.contentOffset.x).toBe(10);
  });
});

describe('Batch 7.1 presets + history', () => {
  it('bottom-center preset moves pivot without shifting content', () => {
    const world = new World();
    const actor = new Actor({
      name: 'Brush',
      transform: new Transform({ position: { x: 0, y: 50, z: 0 } }),
      components: [new BrushComponent({ size: { x: 100, y: 100, z: 100 } })],
    });
    world.addActor(actor);
    const before = getContentWorldPosition(actor, world);
    applyPivotPreset(actor, world, 'bottomCenter');
    const after = getContentWorldPosition(actor, world);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
    // Pivot at bottom of 100-tall brush centered at y=50 → bottom at y=0
    expect(actor.transform.position.y).toBeCloseTo(0, 5);
    expect(actor.contentOffset.y).toBeCloseTo(50, 5);
  });

  it('original/reset restores identity contentOffset', () => {
    const { world, actor } = makeWorldWithMesh();
    applyActorLocalPivotDelta(actor, { x: 30, y: 10, z: 0 }, world);
    expect(contentOffsetIsIdentity(actor.contentOffset)).toBe(false);
    applyPivotPreset(actor, world, 'original');
    expect(contentOffsetIsIdentity(actor.contentOffset)).toBe(true);
  });

  it('SetPivotCommand undo/redo restores snapshots', () => {
    const { world, actor } = makeWorldWithMesh();
    const before = snapshotPivotState(actor, world);
    applyActorWorldPivotPosition(actor, { x: 200, y: 0, z: 0 }, world);
    const after = snapshotPivotState(actor, world);
    restorePivotState(world, before);
    const cmd = new SetPivotCommand({
      world,
      changes: [{ before, after }],
      label: 'Edit pivot',
    });
    cmd.do();
    expect(actor.transform.position.x).toBeCloseTo(200, 5);
    cmd.undo();
    expect(actor.transform.position.x).toBeCloseTo(before.transform.position.x, 5);
    expect(normalizeContentOffset(actor.contentOffset)).toEqual(before.contentOffset);
  });

  it('supports StaticMesh, PrimitiveMesh, Brush', () => {
    expect(actorSupportsPivotEdit(new Actor({
      components: [new StaticMeshComponent({ assetId: 'x' })],
    }))).toBe(true);
    expect(actorSupportsPivotEdit(new Actor({
      components: [new PrimitiveMeshComponent({})],
    }))).toBe(true);
    expect(actorSupportsPivotEdit(new Actor({
      components: [new BrushComponent({ size: { x: 10, y: 10, z: 10 } })],
    }))).toBe(true);
  });

  it('asset bottom-center default offset places pivot at feet', () => {
    const meta = {
      boundingBoxMeters: { x: 1, y: 2, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 1, z: 0 },
    };
    const offset = assetPivotPresetOffset('bottomCenter', meta);
    // Bottom of 2m tall mesh centered at y=1m is y=0 → contentOffset y = 0? 
    // target pivot = bottom = center.y - half = 100 - 100 = 0 eu → offset = -0
    // Wait: center eu = 100, half = 100, min.y = 0, target = {0,0,0}, offset = -target = 0
    // For a mesh with origin at bottom already, bottomCenter → 0. For center at 1m:
    // min.y = 0, target bottomCenter = {x:0,y:0,z:0}, offset = {0,0,0}
    // For center at y=1m with size 2m, bottom is at 0 in mesh space — mesh origin often at 0.
    // If we want pivot at bottom (0) and mesh origin is at 0, contentOffset stays 0.
    // If mesh origin is at geometric center (bounds center 0,0,0 with size 2):
    const metaCentered = {
      boundingBoxMeters: { x: 1, y: 2, z: 1 },
      boundingBoxCenterMeters: { x: 0, y: 0, z: 0 },
    };
    const off = assetPivotPresetOffset('bottomCenter', metaCentered);
    expect(off.y).toBeCloseTo(100, 5); // -(-100) = content sits +100 above pivot at bottom
  });

  it('createStaticMeshActor accepts contentOffset from asset meta', () => {
    const actor = createStaticMeshActor({
      assetId: 'mesh_x',
      contentOffset: { x: 0, y: -50, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      snapY: false,
    });
    expect(actor.contentOffset.y).toBe(-50);
  });

  it('bounds helper returns finite AABB', () => {
    const actor = new Actor({
      components: [new BrushComponent({ size: { x: 200, y: 100, z: 50 } })],
    });
    const b = measureActorContentBoundsLocalEu(actor);
    expect(b.size.x).toBe(200);
    expect(b.min.y).toBeCloseTo(-50, 5);
  });
});

describe('Batch 7.1 acceptance docs + level', () => {
  it('ships acceptance doc and level', () => {
    expect(existsSync(path.join(rootDir, 'docs/ACCEPTANCE_PIVOT_EDITING.md'))).toBe(true);
    expect(existsSync(path.join(rootDir, 'public/levels/acceptance-pivot-editing.json'))).toBe(true);
  });
});
