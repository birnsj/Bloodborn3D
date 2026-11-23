import { DEFAULT_VIEW_SCALE, normalizeViewScale } from './viewScale.js';
import { DEFAULT_COLOR_THEME, normalizeColorTheme } from '../../ui/colorThemes.js';

const STORAGE_KEY_V1 = 'bloodbound.editor.layout.v1';
const STORAGE_KEY = 'bloodbound.editor.layout.v2';

export const WORKSPACES = [
  { id: 'level', label: 'Level Editor' },
  { id: 'world', label: 'World Map' },
  { id: 'characters', label: 'Characters' },
  { id: 'animation', label: 'Animation' },
  { id: 'materials', label: 'Materials' },
  { id: 'scripting', label: 'Visual Scripting' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'ui', label: 'UI Editor' },
  { id: 'ai', label: 'AI Assets' },
];

export const DEFAULT_LAYOUT = {
  workspace: 'level',
  outlinerVisible: true,
  detailsVisible: true,
  contentVisible: true,
  assetViewerVisible: true,
  /** Tutorials panel starts closed; open via Help → Tutorials. */
  tutorialsVisible: false,
  viewportMaximized: false,
  contentViewMode: 'grid',
  contentFolder: 'Materials',
  /** UI view scale percent (STA-style). Not browser zoom. */
  uiScale: DEFAULT_VIEW_SCALE,
  /** Editor color theme id (View → Theme). */
  colorTheme: DEFAULT_COLOR_THEME,
  /**
   * Serialized dockview layout (`api.toJSON()`).
   * null → apply default dock arrangement on next ready.
   */
  dockLayout: null,
  /** Active named workspace layout id (catalog lives separately). */
  activeLayoutId: 'factory-default',
};

export function clampLayout(partial) {
  const next = { ...DEFAULT_LAYOUT, ...partial };
  if (!WORKSPACES.some((w) => w.id === next.workspace)) {
    next.workspace = 'level';
  }
  next.uiScale = normalizeViewScale(next.uiScale);
  next.colorTheme = normalizeColorTheme(next.colorTheme);
  next.outlinerVisible = Boolean(next.outlinerVisible);
  next.detailsVisible = Boolean(next.detailsVisible);
  next.contentVisible = Boolean(next.contentVisible);
  next.assetViewerVisible = next.assetViewerVisible !== false;
  next.tutorialsVisible = Boolean(next.tutorialsVisible);
  next.viewportMaximized = Boolean(next.viewportMaximized);
  if (next.contentViewMode !== 'list' && next.contentViewMode !== 'grid') {
    next.contentViewMode = 'grid';
  }
  if (typeof next.contentFolder !== 'string' || !next.contentFolder) {
    next.contentFolder = DEFAULT_LAYOUT.contentFolder;
  }
  if (next.dockLayout != null && typeof next.dockLayout !== 'object') {
    next.dockLayout = null;
  }
  if (typeof next.activeLayoutId !== 'string' || !next.activeLayoutId) {
    next.activeLayoutId = DEFAULT_LAYOUT.activeLayoutId;
  }
  return next;
}

function migrateFromV1(raw) {
  try {
    const v1 = JSON.parse(raw);
    return clampLayout({
      workspace: v1.workspace,
      outlinerVisible: v1.outlinerVisible,
      detailsVisible: v1.detailsVisible,
      contentVisible: v1.contentVisible,
      viewportMaximized: false,
      contentViewMode: v1.contentViewMode,
      contentFolder: v1.contentFolder,
      uiScale: v1.uiScale,
      dockLayout: null,
    });
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function loadLayoutPrefs() {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      return clampLayout(JSON.parse(rawV2));
    }
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const migrated = migrateFromV1(rawV1);
      saveLayoutPrefs(migrated);
      return migrated;
    }
    return { ...DEFAULT_LAYOUT };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayoutPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampLayout(prefs)));
  } catch {
    /* ignore quota */
  }
}

/** Test helper — expose storage keys without coupling callers to internals. */
export const LAYOUT_STORAGE = {
  v1: STORAGE_KEY_V1,
  v2: STORAGE_KEY,
};

// Legacy size clamps removed from docking model; keep empty exports for older imports.
export const LAYOUT_MIN = {};
export const LAYOUT_MAX = {};
