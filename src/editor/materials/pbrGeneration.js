/**
 * Local PBR map generation from base-color ImageData.
 * Pure CPU image processing — no AI, no network.
 *
 * Normals are OpenGL / Three.js tangent-space (+Y).
 * Roughness maps store absolute roughness in RGB (identical channels).
 */

import {
  normalizeNormalParams,
  normalizeRoughnessParams,
  normalizeTiling,
} from './pbrGeneratorState.js';

/**
 * Sample a scalar height field with axis-aware wrap / clamp.
 * @param {Float32Array} height
 * @param {number} w
 * @param {number} h
 * @param {number} x
 * @param {number} y
 * @param {{ tileHorizontal: boolean, tileVertical: boolean }} tiling
 */
export function sampleHeight(height, w, h, x, y, tiling) {
  const sx = tiling.tileHorizontal
    ? ((Math.floor(x) % w) + w) % w
    : clampInt(Math.floor(x), 0, w - 1);
  const sy = tiling.tileVertical
    ? ((Math.floor(y) % h) + h) % h
    : clampInt(Math.floor(y), 0, h - 1);
  return height[sy * w + sx];
}

/**
 * Build a luminance height field from RGBA ImageData (linear-ish luma).
 * @param {ImageData|{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} image
 * @param {{ invertHeight?: boolean }} [opts]
 * @returns {{ height: Float32Array, width: number, heightPx: number }}
 */
export function imageToHeightField(image, opts = {}) {
  const w = image.width;
  const h = image.height;
  const src = image.data;
  const out = new Float32Array(w * h);
  const invert = Boolean(opts.invertHeight);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    const r = src[p] / 255;
    const g = src[p + 1] / 255;
    const b = src[p + 2] / 255;
    // Rec. 709 luma — brightness is a proxy for height, not ground truth.
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (invert) y = 1 - y;
    out[i] = y;
  }
  return { height: out, width: w, heightPx: h };
}

/**
 * Separable box blur on a Float32 height field (approx Gaussian for small radii).
 * Honors tiling wrap modes on each axis.
 */
export function blurHeightField(height, w, h, radius, tiling) {
  const r = Math.max(0, Math.round(radius));
  if (r <= 0) return height.slice(0);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = r * 2 + 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) {
        sum += sampleHeight(height, w, h, x + k, y, tiling);
      }
      tmp[y * w + x] = sum / span;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = -r; k <= r; k += 1) {
        sum += sampleHeight(tmp, w, h, x, y + k, tiling);
      }
      out[y * w + x] = sum / span;
    }
  }
  return out;
}

/**
 * Combine large-scale and fine-detail height contributions.
 */
export function composeHeightField(baseHeight, w, h, normalParams, tiling) {
  const np = normalizeNormalParams(normalParams);
  const smoothRadius = Math.round(np.smoothing * Math.min(w, h) * 0.025);
  const largeBlur = blurHeightField(baseHeight, w, h, Math.max(1, smoothRadius), tiling);
  const fineBlur = blurHeightField(
    baseHeight,
    w,
    h,
    Math.max(1, Math.round(smoothRadius * 0.35) || 1),
    tiling,
  );
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i += 1) {
    const large = largeBlur[i];
    const fine = baseHeight[i] - fineBlur[i];
    out[i] = (large * np.largeScale + fine * np.fineDetail) * np.strength;
  }
  return out;
}

/**
 * Derive tangent-space normals (OpenGL / Three.js: +X right, +Y up, +Z toward viewer).
 * @returns {ImageData} RGBA normal map, same dimensions as source.
 */
export function heightToNormalMap(height, w, h, tiling, { invertY = false, strength = 1 } = {}) {
  const tile = normalizeTiling(tiling);
  const data = new Uint8ClampedArray(w * h * 4);
  const s = Number.isFinite(strength) ? strength : 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const hL = sampleHeight(height, w, h, x - 1, y, tile);
      const hR = sampleHeight(height, w, h, x + 1, y, tile);
      const hD = sampleHeight(height, w, h, x, y - 1, tile);
      const hU = sampleHeight(height, w, h, x, y + 1, tile);

      // Central differences. Image +Y is down; OpenGL normal +Y is up → flip dy.
      let dx = (hL - hR) * s;
      let dy = (hU - hD) * s;
      if (invertY) dy = -dy;

      let nx = dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * w + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  return createImageData(w, h, data);
}

/**
 * Generate a roughness map ImageData from base-color ImageData.
 */
export function generateRoughnessMap(image, roughnessParams) {
  const rp = normalizeRoughnessParams(roughnessParams);
  const w = image.width;
  const h = image.height;
  const src = image.data;
  const data = new Uint8ClampedArray(w * h * 4);

  if (rp.mode === 'uniform') {
    const v = Math.round(clamp01(rp.uniformValue) * 255);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    return createImageData(w, h, data);
  }

  for (let i = 0, p = 0; p < src.length; i += 1, p += 4) {
    const r = src[p] / 255;
    const g = src[p + 1] / 255;
    const b = src[p + 2] / 255;
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (rp.invert) y = 1 - y;
    // Contrast about mid-gray, then mix toward overall bias by detail weight.
    const contrasted = clamp01(0.5 + (y - 0.5) * rp.contrast);
    const derived = contrasted * rp.detail + rp.overall * (1 - rp.detail);
    const mapped = clamp01(rp.min + derived * (rp.max - rp.min));
    const v = Math.round(mapped * 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  return createImageData(w, h, data);
}

/**
 * Full pipeline: base-color ImageData → { normal, roughness, width, height, ms }.
 */
export function generatePbrMapsFromImageData(image, {
  normal = {},
  roughness = {},
  tiling = {},
} = {}) {
  const started = performance.now();
  if (!image?.data || !image.width || !image.height) {
    throw new Error('generatePbrMapsFromImageData requires ImageData');
  }
  const np = normalizeNormalParams(normal);
  const tile = normalizeTiling(tiling);
  const { height, width, heightPx } = imageToHeightField(image, {
    invertHeight: np.invertHeight,
  });
  const composed = composeHeightField(height, width, heightPx, np, tile);
  const normalMap = heightToNormalMap(composed, width, heightPx, tile, {
    invertY: np.invertY,
    strength: 1,
  });
  const roughnessMap = generateRoughnessMap(image, roughness);
  return {
    normal: normalMap,
    roughness: roughnessMap,
    width,
    height: heightPx,
    ms: performance.now() - started,
  };
}

/**
 * Encode ImageData to a PNG Blob (browser) or throw in non-DOM test envs.
 * Prefer OffscreenCanvas when available.
 */
export async function imageDataToPngBlob(imageData, fileName = 'map.png') {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(imageData.width, imageData.height)
    : createDomCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.putImageData(
    imageData instanceof ImageData
      ? imageData
      : createImageData(imageData.width, imageData.height, imageData.data),
    0,
    0,
  );
  let blob;
  if (canvas.convertToBlob) {
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else {
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
  }
  return new File([blob], fileName, { type: 'image/png' });
}

/**
 * Load an image URL into ImageData (same pixel dimensions).
 */
export async function loadImageDataFromUrl(url) {
  if (!url) throw new Error('Missing texture URL');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load texture: ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : createDomCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return imageData;
}

/** Build a 3×1 (or N×M) tiled ImageData preview without rescaling source pixels. */
export function tileImageDataPreview(imageData, cols = 3, rows = 1) {
  const w = imageData.width;
  const h = imageData.height;
  const outW = w * cols;
  const outH = h * rows;
  const src = imageData.data;
  const data = new Uint8ClampedArray(outW * outH * 4);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      for (let y = 0; y < h; y += 1) {
        const srcRow = y * w * 4;
        const dstRow = ((row * h + y) * outW + col * w) * 4;
        data.set(src.subarray(srcRow, srcRow + w * 4), dstRow);
      }
    }
  }
  return createImageData(outW, outH, data);
}

function createImageData(width, height, data) {
  if (typeof ImageData !== 'undefined') {
    try {
      return new ImageData(data, width, height);
    } catch {
      /* jsdom may require different ctor */
    }
  }
  return { data, width, height };
}

function createDomCanvas(w, h) {
  if (typeof document === 'undefined') {
    throw new Error('DOM canvas unavailable');
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
