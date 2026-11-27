/**
 * Data-driven creation toolbar catalog.
 * Only exposes tools that map to implemented editor APIs.
 */

import {
  buildRecentCreationAssetTools,
  loadRecentCreationAssets,
} from './recentCreationAssets.js';

export const CREATE_DRAG_MIME = 'application/x-bloodbound-create';

/** @typedef {'mode'|'place'|'asset'} CreateActionKind */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   helpId: string,
 *   icon: string,
 *   action: CreateActionKind,
 *   tool?: string,
 *   placeKind?: string,
 *   lightType?: string,
 *   assetKind?: 'mesh'|'prefab',
 *   assetId?: string,
 *   placement: 'footprint'|'upright'|'wall'|'free',
 * }} CreationToolDef
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   icon: string,
 *   helpId: string,
 *   tools: CreationToolDef[],
 * }} CreationCategoryDef
 */

/** Built-in categories (assets category is filled dynamically). */
export const CREATION_CATEGORIES = /** @type {CreationCategoryDef[]} */ ([
  {
    id: 'geometry',
    label: 'Geometry',
    icon: 'geometry',
    helpId: 'creation.geometry',
    tools: [
      {
        id: 'box',
        label: 'Box',
        helpId: 'toolbar.box',
        icon: 'box',
        action: 'mode',
        tool: 'box',
        placement: 'footprint',
      },
      {
        id: 'wall',
        label: 'Wall',
        helpId: 'toolbar.wall',
        icon: 'wall',
        action: 'mode',
        tool: 'wall',
        placement: 'footprint',
      },
      {
        id: 'curvedWall',
        label: 'Curved Wall',
        helpId: 'toolbar.curvedWall',
        icon: 'curvedWall',
        action: 'mode',
        tool: 'curvedWall',
        placement: 'footprint',
      },
      {
        id: 'floor',
        label: 'Floor',
        helpId: 'toolbar.floor',
        icon: 'floor',
        action: 'mode',
        tool: 'floor',
        placement: 'footprint',
      },
      {
        id: 'ceiling',
        label: 'Ceiling',
        helpId: 'toolbar.ceiling',
        icon: 'ceiling',
        action: 'mode',
        tool: 'ceiling',
        placement: 'footprint',
      },
      {
        id: 'ramp',
        label: 'Ramp',
        helpId: 'toolbar.ramp',
        icon: 'ramp',
        action: 'mode',
        tool: 'ramp',
        placement: 'footprint',
      },
      {
        id: 'stair',
        label: 'Stairs',
        helpId: 'toolbar.stair',
        icon: 'stairs',
        action: 'mode',
        tool: 'stair',
        placement: 'footprint',
      },
      {
        id: 'column',
        label: 'Column',
        helpId: 'toolbar.column',
        icon: 'column',
        action: 'mode',
        tool: 'column',
        placement: 'footprint',
      },
      {
        id: 'archRoman',
        label: 'Roman Arch',
        helpId: 'toolbar.archRoman',
        icon: 'arch',
        action: 'mode',
        tool: 'archRoman',
        placement: 'footprint',
      },
      {
        id: 'archGothic',
        label: 'Gothic Arch',
        helpId: 'toolbar.archGothic',
        icon: 'archGothic',
        action: 'mode',
        tool: 'archGothic',
        placement: 'footprint',
      },
      {
        id: 'subtract',
        label: 'Subtract',
        helpId: 'toolbar.subtract',
        icon: 'subtract',
        action: 'mode',
        tool: 'subtract',
        placement: 'footprint',
      },
      // —— Batch 5 native / procedural props (not brushes) ——
      ...[
        ['primBox', 'Box Prim', 'box', 'footprint'],
        ['primPlane', 'Plane', 'plane', 'footprint'],
        ['primCircle', 'Circle', 'circle', 'footprint'],
        ['primSphere', 'Sphere', 'sphere', 'upright'],
        ['primCapsule', 'Capsule', 'capsule', 'upright'],
        ['primCylinder', 'Cylinder', 'cylinder', 'upright'],
        ['primCone', 'Cone', 'cone', 'upright'],
        ['primRing', 'Ring', 'ring', 'footprint'],
        ['primTorus', 'Torus', 'torus', 'upright'],
        ['primTorusKnot', 'Torus Knot', 'torusKnot', 'upright'],
        ['primTetra', 'Tetrahedron', 'tetrahedron', 'upright'],
        ['primOcta', 'Octahedron', 'octahedron', 'upright'],
        ['primDodeca', 'Dodecahedron', 'dodecahedron', 'upright'],
        ['primIcosa', 'Icosahedron', 'icosahedron', 'upright'],
        ['primRoundedBox', 'Rounded Box', 'roundedBox', 'footprint'],
        ['primShape', 'Shape', 'shape', 'footprint'],
        ['primExtrude', 'Extrude', 'extrude', 'footprint'],
        ['primLathe', 'Lathe', 'lathe', 'upright'],
        ['primTube', 'Tube', 'tube', 'footprint'],
        ['primConvex', 'Convex Hull', 'convex', 'upright'],
        ['primText', 'Text', 'text', 'upright'],
        ['primParametric', 'Parametric', 'parametric', 'upright'],
      ].map(([id, label, primitive, placement]) => ({
        id,
        label,
        helpId: 'toolbar.primitive',
        icon: primitive,
        action: 'place',
        placeKind: 'primitive',
        primitive,
        placement,
      })),
    ],
  },
  {
    id: 'environment',
    label: 'Environment',
    icon: 'environment',
    helpId: 'creation.environment',
    tools: [
      {
        id: 'water2',
        label: 'Water 2',
        helpId: 'toolbar.water2',
        icon: 'water',
        action: 'place',
        placeKind: 'environment',
        envType: 'water2',
        placement: 'footprint',
      },
      {
        id: 'water',
        label: 'Water',
        helpId: 'toolbar.water',
        icon: 'water',
        action: 'place',
        placeKind: 'environment',
        envType: 'water',
        placement: 'footprint',
      },
      {
        id: 'reflector',
        label: 'Mirror',
        helpId: 'toolbar.reflector',
        icon: 'mirror',
        action: 'place',
        placeKind: 'environment',
        envType: 'reflector',
        placement: 'wall',
      },
      {
        id: 'refractor',
        label: 'Refractor',
        helpId: 'toolbar.refractor',
        icon: 'refractor',
        action: 'place',
        placeKind: 'environment',
        envType: 'refractor',
        placement: 'wall',
      },
      {
        id: 'decal',
        label: 'Decal',
        helpId: 'toolbar.decal',
        icon: 'decal',
        action: 'place',
        placeKind: 'environment',
        envType: 'decal',
        placement: 'wall',
      },
      {
        id: 'sprite',
        label: 'Billboard',
        helpId: 'toolbar.sprite',
        icon: 'billboard',
        action: 'place',
        placeKind: 'environment',
        envType: 'sprite',
        placement: 'upright',
      },
      {
        id: 'skyPlaceable',
        label: 'Sky',
        helpId: 'toolbar.skyPlaceable',
        icon: 'sky',
        action: 'place',
        placeKind: 'environment',
        envType: 'sky',
        placement: 'free',
      },
    ],
  },
  {
    id: 'lights',
    label: 'Lights',
    icon: 'light',
    helpId: 'creation.lights',
    tools: [
      {
        id: 'pointLight',
        label: 'Point Light',
        helpId: 'toolbar.pointLight',
        icon: 'pointLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'point',
        placement: 'upright',
      },
      {
        id: 'spotLight',
        label: 'Spot Light',
        helpId: 'toolbar.spotLight',
        icon: 'spotLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'spot',
        placement: 'wall',
      },
      {
        id: 'dirLight',
        label: 'Directional Light',
        helpId: 'toolbar.dirLight',
        icon: 'dirLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'directional',
        placement: 'free',
      },
      {
        id: 'hemiLight',
        label: 'Hemisphere Light',
        helpId: 'toolbar.hemiLight',
        icon: 'hemiLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'hemisphere',
        placement: 'free',
      },
      {
        id: 'rectAreaLight',
        label: 'Rect Area Light',
        helpId: 'toolbar.rectAreaLight',
        icon: 'rectAreaLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'rectArea',
        placement: 'wall',
      },
      {
        id: 'ambientLight',
        label: 'Ambient Light',
        helpId: 'toolbar.ambientLight',
        icon: 'ambientLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'ambient',
        placement: 'free',
      },
    ],
  },
  {
    id: 'actors',
    label: 'Actors',
    icon: 'actors',
    helpId: 'creation.actors',
    tools: [
      {
        id: 'playerSpawn',
        label: 'Player Spawn',
        helpId: 'toolbar.playerSpawn',
        icon: 'spawn',
        action: 'place',
        placeKind: 'spawn',
        placement: 'upright',
      },
      {
        id: 'cell',
        label: 'Cell',
        helpId: 'toolbar.cell',
        icon: 'cell',
        action: 'place',
        placeKind: 'cell',
        placement: 'free',
      },
    ],
  },
  {
    id: 'assets',
    label: 'Prefabs / Assets',
    icon: 'assets',
    helpId: 'creation.assets',
    tools: [], // filled by buildCreationCategories() — last 8 used
  },
]);

/**
 * Build the creation catalog. Prefabs / Assets shows the last 8 placed
 * mesh/prefab assets (not the full registry).
 * @param {Array<{id:string,name:string,kind:string}>} assets
 * @param {{ recent?: Array<{id:string,kind:string,name?:string}> }} [options]
 */
export function buildCreationCategories(assets = [], options = {}) {
  const recent = options.recent ?? loadRecentCreationAssets();
  const assetTools = buildRecentCreationAssetTools(assets, recent);

  return CREATION_CATEGORIES.map((cat) => {
    if (cat.id !== 'assets') return { ...cat, tools: [...cat.tools] };
    return { ...cat, tools: assetTools };
  });
}

export function findCreationTool(categories, toolId) {
  for (const cat of categories) {
    const tool = cat.tools.find((t) => t.id === toolId);
    if (tool) return { category: cat, tool };
  }
  return null;
}

export function parseCreateDragPayload(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data?.toolId) return null;
    return data;
  } catch {
    return null;
  }
}
