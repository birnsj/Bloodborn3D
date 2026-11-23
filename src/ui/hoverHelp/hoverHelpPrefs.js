const STORAGE_KEY = 'bloodbound.editor.hoverHelp.v1';

export const DEFAULT_HOVER_HELP_PREFS = {
  showHoverHelp: true,
  delayMs: 500,
};

export function clampHoverHelpPrefs(partial = {}) {
  const next = { ...DEFAULT_HOVER_HELP_PREFS, ...partial };
  next.showHoverHelp = next.showHoverHelp !== false;
  const delay = Number(next.delayMs);
  next.delayMs = Number.isFinite(delay)
    ? Math.min(2000, Math.max(100, Math.round(delay)))
    : DEFAULT_HOVER_HELP_PREFS.delayMs;
  return next;
}

export function loadHoverHelpPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HOVER_HELP_PREFS };
    return clampHoverHelpPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_HOVER_HELP_PREFS };
  }
}

export function saveHoverHelpPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampHoverHelpPrefs(prefs)));
  } catch {
    /* ignore quota */
  }
}

export const HOVER_HELP_STORAGE_KEY = STORAGE_KEY;
