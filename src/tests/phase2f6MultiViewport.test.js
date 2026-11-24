import { describe, expect, it } from 'vitest';
import {
  clampViewportPrefs,
  computePaneRects,
  loadViewportPrefs,
  saveViewportPrefs,
} from '../editor/viewport/viewportPrefs.js';
import { buildViewportPanes } from '../editor/viewport/viewportRuntimeBridge.js';

describe('phase2f6 multi-viewport prefs + bridge', () => {
  it('persists and reloads viewport preferences', () => {
    const store = new Map();
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    };
    try {
      const prefs = clampViewportPrefs({
        layoutMode: 'triple',
        splitX: 0.4,
        panes: [
          { id: 'pane-0', cameraMode: 'perspective', displayMode: 'lit' },
          { id: 'pane-1', cameraMode: 'top', displayMode: 'wireframe' },
          { id: 'pane-2', cameraMode: 'front', displayMode: 'unlit' },
          { id: 'pane-3', cameraMode: 'right', displayMode: 'textured' },
        ],
      });
      const saved = saveViewportPrefs(prefs);
      expect(saved.layoutMode).toBe('triple');
      const loaded = loadViewportPrefs();
      expect(loaded.layoutMode).toBe('triple');
      expect(loaded.splitX).toBeCloseTo(0.4);
      expect(loaded.panes[1].displayMode).toBe('wireframe');
      expect(loaded.panes[2].cameraMode).toBe('front');
    } finally {
      globalThis.localStorage = original;
    }
  });

  it('builds one descriptor per visible pane without a SceneView', () => {
    const prefs = clampViewportPrefs({ layoutMode: 'quad' });
    const panes = buildViewportPanes(prefs, 800, 600, null);
    expect(panes).toHaveLength(4);
    expect(panes[0].cameraMode).toBe('perspective');
    expect(panes[1].cameraMode).toBe('top');
    expect(panes[2].rect.width).toBeGreaterThan(0);
    expect(panes.every((p) => p.displayMode === 'lit')).toBe(true);
  });

  it('computePaneRects dual-h and dual-v', () => {
    const h = computePaneRects(clampViewportPrefs({ layoutMode: 'dual-h' }), 100, 50);
    expect(h).toHaveLength(2);
    expect(h[0].width + h[1].width).toBe(100);
    const v = computePaneRects(clampViewportPrefs({ layoutMode: 'dual-v' }), 100, 50);
    expect(v).toHaveLength(2);
    expect(v[0].height + v[1].height).toBe(50);
  });
});
