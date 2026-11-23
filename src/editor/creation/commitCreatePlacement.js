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
    if (kind === 'ramp') return { x: 80, y: DEFAULT_RAMP_RISE, z: 160 };
    if (kind === 'stair') return { x: 80, y: WALL_MODULE_SIZE, z: 160 };
    return { x: gridSize * 2, y: gridSize * 2, z: gridSize * 2 };
  }
  if (payload?.placeKind === 'light') return { x: 30, y: 30, z: 30 };
  if (payload?.placeKind === 'spawn') return { x: 40, y: 80, z: 40 };
  if (payload?.placeKind === 'cell') return { x: 40, y: 40, z: 40 };
  return { x: 50, y: 50, z: 50 };
}
