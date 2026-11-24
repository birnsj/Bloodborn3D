import { describe, expect, it } from 'vitest';
import {
  clampViewportPrefs,
  computePaneRects,
  DEFAULT_VIEWPORT_PREFS,
  normalizeCameraMode,
  normalizeDisplayMode,
  orthoPlaneAxes,
  paneCountForLayout,
  paneIdAtPoint,
  pointerToPaneNdc,
} from '../editor/viewport/viewportPrefs.js';

describe('viewportPrefs', () => {
  it('defaults to quad Perspective/Top/Front/Right', () => {
    const p = clampViewportPrefs();
    expect(p.layoutMode).toBe('quad');
    expect(p.panes.map((x) => x.cameraMode)).toEqual([
      'perspective',
      'top',
      'front',
      'right',
    ]);
    expect(p.panes.every((x) => x.displayMode === 'lit')).toBe(true);
  });

  it('normalizes camera and display modes', () => {
    expect(normalizeCameraMode('top')).toBe('top');
    expect(normalizeCameraMode('nope')).toBe('perspective');
    expect(normalizeDisplayMode('wireframe')).toBe('wireframe');
    expect(normalizeDisplayMode('x')).toBe('lit');
  });

  it('computes pane counts and rects', () => {
    expect(paneCountForLayout('single')).toBe(1);
    expect(paneCountForLayout('dual-h')).toBe(2);
    expect(paneCountForLayout('triple')).toBe(3);
    expect(paneCountForLayout('quad')).toBe(4);

    const rects = computePaneRects(DEFAULT_VIEWPORT_PREFS, 200, 100);
    expect(rects).toHaveLength(4);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    expect(rects[1]).toMatchObject({ x: 100, y: 0, width: 100, height: 50 });
    expect(rects[2]).toMatchObject({ x: 0, y: 50, width: 100, height: 50 });
    expect(rects[3]).toMatchObject({ x: 100, y: 50, width: 100, height: 50 });
  });

  it('maximized pane fills the shell', () => {
    const prefs = clampViewportPrefs({
      maximizedPaneId: 'pane-2',
      maximizeRestore: { layoutMode: 'quad', splitX: 0.5, splitY: 0.5, splitY2: 0.5 },
    });
    const rects = computePaneRects(prefs, 400, 300);
    expect(rects).toHaveLength(1);
    expect(rects[0].paneId).toBe('pane-2');
    expect(rects[0].width).toBe(400);
    expect(rects[0].height).toBe(300);
  });

  it('hit-tests pane ids and NDC', () => {
    const prefs = DEFAULT_VIEWPORT_PREFS;
    expect(paneIdAtPoint(prefs, 200, 100, 10, 10)).toBe('pane-0');
    expect(paneIdAtPoint(prefs, 200, 100, 150, 10)).toBe('pane-1');
    expect(paneIdAtPoint(prefs, 200, 100, 10, 75)).toBe('pane-2');
    expect(paneIdAtPoint(prefs, 200, 100, 150, 75)).toBe('pane-3');

    const rect = { x: 100, y: 50, width: 100, height: 50 };
    const ndc = pointerToPaneNdc(rect, 150, 75);
    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });

  it('reports ortho plane axes', () => {
    expect(orthoPlaneAxes('top')).toEqual(['x', 'z']);
    expect(orthoPlaneAxes('front')).toEqual(['x', 'y']);
    expect(orthoPlaneAxes('right')).toEqual(['z', 'y']);
    expect(orthoPlaneAxes('perspective')).toEqual(['x', 'y', 'z']);
  });
});
