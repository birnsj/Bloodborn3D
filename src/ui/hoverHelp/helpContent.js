/**
 * Central hover-help definitions for the BloodBound editor.
 * Keys are stable ids referenced via data-bb-help / HoverHelpTarget.
 */

export { KEYBOARD_SHORTCUTS_TEXT, KEYBOARD_SHORTCUT_SECTIONS } from './keyboardShortcuts.js';

/** @typedef {{
 *   title: string,
 *   body: string,
 *   tips?: string,
 *   shortcut?: string,
 *   meta?: string,
 * }} HelpEntry */

/** @type {Record<string, HelpEntry>} */
export const HELP_CONTENT = {
  // —— File ——
  'file.newMap': {
    title: 'New Map',
    body: 'Creates a new level file. Additive starts empty (add brushes to build). Subtractive starts with an invisible solid World Solid — place subtract boxes to carve rooms out of that substrate; you see the cut faces, not a giant outer cube.',
    tips: 'Map mode is set at create time and shown in Details → Level and the status bar. Existing levels without a mode load as Additive. World Solid stays locked in the Outliner as a faint wire outline.',
  },

  'world.ambient': {
    title: 'World Ambient',
    body: 'Scene fill for the whole level (studio IBL, tint, and editor fill lights). Separate from placeable Ambient Light actors. Edit intensity applies in the editor; Play intensity applies when you enter Play.',
    tips: 'Black color or intensity 0 removes fill light. G = Game View. Ctrl+move = orbit. Alt+Move/Rotate/Scale = duplicate.',
  },

  // —— Help menu ——
  'help.shortcuts': {
    title: 'Keyboard Shortcuts',
    body: 'Open Help → Keyboard Shortcuts… for edit, transform, geometry/clip (Enter/Esc), grid, placement (Tab), camera, and play bindings.',
    tips: 'Hover Help shows matching shortcuts on toolbar and viewport controls.',
  },
  'help.hoverHelp': {
    title: 'Show Hover Help',
    body: 'When enabled, pausing the cursor over toolbar and panel controls shows a tip with description and shortcut when available.',
  },

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
    body: 'Select actors in the viewport and use the transform gizmo. Drag on empty space for a marquee. Switch modes with W (move), E (rotate), or R (scale).',
    tips: 'W/E/R · R again toggles face-resize ↔ Unreal scale gizmo · F focus · Alt+gizmo = duplicate.',
  },
  'toolbar.surface': {
    title: 'Surface Selection',
    body: 'Click a structural face to pick it. Assign a per-face material and UV in Details → Selected Surface, or drag a material from the Asset Viewer onto the face.',
    tips: 'Works on brushes, convex brushes, ramps, stairs, columns, arches, and curved walls. Esc returns to Select and clears the face pick.',
    shortcut: 'Esc',
  },
  'toolbar.align': {
    title: 'Align to Neighbor',
    body: 'Click a reference face, then a target face to align the target actor’s surface to the reference (move/rotate to match).',
    tips: 'Useful for flush walls, floors, and miters. Status bar prompts each step. Esc cancels and returns to Select.',
    shortcut: 'Esc',
  },
  'toolbar.geometryFace': {
    title: 'Geometry Face',
    body: 'Edit ConvexBrush faces: click or marquee-select faces, then drag with the Move gizmo. Converts parametric brushes first if needed.',
    tips: 'Shift/Ctrl+LMB add to selection · Esc leaves Geometry. Extrude / Clip live in Details — Enter commits a ready clip, Esc cancels it.',
  },
  'toolbar.geometryEdge': {
    title: 'Geometry Edge',
    body: 'Edit ConvexBrush edges: click near an edge or drag a marquee, then Move. Edges stay shared across connected faces.',
    tips: 'Alt = x-ray pick · Shift/Ctrl+LMB additive · Esc leaves Geometry.',
    shortcut: 'Alt',
  },
  'toolbar.geometryVertex': {
    title: 'Geometry Vertex',
    body: 'Edit ConvexBrush vertices: click near a vertex or marquee-select, then Move only (no rotate/scale).',
    tips: 'Alt = x-ray pick · Shift/Ctrl+LMB additive · Esc leaves Geometry.',
    shortcut: 'Alt',
  },
  'toolbar.move': {
    title: 'Move',
    body: 'Shows axis arrows on the selection. Drag an arrow to translate along that axis. Hold Alt for 1-unit snap (or free move when Snap is off).',
    shortcut: 'W',
  },
  'toolbar.rotate': {
    title: 'Rotate',
    body: 'Shows rotation rings on the selection. Drag a ring to rotate around that axis (5° snaps; hold Alt for free).',
    shortcut: 'E',
  },
  'toolbar.scale': {
    title: 'Scale',
    body: 'Brushes show face handles that resize geometry. Other actors show axis boxes that scale the transform. Hold Alt for fine snap while dragging.',
    shortcut: 'R',
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
  'toolbar.ceiling': {
    title: 'Ceiling Brush',
    body: 'Drag on the construction grid to create a ceiling slab at standard thickness. The underside sits at wall-module height above the construction plane so a standard wall meets it.',
    tips: 'Move or resize like any brush. Subtractive boxes can cut shafts through ceilings and floors.',
    meta: 'Thickness uses the ceiling construction constant (same scale as floors).',
  },
  'toolbar.ramp': {
    title: 'Ramp',
    body: 'Drag a footprint on the construction grid to place a parametric ramp. Slope follows the longer drag axis; edit Width, Length, Rise, and Direction in Details.',
    tips: 'Collision uses a rotated slab along the slope — not a full box AABB.',
  },
  'details.ramp': {
    title: 'Ramp Properties',
    body: 'Parametric straight ramp: width, run length, vertical rise, slope direction, thickness, material, and collidable.',
  },
  'toolbar.stair': {
    title: 'Stairs',
    body: 'Drag a footprint to place a straight staircase as a single editable actor. Rise defaults to one wall module; step count and tread adjust to the run.',
    tips: 'Each step has its own collider. Edit Width, Step Count, Step Height, and Tread Depth in Details.',
  },
  'toolbar.column': {
    title: 'Column',
    body: 'Drag a footprint to place a parametric column. Footprint size sets radius; height defaults to one wall module. Edit shape, base, and capital in Details.',
    tips: 'Shapes: round, square, hexagon, octagon. Collision follows the generated prism.',
  },
  'toolbar.curvedWall': {
    title: 'Curved Wall',
    body: 'Drag a footprint to place a parametric curved wall. Near-square footprints become full circles; elongated footprints default to 90° or 180° arcs. Edit radius, sweep, and thickness in Details.',
    tips: 'Segmented Rapier colliders follow the curve. Openings are not supported on curved walls — use straight walls for doors/arches.',
  },
  'details.curvedWall': {
    title: 'Curved Wall Properties',
    body: 'Radius is the centerline. Sweep 360° makes a hollow circular room. UVs tile by arc length at 100 editor units (1 m) per repeat.',
  },
  'details.wallJoin': {
    title: 'Join Walls',
    body: 'Snaps the selected wall’s end to the nearest neighboring wall endpoint and applies complementary miters. Actors stay independently editable.',
    tips: 'Use Orient to Tangent when joining a straight wall to a curved wall so the straight wall follows the arc tangent.',
  },
  'toolbar.archRoman': {
    title: 'Roman Arch',
    body: 'Drag a footprint for a freestanding rounded arch with a real open passage. Longer axis is opening width; shorter is depth.',
    tips: 'Collision uses piers plus segmented arch solids so you can walk through the opening.',
  },
  'toolbar.archGothic': {
    title: 'Gothic Arch',
    body: 'Drag a footprint for a freestanding pointed Gothic arch. The pointed profile is generated procedurally from opening width and rise.',
    tips: 'Switch between Roman and Gothic in Details after placing.',
  },
  'details.column': {
    title: 'Column Properties',
    body: 'Parametric column: shape, height, radius, sides, optional base/capital, material, and collidable.',
  },
  'details.arch': {
    title: 'Arch Properties',
    body: 'Freestanding arch: type (Roman/Gothic), opening size, rise, structural thickness, depth, and curve resolution.',
  },
  'details.openings.arch': {
    title: 'Arched Wall Opening',
    body: 'Cut a Roman or Gothic arched opening through the selected wall. The wall actor is preserved; solids and collision follow the curved profile.',
    tips: 'Rise is the height of the curve above the spring line. Interior jamb/soffit faces come from the segmented lintel solids.',
  },
  'details.stair': {
    title: 'Stair Properties',
    body: 'Procedural stairs as a single actor. Choose Straight, Curved, or Spiral; geometry and collision regenerate immediately.',
  },
  'details.stair.type': {
    title: 'Staircase Type',
    body: 'Straight uses rectangular steps. Curved and Spiral share a wedge-step generator that sweeps around a central opening.',
    tips: 'Switching type applies sensible defaults for radius and sweep; you can edit them afterward.',
  },
  'details.stair.innerRadius': {
    title: 'Inner Radius',
    body: 'Distance from the stair center to the inner edge of the treads. Larger values open a wider central well; zero makes a solid core.',
  },
  'details.stair.sweep': {
    title: 'Sweep Angle',
    body: 'How far the staircase turns in degrees (90, 180, 270, 360, or custom). Step angles are spaced evenly across the sweep.',
  },
  'details.stair.winding': {
    title: 'Winding Direction',
    body: 'Clockwise or counterclockwise turn as you ascend.',
  },
  'toolbar.subtract': {
    title: 'Subtract Box',
    body: 'Drag a crimson cutter box. On a subtractive map it carves air out of the invisible World Solid — the walls you see are the cut faces of that solid, not the cutter itself.',
    tips: 'Shown as translucent crimson in Edit mode; hidden in Play. Only axis-aligned cuts relative to the target are supported.',
  },
  'details.brush.operation': {
    title: 'Brush Operation',
    body: 'Add contributes solid geometry. Subtract carves overlapping volume out of additive brushes (including World Solid). Cutters are not walls — they remove substrate.',
    tips: 'Subtractive brushes never generate Rapier colliders and are editor-only visuals.',
  },
  'toolbar.pointLight': {
    title: 'Point Light',
    body: 'Drag onto a surface in the viewport, or click then click a surface to place. Snaps horizontally when grid snap is on; elevation follows the support surface.',
    tips: 'Edit intensity, color, and range in Details after placing.',
  },
  'toolbar.spotLight': {
    title: 'Spot Light',
    body: 'Drag onto a wall or surface, or click then click to place. Prefers vertical surfaces so the spot faces outward from the wall.',
  },
  'toolbar.dirLight': {
    title: 'Directional Light',
    body: 'Places a directional (sun-like) light. Drag into the viewport or click then click to place. Rotation in Transform controls the light direction.',
  },
  'toolbar.playerSpawn': {
    title: 'Player Spawn',
    body: 'Places the Play-mode start point on a floor or other support surface. Drag from the creation toolbar or click then click to place.',
  },
  'toolbar.cell': {
    title: 'Cell',
    body: 'Creates an empty Cell root for organizing room hierarchy. Drag into the viewport or click then click to place.',
  },
  'toolbar.rotationSnap': {
    title: 'Rotation Snap',
    body: 'Gizmo rotate step in degrees when Snap is on. Alt+drag duplicates then rotates the copies (free rotate while Alt is held).',
    tips: 'Also in Edit → Settings → Grid.',
  },
  'toolbar.scaleSnap': {
    title: 'Scale Snap',
    body: 'Gizmo scale step when Snap is on. Alt+drag duplicates then scales the copies (free scale while Alt is held).',
    tips: 'Also in Edit → Settings → Grid.',
  },
  'toolbar.grid': {
    title: 'Move Grid',
    body: 'Spacing for placement and gizmo moves. Brushes snap by edges; props by pivot. Hold Alt while dragging for 1-unit move snap. Rot / Scale next to this set rotate and scale snap steps.',
    tips: '[ / ] cycle grid size · Shift+G toggle snap. Values are editor units (100 = 1 m).',
    meta: 'Also under View → Smaller/Larger Grid.',
  },
  'toolbar.gridSnap': {
    title: 'Enable Snap',
    body: 'When enabled, move / rotate / scale gizmo snaps use Grid, Rot, and Scale steps. When disabled, transforms are freeform (props still stick to support elevation).',
    shortcut: 'Shift+G',
  },
  'toolbar.resetAllViews': {
    title: 'Reset All Views',
    body: 'Restores every viewport pane to its camera-mode home pose and default zoom (same as each pane’s Reset chip, applied to all panes).',
    tips: 'Different from Focus (F), which frames the current selection in the active pane only.',
  },
  'creation.toolbar': {
    title: 'Creation Toolbox',
    body: 'Floating Photoshop-style tool rail. Hover a category to roll out tools; click or drag a tool into the viewport to place.',
    tips: 'Drag the handle to reposition. Pin keeps the rollout open. Esc closes an unpinned rollout or cancels placement. See Help → Keyboard Shortcuts… for the full list.',
  },
  'creation.geometry': {
    title: 'Geometry',
    body: 'Structural tools: box, wall, curved wall, floor, ceiling, ramp, stairs, column, arches, and subtract. Click to enter drag-to-size mode, or drag onto a surface for a default footprint.',
  },
  'creation.lights': {
    title: 'Lights',
    body: 'Point, spot, and directional lights. Drag onto surfaces for surface-aware placement.',
  },
  'creation.actors': {
    title: 'Actors',
    body: 'Gameplay and organization actors such as Player Spawn and Cell.',
  },
  'creation.assets': {
    title: 'Prefabs / Assets',
    body: 'Imported meshes and prefabs from the project registry. Drag onto floors, tables, or shelves — ceilings are skipped for interior placement.',
  },
  'creation.mesh': {
    title: 'Static Mesh',
    body: 'Drag onto a support surface. Placement uses visible mesh geometry even when gameplay collision is off.',
  },
  'creation.prefab': {
    title: 'Prefab',
    body: 'Drag a prefab instance onto a support surface. Overrides and hierarchy behave like Content Browser placement.',
  },
  'creation.pin': {
    title: 'Pin Rollout',
    body: 'Keeps the tool icon strip open while the cursor leaves. Unpin to auto-collapse on mouse-out like Photoshop.',
  },
  'toolbar.duplicate': {
    title: 'Duplicate',
    body: 'Duplicates the current selection with a grid-sized offset along X. Copies are snapped onto the construction grid (brush edges or pivot).',
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
    tips: 'Click the viewport to capture the mouse · WASD move · Space jump · Esc releases the pointer. Stop restores the authored scene exactly.',
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
    body: 'Assigns a project material asset to the whole brush or convex solid. Per-face overrides (Selected Surface / Face Materials) take precedence.',
    tips: 'You can also drag a material from the Asset Viewer onto a face in the viewport to paint that poly only.',
  },
  'details.material.uv': {
    title: 'UV Transform',
    body: 'Scales, offsets, and rotates actor-level UVs for the assigned materials. Surface UV overrides this per face when set.',
  },
  'details.surface.material': {
    title: 'Surface Material',
    body: 'Per-face material override for the picked surface. Empty uses the actor material.',
    tips: 'Pick a face with the Surface tool, or drag a material onto a poly in the viewport.',
  },
  'details.surface.uv': {
    title: 'Surface UV',
    body: 'Per-face UV scale, offset, and rotation. Overrides actor UV for this face only.',
  },
  'details.surface.resetUv': {
    title: 'Reset Surface UV',
    body: 'Removes the face UV override so the face inherits the actor UV again.',
  },
  'details.convex.convert': {
    title: 'Convert to Convex Brush',
    body: 'Turns a compatible parametric brush into an editable ConvexBrush (hull faces/edges/vertices) for Geometry tools.',
    tips: 'Parametric size, openings, and miters are baked into solids; further shape edits use Face/Edge/Vertex.',
  },
  'details.convexBrush': {
    title: 'Convex Brush',
    body: 'Editable convex solid. Use Face / Edge / Vertex tools to move elements; materials and UVs can be set per face.',
  },
  'details.extrudeClip': {
    title: 'Extrude / Clip',
    body: 'Extrude grows a new prism from the selected ConvexBrush face. Clip cuts with a three-point plane or the selected face plane (keep front, back, or split).',
    tips: 'Enter applies a ready clip · Esc cancels the clip session.',
    shortcut: 'Enter',
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
  'content.folder': {
    title: 'Content Folder',
    body: 'Chooses which folder the Asset Viewer lists. The Content Browser is for navigation only.',
  },
  'workspace.ai': {
    title: 'AI Assets',
    body: 'Dedicated workspace for AI-assisted asset generation. OpenArt is available now; other providers appear as Coming Soon.',
  },

  'content.search': {
    title: 'Search Assets',
    body: 'Filters assets in the current Content Browser folder by name, id, type, or tags.',
  },
  'content.importTexture': {
    title: 'Import Texture',
    body: 'Imports an image into public/assets/textures and registers it. Use textures when creating materials.',
  },
  'content.importMesh': {
    title: 'Import Mesh',
    body: 'Imports a glTF/GLB mesh. BloodBound assumes meters in the file and 100 editor units per meter—no automatic rescale.',
    tips: 'Drag a mesh from the Asset Viewer into the viewport to place a Static Mesh actor.',
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
    body: 'Shows Asset Viewer assets as a thumbnail grid.',
  },
  'content.listView': {
    title: 'List View',
    body: 'Shows Asset Viewer assets in a compact list.',
  },
  'content.asset': {
    title: 'Project Asset',
    body: 'Click to select. Double-click to open a preview. Drag meshes or prefabs into the viewport to place them. Drag a material onto a face (poly) to paint that surface, or onto empty selection space to apply to the selected actor.',
    tips: 'Material drops do not rearrange dock panels — only paint geometry.',
  },

  // —— Asset Viewer ——
  'assetViewer.clear': {
    title: 'Close Preview',
    body: 'Closes the asset preview window.',
  },
  'assetViewer.preview': {
    title: 'Asset Preview',
    body: 'Temporary window with a texture, material, or mesh preview. Open with double-click; close with Esc or Close. Separate from the level viewport.',
  },
  'assetViewer.thumbSize': {
    title: 'Thumbnail Size',
    body: 'Scales Asset Viewer grid thumbnails. Preference is saved with the workspace layout.',
  },

  // —— Viewport chrome ——
  'viewport.camera': {
    title: 'Camera Mode',
    body: 'Perspective, isometric, or orthographic views (Top/Bottom/Front/Back/Left/Right) for this pane.',
    tips: 'Perspective: hold Ctrl + move to orbit · Alt+Move/Rotate/Scale duplicates · RMB drag looks · WASD free-fly. Ortho: RMB orbits.',
  },
  'viewport.display': {
    title: 'Display Mode',
    body: 'Shading for this pane: Lit, Unlit, Textured, Wireframe, or Solid+Edges. Edit → Settings can set the default for all panes.',
  },
  'viewport.layout': {
    title: 'Viewport Layout',
    body: 'Split the level viewport into one, two, three, or four panes. Each pane has its own camera and display mode.',
    tips: 'Also under View → Viewport Layout. Maximize expands the active pane; Restore returns to the split.',
  },
  'viewport.reset': {
    title: 'Reset Camera',
    body: 'Restores this pane’s resting orientation and default zoom for its camera mode (home pose + frustum / distance).',
    tips: 'Different from Focus (F), which frames the current selection.',
  },
  'viewport.maximize': {
    title: 'Maximize Pane',
    body: 'Expands the active viewport pane to fill the viewport area, or restores the previous multi-pane layout.',
  },
  'viewport.focus': {
    title: 'Focus Selection',
    body: 'Frames the selected actors in the active viewport pane.',
    shortcut: 'F',
    tips: 'View → Focus Selection. Use pane Reset for a fixed home view instead.',
  },

  // —— Panels / settings ——
  'panel.tutorials': {
    title: 'Tutorials',
    body: 'Guided lessons with floating tips that point at the next control. Finish each task to advance; Exit lesson returns to the catalog.',
    tips: 'Toggle the panel from Window → Tutorials. Lessons cover rooms, materials, lights, prefabs, subtractive geo, and more.',
  },
  'settings.dialog': {
    title: 'Editor Settings',
    body: 'Appearance, viewport colors, grid, camera feel (orbit / pan / free-fly), Play look sensitivity, and Hover Help. Edit → Settings…',
    tips: 'Save as Default stores your prefs; Reset Defaults restores them (or factory values).',
  },
  'settings.camera': {
    title: 'Camera Feel',
    body: 'Orbit speed, wheel zoom, middle-mouse pan (default fast), free-fly look/speed/boost, and Invert Y. Orbit stops when you release — no after-drift.',
  },
  'settings.appearance': {
    title: 'Appearance',
    body: 'Color theme, UI scale (chrome only, not browser zoom), and Asset Viewer grid/list preference.',
  },
};

export function getHelpEntry(id) {
  if (!id) return null;
  return HELP_CONTENT[id] || null;
}

export function listHelpIds() {
  return Object.keys(HELP_CONTENT);
}
