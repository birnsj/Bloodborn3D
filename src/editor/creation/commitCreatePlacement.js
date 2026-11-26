import {
  WALL_MODULE_SIZE,
  FLOOR_THICKNESS,
  CEILING_THICKNESS,
} from '../../core/units.js';
import { DEFAULT_RAMP_RISE } from '../../components/RampComponent.js';
import { defaultFootprintAt } from './surfacePlacement.js';

/**
 * Commit a creation-toolbar / DnD placement using existing editor APIs.
 * Returns a promise resolving to the created actor(s) or null.
 */
export async function commitCreatePlacement(payload, pose, api) {
  if (!payload || !pose?.valid || !pose.position) return null;

  const {
    createBrushAtBounds,
    placeLight,
    placeEnvironment,
    placePrimitiveMesh,
    placePlayerSpawn,
    createCell,
    placeMeshAsset,
    placePrefabAsset,
    gridSize,
    gridSnap,
  } = api;

  const opts = { gridSnap, gridSize, snapY: false, rotation: pose.rotation };

  // Geometry tools: prefer explicit tool id; never fall through to another mode.
  const modeTool = payload.tool
    || (payload.action === 'mode' ? payload.toolId : null)
    || null;
  if (payload.action === 'mode' && modeTool) {
    const kind = modeTool;
    const fp = defaultFootprintAt(kind, {
      x: pose.position.x,
      y: pose.position.y,
      z: pose.position.z,
    }, gridSize);
    // Raise structural base to surface Y for floors/walls/etc.
    if (kind === 'ceiling') {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y;
    } else if (kind === 'floor') {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y + FLOOR_THICKNESS;
    } else if (kind === 'wall') {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y;
    } else if (kind === 'ramp') {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y + DEFAULT_RAMP_RISE;
    } else if (kind === 'stair') {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y + WALL_MODULE_SIZE;
    } else {
      fp.min.y = pose.position.y;
      fp.max.y = pose.position.y + gridSize;
    }
    return createBrushAtBounds(kind, fp.min, fp.max) || null;
  }

  if (payload.placeKind === 'light') {
    return placeLight(payload.lightType || 'point', pose.position, opts);
  }
  if (payload.placeKind === 'environment') {
    return placeEnvironment(payload.envType || 'water2', pose.position, {
      ...opts,
      targetActorId: pose.targetActorId || payload.targetActorId,
      mapId: payload.mapId,
    });
  }
  if (payload.placeKind === 'primitive') {
    return placePrimitiveMesh?.(payload.primitive || 'box', pose.position, opts) || null;
  }
  if (payload.placeKind === 'spawn') {
    return placePlayerSpawn(pose.position, opts);
  }
  if (payload.placeKind === 'cell') {
    return createCell('Cell', pose.position);
  }
  if (payload.action === 'asset' || payload.assetId) {
    const asset = {
      id: payload.assetId,
      name: payload.label || payload.assetId,
      kind: payload.assetKind,
    };
    if (payload.assetKind === 'prefab') {
      return placePrefabAsset(asset, pose.position, opts);
    }
    return placeMeshAsset(asset, pose.position, opts);
  }
  return null;
}

export function previewSizeForPayload(payload, gridSize = 25) {
  if (payload?.action === 'mode') {
    const kind = payload.tool;
    if (kind === 'wall') return { x: 20, y: WALL_MODULE_SIZE, z: 100 };
    if (kind === 'floor') return { x: 100, y: FLOOR_THICKNESS, z: 100 };
    if (kind === 'ceiling') return { x: 100, y: CEILING_THICKNESS, z: 100 };
    if (kind === 'ramp') return { x: 120, y: DEFAULT_RAMP_RISE, z: 300 };
    if (kind === 'stair') return { x: 120, y: WALL_MODULE_SIZE, z: 450 };
    if (kind === 'column') return { x: 80, y: WALL_MODULE_SIZE, z: 80 };
    if (kind === 'arch' || kind === 'archRoman' || kind === 'archGothic') {
      return { x: 200, y: WALL_MODULE_SIZE, z: 80 };
    }
    if (kind === 'curvedWall') return { x: 200, y: WALL_MODULE_SIZE, z: 200 };
    return { x: gridSize * 2, y: gridSize * 2, z: gridSize * 2 };
  }
  if (payload?.placeKind === 'light') return { x: 30, y: 30, z: 30 };
  if (payload?.placeKind === 'environment') {
    const t = payload.envType || 'water2';
    if (t === 'water' || t === 'water2') return { x: 600, y: 4, z: 600 };
    if (t === 'reflector' || t === 'refractor') return { x: 300, y: 400, z: 8 };
    if (t === 'decal') return { x: 80, y: 80, z: 40 };
    if (t === 'sprite') return { x: 100, y: 100, z: 4 };
    if (t === 'sky') return { x: 80, y: 80, z: 80 };
    return { x: 200, y: 40, z: 200 };
  }
  if (payload?.placeKind === 'primitive') {
    return { x: 100, y: 100, z: 100 };
  }
  if (payload?.placeKind === 'spawn') return { x: 40, y: 80, z: 40 };
  if (payload?.placeKind === 'cell') return { x: 40, y: 40, z: 40 };
  return { x: 50, y: 50, z: 50 };
}

/**
 * Footprint min/max for toolbar DnD placement preview — mirrors commitCreatePlacement.
 * @returns {{ kind: string, min: object, max: object, gridSize: number }|null}
 */
export function previewBoundsForPayload(payload, position, gridSize = 25) {
  if (!payload || !position) return null;
  const kind = payload.tool
    || (payload.action === 'mode' ? payload.toolId : null)
    || null;
  if (payload.action !== 'mode' || !kind) return null;

  const fp = defaultFootprintAt(kind, {
    x: position.x,
    y: position.y,
    z: position.z,
  }, gridSize);

  if (kind === 'ceiling') {
    fp.min.y = position.y;
    fp.max.y = position.y;
  } else if (kind === 'floor') {
    fp.min.y = position.y;
    fp.max.y = position.y + FLOOR_THICKNESS;
  } else if (kind === 'wall') {
    fp.min.y = position.y;
    fp.max.y = position.y;
  } else if (kind === 'ramp') {
    fp.min.y = position.y;
    fp.max.y = position.y + DEFAULT_RAMP_RISE;
  } else if (kind === 'stair') {
    fp.min.y = position.y;
    fp.max.y = position.y + WALL_MODULE_SIZE;
  } else {
    fp.min.y = position.y;
    fp.max.y = position.y + gridSize;
  }

  return { kind, min: fp.min, max: fp.max, gridSize };
}
