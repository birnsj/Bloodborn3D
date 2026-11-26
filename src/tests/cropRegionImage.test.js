import { describe, expect, it } from 'vitest';
import { regionToPixelRect } from '../editor/projectArt/cropRegionImage.js';

describe('cropRegionImage — regionToPixelRect', () => {
  it('maps normalized region to clamped pixel rect', () => {
    const rect = regionToPixelRect(
      { x: 0.1, y: 0.2, width: 0.4, height: 0.3 },
      1000,
      800,
    );
    expect(rect).toEqual({
      sx: 100,
      sy: 160,
      sw: 400,
      sh: 240,
      naturalWidth: 1000,
      naturalHeight: 800,
    });
  });

  it('clamps overflow and keeps at least 1px', () => {
    const rect = regionToPixelRect(
      { x: 0.95, y: 0.95, width: 0.2, height: 0.2 },
      100,
      100,
    );
    expect(rect.sx).toBe(95);
    expect(rect.sy).toBe(95);
    expect(rect.sw).toBe(5);
    expect(rect.sh).toBe(5);
  });
});
