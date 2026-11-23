/**
 * Editor UI view scale — STA-style "make chrome larger/smaller in view"
 * without using browser zoom (which breaks the layout).
 *
 * Higher percent → larger on-screen controls (same idea as STA editorViewScale).
 */

export const VIEW_SCALES = [
  { id: 85, label: '85%', hint: 'More screen room' },
  { id: 100, label: '100%', hint: 'Default' },
  { id: 115, label: '115%', hint: 'Slightly larger UI' },
  { id: 125, label: '125%', hint: 'Comfortable on smaller monitors' },
  { id: 150, label: '150%', hint: 'Large UI' },
];

export const DEFAULT_VIEW_SCALE = 100;

export function normalizeViewScale(value) {
  const n = Number(value);
  if (VIEW_SCALES.some((entry) => entry.id === n)) return n;
  return DEFAULT_VIEW_SCALE;
}

export function stepViewScale(current, direction) {
  const ids = VIEW_SCALES.map((e) => e.id);
  const idx = ids.indexOf(normalizeViewScale(current));
  const next = Math.max(0, Math.min(ids.length - 1, idx + Math.sign(direction || 0)));
  return ids[next];
}

/** CSS scale factor for transform/zoom. */
export function viewScaleFactor(percent) {
  return normalizeViewScale(percent) / 100;
}
