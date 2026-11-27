/** Editor chrome uses a single Midnight palette (no theme switcher). */

export const COLOR_THEMES = [
  { id: 'midnight', label: 'Midnight' },
];

export const DEFAULT_COLOR_THEME = 'midnight';

export function normalizeColorTheme(_id) {
  return DEFAULT_COLOR_THEME;
}

/** Keep html attribute stable for any leftover CSS selectors. */
export function applyColorTheme(_id) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-bb-theme', DEFAULT_COLOR_THEME);
}
