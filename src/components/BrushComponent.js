import { Component } from '../core/Component.js';
import { WALL_MODULE_SIZE, WALL_THICKNESS } from '../core/units.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import { normalizeOpenings } from '../runtime/wallOpenings.js';
import {
  BOX_SURFACE_IDS,
  cloneFaceUVs,
  normalizeFaceMaterials,
  normalizeFaceUVs,
} from '../runtime/surfaces.js';

/**
 * Axis-aligned box brush for structural geometry.
 * Size is in editor units. Position is the brush center.
 * Materials are referenced by persistent asset IDs (not embedded Three objects).
 * Optional openings[] are parametric door/window holes (walls only).
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
    faceUVs = null,
    uv = null,
    openings = null,
    /** 'add' (default) or 'subtract' — subtractive brushes carve overlapping additive solids. */
    operation = 'add',
    /** Miter half-angle at local length − end (degrees). Used for clean wall junctions. */
    miterStart = 0,
    /** Miter half-angle at local length + end (degrees). */
    miterEnd = 0,
  } = {}) {
    super({ id, type: BrushComponent.componentType, enabled });
    this.size = { ...size };
    this.color = color;
    this.collidable = collidable;
    this.materialId = materialId || null;
    this.faceMaterials = normalizeFaceMaterials(faceMaterials, BOX_SURFACE_IDS);
    this.faceUVs = normalizeFaceUVs(faceUVs, BOX_SURFACE_IDS);
    this.uv = createBrushUvState(uv || {});
    this.openings = normalizeOpenings(openings);
    this.operation = operation === 'subtract' ? 'subtract' : 'add';
    this.miterStart = Number(miterStart) || 0;
    this.miterEnd = Number(miterEnd) || 0;
  }

  toJSON() {
    const json = {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      size: { ...this.size },
      color: this.color,
      collidable: this.collidable,
      materialId: this.materialId,
      faceMaterials: this.faceMaterials ? { ...this.faceMaterials } : null,
      faceUVs: cloneFaceUVs(this.faceUVs),
      operation: this.operation === 'subtract' ? 'subtract' : 'add',
      miterStart: this.miterStart,
      miterEnd: this.miterEnd,
      uv: {
        scale: { ...this.uv.scale },
        offset: { ...this.uv.offset },
        rotation: this.uv.rotation,
      },
    };
    if (this.openings?.length) {
      json.openings = this.openings.map((o) => ({
        id: o.id,
        type: o.type,
        profile: o.profile || 'rect',
        offset: o.offset,
        bottom: o.bottom,
        width: o.width,
        height: o.height,
        rise: o.rise || 0,
        curveResolution: o.curveResolution,
      }));
    }
    return json;
  }

  static fromJSON(data) {
    return new BrushComponent(data);
  }
}

BrushComponent.componentType = 'Brush';
