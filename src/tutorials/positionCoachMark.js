/**
 * Place a floating coach-mark card near a target rect with an arrow edge.
 */

export function positionCoachMark({
  anchor,
  panelWidth = 320,
  panelHeight = 220,
  layerWidth,
  layerHeight,
  gap = 14,
  margin = 10,
}) {
  const width = Math.min(panelWidth, Math.max(200, layerWidth - margin * 2));
  const height = panelHeight;

  const candidates = [
    {
      placement: 'below',
      left: anchor.left + (anchor.width - width) / 2,
      top: anchor.bottom + gap,
    },
    {
      placement: 'above',
      left: anchor.left + (anchor.width - width) / 2,
      top: anchor.top - gap - height,
    },
    {
      placement: 'right',
      left: anchor.right + gap,
      top: anchor.top + (anchor.height - height) / 2,
    },
    {
      placement: 'left',
      left: anchor.left - gap - width,
      top: anchor.top + (anchor.height - height) / 2,
    },
  ];

  const score = (c) => {
    let s = 0;
    if (c.left >= margin) s += 2;
    if (c.top >= margin) s += 2;
    if (c.left + width <= layerWidth - margin) s += 2;
    if (c.top + height <= layerHeight - margin) s += 2;
    // Prefer below / right for toolbars
    if (c.placement === 'below') s += 1.5;
    if (c.placement === 'right') s += 1;
    return s;
  };

  candidates.sort((a, b) => score(b) - score(a));
  let best = candidates[0];

  let left = Math.min(layerWidth - margin - width, Math.max(margin, best.left));
  let top = Math.min(layerHeight - margin - height, Math.max(margin, best.top));

  // Arrow tip aims at anchor center from card edge
  const anchorCx = anchor.left + anchor.width / 2;
  const anchorCy = anchor.top + anchor.height / 2;
  let arrow = { side: best.placement, offset: 0 };

  if (best.placement === 'below' || best.placement === 'above') {
    arrow.offset = Math.min(width - 20, Math.max(20, anchorCx - left));
  } else {
    arrow.offset = Math.min(height - 20, Math.max(20, anchorCy - top));
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    placement: best.placement,
    arrow,
  };
}

export function getTutorialAnchorRect(highlightIds = []) {
  for (const id of highlightIds) {
    const el = document.querySelector(`[data-bb-tutorial="${String(id).replace(/"/g, '')}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) continue;
    return { rect, id, el };
  }
  // Fallback: viewport canvas / workspace center
  const canvas = document.querySelector('.bb-viewport canvas, canvas');
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    return { rect, id: null, el: canvas };
  }
  const shell = document.querySelector('.bb-app');
  if (shell) {
    const rect = shell.getBoundingClientRect();
    const mid = {
      left: rect.left + rect.width * 0.35,
      top: rect.top + rect.height * 0.35,
      width: rect.width * 0.3,
      height: 40,
      right: rect.left + rect.width * 0.65,
      bottom: rect.top + rect.height * 0.35 + 40,
    };
    return { rect: mid, id: null, el: null };
  }
  return null;
}
