import { describe, expect, it } from 'vitest';
import {
  describeTilingDirection,
  resolveGenerationPixelSize,
} from '../editor/aiAssets/generationFrame.js';

describe('generation frame pixel size', () => {
  it('resolves known Nano Banana / OpenArt table sizes', () => {
    expect(resolveGenerationPixelSize({
      aspectRatio: '1:1',
      resolution: '2K',
    })).toMatchObject({ width: 2048, height: 2048, source: 'table' });

    expect(resolveGenerationPixelSize({
      aspectRatio: '16:9',
      resolution: '1K',
    })).toMatchObject({ width: 1376, height: 768, source: 'table' });

    expect(resolveGenerationPixelSize({
      aspectRatio: '9:16',
      resolution: '4K',
    })).toMatchObject({ width: 3072, height: 5504, source: 'table' });
  });

  it('prefers explicit width/height when provided', () => {
    expect(resolveGenerationPixelSize({
      aspectRatio: '1:1',
      resolution: '1K',
      width: 640,
      height: 480,
    })).toMatchObject({ width: 640, height: 480, source: 'explicit' });
  });

  it('describes tiling direction from checkboxes', () => {
    expect(describeTilingDirection({})).toBe('No tiling');
    expect(describeTilingDirection({ tileHorizontal: true })).toBe('Tiles horizontally');
    expect(describeTilingDirection({ tileVertical: true })).toBe('Tiles vertically');
    expect(describeTilingDirection({ tileHorizontal: true, tileVertical: true }))
      .toBe('Tiles horizontally and vertically');
  });
});
