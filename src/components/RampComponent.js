import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';

export const RAMP_DIRECTIONS = ['z+', 'z-', 'x+', 'x-'];
export const DEFAULT_RAMP_RISE = 150;
export const DEFAULT_RAMP_THICKNESS = 20;

/**
 * Parametric straight ramp (triangular prism wedge).
 * Dimensions in editor units. Actor transform is the AABB center.
 */
export class RampComponent extends Component {
  constructor({
    id,
    enabled,
    width = 100,
    length = 300,
    rise = DEFAULT_RAMP_RISE,
    direction = 'z+',
    thickness = DEFAULT_RAMP_THICKNESS,
    color = '#7a8494',
    collidable = true,
    materialId = null,
    uv = null,
  } = {}) {
    super({ id, type: RampComponent.componentType, enabled });
    this.width = Math.max(1, Number(width) || 100);
    this.length = Math.max(1, Number(length) || 300);
    this.rise = Math.max(1, Number(rise) || DEFAULT_RAMP_RISE);
    this.direction = RAMP_DIRECTIONS.includes(direction) ? direction : 'z+';
    this.thickness = Math.max(1, Number(thickness) || DEFAULT_RAMP_THICKNESS);
    this.color = color;
    this.collidable = collidable !== false;
    this.materialId = materialId || null;
    this.uv = createBrushUvState(uv || {});
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      width: this.width,
      length: this.length,
      rise: this.rise,
      direction: this.direction,
      thickness: this.thickness,
      color: this.color,
      collidable: this.collidable,
      materialId: this.materialId,
      uv: {
        scale: { ...this.uv.scale },
        offset: { ...this.uv.offset },
        rotation: this.uv.rotation,
      },
    };
  }

  static fromJSON(data) {
    return new RampComponent(data);
  }
}

RampComponent.componentType = 'Ramp';
