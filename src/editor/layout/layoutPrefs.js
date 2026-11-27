import { DEFAULT_VIEW_SCALE, normalizeViewScale } from './viewScale.js';
import { DEFAULT_COLOR_THEME, normalizeColorTheme } from '../../ui/colorThemes.js';
import {
  DEFAULT_VIEWPORT_VIEW,
  normalizeViewportView,
} from '../viewport/viewportPrefs.js';

const STORAGE_KEY_V1 = 'bloodbound.editor.layout.v1';
const STORAGE_KEY = 'bloodbound.editor.layout.v2';

/**
 * Bump when the factory dock arrangement changes so existing sessions
 * pick up the new default once (named layouts keep their own snapshots).
 */
export const DOCK_FACTORY_REVISION = 4;

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
  /** Layers panel starts closed; open via Window → Layers. */
  layersVisible: false,
  viewportMaximized: false,
  /** Single/multi viewport chrome (also stored on named layouts). */
  viewportView: { ...DEFAULT_VIEWPORT_VIEW },
  contentViewMode: 'grid',
  contentFolder: 'Materials',
  /** Asset Viewer thumbnail size in CSS pixels. */
  contentThumbSize: 56,
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
  /** Tracks which factory dock arrangement this session last applied. */
  dockFactoryRevision: DOCK_FACTORY_REVISION,
};

export function clampLayout(partial = {}) {
  const raw = partial && typeof partial === 'object' ? partial : {};
  const next = { ...DEFAULT_LAYOUT, ...raw };
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
  next.layersVisible = Boolean(next.layersVisible);
  delete next.openartVisible; // retired — OpenArt lives in AI Assets workspace
  next.viewportMaximized = false;
  next.viewportView = normalizeViewportView(next.viewportView);
  if (next.contentViewMode !== 'list' && next.contentViewMode !== 'grid') {
    next.contentViewMode = 'grid';
  }
  if (typeof next.contentFolder !== 'string' || !next.contentFolder) {
    next.contentFolder = DEFAULT_LAYOUT.contentFolder;
  }
  {
    const thumb = Number(next.contentThumbSize);
    next.contentThumbSize = Number.isFinite(thumb)
      ? Math.min(128, Math.max(32, Math.round(thumb)))
      : DEFAULT_LAYOUT.contentThumbSize;
  }
  if (next.dockLayout != null && typeof next.dockLayout !== 'object') {
    next.dockLayout = null;
  }
  if (typeof next.activeLayoutId !== 'string' || !next.activeLayoutId) {
    next.activeLayoutId = DEFAULT_LAYOUT.activeLayoutId;
  }
  // Missing revision must stay 0 — do not inherit DEFAULT_LAYOUT's current rev
  // or factory-dock migrations never fire for older localStorage blobs.
  if (!Object.prototype.hasOwnProperty.call(raw, 'dockFactoryRevision')) {
    next.dockFactoryRevision = 0;
  } else {
    const rev = Number(raw.dockFactoryRevision);
    next.dockFactoryRevision = Number.isFinite(rev)
      ? Math.max(0, Math.floor(rev))
      : 0;
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
      const loaded = clampLayout(JSON.parse(rawV2));
      // One-shot: drop saved dock JSON when factory arrangement changes,
      // but only while still on the protected Default / Autosaved working copy.
      if (loaded.dockFactoryRevision < DOCK_FACTORY_REVISION) {
        // Always drop the saved dock so the new factory arrangement appears.
        const migrated = clampLayout({
          ...loaded,
          dockLayout: null,
          dockFactoryRevision: DOCK_FACTORY_REVISION,
        });
        saveLayoutPrefs(migrated);
        return migrated;
      }
      return loaded;
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
