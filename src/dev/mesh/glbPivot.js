/**
 * Rebake a glTF/GLB so the mesh AABB sits with bottom-center at the origin.
 * Optionally uniform-scales upright Meshy character exports to a human target height.
 * Patches scene-root node transforms only — binary chunks (geometry + textures) stay intact.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'
const EPS = 1e-6;

/** Default standing height for Meshy character imports (meters). */
export const MESHY_HUMAN_HEIGHT_METERS = 1.75;

const COMPONENT_BYTES = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new Error('Expected Buffer or ArrayBuffer');
}

function pad4(n) {
  return (n + 3) & ~3;
}

/** @returns {{ json: object, bin: Buffer }} */
export function parseGlbChunks(input) {
  const buf = toBuffer(input);
  if (buf.length < 12) throw new Error('GLB too small');
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a GLB (bad magic)');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}`);

  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);

  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    const chunkData = buf.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === CHUNK_JSON) {
      const text = chunkData.toString('utf8').replace(/\0+$/, '');
      json = JSON.parse(text);
    } else if (chunkType === CHUNK_BIN) {
      bin = Buffer.from(chunkData);
    }
  }
  if (!json) throw new Error('GLB missing JSON chunk');
  return { json, bin };
}

/** @returns {Buffer} */
export function packGlb(json, bin = Buffer.alloc(0)) {
  const binBuf = toBuffer(bin);
  let jsonStr = JSON.stringify(json);
  const jsonPad = pad4(Buffer.byteLength(jsonStr, 'utf8')) - Buffer.byteLength(jsonStr, 'utf8');
  if (jsonPad) jsonStr += ' '.repeat(jsonPad);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const binPad = pad4(binBuf.length) - binBuf.length;
  const binPadded = binPad ? Buffer.concat([binBuf, Buffer.alloc(binPad)]) : binBuf;

  const total = 12 + 8 + jsonBuf.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);

  let o = 12;
  out.writeUInt32LE(jsonBuf.length, o);
  out.writeUInt32LE(CHUNK_JSON, o + 4);
  jsonBuf.copy(out, o + 8);
  o += 8 + jsonBuf.length;

  out.writeUInt32LE(binPadded.length, o);
  out.writeUInt32LE(CHUNK_BIN, o + 4);
  binPadded.copy(out, o + 8);
  return out;
}

function mat4Multiply(a, b) {
  const out = new Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4]
        + a[4 + row] * b[col * 4 + 1]
        + a[8 + row] * b[col * 4 + 2]
        + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4FromNode(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return node.matrix.map(Number);
  }
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1]; // xyzw
  const s = node.scale || [1, 1, 1];
  const [qx, qy, qz, qw] = r.map(Number);
  const [sx, sy, sz] = s.map(Number);

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const yy = qy * y2;
  const zz = qz * z2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yz = qy * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    Number(t[0]) || 0, Number(t[1]) || 0, Number(t[2]) || 0, 1,
  ];
}

function transformPoint(m, x, y, z, out) {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

function readAccessorComponent(view, componentType, normalized, index) {
  let v;
  switch (componentType) {
    case 5120: v = view.readInt8(index); break;
    case 5121: v = view.readUInt8(index); break;
    case 5122: v = view.readInt16LE(index); break;
    case 5123: v = view.readUInt16LE(index); break;
    case 5125: v = view.readUInt32LE(index); break;
    case 5126: return view.readFloatLE(index);
    default: throw new Error(`Unsupported accessor componentType ${componentType}`);
  }
  if (!normalized) return v;
  if (componentType === 5120) return Math.max(v / 127, -1);
  if (componentType === 5121) return v / 255;
  if (componentType === 5122) return Math.max(v / 32767, -1);
  if (componentType === 5123) return v / 65535;
  return v;
}

function getAccessorBytes(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) return null;
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return null;
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const comps = TYPE_COMPONENTS[accessor.type] || 1;
  const compBytes = COMPONENT_BYTES[accessor.componentType];
  if (!compBytes) return null;
  const stride = bufferView.byteStride || comps * compBytes;
  return {
    accessor,
    comps,
    compBytes,
    stride,
    byteOffset,
    count: accessor.count | 0,
    componentType: accessor.componentType,
    normalized: !!accessor.normalized,
  };
}

function expandBoxWithAccessor(box, json, bin, accessorIndex, world) {
  const info = getAccessorBytes(json, bin, accessorIndex);
  if (!info || info.comps < 3) return;
  // Prefer accessor min/max when present (common for POSITION) — transform 8 corners.
  const { accessor } = info;
  if (
    Array.isArray(accessor.min) && accessor.min.length >= 3
    && Array.isArray(accessor.max) && accessor.max.length >= 3
  ) {
    const [minX, minY, minZ] = accessor.min.map(Number);
    const [maxX, maxY, maxZ] = accessor.max.map(Number);
    const corners = [
      [minX, minY, minZ], [maxX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ],
      [minX, minY, maxZ], [maxX, minY, maxZ], [minX, maxY, maxZ], [maxX, maxY, maxZ],
    ];
    const p = [0, 0, 0];
    for (const c of corners) {
      transformPoint(world, c[0], c[1], c[2], p);
      if (p[0] < box.min[0]) box.min[0] = p[0];
      if (p[1] < box.min[1]) box.min[1] = p[1];
      if (p[2] < box.min[2]) box.min[2] = p[2];
      if (p[0] > box.max[0]) box.max[0] = p[0];
      if (p[1] > box.max[1]) box.max[1] = p[1];
      if (p[2] > box.max[2]) box.max[2] = p[2];
    }
    return;
  }

  const p = [0, 0, 0];
  for (let i = 0; i < info.count; i += 1) {
    const base = info.byteOffset + i * info.stride;
    const x = readAccessorComponent(bin, info.componentType, info.normalized, base);
    const y = readAccessorComponent(bin, info.componentType, info.normalized, base + info.compBytes);
    const z = readAccessorComponent(bin, info.componentType, info.normalized, base + info.compBytes * 2);
    transformPoint(world, x, y, z, p);
    if (p[0] < box.min[0]) box.min[0] = p[0];
    if (p[1] < box.min[1]) box.min[1] = p[1];
    if (p[2] < box.min[2]) box.min[2] = p[2];
    if (p[0] > box.max[0]) box.max[0] = p[0];
    if (p[1] > box.max[1]) box.max[1] = p[1];
    if (p[2] > box.max[2]) box.max[2] = p[2];
  }
}

function walkNodes(json, nodeIndex, parentWorld, visit) {
  const node = json.nodes?.[nodeIndex];
  if (!node) return;
  const local = mat4FromNode(node);
  const world = parentWorld ? mat4Multiply(parentWorld, local) : local;
  visit(nodeIndex, node, world);
  const children = node.children || [];
  for (const child of children) walkNodes(json, child, world, visit);
}

/** World-space AABB of all mesh POSITION attributes under default scene roots. */
export function computeGlbAabbMeters(input) {
  const { json, bin } = parseGlbChunks(input);
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  if (!scene?.nodes?.length) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
    };
  }

  const box = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };

  for (const rootIndex of scene.nodes) {
    walkNodes(json, rootIndex, null, (_idx, node, world) => {
      if (node.mesh == null) return;
      const mesh = json.meshes?.[node.mesh];
      if (!mesh?.primitives) return;
      for (const prim of mesh.primitives) {
        const pos = prim.attributes?.POSITION;
        if (pos == null) continue;
        expandBoxWithAccessor(box, json, bin, pos, world);
      }
    });
  }

  if (!Number.isFinite(box.min[0])) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
      center: { x: 0, y: 0, z: 0 },
      size: { x: 0, y: 0, z: 0 },
    };
  }

  const min = { x: box.min[0], y: box.min[1], z: box.min[2] };
  const max = { x: box.max[0], y: box.max[1], z: box.max[2] };
  const center = {
    x: (min.x + max.x) * 0.5,
    y: (min.y + max.y) * 0.5,
    z: (min.z + max.z) * 0.5,
  };
  const size = {
    x: max.x - min.x,
    y: max.y - min.y,
    z: max.z - min.z,
  };
  return { min, max, center, size };
}

function addTranslationToNode(node, dx, dy, dz) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    const m = node.matrix.map(Number);
    m[12] += dx;
    m[13] += dy;
    m[14] += dz;
    node.matrix = m;
    return;
  }
  const t = node.translation || [0, 0, 0];
  node.translation = [
    (Number(t[0]) || 0) + dx,
    (Number(t[1]) || 0) + dy,
    (Number(t[2]) || 0) + dz,
  ];
}

function multiplyUniformScaleOnNode(node, scale) {
  if (!(scale > 0) || Math.abs(scale - 1) < EPS) return;
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    // Scale about the node origin: M' = S * M (column-major).
    const m = node.matrix.map(Number);
    for (let i = 0; i < 12; i += 1) m[i] *= scale;
    m[12] *= scale;
    m[13] *= scale;
    m[14] *= scale;
    node.matrix = m;
    return;
  }
  const s = node.scale || [1, 1, 1];
  node.scale = [
    (Number(s[0]) || 1) * scale,
    (Number(s[1]) || 1) * scale,
    (Number(s[2]) || 1) * scale,
  ];
  if (Array.isArray(node.translation)) {
    node.translation = node.translation.map((v) => (Number(v) || 0) * scale);
  }
}

function mapSceneRootNodes(input, mutateNode) {
  const buf = toBuffer(input);
  const { json, bin } = parseGlbChunks(buf);
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  if (!scene?.nodes?.length) {
    return { buffer: buf, touched: false };
  }
  if (!Array.isArray(json.nodes)) json.nodes = [];
  let touched = false;
  for (const rootIndex of scene.nodes) {
    const node = json.nodes[rootIndex];
    if (!node) continue;
    mutateNode(node);
    touched = true;
  }
  return { buffer: packGlb(json, bin), touched };
}

/**
 * Upright Meshy character exports are often ~0.5–1.4 m tall.
 * Skip tiny props, already-human-sized meshes, and wide/flat objects.
 */
export function shouldNormalizeMeshyHumanScale(aabb, targetHeightMeters = MESHY_HUMAN_HEIGHT_METERS) {
  const h = Number(aabb?.size?.y) || 0;
  if (!(h > 0)) return false;
  if (h < 0.4 || h > 2.2) return false;
  if (h >= targetHeightMeters * 0.95) return false;
  const footprint = Math.max(Number(aabb?.size?.x) || 0, Number(aabb?.size?.z) || 0);
  if (footprint > 0 && h < footprint * 1.15) return false;
  return true;
}

function applyUniformScaleToSceneRoots(input, scale) {
  if (!(scale > 0) || Math.abs(scale - 1) < EPS) {
    return toBuffer(input);
  }
  const { buffer } = mapSceneRootNodes(input, (node) => multiplyUniformScaleOnNode(node, scale));
  return buffer;
}

/**
 * Translate scene-root nodes so AABB bottom-center lands at origin.
 * @returns {{ buffer: Buffer, changed: boolean, offset: {x,y,z}, boundingBoxMeters: object, boundingBoxCenterMeters: object }}
 */
export function rebakeGlbPivotToBottomCenter(input) {
  const buf = toBuffer(input);
  const before = computeGlbAabbMeters(buf);
  const offset = {
    x: -before.center.x,
    y: -before.min.y,
    z: -before.center.z,
  };

  const nearZero =
    Math.abs(offset.x) < EPS
    && Math.abs(offset.y) < EPS
    && Math.abs(offset.z) < EPS;

  if (nearZero) {
    return {
      buffer: buf,
      changed: false,
      offset,
      boundingBoxMeters: { ...before.size },
      boundingBoxCenterMeters: { ...before.center },
      pivot: 'bottom-center',
    };
  }

  const { json, bin } = parseGlbChunks(buf);
  const sceneIndex = json.scene ?? 0;
  const scene = json.scenes?.[sceneIndex];
  if (!scene?.nodes?.length) {
    return {
      buffer: buf,
      changed: false,
      offset: { x: 0, y: 0, z: 0 },
      boundingBoxMeters: { ...before.size },
      boundingBoxCenterMeters: { ...before.center },
      pivot: 'bottom-center',
    };
  }

  if (!Array.isArray(json.nodes)) json.nodes = [];
  for (const rootIndex of scene.nodes) {
    const node = json.nodes[rootIndex];
    if (node) addTranslationToNode(node, offset.x, offset.y, offset.z);
  }

  const out = packGlb(json, bin);
  const after = computeGlbAabbMeters(out);
  return {
    buffer: out,
    changed: true,
    offset,
    boundingBoxMeters: { ...after.size },
    boundingBoxCenterMeters: { ...after.center },
    pivot: 'bottom-center',
  };
}

/**
 * Meshy Import Model normalize: bottom-center pivot, then human-height scale when appropriate.
 * Scale is applied after pivot so feet stay on the origin.
 *
 * @returns {{
 *   buffer: Buffer,
 *   changed: boolean,
 *   pivot: string,
 *   offset: {x,y,z},
 *   scaleApplied: number,
 *   targetHeightMeters: number|null,
 *   sourceHeightMeters: number,
 *   boundingBoxMeters: object,
 *   boundingBoxCenterMeters: object,
 * }}
 */
export function normalizeMeshyImportGlb(input, {
  targetHeightMeters = MESHY_HUMAN_HEIGHT_METERS,
  applyHumanScale = true,
} = {}) {
  const pivoted = rebakeGlbPivotToBottomCenter(input);
  let buffer = pivoted.buffer;
  let scaleApplied = 1;
  const sourceHeightMeters = pivoted.boundingBoxMeters?.y || 0;

  if (applyHumanScale && shouldNormalizeMeshyHumanScale(
    { size: pivoted.boundingBoxMeters },
    targetHeightMeters,
  )) {
    scaleApplied = targetHeightMeters / sourceHeightMeters;
    buffer = applyUniformScaleToSceneRoots(buffer, scaleApplied);
  }

  const after = computeGlbAabbMeters(buffer);
  return {
    buffer,
    changed: pivoted.changed || Math.abs(scaleApplied - 1) >= EPS,
    pivot: 'bottom-center',
    offset: pivoted.offset,
    scaleApplied,
    targetHeightMeters: Math.abs(scaleApplied - 1) >= EPS ? targetHeightMeters : null,
    sourceHeightMeters,
    boundingBoxMeters: { ...after.size },
    boundingBoxCenterMeters: { ...after.center },
  };
}

/** Build a tiny single-triangle GLB for tests (positions are VEC3 floats). */
export function buildTestTriangleGlb(positions, { translation = null, scale = null } = {}) {
  const posBuf = Buffer.alloc(positions.length * 4);
  for (let i = 0; i < positions.length; i += 1) {
    posBuf.writeFloatLE(positions[i], i * 4);
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  const node = { mesh: 0 };
  if (translation) node.translation = translation;
  if (scale) node.scale = scale;
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [node],
    meshes: [{
      primitives: [{ attributes: { POSITION: 0 }, mode: 4 }],
    }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      max,
      min,
    }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBuf.length }],
    buffers: [{ byteLength: posBuf.length }],
  };
  return packGlb(json, posBuf);
}
