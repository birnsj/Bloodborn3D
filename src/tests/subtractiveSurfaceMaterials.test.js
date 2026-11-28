/**
 * Subtractive World Solid is locked so it cannot be moved, but designers must
 * still paint materials / face UVs like additive walls.
 */
import { describe, expect, it } from 'vitest';
import { createNewMapWorld } from '../editor/newMapFactory.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetBrushMaterialCommand } from '../editor/history/commands.js';
import { isWorldSolidActor } from '../runtime/brushBoolean.js';
import {
  patchFaceMaterial,
  semanticFaceKeyFromSurfaceId,
  surfaceIdFromHit,
} from '../runtime/surfaces.js';
import { createBatchedWorldSolidGeometry, getBrushRenderSolids } from '../runtime/brushGeometry.js';
import * as THREE from 'three';

const DRESS_KEYS = new Set(['materialId', 'faceMaterials', 'faceUVs', 'uv', 'color']);

/** Mirrors useBrushEditing: locked actors may still receive dress-only brush patches. */
function brushPartialAllowedWhenLocked(partial) {
  const keys = Object.keys(partial || {});
  return keys.length > 0 && keys.every((key) => DRESS_KEYS.has(key));
}

describe('subtractive World Solid surface materials', () => {
  it('keeps World Solid locked but allows dress-only brush patches', () => {
    const world = createNewMapWorld({ name: 'Sub', mapMode: 'subtractive' });
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    expect(solid.locked).toBe(true);
    expect(brushPartialAllowedWhenLocked({ size: { x: 1 } })).toBe(false);
    expect(brushPartialAllowedWhenLocked({ operation: 'add' })).toBe(false);
    expect(brushPartialAllowedWhenLocked({ materialId: 'mat_a' })).toBe(true);
    expect(brushPartialAllowedWhenLocked({ faceMaterials: { py: 'mat_a' } })).toBe(true);
    expect(brushPartialAllowedWhenLocked({ faceUVs: { py: { scale: { x: 2, y: 2 } } } })).toBe(true);
  });

  it('applies a face material on locked World Solid through history', () => {
    const world = createNewMapWorld({ name: 'Sub', mapMode: 'subtractive' });
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    const brush = solid.getComponent('Brush');
    const scratch = {
      type: brush.type,
      faceMaterials: brush.faceMaterials ? { ...brush.faceMaterials } : null,
    };
    const patched = patchFaceMaterial(scratch, 'py', 'mat_hall_stone');
    expect(patched).toBeTruthy();

    const history = new HistoryStack();
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: solid.id,
      before: { faceMaterials: brush.faceMaterials },
      after: { faceMaterials: patched.after },
      label: 'Face material',
    }));
    expect(solid.getComponent('Brush').faceMaterials?.py).toBe('mat_hall_stone');
    history.undo();
    expect(solid.getComponent('Brush').faceMaterials?.py).toBeUndefined();
  });

  it('batched World Solid picks one surface id per exposed panel', () => {
    const world = createNewMapWorld({ name: 'Sub', mapMode: 'subtractive' });
    const solid = world.actors.find((a) => isWorldSolidActor(a));
    const brush = solid.getComponent('Brush');
    const { solids } = getBrushRenderSolids(brush, { world, actor: solid });
    const geom = createBatchedWorldSolidGeometry(solids, brush.size, brush.uv, null);
    expect(geom).toBeTruthy();
    expect(geom.userData.surfaceIds.length).toBe(geom.groups.length);
    expect(new Set(geom.userData.surfaceIds).size).toBe(geom.userData.surfaceIds.length);
    const mesh = new THREE.Mesh(
      geom,
      geom.userData.surfaceIds.map(() => new THREE.MeshBasicMaterial()),
    );
    mesh.userData.surfaceScheme = 'grouped';
    mesh.userData.surfaceIds = geom.userData.surfaceIds;
    const group = geom.groups.find((g) => g.count > 0);
    expect(group).toBeTruthy();
    const sid = surfaceIdFromHit(mesh, group.start / 3);
    expect(sid).toBe(geom.userData.surfaceIds[group.materialIndex]);
    expect(semanticFaceKeyFromSurfaceId(sid)).toMatch(/^(px|nx|py|ny|pz|nz)$/);
    geom.dispose();
  });
});
