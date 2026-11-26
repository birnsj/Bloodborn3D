import { describe, expect, it } from 'vitest';
import {
  BASIC_SURFACE_UV_SCALES,
  brushFaceSizeEditorUnits,
  canFitSurfaceFace,
  computeFitSurfaceUv,
  structuralFaceSizeEditorUnits,
} from '../rules/faceUvFit.js';
import { TEXTURE_TILE_EDITOR_UNITS } from '../runtime/uvMapping.js';

describe('faceUvFit', () => {
  it('exposes basic scale presets', () => {
    expect(BASIC_SURFACE_UV_SCALES.map((p) => p.id)).toEqual(['1x1', '2x2', '0.5x0.5']);
  });

  it('measures box brush face extents', () => {
    const size = { x: 600, y: 300, z: 20 };
    expect(brushFaceSizeEditorUnits(size, 'pz')).toEqual({ u: 600, v: 300 });
    expect(brushFaceSizeEditorUnits(size, 'px')).toEqual({ u: 20, v: 300 });
    expect(brushFaceSizeEditorUnits(size, 'py')).toEqual({ u: 600, v: 20 });
    expect(structuralFaceSizeEditorUnits({ type: 'Brush', size }, 'nz')).toEqual({ u: 600, v: 300 });
    expect(structuralFaceSizeEditorUnits({ type: 'Ramp', size }, 'slope')).toBeNull();
    expect(canFitSurfaceFace({ type: 'Brush', size }, 'px')).toBe(true);
  });

  it('measures column shaft / cap faces', () => {
    const column = {
      type: 'Column',
      height: 300,
      radius: 25,
      baseEnabled: false,
      capitalEnabled: false,
    };
    const shaft = structuralFaceSizeEditorUnits(column, 'shaft');
    expect(shaft.u).toBeCloseTo(Math.PI * 50, 5);
    expect(shaft.v).toBe(300);
    expect(structuralFaceSizeEditorUnits(column, 'capTop')).toEqual({ u: 50, v: 50 });
    expect(canFitSurfaceFace(column, 'shaft')).toBe(true);
  });

  it('fits horizontal so one material tile spans face U', () => {
    const faceSizeEu = { u: 600, v: 300 };
    // densityU = 6; mat.uvScale.x = 1/6 → surface scale.x = 1
    const fitted = computeFitSurfaceUv({
      faceSizeEu,
      actorUv: { scale: { x: 1, y: 1 } },
      materialUvScale: { x: 1 / 6, y: 1 / 6 },
      axis: 'u',
    });
    expect(fitted.scale.x).toBeCloseTo(1, 5);
    expect(fitted.offset).toEqual({ x: 0, y: 0 });
    expect(fitted.rotation).toBe(0);
    // V left alone when axis is u — starts from identity current
    expect(fitted.scale.y).toBe(1);
  });

  it('fits vertical independently', () => {
    const faceSizeEu = { u: 600, v: 300 };
    const densityV = faceSizeEu.v / TEXTURE_TILE_EDITOR_UNITS;
    const fitted = computeFitSurfaceUv({
      faceSizeEu,
      materialUvScale: { x: 1, y: 1 },
      axis: 'v',
      currentSurfaceUv: { scale: { x: 2, y: 2 }, offset: { x: 1, y: 1 }, rotation: 15 },
    });
    expect(fitted.scale.x).toBe(2);
    expect(fitted.scale.y).toBeCloseTo(1 / densityV, 5);
    expect(fitted.offset).toEqual({ x: 0, y: 0 });
  });
});
