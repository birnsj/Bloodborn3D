import { describe, expect, it } from 'vitest';
import {
  BOX_SURFACE_IDS,
  RAMP_SURFACE_IDS,
  STAIR_WEDGE_SURFACE_IDS,
  normalizeFaceMaterials,
  normalizeFaceUVs,
  patchFaceUv,
  resolveSurfaceMaterialId,
  getSurfaceUvOverrideOrDefault,
  semanticFaceKeyFromSurfaceId,
  surfaceIdFromBoxFaceIndex,
  surfaceIdFromHit,
  patchFaceMaterial,
  applySurfaceGroups,
  worldSolidPatchSurfaceId,
} from '../runtime/surfaces.js';
import { createBrushBoxGeometry } from '../runtime/brushGeometry.js';
import { createRampWedgeGeometry } from '../runtime/rampGeometry.js';
import { createStairGeometry } from '../runtime/stairGeometry.js';
import { createCurvedWallGeometry } from '../runtime/curvedWallGeometry.js';
import { createColumnGeometry } from '../runtime/columnGeometry.js';
import { createMiteredWallGeometry } from '../runtime/miteredWallGeometry.js';
import { createArchGeometry } from '../runtime/archGeometry.js';
import { RampComponent } from '../components/RampComponent.js';
import { StairComponent } from '../components/StairComponent.js';
import { CurvedWallComponent } from '../components/CurvedWallComponent.js';
import { ColumnComponent } from '../components/ColumnComponent.js';
import { ArchComponent } from '../components/ArchComponent.js';
import { BrushComponent } from '../components/BrushComponent.js';
import { Actor } from '../core/Actor.js';
import { World } from '../core/World.js';
import { serializeLevel } from '../serialization/LevelSerializer.js';
import { deserializeLevel } from '../serialization/LevelDeserializer.js';
import { HistoryStack } from '../editor/history/HistoryStack.js';
import { SetRampPropertiesCommand, SetBrushMaterialCommand } from '../editor/history/commands.js';
import * as THREE from 'three';

function uvExtent(attr, axis = 'x') {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < attr.count; i += 1) {
    const v = axis === 'x' ? attr.getX(i) : attr.getY(i);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return max - min;
}

describe('Phase 2E.1 — semantic surface IDs', () => {
  it('maps box triangle faceIndex to stable FACE_KEYS', () => {
    expect(surfaceIdFromBoxFaceIndex(0)).toBe('px');
    expect(surfaceIdFromBoxFaceIndex(1)).toBe('px');
    expect(surfaceIdFromBoxFaceIndex(2)).toBe('nx');
    expect(surfaceIdFromBoxFaceIndex(10)).toBe('nz');
  });

  it('normalizes faceMaterials and drops unknown keys', () => {
    expect(normalizeFaceMaterials({ px: 'mat_a', bogus: 'x' }, BOX_SURFACE_IDS)).toEqual({
      px: 'mat_a',
    });
    expect(normalizeFaceMaterials({}, BOX_SURFACE_IDS)).toBeNull();
  });

  it('keeps World Solid patch ids and resolves legacy face material fallbacks', () => {
    expect(worldSolidPatchSurfaceId('pz', 12)).toBe('pz#12');
    expect(semanticFaceKeyFromSurfaceId('pz#12')).toBe('pz');
    expect(normalizeFaceMaterials({ 'pz#3': 'mat_panel', px: 'mat_wall' }, null)).toEqual({
      'pz#3': 'mat_panel',
      px: 'mat_wall',
    });
    const brush = new BrushComponent({
      materialId: 'mat_actor',
      faceMaterials: { pz: 'mat_axis', 'pz#3': 'mat_panel' },
    });
    expect(resolveSurfaceMaterialId(brush, 'pz#3')).toBe('mat_panel');
    expect(resolveSurfaceMaterialId(brush, 'pz#9')).toBe('mat_axis');
    expect(resolveSurfaceMaterialId(brush, 'py#0')).toBe('mat_actor');
  });

  it('resolves surface material with actor fallback', () => {
    const ramp = new RampComponent({
      materialId: 'mat_actor',
      faceMaterials: { slope: 'mat_slope' },
    });
    expect(resolveSurfaceMaterialId(ramp, 'slope')).toBe('mat_slope');
    expect(resolveSurfaceMaterialId(ramp, 'bottom')).toBe('mat_actor');
  });

  it('patchFaceMaterial updates and clears overrides', () => {
    const brush = new BrushComponent({ materialId: 'mat_a' });
    const r1 = patchFaceMaterial(brush, 'pz', 'mat_b');
    expect(r1.after).toEqual({ pz: 'mat_b' });
    expect(brush.faceMaterials.pz).toBe('mat_b');
    const r2 = patchFaceMaterial(brush, 'pz', null);
    expect(r2.after).toBeNull();
    expect(brush.faceMaterials).toBeNull();
  });
});

describe('Phase 2E.1 — geometry surface groups', () => {
  it('ramp geometry exposes RAMP_SURFACE_IDS groups', () => {
    const geom = createRampWedgeGeometry(new RampComponent({
      width: 100, length: 200, rise: 100,
    }));
    expect(geom.userData.surfaceIds).toEqual(RAMP_SURFACE_IDS);
    expect(geom.groups.length).toBe(RAMP_SURFACE_IDS.length);
    geom.dispose();
  });

  it('curved stair wedges expose STAIR_WEDGE_SURFACE_IDS', () => {
    const stair = new StairComponent({
      stairType: 'curved',
      sweepAngle: 90,
      stepCount: 4,
      innerRadius: 80,
      width: 100,
    });
    const group = createStairGeometry(stair);
    const wedge = group.children[0].geometry;
    expect(wedge.userData.surfaceIds).toEqual(STAIR_WEDGE_SURFACE_IDS);
  });

  it('straight stair steps use box surface scheme', () => {
    const stair = new StairComponent({
      stairType: 'straight',
      stepCount: 2,
      width: 100,
      treadDepth: 50,
      stepHeight: 20,
    });
    const group = createStairGeometry(stair);
    // BoxGeometry from createBrushBoxGeometry — pick via scheme
    const mesh = new THREE.Mesh(group.children[0].geometry);
    mesh.userData.surfaceScheme = 'box';
    expect(surfaceIdFromHit(mesh, 0)).toBe('px');
  });

  it('curved wall / column / miter / arch emit surface groups', () => {
    const cw = createCurvedWallGeometry(new CurvedWallComponent({ sweepAngle: 90 }));
    expect(cw.userData.surfaceIds?.length).toBeGreaterThan(0);
    expect(cw.userData.surfaceIds).toContain('outer');
    cw.dispose();

    const col = createColumnGeometry(new ColumnComponent({}));
    expect(col.userData.surfaceIds).toContain('shaft');
    col.dispose();

    const miter = createMiteredWallGeometry({ x: 200, y: 300, z: 20 }, {}, 15, 15);
    expect(miter.userData.surfaceIds?.length).toBeGreaterThan(0);
    miter.dispose();

    const arch = createArchGeometry(new ArchComponent({}));
    expect(arch.userData.surfaceIds?.length).toBeGreaterThan(0);
    arch.dispose();
  });

  it('applySurfaceGroups aligns materialIndex with surface order', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(27), 3));
    const ids = applySurfaceGroups(geom, [
      { surfaceId: 'a', triCount: 1 },
      { surfaceId: 'b', triCount: 2 },
    ]);
    expect(ids).toEqual(['a', 'b']);
    expect(geom.groups[0]).toMatchObject({ start: 0, count: 3, materialIndex: 0 });
    expect(geom.groups[1]).toMatchObject({ start: 3, count: 6, materialIndex: 1 });
  });
});

describe('Phase 2E.1 — persistence and undo', () => {
  it('serializes faceMaterials on ramp/stair/brush and round-trips', () => {
    const world = new World({ name: 'surfaces', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'brush1',
      components: [new BrushComponent({
        materialId: 'mat_verify_wall',
        faceMaterials: { px: 'mat_hall_stone' },
      })],
    }));
    world.addActor(new Actor({
      id: 'ramp1',
      components: [new RampComponent({
        materialId: 'mat_verify_wall',
        faceMaterials: { slope: 'mat_hall_wood' },
      })],
    }));
    world.addActor(new Actor({
      id: 'stair1',
      components: [new StairComponent({
        materialId: 'mat_verify_wall',
        faceMaterials: { tread: 'mat_hall_floor', py: 'mat_hall_floor' },
      })],
    }));

    const round = deserializeLevel(serializeLevel(world));
    expect(round.getActor('brush1').getComponent('Brush').faceMaterials).toEqual({
      px: 'mat_hall_stone',
    });
    expect(round.getActor('ramp1').getComponent('Ramp').faceMaterials).toEqual({
      slope: 'mat_hall_wood',
    });
    expect(round.getActor('stair1').getComponent('Stair').faceMaterials.py).toBe('mat_hall_floor');
    expect(round.getActor('stair1').getComponent('Stair').faceMaterials.tread).toBe('mat_hall_floor');
  });

  it('undo/redo restores faceMaterials on ramp and brush', () => {
    const world = new World({ name: 'undo-surf' });
    const rampActor = new Actor({
      id: 'r',
      components: [new RampComponent({ materialId: 'mat_a' })],
    });
    const brushActor = new Actor({
      id: 'b',
      components: [new BrushComponent({ materialId: 'mat_a' })],
    });
    world.addActor(rampActor);
    world.addActor(brushActor);
    const history = new HistoryStack();

    history.execute(new SetRampPropertiesCommand({
      world,
      actorId: 'r',
      before: { faceMaterials: null },
      after: { faceMaterials: { slope: 'mat_b' } },
      label: 'Ramp surface',
    }));
    expect(world.getActor('r').getComponent('Ramp').faceMaterials.slope).toBe('mat_b');
    history.undo();
    expect(world.getActor('r').getComponent('Ramp').faceMaterials).toBeNull();
    history.redo();
    expect(world.getActor('r').getComponent('Ramp').faceMaterials.slope).toBe('mat_b');

    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'b',
      before: { faceMaterials: null },
      after: { faceMaterials: { ny: 'mat_c' } },
      label: 'Brush surface',
    }));
    expect(world.getActor('b').getComponent('Brush').faceMaterials.ny).toBe('mat_c');
    history.undo();
    expect(world.getActor('b').getComponent('Brush').faceMaterials).toBeNull();
  });
});

describe('Phase 2E.2 — per-surface UV', () => {
  it('normalizes faceUVs and drops identity / unknown keys', () => {
    expect(normalizeFaceUVs({
      pz: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
      px: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
      bogus: { scale: { x: 3, y: 3 } },
    }, BOX_SURFACE_IDS)).toEqual({
      pz: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
    });
    expect(normalizeFaceUVs({}, BOX_SURFACE_IDS)).toBeNull();
  });

  it('patchFaceUv updates and Reset clears to inherited defaults', () => {
    const brush = new BrushComponent({});
    expect(getSurfaceUvOverrideOrDefault(brush, 'pz')).toEqual({
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      rotation: 0,
    });
    patchFaceUv(brush, 'pz', {
      scale: { x: 2, y: 1 },
      offset: { x: 0.5, y: 0 },
      rotation: 15,
    });
    expect(brush.faceUVs.pz.scale.x).toBe(2);
    expect(getSurfaceUvOverrideOrDefault(brush, 'pz').offset.x).toBe(0.5);
    patchFaceUv(brush, 'pz', null);
    expect(brush.faceUVs).toBeNull();
  });

  it('brush face UV scales only the overridden face', () => {
    const base = createBrushBoxGeometry({ x: 200, y: 100, z: 20 }, {});
    const scaled = createBrushBoxGeometry(
      { x: 200, y: 100, z: 20 },
      {},
      { pz: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    );
    // Face pz is verts 16–19 in BoxGeometry
    const baseSpan = Math.abs(base.attributes.uv.getX(16) - base.attributes.uv.getX(17));
    const scaledSpan = Math.abs(scaled.attributes.uv.getX(16) - scaled.attributes.uv.getX(17));
    expect(scaledSpan).toBeCloseTo(baseSpan * 2, 4);
    // Unaffected face px verts 0–3 keep actor/density UVs
    expect(scaled.attributes.uv.getX(0)).toBeCloseTo(base.attributes.uv.getX(0), 5);
    base.dispose();
    scaled.dispose();
  });

  it('ramp slope face UV scales slope group verts only', () => {
    const base = createRampWedgeGeometry(new RampComponent({
      width: 100, length: 200, rise: 100,
    }));
    const scaled = createRampWedgeGeometry(new RampComponent({
      width: 100, length: 200, rise: 100,
      faceUVs: {
        slope: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
      },
    }));
    const slopeIdx = base.userData.surfaceIds.indexOf('slope');
    const bottomIdx = base.userData.surfaceIds.indexOf('bottom');
    const slopeGroup = base.groups[slopeIdx];
    const bottomGroup = base.groups[bottomIdx];
    const baseSlopeU = base.attributes.uv.getX(slopeGroup.start);
    const scaledSlopeU = scaled.attributes.uv.getX(slopeGroup.start + 1); // width/tile vertex
    const baseWidthU = base.attributes.uv.getX(slopeGroup.start + 1);
    expect(scaledSlopeU).toBeCloseTo(baseWidthU * 2, 4);
    expect(scaled.attributes.uv.getX(bottomGroup.start)).toBeCloseTo(
      base.attributes.uv.getX(bottomGroup.start),
      5,
    );
    void baseSlopeU;
    base.dispose();
    scaled.dispose();
  });

  it('column / curved wall / miter / arch accept faceUVs without identity change', () => {
    const colId = createColumnGeometry(new ColumnComponent({}));
    const colOv = createColumnGeometry(new ColumnComponent({
      faceUVs: { shaft: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    }));
    expect(uvExtent(colOv.attributes.uv, 'x')).toBeGreaterThan(uvExtent(colId.attributes.uv, 'x') * 0.9);
    colId.dispose();
    colOv.dispose();

    const cwId = createCurvedWallGeometry(new CurvedWallComponent({ sweepAngle: 90 }));
    const cwOv = createCurvedWallGeometry(new CurvedWallComponent({
      sweepAngle: 90,
      faceUVs: { outer: { scale: { x: 1, y: 1 }, offset: { x: 0.5, y: 0 }, rotation: 0 } },
    }));
    expect(cwOv.attributes.uv.getX(0)).not.toBeCloseTo(cwId.attributes.uv.getX(0), 5);
    cwId.dispose();
    cwOv.dispose();

    const miter = createMiteredWallGeometry(
      { x: 200, y: 300, z: 20 },
      {},
      15,
      15,
      { pz: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    );
    expect(miter.userData.surfaceIds?.length).toBeGreaterThan(0);
    miter.dispose();

    const arch = createArchGeometry(new ArchComponent({
      faceUVs: { front: { scale: { x: 1.5, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
    }));
    expect(arch.attributes.uv.count).toBeGreaterThan(0);
    arch.dispose();
  });

  it('serializes faceUVs and undo/redo restores them', () => {
    const world = new World({ name: 'face-uv', schemaVersion: 2 });
    world.addActor(new Actor({
      id: 'brush1',
      components: [new BrushComponent({
        faceUVs: {
          pz: { scale: { x: 2, y: 1 }, offset: { x: 0.25, y: 0 }, rotation: 0 },
        },
      })],
    }));
    world.addActor(new Actor({
      id: 'ramp1',
      components: [new RampComponent({
        faceUVs: {
          slope: { scale: { x: 1, y: 1 }, offset: { x: 0, y: 0.1 }, rotation: 0 },
        },
      })],
    }));

    const round = deserializeLevel(serializeLevel(world));
    expect(round.getActor('brush1').getComponent('Brush').faceUVs.pz.scale.x).toBe(2);
    expect(round.getActor('ramp1').getComponent('Ramp').faceUVs.slope.offset.y).toBeCloseTo(0.1, 5);

    const history = new HistoryStack();
    history.execute(new SetBrushMaterialCommand({
      world,
      actorId: 'brush1',
      before: { faceUVs: structuredClone(world.getActor('brush1').getComponent('Brush').faceUVs) },
      after: { faceUVs: null },
      label: 'Reset surface UV',
    }));
    expect(world.getActor('brush1').getComponent('Brush').faceUVs).toBeNull();
    history.undo();
    expect(world.getActor('brush1').getComponent('Brush').faceUVs.pz.scale.x).toBe(2);

    history.execute(new SetRampPropertiesCommand({
      world,
      actorId: 'ramp1',
      before: { faceUVs: structuredClone(world.getActor('ramp1').getComponent('Ramp').faceUVs) },
      after: {
        faceUVs: {
          slope: { scale: { x: 3, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
        },
      },
      label: 'Edit surface UV',
    }));
    expect(world.getActor('ramp1').getComponent('Ramp').faceUVs.slope.scale.x).toBe(3);
    history.undo();
    expect(world.getActor('ramp1').getComponent('Ramp').faceUVs.slope.offset.y).toBeCloseTo(0.1, 5);
  });
});
