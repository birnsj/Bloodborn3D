import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';

export const ARCH_TYPES = ['roman', 'gothic'];

export const DEFAULT_ARCH_OPENING_WIDTH = 200;
export const DEFAULT_ARCH_OPENING_HEIGHT = 220;
export const DEFAULT_ARCH_RISE = 100;
export const DEFAULT_ARCH_THICKNESS = 40;
export const DEFAULT_ARCH_DEPTH = 40;
export const DEFAULT_ARCH_RESOLUTION = 16;

/**
 * Parametric freestanding architectural arch with a real open passage.
 * Local axes: X = width, Y = up, Z = depth. Actor origin = AABB center.
 */
export class ArchComponent extends Component {
  constructor({
    id,
    enabled,
    archType = 'roman',
    openingWidth = DEFAULT_ARCH_OPENING_WIDTH,
    openingHeight = DEFAULT_ARCH_OPENING_HEIGHT,
    archRise = DEFAULT_ARCH_RISE,
    thickness = DEFAULT_ARCH_THICKNESS,
    depth = DEFAULT_ARCH_DEPTH,
    curveResolution = DEFAULT_ARCH_RESOLUTION,
    color = '#7a8494',
    collidable = true,
    materialId = null,
    uv = null,
  } = {}) {
    super({ id, type: ArchComponent.componentType, enabled });
    this.archType = ARCH_TYPES.includes(archType) ? archType : 'roman';
    this.openingWidth = Math.max(1, Number(openingWidth) || DEFAULT_ARCH_OPENING_WIDTH);
    this.openingHeight = Math.max(1, Number(openingHeight) || DEFAULT_ARCH_OPENING_HEIGHT);
    this.archRise = Math.max(1, Number(archRise) || DEFAULT_ARCH_RISE);
    this.thickness = Math.max(1, Number(thickness) || DEFAULT_ARCH_THICKNESS);
    this.depth = Math.max(1, Number(depth) || DEFAULT_ARCH_DEPTH);
    this.curveResolution = Math.max(
      4,
      Math.min(64, Math.round(Number(curveResolution) || DEFAULT_ARCH_RESOLUTION)),
    );
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
      archType: this.archType,
      openingWidth: this.openingWidth,
      openingHeight: this.openingHeight,
      archRise: this.archRise,
      thickness: this.thickness,
      depth: this.depth,
      curveResolution: this.curveResolution,
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
    return new ArchComponent(data);
  }
}

ArchComponent.componentType = 'Arch';
