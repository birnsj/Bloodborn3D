/**
 * Production acceptance: Generate PBR maps for Full Wall Master Bedroom
 * and apply them to mat_0807fae227e1 while preserving UV scale 1/6.
 *
 * Usage (dev server on 5178):
 *   node scripts/fullWallPbrAcceptance.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  generatePbrMapsFromImageData,
  tileImageDataPreview,
} from '../src/editor/materials/pbrGeneration.js';
import { normalizePbrGeneratorMeta } from '../src/editor/materials/pbrGeneratorState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BB_DEV_URL || 'http://localhost:5178';
const MAT_ID = 'mat_0807fae227e1';
const TEX_ID = 'tex_c62b419b178b';
const OUT_DIR = path.join(ROOT, '.openart-staging', 'pbr-acceptance');

const require = createRequire(import.meta.url);

async function loadPngImageData(absPath) {
  // Prefer sharp if present; else decode via pure pngjs-free path using
  // the same bytes the browser would load — use createRequire('pngjs') only
  // if available. Fallback: dynamic import of 'fs' + canvas-less decode via
  // undici + manual is heavy. Use built-in approach with 'pngjs' optional.
  let pngjs;
  try {
    pngjs = require('pngjs');
  } catch {
    pngjs = null;
  }
  if (!pngjs) {
    // Minimal PNG decode via browser-less path: shell out is avoided.
    // Use ImageData-compatible decode through Vite-served fetch + Offscreen
    // is unavailable in Node. Install-free approach: read via 'pngjs' vendored?
    // Fall back to fetching from the running server and using `pngjs` from
    // optional dep — if missing, use a tiny decoder for 8-bit RGBA PNGs.
    return decodePngRgba(await fs.readFile(absPath));
  }
  const { PNG } = pngjs;
  const png = PNG.sync.read(await fs.readFile(absPath));
  return {
    data: Uint8ClampedArray.from(png.data),
    width: png.width,
    height: png.height,
  };
}

/** Minimal 8-bit RGBA PNG decoder (no filtering beyond None/Sub/Up/Average/Paeth). */
async function decodePngRgba(buffer) {
  // Use dynamic import of node's zlib
  const zlib = await import('node:zlib');
  const { promisify } = await import('node:util');
  const inflate = promisify(zlib.inflate);

  if (buffer[0] !== 0x89) throw new Error('Not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idat = [];
  while (offset < buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format depth=${bitDepth} colorType=${colorType}`);
  }
  const compressed = Buffer.concat(idat);
  const raw = await inflate(compressed);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  let inPos = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inPos++];
    const row = raw.subarray(inPos, inPos + stride);
    inPos += stride;
    const recon = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 1) {
      const x = row[i];
      const a = i >= bpp ? recon[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 255;
      }
      recon[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      out[di] = recon[si];
      out[di + 1] = recon[si + 1];
      out[di + 2] = recon[si + 2];
      out[di + 3] = bpp === 4 ? recon[si + 3] : 255;
    }
    prev = recon;
  }
  return { data: out, width, height };
}

async function encodePngRgba(imageData, absPath) {
  // Prefer pngjs if present; else write a filter-0 uncompressed-ish PNG via zlib.
  let pngjs;
  try {
    pngjs = require('pngjs');
  } catch {
    pngjs = null;
  }
  if (pngjs) {
    const { PNG } = pngjs;
    const png = new PNG({ width: imageData.width, height: imageData.height });
    png.data = Buffer.from(imageData.data);
    await fs.writeFile(absPath, PNG.sync.write(png));
    return;
  }
  const zlib = await import('node:zlib');
  const { promisify } = await import('node:util');
  const deflate = promisify(zlib.deflate);
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < w * 4; x += 1) {
      raw[rowStart + 1 + x] = src[y * w * 4 + x];
    }
  }
  const compressed = await deflate(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  await fs.writeFile(absPath, chunks);
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

async function api(action, { method = 'GET', body = null, query = {}, rawBody = null, headers = {} } = {}) {
  const qs = new URLSearchParams({ action, ...query });
  const res = await fetch(`${BASE}/api/assets?${qs}`, {
    method,
    headers: rawBody
      ? { 'Content-Type': 'application/octet-stream', ...headers }
      : body
        ? { 'Content-Type': 'application/json', ...headers }
        : headers,
    body: rawBody || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API ${action} failed: ${res.status}`);
  return data;
}

async function upsertTexture(existingId, pngAbs, name, tags) {
  const bytes = await fs.readFile(pngAbs);
  if (existingId) {
    try {
      const replaced = await api('replace-texture', {
        method: 'POST',
        query: { id: existingId },
        rawBody: bytes,
      });
      return replaced.asset.id;
    } catch {
      /* import fresh */
    }
  }
  const qs = new URLSearchParams({
    action: 'import-texture',
    name: path.basename(pngAbs),
    assetName: name,
    tags: tags.join(','),
  });
  const res = await fetch(`${BASE}/api/assets?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'import failed');
  return data.asset.id;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const texPath = path.join(ROOT, 'public/assets/textures', `${TEX_ID}.png`);
  const matBefore = await api('material', { query: { id: MAT_ID } });

  console.log('Loading base color…', texPath);
  const image = await loadPngImageData(texPath);
  console.log(`  ${image.width}×${image.height}`);

  const tiling = { tileHorizontal: true, tileVertical: false };
  const normal = {
    strength: 2.85,
    fineDetail: 0.9,
    largeScale: 0.85,
    smoothing: 0.22,
    invertHeight: false,
    invertY: false,
  };
  const roughness = {
    mode: 'derived',
    overall: 0.62,
    contrast: 1.2,
    detail: 0.7,
    invert: false,
    min: 0.12,
    max: 0.9,
  };

  console.log('Generating PBR maps…');
  const t0 = performance.now();
  const maps = generatePbrMapsFromImageData(image, { normal, roughness, tiling });
  const ms = performance.now() - t0;
  console.log(`  done in ${Math.round(ms)} ms`);

  const normalPath = path.join(OUT_DIR, 'full-wall-normal.png');
  const roughnessPath = path.join(OUT_DIR, 'full-wall-roughness.png');
  const basePath = path.join(OUT_DIR, 'full-wall-base.png');
  const tile3Path = path.join(OUT_DIR, 'full-wall-normal-3x1.png');
  await encodePngRgba(image, basePath);
  await encodePngRgba(maps.normal, normalPath);
  await encodePngRgba(maps.roughness, roughnessPath);
  await encodePngRgba(tileImageDataPreview(maps.normal, 3, 1), tile3Path);

  const prev = matBefore.pbrGenerator || {};
  const normalId = await upsertTexture(
    prev.generatedNormalMapId,
    normalPath,
    'Full Wall Master Bedroom Normal',
    ['pbr-generated', 'normal', 'non-color'],
  );
  const roughnessId = await upsertTexture(
    prev.generatedRoughnessMapId,
    roughnessPath,
    'Full Wall Master Bedroom Roughness',
    ['pbr-generated', 'roughness', 'non-color'],
  );

  const pbrGenerator = normalizePbrGeneratorMeta({
    sourceTextureId: TEX_ID,
    tileHorizontal: true,
    tileVertical: false,
    normal,
    roughness,
    generatedNormalMapId: normalId,
    generatedRoughnessMapId: roughnessId,
    updatedAt: Date.now(),
  });

  const uvScale = matBefore.uvScale || { x: 1 / 6, y: 1 / 6 };
  const payload = {
    ...matBefore,
    normalMapId: normalId,
    roughnessMapId: roughnessId,
    normalScale: Number.isFinite(Number(matBefore.normalScale)) && Number(matBefore.normalScale) > 1
      ? Number(matBefore.normalScale)
      : 4,
    roughness: 1,
    metalness: 0,
    uvScale,
    uvOffset: matBefore.uvOffset || { x: 0, y: 0 },
    uvRotation: matBefore.uvRotation || 0,
    baseColorMapId: TEX_ID,
    pbrGenerator,
    updatedAt: Date.now(),
  };

  const saved = await api('material', {
    method: 'PUT',
    query: { id: MAT_ID },
    body: payload,
  });

  const report = {
    materialId: MAT_ID,
    baseColorMapId: TEX_ID,
    normalMapId: normalId,
    roughnessMapId: roughnessId,
    uvScale: saved.definition.uvScale,
    roughnessScalar: saved.definition.roughness,
    metalness: saved.definition.metalness,
    generateMs: Math.round(ms),
    dimensions: { width: image.width, height: image.height },
    outputs: {
      base: basePath,
      normal: normalPath,
      roughness: roughnessPath,
      normalTile3x1: tile3Path,
    },
    uvPreserved:
      Math.abs(saved.definition.uvScale.x - 1 / 6) < 1e-6
      && Math.abs(saved.definition.uvScale.y - 1 / 6) < 1e-6,
  };

  await fs.writeFile(
    path.join(OUT_DIR, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('\n=== PBR ACCEPTANCE COMPLETE ===');
  console.log(JSON.stringify(report, null, 2));
  if (!report.uvPreserved) {
    throw new Error('UV scale was not preserved at 1/6');
  }
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
