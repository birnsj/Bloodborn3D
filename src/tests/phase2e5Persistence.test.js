import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { World } from '../core/World.js';
import { Actor } from '../core/Actor.js';
import { Transform } from '../core/Transform.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { ColumnComponent } from '../components/ColumnComponent.js';
import { StairComponent } from '../components/StairComponent.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import {
  SetBrushGeometryCommand,
  SetBrushMaterialCommand,
  SetStairPropertiesCommand,
  SetColumnPropertiesCommand,
} from '../editor/history/commands.js';
import { resizeBrushFace } from '../editor/brushFactory.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import { TEXTURE_TILE_EDITOR_UNITS } from '../runtime/uvMapping.js';
import { createBrushBoxGeometry } from '../runtime/brushGeometry.js';
import {
  createPrefabFromActors,
  instantiatePrefab,
  syncPrefabInstances,
  setOverride,
} from '../prefabs/prefabOps.js';
import { normalizePrefabDefinition } from '../prefabs/PrefabDefinition.js';
import { computeAlignFaceUv } from '../rules/alignSurfaces.js';
import {
  cloneMaterialDraft,
  isMaterialDraftDirty,
  materialDraftToSavePayload,
} from '../editor/materials/materialDraft.js';
import { createMaterialDefinition } from '../materials/MaterialDefinition.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function surfaceBlob(comp) {
  return {
    materialId: comp.materialId ?? null,
    faceMaterials: comp.faceMaterials ? { ...comp.faceMaterials } : null,
    faceUVs: comp.faceUVs ? structuredClone(comp.faceUVs) : null,
    uv: comp.uv ? structuredClone(comp.uv) : null,
  };
}

describe('Phase 2E.5 — surface/material persistence audit', () => {
  it('round-trips acceptance-surfaces faceMaterials and faceUVs (schema 2)', () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, 'public/levels/acceptance-surfaces.json'), 'utf8'),
    );
    expect(raw.schemaVersion).toBe(2);
    const world = deserializeLevel(raw);
    const wall = world.getActor('actor_wall');
    const alignA = world.getActor('actor_align_a');
    const alignB = world.getActor('actor_align_b');
    expect(wall.getComponent('Brush').faceMaterials.pz).toBe('mat_hall_stone');
    expect(alignA.getComponent('Brush').faceUVs.pz.offset.x).toBeCloseTo(0.4, 5);
    expect(alignB.getComponent('Brush').faceUVs.pz.offset.x).toBeCloseTo(4.4, 5);

    const json = serializeLevel(world);
    const again = deserializeLevel(json);
    expect(surfaceBlob(again.getActor('actor_wall').getComponent('Brush')))
      .toEqual(surfaceBlob(wall.getComponent('Brush')));
    expect(surfaceBlob(again.getActor('actor_align_a').getComponent('Brush')))
      .toEqual(surfaceBlob(alignA.getComponent('Brush')));
    expect(surfaceBlob(again.getActor('actor_align_b').getComponent('Brush')))
      .toEqual(surfaceBlob(alignB.getComponent('Brush')));
    expect(surfaceBlob(again.getActor('actor_ramp').getComponent('Ramp')))
      .toEqual(surfaceBlob(world.getActor('actor_ramp').getComponent('Ramp')));
    expect(surfaceBlob(again.getActor('actor_column').getComponent('Column')))
      .toEqual(surfaceBlob(world.getActor('actor_column').getComponent('Column')));
  });

  it('preserves faceUVs on schemaVersion 1 brush round-trip', () => {
    const world = new World({ name: 'V1', schemaVersion: 1 });
    world.addActor(new Actor({
      id: 'actor_v1',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [
        new BrushComponent({
          id: 'comp_v1',
          size: { x: 300, y: 300, z: 20 },
          materialId: 'mat_a',
          faceMaterials: { pz: 'mat_b' },
          faceUVs: {
            pz: { scale: { x: 1.5, y: 1 }, offset: { x: 0.2, y: 0 }, rotation: 15 },
          },
          uv: createBrushUvState({ offset: { x: 0.1, y: 0 } }),
        }),
      ],
    }));
    const json = serializeLevel(world);
    expect(json.schemaVersion).toBe(2); // saves always write current version
    const again = deserializeLevel({ ...json, schemaVersion: 1 });
    const brush = again.getActor('actor_v1').getComponent('Brush');
    expect(brush.materialId).toBe('mat_a');
    expect(brush.faceMaterials).toEqual({ pz: 'mat_b' });
    expect(brush.faceUVs.pz.scale.x).toBeCloseTo(1.5, 5);
    expect(brush.faceUVs.pz.offset.x).toBeCloseTo(0.2, 5);
    expect(brush.faceUVs.pz.rotation).toBeCloseTo(15, 5);
    expect(brush.uv.offset.x).toBeCloseTo(0.1, 5);
  });

  it('keeps faceMaterials and faceUVs across brush resize/regeneration', () => {
    const world = new World({ name: 'Resize', schemaVersion: 2 });
    const actor = new Actor({
      id: 'actor_resize',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [
        new BrushComponent({
          id: 'comp_resize',
          size: { x: 200, y: 300, z: 20 },
          materialId: 'mat_a',
          faceMaterials: { pz: 'mat_stone' },
          faceUVs: {
            pz: { scale: { x: 2, y: 1 }, offset: { x: 0.5, y: 0.1 }, rotation: 0 },
          },
        }),
      ],
    });
    world.addActor(actor);
    const beforeSurfaces = surfaceBlob(actor.getComponent('Brush'));
    const beforeGeom = {
      size: { ...actor.getComponent('Brush').size },
      position: { ...actor.transform.position },
    };
    const resized = resizeBrushFace({
      ...beforeGeom,
      axis: 'x',
      sign: 1,
      delta: 50,
      gridSize: 25,
    });
    const history = new HistoryStack();
    history.execute(new SetBrushGeometryCommand({
      world,
      changes: [{ actorId: actor.id, before: beforeGeom, after: resized }],
    }));
    expect(actor.getComponent('Brush').size.x).toBeGreaterThan(beforeGeom.size.x);
    expect(surfaceBlob(actor.getComponent('Brush'))).toEqual(beforeSurfaces);

    // Geometry regeneration still carries density UVs for the new size.
    const geom = createBrushBoxGeometry(actor.getComponent('Brush').size);
    expect(geom.getAttribute('uv')).toBeTruthy();
    expect(TEXTURE_TILE_EDITOR_UNITS).toBe(100);
    geom.dispose();

    history.undo();
    expect(surfaceBlob(actor.getComponent('Brush'))).toEqual(beforeSurfaces);
    expect(actor.getComponent('Brush').size).toEqual(beforeGeom.size);
  });

  it('undo/redo restores material assignment, surface UVs and align faceUVs', () => {
    const world = new World({ name: 'Hist', schemaVersion: 2 });
    const a = new Actor({
      id: 'actor_align_a',
      name: 'A',
      transform: new Transform({ position: { x: -250, y: 150, z: 500 } }),
      components: [
        new BrushComponent({
          id: 'comp_a',
          size: { x: 400, y: 300, z: 20 },
          materialId: 'mat_verify_wall',
          faceMaterials: { pz: 'mat_hall_stone' },
          faceUVs: {
            pz: { scale: { x: 1, y: 1 }, offset: { x: 0.4, y: 0.15 }, rotation: 0 },
          },
        }),
      ],
    });
    const b = new Actor({
      id: 'actor_align_b',
      name: 'B',
      transform: new Transform({ position: { x: 100, y: 150, z: 500 } }),
      components: [
        new BrushComponent({
          id: 'comp_b',
          size: { x: 300, y: 250, z: 20 },
          materialId: 'mat_verify_wall',
          faceMaterials: { pz: 'mat_hall_stone' },
        }),
      ],
    });
    world.addActor(a);
    world.addActor(b);

    const history = new HistoryStack();
    const brushB = b.getComponent('Brush');
    const beforeMat = {
      materialId: brushB.materialId,
      faceMaterials: brushB.faceMaterials ? { ...brushB.faceMaterials } : null,
      faceUVs: brushB.faceUVs ? structuredClone(brushB.faceUVs) : null,
    };

    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: b.id,
      before: beforeMat,
      after: {
        ...beforeMat,
        faceMaterials: { pz: 'mat_wood' },
      },
      label: 'Assign surface',
    }));
    expect(brushB.faceMaterials.pz).toBe('mat_wood');

    const align = computeAlignFaceUv(
      world,
      { actorId: a.id, surfaceId: 'pz' },
      { actorId: b.id, surfaceId: 'pz' },
    );
    expect(align.ok).toBe(true);
    const beforeAlign = {
      materialId: brushB.materialId,
      faceMaterials: { ...brushB.faceMaterials },
      faceUVs: brushB.faceUVs ? structuredClone(brushB.faceUVs) : null,
    };
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: b.id,
      before: beforeAlign,
      after: {
        ...beforeAlign,
        faceUVs: { pz: align.faceUv },
      },
      label: 'Align',
    }));
    expect(brushB.faceUVs.pz.offset.x).toBeCloseTo(align.faceUv.offset.x, 5);

    history.undo(); // undo align
    expect(brushB.faceUVs).toBeNull();
    expect(brushB.faceMaterials.pz).toBe('mat_wood');
    history.undo(); // undo material
    expect(brushB.faceMaterials.pz).toBe('mat_hall_stone');
    history.redo();
    expect(brushB.faceMaterials.pz).toBe('mat_wood');
    history.redo();
    expect(brushB.faceUVs.pz.offset.x).toBeCloseTo(align.faceUv.offset.x, 5);
  });

  it('stair and column surface fields undo/redo and serialize', () => {
    const world = new World({ name: 'Types', schemaVersion: 2 });
    const stairActor = new Actor({
      id: 'actor_stair',
      name: 'Stairs',
      transform: new Transform(),
      components: [
        new StairComponent({
          id: 'comp_stair',
          materialId: 'mat_a',
          faceMaterials: { tread: 'mat_wood' },
          faceUVs: {
            pz: { scale: { x: 1, y: 1 }, offset: { x: 0.3, y: 0 }, rotation: 0 },
          },
        }),
      ],
    });
    const columnActor = new Actor({
      id: 'actor_col',
      name: 'Column',
      transform: new Transform(),
      components: [
        new ColumnComponent({
          id: 'comp_col',
          materialId: 'mat_a',
          faceMaterials: { shaft: 'mat_stone' },
          faceUVs: {
            shaft: { scale: { x: 1, y: 2 }, offset: { x: 0, y: 0.1 }, rotation: 0 },
          },
        }),
      ],
    });
    world.addActor(stairActor);
    world.addActor(columnActor);

    const history = new HistoryStack();
    const stair = stairActor.getComponent('Stair');
    history.execute(new SetStairPropertiesCommand({
      world,
      actorId: stairActor.id,
      before: { faceMaterials: { ...stair.faceMaterials }, faceUVs: structuredClone(stair.faceUVs) },
      after: {
        faceMaterials: { tread: 'mat_b' },
        faceUVs: {
          pz: { scale: { x: 1, y: 1 }, offset: { x: 0.9, y: 0 }, rotation: 0 },
        },
      },
    }));
    expect(stair.faceMaterials.tread).toBe('mat_b');
    history.undo();
    expect(stair.faceMaterials.tread).toBe('mat_wood');
    history.redo();
    expect(stair.faceUVs.pz.offset.x).toBeCloseTo(0.9, 5);

    const column = columnActor.getComponent('Column');
    history.execute(new SetColumnPropertiesCommand({
      world,
      actorId: columnActor.id,
      before: { faceMaterials: { ...column.faceMaterials } },
      after: { faceMaterials: { shaft: 'mat_c' } },
    }));
    expect(column.faceMaterials.shaft).toBe('mat_c');
    history.undo();
    expect(column.faceMaterials.shaft).toBe('mat_stone');

    const again = deserializeLevel(serializeLevel(world));
    expect(surfaceBlob(again.getActor('actor_stair').getComponent('Stair')))
      .toEqual(surfaceBlob(stair));
    expect(surfaceBlob(again.getActor('actor_col').getComponent('Column')))
      .toEqual(surfaceBlob(column));
  });

  it('prefab create/instantiate/override/sync preserves faceMaterials and faceUVs', () => {
    const world = new World({ name: 'PrefabSurf', schemaVersion: 2 });
    const src = new Actor({
      id: 'src_wall',
      name: 'Wall',
      transform: new Transform({ position: { x: 0, y: 150, z: 0 } }),
      components: [
        new BrushComponent({
          id: 'comp_src',
          size: { x: 300, y: 300, z: 20 },
          materialId: 'mat_fallback',
          faceMaterials: { pz: 'mat_stone', py: 'mat_trim' },
          faceUVs: {
            pz: { scale: { x: 1, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
          },
        }),
      ],
    });
    world.addActor(src);

    const created = createPrefabFromActors(world, ['src_wall'], {
      id: 'prefab_surf',
      name: 'Surf Wall',
    });
    expect(created.ok).toBe(true);
    const templateBrush = created.definition.actors[0].components[0];
    expect(templateBrush.faceMaterials.pz).toBe('mat_stone');
    expect(templateBrush.faceUVs.pz.offset.x).toBeCloseTo(0.25, 5);

    const i1 = instantiatePrefab(created.definition, world, {
      position: { x: 100, y: 0, z: 0 },
    });
    const i2 = instantiatePrefab(created.definition, world, {
      position: { x: 400, y: 0, z: 0 },
    });
    const id1 = i1.rootActorIds[0];
    const id2 = i2.rootActorIds[0];
    let root1 = world.getActor(id1);
    let root2 = world.getActor(id2);
    expect(root1.getComponent('Brush').faceUVs.pz.offset.x).toBeCloseTo(0.25, 5);
    expect(root2.getComponent('Brush').faceMaterials.py).toBe('mat_trim');

    // Override face UV on instance 1 only.
    setOverride(root1, root1.prefab.templateId, {
      components: {
        Brush: {
          faceUVs: {
            pz: { scale: { x: 1, y: 1 }, offset: { x: 0.8, y: 0 }, rotation: 0 },
          },
        },
      },
    });

    // Source update: change material + UV; override should keep instance-1 UV.
    created.definition.actors[0].components[0].faceMaterials = { pz: 'mat_new', py: 'mat_trim' };
    created.definition.actors[0].components[0].faceUVs = {
      pz: { scale: { x: 1, y: 1 }, offset: { x: 0.1, y: 0 }, rotation: 0 },
    };
    const normalized = normalizePrefabDefinition(created.definition);
    syncPrefabInstances(world, normalized);

    // Re-fetch after sync (instances are rebuilt; ids are preserved).
    root1 = world.getActor(id1);
    root2 = world.getActor(id2);
    expect(root1.getComponent('Brush').faceUVs.pz.offset.x).toBeCloseTo(0.8, 5);
    expect(root1.getComponent('Brush').faceMaterials.pz).toBe('mat_new');
    expect(root2.getComponent('Brush').faceUVs.pz.offset.x).toBeCloseTo(0.1, 5);
    expect(root2.getComponent('Brush').faceMaterials.pz).toBe('mat_new');
  });

  it('Play/Stop snapshot restores materialId, faceMaterials and faceUVs', () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, 'public/levels/acceptance-surfaces.json'), 'utf8'),
    );
    const world = deserializeLevel(raw);
    const authoredSnapshot = serializeLevel(world);
    const wall = world.getActor('actor_wall');
    const brush = wall.getComponent('Brush');
    const original = surfaceBlob(brush);

    // Simulate play-time mutations that must not survive Stop.
    brush.materialId = 'mat_mutated';
    brush.faceMaterials = { pz: 'mat_mutated_face' };
    brush.faceUVs = {
      pz: { scale: { x: 9, y: 9 }, offset: { x: 9, y: 9 }, rotation: 90 },
    };

    const restored = deserializeLevel(authoredSnapshot);
    expect(surfaceBlob(restored.getActor('actor_wall').getComponent('Brush'))).toEqual(original);
    expect(surfaceBlob(restored.getActor('actor_align_b').getComponent('Brush')))
      .toEqual(surfaceBlob(
        deserializeLevel(authoredSnapshot).getActor('actor_align_b').getComponent('Brush'),
      ));
  });

  it('material asset drafts stay local until Save (shared-asset editing contract)', () => {
    const persisted = createMaterialDefinition({
      id: 'mat_shared',
      name: 'Shared',
      roughness: 0.8,
      baseColor: '#aabbcc',
    });
    const baseline = cloneMaterialDraft(persisted);
    const draft = cloneMaterialDraft(persisted);
    draft.roughness = 0.2;
    draft.name = 'Shared Edited';
    expect(isMaterialDraftDirty(baseline, draft)).toBe(true);
    expect(persisted.roughness).toBe(0.8);
    expect(persisted.name).toBe('Shared');

    const payload = materialDraftToSavePayload(draft);
    expect(payload.roughness).toBe(0.2);
    expect(payload.id).toBe('mat_shared');
    // Cancel path: restore baseline without writing persisted.
    const cancelled = cloneMaterialDraft(baseline);
    expect(cancelled.roughness).toBe(0.8);
    expect(isMaterialDraftDirty(baseline, cancelled)).toBe(false);
  });

  it('schemaVersion 1 levels without faceUVs remain compatible', () => {
    const raw = JSON.parse(
      readFileSync(path.join(root, 'public/levels/test-room.json'), 'utf8'),
    );
    // Force schema 1 shape: strip faceUVs if present and set version 1.
    const v1 = structuredClone(raw);
    v1.schemaVersion = 1;
    for (const actor of v1.actors || []) {
      for (const comp of actor.components || []) {
        delete comp.faceUVs;
      }
    }
    const world = deserializeLevel(v1);
    expect(world.actors.length).toBeGreaterThan(0);
    const wall = world.actors.find((a) => a.getComponent('Brush'));
    expect(wall.getComponent('Brush').faceUVs).toBeNull();
    const saved = serializeLevel(world);
    expect(saved.schemaVersion).toBe(2);
    const again = deserializeLevel(saved);
    expect(again.actors.length).toBe(world.actors.length);
  });
});
