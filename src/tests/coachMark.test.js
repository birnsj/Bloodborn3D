import { describe, expect, it } from 'vitest';
import { positionCoachMark } from '../tutorials/positionCoachMark.js';

describe('positionCoachMark', () => {
  it('places the card near the anchor without leaving the layer', () => {
    const pos = positionCoachMark({
      anchor: { left: 100, top: 40, width: 80, height: 28, right: 180, bottom: 68 },
      panelWidth: 300,
      panelHeight: 200,
      layerWidth: 1200,
      layerHeight: 800,
    });
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.left + pos.width).toBeLessThanOrEqual(1200);
    expect(pos.arrow).toBeTruthy();
    expect(['below', 'above', 'left', 'right']).toContain(pos.placement);
  });

  it('keeps the card on-screen for edge anchors', () => {
    const pos = positionCoachMark({
      anchor: { left: 10, top: 10, width: 60, height: 24, right: 70, bottom: 34 },
      panelWidth: 320,
      panelHeight: 220,
      layerWidth: 800,
      layerHeight: 600,
    });
    expect(pos.left).toBeGreaterThanOrEqual(10);
    expect(pos.top).toBeGreaterThanOrEqual(10);
  });
});
