/**
 * Asset Viewer pivot preview math — draft contentOffset in editor units.
 * Mesh stays fixed; pivot moves. contentOffset = −pivot_in_mesh_space.
 */
import { normalizeContentOffset } from '../core/contentOffset.js';

export function snapEditorAxis(value, snapSize) {
  const g = Number(snapSize);
  if (!Number.isFinite(g) || g <= 0) return value;
  return Math.round(value / g) * g;
}

/**
 * @param {{ x:number, y:number, z:number }} startOffset
 * @param {{ x?:number, y?:number, z?:number, axis?:string, deltaEditor?:number }} delta
 * @param {{ snap?:boolean, snapSize?:number }} [opts]
 */
export function applyAssetPivotDragDelta(startOffset, delta, opts = {}) {
  const start = normalizeContentOffset(startOffset);
  const axis = delta?.axis;
  let dx = Number(delta?.x) || 0;
  let dy = Number(delta?.y) || 0;
  let dz = Number(delta?.z) || 0;
  if (axis && Number.isFinite(delta?.deltaEditor)) {
    dx = axis === 'x' ? delta.deltaEditor : 0;
    dy = axis === 'y' ? delta.deltaEditor : 0;
    dz = axis === 'z' ? delta.deltaEditor : 0;
  }
  // Pivot moves +delta in mesh space → contentOffset decreases by delta.
  let next = {
    x: start.x - dx,
    y: start.y - dy,
    z: start.z - dz,
  };
  if (opts.snap) {
    const g = opts.snapSize ?? 25;
    next = {
      x: snapEditorAxis(next.x, g),
      y: snapEditorAxis(next.y, g),
      z: snapEditorAxis(next.z, g),
    };
  }
  return normalizeContentOffset(next);
}

/** Pivot position in mesh-local editor units (origin = imported mesh origin). */
export function assetPivotLocalFromOffset(offset) {
  const o = normalizeContentOffset(offset);
  return { x: -o.x, y: -o.y, z: -o.z };
}

export function assetOffsetFromPivotLocal(pivotLocal) {
  return normalizeContentOffset({
    x: -(Number(pivotLocal?.x) || 0),
    y: -(Number(pivotLocal?.y) || 0),
    z: -(Number(pivotLocal?.z) || 0),
  });
}
