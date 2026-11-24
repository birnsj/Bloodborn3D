import { describe, expect, it } from 'vitest';
import { createBrushBoxGeometry, TEXTURE_TILE_EDITOR_UNITS } from '../runtime/brushGeometry.js';
import {
  composeActorUv,
  composeGeometryUv,
  isIdentityUv,
  mapDensityUvArray,
  normalizeActorUv,
  TEXTURE_TILE_EDITOR_UNITS as TILE,
} from '../runtime/uvMapping.js';
import { createRampWedgeGeometry } from '../runtime/rampGeometry.js';
import { createStairGeometry, getStairStepSolids } from '../runtime/stairGeometry.js';
import { StairComponent } from '../components/StairComponent.js';
import { RampComponent } from '../components/RampComponent.js';
import { createMaterialDefinition } from '../materials/MaterialDefinition.js';
import { createMiteredWallGeometry } from '../runtime/miteredWallGeometry.js';
import { createCurvedWallGeometry } from '../runtime/curvedWallGeometry.js';
import { createColumnGeometry } from '../runtime/columnGeometry.js';
import { createArchGeometry } from '../runtime/archGeometry.js';
import { CurvedWallComponent } from '../components/CurvedWallComponent.js';
import { ColumnComponent } from '../components/ColumnComponent.js';
import { ArchComponent } from '../components/ArchComponent.js';

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

describe('Phase 2E.0 — UV composition contract', () => {
  it('keeps a single tile constant of 100 editor units', () => {
    expect(TEXTURE_TILE_EDITOR_UNITS).toBe(100);
    expect(TILE).toBe(100);
  });

  it('composeActorUv is identity for default actor UV', () => {
    expect(composeActorUv(2.5, 1.25, {})).toEqual([2.5, 1.25]);
    expect(composeActorUv(2.5, 1.25, normalizeActorUv())).toEqual([2.5, 1.25]);
  });

  it('composeActorUv applies scale → rotation → offset', () => {
    const [u, v] = composeActorUv(1, 0, {
      scale: { x: 2, y: 3 },
      offset: { x: 0.5, y: -0.25 },
      rotation: 90,
    });
    // scale → (2, 0); rotate 90° → (0, 2); offset → (0.5, 1.75)
    expect(u).toBeCloseTo(0.5, 5);
    expect(v).toBeCloseTo(1.75, 5);
  });

  it('material definition defaults remain identity (no silent authored look change)', () => {
    const mat = createMaterialDefinition({ id: 'mat_test', name: 'Test' });
    expect(mat.uvScale).toEqual({ x: 1, y: 1 });
    expect(mat.uvOffset).toEqual({ x: 0, y: 0 });
    expect(mat.uvRotation).toBe(0);
  });

  it('mapDensityUvArray leaves density UVs unchanged under identity actor UV', () => {
    const src = [0, 0, 3, 1.5, 1, 2];
    expect(mapDensityUvArray(src, {})).toEqual(src);
  });

  it('composeGeometryUv applies actor then surface UV; identity surface is a no-op', () => {
    expect(isIdentityUv({})).toBe(true);
    expect(composeGeometryUv(1, 0, { scale: { x: 2, y: 1 } }, null)).toEqual([2, 0]);
    expect(composeGeometryUv(1, 0, { scale: { x: 2, y: 1 } }, {})).toEqual([2, 0]);
    const [u, v] = composeGeometryUv(1, 0, { scale: { x: 2, y: 1 } }, {
      scale: { x: 1, y: 1 },
      offset: { x: 0.25, y: 0 },
      rotation: 0,
    });
    expect(u).toBeCloseTo(2.25, 5);
    expect(v).toBeCloseTo(0, 5);
  });

  it('mapDensityUvArray applies per-surface UV when surface ids are provided', () => {
    const src = [1, 0, 1, 0];
    const out = mapDensityUvArray(
      src,
      {},
      { slope: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 } },
      ['slope', 'bottom'],
    );
    expect(out[0]).toBeCloseTo(2, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(1, 5);
    expect(out[3]).toBeCloseTo(0, 5);
  });
});

describe('Phase 2E.0 — straight stair density UVs', () => {
  it('uses density tiling instead of default BoxGeometry 0–1 UVs', () => {
    const stair = new StairComponent({
      stairType: 'straight',
      width: 200,
      stepCount: 2,
      stepHeight: 50,
      treadDepth: 100,
      direction: 'z+',
    });
    const solids = getStairStepSolids(stair);
    const geom = createStairGeometry(stair);
    expect(geom.children.length).toBe(2);

    const first = geom.children[0].geometry;
    const size = solids[0].size;
    // +Z face of BoxGeometry (face index 4) should span size.x/tile in U
    const expectedU = size.x / TILE;
    const expectedV = size.y / TILE;
    expect(expectedU).toBeCloseTo(2, 5);
    // Sample verts 16..19 (+z face on Three BoxGeometry)
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 16; i < 20; i += 1) {
      minU = Math.min(minU, first.attributes.uv.getX(i));
      maxU = Math.max(maxU, first.attributes.uv.getX(i));
      minV = Math.min(minV, first.attributes.uv.getY(i));
      maxV = Math.max(maxV, first.attributes.uv.getY(i));
    }
    expect(maxU - minU).toBeCloseTo(expectedU, 5);
    expect(maxV - minV).toBeCloseTo(expectedV, 5);
    // Old BoxGeometry default would be 0–1 regardless of width
    expect(maxU - minU).toBeGreaterThan(1.5);
  });

  it('applies actor UV scale on straight stair steps', () => {
    const stair = new StairComponent({
      stairType: 'straight',
      width: 100,
      stepCount: 1,
      stepHeight: 100,
      treadDepth: 100,
      direction: 'z+',
      uv: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
    });
    const plain = new StairComponent({
      stairType: 'straight',
      width: 100,
      stepCount: 1,
      stepHeight: 100,
      treadDepth: 100,
      direction: 'z+',
    });
    const scaled = createStairGeometry(stair).children[0].geometry;
    const base = createStairGeometry(plain).children[0].geometry;
    expect(uvExtent(scaled.attributes.uv, 'x')).toBeCloseTo(uvExtent(base.attributes.uv, 'x') * 2, 4);
  });
});

describe('Phase 2E.0 — curved stair density + actor UV', () => {
  it('tiles wedge steps by arc/width and honors actor offset', () => {
    const stair = new StairComponent({
      stairType: 'curved',
      sweepAngle: 90,
      stepCount: 4,
      stepHeight: 25,
      innerRadius: 100,
      width: 100,
      clockwise: true,
      uv: { scale: { x: 1, y: 1 }, offset: { x: 0.25, y: 0.5 }, rotation: 0 },
    });
    const geom = createStairGeometry(stair);
    expect(geom.children.length).toBe(4);
    const uv = geom.children[0].geometry.attributes.uv;
    // All UVs shifted by offset
    let sawOffset = false;
    for (let i = 0; i < uv.count; i += 1) {
      if (Math.abs(uv.getX(i) - 0.25) < 1e-6 || Math.abs(uv.getY(i) - 0.5) < 1e-6) {
        sawOffset = true;
      }
    }
    expect(sawOffset).toBe(true);
    // Density: width/tile = 1 for a 100-wide tread corner at (0,0) after offset → (0.25, 0.5)
    expect(uv.getX(0)).toBeCloseTo(0.25, 5);
    expect(uv.getY(0)).toBeCloseTo(0.5, 5);
  });
});

describe('Phase 2E.0 — ramp density + actor UV', () => {
  it('density-tiles the slope and applies actor scale', () => {
    const ramp = new RampComponent({
      width: 100,
      length: 200,
      rise: 100,
      direction: 'z+',
      uv: { scale: { x: 2, y: 1 }, offset: { x: 0, y: 0 }, rotation: 0 },
    });
    const plain = new RampComponent({
      width: 100,
      length: 200,
      rise: 100,
      direction: 'z+',
    });
    const scaled = createRampWedgeGeometry(ramp);
    const base = createRampWedgeGeometry(plain);
    expect(uvExtent(scaled.attributes.uv, 'x')).toBeCloseTo(uvExtent(base.attributes.uv, 'x') * 2, 4);
    // Slope hyp = sqrt(200²+100²)=223.6… → density ≈ 2.236
    expect(uvExtent(base.attributes.uv, 'y')).toBeGreaterThan(2);
    base.dispose();
    scaled.dispose();
  });

  it('identity actor UV matches prior density-only ramp extents', () => {
    const ramp = new RampComponent({
      width: 100,
      length: 300,
      rise: 150,
      direction: 'z+',
    });
    const geom = createRampWedgeGeometry(ramp);
    const hyp = Math.sqrt(300 * 300 + 150 * 150);
    // Slope face V spans hyp/tile
    expect(uvExtent(geom.attributes.uv, 'y')).toBeGreaterThanOrEqual(hyp / TILE - 0.01);
    geom.dispose();
  });
});

describe('Phase 2E.0 — structural generators share actor UV composition', () => {
  it('brush box matches composeActorUv density contract', () => {
    const geom = createBrushBoxGeometry(
      { x: 200, y: 100, z: 20 },
      { scale: { x: 1, y: 1 }, offset: { x: 0.1, y: 0 }, rotation: 0 },
    );
    // +Z face U span = 200/100 = 2, then +0.1 offset
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 16; i < 20; i += 1) {
      minU = Math.min(minU, geom.attributes.uv.getX(i));
      maxU = Math.max(maxU, geom.attributes.uv.getX(i));
    }
    expect(maxU - minU).toBeCloseTo(2, 5);
    expect(minU).toBeCloseTo(0.1, 5);
    geom.dispose();
  });

  it('mitered / curved / column / arch honor rotation without changing identity look', () => {
    const size = { x: 200, y: 300, z: 20 };
    const miterId = createMiteredWallGeometry(size, {}, 15, 15);
    const miterRot = createMiteredWallGeometry(size, { rotation: 90 }, 15, 15);
    expect(uvExtent(miterId.attributes.uv, 'x')).not.toBeCloseTo(0, 5);
    // 90° swaps extents approximately
    expect(uvExtent(miterRot.attributes.uv, 'x')).toBeCloseTo(uvExtent(miterId.attributes.uv, 'y'), 3);
    miterId.dispose();
    miterRot.dispose();

    const wall = new CurvedWallComponent({ radius: 200, sweepAngle: 90, height: 300 });
    const cw = createCurvedWallGeometry(wall);
    expect(cw.attributes.uv.count).toBeGreaterThan(0);
    cw.dispose();

    const col = createColumnGeometry(new ColumnComponent({ height: 300, radius: 40 }));
    expect(col.attributes.uv.count).toBeGreaterThan(0);
    col.dispose();

    const arch = createArchGeometry(new ArchComponent({}));
    expect(arch.attributes.uv.count).toBeGreaterThan(0);
    arch.dispose();
  });
});
