/**
 * Convert a DOM top-left pane rect to WebGL bottom-left scissor/viewport
 * coordinates in CSS/logical pixels.
 *
 * Three.js setViewport/setScissor multiply by pixelRatio internally — callers
 * must pass logical pixels, not device pixels.
 */
export function paneScissorFromDomRect(rect, canvasHeightCss) {
  const h = Math.max(1, Number(canvasHeightCss) || 1);
  const x = Math.round(Number(rect?.x) || 0);
  const y = Math.round(Number(rect?.y) || 0);
  const width = Math.max(1, Math.round(Number(rect?.width) || 0));
  const height = Math.max(1, Math.round(Number(rect?.height) || 0));
  return {
    x,
    y: Math.round(h - y - height),
    width,
    height,
  };
}
