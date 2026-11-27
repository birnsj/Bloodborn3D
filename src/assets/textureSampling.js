/**
 * Batch 8 — engine-neutral texture sampling + transform meta (Three.js r187).
 * Asset-level defaults; materials clone and may compose Layer-2 UV on top.
 */
import * as THREE from 'three';

export const TEXTURE_WRAP_MODES = Object.freeze(['repeat', 'clamp', 'mirrored']);
export const TEXTURE_MAG_FILTERS = Object.freeze(['nearest', 'linear']);
export const TEXTURE_MIN_FILTERS = Object.freeze([
  'nearest',
  'linear',
  'nearestMipmapNearest',
  'nearestMipmapLinear',
  'linearMipmapNearest',
  'linearMipmapLinear',
]);
export const TEXTURE_COLOR_SPACES = Object.freeze(['srgb', 'srgb-linear', 'none', 'auto']);

const WRAP_TO_THREE = {
  repeat: THREE.RepeatWrapping,
  clamp: THREE.ClampToEdgeWrapping,
  mirrored: THREE.MirroredRepeatWrapping,
};
const THREE_TO_WRAP = {
  [THREE.RepeatWrapping]: 'repeat',
  [THREE.ClampToEdgeWrapping]: 'clamp',
  [THREE.MirroredRepeatWrapping]: 'mirrored',
};

const MAG_TO_THREE = {
  nearest: THREE.NearestFilter,
  linear: THREE.LinearFilter,
};
const MIN_TO_THREE = {
  nearest: THREE.NearestFilter,
  linear: THREE.LinearFilter,
  nearestMipmapNearest: THREE.NearestMipmapNearestFilter,
  nearestMipmapLinear: THREE.NearestMipmapLinearFilter,
  linearMipmapNearest: THREE.LinearMipmapNearestFilter,
  linearMipmapLinear: THREE.LinearMipmapLinearFilter,
};

const COLOR_TO_THREE = {
  srgb: THREE.SRGBColorSpace,
  'srgb-linear': THREE.LinearSRGBColorSpace,
  none: THREE.NoColorSpace,
};

export const DEFAULT_TEXTURE_SAMPLER = Object.freeze({
  wrapS: 'repeat',
  wrapT: 'repeat',
  magFilter: 'linear',
  minFilter: 'linearMipmapLinear',
  generateMipmaps: true,
  anisotropy: 8,
  colorSpace: 'auto',
});

export const DEFAULT_TEXTURE_TRANSFORM = Object.freeze({
  repeatU: 1,
  repeatV: 1,
  offsetU: 0,
  offsetV: 0,
  rotation: 0,
  // Match THREE.Texture defaults (0,0). Center 0.5 shifts repeat/rotation away from
  // UV origin and breaks brush density + material Layer-2 composition.
  centerU: 0,
  centerV: 0,
  flipY: true,
});

function enumOr(value, allowed, fallback) {
  const v = String(value || '').trim();
  return allowed.includes(v) ? v : fallback;
}

function finite(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Normalize asset meta.sampler (persisted on texture registry entries).
 */
export function normalizeTextureSampler(raw = {}, { compressed = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let generateMipmaps = src.generateMipmaps !== false;
  let minFilter = enumOr(src.minFilter, TEXTURE_MIN_FILTERS, DEFAULT_TEXTURE_SAMPLER.minFilter);
  // Compressed textures typically ship with their own mip chain; don't force generateMipmaps.
  if (compressed) {
    generateMipmaps = false;
    if (minFilter === 'linearMipmapLinear' || minFilter === 'linearMipmapNearest'
      || minFilter === 'nearestMipmapLinear' || minFilter === 'nearestMipmapNearest') {
      // keep mip filters — GPU uses embedded mips
    } else if (minFilter === 'linear') {
      minFilter = 'linearMipmapLinear';
    }
  }
  const anisotropy = Math.max(1, Math.min(16, Math.round(finite(src.anisotropy, DEFAULT_TEXTURE_SAMPLER.anisotropy))));
  return {
    wrapS: enumOr(src.wrapS, TEXTURE_WRAP_MODES, DEFAULT_TEXTURE_SAMPLER.wrapS),
    wrapT: enumOr(src.wrapT, TEXTURE_WRAP_MODES, DEFAULT_TEXTURE_SAMPLER.wrapT),
    magFilter: enumOr(src.magFilter, TEXTURE_MAG_FILTERS, DEFAULT_TEXTURE_SAMPLER.magFilter),
    minFilter,
    generateMipmaps,
    anisotropy,
    colorSpace: enumOr(src.colorSpace, TEXTURE_COLOR_SPACES, DEFAULT_TEXTURE_SAMPLER.colorSpace),
  };
}

export function normalizeTextureTransform(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    repeatU: finite(src.repeatU ?? src.repeat?.x, DEFAULT_TEXTURE_TRANSFORM.repeatU),
    repeatV: finite(src.repeatV ?? src.repeat?.y, DEFAULT_TEXTURE_TRANSFORM.repeatV),
    offsetU: finite(src.offsetU ?? src.offset?.x, DEFAULT_TEXTURE_TRANSFORM.offsetU),
    offsetV: finite(src.offsetV ?? src.offset?.y, DEFAULT_TEXTURE_TRANSFORM.offsetV),
    rotation: finite(src.rotation, DEFAULT_TEXTURE_TRANSFORM.rotation),
    centerU: finite(src.centerU ?? src.center?.x, DEFAULT_TEXTURE_TRANSFORM.centerU),
    centerV: finite(src.centerV ?? src.center?.y, DEFAULT_TEXTURE_TRANSFORM.centerV),
    flipY: src.flipY !== false,
  };
}

/** Merge sampler + transform (+ dims) onto texture asset meta without dropping other keys. */
export function mergeTextureMetaPatch(existingMeta, patch) {
  const base = { ...(existingMeta || {}) };
  const next = { ...base, ...(patch || {}) };
  if (patch?.sampler || base.sampler) {
    next.sampler = normalizeTextureSampler({
      ...(base.sampler || {}),
      ...(patch?.sampler || {}),
    }, { compressed: isCompressedTextureMeta(next) });
  }
  if (patch?.transform || base.transform) {
    next.transform = normalizeTextureTransform({
      ...(base.transform || {}),
      ...(patch?.transform || {}),
    });
  }
  return next;
}

export function isCompressedTextureMeta(meta = {}) {
  const fmt = String(meta.format || meta.magic || '').toLowerCase();
  return fmt === 'ktx2' || fmt === 'basis' || fmt.includes('ktx');
}

export function isCompressedTexturePath(path = '') {
  return /\.ktx2($|\?)/i.test(String(path));
}

/**
 * Resolve effective color space for a map role.
 * @param {'color'|'data'|'auto'} role
 */
export function resolveTextureColorSpace(sampler, role = 'auto') {
  const cs = sampler?.colorSpace || 'auto';
  if (cs !== 'auto') return COLOR_TO_THREE[cs] ?? THREE.SRGBColorSpace;
  if (role === 'data' || role === 'normal') return THREE.NoColorSpace;
  return THREE.SRGBColorSpace;
}

/**
 * Apply sampler + transform onto a THREE.Texture (mutates).
 * @param {THREE.Texture} tex
 * @param {{ sampler?: object, transform?: object, role?: string, maxAnisotropy?: number, compressed?: boolean }} opts
 */
export function applyTextureSampling(tex, opts = {}) {
  if (!tex) return tex;
  const compressed = Boolean(opts.compressed) || Boolean(tex.isCompressedTexture);
  const sampler = normalizeTextureSampler(opts.sampler, { compressed });
  const transform = normalizeTextureTransform(opts.transform);

  tex.wrapS = WRAP_TO_THREE[sampler.wrapS] ?? THREE.RepeatWrapping;
  tex.wrapT = WRAP_TO_THREE[sampler.wrapT] ?? THREE.RepeatWrapping;
  tex.magFilter = MAG_TO_THREE[sampler.magFilter] ?? THREE.LinearFilter;
  tex.minFilter = MIN_TO_THREE[sampler.minFilter] ?? THREE.LinearMipmapLinearFilter;

  if (!compressed) {
    tex.generateMipmaps = sampler.generateMipmaps;
    if ('flipY' in tex) tex.flipY = transform.flipY;
  } else {
    // Compressed textures: respect embedded mips; flipY is usually immutable after upload.
    tex.generateMipmaps = false;
  }

  const maxAniso = Math.max(1, Number(opts.maxAnisotropy) || 16);
  tex.anisotropy = Math.min(sampler.anisotropy, maxAniso);

  const role = opts.role || 'auto';
  tex.colorSpace = resolveTextureColorSpace(sampler, role === 'normal' ? 'data' : role);

  // Guard incomplete mocks / CompressedTexture edge cases missing UV matrix helpers.
  if (!tex.repeat || typeof tex.repeat.set !== 'function') {
    tex.repeat = new THREE.Vector2(1, 1);
  }
  if (!tex.offset || typeof tex.offset.set !== 'function') {
    tex.offset = new THREE.Vector2(0, 0);
  }
  if (!tex.center || typeof tex.center.set !== 'function') {
    tex.center = new THREE.Vector2(0, 0);
  }
  tex.repeat.set(transform.repeatU, transform.repeatV);
  tex.offset.set(transform.offsetU, transform.offsetV);
  tex.rotation = (transform.rotation * Math.PI) / 180;
  tex.center.set(transform.centerU, transform.centerV);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Compose material Layer-2 UV onto a texture that already has asset transform.
 * Does not re-apply wrap/filter — only UV matrix fields.
 */
export function composeMaterialUvOnTexture(tex, materialUv = {}) {
  if (!tex) return tex;
  const sx = Number(materialUv.uvScale?.x);
  const sy = Number(materialUv.uvScale?.y);
  const ox = Number(materialUv.uvOffset?.x);
  const oy = Number(materialUv.uvOffset?.y);
  const rot = Number(materialUv.uvRotation);
  const hasScale = Number.isFinite(sx) && Number.isFinite(sy);
  const hasOffset = Number.isFinite(ox) && Number.isFinite(oy);
  const hasRot = Number.isFinite(rot) && rot !== 0;
  if (!hasScale && !hasOffset && !hasRot) return tex;

  // Identity material UV → leave asset transform alone.
  const scaleX = hasScale ? sx : 1;
  const scaleY = hasScale ? sy : 1;
  const offX = hasOffset ? ox : 0;
  const offY = hasOffset ? oy : 0;
  if (scaleX === 1 && scaleY === 1 && offX === 0 && offY === 0 && !hasRot) return tex;

  tex.repeat.x *= scaleX || 1;
  tex.repeat.y *= scaleY || 1;
  tex.offset.x += offX || 0;
  tex.offset.y += offY || 0;
  if (hasRot) {
    tex.rotation += (rot * Math.PI) / 180;
  }
  tex.needsUpdate = true;
  return tex;
}

/** Rough GPU memory estimate (bytes). Clearly an estimate — not a GPU query. */
export function estimateTextureGpuBytes({
  width = 0,
  height = 0,
  generateMipmaps = true,
  compressed = false,
  bytes = 0,
} = {}) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  if (compressed && bytes > 0) {
    // Compressed GPU footprint ≈ file payload (+ small mip overhead already in file).
    return Math.round(bytes * 1.05);
  }
  if (!(w > 0 && h > 0)) return null;
  // RGBA8 assumption for uncompressed GPU upload.
  let total = w * h * 4;
  if (generateMipmaps) total = Math.round(total * (4 / 3));
  return total;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function describeSampler(sampler) {
  const s = normalizeTextureSampler(sampler);
  return {
    wrap: `${s.wrapS} / ${s.wrapT}`,
    filter: `${s.magFilter} / ${s.minFilter}`,
    mipmaps: s.generateMipmaps ? 'generated' : 'off / embedded',
    anisotropy: String(s.anisotropy),
    colorSpace: s.colorSpace,
  };
}

export function threeWrapToId(value) {
  return THREE_TO_WRAP[value] || 'repeat';
}

/** Cache key fragment so differently sampled assets do not share GPU instances incorrectly. */
export function textureSamplerCacheKey(meta = {}) {
  const s = normalizeTextureSampler(meta.sampler, { compressed: isCompressedTextureMeta(meta) });
  const t = normalizeTextureTransform(meta.transform);
  return [
    s.wrapS, s.wrapT, s.magFilter, s.minFilter,
    s.generateMipmaps ? 1 : 0, s.anisotropy, s.colorSpace,
    t.repeatU, t.repeatV, t.offsetU, t.offsetV, t.rotation, t.centerU, t.centerV, t.flipY ? 1 : 0,
  ].join('|');
}

/**
 * Validate sampler for UI warnings.
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function validateTextureSampler(sampler, { compressed = false } = {}) {
  const s = normalizeTextureSampler(sampler, { compressed });
  const warnings = [];
  if (compressed && s.generateMipmaps) {
    warnings.push('Compressed textures cannot generate mipmaps in the browser; embedded mips are used.');
  }
  if (!s.generateMipmaps && /Mipmap/i.test(s.minFilter) && !compressed) {
    warnings.push('Mipmap minFilter with generateMipmaps off may sample incorrectly.');
  }
  if (s.anisotropy > 1 && s.magFilter === 'nearest' && s.minFilter === 'nearest') {
    warnings.push('Anisotropy has little effect with nearest-only filtering.');
  }
  return { ok: warnings.length === 0, warnings, sampler: s };
}
