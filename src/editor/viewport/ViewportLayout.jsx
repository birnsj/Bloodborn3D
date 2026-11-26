import { useCallback, useMemo, useRef } from 'react';
import {
  computePaneRects,
  normalizeLayoutMode,
} from './viewportPrefs.js';
import { orientPaneToCameraMode } from './viewportCameras.js';
import { ViewportPaneChrome } from './ViewportPaneChrome.jsx';

const DIVIDER_HIT = 10;

/**
 * Overlay layout chrome + hit targets above the shared WebGL canvas.
 * Does not own the canvas — parent passes prefs and change handlers.
 */
export function ViewportLayout({
  prefs,
  shellWidth,
  shellHeight,
  onChangePrefs,
  onActivatePane,
  onResetCamera,
  marqueeRect,
  children,
}) {
  const dragRef = useRef(null);

  const rects = useMemo(
    () => computePaneRects(prefs, shellWidth || 1, shellHeight || 1),
    [prefs, shellWidth, shellHeight],
  );

  const paneById = useMemo(() => {
    const map = new Map();
    for (const p of prefs.panes) map.set(p.id, p);
    return map;
  }, [prefs.panes]);

  const beginSplitDrag = useCallback((axis, event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = {
      splitX: prefs.splitX,
      splitY: prefs.splitY,
      splitY2: prefs.splitY2,
    };
    dragRef.current = { axis, startX, startY, start };

    const clampSplit = (v) => Math.min(0.85, Math.max(0.15, v));

    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const w = Math.max(1, shellWidth);
      const h = Math.max(1, shellHeight);
      // Only patch the axis being dragged — leave the other split alone.
      if (d.axis === 'x') {
        onChangePrefs({
          ...prefs,
          splitX: clampSplit(d.start.splitX + (e.clientX - d.startX) / w),
        });
        return;
      }
      if (d.axis === 'y') {
        onChangePrefs({
          ...prefs,
          splitY: clampSplit(d.start.splitY + (e.clientY - d.startY) / h),
        });
        return;
      }
      if (d.axis === 'y2') {
        onChangePrefs({
          ...prefs,
          splitY2: clampSplit(d.start.splitY2 + (e.clientY - d.startY) / h),
        });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [prefs, shellWidth, shellHeight, onChangePrefs]);

  const layoutMode = normalizeLayoutMode(
    prefs.maximizedPaneId ? 'single' : prefs.layoutMode,
  );
  const showDividers = !prefs.maximizedPaneId;

  return (
    <div className="bb-viewport-layout">
      {children}
      <div className="bb-viewport-panes" aria-hidden={false}>
        {rects.map((rect) => {
          const pane = paneById.get(rect.paneId);
          if (!pane) return null;
          const active = prefs.activePaneId === pane.id;
          return (
            <div
              key={pane.id}
              className={`bb-viewport-pane${active ? ' bb-viewport-pane--active' : ''}`}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }}
              onPointerDown={(e) => {
                if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
                onActivatePane?.(pane.id);
              }}
            >
              <ViewportPaneChrome
                pane={pane}
                active={active}
                maximized={prefs.maximizedPaneId === pane.id}
                layoutMode={prefs.layoutMode}
                onCameraMode={(cameraMode) => {
                  const panes = prefs.panes.map((p) => (
                    p.id === pane.id ? orientPaneToCameraMode(p, cameraMode) : p
                  ));
                  onChangePrefs({ ...prefs, panes, activePaneId: pane.id });
                }}
                onDisplayMode={(displayMode) => {
                  const panes = prefs.panes.map((p) => (
                    p.id === pane.id ? { ...p, displayMode } : p
                  ));
                  onChangePrefs({ ...prefs, panes, activePaneId: pane.id });
                }}
                onToggleShowFog={() => {
                  const panes = prefs.panes.map((p) => (
                    p.id === pane.id ? { ...p, showFog: p.showFog === false } : p
                  ));
                  onChangePrefs({ ...prefs, panes, activePaneId: pane.id });
                }}
                onToggleShowPostProcessing={() => {
                  const panes = prefs.panes.map((p) => (
                    p.id === pane.id
                      ? { ...p, showPostProcessing: p.showPostProcessing === false }
                      : p
                  ));
                  onChangePrefs({ ...prefs, panes, activePaneId: pane.id });
                }}
                onLayoutMode={(layoutMode) => {
                  onChangePrefs({
                    ...prefs,
                    layoutMode,
                    // Layout buttons always re-center pane splits.
                    splitX: 0.5,
                    splitY: 0.5,
                    splitY2: 0.5,
                    maximizedPaneId: null,
                    maximizeRestore: null,
                    activePaneId: pane.id,
                  });
                }}
                onResetCamera={() => onResetCamera?.(pane.id)}
                onToggleMaximize={() => {
                  if (prefs.maximizedPaneId === pane.id) {
                    const restore = prefs.maximizeRestore || {};
                    onChangePrefs({
                      ...prefs,
                      maximizedPaneId: null,
                      maximizeRestore: null,
                      layoutMode: restore.layoutMode || prefs.layoutMode,
                      splitX: restore.splitX ?? prefs.splitX,
                      splitY: restore.splitY ?? prefs.splitY,
                      splitY2: restore.splitY2 ?? prefs.splitY2,
                      activePaneId: pane.id,
                    });
                  } else {
                    onChangePrefs({
                      ...prefs,
                      maximizedPaneId: pane.id,
                      maximizeRestore: {
                        layoutMode: prefs.layoutMode,
                        splitX: prefs.splitX,
                        splitY: prefs.splitY,
                        splitY2: prefs.splitY2,
                      },
                      activePaneId: pane.id,
                    });
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      {showDividers && layoutMode === 'dual-h' && (
        <div
          className="bb-viewport-divider bb-viewport-divider--v"
          style={{ left: prefs.splitX * (shellWidth || 0) - DIVIDER_HIT / 2 }}
          onPointerDown={(e) => beginSplitDrag('x', e)}
        />
      )}
      {showDividers && layoutMode === 'dual-v' && (
        <div
          className="bb-viewport-divider bb-viewport-divider--h"
          style={{ top: prefs.splitY * (shellHeight || 0) - DIVIDER_HIT / 2 }}
          onPointerDown={(e) => beginSplitDrag('y', e)}
        />
      )}
      {showDividers && layoutMode === 'triple' && (
        <>
          <div
            className="bb-viewport-divider bb-viewport-divider--v"
            style={{ left: prefs.splitX * (shellWidth || 0) - DIVIDER_HIT / 2 }}
            onPointerDown={(e) => beginSplitDrag('x', e)}
          />
          <div
            className="bb-viewport-divider bb-viewport-divider--h"
            style={{
              left: prefs.splitX * (shellWidth || 0),
              width: (1 - prefs.splitX) * (shellWidth || 0),
              top: prefs.splitY2 * (shellHeight || 0) - DIVIDER_HIT / 2,
            }}
            onPointerDown={(e) => beginSplitDrag('y2', e)}
          />
        </>
      )}
      {showDividers && layoutMode === 'quad' && (
        <>
          <div
            className="bb-viewport-divider bb-viewport-divider--v"
            style={{ left: prefs.splitX * (shellWidth || 0) - DIVIDER_HIT / 2 }}
            onPointerDown={(e) => beginSplitDrag('x', e)}
            title="Resize columns"
          />
          <div
            className="bb-viewport-divider bb-viewport-divider--h"
            style={{
              left: 0,
              width: prefs.splitX * (shellWidth || 0),
              top: prefs.splitY * (shellHeight || 0) - DIVIDER_HIT / 2,
            }}
            onPointerDown={(e) => beginSplitDrag('y', e)}
            title="Resize left row split"
          />
          <div
            className="bb-viewport-divider bb-viewport-divider--h"
            style={{
              left: prefs.splitX * (shellWidth || 0),
              width: (1 - prefs.splitX) * (shellWidth || 0),
              top: prefs.splitY2 * (shellHeight || 0) - DIVIDER_HIT / 2,
            }}
            onPointerDown={(e) => beginSplitDrag('y2', e)}
            title="Resize right row split"
          />
        </>
      )}

      {marqueeRect && (
        <div
          className="bb-viewport-marquee"
          style={{
            left: Math.min(marqueeRect.x0, marqueeRect.x1),
            top: Math.min(marqueeRect.y0, marqueeRect.y1),
            width: Math.abs(marqueeRect.x1 - marqueeRect.x0),
            height: Math.abs(marqueeRect.y1 - marqueeRect.y0),
          }}
        />
      )}
    </div>
  );
}

