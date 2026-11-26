import { describe, expect, it } from 'vitest';
import {
  clampViewportPrefs,
  computePaneRects,
  loadViewportPrefs,
  mergeViewportViewIntoPrefs,
  normalizeCameraMode,
  normalizeDisplayMode,
  orthoPlaneAxes,
  paneCountForLayout,
  paneIdAtPoint,
  pointerToPaneNdc,
  viewportViewFromPrefs,
} from '../editor/viewport/viewportPrefs.js';
import { resolvePointerInPanes } from '../editor/viewport/viewportRuntimeBridge.js';

describe('viewportPrefs', () => {
  it('defaults to a single perspective viewport', () => {
    const p = clampViewportPrefs();
    expect(p.layoutMode).toBe('single');
    expect(p.panes.map((x) => x.cameraMode)).toEqual([
      'perspective',
      'top',
      'front',
      'right',
    ]);
    expect(p.panes.every((x) => x.displayMode === 'lit')).toBe(true);
    expect(computePaneRects(p, 200, 100)).toHaveLength(1);
  });

  it('migrates v1 prefs to single-view v2', () => {
    const store = new Map();
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    try {
      store.set('bloodbound.editor.viewport.v1', JSON.stringify({
        layoutMode: 'quad',
        panes: [
          { id: 'pane-0', cameraMode: 'perspective', position: [1, 2, 3] },
          { id: 'pane-1', cameraMode: 'top' },
          { id: 'pane-2', cameraMode: 'front' },
          { id: 'pane-3', cameraMode: 'right' },
        ],
      }));
      const loaded = loadViewportPrefs();
      expect(loaded.layoutMode).toBe('single');
      expect(loaded.maximizedPaneId).toBeNull();
      expect(loaded.panes[0].position).toEqual([1, 2, 3]);
      expect(store.has('bloodbound.editor.viewport.v2')).toBe(true);
    } finally {
      globalThis.localStorage = original;
    }
  });

  it('normalizes camera and display modes', () => {
    expect(normalizeCameraMode('top')).toBe('top');
    expect(normalizeCameraMode('isometric')).toBe('isometric');
    expect(normalizeCameraMode('nope')).toBe('perspective');
    expect(normalizeDisplayMode('wireframe')).toBe('wireframe');
    expect(normalizeDisplayMode('x')).toBe('lit');
  });

  it('computes pane counts and rects', () => {
    expect(paneCountForLayout('single')).toBe(1);
    expect(paneCountForLayout('dual-h')).toBe(2);
    expect(paneCountForLayout('triple')).toBe(3);
    expect(paneCountForLayout('quad')).toBe(4);

    const quad = clampViewportPrefs({ layoutMode: 'quad' });
    const rects = computePaneRects(quad, 200, 100);
    expect(rects).toHaveLength(4);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 100, height: 50 });
    expect(rects[1]).toMatchObject({ x: 100, y: 0, width: 100, height: 50 });
    expect(rects[2]).toMatchObject({ x: 0, y: 50, width: 100, height: 50 });
    expect(rects[3]).toMatchObject({ x: 100, y: 50, width: 100, height: 50 });

    const independent = clampViewportPrefs({
      layoutMode: 'quad',
      splitX: 0.4,
      splitY: 0.3,
      splitY2: 0.7,
    });
    const indepRects = computePaneRects(independent, 200, 100);
    expect(indepRects[0]).toMatchObject({ x: 0, y: 0, width: 80, height: 30 });
    expect(indepRects[1]).toMatchObject({ x: 80, y: 0, width: 120, height: 70 });
    expect(indepRects[2]).toMatchObject({ x: 0, y: 30, width: 80, height: 70 });
    expect(indepRects[3]).toMatchObject({ x: 80, y: 70, width: 120, height: 30 });
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
    const prefs = clampViewportPrefs({ layoutMode: 'quad' });
    expect(paneIdAtPoint(prefs, 200, 100, 10, 10)).toBe('pane-0');
    expect(paneIdAtPoint(prefs, 200, 100, 150, 10)).toBe('pane-1');
    expect(paneIdAtPoint(prefs, 200, 100, 10, 75)).toBe('pane-2');
    expect(paneIdAtPoint(prefs, 200, 100, 150, 75)).toBe('pane-3');

    const rect = { x: 100, y: 50, width: 100, height: 50 };
    const ndc = pointerToPaneNdc(rect, 150, 75);
    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });

  it('maps pointer through UI-scaled shellRect into layout pane space', () => {
    const prefs = clampViewportPrefs({ layoutMode: 'dual-h', splitX: 0.5 });
    // Layout 200×100, painted at 1.25× → visual 250×125.
    const shellRect = { left: 0, top: 0, width: 250, height: 125 };
    const left = resolvePointerInPanes(prefs, 200, 100, 50, 40, shellRect);
    expect(left.paneId).toBe('pane-0');
    expect(left.localX).toBeCloseTo(40, 5);
    const right = resolvePointerInPanes(prefs, 200, 100, 200, 40, shellRect);
    expect(right.paneId).toBe('pane-1');
  });

  it('reports ortho plane axes', () => {
    expect(orthoPlaneAxes('top')).toEqual(['x', 'z']);
    expect(orthoPlaneAxes('front')).toEqual(['x', 'y']);
    expect(orthoPlaneAxes('right')).toEqual(['z', 'y']);
    expect(orthoPlaneAxes('perspective')).toEqual(['x', 'y', 'z']);
  });

  it('extracts layout viewportView without camera poses', () => {
    const prefs = clampViewportPrefs({
      layoutMode: 'quad',
      panes: [
        { id: 'pane-0', cameraMode: 'perspective', displayMode: 'lit', position: [9, 9, 9] },
        { id: 'pane-1', cameraMode: 'top', displayMode: 'wireframe' },
        { id: 'pane-2', cameraMode: 'front', displayMode: 'unlit' },
        { id: 'pane-3', cameraMode: 'right', displayMode: 'lit' },
      ],
    });
    const view = viewportViewFromPrefs(prefs);
    expect(view.layoutMode).toBe('quad');
    expect(view.panes[0]).toEqual({
      id: 'pane-0',
      cameraMode: 'perspective',
      displayMode: 'lit',
      showFog: true,
      showPostProcessing: true,
    });
    expect(view.panes[0].position).toBeUndefined();
  });

  it('merges layout viewportView while preserving poses', () => {
    const prefs = clampViewportPrefs({
      layoutMode: 'single',
      panes: [
        { id: 'pane-0', cameraMode: 'perspective', displayMode: 'lit', position: [1, 2, 3] },
        { id: 'pane-1', cameraMode: 'top', displayMode: 'lit', position: [0, 10, 0] },
        { id: 'pane-2', cameraMode: 'front', displayMode: 'lit' },
        { id: 'pane-3', cameraMode: 'right', displayMode: 'lit' },
      ],
    });
    const merged = mergeViewportViewIntoPrefs(prefs, {
      layoutMode: 'dual-h',
      panes: [
        { id: 'pane-0', cameraMode: 'perspective', displayMode: 'wireframe' },
        { id: 'pane-1', cameraMode: 'top', displayMode: 'unlit' },
      ],
    });
    expect(merged.layoutMode).toBe('dual-h');
    expect(merged.panes[0].position).toEqual([1, 2, 3]);
    expect(merged.panes[0].displayMode).toBe('wireframe');
    expect(merged.panes[1].position).toEqual([0, 10, 0]);
    expect(merged.maximizedPaneId).toBeNull();
  });
});
