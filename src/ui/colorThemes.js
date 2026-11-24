/** Editor color themes (View → Theme). Applied via data-bb-theme on <html>. */

export const COLOR_THEMES = [
  { id: 'bloodbound', label: 'BloodBound' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'forge', label: 'Forge' },
  { id: 'contrast', label: 'Contrast' },
];

export const DEFAULT_COLOR_THEME = 'midnight';

export function normalizeColorTheme(id) {
  if (COLOR_THEMES.some((t) => t.id === id)) return id;
  return DEFAULT_COLOR_THEME;
}

/** Apply theme to documentElement so portaled dialogs inherit tokens. */
export function applyColorTheme(id) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-bb-theme', normalizeColorTheme(id));
}
