import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import { RAMP_DIRECTIONS } from './RampComponent.js';
import {
  BOX_SURFACE_IDS,
  STAIR_WEDGE_SURFACE_IDS,
  normalizeFaceMaterials,
} from '../runtime/surfaces.js';

const STAIR_SURFACE_IDS = [...BOX_SURFACE_IDS, ...STAIR_WEDGE_SURFACE_IDS];

export const DEFAULT_STEP_HEIGHT = 20;
export const DEFAULT_TREAD_DEPTH = 30;
export const DEFAULT_STAIR_WIDTH = 120;
export const DEFAULT_INNER_RADIUS = 150;
export const DEFAULT_SPIRAL_INNER_RADIUS = 60;
export const STAIR_TYPES = ['straight', 'curved', 'spiral'];

/**
 * Procedural staircase — one editable actor.
 * Types: straight (boxes), curved / spiral (annular wedge steps).
 * totalRise = stepCount * stepHeight.
 */
export class StairComponent extends Component {
  constructor({
    id,
    enabled,
    stairType = 'straight',
    width = DEFAULT_STAIR_WIDTH,
    stepCount = 8,
    stepHeight = DEFAULT_STEP_HEIGHT,
    treadDepth = DEFAULT_TREAD_DEPTH,
    direction = 'z+',
    innerRadius = DEFAULT_INNER_RADIUS,
    sweepAngle = 180,
    clockwise = true,
    startAngle = 0,
    color = '#8a9099',
    collidable = true,
    materialId = null,
    faceMaterials = null,
    uv = null,
  } = {}) {
    super({ id, type: StairComponent.componentType, enabled });
    this.stairType = STAIR_TYPES.includes(stairType) ? stairType : 'straight';
    this.width = Math.max(1, Number(width) || DEFAULT_STAIR_WIDTH);
    this.stepCount = Math.max(1, Math.round(Number(stepCount) || 8));
    this.stepHeight = Math.max(1, Number(stepHeight) || DEFAULT_STEP_HEIGHT);
    this.treadDepth = Math.max(1, Number(treadDepth) || DEFAULT_TREAD_DEPTH);
    this.direction = RAMP_DIRECTIONS.includes(direction) ? direction : 'z+';
    this.innerRadius = Math.max(0, Number(innerRadius) || 0);
    this.sweepAngle = clampSweep(Number(sweepAngle));
    this.clockwise = clockwise !== false;
    this.startAngle = Number.isFinite(Number(startAngle)) ? Number(startAngle) : 0;
    this.color = color;
    this.collidable = collidable !== false;
    this.materialId = materialId || null;
    this.faceMaterials = normalizeFaceMaterials(faceMaterials, STAIR_SURFACE_IDS);
    this.uv = createBrushUvState(uv || {});
  }

  get totalRise() {
    return this.stepCount * this.stepHeight;
  }

  get length() {
    if (this.stairType === 'curved' || this.stairType === 'spiral') {
      const midR = this.innerRadius + this.width * 0.5;
      return (Math.abs(this.sweepAngle) * Math.PI / 180) * midR;
    }
    return this.stepCount * this.treadDepth;
  }

  get outerRadius() {
    return this.innerRadius + this.width;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      stairType: this.stairType,
      width: this.width,
      stepCount: this.stepCount,
      stepHeight: this.stepHeight,
      treadDepth: this.treadDepth,
      direction: this.direction,
      innerRadius: this.innerRadius,
      sweepAngle: this.sweepAngle,
      clockwise: this.clockwise,
      startAngle: this.startAngle,
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
    return new StairComponent(data);
  }
}

StairComponent.componentType = 'Stair';

function clampSweep(raw) {
  const v = Number.isFinite(raw) ? raw : 180;
  // Allow custom values; keep a sane floor so geometry stays valid.
  return Math.max(1, Math.min(720, Math.abs(v)));
}

/** Sensible defaults when switching type in the editor. */
export function defaultsForStairType(stairType, current = {}) {
  if (stairType === 'spiral') {
    return {
      stairType: 'spiral',
      innerRadius: current.innerRadius > 0 ? current.innerRadius : DEFAULT_SPIRAL_INNER_RADIUS,
      sweepAngle: 360,
      clockwise: current.clockwise !== false,
      startAngle: current.startAngle || 0,
      stepCount: Math.max(current.stepCount || 16, 12),
      width: current.width || 100,
    };
  }
  if (stairType === 'curved') {
    return {
      stairType: 'curved',
      innerRadius: current.innerRadius > 0 ? current.innerRadius : DEFAULT_INNER_RADIUS,
      sweepAngle: current.sweepAngle > 0 && current.sweepAngle < 360 ? current.sweepAngle : 180,
      clockwise: current.clockwise !== false,
      startAngle: current.startAngle || 0,
      stepCount: Math.max(current.stepCount || 12, 8),
      width: current.width || DEFAULT_STAIR_WIDTH,
    };
  }
  return {
    stairType: 'straight',
    treadDepth: current.treadDepth || DEFAULT_TREAD_DEPTH,
    direction: current.direction || 'z+',
  };
}
