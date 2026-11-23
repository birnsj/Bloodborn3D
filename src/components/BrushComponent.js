import { Component } from '../core/Component.js';
import { WALL_MODULE_SIZE, WALL_THICKNESS } from '../core/units.js';
import { createBrushUvState, FACE_KEYS } from '../materials/MaterialDefinition.js';

/**
 * Axis-aligned box brush for structural geometry.
 * Size is in editor units. Position is the brush center.
 * Materials are referenced by persistent asset IDs (not embedded Three objects).
 */
export class BrushComponent extends Component {
  constructor({
    id,
    enabled,
    size = { x: WALL_MODULE_SIZE, y: WALL_MODULE_SIZE, z: WALL_THICKNESS },
    color = '#8a9099',
    collidable = true,
    materialId = null,
    faceMaterials = null,
    uv = null,
  } = {}) {
    super({ id, type: BrushComponent.componentType, enabled });
    this.size = { ...size };
    this.color = color;
    this.collidable = collidable;
    this.materialId = materialId || null;
    this.faceMaterials = normalizeFaceMaterials(faceMaterials);
    this.uv = createBrushUvState(uv || {});
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      size: { ...this.size },
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
    return new BrushComponent(data);
  }
}

BrushComponent.componentType = 'Brush';

function normalizeFaceMaterials(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const next = {};
  let any = false;
  for (const key of FACE_KEYS) {
    if (raw[key]) {
      next[key] = String(raw[key]);
      any = true;
    }
  }
  return any ? next : null;
}
