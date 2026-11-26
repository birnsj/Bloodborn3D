/**
 * Shared CPU bake for material sphere thumbnails (Asset Viewer globes).
 * No external deps — PNG encode/decode via node:zlib.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_SPHERE_SIZE = 256;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function writePngBuffer(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 6 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function clamp(v, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseHexColor(hex, fallback = [138, 144, 153]) {
  const raw = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!m) return fallback.slice();
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Decode 8-bit non-interlaced PNG → { width, height, rgba: Buffer }. */
export function decodePngRgba(filePath) {
  const buf = readFileSync(filePath);
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    throw new Error(`Not a PNG: ${filePath}`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idats = [];

  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error(`Unsupported PNG compression/filter/interlace: ${filePath}`);
      }
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height) throw new Error(`Invalid PNG header: ${filePath}`);
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG supported: ${filePath}`);
  if (![0, 2, 4, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG color type ${colorType}: ${filePath}`);
  }

  const inflated = inflateSync(Buffer.concat(idats));
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (inflated.length < expected) {
    throw new Error(`PNG IDAT too short: ${filePath}`);
  }

  const recon = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (stride + 1)];
    const row = inflated.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = recon.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? recon.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const x = row[i];
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}: ${filePath}`);
      }
      out[i] = val;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (colorType === 0) {
      const g = recon[s];
      rgba[d] = g;
      rgba[d + 1] = g;
      rgba[d + 2] = g;
      rgba[d + 3] = 255;
    } else if (colorType === 2) {
      rgba[d] = recon[s];
      rgba[d + 1] = recon[s + 1];
      rgba[d + 2] = recon[s + 2];
      rgba[d + 3] = 255;
    } else if (colorType === 4) {
      const g = recon[s];
      rgba[d] = g;
      rgba[d + 1] = g;
      rgba[d + 2] = g;
      rgba[d + 3] = recon[s + 1];
    } else {
      rgba[d] = recon[s];
      rgba[d + 1] = recon[s + 1];
      rgba[d + 2] = recon[s + 2];
      rgba[d + 3] = recon[s + 3];
    }
  }
  return { width, height, rgba };
}

function sampleMap(map, x, y, w) {
  const xx = ((x % w) + w) % w;
  const yy = ((y % w) + w) % w;
  const i = (yy * w + xx) * 4;
  return [map[i], map[i + 1], map[i + 2], map[i + 3]];
}

function sampleMapBilinear(map, x, y, w) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const c00 = sampleMap(map, x0, y0, w);
  const c10 = sampleMap(map, x0 + 1, y0, w);
  const c01 = sampleMap(map, x0, y0 + 1, w);
  const c11 = sampleMap(map, x0 + 1, y0 + 1, w);
  const out = [0, 0, 0, 255];
  for (let k = 0; k < 3; k++) {
    const a = lerp(c00[k], c10[k], fx);
    const b = lerp(c01[k], c11[k], fx);
    out[k] = Math.round(lerp(a, b, fy));
  }
  return out;
}

function solidMap(size, rgb, alpha = 255) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    buf[o] = rgb[0];
    buf[o + 1] = rgb[1];
    buf[o + 2] = rgb[2];
    buf[o + 3] = alpha;
  }
  return buf;
}

/** Soft lit sphere using albedo + normal + roughness maps (square). */
export function bakeSphere(albedo, normal, roughness, mapSize, outSize) {
  const out = Buffer.alloc(outSize * outSize * 4);
  const key = [0.55, 0.75, 0.45];
  const keyLen = Math.hypot(...key);
  const kd = key.map((v) => v / keyLen);
  const fill = [-0.35, 0.25, -0.55];
  const fillLen = Math.hypot(...fill);
  const fd = fill.map((v) => v / fillLen);
  const rim = [0.1, 0.2, -0.9];
  const rimLen = Math.hypot(...rim);
  const rd = rim.map((v) => v / rimLen);

  for (let py = 0; py < outSize; py++) {
    for (let px = 0; px < outSize; px++) {
      const u = ((px + 0.5) / outSize) * 2 - 1;
      const v = 1 - ((py + 0.5) / outSize) * 2;
      const r2 = u * u + v * v;
      const i = (py * outSize + px) * 4;
      if (r2 > 1) {
        out[i] = 18;
        out[i + 1] = 20;
        out[i + 2] = 24;
        out[i + 3] = 255;
        continue;
      }
      const z = Math.sqrt(1 - r2);
      let nx = u;
      let ny = v;
      let nz = z;
      const su = Math.atan2(nx, nz) / (Math.PI * 2) + 0.5;
      const sv = Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI;
      const alb = sampleMapBilinear(albedo, su * mapSize, sv * mapSize, mapSize);
      const nrm = sampleMapBilinear(normal, su * mapSize, sv * mapSize, mapSize);
      const rgh = sampleMapBilinear(roughness, su * mapSize, sv * mapSize, mapSize)[0] / 255;

      const tnx = (nrm[0] / 255) * 2 - 1;
      const tny = (nrm[1] / 255) * 2 - 1;
      const tnz = (nrm[2] / 255) * 2 - 1;
      nx = nx * 0.42 + tnx * 0.58;
      ny = ny * 0.42 + tny * 0.58;
      nz = nz * 0.42 + Math.max(0.2, tnz) * 0.58;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      nx /= nlen;
      ny /= nlen;
      nz /= nlen;

      const ndotK = Math.max(0, nx * kd[0] + ny * kd[1] + nz * kd[2]);
      const ndotF = Math.max(0, nx * fd[0] + ny * fd[1] + nz * fd[2]);
      const ndotR = Math.max(0, nx * rd[0] + ny * rd[1] + nz * rd[2]);
      const ambient = 0.34;
      const diff = ambient + ndotK * 1.15 + ndotF * 0.48 + ndotR * 0.26;
      const gloss = Math.pow(1 - rgh, 2.2);
      const hx = kd[0];
      const hy = kd[1] + 1;
      const hz = kd[2];
      const hl = Math.hypot(hx, hy, hz) || 1;
      const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 12 + gloss * 72) * gloss * 1.25;

      const exposure = 1.2;
      out[i] = clamp(alb[0] * diff * exposure + spec * 255);
      out[i + 1] = clamp(alb[1] * diff * exposure + spec * 255);
      out[i + 2] = clamp(alb[2] * diff * exposure + spec * 245);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Downscale square RGBA to `size` with box filter (keeps bake fast on 2k maps). */
function downscaleSquare(rgba, width, height, size) {
  if (width === size && height === size) return rgba;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x / size) * width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / size) * width));
      const y0 = Math.floor((y / size) * height);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / size) * height));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = ((yy % height) * width + (xx % width)) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          a += rgba[i + 3];
          n += 1;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function loadMapOrSolid(filePath, solidRgb, mapSize) {
  if (filePath && existsSync(filePath)) {
    const decoded = decodePngRgba(filePath);
    // Bake assumes square maps; crop/pad to min side then downscale.
    const side = Math.min(decoded.width, decoded.height);
    const square = Buffer.alloc(side * side * 4);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const si = (y * decoded.width + x) * 4;
        const di = (y * side + x) * 4;
        square[di] = decoded.rgba[si];
        square[di + 1] = decoded.rgba[si + 1];
        square[di + 2] = decoded.rgba[si + 2];
        square[di + 3] = decoded.rgba[si + 3];
      }
    }
    return downscaleSquare(square, side, side, mapSize);
  }
  return solidMap(mapSize, solidRgb);
}

/**
 * Bake a sphere preview for a material definition.
 * @param {object} opts
 * @param {object} opts.definition material JSON
 * @param {(textureId: string) => string | null} opts.resolveTexturePath absolute file path resolver
 * @param {string} opts.previewAbsPath where to write the PNG
 * @param {number} [opts.sphereSize]
 * @param {number} [opts.mapSize] working map resolution
 * @returns {{ previewPath: string, previewAbsPath: string }}
 */
export function bakeAndWriteMaterialSpherePreview({
  definition,
  resolveTexturePath,
  previewAbsPath,
  sphereSize = DEFAULT_SPHERE_SIZE,
  mapSize = 512,
}) {
  const baseRgb = parseHexColor(definition?.baseColor);
  const rough = Number.isFinite(Number(definition?.roughness))
    ? Math.max(0, Math.min(1, Number(definition.roughness)))
    : 0.75;
  const roughByte = clamp(rough * 255);

  const albedoPath = definition?.baseColorMapId
    ? resolveTexturePath(definition.baseColorMapId)
    : null;
  const normalPath = definition?.normalMapId
    ? resolveTexturePath(definition.normalMapId)
    : null;
  const roughPath = definition?.roughnessMapId
    ? resolveTexturePath(definition.roughnessMapId)
    : null;

  const albedo = loadMapOrSolid(albedoPath, baseRgb, mapSize);
  const normal = loadMapOrSolid(normalPath, [128, 128, 255], mapSize);
  const roughness = loadMapOrSolid(roughPath, [roughByte, roughByte, roughByte], mapSize);

  const sphere = bakeSphere(albedo, normal, roughness, mapSize, sphereSize);
  writePngBuffer(previewAbsPath, sphereSize, sphereSize, sphere);

  return {
    previewPath: `previews/${previewAbsPath.replace(/\\/g, '/').split('/').pop()}`,
    previewAbsPath,
  };
}

/** Convenience: preview relative path for a material id. */
export function previewRelPathForMaterial(materialId) {
  return `previews/${materialId}_sphere.png`;
}

export function previewAbsPathForMaterial(assetsDir, materialId) {
  return join(assetsDir, 'previews', `${materialId}_sphere.png`);
}
