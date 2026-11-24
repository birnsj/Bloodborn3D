import { describe, expect, it } from 'vitest';
import { paneScissorFromDomRect } from '../editor/viewport/paneScissor.js';

describe('paneScissorFromDomRect', () => {
  it('flips DOM top-left rects to WebGL bottom-left logical pixels', () => {
    // Top-left quadrant of a 200×100 canvas
    const scissor = paneScissorFromDomRect(
      { x: 0, y: 0, width: 100, height: 50 },
      100,
    );
    expect(scissor).toEqual({ x: 0, y: 50, width: 100, height: 50 });
  });

  it('keeps bottom-right quadrant aligned without DPR scaling', () => {
    const scissor = paneScissorFromDomRect(
      { x: 100, y: 50, width: 100, height: 50 },
      100,
    );
    expect(scissor).toEqual({ x: 100, y: 0, width: 100, height: 50 });
  });
});
