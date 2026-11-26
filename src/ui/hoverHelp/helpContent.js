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

  'world.scene': {
    title: 'World Scene',
    body: 'Level-authored Three.js scene look: clear/background color, background intensity/blurriness, and fog. Saved with the map and used in edit and play.',
    tips: 'Enable Fog, then Linear (near/far in editor units) or Exp2 (density). Drift breathes depth/density. Mist / Noise / Volumetric add moving atmosphere. Hidden in ortho panes. 100 eu = 1 m.',
  },
  'world.scene.atmosphere': {
    title: 'Moving Atmosphere',
    body: 'Optional layers on top of distance fog: world-space particle Mist, lagged Noise sheets, and a local Volumetric volume. Soft depth fades stop fog at walls. Independent of post-processing.',
    tips: 'Perspective and Play only. Mist drifts in world space (you move through it). Volumetric steps trade quality for cost. Noise alone uses soft sheets; with Volumetric on, noise drives the volume shader instead.',
  },

  'world.renderer': {
    title: 'World Renderer',
    body: 'Level-authored WebGLRenderer settings: tone mapping mode/exposure and shadow map on/off + type. Saved with the map.',
    tips: 'When Post Processing is enabled and composing, PP owns tone mapping and exposure. Shadow map type: Basic, PCF, PCF Soft, or VSM.',
  },

  'world.postProcessing': {
    title: 'Post Processing',
    body: 'Map-authored fullscreen image effects (bloom, vignette, tone mapping, and more) applied after scene lighting. Uses the pmndrs postprocessing library on the shared Three.js renderer. Disabled maps keep the previous ACES look.',
    tips: 'Ambient = scene fill. Lights = local illumination. Exposure / tone mapping = HDR→display. Post effects = artistic image filters. Ortho and wireframe panes stay raw.',
  },
  'world.postProcessingExposure': {
    title: 'Exposure',
    body: 'Scales HDR scene luminance before tone mapping when post-processing is enabled (ToneMappingEffect uses Three’s toneMappingExposure). Default 0.95 matches the legacy renderer.',
    tips: 'Raise exposure to brighten the whole image without changing World Ambient or individual lights.',
  },
  'world.postProcessingPreview': {
    title: 'Editor Preview',
    body: 'When on, perspective Lit panes show map post-processing while editing. Play always uses map settings. This toggle is an editor preference, not saved in the level JSON.',
  },

  // —— Help menu ——
  'help.shortcuts': {
    title: 'Keyboard Shortcuts',
    body: 'Open Help → Keyboard Shortcuts… for edit, transform, geometry/clip (Enter/Esc), grid, placement (Tab), camera, play, and Project Art Library gallery bindings.',
    tips: 'Hover Help shows matching shortcuts on toolbar, viewport, and AI Assets controls.',
  },
  'help.hoverHelp': {
    title: 'Show Hover Help',
    body: 'When enabled, pausing the cursor over toolbar and panel controls shows a tip with description and shortcut when available.',
  },

  // —— Toolbar ——
  'toolbar.save': {
    title: 'Save Level',
    body: 'Writes the current level JSON to disk under public/levels using the filename in the level field.',
    tips: 'Stop Play before saving. Play mode blocks save so runtime changes cannot overwrite authored data. Use Save All (Ctrl+Shift+S) for level + dirty materials.',
    shortcut: 'Ctrl+S',
  },
  'menu.saveAll': {
    title: 'Save All',
    body: 'Saves dirty content modules (level and open material drafts). Does not save workspace layout — use Window → Layout for that.',
    tips: 'Same idea as Unreal Save All: flush authored content, not editor UI layout.',
    shortcut: 'Ctrl+Shift+S',
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
    body: 'Floating tool rail. Click a category to roll out tools (stays open); click outside, click the same category again, or press Esc to close. Click or drag a tool into the viewport to place.',
    tips: 'Drag the handle to reposition. Esc closes the rollout or cancels placement. See Help → Keyboard Shortcuts… for the full list.',
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
    tips: 'Click the viewport to capture the mouse · WASD move · Space jump · Esc stops Play and restores the authored scene.',
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
  'viewport.faceTexture': {
    title: 'Face Texture',
    body: 'Right-click a brush face, then open Face Texture for UV presets: Scale 1×1 / 2×2 / ½×½, Fit Horizontal, Fit Vertical, and Reset UV. Fit sizes one material tile across that axis (accounts for material UV scale).',
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
    body: 'Workspace for Project Art Library and Asset Generation (OpenArt images + Meshy Image-to-3D). Switch sections with the tabs under the workspace title.',
    tips: 'OpenArt and Meshy both use their official CLIs with browser sign-in. Both require explicit spend approval.',
  },
  'workspace.level': {
    title: 'Level Editor',
    body: 'Main authoring workspace: viewport, brushes, lights, materials on actors, Outliner, Details, Content Browser, and Asset Viewer.',
  },
  'workspace.materials': {
    title: 'Materials',
    body: 'Edit material definitions (base color, maps, preview). Use Generate PBR Maps to derive local normal and roughness from a base-color texture. Switch back to Level Editor to assign materials to brushes and faces.',
  },
  'materials.pbrGenerator': {
    title: 'Generate PBR Maps',
    body: 'Builds normal and roughness maps locally from the material’s base-color texture — no AI credits. Adjust strength, smoothing, tiling wrap, and roughness response, preview under lighting, then Apply & Save. Cancel leaves the saved material unchanged.',
    tips: 'Brightness is only a height proxy. Use Invert Height / Fine vs Large-scale controls when relief looks wrong. Full-wall textures usually wrap horizontally but not vertically.',
  },
  'materials.pbrParams': {
    title: 'PBR generation parameters',
    body: 'Normal controls shape an intermediate height field then tangent-space normals (OpenGL / Three.js +Y). Roughness can be derived from the image or written as a uniform value. Generated roughness maps use absolute values — Apply sets the material roughness scalar to 1 so Three.js does not multiply twice.',
  },
  'materials.pbrTiling': {
    title: 'PBR tiling / edge sampling',
    body: 'Wrapped sampling on tiled axes keeps seams continuous when deriving normals. Non-tiled axes clamp at the edge (important for floor-to-ceiling walls that only tile horizontally). Does not bake world UV density into the textures.',
  },
  'materials.pbrPreview': {
    title: 'PBR preview',
    body: 'Lit sphere/flat preview with interactive light direction, plus Base / Normal / Roughness inspections and optional horizontal tile strips. Before/After compares base-color-only vs drafted maps without writing the asset until Apply.',
  },
  'materials.pbrApply': {
    title: 'Apply & Save PBR maps',
    body: 'Writes PNG normal and roughness textures into the asset registry, assigns normalMapId / roughnessMapId on the same material id, preserves UV scale/offset/rotation and base color, sets metalness to 0, and stores generator parameters for later reopening.',
  },
  'workspace.placeholder': {
    title: 'Extension workspace',
    body: 'Reserved tab for a future BloodBound module. The shell is present so layout stays stable; the feature is not implemented yet.',
  },

  // —— AI Assets shell ——
  'ai.section.library': {
    title: 'Project Art Library',
    body: 'Browse, organize, and select concept art. Pin references and send images or regions to Asset Generation. This tab does not run OpenArt jobs.',
  },
  'ai.section.generation': {
    title: 'Asset Generation',
    body: 'OpenArt for images/textures and Meshy for Image-to-3D props. Estimate cost, approve spend, then import results into the project asset pipeline.',
  },
  'ai.provider.openart': {
    title: 'OpenArt provider',
    body: 'Live image provider driven by the OpenArt CLI. Connect/log in from Generation Settings before estimating or generating.',
  },
  'ai.provider.meshy': {
    title: 'Meshy provider',
    body: 'Image-to-3D for static environment props via the official Meshy CLI. Use Log in for browser OAuth. Estimate and approve credits before each paid task.',
    tips: 'Install: npm install -g meshy-cli (Node 22.12+). Game Prop preset: Smart Topology T2.5, 5k triangles, meshy-7 PBR @ 2K.',
  },
  'ai.provider.soon': {
    title: 'Coming soon provider',
    body: 'Layout placeholder only. Selecting it shows a Coming Soon panel — no jobs run.',
  },

  'meshy.controls': {
    title: 'Meshy settings',
    body: 'Configure Image-to-3D: Smart Topology vs Standard, polycount, textures, PBR, and credit estimate. Generation never starts from a handoff alone.',
  },
  'meshy.connect': {
    title: 'Log in to Meshy',
    body: 'Runs `meshy auth login` so you can sign in with your Meshy account in the browser. Finish signing in, then Refresh. The CLI stores credentials — BloodBound never reads the token.',
    tips: 'If the browser does not open, use device sign-in from a terminal: meshy auth login --device.',
  },
  'meshy.reference': {
    title: 'Meshy reference',
    body: 'Source image for Image-to-3D. Import a file, pick a Project Art tray reference, or use Send to Meshy / Send Region to Meshy from the library.',
  },
  'meshy.preset': {
    title: 'Game Prop preset',
    body: 'Applies Smart Topology (meshy-t2.5), 5,000 triangles, textures on, PBR on with meshy-7 at 2K, GLB output. N1 cannot enable PBR.',
  },
  'meshy.settings': {
    title: 'Meshy generation settings',
    body: 'Only valid model/parameter combinations are offered. Smart Topology is triangle-only. PBR requires a PBR-capable texture model (meshy-7 or meshy-6-lite). Settings are forwarded to `meshy image-to-3d create`.',
  },
  'meshy.estimate': {
    title: 'Estimate Meshy cost',
    body: 'Validates settings, binds the exact CLI argv, runs `meshy make --dry-run` when possible, and quotes documented credits for the approved request. Does not create a paid task.',
  },
  'meshy.generate': {
    title: 'Generate with Meshy',
    body: 'Asks for explicit spend approval, then submits one `image-to-3d create --async` via the CLI. Exit code 10 / ambiguous submits are not auto-retried — recover the task first.',
  },
  'meshy.results': {
    title: 'Meshy result preview',
    body: 'Orbit/pan/zoom the staged GLB. Inspect triangle counts and embedded maps. Import Model writes a local mesh asset before provider URLs expire.',
  },
  'meshy.import': {
    title: 'Import Meshy model',
    body: 'Downloads the staged GLB into project Meshes via the existing mesh pipeline. Repositions the pivot to bottom-center (feet on the origin) and, for upright character-like meshes, bakes scale to ~1.75 m tall. A browser WebGL pass writes an Asset Viewer thumbnail afterward. Preserves embedded materials/textures. Does not create expensive colliders.',
  },
  'meshy.discard': {
    title: 'Discard Meshy result',
    body: 'Clears the staged generation result. Already-imported production mesh assets are kept.',
  },

  // —— Project Art Library ——
  'projectArt.nav.filters': {
    title: 'Library filters',
    body: 'All Assets, Recent, and Favorites list across the library. Projects tree and gallery folders navigate the on-disk folder hierarchy.',
  },
  'projectArt.nav.externalLibraries': {
    title: 'External Libraries',
    body: 'Connect shared Google Drive folders as read-only art sources. Add a folder URL, Connect Google Account when private access is required, then browse with the same gallery, tray, and region tools as Project Art.',
    tips: 'External folders never modify Drive files. Copy to Project Art Library before rename/move/delete. Generation downloads a local copy first so OpenArt/Meshy do not depend on temporary Drive URLs. OAuth credentials stay on the Vite server (.google-drive-oauth.json / tokens) — never in Git.',
  },
  'projectArt.nav.collections': {
    title: 'Collections',
    body: 'Named groups of library items (e.g. art-direction sets). Opening a collection filters the gallery to those items.',
  },
  'projectArt.nav.tags': {
    title: 'Tags',
    body: 'Click a tag to filter the library. Edit tags on the Details tab of a selected image.',
  },
  'projectArt.gallery': {
    title: 'Art gallery',
    body: 'Folder tiles open subfolders. Image tiles select assets (Ctrl/Cmd multi-select, Shift range, Ctrl+A all visible files). Drag images onto the gallery to import into the current folder. Google Drive galleries load thumbnails on demand.',
    shortcut: 'Ctrl+A',
    tips: 'Import requires an open local Project Art folder — not All Assets / Favorites / tag views / External Drive.',
  },
  'projectArt.import': {
    title: 'Import images',
    body: 'Import image files into the currently open Project Art folder. Disabled for Google Drive libraries (read-only) and until a local folder is open.',
  },
  'projectArt.tray': {
    title: 'Generation References tray',
    body: 'Pinned Project Art images that Asset Generation uses as references. Add from selection (+ / Use as Reference); remove with × on a thumb.',
  },
  'projectArt.region.select': {
    title: 'Select Region',
    body: 'Toggle region drawing on the preview, then drag a rectangle. The crop of that region becomes the OpenArt --image reference — not the full concept image, and not a new Project Art asset file.',
    tips: 'Send Region auto-composes a Wall Texture (or selected) template prompt. It does not reuse the concept’s original generation prompt. Clear Region removes the selection.',
  },
  'projectArt.region.clear': {
    title: 'Clear Region',
    body: 'Removes the temporary rectangle selection from the preview and from the handoff store.',
  },
  'projectArt.detail.tabs': {
    title: 'Preview tabs',
    body: 'Details: metadata, tags, description. Prompt: editable working generation prompt. Generation: original prompt, provider/model, template, tiling, source region, and cropped-reference provenance.',
  },
  'projectArt.action.useAsReference': {
    title: 'Use as Reference',
    body: 'Pins the selected image(s) into the Generation References tray for Asset Generation. Does not start a job.',
  },
  'projectArt.action.sendToGeneration': {
    title: 'Send to Generation',
    body: 'Opens Asset Generation with this image as a reference and the current folder as the Project Art save target. A saved prompt is transferred when present; otherwise you choose a template or enter a prompt in Asset Generation. Prompt/credit checks happen at Estimate / Generate — not here.',
    tips: 'Works for local Project Art and Google Drive images. Drive files are downloaded into project storage before OpenArt runs.',
  },
  'projectArt.action.sendRegion': {
    title: 'Send Region to Generation',
    body: 'Crops the selected rectangle and stages that crop as the sole OpenArt --image reference (image2image). Auto-composes a template prompt (default Wall Texture). Does not carry the concept’s original generation prompt. Does not spend credits.',
    tips: 'Requires an active region. Changing the template in Asset Generation recomposes the prompt (asks before replacing manual edits). Compose Prompt is optional recomposition. Then Estimate / Generate with spend approval.',
  },
  'projectArt.action.sendToMeshy': {
    title: 'Send to Meshy',
    body: 'Opens Meshy Image-to-3D with this image (or the selected region crop) as the reference and the Game Prop preset applied. No text prompt is required. Does not estimate or spend credits.',
    tips: 'For mansion furniture, crop the object or prepare an isolated reference with OpenArt’s 3D Model Reference template first, then Send to Meshy from the OpenArt result.',
  },

  // —— OpenArt / Asset Generation ——
  'openart.model': {
    title: 'Model',
    body: 'OpenArt image model for this job. Available modes and schema fields refresh when the model changes.',
  },
  'openart.mode': {
    title: 'Mode',
    body: 'Text to image or Image to image (and other modes the selected model exposes). Image to image needs a reference image.',
  },
  'openart.promptTemplate': {
    title: 'Prompt template',
    body: 'Project-level template (Wall Texture, Full Wall Texture, Prop, Character, …) that defines framing, technical constraints, suggested output type, and whether tiling language applies. Selecting a template auto-composes the Prompt field. Full Wall Texture targets floor-to-ceiling elevations (baseboard through crown); tiling still comes only from the Tile checkboxes.',
    tips: 'If you edited the prompt manually, you will be asked before it is replaced. Attached reference crops supply visual material — there is no separate vision-analysis step.',
  },
  'openart.generatePrompt': {
    title: 'Compose Prompt',
    body: 'Explicitly recomposes the editable Prompt from the selected template, optional instructions, and region/crop context. Not required after Send Region or after changing the template (those already compose). Tiling sentences come from the Tile checkboxes when you submit.',
  },
  'openart.prompt': {
    title: 'Prompt',
    body: 'Editable working prompt. Final submitted text is the Prompt plus tiling from the checkboxes (see Final submitted prompt). Manual edits are preserved until you change template (with confirm) or click Compose Prompt.',
  },
  'openart.savePrompt': {
    title: 'Save Prompt',
    body: 'Persists the working prompt into Project Art metadata and can attach it to the source library item for reuse.',
  },
  'openart.tiling': {
    title: 'Tiling options',
    body: 'Tile Horizontal / Tile Vertical append seamless-tiling language to the final submitted prompt (once). Use these checkboxes only — there are no duplicate tiling controls elsewhere.',
    tips: 'Both on → bidirectional tiling. Neither → no tiling sentence. Existing tiling wording in the body is not duplicated.',
  },
  'openart.estimate': {
    title: 'Estimate',
    body: 'Asks OpenArt for the credit cost of the current model, mode, and settings without spending.',
  },
  'openart.generate': {
    title: 'Generate…',
    body: 'Starts an OpenArt job after an explicit spend-approval confirmation. Never auto-spends credits.',
    tips: 'Requires a connected CLI session and a non-empty prompt (plus reference when the mode needs one).',
  },
  'openart.importTexture': {
    title: 'Import Texture',
    body: 'Registers the current generation result as a project texture asset for use in materials and the level.',
  },
  'openart.createMaterial': {
    title: 'Create Material',
    body: 'Creates a material asset from the imported (or importable) generation result texture.',
  },
  'openart.saveProjectArt': {
    title: 'Save to Project Art',
    body: 'Writes the result into the Project Art folder chosen when you sent from the library. Enabled in Project Art save mode.',
  },
  'openart.discard': {
    title: 'Discard result',
    body: 'Clears the current OpenArt preview/result from the session without deleting imported project assets.',
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
    body: 'Imports a glTF/GLB mesh. BloodBound assumes meters in the file and 100 editor units per meter—no automatic rescale. After import, the editor bakes a small WebGL thumbnail for the Asset Viewer grid.',
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
  'assetViewer.generateMeshIcon': {
    title: 'Generate Icon',
    body: 'Saves the current mesh preview camera view as the Asset Viewer thumbnail (square PNG). Orbit/pan/zoom first to frame the shot you want.',
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
  'viewport.showFog': {
    title: 'Show Fog',
    body: 'Toggles distance fog and moving atmosphere for this viewport only. Does not change World Settings fog.',
    tips: 'Off by default in orthographic panes. Perspective and Play keep authored fog unless you turn this off.',
  },
  'viewport.showPostProcessing': {
    title: 'Show Post-Processing',
    body: 'Toggles map post-processing preview for this viewport only. Requires map Post Processing enabled and Editor Preview on.',
    tips: 'Perspective Lit only. Ortho / Unlit / Wireframe stay raw. Multiple perspective panes can preview PP at once.',
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
    shortcut: 'Space',
    tips: 'Also Window → Maximize Active View. Only applies in multi-pane layouts; Space jumps in Play.',
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
    body: 'Guided lessons (Academy) with floating tips that point at the next control. Finish each task to advance; Exit lesson returns to the catalog.',
    tips: 'Help → Tutorials… or Window → Tutorials. Includes level building plus Art & generation (Project Art Library, Asset Generation).',
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
