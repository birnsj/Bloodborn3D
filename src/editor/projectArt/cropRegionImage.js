/**
 * Browser-side crop of a Project Art (or any same-origin) image region.
 * Produces a PNG File suitable for OpenArt --image reference upload.
 * No vision / captioning — pixels only.
 */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image for crop: ${url}`));
    img.src = url;
  });
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

/** Pixel rect from a normalized region against natural image size. */
export function regionToPixelRect(region, naturalWidth, naturalHeight) {
  const nw = Math.max(1, Math.round(Number(naturalWidth) || 0));
  const nh = Math.max(1, Math.round(Number(naturalHeight) || 0));
  const x = clamp01(region?.x);
  const y = clamp01(region?.y);
  const width = Math.min(clamp01(region?.width), 1 - x);
  const height = Math.min(clamp01(region?.height), 1 - y);
  const sx = Math.round(x * nw);
  const sy = Math.round(y * nh);
  const sw = Math.max(1, Math.round(width * nw));
  const sh = Math.max(1, Math.round(height * nh));
  return {
    sx: Math.min(sx, nw - 1),
    sy: Math.min(sy, nh - 1),
    sw: Math.min(sw, nw - sx),
    sh: Math.min(sh, nh - sy),
    naturalWidth: nw,
    naturalHeight: nh,
  };
}

/**
 * @param {{ imageUrl: string, region: object, fileName?: string }} opts
 * @returns {Promise<File>}
 */
export async function cropImageRegionToFile({
  imageUrl,
  region,
  fileName = 'region-reference.png',
} = {}) {
  if (!imageUrl) {
    const err = new Error('Image URL required to crop region');
    err.code = 'NO_IMAGE_URL';
    throw err;
  }
  if (!region) {
    const err = new Error('Region required to crop');
    err.code = 'NO_REGION';
    throw err;
  }

  const img = await loadImage(imageUrl);
  const nw = region.naturalWidth || img.naturalWidth;
  const nh = region.naturalHeight || img.naturalHeight;
  const { sx, sy, sw, sh } = regionToPixelRect(region, nw, nh);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const err = new Error('Canvas unavailable for region crop');
    err.code = 'NO_CANVAS';
    throw err;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Object.assign(new Error('Region crop failed'), { code: 'CROP_FAILED' }))),
      'image/png',
    );
  });

  return new File([blob], fileName, { type: 'image/png' });
}
