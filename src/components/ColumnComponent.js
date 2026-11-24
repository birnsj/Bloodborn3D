import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import {
  COLUMN_SURFACE_IDS,
  cloneFaceUVs,
  normalizeFaceMaterials,
  normalizeFaceUVs,
} from '../runtime/surfaces.js';

export const COLUMN_SHAPES = ['round', 'square', 'hexagon', 'octagon'];

export const COLUMN_SHAPE_SIDES = {
  round: 24,
  square: 4,
  hexagon: 6,
  octagon: 8,
};

export const DEFAULT_COLUMN_HEIGHT = 300;
export const DEFAULT_COLUMN_RADIUS = 25;

/**
 * Parametric architectural column (single editable actor).
 * Dimensions in editor units. Actor origin = geometric center of AABB.
 */
export class ColumnComponent extends Component {
  constructor({
    id,
    enabled,
    shape = 'round',
    height = DEFAULT_COLUMN_HEIGHT,
    radius = DEFAULT_COLUMN_RADIUS,
    sides = null,
    baseEnabled = true,
    baseHeight = 20,
    baseRadius = null,
    capitalEnabled = true,
    capitalHeight = 16,
    capitalRadius = null,
    color = '#8a9098',
    collidable = true,
    materialId = null,
    faceMaterials = null,
    faceUVs = null,
    uv = null,
  } = {}) {
    super({ id, type: ColumnComponent.componentType, enabled });
    this.shape = COLUMN_SHAPES.includes(shape) ? shape : 'round';
    this.height = Math.max(1, Number(height) || DEFAULT_COLUMN_HEIGHT);
    this.radius = Math.max(1, Number(radius) || DEFAULT_COLUMN_RADIUS);
    const defaultSides = COLUMN_SHAPE_SIDES[this.shape] || 24;
    const rawSides = sides == null ? defaultSides : Math.round(Number(sides) || defaultSides);
    this.sides = Math.max(3, Math.min(64, rawSides));
    this.baseEnabled = baseEnabled !== false;
    this.baseHeight = Math.max(0, Number(baseHeight) || 0);
    this.baseRadius = baseRadius == null
      ? null
      : Math.max(1, Number(baseRadius) || this.radius);
    this.capitalEnabled = capitalEnabled !== false;
    this.capitalHeight = Math.max(0, Number(capitalHeight) || 0);
    this.capitalRadius = capitalRadius == null
      ? null
      : Math.max(1, Number(capitalRadius) || this.radius);
    this.color = color;
    this.collidable = collidable !== false;
    this.materialId = materialId || null;
    this.faceMaterials = normalizeFaceMaterials(faceMaterials, COLUMN_SURFACE_IDS);
    this.faceUVs = normalizeFaceUVs(faceUVs, COLUMN_SURFACE_IDS);
    this.uv = createBrushUvState(uv || {});
  }

  /** Effective radial size for the optional base (defaults to 1.25× shaft). */
  getEffectiveBaseRadius() {
    if (this.baseRadius != null) return this.baseRadius;
    return this.radius * 1.25;
  }

  /** Effective radial size for the optional capital (defaults to 1.2× shaft). */
  getEffectiveCapitalRadius() {
    if (this.capitalRadius != null) return this.capitalRadius;
    return this.radius * 1.2;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      shape: this.shape,
      height: this.height,
      radius: this.radius,
      sides: this.sides,
      baseEnabled: this.baseEnabled,
      baseHeight: this.baseHeight,
      baseRadius: this.baseRadius,
      capitalEnabled: this.capitalEnabled,
      capitalHeight: this.capitalHeight,
      capitalRadius: this.capitalRadius,
      color: this.color,
      collidable: this.collidable,
      materialId: this.materialId,
      faceMaterials: this.faceMaterials ? { ...this.faceMaterials } : null,
      faceUVs: cloneFaceUVs(this.faceUVs),
      uv: {
        scale: { ...this.uv.scale },
        offset: { ...this.uv.offset },
        rotation: this.uv.rotation,
      },
    };
  }

  static fromJSON(data) {
    return new ColumnComponent(data);
  }
}

ColumnComponent.componentType = 'Column';
