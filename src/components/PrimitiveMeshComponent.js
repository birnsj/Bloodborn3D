import { Component } from '../core/Component.js';

/**
 * Native / procedural Three.js geometry as a placeable prop (Batch 5).
 * Complements architectural brushes — never enters subtractive CSG.
 * Dimensions are editor units (100 eu = 1 m).
 */

export const PRIMITIVE_TYPES = Object.freeze([
  'box',
  'plane',
  'circle',
  'sphere',
  'capsule',
  'cylinder',
  'cone',
  'ring',
  'torus',
  'torusKnot',
  'tetrahedron',
  'octahedron',
  'dodecahedron',
  'icosahedron',
  'roundedBox',
  'shape',
  'extrude',
  'lathe',
  'tube',
  'convex',
  'text',
  'parametric',
]);

export const PRIMITIVE_COLLISION_TYPES = Object.freeze([
  'auto',
  'box',
  'sphere',
  'capsule',
  'cylinder',
  'convex',
  'trimesh',
  'none',
]);

export const PARAMETRIC_FN_IDS = Object.freeze([
  'klein',
  'mobius',
  'mobius3d',
  'plane',
]);

/** Soft cap — reject or clamp before BufferGeometry allocation. */
export const PRIMITIVE_MAX_VERTICES = 200_000;
export const PRIMITIVE_MAX_SEGMENTS = 128;

export function normalizePrimitiveType(raw) {
  const v = String(raw || 'box').trim();
  return PRIMITIVE_TYPES.includes(v) ? v : 'box';
}

function finiteOr(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function clampInt(n, lo, hi, fallback) {
  const v = Math.round(finiteOr(n, fallback));
  return Math.max(lo, Math.min(hi, v));
}

function deg(n, fallback = 0) {
  return finiteOr(n, fallback);
}

function vec2List(raw, fallback) {
  if (!Array.isArray(raw) || raw.length < 2) return fallback.map((p) => ({ ...p }));
  return raw.map((p) => ({
    x: finiteOr(p?.x, 0),
    y: finiteOr(p?.y, 0),
  }));
}

function vec3List(raw, fallback) {
  if (!Array.isArray(raw) || raw.length < 2) return fallback.map((p) => ({ ...p }));
  return raw.map((p) => ({
    x: finiteOr(p?.x, 0),
    y: finiteOr(p?.y, 0),
    z: finiteOr(p?.z, 0),
  }));
}

const DEFAULT_PROFILE = [
  { x: -50, y: -40 },
  { x: 50, y: -40 },
  { x: 40, y: 40 },
  { x: -40, y: 40 },
];

const DEFAULT_LATHE = [
  { x: 0, y: -50 },
  { x: 40, y: -30 },
  { x: 50, y: 0 },
  { x: 30, y: 40 },
  { x: 0, y: 50 },
];

const DEFAULT_PATH = [
  { x: 0, y: 0, z: 0 },
  { x: 80, y: 40, z: 0 },
  { x: 160, y: 0, z: 40 },
  { x: 240, y: -20, z: 0 },
];

const DEFAULT_CONVEX = [
  { x: -40, y: -40, z: -40 },
  { x: 40, y: -40, z: -40 },
  { x: 40, y: -40, z: 40 },
  { x: -40, y: -40, z: 40 },
  { x: 0, y: 50, z: 0 },
];

export class PrimitiveMeshComponent extends Component {
  constructor(partial = {}) {
    const { id, enabled } = partial;
    super({ id, type: PrimitiveMeshComponent.componentType, enabled });
    Object.assign(this, normalizePrimitiveMeshFields(partial));
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      enabled: this.enabled,
      ...serializePrimitiveMeshFields(this),
    };
  }

  static fromJSON(data) {
    return new PrimitiveMeshComponent(data || {});
  }
}

PrimitiveMeshComponent.componentType = 'PrimitiveMesh';

export function normalizePrimitiveMeshFields(raw = {}) {
  const primitive = normalizePrimitiveType(raw.primitive);
  const collisionType = PRIMITIVE_COLLISION_TYPES.includes(raw.collisionType)
    ? raw.collisionType
    : 'auto';

  const widthSegments = clampInt(raw.widthSegments, 1, PRIMITIVE_MAX_SEGMENTS, defaultSeg(primitive, 'width'));
  const heightSegments = clampInt(raw.heightSegments, 1, PRIMITIVE_MAX_SEGMENTS, defaultSeg(primitive, 'height'));
  const depthSegments = clampInt(raw.depthSegments, 1, PRIMITIVE_MAX_SEGMENTS, defaultSeg(primitive, 'depth'));
  const radialSegments = clampInt(raw.radialSegments, 3, PRIMITIVE_MAX_SEGMENTS, defaultSeg(primitive, 'radial'));
  const tubularSegments = clampInt(raw.tubularSegments, 3, PRIMITIVE_MAX_SEGMENTS, defaultSeg(primitive, 'tubular'));
  const detail = clampInt(raw.detail, 0, 5, primitive.endsWith('hedron') ? 0 : 0);
  const curveSegments = clampInt(raw.curveSegments, 1, 64, 12);
  const bevelSegments = clampInt(raw.bevelSegments, 0, 16, 2);

  return {
    primitive,
    // Box / plane / rounded
    width: Math.max(1, finiteOr(raw.width, 100)),
    height: Math.max(1, finiteOr(raw.height, primitive === 'plane' ? 100 : 100)),
    depth: Math.max(1, finiteOr(raw.depth, 100)),
    // Sphere / circle / cylinder / cone / capsule / torus
    radius: Math.max(0.5, finiteOr(raw.radius, 50)),
    radiusTop: Math.max(0, finiteOr(raw.radiusTop, 50)),
    radiusBottom: Math.max(0, finiteOr(raw.radiusBottom, 50)),
    length: Math.max(1, finiteOr(raw.length, 100)),
    tube: Math.max(0.5, finiteOr(raw.tube, 15)),
    tubularSegments,
    radialSegments,
    p: clampInt(raw.p, 1, 16, 2),
    q: clampInt(raw.q, 1, 16, 3),
    // Segments / polyhedra
    widthSegments,
    heightSegments,
    depthSegments,
    detail,
    // Angular ranges (degrees). Sphere/Cylinder match Three.js:
    // phi = horizontal sweep, theta = vertical (from +Y) for spheres.
    phiStart: deg(raw.phiStart, 0),
    phiLength: deg(raw.phiLength, 360),
    thetaStart: deg(raw.thetaStart, 0),
    thetaLength: deg(raw.thetaLength, 180),
    openEnded: Boolean(raw.openEnded),
    // Rounded box
    radiusSegments: clampInt(raw.radiusSegments, 1, 16, 4),
    // Procedural profiles (editor units)
    profile: vec2List(raw.profile, primitive === 'lathe' ? DEFAULT_LATHE : DEFAULT_PROFILE),
    path: vec3List(raw.path, DEFAULT_PATH),
    points: vec3List(raw.points, DEFAULT_CONVEX),
    // Extrude
    extrudeDepth: Math.max(1, finiteOr(raw.extrudeDepth, 40)),
    bevelEnabled: raw.bevelEnabled !== false,
    bevelThickness: Math.max(0, finiteOr(raw.bevelThickness, 4)),
    bevelSize: Math.max(0, finiteOr(raw.bevelSize, 4)),
    bevelOffset: finiteOr(raw.bevelOffset, 0),
    bevelSegments,
    // Tube
    tubeRadius: Math.max(0.5, finiteOr(raw.tubeRadius, 12)),
    closed: Boolean(raw.closed),
    // Text
    text: String(raw.text ?? 'BloodBound').slice(0, 64),
    fontId: String(raw.fontId || 'helvetiker_regular'),
    textSize: Math.max(1, finiteOr(raw.textSize, 40)),
    textHeight: Math.max(0, finiteOr(raw.textHeight, 8)),
    curveSegments,
    // Parametric
    parametricFn: PARAMETRIC_FN_IDS.includes(raw.parametricFn) ? raw.parametricFn : 'klein',
    parametricSlices: clampInt(raw.parametricSlices, 8, PRIMITIVE_MAX_SEGMENTS, 32),
    parametricStacks: clampInt(raw.parametricStacks, 8, PRIMITIVE_MAX_SEGMENTS, 32),
    // Material / collision / shadows
    materialId: raw.materialId || null,
    collidable: raw.collidable !== false,
    collisionType,
    castShadow: raw.castShadow !== false,
    receiveShadow: raw.receiveShadow !== false,
    // Displacement-oriented denser defaults for plane/sphere when requested
    displacementSegments: clampInt(raw.displacementSegments, 0, PRIMITIVE_MAX_SEGMENTS, 0),
  };
}

function defaultSeg(primitive, kind) {
  if (kind === 'width' || kind === 'height' || kind === 'depth') {
    if (primitive === 'plane' || primitive === 'sphere') return 32;
    if (primitive === 'box' || primitive === 'roundedBox') return 1;
    return 16;
  }
  if (kind === 'radial') {
    if (primitive === 'torus' || primitive === 'torusKnot') return 16;
    return 24;
  }
  if (kind === 'tubular') return 48;
  return 16;
}

export function serializePrimitiveMeshFields(comp) {
  const n = normalizePrimitiveMeshFields(comp);
  return { ...n };
}

/** Authorable snapshot for undo (omit id/type/enabled). */
export function primitiveMeshAuthorableSnapshot(comp) {
  const { id: _id, type: _type, enabled: _enabled, ...rest } = serializePrimitiveMeshFields(comp);
  return rest;
}

/**
 * Conservative vertex estimate used before allocation.
 * Returns { ok, estimate, message }.
 */
export function validatePrimitiveAllocation(fields) {
  const f = normalizePrimitiveMeshFields(fields);
  let estimate = 0;
  switch (f.primitive) {
    case 'box':
    case 'roundedBox':
      estimate = (f.widthSegments + 1) * (f.heightSegments + 1) * (f.depthSegments + 1);
      break;
    case 'plane':
      estimate = (f.widthSegments + 1) * (f.heightSegments + 1);
      break;
    case 'sphere':
      estimate = (f.widthSegments + 1) * (f.heightSegments + 1);
      break;
    case 'circle':
    case 'ring':
      estimate = f.radialSegments * Math.max(1, f.heightSegments) + 2;
      break;
    case 'cylinder':
    case 'cone':
    case 'capsule':
      estimate = (f.radialSegments + 1) * (f.heightSegments + 1) * 2;
      break;
    case 'torus':
    case 'torusKnot':
      estimate = (f.tubularSegments + 1) * (f.radialSegments + 1);
      break;
    case 'tetrahedron':
      estimate = 4 * (4 ** f.detail);
      break;
    case 'octahedron':
      estimate = 8 * (4 ** f.detail);
      break;
    case 'dodecahedron':
      estimate = 36 * (4 ** f.detail);
      break;
    case 'icosahedron':
      estimate = 20 * (4 ** f.detail);
      break;
    case 'shape':
      estimate = Math.max(64, f.curveSegments * f.profile.length * 4);
      break;
    case 'extrude':
      estimate = Math.max(128, f.curveSegments * f.profile.length * (f.bevelSegments + 2) * 8);
      break;
    case 'lathe':
      estimate = (f.profile.length + 1) * (f.radialSegments + 1);
      break;
    case 'tube':
      estimate = (f.tubularSegments + 1) * (f.radialSegments + 1);
      break;
    case 'convex':
      estimate = f.points.length * 6;
      break;
    case 'text':
      estimate = Math.max(200, f.text.length * f.curveSegments * 40);
      break;
    case 'parametric':
      estimate = (f.parametricSlices + 1) * (f.parametricStacks + 1);
      break;
    default:
      estimate = 1000;
  }
  if (f.displacementSegments > 0 && (f.primitive === 'plane' || f.primitive === 'sphere')) {
    const d = f.displacementSegments;
    estimate = Math.max(estimate, (d + 1) * (d + 1));
  }
  if (estimate > PRIMITIVE_MAX_VERTICES) {
    return {
      ok: false,
      estimate,
      message: `Estimated ${estimate} vertices exceeds limit ${PRIMITIVE_MAX_VERTICES}. Lower segments.`,
    };
  }
  return { ok: true, estimate, message: null };
}
