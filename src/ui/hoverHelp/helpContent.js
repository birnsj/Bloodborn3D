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
    body: 'Scene fill for the whole level (studio IBL, tint, and editor fill lights). Separate from placeable Ambient Light actors. Edit intensity applies in the editor; Play intensity applies when you enter Play. Intensity scrub uses the same World Settings HistoryStack as Scene/Renderer: live preview while dragging, one Undo entry on commit; Escape cancels to the pre-scrub values.',
    tips: 'Black color or intensity 0 removes fill light. G = Game View. Color changes are undoable immediately.',
  },

  'world.scene': {
    title: 'World Scene',
    body: 'Level-authored scene look: background mode (color / environment / sky), HDRI environment lighting, grounded skybox, distance fog, and moving atmosphere. Saved with the map for edit and Play.',
    tips: 'Empty Environment map keeps RoomEnvironment studio IBL. Ortho panes hide fog/sky and use a dark editor clear. 100 eu = 1 m.',
  },
  'world.scene.backgroundType': {
    title: 'Background Mode',
    body: 'Solid color, environment map, or procedural sky as the scene backdrop. Blurriness and background rotation apply when the background is the environment texture.',
    tips: 'Perspective and Play show the authored background; ortho panes keep the editor clear color.',
  },
  'world.scene.backgroundRotation': {
    title: 'Background Rotation',
    body: 'Euler degrees applied to texture/environment backgrounds (Three.js scene.backgroundRotation).',
  },
  'world.scene.environment': {
    title: 'Environment Map',
    body: 'HDR/EXR asset converted through PMREM into scene.environment for PBR reflections. Import via Asset Viewer or the World Settings file picker. Empty = RoomEnvironment fallback. Numeric intensity/rotation/blurriness scrub once into Undo (live preview while dragging).',
    tips: 'Assets live under Environments / Textures with .hdr or .exr. Independent of Ambient fill when an authored map is set.',
  },
  'world.scene.environmentIntensity': {
    title: 'Environment Intensity',
    body: 'First-class IBL gain for an authored HDRI/EXR (scene.environmentIntensity). Disabled while using RoomEnvironment — Ambient edit/play intensity drives that fallback.',
  },
  'world.scene.environmentRotation': {
    title: 'Environment Rotation',
    body: 'Euler degrees for the environment map (scene.environmentRotation). Does not rotate the camera.',
  },
  'world.scene.lightProbe': {
    title: 'Light Probe',
    body: 'Bakes a Three.js LightProbe from the authored PMREM cubemap (LightProbeGenerator). Adds diffuse irradiance on top of the environment map.',
    tips: 'Requires an HDR/EXR environment asset. Rebuilds when the map changes.',
  },
  'world.scene.sky': {
    title: 'Procedural Sky',
    body: 'Preetham analytical sky (three/addons/objects/Sky.js). Set Background mode to Procedural sky. Turbidity, Rayleigh, Mie, and sun elevation/azimuth control the look.',
    tips: 'Hidden in orthographic panes. WebGL Sky — not SkyMesh.',
  },
  'world.scene.groundedSkybox': {
    title: 'Grounded Skybox',
    body: 'Ground-projected env map mesh (GroundedSkybox). Uses the active environment texture. Height and radius are meters.',
    tips: 'Requires an authored HDR/EXR. Hidden in ortho panes.',
  },
  'world.scene.atmosphere': {
    title: 'Moving Atmosphere',
    body: 'Optional layers on top of distance fog: world-space particle Mist, lagged Noise sheets, and a local Volumetric volume. Soft depth fades stop fog at walls. Independent of post-processing.',
    tips: 'Perspective and Play only. Mist drifts in world space (you move through it). Volumetric steps trade quality for cost. Noise alone uses soft sheets; with Volumetric on, noise drives the volume shader instead.',
  },
  'world.scene.mist': {
    title: 'Mist',
    body: 'World-space particle fog that drifts through the level. You fly through it; it does not stick to the camera.',
    tips: 'Count, speed, opacity, and size (meters) control density and motion. Soft depth fades keep mist from cutting through walls.',
  },
  'world.scene.noise': {
    title: 'Noise Atmosphere',
    body: 'Lagged noise sheets that break up fog density. Alone they render as soft sheets; with Volumetric on, the same noise drives the volume shader.',
    tips: 'Strength, scale, and speed tune how busy the pattern feels.',
  },
  'world.scene.volumetric': {
    title: 'Volumetric Fog',
    body: 'Local raymarched fog volume with soft depth against geometry. Heavier than Mist or Noise alone.',
    tips: 'Density and steps trade look for cost. Combine with Noise for animated density inside the volume.',
  },

  'world.renderer': {
    title: 'World Renderer',
    body: 'Level-authored WebGLRenderer settings: tone mapping mode/exposure, output color space, and shadow map on/off + type. Saved with the map.',
    tips: 'When Post Processing is composing, PP owns tone mapping and exposure. Shadow types: Basic, PCF, VSM. Legacy PCF Soft loads as PCF.',
  },
  'world.renderer.outputColorSpace': {
    title: 'Output Color Space',
    body: 'Renderer outputColorSpace: sRGB (default display) or Linear sRGB. Independent of tone mapping.',
  },

  'world.postProcessing': {
    title: 'Post Processing',
    body: 'Map-authored fullscreen image effects (bloom, SSAO, vignette, tone mapping, and more) applied after scene lighting. Uses the pmndrs postprocessing library. Disabled maps keep the previous ACES look.',
    tips: 'Checking an effect also turns master Enabled on. Ambient = scene fill. Lights = local. Exposure / tone mapping = HDR→display. Ortho / wireframe stay raw. Use the viewport PP chip to preview per pane.',
  },
  'world.postProcessingExposure': {
    title: 'Exposure',
    body: 'Scales HDR scene luminance before tone mapping when post-processing is enabled (ToneMappingEffect uses Three’s toneMappingExposure). Default 0.95 matches the legacy renderer.',
    tips: 'Raise exposure to brighten the whole image without changing World Ambient or individual lights.',
  },
  'world.postProcessingPreview': {
    title: 'Editor Preview',
    body: 'When on, perspective Lit panes with the PP chip on show map post-processing while editing. Play always uses map settings. This toggle is an editor preference, not saved in the level JSON.',
  },

  // —— Help menu ——
  'help.shortcuts': {
    title: 'Keyboard Shortcuts',
    body: 'Open Help → Keyboard Shortcuts… for edit (including Ctrl+Shift+S Save All), transform, geometry/clip (Enter/Esc), grid, placement (Tab), camera, play, and Project Art Library gallery bindings.',
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
    body: 'Select actors in the viewport and use the transform gizmo. Drag on empty space for a marquee. Switch modes with W (move), E (rotate), or R (scale). P enters Pivot Edit.',
    tips: 'W/E/R · P pivot · R again toggles face-resize ↔ Unreal scale gizmo · F focus · Alt+gizmo = duplicate.',
  },
  'toolbar.pivotEdit': {
    title: 'Pivot Edit',
    body: 'Move the actor origin (pivot) with the translation gizmo without moving visible geometry, collision, or child actors. Subsequent rotate/scale use the new pivot. Escape cancels an active drag or exits the mode.',
    shortcut: 'P',
    tips: 'Works on StaticMesh, PrimitiveMesh, and brushes. Details → Pivot has presets (center, bottom, faces, corners) and numeric content offset.',
  },
  'toolbar.gizmoSpace': {
    title: 'Gizmo Space',
    body: 'World: axes align to the world. Local: axes follow the selected actor’s rotation. Applies to Move and Pivot Edit.',
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
    tips: 'Edit intensity, color, range, decay, shadows, and optional lensflare in Details after placing.',
  },
  'toolbar.hemiLight': {
    title: 'Hemisphere Light',
    body: 'Places a HemisphereLight with sky and ground colors. Soft fill by surface normal — does not cast shadows.',
  },
  'toolbar.rectAreaLight': {
    title: 'Rect Area Light',
    body: 'Places a RectAreaLight panel (width/height). Soft area lighting for MeshStandardMaterial and MeshPhysicalMaterial. Three.js WebGL does not cast RectAreaLight shadows — there is no shadow toggle. Basic, Toon, and Matcap materials typically do not receive area lighting. Initializes RectAreaLightUniformsLib once.',
  },
  'toolbar.ambientLight': {
    title: 'Ambient Light (actor)',
    body: 'Places an AmbientLight actor. Separate from World Settings ambient fill — both can contribute.',
  },
  'toolbar.water2': {
    title: 'Water 2',
    body: 'Planar Water2 surface with flow, normal maps, and reflection/refraction render targets. Perspective-only RT; ortho shows a proxy.',
  },
  'toolbar.water': {
    title: 'Water',
    body: 'Simpler Water.js reflective plane with distortion and sun direction. Use for ponds and basins.',
  },
  'toolbar.reflector': {
    title: 'Mirror',
    body: 'Official Reflector plane. Editable size, tint, and RT resolution. Nested mirror recursion is blocked.',
  },
  'toolbar.refractor': {
    title: 'Refractor',
    body: 'Official Refractor plane for refractive glass-like surfaces. Same RT lifecycle rules as mirrors.',
  },
  'toolbar.decal': {
    title: 'Decal',
    body: 'Projects DecalGeometry onto a target brush or static mesh. Set target actor, texture, size, and depth offset in Details.',
  },
  'toolbar.sprite': {
    title: 'Billboard',
    body: 'Authored Sprite (not an editor helper). Texture, color, opacity, size attenuation, and fog. Always faces the camera.',
  },
  'toolbar.skyPlaceable': {
    title: 'Placeable Sky',
    body: 'Sky.js actor. While present and enabled it suppresses the World Settings procedural sky mesh; authored world.scene.sky JSON is kept.',
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
    body: 'Structural brushes (box, wall, curved wall, floor, ceiling, ramp, stairs, column, arches, subtract) plus Batch 5 native/procedural props (sphere, torus, extrude, lathe, tube, text, …). Brushes stay for architecture; primitives are prop meshes.',
  },
  'toolbar.primitive': {
    title: 'Native / Procedural Mesh',
    body: 'Places a PrimitiveMesh prop (Three.js geometry). Complements brushes — not used for subtractive CSG. Edit type-specific size, segments, material, and collision in Details.',
  },
  'details.primitiveMesh': {
    title: 'Primitive Mesh',
    body: 'Native or procedural Three.js geometry as a placeable prop. Assign materials, segments, collision, and shadows. Not a subtractive brush.',
  },
  'details.primitiveMesh.material': {
    title: 'Primitive Material',
    body: 'Project material asset applied to the whole mesh. Use dense Plane/Sphere segments when the material has a displacement map.',
  },
  'details.primitiveMesh.segments': {
    title: 'Segments / Detail',
    body: 'Controls tessellation density. Displacement segments densify Plane/Sphere for visible height relief. Soft vertex caps block runaway allocations. Existing brush solids are not retessellated.',
  },
  'creation.environment': {
    title: 'Environment',
    body: 'Water 2, Water, Mirror, Refractor, Decal, Billboard, and placeable Sky. RT surfaces update in perspective; ortho panes use proxy planes.',
  },
  'creation.lights': {
    title: 'Lights',
    body: 'Point, Spot, Directional, Hemisphere, Rect Area, and Ambient lights. Drag onto surfaces for surface-aware placement.',
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
  'details.authoringLayer': {
    title: 'Authoring Layer',
    body: 'Membership in a hierarchical authoring layer (Architecture, Props, Lighting, …). Independent of parenting, Cells, and Prefabs. New actors use the Active layer from the Layers panel.',
    tips: 'Layer hide/lock/solo are editor filters only — they do not change this actor’s Visible/Locked flags.',
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
  'details.pivot': {
    title: 'Pivot',
    body: 'Content offset is where geometry sits relative to the actor origin. Editing the pivot (gizmo, presets, or numeric offset) keeps world geometry fixed while changing the origin used for rotate/scale.',
  },
  'details.pivot.offset': {
    title: 'Content Offset',
    body: 'Editor-unit offset of the content frame from the pivot. Changing these values compensates the actor location so the mesh does not jump.',
  },
  'details.pivot.editMode': {
    title: 'Pivot Edit Mode',
    body: 'Same as the toolbar Pivot button (P). Drag the translation gizmo to reposition the origin.',
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
  'details.environment': {
    title: 'Environment Properties',
    body: 'Type-specific water / mirror / refractor / decal / billboard / sky fields. Numeric scrub = live preview + one Undo entry. RT quality and perspective-only controls limit cost.',
  },
  'details.environment.sky': {
    title: 'Placeable Sky vs World Sky',
    body: 'A placeable Sky actor drives the procedural dome and hides WorldSky. Remove or disable the actor to restore World Settings sky when backgroundType is sky.',
  },
  'details.light': {
    title: 'Light Properties',
    body: 'Type-specific groups: base (color/intensity/decay/power), spot gobo, aim target, shadows (bias/camera), lensflare presets, and optional native helpers. Numeric scrub = live preview + one Undo entry on commit.',
  },
  'details.light.type': {
    title: 'Light Type',
    body: 'Switches the Three.js light class. Legacy levels keep Point/Spot/Directional/Ambient appearance; Hemisphere and Rect Area are Batch 3 additions.',
  },
  'details.light.hemisphere': {
    title: 'Hemisphere Colors',
    body: 'Sky color (primary) and ground color blend by surface normal.',
  },
  'details.light.rectArea': {
    title: 'Rect Area Size',
    body: 'Width/height in editor units (100 eu = 1 m). Native Three.js RectAreaLight never casts shadows (no UI affordance). Softbox contribution is intended for Standard/Physical; Basic/Toon/Matcap may ignore area lights.',
  },
  'details.light.decay': {
    title: 'Decay',
    body: 'Distance falloff exponent for Point/Spot (default 2 — matches pre-Batch-3 hardcoded behavior).',
  },
  'details.light.power': {
    title: 'Power (lumens)',
    body: 'Physical luminous power helper for Point/Spot. Editing power sets intensity ≈ power / (4π). Intensity remains the serialized fallback when power is unset.',
  },
  'details.light.target': {
    title: 'Light Target',
    body: 'Aim Spot/Directional at another actor. Empty = legacy local −Y aim from the light’s rotation.',
  },
  'details.light.spotMap': {
    title: 'Spot Projection Map',
    body: 'Texture projected through the spotlight cone (gobo/cookie). Uses the SpotLight.map slot.',
  },
  'details.light.shadowBias': {
    title: 'Shadow Bias',
    body: 'bias / normalBias reduce acne; radius softens PCF/VSM; blur samples apply to VSM. Camera near/far and directional ortho size control the shadow frustum.',
  },
  'details.light.lensflare': {
    title: 'Lensflare',
    body: 'Official three/addons Lensflare with local CC0 flare textures. Soft/Bright presets. Hidden in orthographic panes (editor policy). In perspective, occlusion follows the addon’s depth test against the scene — deep/edge occlusion cases match Three.js behavior, not a custom BloodBound raycast.',
  },
  'details.light.helper': {
    title: 'Light Helper',
    body: 'Optional native Three.js light helper (Point/Spot/Dir/Hemi/RectArea) in addition to pick gizmos. Editor-only.',
  },
  'details.staticMesh': {
    title: 'Static Mesh',
    body: 'Imported mesh prop (Batch 6). Groups: Collision (none/auto/box/sphere/capsule/cylinder/convex/trimesh), Materials (per-slot overrides without editing the GLB), LOD (asset + distance thresholds), Rendering (shadows, frustum, opt-in InstancedMesh).',
  },
  'details.staticMesh.collision': {
    title: 'Static Mesh Collision',
    body: 'Auto uses the asset AABB as a box. Convex/trimesh extract geometry from the loaded GLB (Play preloads). Trimesh requires a fixed body. Show collision draws a wireframe helper in edit mode.',
  },
  'details.staticMesh.materials': {
    title: 'Static Mesh Materials',
    body: 'Assign BloodBound materials to discovered GLB slots (`meshName:matIndex`). Clear a slot or Restore all to use original imported materials. Source GLB files are never rewritten.',
  },
  'details.staticMesh.lod': {
    title: 'Static Mesh LOD',
    body: 'Assign mesh assets to LOD levels with distances in editor units (100 eu = 1 m). Preview forces a level; Automatic follows camera distance. Generate auto LOD creates derived simplified meshes (Batch 7) without overwriting the source. Collision is independent of the visible LOD.',
  },
  'details.staticMesh.rendering': {
    title: 'Static Mesh Rendering',
    body: 'Shadows, frustum culling, render order, and opt-in InstancedMesh (off / auto ≥3 / force). Actors stay independent for selection and save. BatchedMesh deferred for multi-material atlases.',
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
    body: 'Edit material definitions: shading model (Standard / Physical / Basic / Toon / Matcap), maps, Physical groups, opacity/flags, and live preview. Use Generate PBR Maps to derive local normal and roughness from a base-color texture. Scrub Undo/Redo is draft-local (one entry per finished numeric adjustment). Switch back to Level Editor to assign materials to brushes and faces.',
  },
  'materials.shadingModel': {
    title: 'Shading Model',
    body: 'Selects the Three.js material class: Standard (MeshStandardMaterial, default), Physical (clearcoat/transmission/sheen/…), Basic (unlit), Toon (gradient map), or Matcap. Legacy assets without a model stay Standard so appearance is unchanged.',
    tips: 'Only property groups that apply to the selected model are shown. Physical glass and clearcoat look best with a Batch 1 HDRI environment.',
  },
  'materials.transmission': {
    title: 'Transmission / Glass',
    body: 'Physical transmission (0–1) with thickness, IOR, attenuation color/distance, and optional dispersion. Enable transparent rendering as needed; depth write is often off for thick glass.',
  },
  'materials.alphaTest': {
    title: 'Alpha Test / Coverage',
    body: 'Alpha Test discards fragments below a cutoff (good for foliage cards). Alpha Hash dithered transparency; Alpha To Coverage uses MSAA coverage when the renderer supports it. Pair with an alpha map and double-sided faces for leaves.',
  },
  'materials.matcap': {
    title: 'Matcap Map',
    body: 'Spherical matcap texture for MeshMatcapMaterial. Lighting is baked into the map — scene lights have little effect.',
  },
  'materials.toon': {
    title: 'Toon Gradient Map',
    body: '1D (or small) gradient LUT for MeshToonMaterial cel bands. Sampled with nearest filtering.',
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
    body: 'Imports PNG/JPEG/WebP/GIF/KTX2 textures or HDR/EXR environment maps into the project registry. HDR/EXR go under Environments and can be assigned in World Settings → Scene.',
  },
  'content.importMesh': {
    title: 'Import Mesh',
    body: 'Imports GLB/GLTF, FBX, OBJ, STL, PLY, Collada (.dae), or USDZ. Foreign formats convert to GLB for the production pipeline; the original source file is stored alongside. Unsupported features are reported as import notes. Units: meters in file, 100 editor units per meter.',
    tips: 'Double-click a mesh to inspect, simplify, generate LODs, or export. Source registry assets are never overwritten by simplify/LOD.',
  },
  'content.newMaterial': {
    title: 'New Material',
    body: 'Creates a material asset and bakes a lit-sphere thumbnail for the Asset Viewer grid using the same studio lighting as the detail preview (so metal/glass read correctly). If a texture is selected, it becomes the base color map. Older CPU thumbs upgrade automatically when the registry loads.',
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
  'assetViewer.meshTools': {
    title: 'Mesh Asset Tools',
    body: 'Batch 7 tools: inspection (tris/verts/materials/bounds/relationships), non-destructive SimplifyModifier preview/save, auto LOD derived assets, and format export (GLB/GLTF/OBJ/STL/PLY/USDZ). Compression decode (DRACO/Meshopt/KTX2) is local; encode authoring is deferred.',
    tips: 'Simplified and LOD meshes are always new derived assets — the source GLB stays intact.',
  },
  'assetViewer.pivot': {
    title: 'Default Placement Pivot',
    body: 'Stores meta.defaultContentOffset for future mesh placements. Interactive Pivot Edit in the preview uses the translation gizmo; geometry stays fixed while the proposed pivot moves. Apply writes meta; Cancel/Escape discard the draft. Does not rewrite the source GLB and does not move actors already in levels.',
    tips: 'RGB axes mark the imported origin; gold marks the proposed placement pivot. Rot Y / Scale preview spins around that pivot without saving.',
  },
  'assetViewer.pivotEdit': {
    title: 'Asset Viewer Pivot Edit',
    body: 'Enables the translation gizmo on the mesh preview. Drag axes (with optional 25 eu snap), edit XYZ, or use presets. Apply saves defaultContentOffset for future placements only; Cancel or Escape restores the last saved meta.',
  },
  'details.staticMesh.autoLod': {
    title: 'Generate Auto LOD',
    body: 'Runs SimplifyModifier at default ratios (100% / 50% / 25%), saves L1/L2 as derived mesh assets, and assigns Static Mesh LOD distances. Collision stays on the actor collider and is independent of visual LODs.',
  },
  'assetViewer.generateMaterialIcon': {
    title: 'Generate Icon',
    body: 'Saves a center crop of the live material preview as the Asset Viewer thumbnail (square PNG) — same lighting and framing you see. Orbit/zoom first to frame the shot you want.',
  },
  'assetViewer.thumbSize': {
    title: 'Thumbnail Size',
    body: 'Scales Asset Viewer grid thumbnails. Preference is saved with the workspace layout.',
  },
  'texture.inspector': {
    title: 'Texture Inspector',
    body: 'Asset-level sampling (wrap, mag/min filter, mipmaps, anisotropy, color space) and transform (repeat, offset, rotation, center, flipY). Draft changes preview live; Apply writes texture meta and clears the GPU texture cache. GPU memory shown is an estimate, not a live query.',
    tips: 'Compressed KTX2 disables generateMipmaps and flipY. Sampling is shared by texture asset id — duplicate the asset for independent filters.',
  },
  'texture.transform': {
    title: 'Texture Transform',
    body: 'Asset-default UV matrix on the texture (repeat/offset/rotation/center). Center defaults to (0,0) like Three.js so repeat/rotation stay origin-anchored with brush density UVs. Distinct from surface face UV (Layer 1) and material UV (Layer 2). Material UV multiplies on top of the asset transform once.',
  },
  'materials.uvChannels': {
    title: 'UV Channels',
    body: 'Per-map geometry UV set (Three.js Texture.channel, UV0–UV3). Defaults are UV0; set AO/lightMap to UV1/UV2 when geometry has those sets. Missing channels warn at bind time. Does not bake lighting.',
  },
  'materials.uvLayers': {
    title: 'Material UV Layers',
    body: 'Layer 0 = authored geometry UVs. Layer 1 = per-face/surface UV. Layer 2 = material uvScale/offset/rotation applied to all maps. Texture Asset Viewer transform sits under Layer 2 and must not be double-applied.',
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
    body: 'Toggles distance fog and moving atmosphere for this viewport pane only. Does not change World Settings fog authorship.',
    tips: 'Off by default in orthographic panes (they also use a dark editor clear instead of the map background). Perspective and Play keep authored fog unless you turn this chip off.',
  },
  'viewport.showPostProcessing': {
    title: 'Show Post-Processing',
    body: 'Toggles map post-processing preview for this viewport pane only. Needs map Post Processing enabled (or an effect checked) and Editor Preview on.',
    tips: 'Perspective Lit only. Ortho / Unlit / Wireframe stay raw. Each perspective pane can show or hide PP independently.',
  },
  'viewport.layout': {
    title: 'Viewport Layout',
    body: 'Split the level viewport into one, two, three, or four panes. Each pane has its own Cam, View, Fog, and PP chips.',
    tips: 'Also under View → Viewport Layout. Maximize expands the active pane; Restore returns to the split. Space maximizes in multi-pane (jumps in Play).',
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
    tips: 'Help → Tutorials… or Window → Tutorials. Covers building, workspace Fog/PP chips, World Fog & Atmosphere, Post Processing, Project Art Library, and Asset Generation.',
  },
  'panel.layers': {
    title: 'Layers',
    body: 'Hierarchical authoring layers for organizing the level. Set Active for new actor membership; eye/lock/solo filter the viewport in edit mode only. Drag Outliner actors onto a layer to assign. Nested visibility/lock is self ∧ ancestors; solo restores the prior hidden map when cleared.',
    tips: 'Window → Layers. Prefab assets strip map layer IDs; place assigns the Active layer. Not mapped to THREE.Layers.',
  },
  'layers.new': {
    title: 'New Layer',
    body: 'Creates a top-level authoring layer. Right-click a layer for New Child Layer, rename, delete (with actor reassignment), or select-all-in-layer.',
  },
  'layers.assignSelection': {
    title: 'Assign Selection',
    body: 'Moves the current selection onto the Active authoring layer (undoable).',
  },
  'outliner.layerFilter': {
    title: 'Filter by Layer',
    body: 'Shows only actors on the chosen authoring layer (and their ancestors for hierarchy context). Does not replace parent-based Outliner tree.',
  },
  'viewport.viewHelper': {
    title: 'ViewHelper',
    body: 'Corner axis gizmo on perspective panes. Click an axis to animate the camera toward that view around the orbit focus. Hidden in orthographic panes and Play.',
    tips: 'TextureHelper is deferred — use the Texture Inspector for sampling diagnostics.',
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
