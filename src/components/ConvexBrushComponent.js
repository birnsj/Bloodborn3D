import { Component } from '../core/Component.js';
import { createBrushUvState } from '../materials/MaterialDefinition.js';
import {
  canonicalizeGeometry,
  geometryStats,
  listFaceIds,
  normalizeGeometry,
} from '../geometry/convexBrush.js';
import { validateGeometry } from '../geometry/validate.js';
import {
  cloneFaceUVs,
  normalizeFaceMaterials,
  normalizeFaceUVs,
} from '../runtime/surfaces.js';

/**
 * Editable convex brush (Phase 2F.0).
 * Geometry is engine-neutral vertex/face data in editor units.
 * Never a subtractive cutter. No parametric size / openings / miters.
 */
export class ConvexBrushComponent extends Component {
  constructor({
    id,
    enabled,
    color = '#8a9099',
    collidable = true,
    materialId = null,
    faceMaterials = null,
    faceUVs = null,
    uv = null,
    geometry = null,
    provenance = null,
    /** Preserved when load-time validation fails. */
    invalidGeometry = null,
    geometryError = null,
  } = {}) {
    super({ id, type: ConvexBrushComponent.componentType, enabled });
    this.color = color;
    this.collidable = collidable !== false;
    this.materialId = materialId || null;
    this.uv = createBrushUvState(uv || {});
    this.provenance = provenance && typeof provenance === 'object'
      ? { ...provenance }
      : null;

    const normalized = normalizeGeometry(geometry);
    const faceIds = normalized ? listFaceIds(normalized) : [];
    const mats = normalizeFaceMaterials(faceMaterials, faceIds);
    const uvs = normalizeFaceUVs(faceUVs, faceIds);

    if (normalized) {
      const checked = validateGeometry(normalized, {
        faceMaterials: mats,
        faceUVs: uvs,
      });
      if (checked.ok) {
        this.geometry = canonicalizeGeometry(checked.geometry);
        this.faceMaterials = mats;
        this.faceUVs = uvs;
        this.invalidGeometry = null;
        this.geometryError = null;
      } else {
        this.geometry = null;
        this.faceMaterials = mats;
        this.faceUVs = uvs;
        this.invalidGeometry = canonicalizeGeometry(normalized) || normalized;
        this.geometryError = { code: checked.code, message: checked.message };
        this.enabled = false;
      }
    } else if (invalidGeometry) {
      this.geometry = null;
      this.faceMaterials = normalizeFaceMaterials(faceMaterials);
      this.faceUVs = normalizeFaceUVs(faceUVs);
      this.invalidGeometry = invalidGeometry;
      this.geometryError = geometryError || {
        code: 'TOPOLOGY',
        message: 'ConvexBrush geometry is missing or invalid.',
      };
      this.enabled = false;
    } else {
      this.geometry = null;
      this.faceMaterials = null;
      this.faceUVs = null;
      this.invalidGeometry = null;
      this.geometryError = {
        code: 'TOPOLOGY',
        message: 'ConvexBrush has no geometry.',
      };
      this.enabled = false;
    }
  }

  get isValid() {
    return Boolean(this.geometry) && !this.geometryError;
  }

  get stats() {
    return this.geometry ? geometryStats(this.geometry) : null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
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
      geometry: this.geometry
        ? canonicalizeGeometry(this.geometry)
        : (this.invalidGeometry ? structuredClone(this.invalidGeometry) : null),
      provenance: this.provenance ? { ...this.provenance } : null,
      ...(this.geometryError
        ? {
            geometryError: { ...this.geometryError },
            invalidGeometry: this.invalidGeometry
              ? structuredClone(this.invalidGeometry)
              : null,
          }
        : {}),
    };
  }

  static fromJSON(data) {
    return new ConvexBrushComponent(data);
  }
}

ConvexBrushComponent.componentType = 'ConvexBrush';
