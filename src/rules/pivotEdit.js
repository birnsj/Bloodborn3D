/**
 * Batch 7.1 — pivot presets and bounds helpers (actor-local editor units).
 */
import { toEditorUnits } from '../core/units.js';
import {
  applyActorLocalPivotDelta,
  applyActorWorldPivotPosition,
  normalizeContentOffset,
  contentOffsetIsIdentity,
  getContentWorldMatrix,
} from '../core/contentOffset.js';
import { mat4TransformPoint } from '../core/math3d.js';
import { getWorldTransform } from '../core/hierarchy.js';
import { normalizeStaticMeshFields } from '../components/StaticMeshComponent.js';
import { normalizePrimitiveMeshFields } from '../components/PrimitiveMeshComponent.js';

export const PIVOT_PRESETS = Object.freeze([
  'original',
  'center',
  'bottomCenter',
  'topCenter',
  'facePx',
  'faceNx',
  'facePy',
  'faceNy',
  'facePz',
  'faceNz',
  'cornerMin',
  'cornerMax',
  'custom',
]);

export const PIVOT_PRESET_LABELS = Object.freeze({
  original: 'Original origin',
  center: 'Geometric center',
  bottomCenter: 'Bottom center',
  topCenter: 'Top center',
  facePx: 'Face +X',
  faceNx: 'Face −X',
  facePy: 'Face +Y',
  faceNy: 'Face −Y',
  facePz: 'Face +Z',
  faceNz: 'Face −Z',
  cornerMin: 'Corner (−X−Y−Z)',
  cornerMax: 'Corner (+X+Y+Z)',
  custom: 'Custom',
});

/**
 * Resolve mesh/brush AABB in actor-local editor units (content frame includes
 * current contentOffset; geometry extents from component / asset meta).
 *
 * @param {object} actor
 * @param {{ getMeshBoundsMeters?: Function, getMeshBoundsCenterMeters?: Function }} [resolver]
 */
export function measureActorContentBoundsLocalEu(actor, resolver = null) {
  const offset = normalizeContentOffset(actor?.contentOffset);
  let sizeEu = { x: 100, y: 100, z: 100 };
  let centerLocalEu = { ...offset };

  const sm = actor?.getComponent?.('StaticMesh');
  if (sm?.assetId) {
    const fields = normalizeStaticMeshFields(sm);
    const sizeM = resolver?.getMeshBoundsMeters?.(fields.assetId) || { x: 1, y: 1, z: 1 };
    const centerM = resolver?.getMeshBoundsCenterMeters?.(fields.assetId) || { x: 0, y: 0, z: 0 };
    sizeEu = {
      x: toEditorUnits(sizeM.x || 1),
      y: toEditorUnits(sizeM.y || 1),
      z: toEditorUnits(sizeM.z || 1),
    };
    centerLocalEu = {
      x: offset.x + toEditorUnits(centerM.x || 0),
      y: offset.y + toEditorUnits(centerM.y || 0),
      z: offset.z + toEditorUnits(centerM.z || 0),
    };
  } else {
    const prim = actor?.getComponent?.('PrimitiveMesh');
    if (prim) {
      const f = normalizePrimitiveMeshFields(prim);
      sizeEu = primitiveSizeEu(f);
      centerLocalEu = { ...offset };
    } else {
      const brush = actor?.getComponent?.('Brush');
      if (brush?.size) {
        sizeEu = {
          x: Math.abs(brush.size.x) || 100,
          y: Math.abs(brush.size.y) || 100,
          z: Math.abs(brush.size.z) || 100,
        };
        centerLocalEu = { ...offset };
      } else {
        const convex = actor?.getComponent?.('ConvexBrush');
        if (convex?.geometry?.vertices?.length) {
          const xs = convex.geometry.vertices.map((v) => v.x);
          const ys = convex.geometry.vertices.map((v) => v.y);
          const zs = convex.geometry.vertices.map((v) => v.z);
          const min = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) };
          const max = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) };
          sizeEu = {
            x: max.x - min.x || 100,
            y: max.y - min.y || 100,
            z: max.z - min.z || 100,
          };
          centerLocalEu = {
            x: offset.x + (min.x + max.x) * 0.5,
            y: offset.y + (min.y + max.y) * 0.5,
            z: offset.z + (min.z + max.z) * 0.5,
          };
        }
      }
    }
  }

  const half = { x: sizeEu.x * 0.5, y: sizeEu.y * 0.5, z: sizeEu.z * 0.5 };
  const min = {
    x: centerLocalEu.x - half.x,
    y: centerLocalEu.y - half.y,
    z: centerLocalEu.z - half.z,
  };
  const max = {
    x: centerLocalEu.x + half.x,
    y: centerLocalEu.y + half.y,
    z: centerLocalEu.z + half.z,
  };
  return { min, max, center: centerLocalEu, size: sizeEu };
}

function primitiveSizeEu(f) {
  switch (f.primitive) {
    case 'plane':
      return { x: f.width, y: 1, z: f.height };
    case 'sphere':
    case 'circle':
      return { x: f.radius * 2, y: f.radius * 2, z: f.radius * 2 };
    case 'capsule':
      return { x: f.radius * 2, y: f.length + f.radius * 2, z: f.radius * 2 };
    case 'cylinder':
    case 'cone':
      return {
        x: Math.max(f.radiusTop, f.radiusBottom) * 2,
        y: f.height,
        z: Math.max(f.radiusTop, f.radiusBottom) * 2,
      };
    case 'torus':
      return {
        x: (f.radius + f.tube) * 2,
        y: f.tube * 2,
        z: (f.radius + f.tube) * 2,
      };
    default:
      return { x: f.width || 100, y: f.height || 100, z: f.depth || 100 };
  }
}

/** Local-space pivot target for a named preset (actor-local eu). */
export function pivotPresetLocalPoint(preset, bounds) {
  const { min, max, center } = bounds;
  switch (preset) {
    case 'original':
      // Current content frame origin relative to pivot = contentOffset baked into bounds path;
      // "original" means authored mesh origin → contentOffset identity → pivot at -contentOffset from content? 
      // Target pivot local = current contentOffset (so after edit contentOffset→0).
      return null; // handled specially
    case 'center':
      return { ...center };
    case 'bottomCenter':
      return { x: center.x, y: min.y, z: center.z };
    case 'topCenter':
      return { x: center.x, y: max.y, z: center.z };
    case 'facePx':
      return { x: max.x, y: center.y, z: center.z };
    case 'faceNx':
      return { x: min.x, y: center.y, z: center.z };
    case 'facePy':
      return { x: center.x, y: max.y, z: center.z };
    case 'faceNy':
      return { x: center.x, y: min.y, z: center.z };
    case 'facePz':
      return { x: center.x, y: center.y, z: max.z };
    case 'faceNz':
      return { x: center.x, y: center.y, z: min.z };
    case 'cornerMin':
      return { ...min };
    case 'cornerMax':
      return { ...max };
    default:
      return { ...center };
  }
}

/**
 * Apply a pivot preset. Returns before/after snapshots for HistoryStack.
 */
export function applyPivotPreset(actor, world, preset, resolver = null) {
  if (preset === 'original' || preset === 'reset') {
    // Move pivot so contentOffset becomes identity.
    const o = normalizeContentOffset(actor.contentOffset);
    if (contentOffsetIsIdentity(o)) {
      return applyActorLocalPivotDelta(actor, { x: 0, y: 0, z: 0 }, world);
    }
    // Origin should move to where content frame currently is → delta = contentOffset
    return applyActorLocalPivotDelta(actor, o, world);
  }

  const bounds = measureActorContentBoundsLocalEu(actor, resolver);
  const target = pivotPresetLocalPoint(preset, bounds);
  if (!target) {
    return applyActorLocalPivotDelta(actor, { x: 0, y: 0, z: 0 }, world);
  }
  // Target is in actor-local coords (pivot at 0). Delta = target.
  return applyActorLocalPivotDelta(actor, target, world);
}

/** Actors that support pivot editing. */
export function actorSupportsPivotEdit(actor) {
  if (!actor) return false;
  if (actor.getComponent?.('StaticMesh')) return true;
  if (actor.getComponent?.('PrimitiveMesh')) return true;
  if (actor.getComponent?.('Brush')) return true;
  if (actor.getComponent?.('ConvexBrush')) return true;
  // Architectural brushes with size-like geometry
  for (const t of ['Ramp', 'Stair', 'Column', 'Arch', 'CurvedWall']) {
    if (actor.getComponent?.(t)) return true;
  }
  return false;
}

/**
 * Asset-default placement offset helpers (meta.defaultContentOffset).
 * Does not mutate placed actors.
 */
export function normalizeAssetDefaultContentOffset(meta) {
  return normalizeContentOffset(meta?.defaultContentOffset);
}

export function assetPlacementContentOffset(entry) {
  return normalizeAssetDefaultContentOffset(entry?.meta);
}

/**
 * Bounds helpers for Asset Viewer pivot preview (mesh-local meters → eu).
 */
export function assetBoundsLocalEu(meta) {
  const sizeM = meta?.boundingBoxMeters || { x: 1, y: 1, z: 1 };
  const centerM = meta?.boundingBoxCenterMeters || { x: 0, y: 0, z: 0 };
  const size = {
    x: toEditorUnits(sizeM.x || 1),
    y: toEditorUnits(sizeM.y || 1),
    z: toEditorUnits(sizeM.z || 1),
  };
  const center = {
    x: toEditorUnits(centerM.x || 0),
    y: toEditorUnits(centerM.y || 0),
    z: toEditorUnits(centerM.z || 0),
  };
  const half = { x: size.x * 0.5, y: size.y * 0.5, z: size.z * 0.5 };
  return {
    min: { x: center.x - half.x, y: center.y - half.y, z: center.z - half.z },
    max: { x: center.x + half.x, y: center.y + half.y, z: center.z + half.z },
    center,
    size,
  };
}

export function assetPivotPresetOffset(preset, meta) {
  const bounds = assetBoundsLocalEu(meta);
  if (preset === 'original' || preset === 'reset') {
    return { x: 0, y: 0, z: 0 };
  }
  // defaultContentOffset is where content sits relative to placement pivot.
  // Preset target pivot in mesh-local → contentOffset = -target (so pivot at target, mesh stays).
  // Wait: placement puts actor at click with contentOffset from meta.
  // Mesh at contentOffset relative to actor. Mesh local origin at contentOffset.
  // Want pivot at bounds.bottomCenter in mesh space → actor origin at that point →
  // contentOffset = -bottomCenter (mesh origin relative to pivot).
  const target = pivotPresetLocalPoint(preset === 'original' ? 'center' : preset, bounds);
  if (preset === 'original') return { x: 0, y: 0, z: 0 };
  return {
    x: -target.x,
    y: -target.y,
    z: -target.z,
  };
}

export {
  applyActorLocalPivotDelta,
  applyActorWorldPivotPosition,
  getContentWorldMatrix,
  getWorldTransform,
  mat4TransformPoint,
};
