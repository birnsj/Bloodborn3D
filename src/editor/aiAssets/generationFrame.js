/**
 * Provider-independent generation frame helpers.
 * Pixel sizes follow the Nano Banana / OpenArt 1K·2K·4K aspect table when known;
 * otherwise fall back to a proportional scale from the resolution base.
 */

/** @type {Record<string, Record<string, [number, number]>>} */
export const GENERATION_PIXEL_TABLE = Object.freeze({
  '1K': Object.freeze({
    '1:1': [1024, 1024],
    '2:3': [848, 1264],
    '3:2': [1264, 848],
    '3:4': [896, 1200],
    '4:3': [1200, 896],
    '4:5': [928, 1152],
    '5:4': [1152, 928],
    '9:16': [768, 1376],
    '16:9': [1376, 768],
    '21:9': [1584, 672],
  }),
  '2K': Object.freeze({
    '1:1': [2048, 2048],
    '2:3': [1696, 2528],
    '3:2': [2528, 1696],
    '3:4': [1792, 2400],
    '4:3': [2400, 1792],
    '4:5': [1856, 2304],
    '5:4': [2304, 1856],
    '9:16': [1536, 2752],
    '16:9': [2752, 1536],
    '21:9': [3168, 1344],
  }),
  '4K': Object.freeze({
    '1:1': [4096, 4096],
    '2:3': [3392, 5056],
    '3:2': [5056, 3392],
    '3:4': [3584, 4800],
    '4:3': [4800, 3584],
    '4:5': [3712, 4608],
    '5:4': [4608, 3712],
    '9:16': [3072, 5504],
    '16:9': [5504, 3072],
    '21:9': [6336, 2688],
  }),
});

const RESOLUTION_BASE = Object.freeze({
  '0.5K': 512,
  '512': 512,
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
});

export function parseAspectRatio(aspectRatio = '1:1') {
  const raw = String(aspectRatio || '1:1').trim();
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return { w: 1, h: 1, label: '1:1' };
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1, label: '1:1' };
  return { w, h, label: `${stripTrailingZero(w)}:${stripTrailingZero(h)}` };
}

function stripTrailingZero(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Resolve output pixel size from generation settings.
 * Prefers explicit width/height, then known table, then proportional fallback.
 */
export function resolveGenerationPixelSize({
  aspectRatio = '1:1',
  resolution = '1K',
  width = null,
  height = null,
} = {}) {
  const wNum = Number(width);
  const hNum = Number(height);
  if (Number.isFinite(wNum) && wNum > 0 && Number.isFinite(hNum) && hNum > 0) {
    return {
      width: Math.round(wNum),
      height: Math.round(hNum),
      aspectLabel: `${Math.round(wNum)}:${Math.round(hNum)}`,
      resolution: String(resolution || ''),
      source: 'explicit',
    };
  }

  const resKey = String(resolution || '1K');
  const aspect = parseAspectRatio(aspectRatio);
  const tableHit = GENERATION_PIXEL_TABLE[resKey]?.[aspect.label];
  if (tableHit) {
    return {
      width: tableHit[0],
      height: tableHit[1],
      aspectLabel: aspect.label,
      resolution: resKey,
      source: 'table',
    };
  }

  const base = RESOLUTION_BASE[resKey] || 1024;
  // Fit the longer side to the resolution base (matches 1:1 table behavior).
  const long = Math.max(aspect.w, aspect.h);
  const scale = base / long;
  return {
    width: Math.max(1, Math.round(aspect.w * scale)),
    height: Math.max(1, Math.round(aspect.h * scale)),
    aspectLabel: aspect.label,
    resolution: resKey,
    source: 'fallback',
  };
}

export function describeTilingDirection({ tileHorizontal = false, tileVertical = false } = {}) {
  const h = Boolean(tileHorizontal);
  const v = Boolean(tileVertical);
  if (h && v) return 'Tiles horizontally and vertically';
  if (h) return 'Tiles horizontally';
  if (v) return 'Tiles vertically';
  return 'No tiling';
}
