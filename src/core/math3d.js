/**
 * Engine-neutral 3D math for hierarchy transforms.
 * Euler angles are degrees, order XYZ (matches Three.js default).
 * Positions/scales are in the same unit space as Transform (editor units).
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function degToRad(d) {
  return d * DEG;
}

export function radToDeg(r) {
  return r * RAD;
}

/** Column-major 4x4 identity */
export function mat4Identity() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

export function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0]
        + a[1 * 4 + r] * b[c * 4 + 1]
        + a[2 * 4 + r] * b[c * 4 + 2]
        + a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Invert(m) {
  const out = new Array(16);
  const [
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33,
  ] = m;

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return mat4Identity();
  det = 1 / det;

  out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
  out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
  out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
  out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
  out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
  out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
  out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
  out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
  out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
  out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
  out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
  out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
  out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
  return out;
}

/** Compose TRS matrix. Rotation in degrees, XYZ order. */
export function composeTRS(position, rotationDeg, scale) {
  const x = degToRad(rotationDeg.x || 0);
  const y = degToRad(rotationDeg.y || 0);
  const z = degToRad(rotationDeg.z || 0);
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);

  // R = Rz * Ry * Rx (XYZ intrinsic / Three.js default)
  const r00 = cy * cz;
  const r01 = sx * sy * cz - cx * sz;
  const r02 = cx * sy * cz + sx * sz;
  const r10 = cy * sz;
  const r11 = sx * sy * sz + cx * cz;
  const r12 = cx * sy * sz - sx * cz;
  const r20 = -sy;
  const r21 = sx * cy;
  const r22 = cx * cy;

  const sxn = scale?.x ?? 1;
  const syn = scale?.y ?? 1;
  const szn = scale?.z ?? 1;

  return [
    r00 * sxn, r10 * sxn, r20 * sxn, 0,
    r01 * syn, r11 * syn, r21 * syn, 0,
    r02 * szn, r12 * szn, r22 * szn, 0,
    position?.x || 0, position?.y || 0, position?.z || 0, 1,
  ];
}

/** Decompose matrix into TRS (degrees, XYZ). Assumes no shear. */
export function decomposeTRS(m) {
  const px = m[12];
  const py = m[13];
  const pz = m[14];

  const sx = Math.hypot(m[0], m[1], m[2]) || 1;
  const sy = Math.hypot(m[4], m[5], m[6]) || 1;
  const sz = Math.hypot(m[8], m[9], m[10]) || 1;

  // Remove scale
  let r00 = m[0] / sx; let r10 = m[1] / sx; let r20 = m[2] / sx;
  let r01 = m[4] / sy; let r11 = m[5] / sy; let r21 = m[6] / sy;
  let r02 = m[8] / sz; let r12 = m[9] / sz; let r22 = m[10] / sz;

  // Handle negative scale (reflection)
  const det =
    r00 * (r11 * r22 - r12 * r21)
    - r01 * (r10 * r22 - r12 * r20)
    + r02 * (r10 * r21 - r11 * r20);
  let scaleX = sx;
  let scaleY = sy;
  let scaleZ = sz;
  if (det < 0) {
    scaleX = -sx;
    r00 = -r00; r10 = -r10; r20 = -r20;
  }

  let ry = Math.asin(Math.max(-1, Math.min(1, -r20)));
  let rx;
  let rz;
  if (Math.abs(r20) < 0.999999) {
    rx = Math.atan2(r21, r22);
    rz = Math.atan2(r10, r00);
  } else {
    rx = Math.atan2(-r12, r11);
    rz = 0;
  }

  return {
    position: { x: px, y: py, z: pz },
    rotation: { x: radToDeg(rx), y: radToDeg(ry), z: radToDeg(rz) },
    scale: { x: scaleX, y: scaleY, z: scaleZ },
  };
}

export function transformToMatrix(transform) {
  return composeTRS(transform.position, transform.rotation, transform.scale);
}

export function matrixToTransform(m) {
  return decomposeTRS(m);
}
