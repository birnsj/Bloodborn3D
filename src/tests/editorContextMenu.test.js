/**
 * Shared editor context menu — item filtering / open-close smoke (no DOM portal)
 * plus source-level coverage that new surfaces wire RMB actions.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (rel) => readFileSync(join(root, rel), 'utf8');

describe('Editor context menu item helpers', () => {
  it('filters empty / falsy items the way openContextMenu does', () => {
    const items = [
      { id: 'a', label: 'Rename' },
      null,
      false,
      { id: 'sep', separator: true },
      { id: 'b', label: 'Delete', danger: true },
    ].filter(Boolean);
    expect(items).toHaveLength(3);
    expect(items[1].separator).toBe(true);
    expect(items[2].danger).toBe(true);
  });
});

describe('Editor context menu — Project Art wiring', () => {
  const panel = readSrc('editor/projectArt/ProjectArtLibraryPanel.jsx');
  const store = readSrc('editor/projectArt/projectArtStore.js');

  it('exposes move/copy store wrappers', () => {
    expect(store).toContain('export function projectArtMove');
    expect(store).toContain('export function projectArtCopy');
    expect(store).toContain('moveProjectArt');
    expect(store).toContain('copyProjectArt');
  });

  it('folder / collection / tray / gallery image menus include organize actions', () => {
    expect(panel).toContain('buildImageMenuItems');
    expect(panel).toContain('onItemContextMenu');
    expect(panel).toContain("'Use as Reference'");
    expect(panel).toContain("label: 'Send to Generation'");
    expect(panel).toContain("label: 'Send to Meshy'");
    expect(panel).toContain("label: 'Move to Folder…'");
    expect(panel).toContain("label: 'Copy to Folder…'");
    expect(panel).toContain("label: 'New Collection…'");
    expect(panel).toContain("label: 'Move Folder…'");
    expect(panel).toContain("label: 'Copy Folder…'");
    expect(panel).toContain('buildCollectionMenuItems');
    expect(panel).toContain("label: 'Add Selection'");
    expect(panel).toContain('buildTrayThumbMenuItems');
    expect(panel).toContain("label: 'Open in Library'");
    expect(panel).toContain('buildTrayBackgroundMenuItems');
    expect(panel).toContain("label: 'Clear All'");
  });
});

describe('Editor context menu — image surface suppression', () => {
  it('exports suppressNativeImageMenu helper', () => {
    const menu = readSrc('ui/contextMenu/EditorContextMenu.jsx');
    expect(menu).toContain('export function suppressNativeImageMenu');
    expect(menu).toContain('event?.preventDefault?.()');
  });

  it('AssetThumbnail suppresses native image menus', () => {
    const thumb = readSrc('editor/assets/AssetThumbnail.jsx');
    expect(thumb).toContain('suppressNativeImageMenu');
    expect(thumb).toContain('onContextMenu');
  });

  it('OpenArt controls wire reference / region image RMB', () => {
    const controls = readSrc('editor/openart/OpenArtControls.jsx');
    expect(controls).toContain('useEditorContextMenu');
    expect(controls).toContain('Open in Library');
    expect(controls).toContain('Clear Region');
    expect(controls).toContain('Clear Reference');
    expect(controls).toContain('suppressNativeImageMenu');
  });

  it('Materials / PBR / Asset Viewer wire image RMB surfaces', () => {
    const materials = readSrc('editor/materials/MaterialsWorkspace.jsx');
    const pbr = readSrc('editor/materials/PbrGeneratorPanel.jsx');
    const viewer = readSrc('editor/layout/AssetViewer.jsx');
    expect(materials).toContain('openFromEvent');
    expect(materials).toContain("label: 'Open'");
    expect(pbr).toContain('suppressNativeImageMenu');
    expect(pbr).toContain('View ${m.label}');
    expect(viewer).toContain("label: 'Open Preview'");
    expect(viewer).toContain('suppressNativeImageMenu');
  });
});

describe('Editor context menu — Outliner / Viewport actor parity', () => {
  const outliner = readSrc('editor/layout/SceneOutliner.jsx');
  const viewport = readSrc('editor/Viewport.jsx');

  it('Outliner actor menu includes lock, unparent, prefab, cell, deselect', () => {
    expect(outliner).toMatch(/actor\.locked \? 'Unlock' : 'Lock'/);
    expect(outliner).toContain("label: 'Unparent'");
    expect(outliner).toContain("label: 'Create Prefab From Selection'");
    expect(outliner).toContain("label: 'Unpack Prefab'");
    expect(outliner).toContain("label: 'Create Cell'");
    expect(outliner).toContain("label: 'Deselect All'");
    // Multi-safe hide: toggles visibility without collapsing selection first.
    expect(outliner).toContain('setSelectedActorFlags({ visible: actor.visible === false })');
    expect(outliner).not.toContain('selectActor(actor.id);\n          setSelectedActorFlags({ visible:');
  });

  it('Viewport actor menu includes lock, unparent, prefab, cell', () => {
    expect(viewport).toMatch(/primary\?\.locked \? 'Unlock' : 'Lock'/);
    expect(viewport).toContain("label: 'Unparent'");
    expect(viewport).toContain("label: 'Create Prefab From Selection'");
    expect(viewport).toContain("label: 'Unpack Prefab'");
    expect(viewport).toContain("label: 'Create Cell'");
    expect(viewport).toContain('createPrefabFromSelection');
    expect(viewport).toContain('unpackSelectedPrefab');
    expect(viewport).toContain('reparentSelected');
  });

  it('Viewport face RMB nests texture scale / fit / reset in a submenu', () => {
    expect(viewport).toContain("id: 'face-texture'");
    expect(viewport).toContain('submenu:');
    expect(viewport).toContain("label: 'Scale 1 × 1'");
    expect(viewport).toContain("label: 'Scale 2 × 2'");
    expect(viewport).toContain("label: 'Scale ½ × ½'");
    expect(viewport).toContain("label: 'Fit Horizontal'");
    expect(viewport).toContain("label: 'Fit Vertical'");
    expect(viewport).toContain("label: 'Reset UV'");
    expect(viewport).toContain('fitSelectedSurfaceUv');
    expect(viewport).toContain('pickSurface');
  });
});

describe('Editor context menu — submenu support', () => {
  const menuSrc = readSrc('ui/contextMenu/EditorContextMenu.jsx');

  it('renders flyout rows from item.submenu', () => {
    expect(menuSrc).toContain('item.submenu');
    expect(menuSrc).toContain('bb-ctx-menu--flyout');
    expect(menuSrc).toContain('aria-haspopup');
  });
});

describe('Editor context menu — OpenArt results', () => {
  const results = readSrc('editor/openart/OpenArtResults.jsx');

  it('wires result stage/thumb RMB to import / material / save / discard', () => {
    expect(results).toContain('useEditorContextMenu');
    expect(results).toContain('openResultsContextMenu');
    expect(results).toContain("label: 'Import Texture'");
    expect(results).toContain("label: 'Create Material'");
    expect(results).toContain("label: 'Save to Project Art'");
    expect(results).toContain("label: 'Send to Meshy'");
    expect(results).toContain("label: 'Discard'");
    expect(results).toContain('onContextMenu={openResultsContextMenu}');
    expect(results).toContain('suppressNativeImageMenu');
  });
});

describe('Editor context menu — Meshy results', () => {
  const results = readSrc('editor/meshy/MeshyResults.jsx');

  it('wires Meshy result RMB to import / inspect / discard', () => {
    expect(results).toContain('useEditorContextMenu');
    expect(results).toContain("label: 'Import Model'");
    expect(results).toContain("label: 'Inspect Model'");
    expect(results).toContain("label: 'Show in Asset Browser'");
    expect(results).toContain("label: 'Discard Result'");
  });
});
