/**
 * Place a floating help panel near an anchor rect without covering it.
 * All values are CSS pixels in the same coordinate space as the layer.
 */

export function positionHoverHelp({
  anchor,
  panelWidth = 300,
  panelHeight = 140,
  layerWidth,
  layerHeight,
  gap = 8,
  margin = 8,
}) {
  const width = Math.min(panelWidth, Math.max(120, layerWidth - margin * 2));
  const height = panelHeight;

  let left = anchor.left + (anchor.width - width) / 2;
  let top = anchor.bottom + gap;

  // Prefer below; flip above if needed
  if (top + height > layerHeight - margin) {
    top = anchor.top - gap - height;
  }
  if (top < margin) {
    top = Math.min(layerHeight - margin - height, Math.max(margin, anchor.bottom + gap));
  }

  // Horizontal clamp; nudge beside if still overlapping heavily
  left = Math.min(layerWidth - margin - width, Math.max(margin, left));

  // If still covering the control (narrow vertical space), push to the right of anchor
  const overlapsVertically = top < anchor.bottom && top + height > anchor.top;
  const overlapsHorizontally = left < anchor.right && left + width > anchor.left;
  if (overlapsVertically && overlapsHorizontally) {
    const rightSlot = anchor.right + gap;
    const leftSlot = anchor.left - gap - width;
    if (rightSlot + width <= layerWidth - margin) {
      left = rightSlot;
    } else if (leftSlot >= margin) {
      left = leftSlot;
    }
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
  };
}
