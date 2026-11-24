import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import { WALL_MODULE_SIZE, WALL_THICKNESS } from '../core/units.js';
import {
  CURVED_WALL_SURFACE_IDS,
  normalizeFaceMaterials,
} from '../runtime/surfaces.js';

export const DEFAULT_CURVED_WALL_RADIUS = 200;
export const DEFAULT_CURVED_WALL_SWEEP = 90;
export const DEFAULT_CURVED_WALL_RESOLUTION = 24;

/**
 * Parametric curved wall (arc in the XZ plane, extruded in Y).
 * Actor origin = circle center in XZ, mid-height in Y.
 * Centerline radius is `radius`; thickness expands inward/outward equally.
 */
export class CurvedWallComponent extends Component {
  constructor({
    id,
    enabled,
    radius = DEFAULT_CURVED_WALL_RADIUS,
    sweepAngle = DEFAULT_CURVED_WALL_SWEEP,
    startAngle = 0,
    height = WALL_MODULE_SIZE,
    thickness = WALL_THICKNESS,
    clockwise = false,
    curveResolution = DEFAULT_CURVED_WALL_RESOLUTION,
    /** Half-angle miter at start end (degrees). 0 = square cap. */
    miterStart = 0,
    /** Half-angle miter at end end (degrees). */
    miterEnd = 0,
    color = '#8a9099',
    collidable = true,
    materialId = null,
    faceMaterials = null,
    uv = null,
  } = {}) {
    super({ id, type: CurvedWallComponent.componentType, enabled });
    this.radius = Math.max(1, Number(radius) || DEFAULT_CURVED_WALL_RADIUS);
    this.sweepAngle = Math.max(1, Math.min(360, Number(sweepAngle) || DEFAULT_CURVED_WALL_SWEEP));
    this.startAngle = Number(startAngle) || 0;
    this.height = Math.max(1, Number(height) || WALL_MODULE_SIZE);
    this.thickness = Math.max(1, Number(thickness) || WALL_THICKNESS);
    this.clockwise = Boolean(clockwise);
    this.curveResolution = Math.max(
      4,
      Math.min(128, Math.round(Number(curveResolution) || DEFAULT_CURVED_WALL_RESOLUTION)),
    );
    this.miterStart = Number(miterStart) || 0;
    this.miterEnd = Number(miterEnd) || 0;
    this.color = color;
    this.collidable = collidable !== false;
    this.materialId = materialId || null;
    this.faceMaterials = normalizeFaceMaterials(faceMaterials, CURVED_WALL_SURFACE_IDS);
    this.uv = createBrushUvState(uv || {});
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      radius: this.radius,
      sweepAngle: this.sweepAngle,
      startAngle: this.startAngle,
      height: this.height,
      thickness: this.thickness,
      clockwise: this.clockwise,
      curveResolution: this.curveResolution,
      miterStart: this.miterStart,
      miterEnd: this.miterEnd,
      color: this.color,
      collidable: this.collidable,
      materialId: this.materialId,
      faceMaterials: this.faceMaterials ? { ...this.faceMaterials } : null,
      uv: {
        scale: { ...this.uv.scale },
        offset: { ...this.uv.offset },
        rotation: this.uv.rotation,
      },
    };
  }

  static fromJSON(data) {
    return new CurvedWallComponent(data);
  }
}

CurvedWallComponent.componentType = 'CurvedWall';
