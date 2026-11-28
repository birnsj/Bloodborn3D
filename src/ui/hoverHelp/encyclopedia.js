/**
 * Curated BloodBound editor/game glossary for Help → Encyclopedia…
 * Concept definitions — not a dump of hover-help control tips.
 */

/** @typedef {{
 *   id: string,
 *   term: string,
 *   category: string,
 *   body: string,
 *   seeAlso?: string[],
 * }} EncyclopediaEntry */

/** @type {readonly EncyclopediaEntry[]} */
export const ENCYCLOPEDIA_ENTRIES = Object.freeze([
  {
    id: 'actor',
    term: 'Actor',
    category: 'Editor shell',
    body: 'A placeable object in the level: brushes, lights, meshes, cells, spawns, and other components live on actors. The Outliner lists actors; Details edits the selection.',
    seeAlso: ['component', 'outliner', 'details'],
  },
  {
    id: 'additive-map',
    term: 'Additive map',
    category: 'Geometry',
    body: 'A level that starts empty. You build by placing additive brushes that contribute solid geometry. Map mode is chosen when creating the level and shown in Details → Level and the status bar.',
    seeAlso: ['subtractive-map', 'brush', 'world-solid'],
  },
  {
    id: 'subtractive-map',
    term: 'Subtractive map',
    category: 'Geometry',
    body: 'A level that starts with an invisible World Solid substrate. You carve rooms with subtract brushes; the walls you see are cut faces of that solid, not the cutter boxes themselves.',
    seeAlso: ['world-solid', 'subtract-brush', 'additive-map'],
  },
  {
    id: 'world-solid',
    term: 'World Solid',
    category: 'Geometry',
    body: 'The locked, invisible solid that fills a subtractive map. It cannot be moved like a normal brush but still accepts materials and Face Texture. Subtract cutters carve air out of it.',
    seeAlso: ['subtractive-map', 'subtract-brush'],
  },
  {
    id: 'brush',
    term: 'Brush',
    category: 'Geometry',
    body: 'Structural CSG volume used for architecture (box, wall, floor, ceiling, ramp, stairs, column, arch, curved wall). Additive brushes add solid; subtract brushes carve. Values use editor units.',
    seeAlso: ['subtract-brush', 'convex-brush', 'editor-units'],
  },
  {
    id: 'subtract-brush',
    term: 'Subtract brush',
    category: 'Geometry',
    body: 'A cutter volume that removes overlapping solid from additive brushes (including World Solid). Cutters are editor visuals for carving; they do not generate play-time colliders.',
    seeAlso: ['brush', 'world-solid', 'collider'],
  },
  {
    id: 'convex-brush',
    term: 'Convex Brush',
    category: 'Geometry',
    body: 'Editable convex solid with face/edge/vertex tools. Parametric brushes can convert to Convex when you need freeform face moves, extrude, or clip.',
    seeAlso: ['brush', 'extrude-clip', 'geometry-edit'],
  },
  {
    id: 'geometry-edit',
    term: 'Geometry edit',
    category: 'Selection',
    body: 'Face, Edge, and Vertex modes for ConvexBrush selection and Move. Marquee or click picks; the Move gizmo edits the selection. Parametric brushes convert first when needed.',
    seeAlso: ['convex-brush', 'surface'],
  },
  {
    id: 'extrude-clip',
    term: 'Extrude / Clip',
    category: 'Geometry',
    body: 'Face extrude grows a new prism sibling from a selected face. Clip keeps front, back, or splits a ConvexBrush with a cutting plane and preview. Enter commits; Esc cancels.',
    seeAlso: ['convex-brush', 'geometry-edit'],
  },
  {
    id: 'surface',
    term: 'Surface',
    category: 'Selection',
    body: 'A semantic face on structural geometry (wall, ramp, stair, column, arch, curved wall, brush). Surface mode picks one face for per-face material and UV in Details → Selected Surface.',
    seeAlso: ['face-material', 'align-neighbor', 'material'],
  },
  {
    id: 'face-material',
    term: 'Face material / UV',
    category: 'Assets',
    body: 'Optional per-surface material and UV (scale, offset, rotation) stored on the component as face maps. When empty, the actor material and actor UV apply. Identity UV preserves the authored look.',
    seeAlso: ['surface', 'material'],
  },
  {
    id: 'align-neighbor',
    term: 'Align to Neighbor',
    category: 'Selection',
    body: 'Toolbar Align mode for matching UV of coplanar Brush faces to a reference neighbor without world projection. Rejects incompatible face pairs; edits target faceUVs only.',
    seeAlso: ['surface', 'face-material'],
  },
  {
    id: 'cell',
    term: 'Cell',
    category: 'Editor shell',
    body: 'An empty organizational root actor for a room or section. Parent brushes, meshes, and lights under a Cell so you can move, hide, or select the group together. Independent of authoring layers.',
    seeAlso: ['actor', 'authoring-layer', 'outliner'],
  },
  {
    id: 'prefab',
    term: 'Prefab',
    category: 'Assets',
    body: 'A reusable actor hierarchy saved as a Content Browser asset. Place instances, record overrides, revert/apply, update from source, or unpack. Prefabs use the same engine-neutral actor/component JSON as levels.',
    seeAlso: ['actor', 'content-browser', 'component'],
  },
  {
    id: 'component',
    term: 'Component',
    category: 'Editor shell',
    body: 'Typed data on an actor (Transform, Brush, Light, StaticMesh, …). Schema fields serialize to JSON; runtime adapters draw and simulate them. Components stay engine-neutral in saved data.',
    seeAlso: ['actor', 'schema-version'],
  },
  {
    id: 'editor-units',
    term: 'Editor units (eu)',
    category: 'Units',
    body: 'Authoring length unit in the editor. 100 editor units = 1 meter. Conversion to engine meters happens only at the runtime boundary. Grid sizes and transforms are in eu.',
    seeAlso: ['grid-snap', 'measure'],
  },
  {
    id: 'grid-snap',
    term: 'Grid snap',
    category: 'Units',
    body: 'Placement and gizmo moves snap to the grid. Structural brushes snap by edges/faces; props, lights, and meshes by pivot. [ / ] cycle size; Shift+G toggles snap; Alt while dragging uses fine 1-unit move snap.',
    seeAlso: ['editor-units', 'pivot'],
  },
  {
    id: 'pivot',
    term: 'Pivot',
    category: 'Selection',
    body: 'The local origin used for transform, snap, and placement. Pivot edit mode and presets move the pivot relative to bounds without moving world geometry. Props snap by pivot; brushes by edges.',
    seeAlso: ['grid-snap', 'static-mesh'],
  },
  {
    id: 'measure',
    term: 'Measure',
    category: 'Units',
    body: 'Middle-mouse drag in the perspective viewport measures a distance. Display unit (eu / meters / etc.) comes from Edit → Settings. Shift+MMB pans instead.',
    seeAlso: ['editor-units'],
  },
  {
    id: 'player-spawn',
    term: 'Player Spawn',
    category: 'Editor shell',
    body: 'Marks where the player starts in Play and in the standalone player. Details show eye height and move speed. Levels should include a spawn for playable tests.',
    seeAlso: ['play-stop', 'standalone-player'],
  },
  {
    id: 'light',
    term: 'Light',
    category: 'Lighting',
    body: 'Placeable light actor (point, spot, directional, ambient, hemisphere, rect area). Type-specific fields, shadows, and helpers live under Details → Light. Distinct from World Ambient fill in World Settings.',
    seeAlso: ['world-settings', 'environment-actor'],
  },
  {
    id: 'environment-actor',
    term: 'Environment actor',
    category: 'Lighting',
    body: 'Placeable environmental object (sky/atmosphere helpers and related Batch 4 props). Complements World Settings scene background, fog, and HDRI environment map.',
    seeAlso: ['world-settings', 'light'],
  },
  {
    id: 'world-settings',
    term: 'World Settings',
    category: 'Lighting',
    body: 'Level-authored scene look in the Details panel World Settings tab: ambient fill, background, environment map, fog, atmosphere, renderer, and post-processing. Saved with the map for edit and Play.',
    seeAlso: ['light', 'material', 'play-stop'],
  },
  {
    id: 'static-mesh',
    term: 'Static Mesh',
    category: 'Assets',
    body: 'Actor that instances a mesh asset from the Content Browser. Supports materials, collision shapes, LOD, and rendering flags in Details. Distinct from procedural Primitive Mesh props.',
    seeAlso: ['primitive-mesh', 'content-browser', 'collider'],
  },
  {
    id: 'primitive-mesh',
    term: 'Primitive Mesh',
    category: 'Assets',
    body: 'Native/procedural prop mesh from the creation toolbox (sphere, torus, extrude, lathe, tube, text, …). Used for props; structural architecture stays on brushes.',
    seeAlso: ['brush', 'static-mesh', 'creation-toolbox'],
  },
  {
    id: 'collider',
    term: 'Collider',
    category: 'Geometry',
    body: 'Physics collision shape used in Play and the standalone player (box, convex hull, slope, steps, or mesh collider types). Subtract brushes do not generate colliders. Authored separately from visuals when needed.',
    seeAlso: ['brush', 'static-mesh', 'play-stop'],
  },
  {
    id: 'material',
    term: 'Material',
    category: 'Assets',
    body: 'Project material asset (PBR maps, shading). Assign from Content Browser / Asset Viewer onto actors or surfaces. The Materials workspace edits drafts with Save/Cancel; level Undo does not rewrite material JSON.',
    seeAlso: ['face-material', 'content-browser', 'asset-viewer'],
  },
  {
    id: 'content-browser',
    term: 'Content Browser',
    category: 'Assets',
    body: 'Folder tree of project content with Category section headers, Collapse All, multi-select, and Icon Color. Pair with Asset Viewer for the selected folder’s assets.',
    seeAlso: ['asset-viewer', 'category', 'prefab'],
  },
  {
    id: 'asset-viewer',
    term: 'Asset Viewer',
    category: 'Assets',
    body: 'Grid/list of assets in the current Content Browser folder. Import, preview, drag into the level, and use mesh/material tools from the selection.',
    seeAlso: ['content-browser', 'static-mesh', 'material'],
  },
  {
    id: 'outliner',
    term: 'Scene Outliner',
    category: 'Editor shell',
    body: 'Hierarchical list of level actors. Select, hide/lock, reparent by drag, filter by name or authoring layer, and use Category headers for list-order grouping. Collapse All folds categories and parents.',
    seeAlso: ['actor', 'cell', 'category', 'authoring-layer'],
  },
  {
    id: 'details',
    term: 'Details',
    category: 'Editor shell',
    body: 'Inspects and edits the current selection (transform, brush, materials, lights, …) or World Settings when that tab is active. Collapse All / Expand All in the header folds every section for the selected actor.',
    seeAlso: ['actor', 'world-settings', 'surface'],
  },
  {
    id: 'category',
    term: 'Category',
    category: 'Editor shell',
    body: 'Section header chrome in the Outliner or Content Browser for list-order grouping. Categories are not hierarchy/path parents; actors and folders stay under their real parents. Collapse All folds every expandable section.',
    seeAlso: ['outliner', 'content-browser'],
  },
  {
    id: 'authoring-layer',
    term: 'Authoring layer',
    category: 'Editor shell',
    body: 'Membership in a hierarchical layer (Architecture, Props, Lighting, …) for visibility and filtering. Independent of parenting, Cells, and Prefabs. New actors use the Active layer from the Layers panel.',
    seeAlso: ['cell', 'outliner'],
  },
  {
    id: 'creation-toolbox',
    term: 'Creation toolbox',
    category: 'Editor shell',
    body: 'Dockable toolbox on the Viewport for placing brushes, primitives, lights, environment, gameplay actors, and recent Prefabs / Assets. Docks flush to a viewport edge or floats; Esc closes an open category.',
    seeAlso: ['brush', 'primitive-mesh', 'prefab'],
  },
  {
    id: 'hover-help',
    term: 'Hover Help',
    category: 'Editor shell',
    body: 'When enabled (Help → Show Hover Help), pausing on a control shows a tip with description and shortcut when available. Separate from the Encyclopedia concept glossary and from Academy lessons.',
    seeAlso: ['encyclopedia', 'academy', 'keyboard-shortcuts'],
  },
  {
    id: 'encyclopedia',
    term: 'Encyclopedia',
    category: 'Editor shell',
    body: 'Help → Encyclopedia… opens this searchable glossary of BloodBound terms. Entries explain concepts; Hover Help explains individual controls; Academy teaches with lessons and tours.',
    seeAlso: ['hover-help', 'academy', 'keyboard-shortcuts'],
  },
  {
    id: 'keyboard-shortcuts',
    term: 'Keyboard Shortcuts',
    category: 'Editor shell',
    body: 'Help → Keyboard Shortcuts… lists hotkeys for edit, transform, geometry, grid, camera bookmarks, Play, Content Browser, Outliner, sticky notes, and Checklist.',
    seeAlso: ['hover-help', 'camera-bookmark'],
  },
  {
    id: 'academy',
    term: 'Academy',
    category: 'Editor shell',
    body: 'Floating lesson catalog (Help → Academy…). Lessons and optional Tour walk features on practice levels. Educational chrome — not level data. Distinct from Hover Help tips and the Encyclopedia glossary.',
    seeAlso: ['hover-help', 'encyclopedia'],
  },
  {
    id: 'play-stop',
    term: 'Play / Stop',
    category: 'Editor shell',
    body: 'Play snapshots the level and runs gameplay in the editor viewport. Stop restores the authored snapshot so Play edits cannot dirty the level. Save is blocked during Play.',
    seeAlso: ['standalone-player', 'player-spawn', 'history'],
  },
  {
    id: 'standalone-player',
    term: 'Standalone player',
    category: 'Editor shell',
    body: 'player.html runs a finished level with the shared runtime and no editor. Proof that the game can ship without the editor. Open /player.html?level=<name>.',
    seeAlso: ['play-stop', 'player-spawn'],
  },
  {
    id: 'history',
    term: 'History / Undo',
    category: 'Editor shell',
    body: 'Every authored edit goes through HistoryStack as an undoable command addressed by actor id. Play/Stop uses a separate snapshot. Material drafts use their own Save/Cancel stack in the Materials workspace.',
    seeAlso: ['play-stop', 'material'],
  },
  {
    id: 'camera-bookmark',
    term: 'Camera bookmark',
    category: 'Editor shell',
    body: 'Numbered view slots on the level: Ctrl+1–9 stores the active pane camera; 1–9 recalls. Saved in level JSON. Not used in Play or the standalone player.',
    seeAlso: ['keyboard-shortcuts', 'play-stop'],
  },
  {
    id: 'schema-version',
    term: 'Schema version',
    category: 'Editor shell',
    body: 'Level and asset JSON carry schemaVersion. Load validates and migrates when needed. Saved data stays engine-neutral so content can move to another engine later.',
    seeAlso: ['component', 'prefab'],
  },
]);

const BY_ID = new Map(ENCYCLOPEDIA_ENTRIES.map((e) => [e.id, e]));

/** @returns {readonly EncyclopediaEntry[]} */
export function listEncyclopediaTerms() {
  return ENCYCLOPEDIA_ENTRIES;
}

/** @param {string} id */
export function getEncyclopediaTerm(id) {
  return BY_ID.get(id) || null;
}

/**
 * Filter terms by query against term, category, and body (case-insensitive).
 * @param {string} query
 * @param {readonly EncyclopediaEntry[]} [entries]
 * @returns {EncyclopediaEntry[]}
 */
export function filterEncyclopediaTerms(query, entries = ENCYCLOPEDIA_ENTRIES) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) => (
    e.term.toLowerCase().includes(q)
    || e.category.toLowerCase().includes(q)
    || e.body.toLowerCase().includes(q)
    || e.id.toLowerCase().includes(q)
  ));
}

/**
 * Group filtered terms by category, preserving category order from the catalog.
 * @param {readonly EncyclopediaEntry[]} entries
 * @returns {{ category: string, terms: EncyclopediaEntry[] }[]}
 */
export function groupEncyclopediaByCategory(entries) {
  const order = [];
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.category)) {
      map.set(e.category, []);
      order.push(e.category);
    }
    map.get(e.category).push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.term.localeCompare(b.term));
  }
  return order.map((category) => ({ category, terms: map.get(category) }));
}

/** Validate seeAlso ids resolve (for tests / hygiene). */
export function listBrokenEncyclopediaSeeAlso() {
  const broken = [];
  for (const e of ENCYCLOPEDIA_ENTRIES) {
    for (const id of e.seeAlso || []) {
      if (!BY_ID.has(id)) broken.push({ from: e.id, seeAlso: id });
    }
  }
  return broken;
}
