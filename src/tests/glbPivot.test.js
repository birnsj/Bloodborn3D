import { describe, expect, it } from 'vitest';
import {
  MESHY_HUMAN_HEIGHT_METERS,
  buildTestTriangleGlb,
  computeGlbAabbMeters,
  normalizeMeshyImportGlb,
  rebakeGlbPivotToBottomCenter,
  shouldNormalizeMeshyHumanScale,
} from '../dev/mesh/glbPivot.js';

describe('glbPivot bottom-center rebake', () => {
  it('moves a raised/offset triangle so min.y=0 and xz center=0', () => {
    // Triangle centered around (2, 5, -1) with height span 2 → min.y=4
    const glb = buildTestTriangleGlb([
      1, 4, -1.5,
      3, 4, -1.5,
      2, 6, -0.5,
    ]);
    const before = computeGlbAabbMeters(glb);
    expect(before.min.y).toBeCloseTo(4, 5);
    expect(before.center.x).toBeCloseTo(2, 5);
    expect(before.center.z).toBeCloseTo(-1, 5);

    const result = rebakeGlbPivotToBottomCenter(glb);
    expect(result.changed).toBe(true);
    expect(result.pivot).toBe('bottom-center');
    expect(result.offset.x).toBeCloseTo(-2, 5);
    expect(result.offset.y).toBeCloseTo(-4, 5);
    expect(result.offset.z).toBeCloseTo(1, 5);

    const after = computeGlbAabbMeters(result.buffer);
    expect(after.min.y).toBeCloseTo(0, 5);
    expect(after.center.x).toBeCloseTo(0, 5);
    expect(after.center.z).toBeCloseTo(0, 5);
    expect(after.size.y).toBeCloseTo(before.size.y, 5);
  });

  it('is a no-op when already bottom-centered', () => {
    const glb = buildTestTriangleGlb([
      -1, 0, -1,
      1, 0, -1,
      0, 2, 1,
    ]);
    const result = rebakeGlbPivotToBottomCenter(glb);
    expect(result.changed).toBe(false);
    const after = computeGlbAabbMeters(result.buffer);
    expect(after.min.y).toBeCloseTo(0, 5);
    expect(after.center.x).toBeCloseTo(0, 5);
    expect(after.center.z).toBeCloseTo(0, 5);
  });

  it('accounts for node translation when measuring and rebaking', () => {
    const glb = buildTestTriangleGlb(
      [
        -0.5, 0, -0.5,
        0.5, 0, -0.5,
        0, 1, 0.5,
      ],
      { translation: [10, 3, -4] },
    );
    const before = computeGlbAabbMeters(glb);
    expect(before.min.y).toBeCloseTo(3, 5);
    expect(before.center.x).toBeCloseTo(10, 5);

    const result = rebakeGlbPivotToBottomCenter(glb);
    expect(result.changed).toBe(true);
    const after = computeGlbAabbMeters(result.buffer);
    expect(after.min.y).toBeCloseTo(0, 5);
    expect(after.center.x).toBeCloseTo(0, 5);
    expect(after.center.z).toBeCloseTo(0, 5);
  });
});

describe('Meshy import human-height normalize', () => {
  it('detects upright undersized character-like AABBs', () => {
    expect(shouldNormalizeMeshyHumanScale({ size: { x: 0.49, y: 0.95, z: 0.3 } })).toBe(true);
    expect(shouldNormalizeMeshyHumanScale({ size: { x: 0.8, y: 1.75, z: 0.4 } })).toBe(false);
    expect(shouldNormalizeMeshyHumanScale({ size: { x: 1.2, y: 0.4, z: 1.2 } })).toBe(false);
    expect(shouldNormalizeMeshyHumanScale({ size: { x: 0.05, y: 0.08, z: 0.05 } })).toBe(false);
  });

  it('pivots and scales an undersized upright mesh to ~1.75 m', () => {
    // ~0.95 m tall, centered like a Meshy character export
    const glb = buildTestTriangleGlb([
      -0.2, -0.475, -0.1,
      0.2, -0.475, -0.1,
      0, 0.475, 0.1,
    ]);
    const result = normalizeMeshyImportGlb(glb);
    expect(result.changed).toBe(true);
    expect(result.scaleApplied).toBeCloseTo(MESHY_HUMAN_HEIGHT_METERS / 0.95, 5);
    expect(result.targetHeightMeters).toBe(MESHY_HUMAN_HEIGHT_METERS);

    const after = computeGlbAabbMeters(result.buffer);
    expect(after.min.y).toBeCloseTo(0, 4);
    expect(after.center.x).toBeCloseTo(0, 4);
    expect(after.center.z).toBeCloseTo(0, 4);
    expect(after.size.y).toBeCloseTo(MESHY_HUMAN_HEIGHT_METERS, 3);
  });

  it('does not scale wide flat props', () => {
    const glb = buildTestTriangleGlb([
      -1, 0, -1,
      1, 0, -1,
      0, 0.3, 1,
    ]);
    const result = normalizeMeshyImportGlb(glb);
    expect(result.scaleApplied).toBe(1);
    expect(result.targetHeightMeters).toBeNull();
    const after = computeGlbAabbMeters(result.buffer);
    expect(after.size.y).toBeCloseTo(0.3, 5);
    expect(after.min.y).toBeCloseTo(0, 5);
  });
});
