import { describe, expect, it } from 'vitest';
import {
  BOX_SURFACE_IDS,
  RAMP_SURFACE_IDS,
  STAIR_WEDGE_SURFACE_IDS,
  normalizeFaceMaterials,
  resolveSurfaceMaterialId,
  surfaceIdFromBoxFaceIndex,
  surfaceIdFromHit,
  patchFaceMaterial,
  applySurfaceGroups,
} from '../runtime/surfaces.js';
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
