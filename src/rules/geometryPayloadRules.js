/**
 * Geometry component payload rules (Phase 2G prerequisite D3).
 *
 * Pure functions: no Three.js, no Rapier, no World. They inspect the raw data of
 * a geometry component (JSON from disk or a generator, or a live component) and
 * report every problem before any geometry or collider is constructed.
 *
 * Contract:
 *  - A field that is absent (undefined / null) is legal and falls back to the
 *    documented component default, exactly as legacy levels rely on.
 *  - A field that is present must be a finite number (or a supported enum value)
 *    inside the limits below. Nothing is silently clamped or replaced here.
 *
 * Complexity (the solid cap) is NOT checked here — it needs a World; see
 * `serialization/levelGeometryValidation.js`.
 */

/** Largest accepted single dimension / coordinate, in editor units (1 km). */
export const MAX_GEOMETRY_DIMENSION = 100000;
/** Largest accepted step / segment count for parametric components. */
export const MAX_GEOMETRY_COUNT = 2000;
/** Miter half-angles are degrees and must stay strictly below a right angle. */
export const MAX_MITER_DEGREES = 89.999;
/** Angles (start / sweep) are degrees; this only guards against runaway values. */
export const MAX_ANGLE_DEGREES = 36000;

export const SUPPORTED_BRUSH_OPERATIONS = ['add', 'subtract'];

const DIRECTIONS = ['z+', 'z-', 'x+', 'x-'];

/**
 * Field kinds:
 *  positive    finite, > 0, <= MAX_GEOMETRY_DIMENSION
 *  nonNegative finite, >= 0, <= MAX_GEOMETRY_DIMENSION
 *  count       finite integer >= 1, <= MAX_GEOMETRY_COUNT
 *  angle       finite, |v| <= MAX_ANGLE_DEGREES
 *  number      finite (component clamps the range itself)
 *  enum        one of `values`
 */
const PARAMETRIC_SPECS = {
  Ramp: [
    ['width', 'positive'],
    ['length', 'positive'],
    ['rise', 'positive'],
    ['thickness', 'positive'],
    ['direction', 'enum', DIRECTIONS],
  ],
  Stair: [
    ['stairType', 'enum', ['straight', 'curved', 'spiral']],
    ['width', 'positive'],
    ['stepCount', 'count'],
    ['stepHeight', 'positive'],
    ['treadDepth', 'positive'],
    ['direction', 'enum', DIRECTIONS],
    ['innerRadius', 'nonNegative'],
    ['sweepAngle', 'angle'],
    ['startAngle', 'angle'],
  ],
  Column: [
    ['shape', 'enum', ['round', 'square', 'hexagon', 'octagon']],
    ['height', 'positive'],
    ['radius', 'positive'],
    ['sides', 'number'],
    ['baseHeight', 'nonNegative'],
    ['baseRadius', 'positive'],
    ['capitalHeight', 'nonNegative'],
    ['capitalRadius', 'positive'],
  ],
  Arch: [
    ['archType', 'enum', ['roman', 'gothic']],
    ['openingWidth', 'positive'],
    ['openingHeight', 'positive'],
    ['archRise', 'positive'],
    ['thickness', 'positive'],
    ['depth', 'positive'],
    ['curveResolution', 'number'],
  ],
  CurvedWall: [
    ['radius', 'positive'],
    ['sweepAngle', 'angle'],
    ['startAngle', 'angle'],
    ['height', 'positive'],
    ['thickness', 'positive'],
    ['curveResolution', 'number'],
    ['miterStart', 'angle'],
    ['miterEnd', 'angle'],
  ],
  StaticMesh: [
    ['collisionType', 'enum', [
      'none', 'auto', 'box', 'sphere', 'capsule', 'cylinder', 'convex', 'trimesh',
    ]],
    ['instancing', 'enum', ['off', 'auto', 'force']],
  ],
};

/** Component types this module knows how to validate. */
export const VALIDATED_GEOMETRY_TYPES = ['Brush', ...Object.keys(PARAMETRIC_SPECS)];

function isAbsent(value) {
  return value === undefined || value === null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function describe(value) {
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function diag(type, field, code, message) {
  return { code, componentType: type, field, message };
}

function checkNumber(type, field, value, kind, out) {
  if (isAbsent(value)) return;
  const label = `${type}.${field}`;
  if (!isFiniteNumber(value)) {
    out.push(diag(type, field, 'GEOMETRY_NOT_FINITE', `${label} must be a finite number (got ${describe(value)}).`));
    return;
  }
  switch (kind) {
    case 'positive':
      if (value <= 0 || value > MAX_GEOMETRY_DIMENSION) {
        out.push(diag(type, field, 'GEOMETRY_OUT_OF_RANGE', `${label} must be > 0 and <= ${MAX_GEOMETRY_DIMENSION} (got ${value}).`));
      }
      break;
    case 'nonNegative':
      if (value < 0 || value > MAX_GEOMETRY_DIMENSION) {
        out.push(diag(type, field, 'GEOMETRY_OUT_OF_RANGE', `${label} must be >= 0 and <= ${MAX_GEOMETRY_DIMENSION} (got ${value}).`));
      }
      break;
    case 'count':
      if (!Number.isInteger(value) || value < 1 || value > MAX_GEOMETRY_COUNT) {
        out.push(diag(type, field, 'GEOMETRY_OUT_OF_RANGE', `${label} must be an integer from 1 to ${MAX_GEOMETRY_COUNT} (got ${value}).`));
      }
      break;
    case 'angle':
      if (Math.abs(value) > MAX_ANGLE_DEGREES) {
        out.push(diag(type, field, 'GEOMETRY_OUT_OF_RANGE', `${label} must be within ±${MAX_ANGLE_DEGREES} degrees (got ${value}).`));
      }
      break;
    default:
      break;
  }
}

function checkEnum(type, field, value, values, out) {
  if (isAbsent(value)) return;
  if (!values.includes(value)) {
    out.push(diag(
      type,
      field,
      'GEOMETRY_UNSUPPORTED_VALUE',
      `${type}.${field} must be one of ${values.map((v) => `"${v}"`).join(', ')} (got ${describe(value)}).`,
    ));
  }
}

function validateBrushSize(size, out) {
  if (isAbsent(size)) return; // legacy default size
  if (typeof size !== 'object' || Array.isArray(size)) {
    out.push(diag('Brush', 'size', 'GEOMETRY_INVALID_SIZE', `Brush.size must be an object with x, y and z (got ${describe(size)}).`));
    return;
  }
  for (const axis of ['x', 'y', 'z']) {
    const value = size[axis];
    if (isAbsent(value)) {
      out.push(diag('Brush', `size.${axis}`, 'GEOMETRY_INVALID_SIZE', `Brush.size.${axis} is missing; size needs finite x, y and z.`));
      continue;
    }
    checkNumber('Brush', `size.${axis}`, value, 'positive', out);
  }
}

function validateBrushOpenings(openings, out) {
  if (isAbsent(openings)) return;
  if (!Array.isArray(openings)) {
    out.push(diag('Brush', 'openings', 'GEOMETRY_INVALID_OPENINGS', 'Brush.openings must be an array.'));
    return;
  }
  openings.forEach((opening, index) => {
    if (!opening || typeof opening !== 'object') {
      out.push(diag('Brush', `openings[${index}]`, 'GEOMETRY_INVALID_OPENINGS', `Brush.openings[${index}] must be an object.`));
      return;
    }
    for (const key of ['offset', 'bottom', 'width', 'height', 'rise', 'curveResolution']) {
      const value = opening[key];
      if (isAbsent(value)) continue;
      if (!isFiniteNumber(value)) {
        out.push(diag('Brush', `openings[${index}].${key}`, 'GEOMETRY_NOT_FINITE', `Brush.openings[${index}].${key} must be a finite number (got ${describe(value)}).`));
      } else if (Math.abs(value) > MAX_GEOMETRY_DIMENSION) {
        out.push(diag('Brush', `openings[${index}].${key}`, 'GEOMETRY_OUT_OF_RANGE', `Brush.openings[${index}].${key} is out of range (got ${value}).`));
      }
    }
  });
}

function validateBrush(data, out) {
  validateBrushSize(data.size, out);
  checkEnum('Brush', 'operation', data.operation, SUPPORTED_BRUSH_OPERATIONS, out);
  for (const field of ['miterStart', 'miterEnd']) {
    const value = data[field];
    if (isAbsent(value)) continue;
    if (!isFiniteNumber(value)) {
      out.push(diag('Brush', field, 'GEOMETRY_NOT_FINITE', `Brush.${field} must be a finite number (got ${describe(value)}).`));
    } else if (Math.abs(value) > MAX_MITER_DEGREES) {
      out.push(diag('Brush', field, 'GEOMETRY_OUT_OF_RANGE', `Brush.${field} must be within ±${MAX_MITER_DEGREES} degrees (got ${value}).`));
    }
  }
  validateBrushOpenings(data.openings, out);
}

/**
 * Validate one geometry component payload.
 * @param {object} data component JSON or live component (read-only)
 * @returns {Array<{ code, componentType, field, message }>} empty when valid or
 *   when the component type carries no geometry payload rules.
 */
export function validateGeometryComponentPayload(data) {
  const out = [];
  if (!data || typeof data !== 'object') return out;
  const type = data.type;

  if (type === 'Brush') {
    validateBrush(data, out);
    return out;
  }

  const spec = PARAMETRIC_SPECS[type];
  if (!spec) return out;
  for (const [field, kind, values] of spec) {
    if (kind === 'enum') checkEnum(type, field, data[field], values, out);
    else checkNumber(type, field, data[field], kind, out);
  }
  return out;
}
