/**
 * Central hover-help definitions for the BloodBound editor.
 * Keys are stable ids referenced via data-bb-help / HoverHelpTarget.
 */

/** @typedef {{
 *   title: string,
 *   body: string,
 *   tips?: string,
 *   shortcut?: string,
 *   meta?: string,
 * }} HelpEntry */

/** @type {Record<string, HelpEntry>} */
export const HELP_CONTENT = {
  // —— Toolbar ——
  'toolbar.save': {
    title: 'Save Level',
    body: 'Writes the current level JSON to disk under public/levels using the filename in the level field.',
    tips: 'Stop Play before saving. Play mode blocks save so runtime changes cannot overwrite authored data.',
    shortcut: 'Ctrl+S',
  },
  'toolbar.undo': {
    title: 'Undo',
    body: 'Reverts the last editor change from the history stack (transforms, brushes, hierarchy, prefabs, and similar commands).',
    tips: 'History is cleared when entering or leaving Play mode.',
    shortcut: 'Ctrl+Z',
  },
  'toolbar.redo': {
    title: 'Redo',
    body: 'Re-applies an undone editor change.',
    shortcut: 'Ctrl+Y',
  },
  'toolbar.select': {
    title: 'Select',
    body: 'Select actors in the viewport and use the move/resize gizmos. Drag on a brush face handle to resize structural geometry.',
    tips: 'Ctrl+click adds or removes from the multi-selection.',
  },
  'toolbar.box': {
    title: 'Box Brush',
    body: 'Drag on the construction grid to create a box brush. Size and placement snap to the current grid.',
    tips: 'After creation the tool returns to Select.',
  },
  'toolbar.wall': {
    title: 'Wall Brush',
    body: 'Drag a footprint on the construction grid to create a wall-height brush with standard wall thickness along the short axis.',
    tips: 'Wall height uses the module size from the construction rules (not freeform height while dragging).',
  },
  'toolbar.floor': {
    title: 'Floor Brush',
    body: 'Drag on the construction grid to create a floor slab at the standard floor thickness.',
  },
  'toolbar.pointLight': {
    title: 'Point Light',
    body: 'Places a point light actor above the origin (snapped to the grid). Edit intensity, color, and range in Details.',
  },
  'toolbar.spotLight': {
    title: 'Spot Light',
    body: 'Places a spot light actor. Adjust cone angle and direction from the Details panel Transform and Light sections.',
  },
  'toolbar.dirLight': {
    title: 'Directional Light',
    body: 'Places a directional (sun-like) light. Rotation in Transform controls the light direction.',
  },
  'toolbar.grid': {
    title: 'Grid Snap',
    body: 'Controls the spacing used when placing and resizing structural brushes. Hold Alt while dragging a gizmo to temporarily snap to 1 unit instead.',
    tips: 'Smaller increments allow more precise construction. Structural geometry remains aligned to the selected grid.',
    meta: 'Values are editor units (100 editor units = 1 meter).',
  },
  'toolbar.levelName': {
    title: 'Level Filename',
    body: 'Name of the JSON file used when saving or loading this level from public/levels.',
  },
  'toolbar.duplicate': {
    title: 'Duplicate',
    body: 'Duplicates the current selection with a grid-sized offset along X.',
    shortcut: 'Ctrl+D',
  },
  'toolbar.delete': {
    title: 'Delete',
    body: 'Removes the selected actors from the level. This can be undone.',
    shortcut: 'Del',
  },
  'toolbar.play': {
    title: 'Play In Editor',
    body: 'Snapshots the authored level, builds Rapier collision, and starts first-person Play mode from the Player Spawn.',
    tips: 'Click the viewport to capture the mouse. Esc releases the pointer. Stop restores the authored scene exactly.',
  },
  'toolbar.stop': {
    title: 'Stop',
    body: 'Ends Play mode and restores the authored level from the snapshot taken when Play began. Runtime changes are discarded.',
  },
  'toolbar.record': {
    title: 'Record Session',
    body: 'Starts a local recording. Prefers the browser capture picker (tab/window); if unavailable, falls back to the editor viewport canvas. Downloads a .webm when you stop — nothing is uploaded.',
  },
  'toolbar.recordStop': {
    title: 'Stop Recording',
    body: 'Stops the active screen recording, releases the capture stream, and saves the .webm locally.',
  },

  // —— Hierarchy / Outliner ——
  'outliner.search': {
    title: 'Search Outliner',
    body: 'Filters the Scene Outliner by actor name, id, or component type. Matching ancestors stay visible so hierarchy context remains.',
  },
  'outliner.newCell': {
    title: 'New Cell',
    body: 'Creates an empty Cell actor. Cells are logical room/section roots: parent brushes, meshes, lights, and groups under them to move or hide the section together.',
  },
  'outliner.unparent': {
    title: 'Unparent',
    body: 'Moves the selection to the world root while preserving each actor’s world-space transform.',
  },
  'outliner.visibility': {
    title: 'Visibility',
    body: 'Shows or hides this actor. Children inherit effective visibility from ancestors, including cells.',
  },
  'outliner.lock': {
    title: 'Lock',
    body: 'Prevents transforming this actor in the viewport. Descendants are also effectively locked while an ancestor is locked.',
  },
  'outliner.row': {
    title: 'Scene Actor',
    body: 'Click to select. Drag onto another row to parent (world transform preserved). Drag to the level root strip to unparent.',
    tips: 'Prefabs show a P glyph. Cells show C. Expand/collapse with the disclosure control when children exist.',
  },

  // —— Details: Hierarchy ——
  'details.parent': {
    title: 'Parent',
    body: 'Sets the selected actor’s parent. Local Transform values are relative to that parent. Reparenting preserves world position, rotation, and scale.',
    tips: 'Circular parenting is rejected.',
  },
  'details.visible': {
    title: 'Visible',
    body: 'Toggles authored visibility for this actor. Hidden ancestors hide their descendants in the viewport.',
  },
  'details.locked': {
    title: 'Locked',
    body: 'When locked, gizmo moves and geometry edits are blocked for this actor (and effectively for descendants of locked ancestors).',
  },
  'details.newCell': {
    title: 'New Cell',
    body: 'Creates a Cell actor at the world origin and selects it. Use parenting to assign room contents to the cell.',
  },
  'details.parentSelection': {
    title: 'Parent Selection Here',
    body: 'Parents the rest of the multi-selection under the selected Cell, preserving world transforms.',
  },

  // —— Details: Prefab ——
  'details.prefab.record': {
    title: 'Record Override',
    body: 'Stores differences between this instance actor and its source prefab template (transform, name, flags, and component properties).',
    tips: 'Supported edits also auto-record overrides. Source definitions are loaded if not already cached.',
  },
  'details.prefab.revert': {
    title: 'Revert Override',
    body: 'Clears stored overrides for this actor’s template id, then re-applies the source prefab to linked instances.',
  },
  'details.prefab.apply': {
    title: 'Apply Source',
    body: 'Rebuilds all instances of this prefab from the current source asset. Instance placement, actor ids, and recorded overrides are preserved.',
  },
  'details.prefab.update': {
    title: 'Update Source',
    body: 'Rewrites the prefab asset from the selected instance (including nested content), then syncs other instances from that source.',
  },
  'details.prefab.unpack': {
    title: 'Unpack',
    body: 'Breaks the selected prefab instance into independent actors, clearing prefab linkage while leaving transforms and components intact.',
  },
  'details.prefab.create': {
    title: 'Create Prefab From Selection',
    body: 'Saves the selection (and descendants) as a reusable prefab asset in the Content Browser Prefabs folder.',
  },

  // —— Details: Transform ——
  'details.transform.location': {
    title: 'Location',
    body: 'Local position relative to the parent (or world if unparented). Values are editor units.',
    meta: '100 editor units = 1 meter. Snaps to the construction grid when edited from Details.',
  },
  'details.transform.rotation': {
    title: 'Rotation',
    body: 'Local Euler rotation in degrees (XYZ order), relative to the parent.',
  },
  'details.transform.scale': {
    title: 'Scale',
    body: 'Local scale relative to the parent. Brush collision and mesh box colliders use world scale.',
  },

  // —— Details: Brush / Material / Collision ——
  'details.brush.size': {
    title: 'Brush Size',
    body: 'Axis-aligned size of the structural brush in editor units. Edits snap to the current grid and keep a minimum of one grid step.',
  },
  'details.brush.color': {
    title: 'Brush Color',
    body: 'Fallback display color when no material (or face material) is assigned.',
  },
  'details.material.id': {
    title: 'Material',
    body: 'Assigns a project material asset to the whole brush. Face overrides in Face Materials take precedence per side.',
  },
  'details.material.uv': {
    title: 'UV Transform',
    body: 'Scales, offsets, and rotates brush UVs for the assigned materials.',
  },
  'details.collision.collidable': {
    title: 'Collidable',
    body: 'When enabled, Play mode builds Rapier box collider(s) from brush solids (one per solid when openings are present) at the actor’s world transform.',
  },
  'details.openings': {
    title: 'Wall Openings',
    body: 'Parametric door and window holes on wall brushes. Solids and collision regenerate from the openings list; edits are undoable.',
  },
  'details.openings.addDoor': {
    title: 'Add Door',
    body: 'Adds a door opening (default 100×220, bottom at the wall base). Offset is along the wall length from the brush center.',
  },
  'details.openings.addWindow': {
    title: 'Add Window',
    body: 'Adds a window opening (default 100×120, bottom 100). Openings cannot overlap and are clamped to the wall.',
  },
  'details.openings.fields': {
    title: 'Opening Fields',
    body: 'Offset is the opening center along wall length. Bottom is height from the wall base. Width and height are in editor units and snap to the grid.',
  },
  'details.light': {
    title: 'Light Properties',
    body: 'Edits light type parameters such as intensity, color, range, and spot angles. Changes are undoable and sync to the viewport.',
  },
  'details.staticMesh': {
    title: 'Static Mesh',
    body: 'References an imported mesh asset. Optional box collision uses a 1 m unit cube scaled by the actor’s world scale.',
  },
  'details.duplicate': {
    title: 'Duplicate',
    body: 'Duplicates the selection with a grid offset.',
    shortcut: 'Ctrl+D',
  },
  'details.delete': {
    title: 'Delete',
    body: 'Deletes the selection.',
    shortcut: 'Del',
  },

  // —— Content Browser ——
  'content.search': {
    title: 'Search Assets',
    body: 'Filters project registry assets in the current folder by name, id, type, or tags.',
  },
  'content.importTexture': {
    title: 'Import Texture',
    body: 'Imports an image into public/assets/textures and registers it. Use textures when creating materials.',
  },
  'content.importMesh': {
    title: 'Import Mesh',
    body: 'Imports a glTF/GLB mesh. BloodBound assumes meters in the file and 100 editor units per meter—no automatic rescale.',
    tips: 'Drag a mesh from the browser into the viewport to place a Static Mesh actor.',
  },
  'content.newMaterial': {
    title: 'New Material',
    body: 'Creates a material asset. If a texture is selected, it becomes the base color map.',
  },
  'content.createPrefab': {
    title: 'Create Prefab',
    body: 'Creates a prefab asset from the current level selection (actors plus descendants), including cells and nested prefab instances.',
  },
  'content.gridView': {
    title: 'Grid View',
    body: 'Shows Content Browser assets as a thumbnail grid.',
  },
  'content.listView': {
    title: 'List View',
    body: 'Shows Content Browser assets in a compact list.',
  },
  'content.asset': {
    title: 'Project Asset',
    body: 'Click to select and preview in the Asset Viewer. Drag meshes into the viewport to place them, materials onto a selected brush to assign, or prefabs into the viewport to instantiate.',
  },

  // —— Asset Viewer ——
  'assetViewer.clear': {
    title: 'Clear Preview',
    body: 'Clears the Asset Viewer selection so no asset is previewed.',
  },
  'assetViewer.preview': {
    title: 'Asset Preview',
    body: 'Shows a texture, material swatch, or interactive mesh preview for the Content Browser selection. This preview is separate from the level viewport.',
  },
};

export function getHelpEntry(id) {
  if (!id) return null;
  return HELP_CONTENT[id] || null;
}

export function listHelpIds() {
  return Object.keys(HELP_CONTENT);
}
