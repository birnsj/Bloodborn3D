/**
 * Data-driven creation toolbar catalog.
 * Only exposes tools that map to implemented editor APIs.
 */

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
        icon: 'dirLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'hemisphere',
        placement: 'free',
      },
      {
        id: 'rectAreaLight',
        label: 'Rect Area Light',
        helpId: 'toolbar.rectAreaLight',
        icon: 'pointLight',
        action: 'place',
        placeKind: 'light',
        lightType: 'rectArea',
        placement: 'wall',
      },
      {
        id: 'ambientLight',
        label: 'Ambient Light',
        helpId: 'toolbar.ambientLight',
        icon: 'pointLight',
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
    tools: [], // filled by buildCreationCategories()
  },
]);

/**
 * Merge live mesh/prefab assets into the catalog.
 * @param {Array<{id:string,name:string,kind:string}>} assets
 */
export function buildCreationCategories(assets = []) {
  const placeable = (assets || []).filter(
    (a) => a && (a.kind === 'mesh' || a.kind === 'prefab'),
  );
  const assetTools = placeable.map((a) => ({
    id: `asset.${a.id}`,
    label: a.name || a.id,
    helpId: a.kind === 'prefab' ? 'creation.prefab' : 'creation.mesh',
    icon: a.kind === 'prefab' ? 'prefab' : 'mesh',
    action: 'asset',
    assetKind: a.kind,
    assetId: a.id,
    placement: 'upright',
  }));

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
